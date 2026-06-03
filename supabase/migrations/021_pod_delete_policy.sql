-- ─────────────────────────────────────────────────────────────────────────────
-- Allow captains to delete their pods  ·  021_pod_delete_policy.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- RLS was enabled on pods but no DELETE policy existed, so delete calls
-- silently returned 0 rows affected without an error. Captains could not
-- actually delete their pods.
-- ─────────────────────────────────────────────────────────────────────────────

create policy "Captains can delete their pods"
  on public.pods for delete using (captain_id = auth.uid());
