-- 024_ticket_verification.sql
-- Ticket availability verification columns for group-buy pods

alter table public.pods
  add column if not exists ticket_url             text,
  add column if not exists ticket_url_live        boolean,
  add column if not exists ticket_url_checked_at  timestamptz,
  add column if not exists screenshot_ai_status   text default 'unchecked',
  add column if not exists screenshot_ai_note     text;

alter table public.pods
  drop constraint if exists pods_screenshot_ai_status_check;

alter table public.pods
  add constraint pods_screenshot_ai_status_check
  check (screenshot_ai_status in ('unchecked', 'valid', 'invalid'));
