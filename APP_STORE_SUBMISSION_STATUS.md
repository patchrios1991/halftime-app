# App Store Submission Status

**Last updated:** 2026-10-01
**Branch:** `claude/elegant-hamilton-2x8akp` (merged into `master` as of 2026-09-29, and again as of 2026-09-30 for Round 5 — see below)
**Status: Version 1.0.4 is APPROVED and LIVE (auto-distributed).** All known issues from Round 4 and Round 5 are shipped and confirmed working: sign-in stuck-loading fix, delete-pod modal clipping fix (both in 1.0.3), and the signup confirmation modal, Universal Links for email confirmation, and welcome email (all three in 1.0.4). **No open bugs. Nothing currently in flight.**

## Round 5 — signup UX + email issues, DONE and verified on-device (2026-09-30)

User created a test account with a fresh email to check signup end-to-end and found three issues. All three are now fixed and confirmed working on-device.

**1. Signup confirmation UX — DONE, verified working (`5c49de4`)**
After creating an account, the page just sat there with an inline feedback banner saying to check email — looked ambiguous, unclear if it worked. Replaced with a clear modal (`src/pages/auth/SignIn.jsx`) confirming the account was created and naming the email address the confirmation link went to, with a "Got it" button that returns to the sign-in form.

**2. Email confirmation link opens Safari instead of the app — DONE, verified working (`d342a18`)**
Confirmation emails link to `https://app.halftime-app.com/auth/callback` (an ordinary https URL — mail clients won't treat a custom URL scheme like `com.halftimeapp.app://` as tappable, so this was always necessary). Without iOS Universal Links configured, tapping it just opened Safari. This was a known, already-documented gap (`MOBILE.md`'s "Known work before store submission" list, item 2).

Fixed:
- `public/.well-known/apple-app-site-association` — registers `app.halftime-app.com`'s `/auth/callback`, `/join/*`, `/guest/*` paths for Team `Y2Y42U7LZ6` / bundle `com.halftimeapp.app`.
- `vercel.json` — explicit `Content-Type: application/json` header for that path.
- `src/lib/native.js` — the `appUrlOpen` listener now treats a Universal Link landing on `/auth/callback` exactly like the existing custom-scheme deep link (same token-extraction + `setSession()` code path already verified via the Round 4 console debugging).
- Xcode: added the **Associated Domains** capability (`applinks:app.halftime-app.com`) to the App target under Signing & Capabilities.

**Gotcha hit and resolved:** the AASA file initially wasn't reachable — `master` (which `app.halftime-app.com` deploys from via Vercel) hadn't been updated since Round 3; all of Round 4/5 only existed on the feature branch. Fast-forward merged `claude/elegant-hamilton-2x8akp` → `master` and pushed (clean, no conflicts) to actually deploy it. Verified the file live at `https://app.halftime-app.com/.well-known/apple-app-site-association` afterward (correct JSON, not the app's HTML). Then had to **fully delete and reinstall the app** on the test device — iOS had cached a negative Universal Links validation result from testing earlier in the session, before the AASA was actually live; a plain Xcode rebuild-in-place doesn't force iOS to re-check. (This is a one-time fix for a device that was tested against a broken server — a real user's first App Store install always triggers a fresh validation, so this won't affect anyone downloading normally.)

**3. No welcome email after confirming — DONE, verified working (`3d29321`)**
The only existing "welcome"-style email was the admin's manual "Approve & Invite" action in `BetaDashboard.jsx` — a leftover from the old waitlist-gated signup flow that migration 041 made unnecessary for normal signups. Nothing fired automatically for an ordinary signup.

`supabase/migrations/042_welcome_email.sql` (applied via Supabase Dashboard → SQL Editor) adds a `welcome` notification, inserted exactly once per account, right when their email is confirmed — immediately in `handle_new_user()` for OAuth signups, or via a new `AFTER UPDATE ON auth.users` trigger for email/password signups when `email_confirmed_at` transitions from null to set. Reuses the existing Database Webhook → `send-email` Edge Function (Resend) — no new infrastructure. Added a 🎉 icon for the `welcome` type in both the email template and the in-app notification panel.

**Side note, unrelated to the code:** while debugging why the confirmation email itself wasn't arriving (separate from the welcome email — turned out to just be user error checking the wrong inbox/spot), confirmed along the way that custom SMTP (Resend, `smtp.resend.com`) is already correctly configured for Supabase's built-in auth emails, with a 30 emails/hour rate limit — comfortably above normal testing/usage volume, so not a concern.

### Next steps for whoever picks this up
1. **1.0.3 and 1.0.4 both approved, live, and auto-distributed.** No action needed on either.
2. **No open bugs.** Everything reported across Round 4 and Round 5 is fixed, shipped, and confirmed working on-device.
3. Only remaining loose thread: item 3 from Round 4 (general "feels slow/unpolished") — stays unscheduled, pick it up only once the user has specific examples to point at.
4. Whoever picks this up next: this is a clean stopping point. Start fresh from whatever the user brings up, rather than assuming there's unfinished work here.

## Round 4 — post-launch fixes, in progress (2026-09-29)

User reported three issues on the **live 1.0 build** (not the just-approved 1.0.1): (1) sign-in with Apple/Google gets stuck on a loading screen until the app is force-quit and reopened; (2) the delete-pod confirmation modal is visually cut off / unclickable; (3) general feeling that the app is slow/unpolished. Agreed with the user to fix all three in code now (safe, since 1.0.1 was already submitted and this work targets whatever version ships *after* it) without touching Xcode/App Store Connect for the in-flight review.

**1. Sign-in stuck-loading fix — two wrong theories, then the real root cause found via on-device debugging and fixed (`c5e1ddb`)**

*Attempt 1 (`685def2`, shipped in 1.0.2):* Theory was that `window.location.assign("/app")` (a full WebView reload after `setSession()`) could hang if anything in the reload's re-init sequence stalled. Replaced with a `navigateTo()` helper doing `window.history.pushState()` + a synthetic `popstate` event, betting BrowserRouter would pick it up as client-side navigation. **Confirmed not fixed on-device** — screenshot after 1.0.2 shipped showed the sign-in form still stuck on "Please wait…".

*Attempt 2 (`fb8e307`):* Theory was that BrowserRouter's own internal history object never learns about a raw `pushState()` call made from outside React, so the synthetic `popstate` event was ineffective — the URL changed underneath the still-mounted `SignIn` screen, which just sat there. Added `src/lib/routerBridge.js`, exposing the router's real `useNavigate()` function to code outside React (via a `<NavigateBridge/>` component mounted inside `<BrowserRouter>`), so `native.js` could call an actual router-driven navigation instead of the pushState hack. **Also confirmed not fixed on-device** — exact same symptom, even on a verified-fresh build (checked build folder timestamps and git commit to rule out a stale build).

*Real root cause, found via Safari Web Inspector console + Supabase's own internal debug logging (`fa828f5`, `1a8fd0f`, `c4b68fe` added the diagnostics; see their commit messages for the full methodology):* Both earlier attempts were solving a navigation problem that didn't exist. The actual trace showed `supabase.auth.setSession()` itself never resolving — specifically, it acquires GoTrueClient's internal per-session-key lock, successfully calls `_saveSession()`, then calls `_notifyAllSubscribers(SIGNED_IN)` — and that step's debug log shows "begin" but **never "end"**. `useAuth.js`'s `onAuthStateChange` subscription (active the whole time `SignIn.jsx` is mounted, since it calls `useAuth()` directly) had an `async` callback that directly `await`ed `loadProfile()` → `getProfile()` → `supabase.auth.getUser()` — another GoTrueClient call needing that *same* lock. Locks aren't re-entrant: `setSession()` was waiting on the subscriber callback to finish, the callback was waiting on `getUser()`, and `getUser()` was waiting on a lock `setSession()` itself still held. A textbook deadlock, and a **documented Supabase footgun** — their own guidance says never to directly await client calls inside an `onAuthStateChange` callback.

*Fix (`c5e1ddb`):* Removed `async`/`await` from the `onAuthStateChange` callback in `useAuth.js`; `loadProfile()` is now deferred via `setTimeout(fn, 0)` so the current call stack (and the lock) unwinds and releases before it runs. **Confirmed fixed on-device** — user tested both Sign in with Apple and Sign in with Google, both landed cleanly on Home with no stuck spinner.

Diagnostic scaffolding (`console.log("[HalfTime][debug] ...")` lines, the Supabase client's `debug: true`, and the gotrue-js locks-debug flag in `index.html`) added across `fa828f5`/`1a8fd0f`/`c4b68fe` was stripped in `5a1400a` once the fix was confirmed working, before this version shipped.

**2. Delete-pod modal clipping fix (systemic) — DONE, committed across 9 commits**
Root cause: WebKit/Safari clips `position: fixed` descendants to the bounds of the nearest ancestor with a non-`visible` `overflow` — and that's not just literal `overflow: auto`. `HalfTimeApp.jsx`'s outer app-shell wrapper sets `overflowX: hidden` with `overflowY` left unset; per the CSS overflow spec's used-value rule (if one axis is `visible` and the other isn't, the `visible` one's *used* value becomes `auto`), that makes the wrapper a scroll container on **both** axes, and WebKit clips fixed-position descendants to it. The inner "Screen content" div nested inside it also has an explicit `overflowY: "auto"` and a height capped to `calc(100dvh - 112px)` (room for the top bar + bottom nav) — so any modal rendered from a screen component landed inside a box shorter than the viewport, and got visibly cut off. That's exactly what "the final confirmation to delete is blocked off" was.

Fix: wrapped every affected `position: fixed` modal/overlay in `createPortal(..., document.body)` so it renders directly under `<body>`, outside every clipping ancestor, regardless of where in the component tree it's triggered from. Applied surgically (existing JSX left untouched aside from the wrap) to minimize regression risk, across:
- `PodScreen.jsx` — 6 sites (flag perk, dispute, leave/delete pod confirm, member onboarding, invite modal)
- `ScheduleScreen.jsx` — 7 sites (guest pass, mark delivered, trade offer, release game, reassign game, share schedule, incoming trades)
- `ProfileScreen.jsx` — 5 sites (edit profile, payment methods, pod agreements, help & support, delete account)
- `BrowsePodsScreen.jsx` — 2 sites (pod detail sheet, seat map)
- `JoinPodScreen.jsx` — 1 site (seat map)
- `ResalePaymentModal.jsx` — 1 site (shared `Modal` shell used by all its phases)
- `HalfTimeApp.jsx` — 1 additional site (notification panel; the pod switcher modal was already portal-wrapped from earlier work)
- `components/Toast.jsx` — the global toast, found during this sweep (not in the original 24-site count but affected by the same bug)

Verified after every file: `npx eslint <file>` (only pre-existing, unrelated errors present — confirmed identical before/after via `git stash`) and `npm run build:mobile` (clean build each time). Shipped untested in 1.0.2; **confirmed fixed on-device** by the user while testing the 1.0.3 build (delete-pod confirmation modal fully visible and tappable).

**3. "App feels slow/unpolished" — SKIPPED for now, by user decision (2026-09-29).** No specific instances to go on; user will note concrete examples if/when they notice them, to revisit later. Not blocking anything below.

### Build 1.0.2 (1) — submitted 2026-09-29, live — sign-in fix in this build did NOT work

On Jorge's Mac: `git pull origin claude/elegant-hamilton-2x8akp` (confirmed at commit `b837a6b`) → `npm install` → `npm run build:mobile` (clean, no errors) → opened `ios/App/App.xcodeproj` → bumped Version `1.0.1` → `1.0.2`, Build → `1` → **Product → Archive** → **Distribute App → App Store Connect → Upload** → created version `1.0.2` in App Store Connect, attached the processed build, **Add for Review**. Shipped without on-device testing (user's explicit choice at the time) — the sign-in fix in this build (`navigateTo()` via pushState/popstate) turned out not to actually fix anything; see Round 4 item 1 above for the full misdiagnosis-then-correct-diagnosis story.

### Build 1.0.3 (1) — submitted 2026-09-30, includes the REAL fixes

On Jorge's Mac, after both bugs were confirmed fixed on-device (this time, actually tested — see Round 4 above): `git pull origin claude/elegant-hamilton-2x8akp` (commit `5a1400a`) → `npm install` → `npm run build:mobile` (clean) → bumped Version `1.0.2` → `1.0.3`, Build → `1` → **Product → Archive** → **Distribute App → App Store Connect → Upload** → created version `1.0.3` in App Store Connect, attached the build, **Add for Review**. Now waiting on Apple.

### Next steps for whoever picks this up
1. 1.0.1 and 1.0.2 both confirmed live (auto-distributed, no manual release step needed) — nothing to do there.
2. Waiting on Apple's review of 1.0.3. Once it's approved/live, do one more on-device sanity check of sign-in and the delete-pod modal on the actual shipped build, just to be safe — though both were verified on this exact code before archiving.
3. Item 3 (general polish) stays open/unscheduled — pick it up only once the user has specific examples to point at.
4. If a future sign-in-adjacent bug ever resurfaces, the Safari Web Inspector + Supabase debug-logging method used in Round 4 (Mac Safari → Develop → [iPhone] → the HalfTime entry → Console tab; temporarily re-add `debug: true` to the Supabase client config and/or the gotrue-js locks-debug localStorage flag) is the fastest way to find the real cause rather than guessing — two guesses were wrong before the console trace nailed it in one shot.

## Web app (app.halftime-app.com) synced with the iOS work — 2026-09-29

All 14 commits from this whole effort (Sign in with Apple through round 3's open-signup work) had only ever been pushed to `claude/elegant-hamilton-2x8akp`, never merged into `master` — the branch Vercel auto-deploys `app.halftime-app.com` from. That meant the live web app was stuck on old code (approval gate, no Apple sign-in, outdated "Get early access" copy) the whole time, even after everything shipped to iOS.

Fixed: fast-forward merged `claude/elegant-hamilton-2x8akp` → `master` (clean, no conflicts, master hadn't diverged at all) and pushed. Verified live on `app.halftime-app.com` afterward. Also synced the user's Mac and Windows machines to the same `master` state, so all three checkouts (Mac, Windows, GitHub) are now aligned — either machine is safe to develop from next.

**Going forward:** if more work happens on this feature branch, remember to also merge it into `master` when the web app should reflect it — the two aren't automatically kept in sync.

## Round 3 — open signup, no App Review request behind it (2026-09-28)

User decision: remove the early-access waitlist gate entirely. Anyone downloading the app should be able to create an account and start using it immediately via Apple, Google, or email/password — no manual approval, no magic link, no "request access" detour.

1. **`041_auto_approve_signups.sql`** — `handle_new_user()` now always inserts new profiles with `approved = true`, instead of only auto-approving emails pre-approved on the waitlist. Takes effect immediately for all existing app versions (server-side), applied via the same Management API process as always.
2. **`SignIn.jsx`** — removed the "waitlist" and "magic" modes entirely. Only "signin" and "signup" remain; "New here? Create account" goes straight to signup instead of a waitlist form.
3. **`App.jsx`** — removed the separate "🏆 Get early access" waitlist box from the marketing Landing page (`/`), and made the **native app** skip that Landing page entirely for unauthenticated users — goes straight to `/auth/signin` instead of showing an "Open App" button that just leads deeper into the same app. The Landing page still shows for web visitors (`isNative` check gates this).
4. **`friendlyError.js`** — two error messages referenced the removed magic-link option and a nonexistent invite-code system; reworded.
5. The `approved` column and admin tooling (BetaDashboard's Waitlist tab, `approve_profile_by_email()`) were deliberately left in place as a moderation safety net, not removed.

### ⚠️ Lesson learned: closed pre-release train

First upload attempt at build `1.0 (3)` failed: *"Invalid Pre-Release Train. The train version '1.0' is closed for new build submissions"* — **once a version is approved and released, Apple permanently closes it to further build uploads.** Bumping only the Xcode Build number isn't enough for any future update; the marketing **Version** number itself must increase too (e.g. `1.0` → `1.0.1`), and a **new version must be created in App Store Connect** (the "+ VERSION" button) before a build can be attached to it. Build numbers reset fine per-version (went back to `1` for `1.0.1`) — they only need to be unique within each version, not globally.

Fixed: Version bumped to `1.0.1`, Build to `1`, re-archived, uploaded successfully, new `1.0.1` version created in App Store Connect, build attached, submitted for review.

**Next time you ship an update:** always bump the Version field in Xcode (not just Build), and expect to create a new version entry in App Store Connect first.

## Round 2 — Guideline 2.1 response (2026-09-22), approved (2026-09-25)

Build `1.0 (1)` (Sign in with Apple + UIScene fix) got a **Guideline 2.1 "Information Needed"** response requiring Report + Block in pod chat (Guideline 1.2). Built that, fixed two pre-existing bugs it exposed, uploaded build `1.0 (2)`, replied to Apple's message and resubmitted. Jorge recorded the demo on his iPhone via TestFlight and attached it to the reply. Approved ~3 days later, no further questions from Apple.

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
