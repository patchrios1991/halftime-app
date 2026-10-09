-- 050_referral_system.sql
-- 1.0.7 item 5: build out the referral system. pod_members.referral_count
-- (001_schema.sql) already existed and was tracked/displayed in
-- BetaDashboard, but nothing in the app ever generated a referral link,
-- attributed a signup to one, or rewarded anyone — confirmed dormant.
-- That column was pod-membership-scoped anyway, which doesn't fit a
-- person-level referral (one user can be in several pods) — this adds
-- the real thing at the profile level instead and leaves referral_count
-- alone (still just an unused legacy column, harmless).
--
-- Shape:
--   - profiles.referral_code: short per-user code, generated at signup.
--     Shareable link is https://app.halftime-app.com/r/<code> (client route).
--   - profiles.referred_by: set once, the first time the referred person's
--     client claims a pending code (claim_referral()) — never overwritten.
--   - profiles.referral_rewarded: set once the referrer has been paid out,
--     so joining a second/third pod never double-rewards them.
--   - Reward currency is bid_credits — already in app, just unused at the
--     profiles level (pod_members.bid_credits is the per-pod balance
--     PlayoffBidScreen actually spends from). profiles.bid_credits is used
--     here as a holding pool: a referrer's reward lands there, then folds
--     into pod_members.bid_credits automatically the next time THEY join
--     or create any pod (apply_referral_bonus_pool trigger below) — so it
--     reaches real spendable currency without touching bidding logic.
--   - Reward fires when the referred person completes their first real
--     (non-waitlisted) pod join, from either a direct join/create or a
--     waitlist promotion.

create or replace function generate_referral_code()
returns text
language plpgsql
as $$
declare
  chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code  text;
  tries int := 0;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(chars, (floor(random() * length(chars)) + 1)::int, 1);
    end loop;
    tries := tries + 1;
    exit when not exists (select 1 from public.profiles where referral_code = code) or tries > 20;
  end loop;
  return code;
end;
$$;

alter table public.profiles
  add column if not exists referral_code     text unique,
  add column if not exists referred_by       uuid references public.profiles(id),
  add column if not exists referral_rewarded boolean not null default false;

-- Backfill codes for every account that signed up before this migration.
do $$
declare
  r record;
begin
  for r in select id from public.profiles where referral_code is null loop
    update public.profiles set referral_code = generate_referral_code() where id = r.id;
  end loop;
end $$;

-- Extend the existing signup trigger (001_schema.sql) to assign a code too.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  _name text;
begin
  _name := coalesce(
    new.raw_user_meta_data->>'display_name',
    split_part(new.email, '@', 1)
  );
  insert into public.profiles (id, display_name, avatar_initials, referral_code)
  values (new.id, _name, upper(left(_name, 2)), generate_referral_code());
  return new;
end;
$$;

-- ── Claim a pending referral code ─────────────────────────────────────────────
-- Called once by the client (useAuth's loadProfile) after signup/signin when
-- a /r/:code visit left a code waiting in localStorage. Security definer
-- since it needs to resolve another user's code to their id.
create or replace function claim_referral(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referrer uuid;
begin
  if p_code is null or length(trim(p_code)) = 0 then
    return null;
  end if;

  select id into v_referrer
  from public.profiles
  where referral_code = upper(trim(p_code));

  if v_referrer is null or v_referrer = auth.uid() then
    return null;
  end if;

  update public.profiles
  set referred_by = v_referrer
  where id = auth.uid()
    and referred_by is null;

  return v_referrer;
end;
$$;

-- ── Award the referrer once their referral's first real pod join lands ───────
create or replace function award_referral_if_eligible(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referred_by uuid;
  v_rewarded    boolean;
  v_first_join  int;
  v_name        text;
begin
  select referred_by, referral_rewarded, display_name
  into v_referred_by, v_rewarded, v_name
  from public.profiles
  where id = p_user_id
  for update;

  if v_referred_by is null or v_rewarded then
    return;
  end if;

  select count(*) into v_first_join
  from public.pod_members
  where user_id = p_user_id and is_waitlisted = false;

  if v_first_join <> 1 then
    return; -- not their first real (non-waitlisted) pod join
  end if;

  update public.profiles
  set bid_credits = bid_credits + 50
  where id = v_referred_by;

  update public.profiles
  set referral_rewarded = true
  where id = p_user_id;

  insert into public.notifications (user_id, type, title, body)
  values (
    v_referred_by,
    'bid_credits_awarded',
    '🎉 Referral reward!',
    format('%s just joined their first pod — you earned 50 bonus bid credits.', coalesce(v_name, 'Someone you referred'))
  );
end;
$$;

create or replace function trigger_award_referral()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not new.is_waitlisted then
    perform award_referral_if_eligible(new.user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists pod_member_referral_award on public.pod_members;
create trigger pod_member_referral_award
  after insert on public.pod_members
  for each row
  execute function trigger_award_referral();

-- Also check on a waitlist promotion (048) — the promoted user's FIRST
-- real pod row may be this UPDATE, not an INSERT.
create or replace function promote_next_waitlisted(p_pod_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pod          record;
  v_candidate    record;
  v_active_count int;
  v_used_pct     numeric;
  v_remaining    int;
  v_share_pct    numeric;
  v_base_cost    numeric;
  v_cost         numeric;
begin
  select max_members, season_cost, perks_included, name, captain_id
  into v_pod
  from public.pods
  where id = p_pod_id
  for update;

  if not found then
    return null;
  end if;

  select count(*), coalesce(sum(share_pct), 0)
  into v_active_count, v_used_pct
  from public.pod_members
  where pod_id = p_pod_id and is_waitlisted = false;

  v_remaining := v_pod.max_members - v_active_count;
  if v_remaining <= 0 then
    return null;
  end if;

  select id, user_id into v_candidate
  from public.pod_members
  where pod_id = p_pod_id and is_waitlisted = true
  order by joined_at asc
  limit 1;

  if not found then
    return null;
  end if;

  v_share_pct := round((100 - v_used_pct) / v_remaining);
  v_base_cost := (v_pod.season_cost * v_share_pct) / 100;
  v_cost      := case when v_pod.perks_included is false then v_base_cost * 0.95 else v_base_cost end;

  update public.pod_members
  set is_waitlisted = false,
      share_pct     = v_share_pct,
      cost          = v_cost,
      joined_at     = now()
  where id = v_candidate.id;

  perform award_referral_if_eligible(v_candidate.user_id);

  insert into public.notifications (user_id, type, title, body, pod_id)
  values (
    v_candidate.user_id,
    'member_joined',
    '🎉 You''re off the waitlist!',
    format('A spot opened up in %s — you''re now a member. Fund your $%s share within 24 hours to keep your spot.',
      v_pod.name, to_char(v_cost, 'FM999,999,990.00')),
    p_pod_id
  );

  if v_pod.captain_id is not null then
    insert into public.notifications (user_id, type, title, body, pod_id)
    values (
      v_pod.captain_id,
      'member_joined',
      '👥 Waitlist spot filled',
      format('A spot in %s opened up and was automatically filled from the waitlist.', v_pod.name),
      p_pod_id
    );
  end if;

  return v_candidate.user_id;
end;
$$;

-- ── Fold a referrer's held bonus pool into real, spendable pod currency ──────
-- Fires on every real (non-waitlisted) pod_members insert, for ANY user —
-- not just referred ones, since anyone can refer others. Waitlist inserts
-- are skipped since their bid_credits is a placeholder until promotion,
-- at which point this already-applied amount simply carries over with
-- the rest of that row (promotion is an UPDATE, not a new INSERT).
create or replace function apply_referral_bonus_pool()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pool int;
begin
  if new.is_waitlisted then
    return new;
  end if;

  select bid_credits into pool from public.profiles where id = new.user_id for update;

  if pool > 0 then
    new.bid_credits := new.bid_credits + pool;
    update public.profiles set bid_credits = 0 where id = new.user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists pod_member_referral_bonus_pool on public.pod_members;
create trigger pod_member_referral_bonus_pool
  before insert on public.pod_members
  for each row
  execute function apply_referral_bonus_pool();
