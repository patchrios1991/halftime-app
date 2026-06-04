-- 026_perks_included.sql
-- Adds opt-in/out flag for whether event perks are shared with pod members.
-- When false, member costs are discounted 5% and the captain absorbs the difference.

alter table public.pods
  add column if not exists perks_included boolean not null default true;
