-- 043_device_push_tokens.sql
-- Native iOS/Android push notifications never actually worked — the only
-- existing push implementation (push_subscriptions, migration 003) is Web
-- Push (Notification.requestPermission() + PushManager + VAPID), which only
-- functions in a real browser context. Capacitor's embedded WKWebView on iOS
-- does not support the Web Push API, so the native app's "Enable
-- Notifications" prompt never actually registered with Apple's push system —
-- confirmed by no Notifications entry ever appearing in iOS Settings for the
-- app, since iOS only creates that entry once an app registers through APNs.
--
-- Fix (client-side): the native app now registers through Firebase Cloud
-- Messaging (@capacitor-firebase/messaging), which bridges to APNs on iOS and
-- FCM directly on Android, giving one unified token type for the backend to
-- send through. This table stores those tokens, separate from the existing
-- push_subscriptions table (structurally different — a single opaque token
-- string vs. a Web Push endpoint/key pair) so the existing, working web push
-- path is left untouched.

create table if not exists device_push_tokens (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  token      text        not null unique,             -- FCM registration token
  platform   text        not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now()
);

create index if not exists device_push_tokens_user_id_idx
  on device_push_tokens(user_id);

alter table device_push_tokens enable row level security;

create policy "Users manage own device push tokens"
  on device_push_tokens for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Service role reads all (for send-push Edge Function)
create policy "Service role reads all device push tokens"
  on device_push_tokens for select
  using (auth.role() = 'service_role');
