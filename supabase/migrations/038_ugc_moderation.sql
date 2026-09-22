-- 038_ugc_moderation.sql
-- Report content + Block user for pod chat (Apple Guideline 1.2 — apps with
-- user-generated content need a mechanism to report objectionable content
-- and block abusive users).

create table if not exists public.message_reports (
  id          uuid        primary key default gen_random_uuid(),
  message_id  uuid        not null references public.pod_messages(id) on delete cascade,
  reporter_id uuid        not null references public.profiles(id) on delete cascade,
  reason      text,
  created_at  timestamptz not null default now()
);

alter table public.message_reports enable row level security;

create policy "Reporter can insert own reports"
  on public.message_reports for insert
  with check (reporter_id = auth.uid());

create policy "Admins can read reports"
  on public.message_reports for select
  using (public.is_admin());

-- Required per supabase/migrations/README.md — new tables need an explicit
-- GRANT, RLS alone is not enough for the Data API to reach the table.
grant select, insert on public.message_reports to authenticated;

create table if not exists public.blocked_users (
  id         uuid        primary key default gen_random_uuid(),
  blocker_id uuid        not null references public.profiles(id) on delete cascade,
  blocked_id uuid        not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id)
);

alter table public.blocked_users enable row level security;

create policy "Users manage their own blocks"
  on public.blocked_users for all
  using (blocker_id = auth.uid())
  with check (blocker_id = auth.uid());

grant select, insert, delete on public.blocked_users to authenticated;

-- Both are new tables — fold into the same approval gate migration 036 put
-- on every other user-action table.
create policy approved_users_only on public.message_reports
  as restrictive for all to authenticated
  using (public.is_approved())
  with check (public.is_approved());

create policy approved_users_only on public.blocked_users
  as restrictive for all to authenticated
  using (public.is_approved())
  with check (public.is_approved());
