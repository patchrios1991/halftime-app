-- ─────────────────────────────────────────────────────────────────────────────
-- 011_pod_waitlist.sql
-- Stores email waitlist entries for full pods.
-- When a pod is full on the JoinPodScreen, prospective members leave their
-- email so they're notified if a spot opens up.
-- Run in Supabase SQL Editor → New query → Run
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.pod_waitlist (
  id         uuid primary key default uuid_generate_v4(),
  pod_id     uuid not null references public.pods(id) on delete cascade,
  email      text not null,
  created_at timestamptz not null default now(),
  unique (pod_id, email)
);

alter table public.pod_waitlist enable row level security;

-- Anyone (including anon) can add themselves to a pod waitlist
create policy "anyone_can_join_pod_waitlist"
  on public.pod_waitlist
  for insert
  with check (true);

-- Captain can read their own pod's waitlist
create policy "captain_reads_pod_waitlist"
  on public.pod_waitlist
  for select
  using (
    pod_id in (
      select id from public.pods where captain_id = auth.uid()
    )
  );
