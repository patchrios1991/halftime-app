-- 044_pod_member_cap_trigger.sql
-- Bug report: a pod capped at max_members = 2 let in a 3rd member.
--
-- Root cause: joinPod() (src/api/pods.js) enforces the cap entirely
-- client-side — it SELECTs the current member count, computes
-- remainingSpots, then INSERTs as a separate round-trip. There's no
-- atomicity between the two steps, and the "Members can join recruiting
-- pods" RLS policy (016_member_self_join.sql) only checks that the row's
-- user_id matches the caller and the pod is still 'recruiting' — nothing
-- about capacity. Two people joining the same pod within a few hundred
-- milliseconds of each other can both read the same (stale) member count,
-- both pass the client-side check, and both INSERT successfully.
--
-- Fix: enforce the cap atomically in the database. A BEFORE INSERT trigger
-- locks the pod row (SELECT ... FOR UPDATE) before counting, which
-- serializes concurrent joins to the same pod instead of letting them race
-- on a stale count — the second insert in any such pair now sees the
-- first one's row and is correctly rejected.
--
-- The client-side check in joinPod() is left in place as a fast-fail for
-- the common (non-racing) case; this trigger is the actual guarantee.
--
-- security definer: a user joining a pod for the first time isn't yet
-- covered by the "Members can read pod_members in their pods" RLS policy
-- (002_rls.sql), which only allows reading rows for pods you already
-- belong to. Without bypassing RLS here, the trigger's own count query
-- would see 0 existing members for any pod the inserting user hasn't
-- joined yet and never actually block anything — the one case this fix
-- exists for.

create or replace function enforce_pod_member_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cap           int;
  current_count int;
begin
  select max_members into cap
  from public.pods
  where id = new.pod_id
  for update;

  select count(*) into current_count
  from public.pod_members
  where pod_id = new.pod_id;

  if current_count >= cap then
    raise exception 'This pod is full';
  end if;

  return new;
end;
$$;

drop trigger if exists pod_member_cap_check on public.pod_members;

create trigger pod_member_cap_check
  before insert on public.pod_members
  for each row
  execute function enforce_pod_member_cap();
