-- 029_weekly_digest_cron.sql
-- Schedules a weekly email digest every Monday at 9 AM UTC.
-- Requires: pg_cron and pg_net extensions (both enabled by default on Supabase).
--
-- BEFORE RUNNING: replace <YOUR_SERVICE_ROLE_KEY> below with your actual
-- service role key from Supabase Dashboard → Settings → API.
-- Then deploy the edge function:
--   npx supabase functions deploy weekly-digest --project-ref ewcipqfcqyoqtpqzoazx

select cron.schedule(
  'weekly-pod-digest',
  '0 9 * * 1',   -- every Monday at 9:00 AM UTC
  $$
  select
    net.http_post(
      url     := 'https://ewcipqfcqyoqtpqzoazx.supabase.co/functions/v1/weekly-digest',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer <YOUR_SERVICE_ROLE_KEY>'
      ),
      body    := '{}'::jsonb
    ) as request_id;
  $$
);
