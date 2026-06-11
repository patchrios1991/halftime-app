# HalfTime — Store Listing Kit

Everything to paste into App Store Connect and Google Play Console.
Screenshots: `store/screenshots/iphone-6.7/` (Apple) and
`store/screenshots/android/` (Google). Feature graphic:
`store/feature-graphic-1024x500.png`. Reviewer demo credentials:
`HalfTime\keys\app-review-demo-account.txt` (NOT in this repo).

---

## Apple App Store

| Field | Value | Limit |
|---|---|---|
| Name | `HalfTime — Season Ticket Pods` | 30 |
| Subtitle | `Split season tickets together` | 30 |
| Category | Sports (secondary: Lifestyle) | |
| Keywords | `season tickets,split,share,pods,resale,escrow,co-own,sports,games,trade,NBA,MLB,NFL,NHL` | 100 |
| Support URL | `https://www.halftime-app.com` | |
| Marketing URL | `https://www.halftime-app.com` | |
| Privacy Policy URL | `https://app.halftime-app.com/privacy` | |

**Promotional text** (170, can change without review):

> Season tickets are expensive. Friends make them affordable. Start a pod, split the cost, and never let a seat go empty.

**Description:**

> Season tickets are amazing — until you do the math. Eighty-plus games, thousands of dollars, and a calendar that fights back. HalfTime fixes the math.
>
> Start a pod with friends (or join one), split the cost of season tickets, and share the games. Our allocation engine distributes games fairly based on everyone's share and preferences — no spreadsheets, no group-chat arguments.
>
> CAN'T MAKE A GAME?
> List it on your pod's resale marketplace in seconds, or trade games with podmates with instant settlement.
>
> BUILT-IN PROTECTION
> Every pod is backed by Stripe-secured escrow. Funds stay protected until your pod is fully committed — nobody gets left holding the bag.
>
> HOW IT WORKS
> 1. Start or join a pod for your team
> 2. Everyone funds their share into escrow
> 3. Games are allocated fairly across the pod
> 4. Go to your games — trade or resell the rest
>
> WHAT YOU GET
> • Fair, preference-aware game allocation
> • In-pod resale marketplace
> • Game trading with podmates
> • Stripe-secured escrow protection
> • Guest passes for friends and family
> • Works for NBA, MLB, NFL, NHL, MLS, college and more
>
> HalfTime is currently in invite-based early access. Request access in the app and we'll reach out.

**App Review notes** (paste into "Notes" + sign-in info from the keys file):

> New accounts require approval (invite-based early access), so please use the provided demo account — it is pre-approved and belongs to a demo pod with allocated games, so all features are visible. Payments use Stripe; the demo pod's escrow is already funded, so no real payment is needed for review. Account deletion is available in Profile → Delete my account.

---

## Google Play

| Field | Value | Limit |
|---|---|---|
| App name | `HalfTime — Season Ticket Pods` | 30 |
| Short description | `Co-own season tickets — split costs, share games, resell what you can't use.` | 80 |
| Category | Sports | |
| Email | `support@halftime-app.com` | |
| Website | `https://www.halftime-app.com` | |
| Privacy policy | `https://app.halftime-app.com/privacy` | |

**Full description:** same as the Apple description above.

**App access** (Play requires this because of the approval gate): declare
"All or some functionality is restricted" and add the demo credentials
from the keys file with the note that new sign-ups require approval.

**Content rating questionnaire:** no violence/sexual content/profanity;
app facilitates real-money transactions between users (ticket
resale/escrow) — answer "Yes" to user-to-user money exchange where asked.
Expected rating: Everyone / PEGI 3 with a "users can spend money" notice.

**Data safety:** see `PRIVACY-LABELS.md`.

---

## Both stores — boring facts

- App ID / package: `com.halftimeapp.app`
- Fees disclosed in-app: 3% escrow fee, 8% resale fee
- Sign-in methods: email/password, magic link, Google OAuth
- Account deletion: in-app (Profile → Delete my account)
- Demo account: see `HalfTime\keys\app-review-demo-account.txt`
