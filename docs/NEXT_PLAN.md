# Belific — Plan for Claude Code (drafted by planning session, 2026-09-02)

**How to use this file:** this is a plan, not a narrative. It was written by a
separate Claude session acting as architect/planner after auditing the actual
repo state (git log, working tree, `sync.ts`, live Supabase project status).
Claude Code should execute it task by task, in priority order, checking off
acceptance criteria before moving on — not batch everything into one commit.

## Constraints that apply to every task below (non-negotiable, from Jethro)

1. Local USB/simulator builds only. **Never run `eas build`/`eas submit`/`eas
   update`** unless Jethro has explicitly said "ready for EAS build" in this
   session.
2. Every meaningful change bumps `mobile/app.json`'s `expo.version` and gets a
   dated entry in `docs/CHANGELOG.md`, in the same commit as the change.
3. No dark patterns: no streak-guilt, no fabricated urgency, no
   engagement-bait notifications, no fake progress. Any gamification must be
   honest and reversible. Decision 007 (2026-09-02) approves a specific,
   honest gamification design (streaks, vacation mode, an open-app status
   modal) — build exactly that, per `docs/ROUTINE_GAMIFICATION_SPEC.md`, and
   nothing beyond it (no loss-framing, no XP, no urgency notifications) — see
   P3 below.
4. Verify against actual code and a real build/device test — not memory, not
   "should work."
5. Never touch the Landis project or its Supabase instance (ref
   `vlogfwnmaqorhialcqbr`). Belific's Supabase project is a different ref
   (`uucycebkpgwbktdytxvr`) in the same org — double-check before any
   Supabase MCP/CLI call.
6. Full build gate before calling anything "done": `npx tsc --noEmit` + local
   Release build + real on-device test — especially for anything touching
   stored user data (this entire plan is sync/schema work, so this applies to
   every task here).

---

## P0 — Process-integrity fixes (small, safe, do first)

### P0.1 — Retroactively fix the version/changelog gap on commit `99852f3`
**Problem:** "Add optional notes field to Tasks" (`99852f3`, Aug 1) changed
`sync.ts`, `types.ts`, added a migration, and shipped a new synced field —
but never bumped `app.json` and never got a `CHANGELOG.md` entry. It's
already pushed to `origin/v2-redesign`, so this is not a rewrite-history
situation.

**Action:** new commit, not an amend:
- Bump `mobile/app.json` `expo.version` to `2.0.1` (patch — additive field,
  not a new architecture).
- Add a `## 2.0.1 — 2026-09-0x` entry to `docs/CHANGELOG.md` describing the
  Task notes field, written the way every other entry in that file is
  written (see the `2.0.0` entry's style/detail level).

**Acceptance criteria:** `expo.version` reads `2.0.1`; CHANGELOG has a dated
entry above `2.0.0`; `git log` shows this as its own scoped commit, not
folded into unrelated work.

### P0.2 — Annotate decision 003 instead of leaving it misleading
**Problem:** `docs/decisions/003-no-supabase.md` still reads `Status: Decided
— do not change`, but it has been partially reversed (accounts + sync,
v2.0.0) and the doc gives no indication of that. A future session reading
003 cold would be misled.

**Action:**
- Create `docs/decisions/006-optional-accounts-reverses-003.md` following the
  existing decision-doc format (see 001–005), documenting: what changed
  (optional accounts + Supabase sync, v2.0.0), why (see CHANGELOG 2.0.0
  entry), and explicitly that **local-only usage remains fully supported and
  unaffected** — this was optional, not a full reversal.
- Edit 003 to add one line under its header: `**Note:** partially superseded
  by [[006-optional-accounts-reverses-003]] — see that doc before assuming
  "no backend" still fully holds.` Do not rewrite 003's original body — it's
  a historical record of the original reasoning, which is still valid for
  why local-only remains the default.

**Acceptance criteria:** 003 is no longer misleading on its own; 006 exists
and cross-links back to 003; both follow the existing decisions/ format.

### P0.3 — Confirm the `add_task_notes` migration was actually applied remotely
**Problem:** `mobile/supabase/migrations/20260801004209_add_task_notes.sql`
exists locally, committed. Whether it was ever applied to the live Belific
Supabase project is unconfirmed — the project was found paused (see P1) and
a migrations query timed out.

**Action (only once Jethro confirms the Supabase project is resumed — see
below):** check applied migrations against local migration files for the
Belific project only (ref `uucycebkpgwbktdytxvr`). If `add_task_notes` is
missing remotely, apply it. Confirm the `tasks` table has a `notes` column
afterward.

**Acceptance criteria:** local migrations directory and remote applied-
migrations list match, confirmed by direct query, not assumption.

---

## P-NAV — Remove Focus/Pomodoro, restructure nav, build Timebox view

**Decided 2026-09-02.** Verified against the real repo: `focus.tsx` and its
`TimerSettings`/`TimerStore` state are isolated (only referenced by
`focus.tsx` and `settings.tsx`), not part of the 7 synced types — this has
**no Supabase/sync dependency**, unlike P1 and P3 §0. Do this now, while P1
waits on Jethro resuming Supabase — don't sit idle.

Full spec: `docs/TIMEBOX_AND_NAV_SPEC.md`. Three sequenced pieces, each its
own commit + version bump (rule 2) + build gate (rule 6):

1. **Remove Focus/Pomodoro entirely** — Jethro found the 4-session Pomodoro
   flow confusing and doesn't think it'll land with other users either.
   Delete `focus.tsx`, `TimerSettings`/`TimerStore`, the Pomodoro section
   in Settings. Leave old AsyncStorage data alone rather than migrating it
   away — not worth the risk for something this low-stakes. → `2.1.0`.
2. **Move Settings off the tab bar** — relocate to a pushed/modal screen,
   accessed via a small gear icon on Today's header instead of a tab.
   Bundled into the same `2.1.0` commit as #1 since both are nav-layout
   changes to the same file (`_layout.tsx`).
3. **New Timebox tab, filling Focus's old slot** — an hourly day-view
   (defaults to today, prev/next paging), reading the same `CustomEvent`
   data Calendar already reads — Calendar's month grid + day list stays
   unchanged, Timebox is a different lens on the same data, not a
   replacement. Phase 1 (read-only grid, tap to edit) → `2.2.0`. Phase 2
   (drag-to-reposition + a day's total scheduled hours) → `2.3.0`, once
   Phase 1 is verified on-device.

**Sequencing note:** Jethro chose Timebox specifically to fill Focus's tab
slot, which means the slot sits empty/placeholder between #2 and #3
landing — plan to do this as one continuous push rather than letting nav
restructure ship with a half-finished tab sitting there for a while.

---

## P1 — Close out Phase D verification (blocked on Supabase being resumed)

Jethro is resuming the paused Belific Supabase project himself via the
dashboard. **Do not start this section until he confirms it's back up** —
queries against a paused project will just time out.

### P1.1 — Verify the three untested sync paths on-device
The status doc and CHANGELOG both describe Phase D as code-complete but
never confirmed end-to-end. Three specific paths need a real on-device pass,
per rule 6 (this touches stored user data):

1. **One-time bulk upload on account creation** — sign in with Apple on a
   test account that has existing local data (events, tasks, routines,
   brain dump items, projects, categories, completions), confirm every row
   appears in the corresponding Supabase table for that `user_id`.
2. **Live push on local write** — while signed in, create/edit/delete one
   row of each of the 7 synced types, confirm each shows up (or tombstones
   correctly) in Supabase within a few seconds, without blocking the UI.
3. **Foreground reconcile** — background the app, mutate a row directly in
   Supabase (simulating a second device), foreground the app, confirm
   `runFullSync()` pulls it in and last-write-wins resolves correctly on a
   deliberately conflicting edit (same row changed on both "sides").

**This is a manual QA checklist, not something to automate away** — it needs
Jethro's physical device and a real Apple ID sign-in. Claude Code's job here
is to (a) make sure any logging/visibility needed to confirm success is in
place (e.g., a way to see sync errors, since `sync.ts` currently swallows
all failures silently — `catch { // noop }` everywhere by design for UX, but
that also means a real bug during verification could look like nothing
happened), and (b) walk Jethro through each of the 3 scenarios step by step
in-session rather than just asking him to "test it."

**Acceptance criteria:** all 3 scenarios confirmed working on-device, with
what was actually observed (not just "looks fine") logged in a new
`docs/sessions/` entry.

### P1.2 — Decide whether Phase D needs temporary sync-failure visibility
Given P1.1 needs real verification and `sync.ts` is silent-by-design on
failure, consider (propose to Jethro, don't just do it) a **temporary,
dev-only** console log on sync failure to make verification possible, then
confirm it's stripped or gated before this is called "done" — silent
failure is the correct production behavior for this app's local-first
philosophy, it just makes verification harder without some visibility.

---

## P2 — Remaining 2.0.0 release blockers (from the status doc's own list)

These were already flagged as "not yet done for this phase" before I
started — repeating them here so they're tracked in one place with the rest
of the plan, not lost in a separate doc.

### P2.1 — Privacy policy rewrite
`privacy.html` (repo root) currently states zero data collection. That
becomes inaccurate the moment optional accounts ship. Claude Code should
draft the updated policy — plainly stating: Sign in with Apple is optional,
what's stored server-side when signed in (the 7 synced tables, scoped to
that user via RLS), that local-only usage collects nothing, and account
deletion is real (Edge Function, verified). Draft it, then have Jethro
review before it goes live — this is legal-facing text, not just code.

### P2.2 — App Store Connect "App Privacy" answers
This is a manual dashboard task on Jethro's end (App Store Connect isn't
something Claude Code can act on). Listed here only so it isn't forgotten
before submission. Flag it back to Jethro when P2.1's rewrite is ready, since
the two should stay consistent with each other.

### P2.3 — Final EAS build / submission
Explicitly **not** part of this plan. Per rule 1, this only happens when
Jethro says "ready for EAS build," after P1 and P2.1/2.2 are actually done —
not before.

---

## P3 — Honest routine gamification (streaks, vacation mode, open-app modal)

**Resolved 2026-09-02** (was an open decision, now decided — see
`docs/decisions/007-honest-routine-gamification.md`). Not blocked by
Supabase/Phase D — independent workstream, can start any time after P0.

Full spec: `docs/ROUTINE_GAMIFICATION_SPEC.md`. Three pieces, build and
ship each separately with its own version bump/CHANGELOG entry and full
build gate (rules 2 and 6) — do not land all three in one commit:

1. **Streak count** — derived from existing `RoutineCompletion` data, no new
   sync table. Displayed in the existing muted/secondary text style, no
   flame icons or bright badges (see the visual-language note in 007 — this
   stays inside the "Quiet Function" palette, not game-UI styling). Quiet,
   one-time milestone acknowledgment at 7/30/100/365 days, non-modal.
2. **Vacation mode** — one global away toggle (date range) that pauses
   streak accounting without breaking it, plus a per-routine
   `activeDuringVacation` override for routines that should keep running
   anyway. Needs a `routines` table migration (same pattern as
   `add_task_notes`). "Note something for after vacation" is already served
   by Tasks (future due date) and Brain Dump — don't build a new capture
   mechanism for that.
3. **Open-app status modal** — default **on**, one Settings toggle to turn
   off. Shows today's routine status (done and not-yet-done) for the current
   and earlier time-of-day buckets, honest/plain language only, tap-to-toggle
   inline. Shown at most once per calendar day (dedup guard is a real
   requirement, not optional — this is what keeps it from becoming annoying,
   which Jethro flagged himself). Excludes vacation-paused routines.

**Also do, as part of P3, not left dangling:** move
`docs/GAMIFICATION_RESEARCH_DRAFT.md` and
`docs/GAMIFICATION_IMPLEMENTATION_PLAN_DRAFT.md` into `docs/archive/`
(unchanged, kept for reference) now that decision 007 formally supersedes
them — they should no longer sit loose in `docs/` root where a future
session could mistake the old draft for the active spec.

**Explicitly do not build beyond the spec:** no loss-framing copy anywhere,
no streak-risk countdowns, no XP/leveling (noted in the backlog below as a
possible future extension, not part of this pass), no notification revival.

---

## Backlog — not in this plan, for a future planning pass

Listed only so nothing already-discussed gets lost; none of this is
scoped or spec'd yet. A second round of inspiration (Ellie by Chris
Raroque, Twos, Routine Calendar, Amplenote) added several more items below
— each has a recommendation attached, not just a raw ask, since Jethro
asked directly what I think is best.

- **The timebox/hourly calendar view is no longer backlog — it's P-NAV**,
  chosen to fill Focus's old tab slot. See `docs/TIMEBOX_AND_NAV_SPEC.md`.
  **Still explicitly not in scope for the phone app:** Ellie's multi-day
  Kanban board (days as columns, scroll between dates). Even Ellie's own
  mobile app drops this and shows only the timebox on phone — same
  conclusion for Belific. It's an argument *for* eventually building the
  web/PWA version, not for the iPhone app.
- **Task rollover** — the underlying need (an unfinished task shouldn't get
  stuck in the past) is already solved in Belific: Top 3 Tasks already
  sorts overdue-first without changing the task's actual due date.
  **Recommendation: keep it that way** rather than adopting Ellie's
  approach of silently rewriting the due date to today — preserving the
  original date is more honest and more useful as history. If this comes
  up again, it's really "extend the existing overdue-first sort into the
  new timebox view," not a new mechanism.
- **Apple Calendar (EventKit) sync + Siri Shortcuts/App Intents** — worth
  scoping as its own native-integration initiative. Native on-device
  permission, no OAuth, no token storage — a materially different (and
  lower-risk) proposition than the Google Calendar sync that's already
  rejected below.
- **Home/lock-screen widgets** — the strongest platform-native idea raised,
  and the most expensive: a real native iOS Widget Extension, the same
  class of complexity as Sign in with Apple/Push (explicit App ID,
  capability registration, the Xcode-GUI-sync gotcha already documented in
  `IOS_BUILD_NOTES.md`). **Recommendation: a short feasibility spike before
  this goes on a real build plan**, not a task dropped straight into a
  sprint.
- **Auto-detect/linkify a pasted URL** in Brain Dump/Task notes — small,
  cheap, no architecture change. Fine to just build whenever it's convenient.
- Analytics (time-spent charts) — low priority. Note this needs a new data
  source once Focus/Pomodoro is removed (P-NAV) — it was the one thing
  that would've produced "time spent" data directly; a future version
  would derive it from Timebox-scheduled event durations instead.
- XP/leveling on top of routine streaks — raised as inspiration (Duolingo/
  Habitica-style), deliberately left out of P3's scope. Only build if
  Jethro explicitly asks for it later, and only fully deterministic/
  transparent XP, per decision 007.
- **Google/Outlook calendar sync — stays rejected.** Raised again via the
  Amplenote screenshot alongside Apple Calendar, but it's the same
  OAuth-token-storage complexity that was explicitly turned down before.
  Not reopened by this pass; would need an explicit, deliberate decision
  to revisit, same as any other locked decision.
- "Gamified onboarding" (Twos) — **already effectively covered.** Belific's
  existing starter/example content solves the same empty-state problem
  without a separate onboarding flow. Not a gap.
- Overlap/conflict detection between events
- Brain Dump drag-to-reorder + auto top-3 indicator
- Web version
- Custom fonts (Nunito/Hahmlet) — deferred due to `expo-font` build fragility
