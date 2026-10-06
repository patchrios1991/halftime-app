-- 045_standard_pod_captain_funding_exemption.sql
-- 1.0.6 punch list item 4: a Standard pod's captain already bought the
-- season tickets out of pocket (that's what makes it "Standard" rather
-- than "Group Buy") — they shouldn't also have to fund their own share
-- into escrow. Gated on receipt verification (an admin manually confirms
-- the uploaded receipt in BetaDashboard, see 014_receipt_upload.sql) so a
-- captain can't just claim "Standard" to dodge paying before anyone's
-- checked their receipt.
--
-- This alone isn't enough to just be a client-side display tweak:
-- stripe-webhook's escrow-deposit handler auto-transitions a Standard pod
-- to "active" and triggers payout-pod once *every* pod_members row has
-- escrow_funded = true (see supabase/functions/stripe-webhook/index.ts).
-- Without the captain's own row ever reaching escrow_funded = true, that
-- check would never pass and the pod would never go active — even once
-- every other member has genuinely paid.
--
-- Fix: a trigger that keeps the captain's pod_members.escrow_funded in
-- sync with pods.receipt_verified for Standard pods only.
--   - Verified: mark their share funded (no real escrow_payments row is
--     created — payout-pod only sums real succeeded payments, so this
--     never inflates what the captain actually gets paid out).
--   - Un-verified (rejected/reset): revert the exemption, but only if
--     there's no real succeeded Stripe payment behind it — never clobber
--     an actual payment just because a receipt got rejected afterward.

create or replace function sync_captain_funding_exemption()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.pod_type = 'standard' and new.receipt_verified is distinct from old.receipt_verified then
    if new.receipt_verified then
      update public.pod_members
      set escrow_funded    = true,
          escrow_funded_at = now()
      where pod_id = new.id
        and user_id = new.captain_id
        and escrow_funded = false;
    else
      update public.pod_members
      set escrow_funded    = false,
          escrow_funded_at = null
      where pod_id = new.id
        and user_id = new.captain_id
        and not exists (
          select 1 from public.escrow_payments
          where pod_id  = new.id
            and user_id = new.captain_id
            and status  = 'succeeded'
        );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists captain_funding_exemption_sync on public.pods;

create trigger captain_funding_exemption_sync
  after update of receipt_verified on public.pods
  for each row
  execute function sync_captain_funding_exemption();

-- Backfill: the trigger above only fires on future receipt_verified
-- changes — apply the same exemption retroactively to any Standard pod
-- whose receipt was already verified before this migration ran.
update public.pod_members pm
set escrow_funded    = true,
    escrow_funded_at = now()
from public.pods p
where pm.pod_id = p.id
  and p.pod_type = 'standard'
  and p.receipt_verified = true
  and pm.user_id = p.captain_id
  and pm.escrow_funded = false;
