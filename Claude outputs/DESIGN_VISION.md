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
  same ramp — exact per-screen values get finalized once source access is
  back; nothing below invents a new type size, radius, or color.

Nothing in this document changes any of the above. If the prototype ever
looks like it's introducing a new color or a shadow, that's a mistake to
fix, not a new direction.

---

## 1. Navigation structure (final)

Four tabs + one relocated screen, per `TIMEBOX_AND_NAV_SPEC.md`:

| Tab | Icon (Ionicons) | Screen |
|---|---|---|
| Today | `today-outline` | Today dashboard |
| Brain Dump | `file-tray-outline` | Capture + Plan (see §2) |
| Calendar | `calendar-outline` | Month grid + day detail (unchanged) |
| Timebox | `time-outline` | Hourly day view |

Settings is not a tab — it's a gear icon (`settings-outline`) in Today's
header, pushed as a stack screen. Focus/Pomodoro is removed entirely (both
already specced and, per git log, already shipped as of `03f9618`/v2.1.0).

---

## 2. The core pipeline: capture → plan → place → review

This is the "read between the lines" ask — Brain Dump, a Kanban-like
day-assignment step, and Timebox aren't three unrelated features, they're
stages of one flow for a single task:

```
Brain Dump (Capture)  →  Brain Dump (Plan)  →  Timebox        →  Calendar
"what is it, how       "what day"             "what time       "zoom out,
 long will it take"                            of day"          browse any date"
```

**Capture** (existing, unchanged in spirit): title + optional duration
estimate. Duration is a small chip (e.g. "15m" / "30m" / "1h" / "2h+" —
exact options TBD against whatever increments Timebox uses) set at capture
time, not required. No date required at capture — that's the whole point
of Brain Dump, a place to get something out of your head with the lowest
possible friction.

**Plan** — **PROPOSED, new.** Brain Dump gains a segmented control at the
top: **Inbox** / **Plan**.
- *Inbox* is today's Brain Dump exactly as it exists now: a flat list of
  undated captures.
- *Plan* is the "Kanban-like" piece Jethro asked for, translated to a
  phone rather than literal side-by-side columns (which don't fit a
  390px-wide screen). It's a horizontally swipeable day pager — same
  interaction family as the Routine Calendar app screenshot Jethro cited —
  with a leading "Unscheduled" page holding everything without a date yet.
  Each day page is a plain reorderable list (hairline dividers, same as
  everywhere else). Moving an item to a different day: a "Move to…"
  button on each row opens a compact date scroller (not a full calendar
  picker — this should be fast, one thumb, no modal-within-modal). Drag-
  between-pages (physically dragging a row off the edge of the screen onto
  the next day) is a Phase 2 nice-to-have, not Phase 1 — same gesture-risk
  reasoning already applied to Timebox's own drag-to-reposition split.
  Assigning a date here is what makes an item show up on Calendar and
  become placeable on Timebox — it does not yet have a time of day.

**Place** (Timebox, already specced in `TIMEBOX_AND_NAV_SPEC.md`): once an
item has a date, it can be dragged onto that day's hourly grid to give it a
time slot. An item with a date but no time slot yet just doesn't appear on
Timebox for that day — it still shows on Calendar's day-detail list. Not
every task needs a time slot; Timebox is for the tasks where *when* matters.

**Review** (Calendar, unchanged): month-level browsing, unaffected by any
of the above — it already reads the same `CustomEvent`/task data plan and
Timebox will read.

Nothing here requires a new backing data model beyond what
`TIMEBOX_AND_NAV_SPEC.md` and the existing Task/CustomEvent types already
define — "Plan" is a new *view* over the existing `dueDate` field on Task,
not a new field or table.

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

**Settings → Account section:**
- Signed out state: "Sign in with Apple" button (native Apple button
  styling per Apple's HIG — this is the one place the app defers to a
  platform-native control rather than the custom button style used
  elsewhere, since Sign in with Apple has required branding rules).
  One line underneath explaining what signing in does: enables sync across
  devices; local data keeps working exactly the same either way.
- Signed in state: shows the account is connected (Apple doesn't expose
  much beyond a stable identifier/optional email — surface whatever's
  actually available, don't fabricate a profile), "Sign out" and "Delete
  account" as separate, clearly-differentiated actions — sign out is
  reversible and local data stays; delete account is destructive (calls
  the existing Edge Function) and needs its own confirmation, styled with
  `danger` (`#A8402F`), not the accent color.
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

1. §2's "Plan" view (segmented Inbox/Plan inside Brain Dump, day-pager,
   "Move to…" date scroller) is **new** — not yet in any committed spec.
   Confirm this is the right shape before Claude Code builds it, or send
   correction and I'll revise this doc + the prototype together.
2. Duration-chip increments at capture time (15m/30m/1h/2h+ or something
   else) — placeholder until finalized.
3. Exact spacing/type values for Brain Dump, Calendar, Settings, and the
   category color list (`lib/data.ts`) are still pending — captured once
   the device connection is back, folded into this doc and the prototype
   without changing anything decided above.

---

## Related docs
- `docs/TIMEBOX_AND_NAV_SPEC.md` — nav restructure + Timebox detail
- `docs/ROUTINE_GAMIFICATION_SPEC.md` — routine checklist/streak/vacation/modal detail
- `docs/decisions/006-optional-accounts-reverses-003.md`
- `docs/decisions/007-honest-routine-gamification.md`
- `.claude/skills/design-identity/SKILL.md`
- `docs/NEXT_PLAN.md` — build sequencing across all of the above
