-- 032_guest_pass_lookup.sql
-- Public lookup function for the /guest/:code page. Guests are anonymous, and
-- RLS on games/pods blocks non-members, so the embedded join in a plain select
-- returns null for them. This security-definer function exposes exactly the
-- fields a guest needs and nothing else.

create or replace function public.get_guest_pass_public(pass_code text)
returns table (
  code        text,
  note        text,
  used        boolean,
  created_at  timestamptz,
  opponent    text,
  game_date   date,
  game_time   time,
  sport_emoji text,
  seat_info   text,
  pod_name    text,
  team_name   text,
  venue       text,
  section     text,
  seat_row    text,
  issued_by_name text
)
language sql
security definer
set search_path = public
as $$
  select gp.code, gp.note, gp.used, gp.created_at,
         g.opponent, g.game_date, g.game_time, g.sport_emoji, g.seat_info,
         p.name, p.team_name, p.venue, p.section, p.row,
         pr.display_name
  from guest_passes gp
  join games    g  on g.id  = gp.game_id
  join pods     p  on p.id  = gp.pod_id
  left join profiles pr on pr.id = gp.issued_by
  where gp.code = pass_code;
$$;

grant execute on function public.get_guest_pass_public(text) to anon, authenticated;
