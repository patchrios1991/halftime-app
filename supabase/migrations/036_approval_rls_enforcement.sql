-- 036: Enforce the approval gate at the database level.
--
-- The app UI already blocks unapproved accounts (PendingApproval screen),
-- but RLS did not: an unapproved user talking to PostgREST directly could
-- join recruiting pods, read pod listings, etc. (verified June 11, 2026).
--
-- Fix: RESTRICTIVE policies (ANDed with all existing permissive policies)
-- requiring profiles.approved on every user-action table.
--
-- Deliberately NOT restricted:
--   profiles  - the app must read its own profile to know it is unapproved,
--               and delete_my_account() must work for unapproved users
--   waitlist  - the PendingApproval screen inserts the user into it
-- Service-role (edge functions, webhooks) bypasses RLS. Anon role is
-- untouched (guest passes use a security-definer RPC).

create or replace function public.is_approved()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select approved from public.profiles where id = auth.uid()),
    false
  );
$$;

revoke all on function public.is_approved() from anon, public;
grant execute on function public.is_approved() to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'pods', 'pod_members', 'games', 'assignments', 'bids', 'game_trades',
    'resale_listings', 'resale_payouts', 'escrow_payments', 'pod_messages',
    'pod_perks', 'perk_bids', 'guest_passes', 'pod_waitlist',
    'captain_ratings', 'invite_codes', 'notifications', 'push_subscriptions'
  ]
  loop
    execute format(
      'drop policy if exists approved_users_only on public.%I', t);
    execute format(
      'create policy approved_users_only on public.%I
         as restrictive for all to authenticated
         using (public.is_approved())
         with check (public.is_approved())', t);
  end loop;
end;
$$;
