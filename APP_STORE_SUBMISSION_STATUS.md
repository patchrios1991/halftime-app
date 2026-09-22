# App Store Submission Status

**Last updated:** 2026-09-22
**Branch:** `claude/elegant-hamilton-2x8akp`
**Status: Resubmitted, waiting on Apple review again.** Build `1.0 (1)` (Sign in with Apple + UIScene fix) got a **Guideline 2.1 "Information Needed"** response requiring Report + Block in pod chat (Guideline 1.2). Built that, fixed two pre-existing bugs it exposed, uploaded build `1.0 (2)`, replied to Apple's message and resubmitted. Jorge recorded the demo on his iPhone via TestFlight and attached it to the reply.

## Round 2 — Guideline 2.1 response (2026-09-22)

Apple's message: apps with user-to-user chat need a way to report objectionable content and block abusive users (Guideline 1.2). Added to pod chat:

1. **`message_reports` + `blocked_users` tables** (migration `038_ugc_moderation.sql`) — RLS: reporters insert their own reports, only admins (`is_admin()`) can read them; users fully manage their own `blocked_users` rows. Both folded into the same approval-gate RESTRICTIVE policy migration 036 put on every other table, with explicit GRANTs.
2. **`src/api/moderation.js`** — `reportMessage`, `blockUser`, `getBlockedUserIds`.
3. **`usePodChat.js`** — loads the viewer's blocked list, filters blocked senders out of both the initial history load and the realtime subscription (via a ref, to avoid a stale-closure bug on `blockedIds`), exposes `reportMessage`/`blockSender`.
4. **`PodScreen.jsx` chat tab** — each message gets a **⋯** menu: Report (all messages) and Block (others' messages only), with an inline confirm step matching the app's existing remove-member confirm pattern, then a toast (new `SET_TOAST` reducer action).

**Both verified working on the dev server** (Report and Block insert correctly, Block hides the sender's messages immediately).

### Two pre-existing bugs found while testing (unrelated to today's feature work — pod chat had apparently never been tested against the live database before)

- **`039_pod_messages_profiles_fk.sql`** — `pod_messages.user_id` only ever referenced `auth.users(id)`, never `profiles(id)`, so PostgREST couldn't resolve the `profiles!user_id(...)` join `usePodChat.js` uses to fetch sender names. Symptom: chat wouldn't load at all (`"Could not find a relationship between 'pod_messages' and 'profiles' in the schema cache"`). Fixed by adding the missing FK.
- **`040_pod_messages_realtime.sql`** — `pod_messages` was never added to the `supabase_realtime` publication, so live message delivery silently never worked — messages only appeared after a manual page reload. Fixed with `alter publication supabase_realtime add table public.pod_messages;`.

### How migrations got applied this round

The Supabase CLI's `db push` hangs on a password prompt for Jorge, so all four migrations (038–040, run on 2026-09-22) were applied via the **Supabase Management API** directly:
```
curl -X POST "https://api.supabase.com/v1/projects/ewcipqfcqyoqtpqzoazx/database/query" \
  -H "Authorization: Bearer <personal access token>" \
  -H "Content-Type: application/json" \
  --data @<json file with {"query": "<sql file contents>"}>
```
Generate a personal access token at supabase.com/dashboard/account/tokens — **never share this token in chat**, it's account-wide (one got pasted into this conversation by accident during this round and was immediately revoked and regenerated).

**Important gotcha:** DDL applied this way does *not* reliably trigger PostgREST's schema-cache reload — `NOTIFY pgrst, 'reload schema';` sent through the same Management API endpoint appeared to succeed (`[]`, no error) but didn't actually take effect, most likely because that connection goes through transaction-mode pooling, which doesn't propagate `NOTIFY`. The reload only worked when run directly in the **Supabase Dashboard → SQL Editor**. If a future migration seems to apply cleanly but the app still behaves like it didn't, try the reload there before assuming the migration itself failed.

### Build 1.0 (2)

Same iOS project as build (1), rebuilt after bumping the Xcode build number: `npm run build:mobile` → Product → Archive (destination: Any iOS Device (arm64)) → Distribute App → App Store Connect → Upload → Automatically manage signing. Uploaded and processed successfully, attached to version 1.0, replied to Apple's Guideline 2.1 message referencing the new build, resubmitted.

No demo pod chat seeding was done (deliberately skipped — Jorge chose to demo live during the TestFlight recording instead of pre-seeding "Chase Field Crew").

---

## Round 1 — initial submission (2026-09-21)

Build `1.0 (1)` uploaded and attached to version 1.0, "Add for Review" clicked successfully.

## What shipped in this build

1. **Sign in with Apple** (`src/api/auth.js`, `src/hooks/useAuth.js`, `src/pages/auth/SignIn.jsx`) — mirrors the existing Google OAuth flow: `supabase.auth.signInWithOAuth({ provider: "apple" })`, opens the system browser on native, returns via the `com.halftimeapp.app://auth-callback` deep link. Satisfies App Store guideline 4.8 (required since the app also offers Google login). **Verified working on-device** (Patch's iPhone 17 Pro) after a Supabase config propagation delay on the first attempt.
2. **UIScene lifecycle fix** (`ios/App/App/SceneDelegate.swift`, `AppDelegate.swift`, `Info.plist`) — the Xcode 27 / iOS 27 SDK made UIScene lifecycle mandatory; the app crashed on launch without it (`EXC_BREAKPOINT`, "UIScene life cycle is required for apps built with this SDK"). Fix adopts `UIWindowSceneDelegate`, keeps the same `CAPBridgeViewController` root via `Main.storyboard` + `UISceneStoryboardFile`, and forwards `openURLContexts`/`continue` through the same `ApplicationDelegateProxy` the old AppDelegate path used — so the OAuth deep link still works under the new lifecycle. **Verified on-device.**
3. **`ITSAppUsesNonExemptEncryption` = false** in `Info.plist` — app only uses standard HTTPS, so this skips the export-compliance prompt on every upload (confirmed: no prompt appeared during this upload).
4. **Fixed `ios/App/CapApp-SPM/Package.swift`** — a prior `cap sync` had committed Windows-style backslash paths (`..\..\..\node_modules\...`), which SPM can't resolve on macOS. Corrected to forward slashes.

Commits (in order): `1c22575` (Apple sign-in + Package.swift fix), `f5b7fc6` (encryption declaration), `52deb84` (UIScene lifecycle fix). All pushed to `claude/elegant-hamilton-2x8akp`.

## Apple Developer Portal config (reference, no secrets)

- **Team:** HalfTime Solutions LLC, Team ID `Y2Y42U7LZ6`
- **Bundle ID:** `com.halftimeapp.app`
- **Sign in with Apple Services ID:** `com.halftimeapp.app.signin` (separate identifier from the bundle ID, used as OAuth client_id)
  - Domain: `ewcipqfcqyoqtpqzoazx.supabase.co`
  - Return URL: `https://ewcipqfcqyoqtpqzoazx.supabase.co/auth/v1/callback`
- **Sign in with Apple Key:** name "HalfTime SIWA Key", **Key ID `638WXF48UD`**. The `.p8` file itself lives at `~/Documents/HalfTime-keys/` on Jorge's Mac (outside the repo, never committed).
- **Apple ID used for signing/portal:** `developer@halftime-app.com`

## Supabase config (reference)

- Project ref: `ewcipqfcqyoqtpqzoazx`
- Authentication → Providers → Apple: enabled, Client ID = `com.halftimeapp.app.signin`, Secret Key = a signed JWT (not the raw `.p8` — this Supabase instance's UI wanted a JWT specifically)
- **⚠️ That JWT expires ~180 days from generation (around mid-March 2027).** When Apple sign-in mysteriously stops working around then, regenerate it: see the `node apple-secret.cjs` approach used in this session (script deleted after use — recreate from chat history if needed, or ask a fresh session to regenerate using Team ID / Key ID / Services ID above plus the `.p8` file).
- Redirect URL allow-list includes `com.halftimeapp.app://auth-callback` (shared with the working Google flow).

## App Store Connect

- App: "HalfTime — Season Ticket Po..." (full name in ASC)
- Version 1.0, Build 1.0 (1), submitted for review
- Reviewer demo login: `reviewer@halftime-app.com`
- Copyright and Content Rights fields were initially missing (contrary to earlier assumption that the listing was fully complete) — both filled in before submission
- Pricing: Free

## If Apple rejects or has questions

Come back to this file first. Known soft spots to check if a rejection is unclear:
- Native Google OAuth flow (`src/lib/native.js`) — was verified working on-device but only briefly; if Apple's reviewer flags Google sign-in specifically, re-test on-device with the exact reviewer credentials.
- The app declares iPad support (`Info.plist` has iPad orientation keys) — a 13" iPad screenshot was uploaded, but the UI itself is not iPad-optimized (just centered/scaled iPhone layout). If Apple flags iPad UX specifically, consider restricting to iPhone-only in Xcode's "Targeted Device Family" build setting instead of doing iPad-specific design work.
- Deep links for `/join/:code` and `/guest/:code` (universal links via `.well-known/apple-app-site-association`) are still marked as **not done** in `MOBILE.md` — unrelated to this submission but worth knowing if Apple's reviewer stumbles into a share link during testing.
- **New in round 2:** Report/Block only exists in pod chat (`pod_messages`). If Apple wants the same mechanism anywhere else user-generated content shows up (e.g. captain rating notes, perk requests), that's not built yet.
- Report only records a fixed default reason string (`"Reported from pod chat"`) — there's no reason picker in the UI. If Apple specifically wants reporters to select a reason, that's a follow-up.
- `blocked_users` has no unblock UI yet (the table/RLS supports `delete`, so it's just a missing screen, not a missing capability) — if Apple or a real user asks for it, add a "Blocked users" list under account settings with an unblock button.

## Environment note for whoever picks this up

This work was done partly from a cloud sandbox (no macOS/Xcode access) and partly live on Jorge's actual Mac via detailed step-by-step screen-sharing through chat. Anything requiring Xcode's GUI, the Apple Developer portal login, or App Store Connect must happen on the Mac — a fresh Claude Code session can prepare code/config changes and push them, but cannot archive or submit builds itself.
