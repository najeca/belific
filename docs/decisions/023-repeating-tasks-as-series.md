# Decision 023 — Repeating tasks are series with projected occurrences

**Date:** 2026-10-07
**Status:** Proposed — awaiting Jethro's confirmation

Source: Jethro's instruction for checkpoint 8.4. Replaces the "completing a repeating task creates the next copy" behaviour **on the desktop** (it stays on the iPhone). Extends decisions 015 and 021.

---

**Problem.** A repeating task only created its next copy when the current one was completed, so a Daily task never showed across the week.

**Decision.** On the desktop a repeating task is a **series**. The board and the Timebox **show** an occurrence on every matching day from today forward. Nothing extra is stored, synced or counted: a projected occurrence is computed (`mobile/lib/series.ts`) every time it is drawn.

**What a series is.** Every stored task row whose id is `${root}` or `${root}:${date}` (the existing occurrence id scheme). The **template** is the latest live (not deleted) stored row by its Day. It decides the title, label, priority, estimate, notes, start time, reminder and the repeat rule of every projection. Its completed state, completion time and subtask ticks are **ignored**: a projection is always not completed with every subtask unticked (ids `${occurrenceId}:sN`, the same as the copy a tick stores). Rules: daily; weekly with weekday chips; every 2 weeks counted from the template's own Day; monthly with the existing clamp (the 31st falls on the last day of shorter months).

**Where a projection appears.** From today forward only, never before the series' first row, never on a day that already has a stored row (live or tombstoned, by Day or by id date), never in the left list. A stored occurrence on a past day that was not completed is **not** carried forward (it is no longer shown as overdue) and not projected; the routine simply shows on its next matching day. Label filter and Show complete apply to projections like to any task.

**Ticking** a projected card, or one of its subtasks, stores **that day's** occurrence as a real task (`rootId:date`, completed or with the tick) and changes nothing else. Completing a stored repeating task on the desktop **no longer creates the next copy** (the next day is already shown). A repeating task with **no Day** has nothing to project from and still gets its next dated copy when completed. The iPhone is unchanged: it shows only stored tasks and still creates the next copy through `setTaskCompleted`; a stored copy made by the phone is just a stored day (no duplicate).

**Editing a projected card edits the series.** The fields a card edit patches: title, label, priority, estimate (duration), repeat, reminder, notes, the subtask list and the start time. They are written to the template row **and** to every open stored row of the series dated today or later, so all days read the same. Completed rows other than the template, past rows and tombstones are untouched. Patching a completed template never changes its Day, its completed state or its completion time (the subtask list of a completed template stays all done; an open one keeps the ticks of subtasks that remain). The card and block popover show the quiet line "Repeating: changes apply to every day". Ticking is always per day.

**Dragging.** A projected card or block can only be dropped on the **Timebox**: that sets the start time (and the estimate if it had none) of the whole series, so a daily 05:00 routine shows at 05:00 every day in the columns and the Timebox. It cannot be dropped on another Day column or the left list (no highlight; the lifted card says "Repeating: set Repeat to Does not repeat to move it"). Neither a projected nor a stored repeating card can be merged into another card as a subtask (it would leave the series without rows). Resizing a projected block changes the estimate of the series.

**Skip this day** is a tombstoned stored occurrence with that day's id (a copy of the template with `deletedAt`, keeping the repeat rule). It uses the existing tombstone mechanism: sync needs no new column, and tombstones always win, so every device hides that day. A skip tombstone never decides which row is the template (live rows come first) and never ends a series; it is the template of last resort only when nothing else is live (skipping the only row). The local tombstone prune (90 days) keeps a tombstone whose occurrence day is today or later, so a skip far ahead is not forgotten.

**Ending a series must never resurrect.**
- **Does not repeat** (from any card, stored or projected) clears the repeat rule on **every** stored row of the root, tombstones included (a batch of normal edits, synced like any other). So no earlier row can restart projections, and a skip tombstone dated later cannot either.
- **Delete repeating task** (overflow menu of any repeating card, inline confirm "Delete this repeating task? Yes / No", no second step) tombstones every non completed live row and clears the rule on every other row (completed history stays but stops repeating; older tombstones lose their rule).
- A series is alive only while its template has a repeat rule. Deleting the last row of an ended series changes nothing. Two devices that both delete the series merge to the same result (tombstones win).
- Known limit: a device that has not synced yet and ticks a projected day creates a new row carrying the old rule; once that reaches the others it can look like the series came back. Syncing first avoids it.

**Reminders (decision 017 and 020).** The 48 hour notification payload includes projected occurrences: timed ones as placed tasks with their own reminder lead, untimed ones for the grouped daily reminder (not completed). The scheduler is unchanged: de-dupe and cancel on change work as before, because a projected occurrence has the same deterministic id as the stored one it becomes.

**Existing stored repeating tasks need no migration.** Each series' latest live row becomes its template: days after it start to show immediately and its stored copies stay as they are. No database change, no new column, no migration file.

**Why.** The person plans a week: a routine should be visible on the days it happens without ticking yesterday's to get tomorrow's. Showing instead of storing keeps the data model (one row per real occurrence) and sync untouched.

## Related Notes
- [[docs/decisions/015-task-timebox-link]]
- [[docs/decisions/017-desktop-notifications]]
- [[docs/decisions/020-daily-planned-tasks-reminder]]
- [[docs/decisions/021-edit-on-the-card]]
- [[docs/decisions/024-timebox-24-hours-day-start-overnight]]
