-- 048_member_funding_deadline_and_waitlist.sql
-- 1.0.7 item 4, part 1: a 24-hour member funding deadline + a real,
-- authenticated waitlist.
--
-- Before this migration, joinPod() enforced the member cap purely on
-- headcount with no regard for funding status, and there was no
-- timeout/expiration on an unfunded member at all — if the first N people
-- who joined never funded, their spots stayed locked forever and nobody
-- else could ever join, with no automatic recovery. Separately, the only
-- "waitlist" in the app (pod_waitlist / joinWaitlist()) was anonymous
-- email-capture with no account linkage and no promotion logic — just
-- "captain gets notified, reach out manually."
--
-- This migration adds:
--   - pod_members.is_waitlisted: a real, authenticated waitlist row —
--     counts toward nothing (not the member cap, not "everyone funded")
--     until promoted. share_pct/cost are 0 while waitlisted (computed for
--     real only at promotion time, since they depend on remainingSpots at
--     THAT moment, not at join time) — the share_pct check constraint is
--     relaxed from "> 0" to ">= 0" to allow that placeholder.
--   - enforce_pod_member_cap() (044, extended by 046) now skips the cap
--     and receipt-verification checks entirely for a waitlist insert, and
--     only counts non-waitlisted rows toward the cap for a real join.
--   - promote_next_waitlisted(pod_id): promotes the longest-waiting
--     waitlisted member into the freed spot, computing their real
--     share_pct/cost from the pod's current state and resetting their
--     joined_at so they get their own fresh 24-hour funding deadline.
--     Called when a spot frees up — both from the deadline sweep below
--     and from leave-pod (a member leaving voluntarily also frees a spot).
--   - sweep_pod_member_deadlines(): removes a non-captain member who
--     hasn't funded within 24 hours of joining a still-recruiting pod,
--     notifies them and the captain, then promotes the next waitlisted
--     member. Pure SQL — no Stripe/external call needed here (the member
--     never paid), so this runs directly via pg_cron with no edge
--     function or service-role key involved.

alter table public.pod_members
  add column if not exists is_waitlisted boolean not null default false;

create index if not exists idx_pod_members_deadline_sweep
  on public.pod_members (pod_id, is_waitlisted, escrow_funded, tier, joined_at);

-- Drop whichever check constraint enforces share_pct > 0 (found by
-- inspecting pg_constraint rather than assuming Postgres's default
-- auto-generated name, in case it was created or renamed differently)
-- and replace it with one that allows the 0 placeholder above.
do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.pod_members'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%share_pct%'
  loop
    execute format('alter table public.pod_members drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.pod_members
  add constraint pod_members_share_pct_check check (share_pct >= 0 and share_pct <= 100);

-- ── Cap + receipt-verification trigger (044, extended by 046) ────────────────
-- Waitlist inserts skip both checks entirely — they don't consume a real
-- seat, and item 1's gating already kept an unverified Standard pod from
-- ever reaching this insert in the first place.
create or replace function enforce_pod_member_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cap           int;
  current_count int;
  captain       uuid;
  ptype         text;
  verified      boolean;
begin
  if new.is_waitlisted then
    return new;
  end if;

  select max_members, captain_id, pod_type, receipt_verified
  into cap, captain, ptype, verified
  from public.pods
  where id = new.pod_id
  for update;

  select count(*) into current_count
  from public.pod_members
  where pod_id = new.pod_id
    and is_waitlisted = false;

  if current_count >= cap then
    raise exception 'This pod is full';
  end if;

  if new.user_id <> captain and ptype <> 'group_buy' and verified is not true then
    raise exception 'This pod''s ticket receipt hasn''t been verified yet — check back once the captain''s proof of purchase is approved.';
  end if;

  return new;
end;
$$;

-- ── Promote the next waitlisted member into a freed spot ─────────────────────
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
    return null; -- no spot actually free
  end if;

  select id, user_id into v_candidate
  from public.pod_members
  where pod_id = p_pod_id and is_waitlisted = true
  order by joined_at asc
  limit 1;

  if not found then
    return null; -- nobody waiting
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

-- ── 24-hour unfunded-member sweep ─────────────────────────────────────────────
create or replace function sweep_pod_member_deadlines()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select pm.id, pm.pod_id, pm.user_id, p.name as pod_name, p.captain_id
    from public.pod_members pm
    join public.pods p on p.id = pm.pod_id
    where pm.is_waitlisted = false
      and pm.tier <> 'captain'
      and pm.escrow_funded = false
      and pm.joined_at < now() - interval '24 hours'
      and p.status = 'recruiting'
  loop
    delete from public.pod_members where id = r.id;

    insert into public.notifications (user_id, type, title, body, pod_id)
    values (
      r.user_id,
      'escrow_failed',
      '⏰ Spot released',
      format('You didn''t fund your share of %s within 24 hours, so your spot was given to the next person on the waitlist.', r.pod_name),
      r.pod_id
    );

    if r.captain_id is not null then
      insert into public.notifications (user_id, type, title, body, pod_id)
      values (
        r.captain_id,
        'member_joined',
        '⏰ Member removed — unfunded',
        format('A member of %s did not fund within 24 hours and was automatically removed.', r.pod_name),
        r.pod_id
      );
    end if;

    perform promote_next_waitlisted(r.pod_id);
  end loop;
end;
$$;

-- Runs directly in Postgres every 15 minutes — pure SQL, no edge function
-- or service-role key needed (unlike weekly-digest/the group-buy-deadline
-- sweep, which call out to Stripe/send email and do need an HTTP hop).
select cron.schedule(
  'pod-member-deadline-sweep',
  '*/15 * * * *',
  $$ select sweep_pod_member_deadlines(); $$
);
