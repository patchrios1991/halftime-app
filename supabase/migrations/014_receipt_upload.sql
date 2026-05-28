-- ─────────────────────────────────────────────────────────────────────────────
-- 014_receipt_upload.sql
-- Adds receipt upload + admin review fields to pods.
-- Also drops the Ticketmaster columns from 013 (if they were run).
-- Also adds an admin update policy so BetaDashboard can verify/reject receipts.
--
-- Run in Supabase SQL Editor → New query → Run
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop TM columns if they exist (from 013 which we're reverting)
alter table public.pods
  drop column if exists seat_count,
  drop column if exists tm_market_estimate,
  drop column if exists tm_price_flagged;

-- Add receipt columns
alter table public.pods
  add column if not exists receipt_url      text,
  add column if not exists receipt_verified boolean not null default false,
  add column if not exists receipt_rejected boolean not null default false,
  add column if not exists receipt_note     text;   -- admin rejection reason

-- Allow admins to update pods (needed for verify/reject actions)
create policy "Admins can update pods"
  on public.pods for update
  using (public.is_admin())
  with check (public.is_admin());

-- ─── Storage bucket ───────────────────────────────────────────────────────────
-- You must also create the bucket manually in Supabase:
--   Storage → New bucket → Name: "receipts" → Public: ON → Save
--
-- Then add these storage policies (run as separate statements):

-- Anyone authenticated can upload to their own pod's receipt folder
create policy "Captains can upload receipts"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'receipts');

-- Authenticated users can view receipts (members + admins)
create policy "Authenticated users can view receipts"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'receipts');

-- Admins can delete/replace receipts
create policy "Admins can delete receipts"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'receipts');
