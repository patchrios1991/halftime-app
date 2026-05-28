-- ─────────────────────────────────────────────────────────────────────────────
-- 013_tm_price_check.sql
-- Adds Ticketmaster market-rate fields to pods so captains' stated prices
-- can be cross-checked and members can see a warning if the price is inflated.
--
-- seat_count       : number of physical season tickets the captain owns
-- tm_market_estimate: total per-seat × seat_count estimate pulled from TM at
--                     pod creation time (null if TM returned no data)
-- tm_price_flagged : true when captain's season_cost > tm_market_estimate × 1.15
--
-- Run in Supabase SQL Editor → New query → Run
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.pods
  add column if not exists seat_count          int     not null default 1,
  add column if not exists tm_market_estimate  numeric,
  add column if not exists tm_price_flagged    boolean not null default false;
