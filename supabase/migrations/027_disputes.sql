-- 027_disputes.sql
-- General dispute resolution for pod issues

create table if not exists public.disputes (
  id          uuid primary key default uuid_generate_v4(),
  pod_id      uuid not null references public.pods(id) on delete cascade,
  filed_by    uuid not null references public.profiles(id),
  type        text not null check (type in (
    'ticket_not_delivered',
    'captain_unresponsive',
    'payment_issue',
    'member_conduct',
    'other'
  )),
  description text not null,
  status      text not null default 'pending'
    check (status in ('pending', 'under_review', 'resolved', 'dismissed')),
  admin_note  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.disputes enable row level security;

-- Members can view disputes for their own pods
create policy "Pod members can view disputes"
  on public.disputes for select using (
    pod_id in (select public.get_my_pod_ids())
    or pod_id in (select id from public.pods where captain_id = auth.uid())
  );

-- Any authenticated pod member can file a dispute
create policy "Pod members can file disputes"
  on public.disputes for insert with check (
    filed_by = auth.uid()
    and (
      pod_id in (select public.get_my_pod_ids())
      or pod_id in (select id from public.pods where captain_id = auth.uid())
    )
  );
