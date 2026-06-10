-- 034_delete_account.sql
-- Self-service account deletion (required by Apple App Store guideline 5.1.1v).
-- The user must first leave/delete their pods so escrow refund logic runs
-- through the existing flows. Cleanup walks the FK catalog dynamically so new
-- tables referencing profiles can never silently break deletion.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  r record;
begin
  if _uid is null then
    raise exception 'not_authenticated';
  end if;

  if exists (select 1 from pod_members where user_id = _uid) then
    raise exception 'leave_pods_first';
  end if;

  if exists (select 1 from pods where captain_id = _uid) then
    raise exception 'delete_pods_first';
  end if;

  -- Remove or detach every row referencing this profile:
  -- nullable FK columns are nulled, non-nullable rows are deleted.
  for r in
    select c.conrelid::regclass as tbl, a.attname as col, a.attnotnull
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.confrelid = 'public.profiles'::regclass
      and c.contype = 'f'
  loop
    if r.attnotnull then
      execute format('delete from %s where %I = $1', r.tbl, r.col) using _uid;
    else
      execute format('update %s set %I = null where %I = $1', r.tbl, r.col, r.col) using _uid;
    end if;
  end loop;

  delete from public.profiles where id = _uid;
  delete from auth.users where id = _uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
