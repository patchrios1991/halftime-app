-- 041_auto_approve_signups.sql
-- Removed the early-access waitlist gate from the sign-in screen — anyone
-- who downloads the app can now create an account and start using it
-- immediately via Apple, Google, or email/password. New signups are
-- auto-approved instead of landing on the pending-approval screen.
--
-- The `approved` column and existing admin tooling (BetaDashboard's
-- Waitlist tab, approve_profile_by_email()) are left in place — still
-- useful if an account ever needs to be manually restricted later.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  _name text;
begin
  _name := coalesce(
    new.raw_user_meta_data->>'display_name',
    split_part(new.email, '@', 1)
  );
  insert into public.profiles (id, display_name, avatar_initials, approved)
  values (new.id, _name, upper(left(_name, 2)), true);
  return new;
end;
$$;
