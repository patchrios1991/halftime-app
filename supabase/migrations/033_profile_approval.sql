-- 033_profile_approval.sql
-- Closes the OAuth approval bypass. App access is now gated by
-- profiles.approved instead of the 60-second OAuth-age heuristic:
--   * existing accounts are grandfathered in
--   * email signups whose address was approved on the waitlist auto-approve
--   * Google OAuth signups land unapproved and see a pending screen
--   * admins approve existing accounts via approve_profile_by_email()

alter table public.profiles
  add column if not exists approved boolean not null default false;

-- Grandfather every account that exists today
update public.profiles set approved = true where approved = false;

-- Auto-approve new signups whose email was already approved on the waitlist
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  _name text;
  _approved boolean;
begin
  _name := coalesce(
    new.raw_user_meta_data->>'display_name',
    split_part(new.email, '@', 1)
  );
  _approved := exists (
    select 1 from public.waitlist
    where lower(email) = lower(new.email) and status = 'approved'
  );
  insert into public.profiles (id, display_name, avatar_initials, approved)
  values (new.id, _name, upper(left(_name, 2)), _approved);
  return new;
end;
$$;

-- Admin-only: approve an account that already exists (e.g. created via
-- Google OAuth before waitlist approval). Email lives in auth.users, which
-- clients can't read — hence security definer.
create or replace function public.approve_profile_by_email(p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _updated int;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;
  update public.profiles p
  set approved = true
  from auth.users u
  where u.id = p.id and lower(u.email) = lower(p_email);
  get diagnostics _updated = row_count;
  return _updated > 0;
end;
$$;

grant execute on function public.approve_profile_by_email(text) to authenticated;
