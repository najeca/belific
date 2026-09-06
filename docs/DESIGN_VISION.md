# Belific — Design Vision

**Status:** Draft, written 2026-09-04. This is the master reference tying
together the specs already committed (`docs/TIMEBOX_AND_NAV_SPEC.md`,
`docs/ROUTINE_GAMIFICATION_SPEC.md`, `docs/decisions/006-...md`,
`docs/decisions/007-...md`, `.claude/skills/design-identity/SKILL.md`) into
one picture of the whole app, plus the pieces those docs don't cover yet
(the capture→plan→timebox pipeline, the account/sign-in screen). Where this
doc adds something new rather than restating an already-decided spec, it's
marked **PROPOSED** — read those as my recommendation, not a locked
decision, until Jethro confirms.

A companion clickable prototype (Claude Design canvas) is being built
alongside this doc and will be linked here once published. The prototype
shows the visual/interaction detail; this doc is the words-and-structure
version Claude Code builds from directly. They should never disagree — if
they do, this doc is out of date and needs fixing, not the prototype.

---

## 0. What is not changing

The palette, type system, and layout language are **locked** — this
project is not a redesign, it's building out more of the same identity.
From `mobile/lib/theme.ts` (verified against source):

```typescript
export const Colors = {
  background: '#F0EEE8',
  surface: '#FAF9F5',
  accent: '#5C7A6B',
  accentText: '#44604F',
  onAccent: '#FFFFFF',
  textPrimary: '#26251F',
  textSecondary: '#6E6C64',
  border: '#E4E0D5',
  danger: '#A8402F',
} as const;
```

"Quiet Function" identity (`design-identity/SKILL.md`), restated because
every screen below has to hold to it:
- No shadows. Ever.
- Sentence case everywhere (not Title Case, not ALL CAPS except small
  overline-style section labels, which use letter-spacing instead of size
  to read as a label).
- Hairline dividers between list rows, not card backgrounds, for flat
  content lists.
- Calm, understated, muted — no bright/high-saturation UI anywhere, which
  is the explicit resolution to the Mobile-Legends-inspiration tension (see
  decision 007's visual language note). The *mechanics* borrow from game
  UI (streaks, quests, milestones); the *rendering* never does.
- From `today.tsx` (verified, real values): 32px/800-weight/-0.5
  letter-spacing screen titles, 11px/700-weight/0.5-letter-spacing section
  labels, 16px card corner radius for primary cards, 14px for list
  containers, 20px radius for pill/status badges, 4px accent-colored left
  border to mark "current/now" state, 16px horizontal screen padding,
  12–20px vertical rhythm between elements.
- Remaining screens (Brain Dump, Calendar, Settings, Timebox) inherit this
  same ramp — see the Appendix for exact per-screen values, now confirmed.

Nothing in this document changes any of the above. If the prototype ever
looks like it's introducing a new color or a shadow, that's a mistake to
fix, not a new direction.

---

## 1. Navigation structure (final)

Four tabs + one relocated screen, per `TIMEBOX_AND_NAV_SPEC.md`:

| Tab | Icon (Ionicons) | Screen |
|---|---|---|
| Today | `today-outline` | Today dashboard |
| Brain Dump | `file-tray-outline` | Capture (see §2) |
| Calendar | `calendar-outline` | Month grid + day detail (unchanged) |
| Timebox | `time-outline` | Hourly day view |

Settings is not a tab — it's a gear icon (`settings-outline`) in Today's
header, pushed as a stack screen. Focus/Pomodoro is removed entirely (both
already specced and, per git log, already shipped as of `03f9618`/v2.1.0;
re-verified 2026-09-04 — `app/settings.tsx` has no Pomodoro references left).

**Also confirmed, not previously documented:** Tasks is a third pushed
screen (`app/tasks.tsx`), same pattern as Settings — reached from Today's
"Top 3 tasks" section via a "See all" link (`router.push('/tasks')`), not
from the tab bar. This doc's §2 below adds a Plan view onto this existing
screen; no nav change needed to reach it.

---

## 2. The core pipeline: capture → promote → plan → place → review

**Corrected 2026-09-04 against real source** — the first draft of this
section guessed a shape that fights an existing, deliberate architecture
boundary. Verified in `mobile/lib/types.ts` and
`docs/UBIQUITOUS_LANGUAGE.md`: `BrainDumpItem` is intentionally dateless —
"title-only thoughts with no date/time required upfront" is a documented
design decision, not a gap. There's already a separate `Task` type (due
date + priority, no fixed time) with its own screen (`app/tasks.tsx`,
560-line `TaskForm`) that wasn't mentioned anywhere in prior discussion of
this project. So Jethro's own description — capture, set how long it'll
take, a Kanban-like view to assign/move it to a date, then place it at a
time of day — already maps onto real, existing types, once you swap which
type gains which field:

```
Brain Dump          Task                    Custom Event
(undated capture)   (due date, priority,    (date + start/end time)
                     no fixed time)
       |                    |                       |
       |--- promote ------->|                       |
       |   (MOVES the item  |--- promote/place ----->|
       |    out of Dump)    |   (COPIES onto the      |
       |                    |    calendar as a slot)  |
       |------------------------- promote ---------->|
       |   (direct to Custom Event also exists today, |
       |    COPIES — dump item stays in Dump)         |
```

That asymmetry (promote-to-Task moves, promote-to-CustomEvent copies) is
already documented behavior in `UBIQUITOUS_LANGUAGE.md` and should not
change — it's called out here only so the prototype and Claude Code build
reflect what's actually there, not a new rule.

**Capture** (Brain Dump, unchanged): title + optional notes, no date, no
duration field on this type. Stays exactly as it is — this boundary is
what keeps capture frictionless, per the existing code comment, and
nothing about the pipeline below asks for it to change.

**Promote to Task**: existing flow (`TaskForm`) — title, due date,
priority, optional project tag. **New field, this round:** an optional
duration estimate on `Task` (e.g. a chip: 15m / 30m / 1h / 2h+), added so
that once a Task is later placed on Timebox it can default to a
reasonably-sized block instead of an arbitrary one. Not required — a Task
with no duration just gets placed with a default/resizable block.

**Plan** — **PROPOSED, new.** A day-assignment view over `Task.dueDate` —
the "Kanban-like" piece, translated to a phone rather than literal
side-by-side columns (which don't fit a 390px-wide screen). Lives as a
view on the existing Tasks screen (a segmented control at the top:
**List** / **Plan**, next to the existing project filter row), not bolted
onto Brain Dump:
- *List* is `tasks.tsx` exactly as it exists today — flat, sorted,
  project-filterable.
- *Plan* is a horizontally swipeable day pager — same interaction family
  as the Routine Calendar app screenshot Jethro cited — with a leading
  "Unscheduled" page holding every Task with no `dueDate` yet. Each day
  page is a plain reorderable list (hairline dividers, matching
  `taskRow`'s real style). A "Move to…" button on each row opens a
  compact date scroller (not a full calendar picker — fast, one thumb, no
  modal-within-modal) that writes a new `dueDate`. Drag-between-pages is a
  Phase 2 nice-to-have, same gesture-risk reasoning already applied to
  Timebox's own drag split — not Phase 1.
- Assigning a `dueDate` here is what makes a Task show up on Calendar's
  day-detail list. It does not give it a time of day.

**Place** (Timebox, already specced in `TIMEBOX_AND_NAV_SPEC.md`): a Task
with a `dueDate` can be placed onto that day's hourly grid — this is the
existing promote-to-`CustomEvent` action, just reachable from Timebox
directly instead of only from the Brain Dump/event form. Placing it uses
the Task's duration estimate (if set) to size the initial block; dragging
still resizes it same as any other event. A Task with a due date but not
yet placed simply doesn't appear on Timebox for that day — it still shows
on Calendar's day-detail list and on the Tasks list. Not every task needs
a time slot.

**Review** (Calendar, unchanged): month-level browsing, reading the same
`CustomEvent` data Timebox places onto — no change here at all.

**Data model impact — smaller than the first draft assumed:** one new
optional field (`Task.duration`), no new table, no change to
`BrainDumpItem`, no change to the promote semantics. "Plan" is a new view,
not a new type.

---

## 3. Today dashboard

Existing screen, unchanged in structure — the anchor tab, home for:
- The gear icon → Settings (§6).
- "Now" and "next" cards (accent-bordered, per §0's real values).
- Routines section — see §5 for the continuous-task/checklist/streak
  changes layered onto this section specifically.
- Brief status, not a full agenda — Calendar/Timebox are where you go to
  actually plan; Today is where you land to see where you are right now.

---

## 4. Timebox

Per `TIMEBOX_AND_NAV_SPEC.md` — hourly grid for one day, positioned event
blocks using existing category colors, prev/next day paging, tap a block to
edit via the existing `AddEventModal`. Phase 1 read-only placement, Phase 2
drag-to-reposition + daily total-hours readout. Nothing in this doc changes
that spec — it's restated here only so the pipeline in §2 reads as one
continuous story.

---

## 5. Routines: continuous daily task, checklist, streaks

### The reframe
Today, a Routine is closer to a recurring task that resets each day. The
mental model Jethro wants: a Routine is a **standing, continuous
commitment** — not something that gets "created" fresh each day, something
that simply *runs*, and each day is a checkpoint on whether it ran. This is
a framing/copy change more than a mechanical one — the underlying "was this
completed today" lookup already works this way (`RoutineCompletion` is a
per-date record against a standing `Routine`, not a re-created task). What
changes:
- Copy/empty-states describe routines as ongoing ("Morning routine — 12
  days running") rather than task-like ("Morning routine — due today").
- A Routine's detail view leads with its continuity (streak, how long it's
  existed) rather than presenting as a one-off item.
- Vacation mode (§5.3) exists *because* routines are continuous — you don't
  "cancel" a standing commitment when you travel, you pause it honestly.

### 5.1 Checklist ("quest") model
Per `ROUTINE_GAMIFICATION_SPEC.md` §0 — build first, before streaks or
vacation mode, since everything downstream reads its completion signal.
Specific, as requested:
- A Routine optionally has an ordered list of `RoutineStep`s (title only).
  Zero steps = today's plain tap-to-toggle behavior, unchanged.
- Tapping a routine **with** steps expands it inline (same row, not a new
  screen) into a checklist — checkbox rows, same visual as the existing
  Tasks/Top-3 checkboxes. No new checkbox component.
- The routine is "done today" the instant its last active step is checked;
  unchecking any step un-completes it. Fully reversible, same-day, no
  confirmation dialog — matches every other toggle in the app.
- **No partial-progress meter.** No "3/5", no percentage bar, no partial-
  fill ring. A routine is complete or it isn't; steps exist for their own
  sake (so you don't forget one), not to be graded mid-way.
- Add/reorder/delete steps from the existing `RoutineForm`.
- Sequencing note (unchanged from the spec): this is an 8th synced table —
  land it after Phase D (P1) verification closes, not in parallel with it.

### 5.2 Streak count
Per spec §1 — derived, not stored. Muted small text next to each routine
(`textSecondary`/`accentText`, never a bright badge, never a flame icon —
this is the one place the Mobile-Legends inspiration is deliberately *not*
followed visually, per decision 007). Shows at 2+ days; a brand-new routine
shows nothing rather than a discouraging "0" or "1". Quiet, dismissible,
non-modal milestone line at 7/30/100/365 days ("14 days on Morning
routine.") — no fireworks, no sound. A broken streak is silent: the number
just reflects the new count next time state changes, exactly like every
other "rolls over silently" behavior in this app.

### 5.3 Vacation mode
Per spec §2 — global toggle (Settings, near Account) + per-routine
override (`activeDuringVacation`). Global "on" pauses streak accounting and
hides routines from the open-app modal (de-emphasized, not hidden, on
Today — still manually completable). Per-routine override means routines
like "take medication" keep running through vacation untouched. Not a
capture mechanism — if Jethro wants to note something for after a trip,
that's what Brain Dump/a dated Task are already for; vacation mode doesn't
grow a fourth way to jot things down.

### 5.4 Open-app status modal
Per spec §3 — fires on foreground (reusing `sync.ts`'s AppState hook),
default on, once-per-local-day, skipped entirely if there's nothing real to
show. Plain status list (routine name, checked/unchecked steps or the bare
toggle for stepless routines), tap a row to toggle inline, tap outside or
"Close" to dismiss. No countdown, no color-coded urgency, no "streak at
risk" language anywhere in this — the entire feature is a status summary,
not a nudge.

---

## 6. Account / Sign in with Apple

Per decision 006 (reverses decision 003's "no backend"). Belific stays
**local-first by default** — an account is opt-in, for sync across devices,
never required to use the app.

**Settings → Account section** (confirmed already built — see Appendix):
- Signed out: a "Sign in with Apple" row (Apple logo + label).
- Signed in: "Signed in as {email/Apple ID}", "Sign Out", and a
  danger-styled "Delete Account" row (`person-remove-outline`, `danger`
  color) — sign out is reversible and local data stays; delete account is
  destructive (calls the existing Edge Function) and needs its own
  confirmation.
- No email/password option — Apple only, matching what's already built.

---

## 7. What this explicitly does not include

Restating the guardrails so nothing in the prototype or a future build
drifts past what's actually approved:
- No loss-framing, streak-risk countdowns, or urgency language anywhere
  (rule 3, decision 007).
- No XP/leveling this round (decision 007 — flagged as possible future
  work, not built now, not shown in the prototype as if it exists).
- No shadows, no bright/saturated UI, no icon-badge streak treatment.
- No fourth capture mechanism invented for vacation mode.
- No literal side-by-side Kanban columns — §2's "Plan" view is the
  phone-native translation, not the desktop pattern from the screenshots.

---

## 8. Open items / needs Jethro's confirmation

1. §2's "Plan" view (List/Plan segmented control on the existing Tasks
   screen, day-pager, "Move to…" date scroller) is **new** — not yet in
   any committed spec. Confirm this is the right shape before Claude Code
   builds it, or send correction and I'll revise this doc + the prototype
   together.
2. Duration-chip increments on Task (15m/30m/1h/2h+ or something else) —
   placeholder until finalized.
3. `docs/UBIQUITOUS_LANGUAGE.md` cleanup (drop stale Pomodoro/Session
   terms, update the streak warning to point at decision 007 instead of
   contradicting it, add Task/Plan/duration/vacation-mode/quest-step
   terms) — small, mechanical, not blocking anything else, can land
   whenever convenient.

---

## Appendix — verified real values (2026-09-04)

For the prototype and for Claude Code — every value below was read
directly from source, not assumed. Existing screens not listed here keep
whatever they already have; nothing in this doc changes an existing
value.

**Category colors** (`lib/data.ts` `CATEGORIES` — decorative fill only,
never used as text):
work `#6B6558` · routine `#8C8977` · hygiene `#6B5FB0` · fitness `#4F7A1E`
· jobs `#2E6FA8` · project `#453D8F` · cyber `#157A5A` · game `#8F5C10` ·
school `#B14322` · church `#A8395F` · chore `#93601E` · winddown `#8A8672`
· sleep `#5C6470` · free `#9A9686`. Default picker shows 5:
work/routine/fitness/chore/free.

**Settings screen** (`app/settings.tsx`, confirmed no Pomodoro remnants):
section header 11px/700/1.0-letter-spacing; card `surface` bg, 16px
radius, rows 16px h-padding/16px v-padding, hairline `border`-color
divider (16px side margin); danger rows use `danger` (`#A8402F`) text,
16px/600. Account section already exists exactly as specced in §6 above.

**Calendar screen** (`app/(tabs)/calendar.tsx`): 32px/800 title (matches
Today/Brain Dump); month nav row with 44px tap targets; day cells circular
(`borderRadius: cellSize/2`), today = filled `accent` circle w/ `onAccent`
text, plain 4px accent dot for days with events; day-detail sheet reuses
the same `eventListContainer`/`eventRow` pattern as Today (56px min-height
rows, 4px category-color left bar, hairline dividers).

**Brain Dump screen** (`app/(tabs)/inbox.tsx`): 32px/800 title; capture row
is a 48px circular accent "add" button beside a `surface`-bg 12px-radius
text input; captured items are swipe-to-delete cards (`surface` bg, 14px
radius, 16px padding, red `danger` reveal underneath via
`react-native-gesture-handler`'s `Swipeable` — not a hand-rolled gesture).
Edit is a page-sheet modal, not inline.

**Tasks screen** (`app/tasks.tsx`, previously undocumented): pushed screen,
back-chevron header identical in structure to Settings'; capture row
identical pattern to Brain Dump's; project filter chips row when any
projects exist; task rows use a tap-to-toggle circular checkbox
(`ellipse-outline` → `checkmark-circle`, `accent` when done), a small flag
icon for high priority, a 🧠 glyph when `origin: 'dump'`. `TaskForm`
(`app/components/TaskForm.tsx`) already has a due-date picker and a
3-choice priority row — the duration chip in §2 is a new addition to this
existing form, not a new screen.

## Related docs
- `docs/TIMEBOX_AND_NAV_SPEC.md` — nav restructure + Timebox detail
- `docs/ROUTINE_GAMIFICATION_SPEC.md` — routine checklist/streak/vacation/modal detail
- `docs/decisions/006-optional-accounts-reverses-003.md`
- `docs/decisions/007-honest-routine-gamification.md`
- `.claude/skills/design-identity/SKILL.md`
- `docs/UBIQUITOUS_LANGUAGE.md` — needs a small cleanup pass (still lists
  Pomodoro/Session as real terms post-removal; its streak warning predates
  and now contradicts decision 007) — flagged, not yet fixed
- `docs/NEXT_PLAN.md` — build sequencing across all of the above
