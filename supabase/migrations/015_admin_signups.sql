-- ─────────────────────────────────────────────────────────────────────────────
-- 015_admin_signups.sql
-- Exposes auth.users data (email, signup date) to admin users only.
-- Uses SECURITY DEFINER so the function can read auth.users even though
-- the caller is a normal authenticated user.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.get_admin_signups()
returns table (
  id           uuid,
  email        text,
  display_name text,
  created_at   timestamptz,
  in_pod       boolean,
  pod_name     text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    u.id,
    u.email::text,
    coalesce(p.display_name, '')                                       as display_name,
    u.created_at,
    exists(
      select 1 from public.pod_members pm where pm.user_id = u.id
    )                                                                  as in_pod,
    (
      select po.name
      from   public.pod_members pm
      join   public.pods po on po.id = pm.pod_id
      where  pm.user_id = u.id
      limit  1
    )                                                                  as pod_name
  from      auth.users u
  left join public.profiles p on p.id = u.id
  where     public.is_admin()
  order by  u.created_at desc;
$$;
