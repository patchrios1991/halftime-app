-- ─────────────────────────────────────────────────────────────────────────────
-- Allow members to join recruiting pods themselves  ·  016_member_self_join.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- The original "Captains can insert pod members" policy only let the captain
-- add rows to pod_members.  This blocked the self-serve join flow where a new
-- member inserts their own row via the invite link.
--
-- New policy: a signed-in user may insert a pod_members row only when:
--   1. The user_id on the row matches their own auth.uid() (can't add others)
--   2. The target pod is currently in 'recruiting' status
-- ─────────────────────────────────────────────────────────────────────────────

create policy "Members can join recruiting pods"
  on public.pod_members for insert with check (
    auth.uid() = user_id
    and pod_id in (
      select id from public.pods where status = 'recruiting'
    )
  );
