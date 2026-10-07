# App Store Submission Status

**Last updated:** 2026-10-06
**Branch:** `claude/elegant-hamilton-2x8akp` (merged into `master` as of 2026-09-29, again as of 2026-09-30 for Round 5, again as of 2026-10-02 for Round 7's escrow-payment fix via a targeted cherry-pick, and fully merged as of 2026-10-06 — everything through the 1.0.6 punch list, including Round 6, is now on `master` too)
**Status: Version 1.0.5 (the escrow-payment fix) is APPROVED and LIVE.** **Version 1.0.6 was submitted to Apple on 2026-10-06 and is currently in review** — contains push notifications (Round 6), the Browse Pods Standard/Group Buy wizard, the pod member cap race-condition fix, standard-pod captain funding exemption, and the ESPN schedule-import fixes (full detail in the 1.0.6 punch list and Round 6 sections below).

## 1.0.7 backlog — noted 2026-10-06/07, not started

1. **Standard pods should require receipt verification BEFORE the pod is open for others to join**, not just before the captain is excused from funding (that part is what 1.0.6 item 4 already does — see below). Right now a captain can create a Standard pod and have it immediately visible/joinable in Browse Pods with zero proof they actually own the tickets — the existing `receipt_verified` gate (admin-reviewed in BetaDashboard, same mechanism 1.0.6 item 4 relies on) only currently affects the captain's own funding exemption, not whether the pod can recruit members at all. User's ask: members shouldn't be able to join (or a pod shouldn't even be listed/joinable in Browse Pods) until the captain's receipt has been verified. Needs a look at `createPod()`/`CreatePodScreen.jsx` (does a Standard pod default to `status: 'recruiting'` immediately on creation, with no gate?), `getRecruitingPods()` in `src/api/pods.js` (would need to also filter out unverified Standard pods), and `joinPod()` (would need a receipt-verified check alongside the existing `status === 'recruiting'` check) — plus RLS on `pods`/`pod_members` insert policies, which currently don't reference `receipt_verified` at all. Likely also needs UI on `CreatePodScreen.jsx` so a captain understands their pod won't be visible to others until receipt review clears (today the receipt upload happens but nothing visibly blocks recruiting in the meantime).
2. **Schedule-import search placeholder is a hardcoded, sport-irrelevant example.** `AllocationScreen.jsx` line 410, the "Fetch schedule from ESPN" search input always shows the static placeholder `"Search team (e.g. Chicago Bulls)"` — same text regardless of which sport the pod is (NCAA football, baseball, etc.), which reads as confusing/wrong when it's clearly not an NBA pod. Fix: just remove the `(e.g. Chicago Bulls)` example text and leave a plain greyed-out `"Search team"` placeholder (or, if worth the extra effort later, make it dynamic per sport — but user's ask was specifically to just remove the example, not necessarily replace it with something sport-aware).
3. **Automate receipt/identity verification instead of 100% manual admin review — bigger design item, not a quick fix.** Every Standard-pod receipt is currently reviewed by hand by Jorge in BetaDashboard (`handleReceiptVerify`/`handleReceiptReject`) — works fine at today's scale but doesn't scale, and makes Jorge a single point of failure/bottleneck for every new pod going live as volume grows. There's already a directly reusable pattern to build on: `supabase/functions/verify-tickets/index.ts` already does AI-assisted verification for Group Buy ticket-availability screenshots via Claude Vision (`action: "screenshot"` sends the image to Anthropic's API and stores a verdict in `screenshot_ai_status`/`screenshot_ai_note`). The natural extension: a similar Claude Vision pass over uploaded season-ticket purchase receipts, auto-approving the clear-cut cases (receipt clearly shows the right team/venue/season and a real purchase) and only escalating ambiguous ones to Jorge for manual review — same trust model, far less manual load. Needs real design/scoping before implementation: what counts as "clear-cut" vs. "escalate," what the receipt upload UX should look like if there's now an auto-pending state, and whether to keep manual review as a mandatory secondary check at least during early scale-up.
4. **24-hour member funding deadline + auto-promoted waitlist — bigger design item, two features that share one mechanism.** Confirmed current behavior by reading the code (answered for the user 2026-10-07): the member cap (`joinPod()` + migration 044's trigger) is pure headcount, with no regard for funding status, and there's no timeout/expiration on unfunded members at all today — if the first N people who join never fund, their spots stay locked forever and nobody else can ever join, with no automatic recovery. User's ask, two parts (deadline changed from an initial 48h to **24h** per user, 2026-10-07):
   - **Part A — 24-hour funding deadline:** a member (not the captain) who joins and doesn't fund their escrow share within 24 hours of `joined_at` gets automatically removed, freeing their spot.
   - **Part B — auto-promoted waitlist:** once a pod is at headcount capacity, further people can still join as **waitlisted** (a real authenticated join, not the existing anonymous email-capture `pod_waitlist`/`joinWaitlist()` table — that one has no account linkage and no promotion logic, it's just "captain gets notified, reach out manually," a different and much shallower thing). If an active member gets removed per Part A, the longest-waiting waitlisted person should automatically become a real active member (and then get their own fresh 24-hour deadline).
   - **No existing enforcement mechanism to build this on, but a very close existing precedent + gap:** Group Buy pods already set a conceptually identical `purchase_deadline` (48h for the captain to buy tickets after full funding, `stripe-webhook/index.ts`) — but nothing in the codebase ever actually checks or acts on that deadline once set; it's a pre-existing silent gap, not something this feature can just call into. The right building block for *both* this new feature and that existing gap is a scheduled Edge Function on a `pg_cron` schedule — the app already has exactly that pattern for `weekly-digest` (`supabase/migrations/029_weekly_digest_cron.sql`). Worth fixing both with the same mechanism rather than twice.
   - **Open design questions for whoever picks this up:** does `pod_members` need a new column (e.g. `is_waitlisted`) and should the cap-check trigger (044) be updated to allow inserts past `max_members` when `is_waitlisted = true`? How is a waitlisted member's `share_pct`/`cost` computed given it depends on `remainingSpots` at *promotion* time, not join time? Does Part A apply to Group Buy pods too, or just Standard (a Group Buy member not funding has different downstream effects — it blocks the captain's purchase deadline entirely, not just one seat)? What does the waitlisted-member's UI look like in `PodScreen.jsx`/`BrowsePodsScreen.jsx` (a pod that's "full" to a browser but still shows a "Join Waitlist" option, versus the existing Join Pod button)?

## 1.0.6 punch list — decided 2026-10-06

User's explicit direction: don't ship fixes piecemeal anymore — gather everything below, fix it all, and ship it together as **version 1.0.6**. Do not submit a new build until this whole list is done and confirmed.

1. ✅ **Push notifications** — DONE, confirmed working on-device 2026-10-06. See Round 6 below.
2. ✅ **Browse Open Pods Standard vs. Group Buy split, filter reordering, and type badges — DONE, confirmed working on-device 2026-10-06 (`acfb1a7`).** Items 2/5/6 turned out to be one feature. The `pod_type` field already existed in the data model (migration 022, `'standard'`/`'group_buy'`, default `'standard'`) and was already partially used (a Group Buy badge/info box existed, but nothing forced a type choice and Standard pods got no badge at all). `BrowsePodsScreen.jsx` rewritten: entering Browse Pods now shows a **type step** (Standard vs. Group Buy, with live counts) → a **sport step** scoped to that type (with per-sport counts) → the existing filterable list (search/cost/spots), now scoped to both, with a "Change" control to jump back to the type step. Header back arrow steps back through the wizard instead of exiting straight out. Pod cards and the detail sheet show a "🧾 Standard" badge/info box symmetric to the existing "🛒 Group Buy" one.
3. ✅ **Pod member cap race condition — DONE, migration applied and confirmed working on-device 2026-10-06 (`d3403a5`).** Root cause was a race condition, not a funding-status bug: `joinPod()` (`src/api/pods.js`) checks capacity via a separate SELECT-then-INSERT with no atomicity, and the `pod_members` INSERT RLS policy never checked capacity at all — only that the row belongs to the caller and the pod is still recruiting. Two people joining within a few hundred ms of each other could both read the same stale member count and both insert. Fixed with `supabase/migrations/044_pod_member_cap_trigger.sql` — a `BEFORE INSERT` trigger that locks the pod row before counting, serializing concurrent joins instead of letting them race (needs `security definer` since a first-time joiner isn't covered by the `pod_members` SELECT RLS policy yet, which would otherwise make the trigger always read 0 members for exactly the case it exists to catch). Migration run via Supabase SQL Editor; captain pod creation and normal member joining both confirmed still working. The race case itself (two simultaneous joins) wasn't reproduced on demand — the fix is a database-level atomicity guarantee, not something that needed its own demonstration.
4. ✅ **Standard pods don't require captain self-funding once verified — DONE, confirmed working on-device 2026-10-06 (`ba6ce8d`, migration `045`).** Decided with user: gated on receipt verification (admin manually confirms in BetaDashboard), not on `pod_type` alone — a captain can't dodge paying just by picking "Standard." Two layers: (1) `PodScreen.jsx` computes the exemption live from `pod_type` + `receipt_verified` — excludes the captain's share from the escrow total, hides their Fund button, shows a distinct "🧾 Already own tickets" badge instead of implying a card payment. (2) `supabase/migrations/045_standard_pod_captain_funding_exemption.sql` — a database trigger that turned out to be required, not optional: `stripe-webhook`'s escrow-deposit handler only auto-transitions a Standard pod to "active" and fires the automatic payout once **every** `pod_members` row has `escrow_funded = true` in the database — a client-only fix would have left that check permanently false for the captain's row, and the pod would never go active even after every other member genuinely paid. The trigger keeps the captain's real `escrow_funded` column in sync with receipt verification (reverting on rejection/reset, but only when no real Stripe payment exists for that row — never clobbers a real payment), plus a one-time backfill for pods already verified before the migration runs. `payout-pod` itself needed no changes — it only sums real succeeded `escrow_payments`, so the exemption (no real payment ever created for the captain) already correctly excludes them from the payout amount. Confirmed on-device: a verified Standard-pod captain shows "Funded" with no Fund button, correct $ share.
   - **Bonus fix found while testing this (`db791ac`):** nothing in the member roster showed who the captain was. Added a "👑 CAPTAIN" badge to the main member card and a 👑 suffix in the condensed Escrow tab list.
   - **Noted, not a bug in the new code:** the test pod used to verify this showed 3 members in a pod capped at 2, and share percentages that didn't add up to 100%. Confirmed with the user this is stale test data that predates the item-3 race-condition fix (migration 044 only prevents *new* overcapacity joins going forward, it doesn't retroactively repair pods already corrupted before the fix existed) — user confirmed it's just test data, left as-is.
5. ✅ **Schedule import (Miami Hurricanes / ESPN) — DONE, confirmed working on-device 2026-10-06.** Turned out to be two separate, unrelated bugs in `supabase/functions/fetch-schedule/index.ts`, found one after the other via the same console.error-then-redeploy-then-check-Logs method used throughout this round:
   - **Bug 1 (`244cf64`):** ESPN's CDN (Akamai) was returning a 403 "Access Denied" block page for every single request this function made — any sport, any team, not specific to Miami or college sports at all. Deno's `fetch()` sends no `User-Agent` by default, which got the request flagged as a bot at the CDN edge before ESPN's API ever saw it. Fixed by sending a realistic browser `User-Agent` + `Accept` header.
   - **Bug 2 (`c854341`):** once bug 1 was fixed, Miami (FL) Hurricanes still didn't show up searching "Miami" under NCAA Football, while Miami (OH) RedHawks did — both real FBS teams. The team-list fetch was hardcoded to `limit=200`, silently truncating ESPN's response before reaching some teams depending on ESPN's internal ordering; NCAA football/basketball have 200+ teams across divisions. Bumped to `limit=1000`.
   - Neither could be verified against live ESPN data from this sandbox (its network policy blocks outbound access to espn.com) — both were diagnosed from the real error/log text Jorge pulled from Supabase and fixed from that alone, then confirmed working by Jorge on-device.

### Build 1.0.6 (1) — submitted 2026-10-06, in Apple review

`claude/elegant-hamilton-2x8akp` → `master` merged 2026-10-06 (real merge commit `41761a9`, not a fast-forward — `master` had its own identity-verification cherry-pick commits that overlapped in content with the feature branch's originals; merged cleanly, verified with a clean `npm run build` before pushing). On Jorge's Mac: `git pull` → `npm install` → `npm run build:mobile` (clean) → Xcode: bumped Version `1.0.5` → `1.0.6`, Build → `1` → **Product → Archive** → **Distribute App → App Store Connect → Upload** → created version `1.0.6` in App Store Connect, attached the build, **Add for Review**. Now waiting on Apple, same as 1.0.5.

### Next steps for whoever picks this up
1. **Waiting on Apple's review of both 1.0.5 and 1.0.6.** Once 1.0.6 is approved/live, do a quick on-device sanity check of the big items (push notifications, Browse Pods wizard, pod joining) on the actual shipped build, though everything was already confirmed pre-submission.
2. **Android push notifications were deliberately deferred** (see Round 6 → Scope decision) — the app isn't on the Play Store yet, so there was no reason to double the external setup work. The code is already cross-platform-ready for whenever that becomes relevant.
3. No other open items from this session — the Miami Hurricanes schedule-import report and the "3rd member in a 2-person pod" report are both resolved and confirmed.

## Round 7 — Stripe escrow payments were completely broken in every shipped version, now fixed and confirmed on-device (2026-10-02)

User tried to fund their escrow portion for a pod and got a "Demo mode" screen instead of a real payment form. This escalated into discovering and fixing five separate, stacked issues before the real payment flow worked end-to-end. **Escrow payments never worked for any real user on the live App Store app, through versions 1.0, 1.0.1, 1.0.2, 1.0.3, and 1.0.4** — this was a pre-existing config gap, not a regression from any of those rounds.

**1. Stripe was never configured client-side.** `src/lib/stripe.js` gates the real payment form vs. "Demo mode" entirely on `!!import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY`. That var was never set in the `.env` file used for *any* build ever shipped — confirmed via `grep` on Jorge's Mac. Fixed by adding `VITE_STRIPE_PUBLISHABLE_KEY` (the publishable key, safe to handle directly) to `.env`.

**2. Adding that key broke sign-in entirely (both Apple and Google).** My mistake: appended the new line with `echo "..." >> .env`, and the existing file had no trailing newline, so the new line concatenated onto the end of `VITE_SUPABASE_ANON_KEY`'s value, corrupting it. Confirmed via Safari Web Inspector console: `AuthApiError: Invalid API key`, 401. Fixed with `cp .env .env.backup` then a `perl` one-liner to re-insert the missing newline before the new key. Clean afterward, sign-in worked again. **Lesson for next time: never bare `echo >>` into a file without first confirming it ends in a newline.**

**3. A second modal-clipping bug, missed in the original Round 4 sweep.** Same WebKit `position: fixed`-clipped-by-ancestor-`overflow` bug as Round 4 (see Round 4 item 2 below for the full root cause), found in `EscrowPaymentScreen.jsx`'s shared `Screen` modal shell — both the "Fund Escrow" confirm screen and the Stripe "Payment details" checkout screen were visibly cut off at the bottom. Missed originally because this file uses extra-padded alignment (`position:       "fixed",`) that didn't match the grep pattern used for the original sweep. Fixed the same way, with `createPortal(..., document.body)` (commit `936b5fa`). Re-swept all of `src/` afterward with a whitespace-tolerant regex (`position:\s*["']fixed["']`) to confirm nothing else was missed.

**4. Two separate Stripe accounts existed, and the keys didn't match.** Once the clipping was fixed, the Stripe form rendered but the "Pay" button did nothing — the `PaymentElement` was silently failing to initialize (400 error on Stripe's `sessions` endpoint, caught via Web Inspector console). Root cause: Jorge's Stripe login has two separate accounts — "Half Time Solutions, Inc." and "HalfTime" — and the frontend's publishable key (this round) belonged to one while the backend's `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` (configured months earlier, during unrelated testing) belonged to the other. A publishable key and secret key must belong to the same Stripe account to work together. Confirmed the backend secret itself was valid (just for the wrong account) via Supabase Edge Functions → `create-payment-intent` → **Invocations** tab (not the Logs tab, which only shows generic boot/shutdown noise) showing all 200 OK. Fixed by: confirming "Half Time Solutions, Inc." has the correct/matching publishable key, generating a fresh `STRIPE_SECRET_KEY` from that account and updating it in Supabase, creating a new Stripe webhook/event destination on that account (Stripe's newer "Create an event destination" UI) listening for the 5 events `stripe-webhook/index.ts` handles (`payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `identity.verification_session.verified`, `identity.verification_session.requires_input`), and updating `STRIPE_WEBHOOK_SECRET` to its signing secret.

**5. A stale `stripe_customer_id` cached from the old account.** Even with matching keys, funding still failed ("Edge Function returned a non-2xx status code"). `create-payment-intent/index.ts`'s `getOrCreateCustomer()` reuses a `stripe_customer_id` stored on the user's `profiles` row without validating it still exists in the *current* Stripe account — Jorge's profile had one cached from earlier testing under the old "HalfTime" account, which Stripe rejected once the backend pointed at "Half Time Solutions, Inc." Fixed with a one-time data cleanup, run by the user via Supabase SQL Editor (safe pre-launch, since the column just gets silently and correctly recreated on next use):
```sql
update public.profiles
set stripe_customer_id = null
where stripe_customer_id is not null;
```

**Confirmed: "it all worked"** — user re-tested Fund Escrow end-to-end after all five fixes and the real Stripe payment form rendered, accepted the card, and completed.

**No code changes needed for items 1, 2, 4, 5** — those were `.env`/dashboard config only. Only item 3 (`936b5fa`) touched code.

**Cherry-picked `936b5fa` to `master` on its own** (not a full branch merge) — `master` doesn't have Round 6's native push commits yet since that work is still untested, so a plain fast-forward would have dragged those in too.

**6. Identity verification was ALSO broken natively — turned out to be two separate bugs, not the same root cause as the payment fix.** A friend, then Jorge's wife, hit "Edge Function returned a non-2xx status code" tapping "Verify My Identity." Initially assumed to be the same Stripe-account-mismatch issue as items 4/5 (reasonable guess — same `STRIPE_SECRET_KEY`, tested before that secret was corrected) — **that guess was wrong.** Diagnosed properly by adding a `console.error` to `create-identity-session`'s catch block (commit `3f056f8`), deploying with `npx supabase functions deploy create-identity-session --project-ref ewcipqfcqyoqtpqzoazx`, and reading the real error from the Supabase Logs tab. Two distinct causes, found one after the other:
   - **Code bug (`url_invalid`):** `create-identity-session` built Stripe's required `return_url` from the request's `Origin` header. That works on web, but inside the native app's Capacitor WebView, `Origin` is `capacitor://localhost` — not a valid URL, which Stripe rejected outright. Fixed (commit `dc10846`) by switching to a fixed `APP_URL` env var + `/auth/callback` (a registered Universal Link, already handled by the native deep-link listener) — the same pattern already proven working in `create-connect-account`. Backend-only, deployed via the Supabase CLI, no app rebuild needed.
   - **Stripe account gate (`identity_api_invalid_application`):** once the URL bug was fixed, a second error surfaced — Stripe Identity is a separate product that has to be explicitly applied for/activated per account (unlike standard card payments), and "Half Time Solutions, Inc." had never completed that. Fixed by Jorge completing Stripe's one-time "Get started with Stripe Identity" application (use case: Trust & Safety + Fraud Prevention, not a restricted business) and the required "Verify your identity" step (Jorge verifying himself as account owner) in the Stripe Dashboard.
   - **Also found/fixed while in there:** the Stripe-hosted verification screen displayed "Jorge Rios" instead of "HalfTime" — Stripe's account-level public business name was set to Jorge's personal name. Updated in Stripe Dashboard → Settings → Business settings → Public details.

**Confirmed working on-device** — Jorge's wife completed identity verification successfully end-to-end after all of the above.

### Build 1.0.5 (1) — submitted 2026-10-02, APPROVED and LIVE

On Jorge's Mac: `git pull origin claude/elegant-hamilton-2x8akp` (commit `9ac6499`, includes `936b5fa`) → `npm install` → `npm run build:mobile` (clean) → Xcode: bumped Version `1.0.4` → `1.0.5`, Build → `1` → **Product → Archive** → **Distribute App → App Store Connect → Upload** → created version `1.0.5` in App Store Connect, attached the processed build, **Add for Review**. **Approved and live.**

**Everything found after this build was submitted (items 6's two bugs + the business name fix) was backend/dashboard-only** (Edge Function code deployed directly via Supabase CLI, Stripe Dashboard config) — no app rebuild required, so 1.0.5 doesn't need to be resubmitted for any of it; identity verification already works on 1.0.4 installs too.

### Next steps for whoever picks this up
1. **Waiting on Apple's review of 1.0.5.** Once approved/live, do a quick on-device sanity check of Fund Escrow on the actual shipped build (identity verification is already independently confirmed working, see item 6).
2. **Minor, non-blocking UI polish identified but not fixed:** the "Pay" button's background color only changes based on the `busy` state, not whether Stripe's `PaymentElement` is actually `ready` — so it can visually look enabled while still disabled, which was part of why the button seemed unresponsive before the real bugs were found. Confirm with the user before fixing, since it's cosmetic, not broken.
3. `.env.backup` exists on Jorge's Mac from the newline-corruption fix (gitignored, harmless) — no action needed, just noting it exists.
4. Round 6 (native push) is unaffected by any of this — still paused on external setup, NOT in 1.0.5, see below.
5. **Lesson for next time:** when a native-only bug returns a generic "Edge Function returned a non-2xx status code," don't assume it's the same root cause as a previous similar-looking error just because the symptom matches — add a `console.error` in the function's catch block, deploy with the Supabase CLI, and read the real error from the Logs tab before fixing anything. Two genuinely different bugs produced the identical generic client-side message here.

## Round 6 — native push notifications, DONE and confirmed working on-device (2026-10-01 → 2026-10-06)

User noticed push notifications don't work on the native app: no toggle in Profile, no entry in iOS Settings → Apps → HalfTime → Notifications, and the onboarding "Enable Notifications" prompt doesn't do anything real.

**Root cause:** the only existing push implementation (`push_subscriptions` table, migration 003) is the **Web Push API** — `Notification.requestPermission()` + a service worker + `PushManager` + VAPID keys. That only works in a real browser context. Capacitor's embedded WKWebView on iOS does not support the Web Push API, so the native app's permission prompt never actually registered with Apple's push system — confirmed by the fact that iOS never created a Notifications entry for the app (iOS only does that once an app registers through APNs, which nothing in the code ever did). Separately, `Onboarding.jsx` had its own second, smaller bug: it only ever called `Notification.requestPermission()` and threw away the result — it never completed a real subscription on *any* platform, including web.

**Fix (all code, committed `a115571`, pushed to the feature branch only):**
- Added `@capacitor-firebase/messaging` + `firebase` (peer dep needed for the plugin's web-platform bundle to build) to `package.json`.
- `supabase/migrations/043_device_push_tokens.sql` — new table for FCM registration tokens, separate from `push_subscriptions` (different shape: one opaque token vs. a Web Push endpoint/key pair). Not yet applied to the live database.
- `src/hooks/usePushSubscription.js` — rewritten to branch by `isNative`. Native path requests permission and registers through Firebase Cloud Messaging (which bridges to APNs on iOS, talks to FCM directly on Android — one unified token type for the backend), saving the token to `device_push_tokens`. Web path is the original, working Web Push code, left untouched. Same external interface either way, so `ProfileScreen.jsx` needed no changes.
- `src/pages/app/Onboarding.jsx` — replaced its broken local logic with the real shared hook, fixing the onboarding flow on *every* platform, not just native.
- `supabase/functions/send-push/index.ts` — now also sends to `device_push_tokens` via FCM's HTTP v1 API (OAuth2 access token minted from a Firebase service account via `google-auth-library`), alongside the existing Web Push sends. Either path is independently optional — if `FIREBASE_SERVICE_ACCOUNT_JSON` isn't set, native sends are skipped and web push keeps working exactly as before.
- `npm run build:mobile` verified clean, Capacitor correctly picked up the new plugin for both iOS and Android (SPM-compatible, matches the existing pattern).

**Scope decision:** Android is explicitly deferred — the app isn't on the Play Store yet, so there's no reason to double the external setup work right now. Everything below is iOS-only; the code itself is already cross-platform-ready (the `platform` column, the hook, the edge function all handle `'android'` too) for whenever that becomes relevant.

**Still NOT merged to `master`** — deliberately. Per the 2026-10-06 decision (see 1.0.6 punch list above), this stays on `claude/elegant-hamilton-2x8akp` until the rest of the 1.0.6 list is also done, then everything ships together in one submission.

### All setup steps complete, confirmed working on-device 2026-10-06

- ✅ **Step 1 (Firebase Console):** HalfTime Firebase project created (`halftime-64428`). iOS app registered with bundle ID `com.halftimeapp.app`. `GoogleService-Info.plist` downloaded and added to the Xcode project (`App` folder, App target membership checked).
- ✅ **Step 2 (Apple Developer Portal):** New APNs Auth Key created, named "HalfTime APNs Key" (separate from the existing Sign in with Apple key `638WXF48UD`). **Key ID: `7BWLN8BF8N`**.
  - **New Apple Developer UI note (didn't exist when this doc was first written):** Apple now requires choosing **Environment** (Sandbox / Production / **Sandbox & Production**) and **Key Restriction** (Team Scoped / Topic Scoped) when creating an APNs key, and this **cannot be changed after saving**. We chose **"Sandbox & Production"** and **"Team Scoped (All Topics)"**. If this key ever needs replacing, make the same choices again.
- ✅ **Step 3 (Firebase Console → Cloud Messaging):** Uploaded the `.p8` file to **both** the "Development APNs auth key" and "No production APNs auth key" slots for `com.halftimeapp.app` (Firebase keeps these as two separate upload slots even for a Sandbox & Production key). Team ID: `Y2Y42U7LZ6`.
- ✅ **Step 4 (Xcode):** `GoogleService-Info.plist` added to the project; **Push Notifications** capability added under Signing & Capabilities.
- ✅ **Step 5 (Firebase Console → Service Accounts):** Hit a blocker — "Key creation is not allowed on this service account... restricted by organization policies." The `halftime-app.com` Google Workspace organization has **"Disable service account key creation"** (`iam.managed.disableServiceAccountKeyCreation`) enforced by default org-wide. Fixed in **Google Cloud Console** (not Firebase) → IAM & Admin → **Organization Policies** → found that constraint (note: there are two — use the **Active** one, `iam.managed.disableServiceAccountKeyCreation`; the legacy `iam.disableServiceAccountKeyCreation` was already inactive) → **Manage policy** → **Override parent's policy** → added a rule with enforcement **Off**, scoped to the `halftime-64428` project only. Also hit a mixed-account mixup along the way: Jorge's default-signed-in Google account in Cloud Console wasn't the same one used to create the Firebase project — had to switch accounts, then switch the project-picker's organization filter from "No organization" to the actual `halftime-app.com` org before `halftime-64428` was even visible. Once the org policy was overridden, private key generation worked and downloaded the JSON file.
- ✅ **Step 6 (Supabase Dashboard):** `FIREBASE_SERVICE_ACCOUNT_JSON` added as an Edge Function secret (full JSON pasted as one value). `supabase/migrations/043_device_push_tokens.sql` run via SQL Editor.
- ✅ **Step 7 (Jorge's Mac):** `git pull` → `npm install` → `npm run build:mobile` (clean) → Xcode Run to device.
- **Step 8 (Test) — first attempt failed, real bug found and fixed:** tapping **Enable** on the Push Notifications card in Profile threw `The operation couldn't be completed. No APNS token specified before fetching FCM Token`. Not a timing fluke — `ios/App/App/AppDelegate.swift` never implemented `application(_:didRegisterForRemoteNotificationsWithDeviceToken:)` or the matching `didFailToRegisterForRemoteNotificationsWithError`, so when iOS called back after `UIApplication.registerForRemoteNotifications()` (which `@capacitor-firebase/messaging` calls on load), the callback had nowhere to go — Capacitor's bridge never posted `.capacitorDidRegisterForRemoteNotifications`, so the Firebase plugin never received an APNs token and `getToken()` failed every single time. **Fixed (`d645e0e`):** added both missing delegate methods, forwarding to `NotificationCenter` exactly like Capacitor's own core expects (same pattern already used for the existing URL-open/Universal-Link handlers in that file). Rebuilt via Xcode Run, confirmed: Enable toggle now works, **iOS Settings → Apps → HalfTime → Notifications now shows a real toggle** (previously never appeared, which was the original symptom that started this whole round), and a real push notification was successfully received on-device.
- **Step 9 (merge to master + ship):** deliberately **NOT done yet** — holding per the 2026-10-06 decision to bundle this with the rest of the 1.0.6 punch list before the next submission.

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
