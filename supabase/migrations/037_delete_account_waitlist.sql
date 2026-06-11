-- 037: also remove the user's waitlist request on account deletion.
--
-- waitlist is keyed by email (no FK to profiles), so the dynamic FK walk in
-- delete_my_account() left it behind — meaning a deleted user's email stayed
-- visible to admins, and the PendingApproval screen's promise ("removes your
-- account and waitlist request") wasn't fully honored. Capture the email
-- before deleting the auth row and clear matching waitlist rows.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _email text;
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

  select email into _email from auth.users where id = _uid;

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

  -- waitlist is keyed by email, not a profiles FK — clear it explicitly.
  if _email is not null then
    delete from public.waitlist where lower(email) = lower(_email);
  end if;

  delete from public.profiles where id = _uid;
  delete from auth.users where id = _uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
