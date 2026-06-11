-- 035: Pod-level escrow balance for members.
--
-- escrow_payments RLS only lets users read their OWN payments, so the
-- dashboard's pod escrow bar capped at the viewer's contribution (e.g. a
-- fully-funded 2-member pod showed 50%). Expose just the pod-level SUM to
-- pod members via a security-definer function — individual payment rows
-- stay private.

create or replace function public.get_pod_escrow_balance(p_pod_id uuid)
returns numeric
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(sum(ep.amount), 0)
  from public.escrow_payments ep
  where ep.pod_id = p_pod_id
    and ep.status = 'succeeded'
    and exists (
      select 1 from public.pod_members pm
      where pm.pod_id = p_pod_id and pm.user_id = auth.uid()
    );
$$;

revoke all on function public.get_pod_escrow_balance(uuid) from anon, public;
grant execute on function public.get_pod_escrow_balance(uuid) to authenticated;
