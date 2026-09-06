# Routine Gamification — Implementation Spec

Companion to `docs/decisions/007-honest-routine-gamification.md`. This is
what Claude Code should actually build from. Four features, each buildable
and shippable independently — do them in the order below, full build gate
(rule 6) between each, not as one giant commit.

**Revised 2026-09-02** to add §0 (routine checklists) after Jethro described
wanting routines to read as a quest made of steps, not a single toggle —
see the reasoning in §0 for why this comes first and what it changes.

---

## 0. Routine checklist ("quest") model — build before everything else

### Why this changes the model
Right now a Routine is a single tap-to-toggle unit — one row, one
complete/incomplete state. Jethro wants routines to read more like a quest:
a routine is made of steps, and the routine itself is only "done" when
every step is checked. This is a real data model change, not a visual one,
and everything below (streak, vacation mode, the open-app modal) reads
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

A routine with **zero steps behaves exactly like today** — tap-to-toggle
the whole thing, no checklist shown. Don't force every existing routine to
gain steps; this is additive, not a migration of existing data.

### This is bigger than it looks — sequence it deliberately
`RoutineStep` becomes an **8th synced table** (new Supabase migration +
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
**No flame icon, no fire emoji, no bright badge** — see decision 007's
visual-language note. If a quiet dot-row (last 7 days, filled/unfilled
circles) fits the existing hairline-divider list aesthetic better than a
bare number, that's a reasonable alternative — either way, stay inside the
locked palette (`design-identity/SKILL.md`), no new colors introduced for
this.

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
types. `VacationRange` itself: decide during implementation whether it's
worth syncing (multi-device relevant if Jethro ever uses Belific on two
devices) or can stay local-only for now — if syncing, it needs its own
migration; if local-only, document that choice in the CHANGELOG entry so
it's not mistaken for an oversight later.

### Behavior
- While the global toggle is active (`today` falls inside the range):
  - Routines with `activeDuringVacation` not true: streak math treats every
    day in range as a skip (see `computeRoutineStreak` above), the open-app
    modal (§3) doesn't surface them, and Today's Routines section either
    hides them or visually de-emphasizes them (de-emphasize, don't hide —
    Jethro should still be able to see and manually complete a "paused"
    routine if he wants to, vacation mode is a default, not a lock).
  - Routines with `activeDuringVacation: true` behave completely normally —
    full streak accounting, shows in the modal, no visual change.
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

## 3. Open-app status modal

### Trigger
On app foreground (same `AppState` → `active` transition `sync.ts` already
listens for — reuse that hook rather than adding a second listener), check:
1. Is the "show on open" setting enabled? (Settings toggle, default **on**.)
2. Has this already been shown today (local date, not UTC)? If yes, skip.
3. Build the list: routines in the current time-of-day bucket, plus earlier
   buckets today, **excluding** any currently vacation-paused (per §2).
   Include both done and not-yet-done — this is a status summary, not just
   a "what's missing" list.
4. If the list is empty (no routines exist yet, or truly nothing scheduled
   for today) — don't show anything. Only show when there's real content.

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

### Settings
One toggle: **"Show routine check-in when app opens"** — default on,
Settings screen, near where other display toggles would sit. Turning it off
doesn't lose anything; the same information is still on Today, just not
interrupting on open.

### Frequency guard
Store `lastCheckInShownDate` locally (not synced — it's a per-device
display-dedup flag, not user data). Reset naturally each day. This is what
keeps it from becoming "annoying," which was Jethro's own stated concern —
build the guard as a real requirement, not an afterthought.

---

## Build order & gate

0. Routine checklist model (§0) — land after P1 (Phase D sync
   verification) closes, per the sequencing note above. Everything below
   depends on this.
1. `computeRoutineStreak` + streak display on Today/Routines — smallest of
   the remaining pieces, ship and verify next.
2. Vacation mode (data model + migration + Settings UI + streak
   integration) — depends on §1's streak function accepting vacation ranges.
3. Open-app modal — depends on both (needs to know vacation-paused state to
   exclude routines correctly).

Each gets its own version bump + CHANGELOG entry (rule 2) and its own full
build gate (rule 6) — `tsc --noEmit`, local Release build, real on-device
test — before moving to the next. Don't land these in one commit; if a
later step needs a change to an earlier one's function signature, that's
easier to review as its own diff than buried in a mega-commit.
