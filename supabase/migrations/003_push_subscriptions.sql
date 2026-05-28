-- ─── Push Subscriptions ───────────────────────────────────────────────────────
-- Stores browser push subscription data per user.
-- Run this in the Supabase SQL editor (or via supabase db push).

create table if not exists push_subscriptions (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  endpoint   text        not null unique,          -- push service URL
  p256dh     text        not null,                 -- ECDH public key (base64url)
  auth       text        not null,                 -- auth secret (base64url)
  created_at timestamptz not null default now()
);

-- Index for fast lookup by user
create index if not exists push_subscriptions_user_id_idx
  on push_subscriptions(user_id);

-- RLS: users can only read/write their own subscriptions
alter table push_subscriptions enable row level security;

create policy "Users manage own push subscriptions"
  on push_subscriptions for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Service role can read all (for send-push Edge Function)
create policy "Service role reads all subscriptions"
  on push_subscriptions for select
  using (auth.role() = 'service_role');
