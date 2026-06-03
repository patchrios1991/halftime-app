-- ─────────────────────────────────────────────────────────────────────────────
-- Add ticket_url to assignments  ·  018_ticket_url.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Stores the claim/transfer link the captain pastes when marking a ticket
-- as delivered. Members see a "Claim Ticket →" button that opens this URL.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.assignments
  add column if not exists ticket_url text;
