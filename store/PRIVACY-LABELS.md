# Privacy questionnaire answers (Apple nutrition labels + Google Data safety)

Grounded in what the app actually does as of June 2026:
- Supabase auth + database (name, email, user id, pod/game data)
- Stripe for escrow payments and resale payouts (card details go straight
  to Stripe — the app never sees or stores card numbers; we store Stripe
  customer/account IDs and payment status)
- Resend for transactional email
- NO analytics SDK, NO ads, NO third-party tracking, NO location access

---

## Apple — App Privacy (nutrition labels)

**Does this app track users?** → **No** (no cross-app tracking, no ads).

**Data types collected:**

| Data type | Collected? | Linked to identity? | Used for tracking? | Purpose |
|---|---|---|---|---|
| Contact Info → Name | Yes | Yes | No | App Functionality |
| Contact Info → Email Address | Yes | Yes | No | App Functionality |
| Identifiers → User ID | Yes | Yes | No | App Functionality |
| Financial Info → Purchase History | Yes | Yes | No | App Functionality |
| Financial Info → Payment Info | **No** — handled entirely by Stripe; app never receives card numbers | | | |
| User Content → Other (pod messages) | Yes | Yes | No | App Functionality |
| Location, Health, Browsing, Search, Contacts, Photos, Audio, Diagnostics, Usage Data | No | | | |

Declare everything as "collected" (it lives in our database), nothing as
"used to track you".

---

## Google Play — Data safety

**Does your app collect or share any of the required user data types?** → Yes (collect), **No sharing** with third parties for their own use (Stripe/Supabase/Resend are service providers acting on our behalf).

| Question | Answer |
|---|---|
| Data encrypted in transit | Yes (HTTPS everywhere) |
| Can users request data deletion | Yes — in-app deletion (Profile → Delete my account) |
| Deletion URL (if asked) | https://app.halftime-app.com (sign in → Profile → Delete my account) |
| Committed to Play Families policy | N/A (not a kids app) |

**Collected data types:**

| Category | Type | Required/Optional | Purpose |
|---|---|---|---|
| Personal info | Name | Required | Account management, app functionality |
| Personal info | Email address | Required | Account management, app functionality |
| Personal info | User IDs | Required | Account management |
| Financial info | Purchase history | Required | App functionality |
| Financial info | User payment info | **Not collected** (processed by Stripe, never stored by app) |
| Messages | Other in-app messages (pod chat) | Optional | App functionality |
| App activity / App info / Device IDs / Location / Photos / Audio / Health / Contacts / Calendar / Files | Not collected | | |

**Notes for honesty under audit:**
- Push subscriptions store a browser/device push endpoint (treat as
  "Device or other IDs" → if Google's reviewer asks, declare Device IDs,
  purpose App Functionality; currently web-push only).
- If an analytics SDK is ever added, both questionnaires must be redone.
