-- ─────────────────────────────────────────────────────────────────────────────
-- Add seat map URL to pods + expand sport enum  ·  019_seat_map.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Expand the sport_type enum to include NCAA sports
--    (these were missing since 001_schema.sql only defined pro leagues)
alter type sport_type add value if not exists 'ncaa-football';
alter type sport_type add value if not exists 'ncaa-basketball';
alter type sport_type add value if not exists 'ncaa-wbasketball';
alter type sport_type add value if not exists 'ncaa-baseball';
alter type sport_type add value if not exists 'ncaa-hockey';

-- 2. Add seat map URL column
--    Populated at pod creation time by looking up the venue in Ticketmaster.
alter table public.pods
  add column if not exists seat_map_url text;
