# Plan: push after (PLAN_push_after, D7 of PLAN_desktop_parity)

Written 2026-11-21 on `v2-redesign` at 3.68.0. **Built 2026-11-23: P1 3.73.0, P2 3.74.0, P3 3.75.0** (see docs/CHANGELOG.md and
docs/build-progress.md). Jethro's answers: 1 recommended (chosen by Claude, to confirm), 2 refuse whole, 3 wall, 4 no, 5 yes, 6 yes, 7 yes.
Where this plan makes a choice of its own it says "chosen here"; the questions at the end ask Jethro to confirm them.

## The brief (Jethro, 2026-11-21)

When a task is dropped or moved onto a time that overlaps other timed tasks on the same day, the overlapped tasks are
pushed later by just enough to clear it, one after another, stopping at the first gap big enough. It lives in the shared
rules; the phone and the desktop are built together. It applies to drag, edit time and the add flow. An Undo after every
push. Rules to evaluate: done tasks do not move; tasks inside a shift move with the shift and count once; breaks stay
drawn as gaps; nothing is pushed past midnight; repeating series day rows are pushed individually and the root row is not
changed.

## What exists today (read at 3.68.0)

- **Overlap is allowed now.** Two timed tasks on the same time sit side by side on the Calendar and the Timebox
  (`lib/blockLayout.ts`). Nothing moves by itself. The only "make room" action is the late task's **Move to next free
  slot today** (`lib/lateTasks.ts` `busyFromTasks`, `nextFreeSlot`, `lateMove`; desktop `TimeBlock.tsx`), one task at a
  time, by hand.
- **Breaks** (`cutsBelow`) are free time drawn as gaps (`lib/gaps.ts`). A task over a break is cut into pieces
  (`lib/cuts.ts`) or, when wholly inside, is its guest (`lib/hosting.ts`). A drop that would stick out of a break is
  refused with "Longer than the break" (`hostActions.breakRefusal`, `hosting.fitRefusal`).
- **Shifts**: a long task with others wholly inside its time (`lib/shifts.ts`). The rows inside are drawn and counted
  once, inside the shift (`shiftsOfDay`, `insideItemsOf`).
- **Moving a shift moves what is inside it, on the desktop**: `lib/breakCarry.ts` `carryBreaks` (S4, 3.39.0) is called
  by `DragProvider.tsx`, `TimeBlock.tsx` (nudges) and `TaskDetailPanel.tsx`; `carryToDay` by `TaskCard.tsx`,
  `TaskPopovers.tsx`, `DayMenu.tsx` and the shared `wrapActions.wrapMove`.
- **Does the phone move a shift's inside tasks with it? No**, for a drag and for an edited time. The deciding file is
  `mobile/app/(tabs)/calendar.tsx` (the Day view drop, around line 156): it writes `phoneDropPatch` with `patchTask` or
  `editRepeatingTime` and never calls `carryBreaks`; the phone details (`components/phone/TaskDetails.tsx`, `timePatch`)
  and the step by step add (`lib/stepAddActions.ts` `stepPatch`) do not either. **The one exception**: Wrap up's
  Tomorrow and Plan week's day on the phone go through the shared `wrapActions.wrapMove`, which calls `carryToDay`, so
  those moves do carry the inside tasks to the new day.
- **A day of a repeating series**: `seriesActions.editThisDay` stores that day as its own row (a day row) and leaves the
  series' template (the root row) alone. `editRepeatingTime` sends the FIRST time of a series to every repeat day, which
  a push must never do.
- **One Undo for a gesture**: `undoStack.markGesture()` groups writes, so one Ctrl+Z puts them all back (desktop); the
  phone has no undo stack and undoes by writing back the rows changed (`lib/earlierUndo.ts` `undoRows`).

## The rule (shared, pure)

A new pure file **`lib/pushAfter.ts`** (no runtime imports besides siblings) works out the moves; nothing is written
there.

```
pushPlan({ tasks, dayKey, todayKey, cutMin, moved: { id, time?, startMin, endMin } }) ->
  { moves: Array<{ id, time?, projected, fromMin, toMin }>, carried: Array<{ id, fromMin, toMin }> }
  | { refused: string }   // nothing is pushed; the drop itself still happens (question 2)
  | null                  // nothing overlaps: an ordinary drop
```

1. **The blockers** are the day's timed spans from `dayHostEntries` (the same list the Timebox draws), less: the moved
   task itself (and each of its own times), **done tasks** (they never move and never push; an overlap with one is
   left as it is), **quick reminders** (no length, `isQuickReminder`), **breaks** (see 4), **rows inside a shift** (they
   are part of their shift, see 3), events and subscribed calendars (they cannot be moved here, see question 4).
2. **The chain**: sort the blockers by start. Walk from the moved task's end `e`. The first blocker that starts before
   `e` (and ends after the moved task's start) moves to start at `e`; `e` becomes its new end; then the next blocker that
   starts before the new `e` moves, and so on. **It stops at the first blocker that already starts at or after `e`**
   (the first gap big enough). A blocker that starts before the moved task and only overlaps its start also moves to
   `e` (chosen here: the dropped task wins the time it was dropped on; question 1).
3. **Shifts**: a shift is one blocker with its own span. When it moves, the tasks wholly inside it move with it by the
   same amount (`carryBreaks` rules), listed in `carried`, and **count once**: the chain goes on from the shift's end, not
   from the end of anything inside it. A task **dropped inside** a shift's time (the shift is longer and holds it) does
   not push the shift or its rows: it becomes a row of the shift, as today. A dropped shift pushes what overlaps its own
   span and carries its rows.
4. **Breaks stay drawn as gaps**: a break never moves and is never pushed (chosen here: a break is a **wall**). A pushed
   task that would overlap a break jumps to the break's end; the chain goes on from there. A pushed task never becomes a
   break's guest and is never cut by the push (question 3).
5. **Midnight**: nothing is pushed past 24:00 (no task's new end after 1440, and nothing goes to the next day). When the
   chain cannot fit before midnight, **no task is pushed at all** (all or nothing): the drop itself still happens as it
   does today (side by side), and the note says "Not enough room before midnight to push 2 tasks. They overlap for
   now." with Undo for the drop (question 2).
6. **A repeating day** is pushed as that day only: `editThisDay` stores the day row; the series template (the root
   row) is never changed, and a series' FIRST time is never sent to every repeat day (a push does not use
   `editRepeatingTime`). A projected day (shown, not stored) is stored by its push.
7. **A task with several times a day**: only the time that overlaps is pushed (`multiDropPatch` rules); refused when it
   would overlap another time of the same task (the whole push then stops as in 5).
8. **Past times**: a push never moves anything onto a past day; on today, tasks that ended before now are not blockers
   (chosen here; they are late, not in the way).

## Where it runs (phone and desktop together)

**`lib/pushAfterActions.ts`** (shared, storage): `applyPush(plan)` writes every move in **one gesture**
(`stack.markGesture()`), each with the usual write (`patchTask` for a one off task, `editThisDay` for a repeating day,
`setTimeAt` for one of several times, `carryBreaks` for what a pushed shift holds), and returns the rows before, for the
phone's Undo (`earlierUndo.undoRows`).

| Path | Desktop file | Phone file |
|---|---|---|
| **Drag** (a drop on a time) | `components/desktop/DragProvider.tsx` (the Timebox and Calendar drop) | `app/(tabs)/calendar.tsx` (the Day view drop) |
| **Resize and nudges** (Shift+Up/Down, Up/Down on a block) | `TimeBlock.tsx`, `DragProvider.tsx` resize | none on the phone |
| **Edit time** (a new time or length in the details) | `TaskDetailPanel.tsx` (time and length fields) | `components/phone/TaskDetails.tsx` (`timePatch`, `durationPatch`) |
| **Add flow** | `QuickCapture.tsx` (a phrase with a time) and the D4 add dialog when built | `lib/stepAddActions.ts` `stepStore` and `stepPatch` (shared since D1, so one change serves both) |
| **Plan flows** | `PlanMyDay.tsx` drop onto the Timebox goes through DragProvider | Plan my day's **A time** (`lib/planActions.ts`) |

Every path calls `pushPlan` after its own refusals (a past day, a break the task does not fit) and before its write.

- **Undo after every push**: the Undo bar says "Moved Gym to 15:00 and pushed 2 tasks later" with **Undo**, which puts
  the drop and every push back. Desktop: `offerUndo` and one Ctrl+Z (one gesture). Phone: the `UndoBar` / Calendar
  notice with the rows written back.
- **Phone shift carry**: the phone's drag and details gain the desktop's `carryBreaks` when a shift moves (so a pushed
  shift and a dragged shift both carry their rows on both apps). This is a behaviour change on the phone (question 5).
- **A setting** (question 6): Settings, "Push later tasks when times overlap", on by default, synced as a
  `user_settings` row `push.after` (no database change). Off keeps today's side by side behaviour.

## Tests

- **`lib/pushAfter.test.ts`** (pure): no overlap returns null; one overlap pushes one; a chain of three stops at the first
  gap big enough; a blocker that starts before the drop and overlaps its start; a done task is neither moved nor a
  blocker; a quick reminder is ignored; a shift moves with its rows (carried) and the chain continues from the shift's
  end; a drop inside a shift pushes nothing; a break is a wall (the pushed task jumps to its end); a chain that would end
  after 24:00 is refused whole; a repeating day is a `projected` or day row move and never touches the root; one time
  of a multi time task; tasks that ended before now are not blockers; the order of equal starts (by title).
- **`lib/pushAfterActions.test.ts`** is not possible in node (storage); covered by the real checks.
- **Desktop real check `p71`** (quiet, synthetic pointer drag through `DragProvider`, as `I.drag`): a drag onto a busy
  hour pushes the chain, the Undo bar says how many, one Ctrl+Z puts all back, a shift carries its rows, a break wall, the
  midnight refusal note, a repeating day pushed with the root unchanged; edit time in the details pushes too.
- **Phone real check `phone-p34`** (390 x 844 touch): the Day view drag pushes, Undo puts back, the details time pushes,
  the add flow's time pushes, a shift carries its rows (new on the phone).
- **Pointer only checks to rerun by hand**: `cp8b` and `p37` (drag), `cp8g` and `cp8h` (the Timebox and repeating),
  `p20` (several times a day), `p26` (this day only), `p40`; any that drop onto a busy time on purpose must be updated.

## Phases

| # | Version | Phase | Model |
|---|---|---|---|
| P1 | next minor | `pushAfter.ts` + tests (the rule only) | Opus |
| P2 | +0.1 | `pushAfterActions.ts`; desktop drag, resize, nudges, details; Undo; the setting; `p71` | Opus |
| P3 | +0.1 | Phone drag, details, step add, Plan my day's A time; the phone shift carry; `phone-p34` | Sonnet |

## Risks

- **Sync**: a push writes several tasks at once. If the other device edits one of them before both sync, that task is
  last writer wins (the usual per task rule) and the chain can end up overlapping again; nothing is lost. A push on two
  devices at once can push the same task twice (later than needed); rare, and visible.
- **Surprise moves**: a drop now changes other tasks. The Undo bar must always say how many moved; the setting lets it
  be turned off.
- **Repeating days**: pushing a projected day stores a day row for it (as a drag of that day does today); many pushes
  of a daily series leave many day rows. Acceptable (that is how a day's own time is kept).
- **Resize on the desktop** pushes too (chosen here); a long resize can push a lot. Undo covers it.

## Questions (with recommended answers)

1. **A task that starts before the drop and overlaps only its start: push it too, or leave it?** *Recommended:* push it
   to after the dropped task (the dropped task wins the time it was dropped on).
2. **When the chain cannot fit before midnight: refuse the whole push and drop side by side (as today), or push what
   fits and leave the rest overlapping, or move the rest to tomorrow?** *Recommended:* refuse the whole push, keep the
   drop, say so in the note. Never move anything to tomorrow by itself.
3. **Breaks: a wall (pushed tasks jump past it) or free to cover (the push lets the existing cut split the task)?**
   *Recommended:* a wall, so a break is never filled by a push.
4. **Events and subscribed calendars (ICS): do they block a push?** *Recommended:* no; they cannot be moved here and
   tasks already sit beside them. A later choice can make them walls.
5. **The phone gains the desktop's shift carry (a dragged shift moves what is inside it)?** *Recommended:* yes, with this
   work, so both apps move a shift the same way.
6. **A setting to turn push after off, on by default?** *Recommended:* yes, synced, on by default.
7. **Resize and the keyboard nudges on the desktop push too, or only drag, edit time and the add flow?** *Recommended:*
   they push too (a longer task is "moved onto" the next one).
