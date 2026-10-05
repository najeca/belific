# Routine Gamification — Implementation Spec

Companion to `docs/decisions/007-honest-routine-gamification.md`. This is
what Claude Code should actually build from. Four features, each buildable
and shippable independently — do them in the order below, full build gate
(rule 6) between each, not as one giant commit.

**Revised 2026-09-02** to add §0 (routine checklists) after Jethro described
wanting routines to read as a quest made of steps, not a single toggle —
see the reasoning in §0 for why this comes first and what it changes.

**Addendum 2026-09-28:** streaks/XP may now use a dedicated brighter accent (`xpGold`/`xpGoldText`) instead of the plain muted palette for the streak/XP display specifically — see [[docs/decisions/008-louder-gamification-visual-override]]. The "no flame icon, no partial-progress meter" content rules below are unchanged; only the color/weight of the streak and XP display is affected.

**Addendum 2026-09-28 (2):** the XP multiplier scope, left open by decision 008, is confirmed by Jethro: **per routine**, not account-wide. Each routine carries its own deterministic multiplier derived from its own streak (e.g. Morning routine at 14 days shows its own `×1.14`; Evening wind-down at 3 days shows its own `×1.03`, independently). Completing a routine awards XP at that routine's own rate — there is no single shared account-wide multiplier and no pooled/averaged rate across routines. Formula, XP totals, and any account-level/level-badge meaning are still undecided and not yet specced here; this addendum locks the multiplier's scope only.

**Addendum 2026-09-28 (3):** §3's on-open interrupting modal is replaced, per Jethro's direction. Nothing pops up unprompted on app foreground anymore — drop that trigger entirely. In its place: a quiet badge/indicator on whatever nav element represents routines/quests (exact placement depends on the platform's nav structure, still being settled), present whenever §3 step 3's same "real, un-actioned content today" check is true, absent when it isn't. Tapping it opens the exact same status content already specced in §3 (plain checkmark/empty-circle rows, tap a row to toggle, same handler as the existing Routines toggle) as a view the user opens on purpose, not one that interrupts them. This is still squarely inside decision 007's no-dark-patterns rule, if anything it's gentler than the modal it replaces: no forced interruption, no countdown, one consistent indicator, not a color-coded urgency scale. Because nothing fires automatically anymore, the "Show routine check-in when app opens" Settings toggle and the `lastCheckInShownDate` frequency guard are both dropped, there's nothing left to gate.


**Addendum 2026-09-28 (4):** Routines gain optional non-daily recurrence (see new §4 below) — confirmed with Jethro using real examples (hair care on Thu/Sun, not every day). Irregular-schedule items (laundry, shampoo) are confirmed to stay as recurring Tasks, not Routines, specifically because a streak only makes sense against a fixed, predictable schedule; an irregular one has nothing to be "consecutive" against.

---

## 0. Routine checklist ("quest") model — build before everything else

### Why this changes the model
Right now a Routine is a single tap-to-toggle unit — one row, one
complete/incomplete state. Jethro wants routines to read more like a quest:
a routine is made of steps, and the routine itself is only "done" when
every step is checked. This is a real data model change, not a visual one,
and everything below (streak, vacation mode, the routine status view) reads
"was this routine completed today" — so this comes first.

### Data — `mobile/lib/types.ts`
```typescript
// New — one row per checklist item within a routine. `order` controls
// display sequence.
export interface RoutineStep {
  id: string;
  routineId: string;
  title: string;
  order: number;
  deletedAt?: string; // tombstone, same convention as every other synced type
  updatedAt: string;
}
```
`RoutineCompletion`'s meaning shifts: it now represents "every one of this
routine's active steps was checked for this date," not a standalone toggle.
It's recorded the moment the last remaining step for that date gets
checked, and removed the moment any step is unchecked again — same fully-
reversible convention already documented for `RoutineCompletion` (real
delete, no tombstone).

**Where "step 2 is checked today" lives (added 2026-10-05):** a second new
synced table, `routine_step_checks`, keyed `(user_id, step_id, date)` with a
tombstone, so unchecking is reversible and syncs. `RoutineCompletion` is then
derived: written when the last active step for a date is checked, removed when
any is unchecked. See `docs/OPUS_PLAN_REVIEW.md` section 4, migration 4.

A routine with **zero steps behaves exactly like today** — tap-to-toggle
the whole thing, no checklist shown. Don't force every existing routine to
gain steps; this is additive, not a migration of existing data.

### This is bigger than it looks — sequence it deliberately
`RoutineStep` becomes an **8th synced table** (and `routine_step_checks` a 9th) (new Supabase migration +
`sync.ts` wiring, same shape as the existing 7, but still a new table, not
a single added column like `add_task_notes`). Don't start this in parallel
with P1 (Phase D sync verification) — land it after P1 closes, so a new
sync path isn't being built and verified against a sync layer that's
itself still mid-verification.

### UI
Tapping a routine with steps expands it inline (same row, not a new
screen) to show its checklist — checkbox rows, matching the existing
Tasks/Top-3 checkbox visual. Checking every step auto-completes the
routine for today (feeds the same completion signal §1's streak reads);
unchecking any step un-completes it, same reversibility as today.
Add/reorder/delete steps from the existing `RoutineForm`.

### Explicitly do not build
No partial-progress framing — no "3/5 done" bar, no percentage, nothing
that grades a routine mid-way. A routine is complete for today or it
isn't, same binary as before; the checklist exists for the steps
themselves, not as a meter on the routine.

---

## 1. Streak count (depends on §0's completion signal)

### Data
No new stored field for the count itself — it's derived, matching the
existing `RoutineCompletion` philosophy ("'done today' is a lookup, nothing
more"), now sourced from §0's "all steps checked" signal rather than a bare
toggle (routines with no steps: unchanged, still a direct toggle). New pure
function in `mobile/lib/gamification.ts`:

```typescript
// Consecutive days completed, walking backward from today. If today isn't
// completed yet, start counting from yesterday — a streak isn't broken
// until the day actually ends with nothing logged (matches "done today"
// already being a same-day-reversible toggle). Days inside an active
// vacation range for this routine (see §2) don't count as a gap — they're
// skipped over, not treated as a miss.
export function computeRoutineStreak(
  routineId: string,
  completions: RoutineCompletion[],
  vacationRanges: VacationRange[], // this routine's own paused ranges
  today: Date = new Date(),
): number
```

### UI
On the Today screen's Routines section and on the Routines list, show the
count next to each routine — small, muted-secondary-color text
(`accentText` or `textSecondary`, per the existing palette), e.g. `12 days`.
**No flame icon, no fire emoji.** Colour and weight of streak and XP
elements follow decision 008 (`xpGold` / `xpGoldText`, scoped to
gamification UI only); everything else stays in the locked palette. If a
quiet dot-row (last 7 days, filled/unfilled circles) fits the
hairline-divider list aesthetic better than a bare number, that's a
reasonable alternative.

A streak of 0 or 1 shows nothing extra (no point making a brand-new routine
feel like it's already "behind"). Threshold for showing the count at all:
2+.

### Milestones
At 7, 30, 100, 365: a single small, dismissible, non-modal acknowledgment
(e.g. an inline banner on Today the next time it's opened, not a popup) —
plain language, no fireworks: `"14 days on Morning routine."` No XP, no
sound, no animation beyond what already exists for a normal state change.
Shown once per milestone (track `lastMilestoneShown` per routine, locally —
doesn't need to sync, it's not meaningful data, just dedup state).

### Explicitly do not build
Any messaging that fires when a streak breaks. The UI simply shows the new
(lower) count next time the routine's completion state changes — same as
today's "roll over silently" behavior for everything else.

---

## 2. Vacation / away mode

### Data model — `mobile/lib/types.ts`
```typescript
// Global away toggle. Absent/null = not on vacation. One active range at a
// time (starting a new one while one is active replaces it — don't stack).
export interface VacationRange {
  startDate: string; // date-only, like Task.dueDate
  endDate?: string;   // absent = open-ended, until user turns it off manually
}
// Stored as a single optional value, not a synced-table row: `AppSettings`
// (wherever TimerSettings-equivalent app-level config already lives) gains
// `vacation?: VacationRange`.

// Add to Routine — per-routine override of the global vacation state.
// Absent = follows the global toggle (paused when vacation is active, same
// as before). true = this routine keeps running/prompting even while the
// global toggle is on.
export interface Routine {
  // ...existing fields
  activeDuringVacation?: boolean;
}
```

This needs a Supabase migration (new nullable `active_during_vacation`
boolean column on `routines`, mirroring the `add_task_notes` pattern from
`20260801004209_add_task_notes.sql`) since `Routine` is one of the 7 synced
types. `VacationRange` **syncs** (decided 2026-10-05, because desktop and phone
share one dataset): it lives in a single-row `user_settings` table
(`vacation_start`, `vacation_end`, last write wins). See
`docs/OPUS_PLAN_REVIEW.md` section 4, migration 3.

### Behavior
- While the global toggle is active (`today` falls inside the range):
  - Routines with `activeDuringVacation` not true: streak math treats every
    day in range as a skip (see `computeRoutineStreak` above), the open-app
    status view (§3) doesn't surface them, and Today's Routines section either
    hides them or visually de-emphasizes them (de-emphasize, don't hide —
    Jethro should still be able to see and manually complete a "paused"
    routine if he wants to, vacation mode is a default, not a lock).
  - Routines with `activeDuringVacation: true` behave completely normally —
    full streak accounting, shows in the status view, no visual change.
- Ending vacation (toggle off, or `endDate` passes): paused routines simply
  resume normal accounting from that point. No "welcome back" moment needed,
  keep this quiet.
- **New routines created while vacation is active:** default
  `activeDuringVacation` to unset (i.e. follow the global pause), same as
  any existing routine — no special-casing at creation time. If Jethro wants
  a new routine to run immediately despite being on vacation, he sets the
  same per-routine override any other routine would use.

### Settings UI
One toggle + optional date range picker in Settings, near the existing
Pomodoro config / Account section. Simple on/off is fine for MVP — "on"
starts today with no end date (Jethro turns it off manually when back), a
date-range picker is a nice-to-have if it's cheap, not a blocker.

### What vacation mode is explicitly not for
Jethro raised wanting to "note something down for later" while away — that's
already served by existing features and doesn't need new mechanism:
- A **Task** with a due date after the vacation range — already exists.
- A **Brain Dump** item with no date at all — already exists.
Don't build a fourth capture mechanism for this; if it comes up in the UI
copy anywhere (e.g. an empty state), point at Brain Dump/Tasks rather than
inventing something new.

---

## 3. Routine status view (replaces the open-app modal)

**The original modal design was removed by addendum 3 (2026-09-28).** There
is no trigger on app foreground, no Settings toggle and no
`lastCheckInShownDate`. In its place, a quiet badge on the routines/quests nav
element is present whenever there is real, un-actioned content today (same
check as the original step 3: routines in the current time-of-day bucket plus
earlier buckets today, excluding vacation-paused routines, only when the list
is not empty), and absent otherwise. Tapping it opens the status content
below, as a view the user opens on purpose.

### Content
Plain status, matching the existing empty-state/status tone already used
elsewhere in the app:
```
Morning routine
  ✓ Drink water
  ✓ Brush teeth
  ○ Stretch

Afternoon routine
  ○ Walk
```
Tapping a row toggles it complete/incomplete inline (same handler as the
existing Routines tap-to-toggle — don't fork the logic). A plain "Close" or
tap-outside dismisses. No countdown, no "X hours left," no color signaling
urgency — checked vs. unchecked is the only state, using the same
checkmark/empty-circle visual already established.

---

## 4. Non-daily routine recurrence

### Why this exists
Not every Routine is daily. Some things belong to the same "streak-worthy
habit with steps" family as Morning routine, but only happen on specific
days, e.g. hair care (condition hair, shave face, as two `RoutineStep`s
under one Routine) on Thursdays and Sundays only. This section extends
Routine to support that, reusing the exact recurrence mechanism already
shipped for `CustomEvent` (`mobile/lib/types.ts`'s `RecurrenceRule` and
`recurrenceDays`) rather than inventing a second one.

**Explicitly confirmed out of scope for this mechanism:** anything on an
irregular or unpredictable schedule (laundry, shampoo — done on whatever
day suits that week, not the same day or days every time). Those stay
recurring **Tasks** (see the companion note in `DESIGN_VISION.md` §2),
not Routines, on purpose: a streak is only meaningful against a fixed,
predictable schedule. An irregular one has no "consecutive" to count.

### Data — `mobile/lib/types.ts`
```typescript
export interface Routine {
  id: string;
  title: string;
  timeOfDay: TimeOfDay;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  // New, both optional — absent (or 'daily') is today's existing
  // behavior, completely unchanged. Reuses CustomEvent's own
  // RecurrenceRule/WeekDay types, not a new union.
  recurrence?: RecurrenceRule;       // 'daily' | 'weekly' | 'biweekly' | 'triweekly' | 'monthly'
  recurrenceDays?: WeekDay[];        // which days, for weekly/biweekly/triweekly — absent for daily/monthly
}
```
Needs a Supabase migration (two new nullable columns on `routines`,
mirroring the `add_task_notes` pattern at
`mobile/supabase/migrations/20260801004209_add_task_notes.sql`) since
`Routine` is one of the synced types.

### Behavior
- A routine with `recurrence` absent or `'daily'`: unchanged, shows and is
  completable every day, exactly like today.
- A routine with `recurrence: 'weekly' | 'biweekly' | 'triweekly'` and
  `recurrenceDays` set: only appears on Today and in the Routines list on
  those weekdays. On any other day it simply isn't shown — not shown as
  pending, not shown as missed, absent entirely, same "roll over silently"
  philosophy as everything else in this app.
- A routine with `recurrence: 'monthly'`: appears once, on a fixed day of
  the month (decide the exact day-of-month source during implementation,
  e.g. day-of-month it was created on, or a field to add if that's not
  enough — flag back to Jethro if this needs a real choice rather than an
  assumption).

### Streak — extends `computeRoutineStreak` (§1), doesn't replace it
"Consecutive" for a non-daily routine means consecutive **scheduled
occurrences**, not consecutive calendar days — walking backward, skip any
date that isn't one of this routine's scheduled days, exactly the same
principle already used to skip vacation-paused days rather than counting
them as a gap (§2). Hair care completed every Thu and Sun for three
straight weeks is a streak of 6 (occurrences), not measured in calendar
days at all. Still fully derived, no new stored count, same function,
same signature shape, just fed which days are "in scope" for this
particular routine before walking backward.

---

## Build order & gate

0. Routine checklist model (§0) — land after P1 (Phase D sync
   verification) closes, per the sequencing note above. Everything below
   depends on this.
1. `computeRoutineStreak` + streak display on Today/Routines — smallest of
   the remaining pieces, ship and verify next.
2. Vacation mode (data model + migration + Settings UI + streak
   integration) — depends on §1's streak function accepting vacation ranges.
3. Routine status badge and view (§3, replaces the old modal) — depends on
   both (needs to know vacation-paused state to exclude routines correctly).
4. XP and levels — decision 014 (proposed). Not part of the original scope;
   decided separately, built after the desktop daily driver checkpoints.

Each gets its own version bump + CHANGELOG entry (rule 2) and its own full
build gate (rule 6) — `tsc --noEmit`, local Release build, real on-device
test — before moving to the next. Don't land these in one commit; if a
later step needs a change to an earlier one's function signature, that's
easier to review as its own diff than buried in a mega-commit.
