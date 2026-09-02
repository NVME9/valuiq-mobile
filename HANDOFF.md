# ValuIQ — Handoff

Last updated: 2026-09-01. Written so a fresh session (human or Claude Code) can pick up
without re-deriving context from scratch.

## Current committed state

- **valuiq-mobile** HEAD: `1bf90ef` (branch `main`, tracks `origin/main`, in sync)
  — feat: profile photo — upload/remove, Profile card + header, dedicated avatar cache,
  ValuIQ-logo placeholder (never generic icon); avatar polish
- **deal-ai-pro** HEAD: `af4398f` (clean, no uncommitted changes)
  — db: handle_new_user trigger — auto-create user_profiles row on signup (root-cause fix
  for profile drift)

### Uncommitted right now (valuiq-mobile) — DO NOT COMMIT YET, awaiting visual verification

The in-flight header-logo work (see "IN-FLIGHT" below) is staged but explicitly held back
from commit until the look is confirmed on-device via OTA + BUILD_TAG check:

- Modified: `src/components/UserAvatar.tsx`, `src/screens/DashboardScreen.tsx`,
  `src/screens/ProfileScreen.tsx` (BUILD_TAG bump)
- New (untracked): `src/components/HeaderLogo.tsx`, `src/components/ScannerMark.tsx`

Once the look is confirmed and the sweep (below) is done, commit everything together.

## What's DONE (shipped + committed)

- **Profile photo feature**: upload/remove, rendered on the Profile card + app header,
  dedicated avatar image cache, ValuIQ-logo brand-mark placeholder (never the generic
  person-silhouette icon) when no photo/emoji is set.
- **Live metrics**: web `admin-metrics.html` Profiles view — all 43 users, avatars/photos/
  email/stats — served via `/api/admin?view=profiles` (deal-ai-pro).
- **Data integrity**: `user_profiles` backfill migration (one-time, closed a gap where 20 of
  43 `auth.users` had no profile row) + `handle_new_user` auth trigger going forward (every
  new signup, any auth path, gets a `user_profiles` row atomically at signup time — no more
  reliance on lazy create-on-first-GET).
- **Full stabilization history**: OTA force-apply + build stamp verification, no-blocking-
  render cold start, nav cache-first speed, launch routing (existing users → Home), session-
  preserve on reload, honest loss handling (`isLoss` re-derived from `net_profit`, heals
  stale cache), wins filter, `is_public` toggle, dev tools gated to owner, plan badge copy,
  community flip fixes, cache keyed on stable user id (not access token — token refresh no
  longer empties cache), `getWinsSummary` null-safe, profile `save()` uses PATCH with
  correct body shape + checks success (honest failure alert instead of fake "saved").

## IN-FLIGHT (the logo standardization)

Unifying the app around one scanner-frame ValuIQ mark. Went through several rejected
directions before landing on the current approach — worth knowing so it isn't re-litigated:

1. Bare mark, no frame — **rejected** (didn't read as intentional at header size).
2. Framed mark in a bordered rounded-square (matching onboarding's `iconWrap`/`iconBg`
   chrome) — **rejected** (Option A wasn't what was wanted).
3. Circular ring + corner brackets as a NEW standalone composition — **rejected**: read as
   "a bare square/bracket shape," and didn't actually match the real avatar (which at the
   time had no brackets in it at all — that was a false premise to fix, not a bug in the
   new component).
4. **Current / accepted direction**: a single shared component, `ScannerMark.tsx` —
   circular green ring (2px border) + 4 L-shaped corner brackets inset *inside* the ring's
   edge (so nothing gets clipped by a circular `overflow:hidden` wrapper) + the `ValuIQLogo`
   checkmark centered inside. `HeaderLogo.tsx` renders it beside `<Wordmark/>`. `UserAvatar`'s
   no-photo/no-emoji fallback was updated to render the *same* `ScannerMark` component (not a
   lookalike) — so the header logo and the avatar placeholder are now genuinely identical,
   just at different sizes. BUILD_TAG bumped to `2026-08-31.21` for this.

**Applied to Dashboard only** (`DashboardScreen.tsx:224`, via `<HeaderLogo textStyle=.../>`)
— staged, uncommitted, awaiting your on-device confirmation via OTA before sweeping further.

**NEEDS SWEEP** to all 19 other header call sites once the look is confirmed. Full audit
(old pattern: `<View style={s.logoIcon}><Text style={s.logoIconText}>V</Text></View>` next
to `<Wordmark/>` or a plain title `<Text>`):

| # | File | Line | Notes |
|---|------|------|-------|
| 1 | `src/screens/ArbitrageScreen.tsx` | 40 | |
| 2 | `src/screens/CommunityScreen.tsx` | 97 | |
| 3 | `src/screens/InventoryScreen.tsx` | 85 | title is `"Inventory"` text, not `<Wordmark/>` — check swap still reads right |
| 4 | `src/screens/ImportSalesScreen.tsx` | 70 | 2nd header in same file, see #5 |
| 5 | `src/screens/ImportSalesScreen.tsx` | 177 | |
| 6 | `src/screens/LoginScreen.tsx` | 246 | multi-line JSX (not single-line like the rest) |
| 7 | `src/screens/ProfileScreen.tsx` | 475 | |
| 8 | `src/screens/RelisterScreen.tsx` | 59 | |
| 9 | `src/screens/SourcingAlertsScreen.tsx` | 62 | |
| 10 | `src/screens/ScannerScreen.tsx` | 293 | 4 separate header instances in this file (multi-step flow) |
| 11 | `src/screens/ScannerScreen.tsx` | 352 | |
| 12 | `src/screens/ScannerScreen.tsx` | 566 | |
| 13 | `src/screens/ScannerScreen.tsx` | 924 | |
| 14 | `src/screens/ThriftRunScreen.tsx` | 128 | |
| 15 | `src/screens/ThriftRunScreen.tsx` | 174 | |
| 16 | `src/screens/SpecialtyScreen.tsx` | 205 | 3 separate header instances (multi-step flow) |
| 17 | `src/screens/SpecialtyScreen.tsx` | 323 | |
| 18 | `src/screens/SpecialtyScreen.tsx` | 515 | |
| 19 | `src/screens/ProfitTrackerScreen.tsx` | 36 | title is `"Profit Tracker"` text, not `<Wordmark/>` |

Also note: `ScannerScreen.tsx` has 2 more header-ish sites (lines ~1027, ~1070) using a
`camLogoBadge` + bare `<Wordmark/>` with NO V icon at all (camera overlay top bar) — not part
of the 19-count audit above since there's no old V-box to replace, but flag for a look during
the sweep in case it should also pick up the `HeaderLogo`/`ScannerMark` treatment for
consistency.

Sweep is intended to be a clean one-line-per-screen swap: replace the `logoRow`/`logoIcon`/
`logoIconText`/`Wordmark` (or bare-title) block with `<HeaderLogo textStyle={s.logoText}/>` (or
whatever the local text-style name is), then remove the now-dead `logoIcon`/`logoIconText`
style entries per file (same cleanup done in `DashboardScreen.tsx`).

## QUEUED (visual-identity pass + more)

- Sweep the confirmed `HeaderLogo` to all 18 remaining call sites (19 minus Dashboard) +
  fix the splash hybrid (`App.tsx`).
- Intro/onboarding page fix: subtitle trailing-comma/cutoff, feature-row emoji clipping, and
  decide if `OnboardingScreen` is the right screen vs. a scanner-frame value screen.
- Win/share cards (`src/components/FlexRevealCard.tsx`, also `ProfitFlexHero.tsx`,
  `WinsDemoCard.tsx`) — apply the scanner-frame identity; this is the marketing surface
  (shared externally).
- Screen styling coherence — Dashboard feature cards etc. → scanner-frame look.
- `getvaluiq.com` website overhaul (top of funnel, currently blocks outreach) — needs the
  scanner-frame identity, real-data wedge, flip examples, download CTA.
- Outreach plan/overhaul (after site + app are polished).

## DEFERRED — needs a NATIVE REBUILD (`eas build`, not OTA)

- `expo-image` — kills the avatar cold-start flash for real (current OTA-only mitigation is
  a fast, branded placeholder, not a true fix — see `UserAvatar.tsx` comments).
- Any other native-only fixes that accumulate in the meantime. Batch these — doing ONE
  native rebuild clears the whole backlog at once rather than rebuilding per-fix.

## KEY TECHNICAL FACTS / working rules

- **OTA-only** via `eas update --branch production`; verify EVERY deploy via the BUILD_TAG
  stamp at the bottom of Profile (owner-gated, see `ProfileScreen.tsx` `BUILD_TAG` const).
  Current tag: `2026-08-31.21`.
- **Backend** deploys via `vercel --prod` (deal-ai-pro), needs
  `NODE_OPTIONS="--use-system-ca"`.
- **COMMIT after every verified change** — uncommitted hot-pushes caused a bad night once;
  always commit what's actually deployed. This is why the current header-logo work is
  staged-but-uncommitted: it's deployed via OTA for visual review, not yet confirmed, so not
  yet committed.
- Owner-gated dev tools + build stamp on Profile via `OWNER_EMAILS`.
- Supabase: `Avatars` bucket (capital A, public), `avatar_url` column, `handle_new_user`
  trigger (auto-creates `user_profiles` row at signup — see deal-ai-pro
  `supabase/migrations/handle_new_user_trigger.sql`).
- Known non-blocking issues:
  - `user_profiles.total_scans` cached stat can drift — the Users block's own scan counts
    are the authoritative source, not this cached column.
  - Profile-tab backend is somewhat slow.
  - Cold-start avatar shows the branded `ScannerMark` placeholder briefly before the real
    photo/emoji hydrates from cache — this is the OTA ceiling; the native rebuild (above)
    fixes it for good via `expo-image`.

## WORKING DISCIPLINE that's proven to work

- Read-only diagnosis before building.
- Verify against the BUILD_TAG stamp before trusting that a change actually shipped.
- Commit after verify, not before.
- One coherent change at a time — don't bundle unrelated fixes into one OTA/commit.
- Screenshots are the only view of the running app — inspect them fully before declaring a
  visual change correct.
