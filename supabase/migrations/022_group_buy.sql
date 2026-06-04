-- ─────────────────────────────────────────────────────────────────────────────
-- Group Buy pod type  ·  022_group_buy.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Adds a "group buy" pod flow where the organizer raises funds first,
-- then purchases tickets within 48 hours. If they don't, the pod
-- auto-cancels and all members are refunded.
-- ─────────────────────────────────────────────────────────────────────────────

-- New pod statuses
alter type pod_status add value if not exists 'purchasing';  -- fully funded, organizer buying
alter type pod_status add value if not exists 'cancelled';   -- deadline missed or manually cancelled

-- New columns on pods
alter table public.pods
  add column if not exists pod_type           text not null default 'standard'
    check (pod_type in ('standard', 'group_buy')),
  add column if not exists purchase_deadline  timestamptz,   -- 48-hr window after full funding
  add column if not exists organizer_consent  boolean not null default false;
