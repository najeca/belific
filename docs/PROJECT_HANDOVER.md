# Belific: project handover

Written 2026-11-21 from `docs/CHANGELOG.md`, `docs/CURRENT_TRUTH.md`, `docs/build-progress.md` and the `docs/PLAN_*.md`
files, on branch `v2-redesign`. Nothing here was checked against the live Supabase project, a real iPhone or a clean
Windows machine. Where a source says "per Jethro", it is repeated as that and not verified. No secrets are in this file.

## 1. Current version

- **App version 3.64.1** (`mobile/app.json`, one number for the phone and the Windows app; `desktop/scripts/dist.js`
  stamps it into the installer).
- **Live App Store build:** still the old one (2.1.0 per CURRENT_TRUTH's "Shipped"; the 3.0.0 release notes say 2.18.1),
  on the **old** Supabase project. No 3.x build has gone to the App Store. TestFlight builds have been made by Jethro
  (feedback from TestFlight 3.53.1 is in PLAN_phone_parity); the next one is needed for 3.58.0's native module
  (`expo-web-browser`) and 3.63.0's Inter 800.
- **Windows:** never released. The only installer ever built and tried was 2.18.0 (an unpacked copy was in
  `desktop/dist/win-unpacked` before this audit's build replaced it).

## 2. What the app does today, in plain words

### Windows desktop (Electron around the Expo web export)
- **Three columns:** the left pane (Brain Dump and named lists; the thing you type IS a task), the centre (Tasks board
  of days, or the Calendar in Day, Week or Month) and the Timebox (a 24 hour day grid). Drag a task onto the Timebox or
  the Calendar to give it a time; drag between days; resize blocks.
- **Tasks:** a title, emoji, label (colour), list, notes, steps, an estimated length, reminders, repeat, **Smaller
  tasks** (child tasks with their own ticks), and an optional priority (Must do). Every card opens one details window.
- **Repeating tasks** are series: the days are shown, not stored, until one is ticked, moved or changed. A day can be
  moved or retimed on its own; **Repeat until** ends a series on a date; **This and following** splits it.
- **Breaks are free time:** a Break is a hatched gap, not a block; it counts in no total. "✂ Free time" cuts a gap into
  a task.
- **Shifts:** a long block with others fully inside it is a shell; what is inside is drawn inside it, counts once, and
  moves with it. The shift's card shows "5h of 10h planned" and its rows.
- **The daily flow:** a Plan button opens **Plan my day** (morning), **Wrap up** (from 14:00) or **Plan week** (Sunday
  evening, Monday morning); every answer saves at once and has its own Undo. **Earlier** holds unticked one off tasks
  from past days. **Clear** day, week, list or label. **Quick reminders** (a time and text, no length). **Quick add
  phrases** ("Dentist tomorrow 3pm 30m").
- **Other:** undo and redo (Ctrl+Z, Ctrl+Y), search (Ctrl+K), quick capture (Q, T), Trash (restore makes a new task),
  Analytics, Quests and streaks, templates, Pomodoro, calendar subscriptions (ICS, read only), a secret calendar feed
  link (needs the Edge Function, not deployed), JSON and CSV export, notifications and a tray icon, Light and Dark.
- **Account:** optional. Signed out it is local only and never touches the network. Sign in with Google or Apple (system
  browser, `belific://` callback) turns on sync; a sync line beside the avatar always says the state.

### iPhone (native Expo app; the web export is never on the phone)
- **First launch:** a Sign in screen: Continue with Google, Continue with Apple, or Use without an account. An account
  with no rows asks before anything local is uploaded.
- **Today:** a Now card (what is on now, what is next), an hours strip per label, a timeline of timed tasks, and the
  Anytime cards (hold and drag to order). An **Earlier** pill. A **Plan** button opens **Plan my day** one task at a
  time (Today, Tomorrow, A time, Not today) with Undo per answer and a summary.
- **Tasks:** every task a card with its label colour edge; Lists and Labels sections with counts; **Repeats** grouped by
  how often, in words ("Every 2 weeks on Friday"); label create, edit and delete; Search; Trash with Restore.
- **Calendar:** Day (touch timeline, hold to drag in 15 minute steps, shifts as shells, breaks), Week and Month; reads
  the phone's own calendars read only if allowed.
- **Adding:** the round + opens a step by step add flow; the full task card is used for Edit. Press and hold any task
  for a centred card of actions.
- **Settings:** theme, reminders on this device ("Remind me on this device"), daily hours, calendars, Convert routines,
  account, Delete account (local data only; see 5).
- **The phone shows no priority** (a stored value stays and syncs). No red anywhere on the phone (3.63.0). The phone
  does not record undo history the way the desktop does; its Undo bars write the rows back.

## 3. Database: migrations and which are applied

Shared Supabase project (Belific, Landis and Proload), Belific in the `belific` schema. **Never `supabase db push`.**
State as recorded by Jethro (Claude has no live access):

| File (`mobile/supabase/belific_schema/`) | What | State |
|---|---|---|
| `001_belific_schema.sql` | the 7 tables, RLS owner only, tombstones | **Applied.** Never run again; the rollback drops everything. |
| `002_lists_settings_timer.sql` | `lists`, `user_settings`, timer and list columns | **Applied** 2026-10-16 (`20261016153525`). |
| `003_calendar_feed_grants.sql` | one grant for the calendar feed | **Not applied.** Waits for Jethro's review, then the feed function deploy. |
| `004_part_b.sql` | `cuts_below`, `reminders`, `extra_times`, `times_done` | **Applied** 2026-10-21. |
| `005_repeat_until_and_parts.sql` | `repeat_until`, `parent_id` | **Applied** 2026-11-13. |

The five files in `mobile/supabase/migrations/` belong to the **old** project (all applied there) and create tables in
`public`: never run them on the shared project. Edge Functions: `delete-account` and `belific-calendar-feed` are written
and tested locally, **neither is deployed** to the shared project.

## 4. Decisions since 3.14

- **Priority removed from the phone** (2.26.0 removed it from the interface on both apps; the desktop later brought a
  Must do switch and a red ! back; 3.60.0: the phone shows no priority anywhere). Stored values still sync.
- **Email sign in dropped for now** (PLAN_phone_parity decision 4, 2026-11-13): Google and Apple only, because the
  shared project's email templates and sender would change Landis and Proload too.
- **Breaks as gaps** (3.33.0 to 3.35.0): a Break counts in no total and is drawn as free time, not a block.
- **Shifts** (3.36.0 to 3.39.0 desktop, 3.53.0 and 3.64.0 phone): a block inside a longer block counts once and is drawn
  inside it; it moves with it.
- **Daily flow** (3.40.0 to 3.46.0): one screen each for Plan my day, Wrap up and Plan week; every button saves at once
  with its own Undo; Let go sends to the Trash; a repeating day is never moved by these screens, only skipped.
- **Repeat until** (3.47.0 to 3.52.0, migration 005): an end date for a series; This and following.
- **Smaller tasks** (3.55.0) replaces the word "Parts" on both apps.
- **Today and Tasks redesign on the phone** (3.60.0, 3.61.0), plus Plan my day (3.62.0), the look and clean up with
  no red and no sample events (3.63.0), and Calendar shells (3.64.0).
- **Sync status visible** (3.53.2): a sync line on both apps ("Synced 5 min ago", "3 changes waiting", "Sync failed:
  reason"); a table the server refuses no longer blocks the other tables.
- **Sign in first on the phone** (3.58.0), with the empty account sheet; Apple and Google are separate accounts until
  "Add a sign in method" (linking) exists.
- Also: Actual time and the timer removed from the interface (3.26.0, data kept); Task or Break wording (3.27.0); one
  title for every day of a repeating task (3.29.0); no "This day only / All days" question (3.20.0); undo and redo on
  the desktop (3.21.0); the Mini Motorways restyle (3.30.0 to 3.32.0).

## 5. Known flaky checks

Real checks are Electron with real input (`desktop/test/real/`). Seen to flake and pass alone:
- **phone-p14:** timed out once in a batch (2026-11-20), 28/28 alone.
- **phone-p30:** one failure in 22 runs, then 22/22.
- **phone-p27:** stopped at the batch time limit at its first drag once (3.59.x), then passed.
- **phone-p7, phone-p22:** stopped at the batch limit while an iOS export ran; passed alone.
- **p41:** a harness error once (no "Delete task" in the popover), 33/33 alone.
- **cp8h:** a click timing flake at "Mark Today tick complete" once, then 50/50 twice.
- **Time of day:** checks that read the Today Now marker or "today" can behave differently near midnight, and the
  marker is only on screen at some hours.

Run them in batches of about 10 with the Electron processes killed in between; the pointer only checks (26 files, tagged
`@real-input: pointer`) need the mouse left alone and are run separately.

## 6. Open items, in order

1. **Windows first release blockers** (see the audit in this session's report): code signing, an update route, the
   live Google and Apple sign in on the shared project, the privacy and terms wording and contact email, delete account.
2. **Before the phone reaches anyone but Jethro:** `privacy.html` and `terms.html` (iPhone Google sign in, the calendar
   reads, the feed link, a contact email, the delete and export request line), copied to `main`; the App Store privacy
   answers to match.
3. **Account deletion decision** for a login shared with Landis and Proload (Apple 5.1.1(v)), then deploy
   `delete-account` and change every delete text together. Apple token revocation is a known gap.
4. **Apple sign in on the desktop** fails with "Invalid client id or web redirect url" (parked; the Services ID's domain
   and return URL, or the shared Apple secret).
5. **"Add a sign in method"** (linking Apple and Google) before any public release.
6. **A TestFlight build** with the 3.58.0 to 3.64.1 work (native modules and fonts), then the hand test lists in
   `docs/build-progress.md` and PLAN_phone_parity.
7. **Phone:** Wrap up and Plan week (parity phase 9); the routine conversion offer on Today (parity item 10); a safety
   backup before the first sign in; streaks on the phone (`seriesStreak` marker); the 2 routines not yet converted.
8. **Calendar feed:** review and apply 003, deploy `belific-calendar-feed` (`docs/CALENDAR_FEED_DEPLOY.md`).
9. **Shared logic noted, not changed:** skipping the only row of a repeating series that never started tombstones the
   whole series (`series.planSkip`); the phone's Plan my day guards it since 3.64.1, other paths do not.
10. **Not built:** import of data, email sign in, XP (never, decision 027), vacation, auto update.

## 7. Test counts (2026-11-20, 3.64.1)

- `mobile` unit tests (`npm test`, node:test over `lib/*.test.ts`): **1303 / 1303**.
- `desktop` unit tests (`npm test`): **118 / 118**.
- TypeScript (`npx tsc --noEmit` in `mobile/`): clean.
- iOS export plus `check:ios-markers`: OK, **49 markers, 0 hits**.
- Security scan (`.claude/skills/workflow/security-review/scripts/security-scan.sh`): passed.
- Real Electron checks: **88 quiet** (desktop cp6, cp7, p4 to p69 and phone-p2 to phone-p32 at 390 x 844) plus **26
  pointer only**. The last full quiet run (3.64.0, 86 checks) was all green after two stale checks were fixed and two
  flakes rerun; one contrast failure it found was fixed in 3.64.1. The pointer only checks have not been run since
  3.59.x.
