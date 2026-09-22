-- 039_pod_messages_profiles_fk.sql
-- pod_messages.user_id only ever referenced auth.users(id) (see 005_pod_chat.sql),
-- never public.profiles(id). PostgREST's embed syntax
-- (profiles!user_id(display_name, avatar_initials), used by usePodChat.js)
-- requires a direct foreign key between the two tables to discover the join —
-- it does not infer one transitively through auth.users. Pre-existing gap,
-- caught while testing pod chat live for the first time; unrelated to
-- today's Sign in with Apple / moderation work.
--
-- profiles.id already equals auth.users.id 1:1 (profiles.id itself
-- references auth.users(id), see 001_schema.sql), so every existing
-- pod_messages.user_id value is guaranteed to satisfy this constraint.

alter table public.pod_messages
  add constraint pod_messages_user_id_profiles_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;
