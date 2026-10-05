# Belific — Ubiquitous Language

Use these exact terms in all code, docs, and conversations.
Never invent synonyms.

> [!NOTE] Updated 2026-09-04. This file previously said streak tracking
> "does not exist" and warned against adding one — that predates
> `docs/decisions/007-honest-routine-gamification.md`, which approves a
> streak count (plus vacation mode and an open-app check-in), built the
> honest way (no loss-framing, no urgency, fully reversible). As of this
> update the feature is **specced, not yet shipped** — see
> `docs/ROUTINE_GAMIFICATION_SPEC.md`. Also removed: Pomodoro/Session,
> which no longer exist in the app (removed in v2.1.0, see
> `docs/TIMEBOX_AND_NAV_SPEC.md`).

---

## Core Terms

| Term | Definition |
|------|-----------|
| **Custom Event** | A user-created scheduled item (`CustomEvent` — title, category, start/end time, date, notes) |
| **Template Event** | A recurring weekly-schedule or starter-routine event, not user-created — never generates a notification |
| **Category** | The type of an event (work, fitness, cyber, etc.) — see `CATEGORIES` in `lib/data.ts` |
| **Brain Dump** / **Dump** | The quick-capture space for spontaneous, title-only thoughts with no date/time required upfront (`BrainDumpItem`). Tab/header say "Brain Dump"; internal type name stays `BrainDumpItem`. |
| **Promote** (to a Custom Event) | Scheduling a Brain Dump item via the event form — this **copies** it onto the calendar as a real `CustomEvent`; the dump item is left untouched in Dump (reversed from an earlier copy-vs-move design; see decision history in `docs/CHANGELOG.md` 1.1.0) |
| **Promote** (to a Task) | Converting a Brain Dump item into a `Task` — this **moves** it: the Task is the item's final form, the dump item is deleted. Opposite behavior from promoting to a Custom Event — deliberate, not an inconsistency (a Task has no calendar slot to "also" occupy in Dump). |
| **Task** | A to-do with an optional due date (no fixed time) and priority, distinct from both `CustomEvent` (always has a concrete date/start/end) and `BrainDumpItem` (no due date at all) — see `lib/types.ts`. Screen: `app/tasks.tsx`, reached from Today's "Top 3 tasks" section, not a tab. |
| **Duration estimate** | Optional `durationMinutes` on `Task` (15, 30, 60, 120 from the chips; see `docs/DESIGN_VISION.md` §2). The block size when a Task is placed on Timebox. |
| **Plan** (view) | Day-assignment view over a Task's `dueDate`. On desktop it is the weekly kanban (decision 009). The mobile List/Plan segmented view is deferred; not built. |
| **Kanban** | The desktop Plan: one column per day plus an Unscheduled column. Tasks sit under the day they are planned for. |
| **Day** | A Task's `dueDate`, redefined in decision 015 as the day the task is **planned** for, not a hard deadline. Absent means Unscheduled. |
| **Placed task** | A Task with a Day and a `startTime`, shown as a block on Timebox. Sized by `durationMinutes` (default 30). One row, never copied into a `CustomEvent`. |
| **Label** | The UI word for a `Project`: a tag with a colour (decision 016). A Task has one. Not to be confused with a Custom Category (events only). |
| **Quest** | The UI word for a Routine, shown in the Quests panel on desktop. Same data type, no separate "quest" table. |
| **XP event** / **Level** | Proposed (decision 014): an append-only ledger row for a completed routine or task, and the level derived from lifetime XP. Not built. |
| **Desktop Home** | The three-pane workspace on desktop (Brain Dump, kanban, Timebox), web/Electron only, shown at width 1024 or more. |
| **Routine** *(habit sense)* | A repeating daily habit tracked via a done/not-done toggle per day (`Routine` + `RoutineCompletion`) — grouped Morning/Afternoon/Evening on Today. Currently a single toggle with no streak tracking; `docs/ROUTINE_GAMIFICATION_SPEC.md` (approved by decision 007) adds an optional per-routine checklist ("quest") of `RoutineStep`s, a derived streak count, vacation mode, and an open-app status check-in — all honest, reversible, no loss-framing. Not yet shipped. |
| **Routine step** / **quest step** | One checklist item within a Routine (planned — `RoutineStep`: title only). A Routine is "done today" once every active step is checked; no partial-progress meter is ever shown. |
| **Streak** | Consecutive days a Routine was completed, derived (never stored) — planned per decision 007, honest by design: no loss-framing, no risk countdown, silent on a broken streak, shown only at 2+ days. |
| **Vacation mode** | Planned global + per-routine toggle that pauses streak accounting (and the open-app check-in) for the paused range, without losing history — see `docs/ROUTINE_GAMIFICATION_SPEC.md` §2. |
| **Routine** *(category sense)* | Also the name of one of the 14 built-in event Categories (`routine` `CategoryKey`, 🔄 icon) — an unrelated, pre-existing sense of the word. Context (a Today section vs. an event's category chip) disambiguates; not worth renaming either one for a naming overlap this minor. |
| **Project** | A lightweight tag/filter label (`{ key, name }`, a colour planned) that a Task can optionally carry. Called a Label in desktop UI (decision 016). Not to be confused with the `project` `CategoryKey` (unrelated, pre-existing). |
| **Reminder** | A custom user-created local notification with its own time and message (`scheduleCustomReminder`) — distinct from an event-start notification |
| **Timebox** | Hourly grid view of one day's Custom Events and placed Tasks, distinct from Calendar's month grid — see `docs/TIMEBOX_AND_NAV_SPEC.md`. Desktop pane is being built first; the mobile tab is not shipped. |

---

## App Name

**Belific** — always capitalised exactly this way. Never "belific" or "BELIFIC" in user-facing text.

---

## Category Colours

Current values (light/sage-cream theme, v2) live in `mobile/lib/data.ts` — do not hardcode them here, as they've already drifted from a stale copy once. Check `CATEGORIES` and `DAY_TYPES` in that file directly for the source of truth.

---

## What Not To Call Things

| Wrong | Right |
|-------|-------|
| "timer" / "Pomodoro" | Removed from the app entirely (v2.1.0) — do not reintroduce or reference as if it still exists |
| "push notification" | Notification (all notifications are local) |
| "block" (for a scheduled item) | Custom Event (if user-created) or Template Event (if from the weekly schedule) |
| "task" (for a scheduled/timed item) | Custom Event or Template Event — "Task" is a real, distinct type now (undated to-do), don't use it loosely for anything with a fixed time |
| "note" / "scratch item" | Brain Dump item |
| "alert" | Reminder (only for the custom-message type; event-start notifications are just "event notifications") |
| "streak at risk" / any loss-framing streak copy | Not permitted anywhere — decision 007 approves a plain, honest streak count only; see that decision before touching streak copy |

---

## Related Notes
- [[design-identity]]
- [[architecture]]
- [[current-state-audit]]
- `docs/DESIGN_VISION.md`, `docs/ROUTINE_GAMIFICATION_SPEC.md`, `docs/TIMEBOX_AND_NAV_SPEC.md`, `docs/decisions/007-honest-routine-gamification.md`
