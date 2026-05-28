-- ─────────────────────────────────────────────────────────────────────────────
-- 012_admin_access.sql
-- Adds is_admin flag to profiles and creates admin-bypass RLS policies
-- so BetaDashboard (/admin) can read all platform data.
--
-- Step 1: Run this file in Supabase SQL Editor.
-- Step 2: Grant yourself admin access by running:
--   UPDATE public.profiles SET is_admin = true WHERE id = auth.uid();
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- ─── Helper ───────────────────────────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  )
$$;

-- ─── Admin bypass policies ────────────────────────────────────────────────────
-- These sit alongside (not replace) the existing member policies.

create policy "Admins can read all pods"
  on public.pods for select
  using (public.is_admin());

create policy "Admins can read all pod_members"
  on public.pod_members for select
  using (public.is_admin());

create policy "Admins can read all games"
  on public.games for select
  using (public.is_admin());

create policy "Admins can read all assignments"
  on public.assignments for select
  using (public.is_admin());

create policy "Admins can read all resale_listings"
  on public.resale_listings for select
  using (public.is_admin());

create policy "Admins can read all resale_payouts"
  on public.resale_payouts for select
  using (public.is_admin());
