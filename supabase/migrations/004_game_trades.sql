-- ─── Game Trades ──────────────────────────────────────────────────────────────
-- Lets pod members swap their assigned games with each other.
-- Run this in the Supabase SQL editor.

create table if not exists game_trades (
  id           uuid        primary key default gen_random_uuid(),
  pod_id       uuid        not null references pods(id) on delete cascade,
  from_user_id uuid        not null references auth.users(id) on delete cascade,
  to_user_id   uuid        not null references auth.users(id) on delete cascade,
  from_game_id uuid        not null references games(id) on delete cascade,
  to_game_id   uuid        not null references games(id) on delete cascade,
  status       text        not null default 'pending',  -- pending | accepted | rejected | expired
  message      text,                                    -- optional note from proposer
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists game_trades_from_user_idx on game_trades(from_user_id);
create index if not exists game_trades_to_user_idx   on game_trades(to_user_id);
create index if not exists game_trades_pod_idx       on game_trades(pod_id);

-- RLS
alter table game_trades enable row level security;

-- Members of the pod can read trades involving them
create policy "Pod members read their trades"
  on game_trades for select
  using (
    auth.uid() = from_user_id or auth.uid() = to_user_id
  );

-- Any pod member can create a trade offer (as from_user)
create policy "Members create trade offers"
  on game_trades for insert
  with check (auth.uid() = from_user_id);

-- Only the receiving user can update status (accept/reject)
create policy "Receiver updates trade status"
  on game_trades for update
  using (auth.uid() = to_user_id)
  with check (auth.uid() = to_user_id);
