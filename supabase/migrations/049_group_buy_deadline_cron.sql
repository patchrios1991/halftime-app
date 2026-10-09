-- 049_group_buy_deadline_cron.sql
-- Schedules the Group Buy purchase-deadline sweep every 15 minutes.
-- Requires: pg_cron and pg_net extensions (both enabled by default on Supabase).
--
-- BEFORE RUNNING: replace <YOUR_SERVICE_ROLE_KEY> below with your actual
-- service role key from Supabase Dashboard → Settings → API.
-- Then deploy the edge function:
--   npx supabase functions deploy sweep-group-buy-deadlines --project-ref ewcipqfcqyoqtpqzoazx

select cron.schedule(
  'group-buy-deadline-sweep',
  '*/15 * * * *',
  $$
  select
    net.http_post(
      url     := 'https://ewcipqfcqyoqtpqzoazx.supabase.co/functions/v1/sweep-group-buy-deadlines',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer <YOUR_SERVICE_ROLE_KEY>'
      ),
      body    := '{}'::jsonb
    ) as request_id;
  $$
);
