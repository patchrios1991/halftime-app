-- ─────────────────────────────────────────────────────────────────────────────
-- 010_pod_invite_codes.sql
-- Adds invite_code column to pods table so captains can share join links.
-- Run in Supabase SQL Editor → New query → Run
-- ─────────────────────────────────────────────────────────────────────────────

-- Add the column (nullable first so we can backfill existing rows)
alter table public.pods
  add column if not exists invite_code text unique;

-- Backfill any existing pods that don't have a code yet
update public.pods
set invite_code = upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8))
where invite_code is null;

-- Captain can regenerate their pod's invite code (revokes the old link)
create or replace function public.regenerate_pod_invite_code(p_pod_id uuid)
returns text language plpgsql security definer as $$
declare
  new_code text;
begin
  -- Only the captain may regenerate
  if not exists (
    select 1 from public.pods
    where id = p_pod_id and captain_id = auth.uid()
  ) then
    raise exception 'Only the pod captain can regenerate the invite code';
  end if;

  new_code := upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  update public.pods
  set invite_code = new_code
  where id = p_pod_id;

  return new_code;
end;
$$;

grant execute on function public.regenerate_pod_invite_code(uuid) to authenticated;
