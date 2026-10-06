# Decision 021 — Edit tasks on the card, not in a modal

**Date:** 2026-10-07
**Status:** Proposed — awaiting Jethro's confirmation

Source: Jethro's instruction for checkpoint 8.2 (reference: the Ellie planner).

---

**Decision.** On the desktop a task is never edited in a full screen or centred modal. Every task card carries its own controls, and each opens a small popover anchored to the control, so many tasks can be edited in a row without leaving the board. The old task editor modal is removed. Events keep their own small editor.

**Rules.**
- One shared popover component: anchored to its trigger, below, flipping above or sideways to stay inside the window, at most about 320px high with its own scroll, no backdrop and no dimming (a press outside just closes it), one open at a time, closes on Escape, an outside press or a choice, focus moves inside and returns to the trigger, arrows and Enter navigate, and starting a drag closes it. Opening one never starts a drag.
- The card: title (click to rename in place), a duration chip (read only time for a placed task: `09:30 · 1h`), and icons for complete, repeat, subtasks (counter), priority, reminder and the label. Clicking the card body expands it in place (notes saved on blur, subtasks). A calendar icon on hover moves the task to a day; delete is in an overflow menu with an inline confirm.
- No time input exists anywhere: a task is placed only by dragging it onto the Timebox. The duration popover offers "Remove time". A placed block opens a small popover with the same controls.
- Subtasks (`Task.subtasks`, at most 50) and a per task reminder (`Task.reminderMinutes`) are new fields, synced through nullable columns (migration `20261007120000`, not applied). Ticking the last subtask completes the task through `setTaskCompleted`; ticking the task ticks all; unticking one reopens a completed task; a repeating task's next occurrence copies them unticked.
- Dropping a task onto another task's card adds it as a subtask only after about 300 ms of hovering with the "Add as subtask" highlight showing. Anything else is the normal Day drop. The dragged task is tombstoned and Undo (6 seconds) brings it back as a copy with a new id, because a tombstone wins every sync merge and may already be on the server.
- A Filter button beside the week label (labels, "No label", "Show complete", completed hidden by default) filters tasks on the board, the left list and the Timebox, never events. It is UI state, remembered in the main process store, not synced.
- A legacy phone Brain Dump item converts to a Task in place on its first edit, once, however many edits arrive together.

**Why.** A modal covers the page and has to be opened, saved and closed per task; the card makes planning a sequence of small edits.

## Related Notes
- [[docs/decisions/015-task-timebox-link]]
- [[docs/decisions/016-labels]]
- [[docs/decisions/017-desktop-notifications]]
- [[docs/decisions/020-daily-planned-tasks-reminder]]
- [[docs/DESKTOP_HOME_NAV_SPEC]]
