-- ─── Pod Chat ─────────────────────────────────────────────────────────────────
-- Simple group messaging per pod. Run this in the Supabase SQL editor.

create table if not exists pod_messages (
  id         uuid        primary key default gen_random_uuid(),
  pod_id     uuid        not null references pods(id) on delete cascade,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  content    text        not null check (length(content) >= 1 and length(content) <= 1000),
  is_pinned  boolean     not null default false,
  created_at timestamptz not null default now()
);

create index if not exists pod_messages_pod_idx on pod_messages(pod_id, created_at desc);

-- RLS: pod members can read and write
alter table pod_messages enable row level security;

create policy "Pod members read messages"
  on pod_messages for select
  using (
    exists (
      select 1 from pod_members
      where pod_members.pod_id = pod_messages.pod_id
        and pod_members.user_id = auth.uid()
    )
  );

create policy "Pod members send messages"
  on pod_messages for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from pod_members
      where pod_members.pod_id = pod_messages.pod_id
        and pod_members.user_id = auth.uid()
    )
  );

-- Only author or captain can delete
create policy "Author or captain can delete"
  on pod_messages for delete
  using (
    auth.uid() = user_id
    or exists (
      select 1 from pods where pods.id = pod_id and pods.captain_id = auth.uid()
    )
  );
