-- 028_captain_ratings.sql
-- Members rate their captain after a season. Rating shows on Browse Pods.

create table if not exists public.captain_ratings (
  id           uuid primary key default uuid_generate_v4(),
  pod_id       uuid not null references public.pods(id) on delete cascade,
  captain_id   uuid not null references public.profiles(id),
  rated_by     uuid not null references public.profiles(id),
  score        int  not null check (score between 1 and 5),
  note         text,
  created_at   timestamptz not null default now(),
  unique (pod_id, rated_by)   -- one rating per member per pod
);

alter table public.captain_ratings enable row level security;

-- Anyone can read ratings (shown on Browse Pods)
create policy "Ratings are public"
  on public.captain_ratings for select using (true);

-- Pod members can submit a rating for their pod's captain
create policy "Members can rate their captain"
  on public.captain_ratings for insert with check (
    rated_by = auth.uid()
    and captain_id != auth.uid()        -- can't rate yourself
    and pod_id in (select public.get_my_pod_ids())
  );

-- Members can update their own rating
create policy "Members can update their rating"
  on public.captain_ratings for update using (rated_by = auth.uid());

-- Materialised view helper: captain average rating + count
-- (plain view — no CONCURRENTLY needed)
create or replace view public.captain_rating_summary as
  select
    captain_id,
    round(avg(score)::numeric, 1) as avg_score,
    count(*)::int                 as rating_count
  from public.captain_ratings
  group by captain_id;
