-- 042_welcome_email.sql
-- Nothing currently sends a welcome email when someone finishes creating an
-- account. The only existing "welcome"-style email is the admin's manual
-- "Approve & Invite" action in BetaDashboard (a leftover from the old
-- waitlist-gated signup flow, migration 041 already made that gate
-- unnecessary for normal signups) — it's never triggered by an ordinary
-- signup.
--
-- Fix: insert a `notifications` row for every new user once their email is
-- confirmed. The existing Database Webhook on notifications INSERT already
-- calls the send-email Edge Function (Resend) for any row, so this needs no
-- new infrastructure — just the right insert at the right time.
--
-- "Right time" differs by signup method:
--   * Apple/Google OAuth: auth.users.email_confirmed_at is already set at
--     INSERT time (the provider vouches for the email), so send it
--     immediately from handle_new_user().
--   * Email + password: email_confirmed_at is null at INSERT, and only gets
--     set later via an UPDATE on auth.users when they tap the confirmation
--     link — matches the user's report ("after I confirmed via email, I
--     never got the welcome email"). Needs a separate UPDATE trigger.
-- Either way the welcome notification fires exactly once per account, since
-- email_confirmed_at only ever transitions from null to non-null once.

create or replace function public.send_welcome_notification(p_user_id uuid)
returns void language plpgsql security definer as $$
declare
  _name text;
begin
  select display_name into _name from public.profiles where id = p_user_id;
  insert into public.notifications (user_id, type, title, body)
  values (
    p_user_id,
    'welcome',
    'Welcome to HalfTime! 🎉',
    'Hey ' || coalesce(_name, 'there') || ', your account is all set. ' ||
      'Browse open pods or create your own to start splitting season tickets with your crew.'
  );
end;
$$;

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

  if new.email_confirmed_at is not null then
    perform public.send_welcome_notification(new.id);
  end if;

  return new;
end;
$$;

create or replace function public.handle_user_email_confirmed()
returns trigger language plpgsql security definer as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    perform public.send_welcome_notification(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_confirmed on auth.users;
create trigger on_auth_user_email_confirmed
  after update on auth.users
  for each row execute procedure public.handle_user_email_confirmed();
