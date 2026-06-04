-- ─────────────────────────────────────────────────────────────────────────────
-- Allow members to leave recruiting pods  ·  023_leave_pod.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Members can delete their own pod_members row as long as the pod is
-- still in 'recruiting' status (not yet fully funded / active).
-- Captains cannot leave — they must delete the pod instead.
-- ─────────────────────────────────────────────────────────────────────────────

create policy "Members can leave recruiting pods"
  on public.pod_members for delete using (
    user_id = auth.uid()
    and pod_id in (
      select id from public.pods
      where status = 'recruiting'
        and captain_id != auth.uid()   -- captains must delete the pod instead
    )
  );
