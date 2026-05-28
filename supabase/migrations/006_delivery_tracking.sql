-- ─────────────────────────────────────────────────────────────────────────────
-- 006_delivery_tracking.sql
-- Adds Level 1 ticket delivery tracking to the assignments table.
-- Run in Supabase SQL Editor → New query → Run
-- ─────────────────────────────────────────────────────────────────────────────

-- Add delivery columns to assignments
alter table public.assignments
  add column if not exists delivery_status text not null default 'pending'
    check (delivery_status in ('pending', 'delivered', 'confirmed')),
  add column if not exists delivery_note   text,
  add column if not exists delivered_at    timestamptz,
  add column if not exists confirmed_at    timestamptz;

-- ── RLS helpers ───────────────────────────────────────────────────────────────
-- Captain of the pod can update delivery_status to 'delivered'
-- Assigned member can update delivery_status to 'confirmed'
-- (Existing RLS on assignments already allows pod members to read rows.)

-- Allow captain to mark a ticket as delivered
create policy "captain_marks_delivered"
  on public.assignments
  for update
  using (
    exists (
      select 1 from public.pods p
      where p.id = assignments.pod_id
        and p.captain_id = auth.uid()
    )
  )
  with check (
    delivery_status = 'delivered'
    or delivery_status = 'pending'   -- allow reset if needed
  );

-- Allow assigned member to confirm receipt
create policy "member_confirms_receipt"
  on public.assignments
  for update
  using (
    assignments.user_id = auth.uid()
  )
  with check (
    delivery_status = 'confirmed'
  );
