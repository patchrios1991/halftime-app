-- 046_gate_standard_pod_recruiting.sql
-- 1.0.7 item 1: Standard pods (captain already owns the tickets) shouldn't
-- be joinable until HalfTime has verified the captain's purchase receipt.
-- Today a captain can create a Standard pod and have it immediately
-- joinable in Browse Pods with zero proof they actually own the tickets —
-- receipt_verified only ever affected the captain's own funding exemption
-- (migration 045), never whether the pod could recruit members at all.
--
-- Client-side gates already added in src/api/pods.js:
--   - getRecruitingPods() excludes unverified Standard pods from the browse list
--   - joinPod() rejects joining an unverified Standard pod with a clear error
-- This migration adds the same gate at the database level, inside the
-- existing pod_member_cap_check trigger (044), so it's enforced no matter
-- which path an insert comes through (direct invite link, future API
-- surfaces, etc.) — not just the browse-and-join UI flow.
--
-- The captain's own first-member insert (at pod creation, before any
-- receipt review has happened) must stay exempt — compare the inserting
-- user to pods.captain_id rather than gating on tier, since tier is
-- caller-supplied. Group Buy pods are untouched — they use a separate
-- AI screenshot / ticket-URL verification flow, not receipt_verified.

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
  select max_members, captain_id, pod_type, receipt_verified
  into cap, captain, ptype, verified
  from public.pods
  where id = new.pod_id
  for update;

  select count(*) into current_count
  from public.pod_members
  where pod_id = new.pod_id;

  if current_count >= cap then
    raise exception 'This pod is full';
  end if;

  if new.user_id <> captain and ptype <> 'group_buy' and verified is not true then
    raise exception 'This pod''s ticket receipt hasn''t been verified yet — check back once the captain''s proof of purchase is approved.';
  end if;

  return new;
end;
$$;
