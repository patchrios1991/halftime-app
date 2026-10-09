-- 047_receipt_ai_verification.sql
-- 1.0.7 item 3: automate Standard-pod receipt verification instead of 100%
-- manual admin review, extending the existing AI-screenshot pattern from
-- supabase/functions/verify-tickets/index.ts (used today for Group Buy
-- ticket-availability screenshots via screenshot_ai_status/screenshot_ai_note).
--
-- receipt_ai_status: 'unchecked' | 'auto_approved' | 'needs_review' | 'flagged'
--   - 'auto_approved': Claude Vision clearly confirmed the receipt (high
--      confidence) — the edge function also sets receipt_verified = true
--      in the same pass, same effect as an admin manually verifying.
--   - 'needs_review':  AI thinks it's plausible but isn't confident —
--      left pending for a human (receipt_verified stays false).
--   - 'flagged':       AI thinks something looks off — still left pending,
--      but surfaced to the admin as a priority to look at (likely reject).
--   - 'unchecked':      no AI key configured, a PDF (Vision can't read it),
--      or the AI call failed — falls back to today's fully-manual review.
-- Manual admin verify/reject/reset (BetaDashboard) is untouched and always
-- wins — this is advisory/automation on top of it, not a replacement for
-- the ability to override.

alter table public.pods
  add column if not exists receipt_ai_status text not null default 'unchecked',
  add column if not exists receipt_ai_note   text;
