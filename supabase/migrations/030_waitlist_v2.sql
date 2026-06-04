-- 030_waitlist_v2.sql
-- Upgrades the basic email-only waitlist to support admin approval flow.
-- Run in Supabase SQL Editor.

alter table public.waitlist
  add column if not exists name        text,
  add column if not exists status      text not null default 'pending'
                                       check (status in ('pending','approved','rejected')),
  add column if not exists approved_at timestamptz,
  add column if not exists note        text;

-- Admin can read and manage all waitlist entries
create policy "Admin manages waitlist"
  on public.waitlist for all
  using (public.is_admin())
  with check (public.is_admin());
