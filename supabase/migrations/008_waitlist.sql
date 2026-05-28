-- ─────────────────────────────────────────────────────────────────────────────
-- 008_waitlist.sql
-- Stores waitlist emails from the landing page.
-- Run in Supabase SQL Editor → New query → Run
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.waitlist (
  id         uuid primary key default uuid_generate_v4(),
  email      text not null unique,
  created_at timestamptz not null default now()
);

-- Allow anonymous inserts (public landing page)
alter table public.waitlist enable row level security;

create policy "anyone_can_join_waitlist"
  on public.waitlist
  for insert
  with check (true);

-- Only service role can read
create policy "service_reads_waitlist"
  on public.waitlist
  for select
  using (auth.role() = 'service_role');
