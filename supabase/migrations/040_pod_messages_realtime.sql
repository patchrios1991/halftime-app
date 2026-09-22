-- 040_pod_messages_realtime.sql
-- usePodChat.js subscribes to postgres_changes INSERT events on pod_messages
-- for live delivery, but the table was never added to the supabase_realtime
-- publication, so Postgres never notified the Realtime service of new rows —
-- messages only ever showed up after a full page reload. Pre-existing gap,
-- caught while testing pod chat live for the first time (same root cause
-- class as 039 — never exercised against the real database before).

alter publication supabase_realtime add table public.pod_messages;
