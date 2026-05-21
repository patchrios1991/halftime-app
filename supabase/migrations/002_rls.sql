-- ─────────────────────────────────────────────────────────────────────────────
-- HalfTime Row Level Security  ·  002_rls.sql
-- Run AFTER 001_schema.sql in the Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable RLS on every table
alter table public.profiles         enable row level security;
alter table public.pods             enable row level security;
alter table public.pod_members      enable row level security;
alter table public.games            enable row level security;
alter table public.assignments      enable row level security;
alter table public.bids             enable row level security;
alter table public.resale_listings  enable row level security;
alter table public.resale_payouts   enable row level security;
alter table public.escrow_payments  enable row level security;
alter table public.notifications    enable row level security;

-- ─── PROFILES ────────────────────────────────────────────────────────────────
-- Anyone can read public profiles (needed for pod member lists)
create policy "Profiles are publicly readable"
  on public.profiles for select using (true);

-- Users can only update their own profile
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- ─── PODS ────────────────────────────────────────────────────────────────────
-- Users can read any pod they are a member of, plus active pods they can browse
create policy "Members can read their pods"
  on public.pods for select using (
    status = 'recruiting'  -- browseable by anyone
    or id in (
      select pod_id from public.pod_members where user_id = auth.uid()
    )
  );

-- Pod captains can update their own pods
create policy "Captains can update their pods"
  on public.pods for update using (captain_id = auth.uid());

-- Authenticated users can create pods (they become captain)
create policy "Auth users can create pods"
  on public.pods for insert with check (auth.uid() = captain_id);

-- ─── POD MEMBERS ─────────────────────────────────────────────────────────────
-- Members can see other members in their shared pods
create policy "Members can read pod_members in their pods"
  on public.pod_members for select using (
    pod_id in (
      select pod_id from public.pod_members where user_id = auth.uid()
    )
  );

-- Only the captain of a pod can add / update members
create policy "Captains can insert pod members"
  on public.pod_members for insert with check (
    pod_id in (select id from public.pods where captain_id = auth.uid())
  );

create policy "Captains can update pod members"
  on public.pod_members for update using (
    pod_id in (select id from public.pods where captain_id = auth.uid())
  );

-- Users can update their own membership row (e.g. mark attended)
create policy "Members can update own membership"
  on public.pod_members for update using (user_id = auth.uid());

-- ─── GAMES ───────────────────────────────────────────────────────────────────
create policy "Members can read games in their pods"
  on public.games for select using (
    pod_id in (
      select pod_id from public.pod_members where user_id = auth.uid()
    )
  );

create policy "Captains can manage games"
  on public.games for all using (
    pod_id in (select id from public.pods where captain_id = auth.uid())
  );

-- ─── ASSIGNMENTS ─────────────────────────────────────────────────────────────
create policy "Members can read assignments in their pods"
  on public.assignments for select using (
    pod_id in (
      select pod_id from public.pod_members where user_id = auth.uid()
    )
  );

-- System (service role) creates assignments; members can confirm their own
create policy "Members can confirm own assignments"
  on public.assignments for update using (user_id = auth.uid());

-- ─── BIDS ────────────────────────────────────────────────────────────────────
create policy "Members can read bids in their pods"
  on public.bids for select using (
    pod_id in (
      select pod_id from public.pod_members where user_id = auth.uid()
    )
  );

create policy "Members can place bids"
  on public.bids for insert with check (
    auth.uid() = user_id
    and pod_id in (
      select pod_id from public.pod_members where user_id = auth.uid()
    )
  );

create policy "Members can update own bids"
  on public.bids for update using (user_id = auth.uid());

-- ─── RESALE ──────────────────────────────────────────────────────────────────
create policy "Members can read resale listings in their pods"
  on public.resale_listings for select using (
    pod_id in (
      select pod_id from public.pod_members where user_id = auth.uid()
    )
  );

create policy "Assigned members can list their games for resale"
  on public.resale_listings for insert with check (
    auth.uid() = seller_id
    and game_id in (
      select game_id from public.assignments where user_id = auth.uid()
    )
  );

create policy "Sellers can update their own listings"
  on public.resale_listings for update using (seller_id = auth.uid());

create policy "Members can read resale payouts for their pods"
  on public.resale_payouts for select using (user_id = auth.uid());

-- ─── ESCROW PAYMENTS ────────────────────────────────────────────────────────
create policy "Users can read own escrow payments"
  on public.escrow_payments for select using (user_id = auth.uid());

create policy "Users can insert own escrow payments"
  on public.escrow_payments for insert with check (user_id = auth.uid());

-- ─── NOTIFICATIONS ───────────────────────────────────────────────────────────
create policy "Users can read own notifications"
  on public.notifications for select using (user_id = auth.uid());

create policy "Users can mark own notifications read"
  on public.notifications for update using (user_id = auth.uid());
