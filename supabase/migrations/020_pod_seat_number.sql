-- ─────────────────────────────────────────────────────────────────────────────
-- Add seat number column to pods  ·  020_pod_seat_number.sql
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.pods
  add column if not exists seat text;
