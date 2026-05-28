-- ─────────────────────────────────────────────────────────────────────────────
-- 009_invite_codes.sql
-- Invite-only signup system.
-- Run in Supabase SQL Editor → New query → Run
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.invite_codes (
  id         uuid primary key default uuid_generate_v4(),
  code       text not null unique,
  label      text,                          -- e.g. "For Jordan K."
  max_uses   int  not null default 1,       -- 0 = unlimited
  use_count  int  not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz                    -- null = never expires
);

-- RLS
alter table public.invite_codes enable row level security;

-- Service role has full access
create policy "service_manages_codes"
  on public.invite_codes
  for all
  using (auth.role() = 'service_role');

-- Authenticated users (operators / dashboard) can read and create codes
create policy "authenticated_reads_codes"
  on public.invite_codes
  for select
  to authenticated
  using (true);

create policy "authenticated_inserts_codes"
  on public.invite_codes
  for insert
  to authenticated
  with check (true);

create policy "authenticated_deletes_codes"
  on public.invite_codes
  for delete
  to authenticated
  using (true);

-- ── Check if a code is valid (does NOT consume it) ───────────────────────────
create or replace function public.check_invite_code(p_code text)
returns boolean language sql security definer as $$
  select exists (
    select 1 from public.invite_codes
    where upper(code) = upper(p_code)
      and (max_uses = 0 or use_count < max_uses)
      and (expires_at is null or expires_at > now())
  );
$$;

-- ── Redeem a code (atomically increments use_count) ──────────────────────────
create or replace function public.redeem_invite_code(p_code text)
returns boolean language plpgsql security definer as $$
declare
  v_id uuid;
begin
  update public.invite_codes
  set use_count = use_count + 1
  where upper(code) = upper(p_code)
    and (max_uses = 0 or use_count < max_uses)
    and (expires_at is null or expires_at > now())
  returning id into v_id;
  return v_id is not null;
end;
$$;

-- Grant execute to anon and authenticated roles
grant execute on function public.check_invite_code(text)  to anon, authenticated;
grant execute on function public.redeem_invite_code(text) to anon, authenticated;

-- ── Seed a few starter codes ─────────────────────────────────────────────────
-- You can add more anytime in the Supabase Table Editor
insert into public.invite_codes (code, label, max_uses) values
  ('HALFTIME1',  'Starter code 1', 1),
  ('HALFTIME2',  'Starter code 2', 1),
  ('HALFTIME3',  'Starter code 3', 1),
  ('HALFTIME4',  'Starter code 4', 1),
  ('HALFTIME5',  'Starter code 5', 1),
  ('FOUNDING10', 'Founding member — 10 uses', 10);
