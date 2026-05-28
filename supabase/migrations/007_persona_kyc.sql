-- ─────────────────────────────────────────────────────────────────────────────
-- 007_persona_kyc.sql
-- Adds Persona KYC tracking column to profiles.
-- Run in Supabase SQL Editor → New query → Run
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists persona_inquiry_id text;
