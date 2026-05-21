-- ─────────────────────────────────────────────────────────────────────────────
-- HalfTime Database Schema  ·  001_schema.sql
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ─── PROFILES ─────────────────────────────────────────────────────────────────
-- Extends auth.users with HalfTime-specific fields.
-- avatar_initials is a plain column (not generated) because upper() is locale-
-- dependent and therefore not immutable — Postgres rejects it in generated cols.
create table public.profiles (
  id                 uuid references auth.users(id) on delete cascade primary key,
  display_name       text,
  avatar_initials    text,                          -- set by trigger on insert/update
  verified           boolean not null default false,
  trust_score        int not null default 50 check (trust_score between 0 and 100),
  bid_credits        int not null default 100,
  stripe_customer_id text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Auto-create profile on signup and compute avatar_initials
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  _name text;
begin
  _name := coalesce(
    new.raw_user_meta_data->>'display_name',
    split_part(new.email, '@', 1)
  );
  insert into public.profiles (id, display_name, avatar_initials)
  values (new.id, _name, upper(left(_name, 2)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Keep avatar_initials in sync when display_name changes
create or replace function public.sync_avatar_initials()
returns trigger language plpgsql as $$
begin
  if new.display_name is distinct from old.display_name then
    new.avatar_initials := upper(left(new.display_name, 2));
  end if;
  return new;
end;
$$;

create trigger sync_avatar_initials
  before update on public.profiles
  for each row execute procedure public.sync_avatar_initials();

-- ─── PODS ─────────────────────────────────────────────────────────────────────
create type pod_status as enum ('draft', 'recruiting', 'active', 'completed', 'cancelled');
create type sport_type  as enum ('NBA', 'MLB', 'NFL', 'NHL', 'MLS', 'WNBA', 'other');

create table public.pods (
  id                uuid primary key default uuid_generate_v4(),
  name              text not null,
  team_name         text not null,
  sport             sport_type not null default 'NBA',
  sport_emoji       text not null default '🏀',
  venue             text,
  section           text,
  row               text,
  season            text not null default '2025-26',
  total_seats       int not null default 1,
  max_members       int not null default 6,
  season_cost       numeric(10,2) not null,
  escrow_required   numeric(10,2) not null,
  status            pod_status not null default 'draft',
  captain_id        uuid references public.profiles(id),
  allocation_method text not null default 'snake'
                    check (allocation_method in ('snake','lottery','ai','bidding')),
  allocation_done   boolean not null default false,
  renewal_rate      numeric(5,2),
  nps               numeric(4,1),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ─── POD MEMBERS ──────────────────────────────────────────────────────────────
create table public.pod_members (
  id               uuid primary key default uuid_generate_v4(),
  pod_id           uuid not null references public.pods(id) on delete cascade,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  share_pct        numeric(5,2) not null check (share_pct > 0 and share_pct <= 100),
  cost             numeric(10,2) not null,
  escrow_funded    boolean not null default false,
  escrow_funded_at timestamptz,
  bid_credits      int not null default 100,
  games_allocated  int not null default 0,
  games_attended   int not null default 0,
  churn_risk       text not null default 'unknown'
                   check (churn_risk in ('low','medium','high','unknown')),
  tier             text not null default 'starter'
                   check (tier in ('starter','pro','captain')),
  referral_count   int not null default 0,
  joined_at        timestamptz not null default now(),
  unique (pod_id, user_id)
);

-- ─── GAMES ────────────────────────────────────────────────────────────────────
create type game_tier as enum ('standard', 'premium', 'marquee', 'playoff');

-- day_of_week is a plain column (not generated) because to_char() is locale-
-- dependent (STABLE, not IMMUTABLE). Set it in the application layer instead.
create table public.games (
  id          uuid primary key default uuid_generate_v4(),
  pod_id      uuid not null references public.pods(id) on delete cascade,
  opponent    text not null,
  game_date   date not null,
  game_time   time not null,
  day_of_week text,                              -- e.g. "Mon", "Tue" — set by app
  face_value  numeric(8,2) not null,
  tier        game_tier not null default 'standard',
  sport_emoji text not null default '🏀',
  seat_info   text,
  notes       text,
  created_at  timestamptz not null default now()
);

-- ─── ASSIGNMENTS ──────────────────────────────────────────────────────────────
create table public.assignments (
  id          uuid primary key default uuid_generate_v4(),
  game_id     uuid not null references public.games(id) on delete cascade,
  pod_id      uuid not null references public.pods(id) on delete cascade,
  user_id     uuid references public.profiles(id),   -- null = unassigned
  method      text not null default 'snake'
              check (method in ('snake','lottery','ai','bidding','manual')),
  assigned_at timestamptz not null default now(),
  confirmed   boolean not null default false,
  no_show     boolean not null default false,
  unique (game_id)
);

-- ─── BIDS ─────────────────────────────────────────────────────────────────────
create table public.bids (
  id          uuid primary key default uuid_generate_v4(),
  game_id     uuid not null references public.games(id) on delete cascade,
  pod_id      uuid not null references public.pods(id) on delete cascade,
  user_id     uuid not null references public.profiles(id),
  credits     int not null check (credits > 0),
  status      text not null default 'active'
              check (status in ('active','won','lost','refunded')),
  placed_at   timestamptz not null default now(),
  resolved_at timestamptz,
  unique (game_id, user_id)
);

-- ─── RESALE ───────────────────────────────────────────────────────────────────
-- platform_fee and net_proceeds use round(numeric * numeric, int) which IS
-- immutable, so generated columns are fine here.
create table public.resale_listings (
  id           uuid primary key default uuid_generate_v4(),
  game_id      uuid not null references public.games(id) on delete cascade,
  pod_id       uuid not null references public.pods(id) on delete cascade,
  seller_id    uuid not null references public.profiles(id),
  ask_price    numeric(8,2) not null,
  platform_fee numeric(8,2) generated always as (round(ask_price * 0.08, 2)) stored,
  net_proceeds numeric(8,2) generated always as (round(ask_price * 0.92, 2)) stored,
  status       text not null default 'listed'
               check (status in ('listed','sold','cancelled')),
  sold_price   numeric(8,2),
  sold_at      timestamptz,
  listed_at    timestamptz not null default now()
);

create table public.resale_payouts (
  id         uuid primary key default uuid_generate_v4(),
  listing_id uuid not null references public.resale_listings(id) on delete cascade,
  user_id    uuid not null references public.profiles(id),
  share_pct  numeric(5,2) not null,
  amount     numeric(8,2) not null,
  paid_at    timestamptz not null default now()
);

-- ─── ESCROW PAYMENTS ─────────────────────────────────────────────────────────
create table public.escrow_payments (
  id                       uuid primary key default uuid_generate_v4(),
  pod_id                   uuid not null references public.pods(id) on delete cascade,
  user_id                  uuid not null references public.profiles(id),
  amount                   numeric(10,2) not null,
  stripe_payment_intent_id text unique,
  stripe_status            text,
  status                   text not null default 'pending'
                           check (status in ('pending','processing','succeeded','failed','refunded')),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
create table public.notifications (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  pod_id     uuid references public.pods(id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

-- ─── UPDATED_AT TRIGGERS ──────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger set_updated_at before update on public.profiles
  for each row execute procedure public.set_updated_at();
create trigger set_updated_at before update on public.pods
  for each row execute procedure public.set_updated_at();
create trigger set_updated_at before update on public.escrow_payments
  for each row execute procedure public.set_updated_at();

-- ─── INDEXES ──────────────────────────────────────────────────────────────────
create index on public.pod_members    (pod_id);
create index on public.pod_members    (user_id);
create index on public.games          (pod_id);
create index on public.games          (game_date);
create index on public.assignments    (pod_id);
create index on public.assignments    (user_id);
create index on public.bids           (game_id);
create index on public.bids           (user_id);
create index on public.notifications  (user_id) where not read;
create index on public.escrow_payments(user_id);
