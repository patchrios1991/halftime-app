-- ─────────────────────────────────────────────────────────────────────────────
-- Fix infinite recursion in pod_members RLS policies  ·  017_fix_rls_recursion.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- The "Members can read pod_members in their pods" SELECT policy referenced
-- pod_members inside its own subquery, causing PostgreSQL to error with
-- "infinite recursion detected in policy for relation pod_members".
--
-- Any other policy that does:
--   pod_id in (select pod_id from public.pod_members where user_id = auth.uid())
-- also triggers the same recursion indirectly.
--
-- Fix: replace all those subqueries with a SECURITY DEFINER function.
-- That function runs as the owner (bypassing RLS), so it never re-enters
-- the policy evaluation loop.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Security-definer helper ────────────────────────────────────────────────
-- Returns the pod_ids the current user belongs to WITHOUT triggering RLS.
create or replace function public.get_my_pod_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select pod_id from public.pod_members where user_id = auth.uid();
$$;

-- ── 2. pod_members SELECT — was directly recursive ───────────────────────────
drop policy if exists "Members can read pod_members in their pods" on public.pod_members;
create policy "Members can read pod_members in their pods"
  on public.pod_members for select using (
    pod_id in (select public.get_my_pod_ids())
  );

-- ── 3. pods SELECT — subquery on pod_members (indirect recursion) ─────────────
drop policy if exists "Members can read their pods" on public.pods;
create policy "Members can read their pods"
  on public.pods for select using (
    status = 'recruiting'
    or id in (select public.get_my_pod_ids())
  );

-- ── 4. games SELECT ───────────────────────────────────────────────────────────
drop policy if exists "Members can read games in their pods" on public.games;
create policy "Members can read games in their pods"
  on public.games for select using (
    pod_id in (select public.get_my_pod_ids())
  );

-- ── 5. assignments SELECT ─────────────────────────────────────────────────────
drop policy if exists "Members can read assignments in their pods" on public.assignments;
create policy "Members can read assignments in their pods"
  on public.assignments for select using (
    pod_id in (select public.get_my_pod_ids())
  );

-- ── 6. bids SELECT + INSERT ───────────────────────────────────────────────────
drop policy if exists "Members can read bids in their pods" on public.bids;
create policy "Members can read bids in their pods"
  on public.bids for select using (
    pod_id in (select public.get_my_pod_ids())
  );

drop policy if exists "Members can place bids" on public.bids;
create policy "Members can place bids"
  on public.bids for insert with check (
    auth.uid() = user_id
    and pod_id in (select public.get_my_pod_ids())
  );

-- ── 7. resale_listings SELECT ─────────────────────────────────────────────────
drop policy if exists "Members can read resale listings in their pods" on public.resale_listings;
create policy "Members can read resale listings in their pods"
  on public.resale_listings for select using (
    pod_id in (select public.get_my_pod_ids())
  );
