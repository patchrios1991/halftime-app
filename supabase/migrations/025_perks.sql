-- 025_perks.sql
-- Captain perk commitment, perk posting, and member bidding

-- Track that the captain formally committed to disclosing team perks
alter table public.pods
  add column if not exists perk_commitment boolean not null default false;

-- Perks posted by captain for members to bid on
create table if not exists public.pod_perks (
  id          uuid primary key default uuid_generate_v4(),
  pod_id      uuid not null references public.pods(id)    on delete cascade,
  posted_by   uuid not null references public.profiles(id),
  title       text not null,
  description text,
  event_date  date,
  spots       int not null default 1 check (spots >= 1),
  status      text not null default 'open'
    check (status in ('open', 'awarded')),
  created_at  timestamptz not null default now()
);

-- Member bids on a perk (one bid per member per perk, updatable)
create table if not exists public.perk_bids (
  id         uuid primary key default uuid_generate_v4(),
  perk_id    uuid not null references public.pod_perks(id) on delete cascade,
  pod_id     uuid not null references public.pods(id)      on delete cascade,
  user_id    uuid not null references public.profiles(id),
  credits    int  not null check (credits >= 1),
  won        boolean not null default false,
  created_at timestamptz not null default now(),
  unique (perk_id, user_id)
);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.pod_perks enable row level security;
alter table public.perk_bids  enable row level security;

-- pod_perks: any pod member (incl. captain) can view
create policy "Pod members can view perks"
  on public.pod_perks for select using (
    pod_id in (select public.get_my_pod_ids())
  );

-- pod_perks: only captain can post
create policy "Captain can post perks"
  on public.pod_perks for insert with check (
    posted_by = auth.uid()
    and pod_id in (select id from public.pods where captain_id = auth.uid())
  );

-- pod_perks: only captain can award/close
create policy "Captain can update perks"
  on public.pod_perks for update using (
    pod_id in (select id from public.pods where captain_id = auth.uid())
  );

-- perk_bids: any pod member can view bids (to see competition)
create policy "Pod members can view perk bids"
  on public.perk_bids for select using (
    pod_id in (select public.get_my_pod_ids())
  );

-- perk_bids: members can place/update their own bid
create policy "Members can place perk bids"
  on public.perk_bids for insert with check (
    user_id = auth.uid()
    and pod_id in (select unnest(get_my_pod_ids()))
  );

create policy "Members can update own perk bid"
  on public.perk_bids for update using (user_id = auth.uid());

-- Captain can mark bids won/lost when awarding
create policy "Captain can resolve perk bids"
  on public.perk_bids for update using (
    pod_id in (select id from public.pods where captain_id = auth.uid())
  );
