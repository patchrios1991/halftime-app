-- 031_guest_passes.sql
-- One-time shareable passes that let a non-member see game details for a seat.

create table if not exists public.guest_passes (
  id         uuid primary key default uuid_generate_v4(),
  code       text not null unique default substring(md5(random()::text), 1, 8),
  game_id    uuid not null references public.games(id) on delete cascade,
  pod_id     uuid not null references public.pods(id)  on delete cascade,
  issued_by  uuid not null references public.profiles(id),
  note       text,
  used       boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.guest_passes enable row level security;

-- Pod members can create and view passes they issued
create policy "Members manage own passes"
  on public.guest_passes for all
  using (issued_by = auth.uid())
  with check (issued_by = auth.uid());

-- Anyone can read a pass by its code (for the guest claim page)
create policy "Public read by code"
  on public.guest_passes for select
  using (true);
