# Decision 009 — Desktop Platform, Shared Codebase, and Multi-Provider Auth

**Date:** 2026-09-28
**Status:** Decided — confirmed directly by Jethro in session

---

## Decision

Belific expands beyond iOS to a Windows desktop app, sharing one account
and one dataset via Supabase. This is not a second product, it's the same
app, same codebase, rendered differently at different widths. macOS and
Android are explicitly future, not now. Sign in with Apple stays exactly
as it is on iOS; Google sign-in is added specifically to cover Windows
(and optionally as a second choice on iOS), rather than replacing Apple
anywhere.

## Reason

Jethro wants his own iPhone and Windows desktop to share the same tasks,
routines, and brain dump, which requires an account and sync, a real
change from mobile's current "account is fully optional" framing
(decision 006). Windows is also where he wants to build features first,
citing monday.com as the model, on the theory that a wide desktop canvas
is easier to design for than a 390px phone, then simplify down to mobile.

## What's in scope

- **One shared UI codebase.** Expo already supports a web build of the
  existing mobile codebase (`expo export --platform web`). The Windows
  desktop app is that web build wrapped in Electron or Tauri as an
  installable app, not a separate frontend maintained by hand. Some
  components render richer/differently past a desktop breakpoint (the
  three-pane workspace below has no phone equivalent), that's ordinary
  responsive scoping within one codebase, not a fork.
- **Auth: Apple stays, Google is added.** Sign in with Apple remains
  exactly as built on iOS — required there per App Store guideline 4.8
  once any other third-party sign-in exists in the app, and already the
  easiest option for an iPhone user regardless. Google OAuth is added to
  cover Windows (where Apple's only option is an awkward web redirect)
  and is also offered as a second choice on iOS for anyone who'd rather
  not use an Apple ID. Same Supabase-backed account either way.
- **Account required for sync, optional for local-only use.** A
  single-device user (phone only, or desktop only) never needs an
  account, same as today. An account is what makes the same data appear
  on both iPhone and Windows. Once synced, the phone keeps working
  offline from its local cache — sync requires an account, offline access
  to already-synced data does not require a connection.
- **Platform sequencing.** Windows and iOS first. macOS and Android follow
  once Jethro is happy with both of the first two — not promised on the
  landing page until they're real.
- **Desktop home screen — a three-pane workspace, not a Today dashboard.**
  Left: Brain Dump (capture, unchanged). Centre: a weekly kanban, tasks
  sit on the day they're assigned to (the existing "Plan" concept from
  `DESIGN_VISION.md` §2, drawn as columns instead of a phone segmented
  control). Right: Timebox, drag a task from a day column onto an hour.
  Capture → plan → place, the same pipeline already in `DESIGN_VISION.md`,
  three panes at once instead of three phone screens in sequence.
- **Pane scroll behaviour (desktop only).** The centre kanban scrolls
  horizontally across days; the brain dump and timebox panes scroll
  vertically, matching the shape of what each pane actually holds. Inside
  the kanban, each day column has its own native vertical scroll for a
  long task list; a board-level wheel handler redirects vertical mouse
  wheel motion into horizontal scroll across days once a column has no
  more vertical room, or the cursor is over a header/gap rather than a
  scrollable list — the same interaction Trello-style kanban boards
  already use, not a new invention. Ten or so lines of one hook, not a
  library. Irrelevant to mobile, which has no mouse wheel and keeps its
  own native touch scroll per screen.
- **Timebox date control (desktop).** Prev/next day arrows, plus clicking
  the date opens a calendar dropdown to jump to an arbitrary day. Additive
  to the paging behaviour already in `TIMEBOX_AND_NAV_SPEC.md`, not a
  replacement.
- **Top bar layout (desktop).** Brand mark/wordmark top-left. User
  profile top-right, opening a hub: account status, Settings, Vacation
  mode, the streak-milestone log, and label/category management. The
  Genshin-style quest/routine badge (§3 of `ROUTINE_GAMIFICATION_SPEC.md`,
  as already amended) sits with the profile cluster on the right, not with
  the logo on the left — it's part of "status about you," not branding.

  **Superseded in part (2026-09-30):** this single-hub sketch was
  refined into two separate dropdowns (Quests, Profile) plus three real
  standalone pages (Labels, Settings, Progress). See
  `docs/DESKTOP_HOME_NAV_SPEC.md` for the structure that actually governs
  the top bar now; treat this bullet as historical context only.
- **Mobile keeps a bare Settings gear.** The fuller profile hub is
  desktop-only. Mobile's nav does not change shape to match desktop; it
  stays the simpler, one-screen-at-a-time version on purpose, per the
  existing 390px constraint already documented.
- **First-run content.** Jethro's own account gets his real schedule
  seeded directly (already possible via the existing mobile "Load My
  Schedule" hidden mechanism, or a direct one-time seed into his Supabase
  account — sync means it only needs seeding once, it then shows up on
  both platforms automatically). A brand-new user account instead gets
  clearly-marked example content (sample tasks/routines they can delete),
  not a blank screen, so the app isn't confusing on first open.

## What's explicitly NOT in scope (yet)

- macOS and Android builds — parked until Windows and iOS are both in a
  state Jethro is happy with, not committed to a timeline yet.
- Dropping or replacing Sign in with Apple on iOS — not happening, both
  for the App Store rule and because it's already the best option there.
- Any change to mobile's nav shape or a desktop-style profile hub on
  mobile — mobile stays the simple, sequential version.
- A fully separate desktop-only codebase — the shared-codebase approach
  above is the committed direction, not one option among several.

## Related Notes
- [[design-identity]]
- [[docs/DESIGN_VISION]] — capture/plan/place pipeline this reuses
- [[docs/decisions/006-optional-accounts-reverses-003]] — the account
  model this extends (still opt-in for single-device use)
- [[docs/ROUTINE_GAMIFICATION_SPEC]] — the badge this top bar hosts
- [[docs/decisions/008-louder-gamification-visual-override]]
