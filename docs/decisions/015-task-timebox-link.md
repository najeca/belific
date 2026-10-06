# Decision 015 — Task to Timebox link and the meaning of a task's day

**Date:** 2026-10-05
**Status:** Proposed — awaiting Jethro's confirmation
**Note:** the most important record in this set.

Source: `docs/OPUS_PLAN_REVIEW.md` section 3.

---

**Decision.** A Task is placed on Timebox by giving it a time, not by copying it into an event.

- `dueDate` is redefined as **the day the task is planned for** ("Day" in the UI), not a deadline. The kanban moves tasks by changing it. Existing iOS behaviour (Top 3 sorts past days first) still makes sense under that reading. Hard deadlines are not modelled now, and if they are ever needed they become a separate `deadline` field.
- New `Task.startTime?: 'HH:mm'` and `Task.durationMinutes?: number`. A task appears on Timebox when it has both a `dueDate` and a `startTime`. Block height comes from `durationMinutes`, defaulting to 30. Duration chips 15m, 30m, 1h and 2h+ write 15, 30, 60 and 120, and resizing a block writes any value in 15 minute steps. *(Superseded on desktop: 30 minute steps since 2.8.0, and since 2.8.1 the chips are 30m, 1h, 2h plus Custom up to 24 hours; see `mobile/lib/duration.ts`. Stored 15 minute values still load.)*
- Dragging a block to another day changes `dueDate`, so the kanban follows automatically. Unplacing clears `startTime`. Completing the task on any surface completes the one row. Nothing is double counted, because there is only one row.
- **CustomEvents** stay as they are, for fixed commitments: work shifts, appointments, the weekly schedule. Timebox renders both events and placed tasks. Promote from Brain Dump to event keeps its copy semantics.
- The 2.1.0 iOS app ignores the new columns, and its partial upserts preserve them on the server (verify this once, see section 4).

**Rejected:** a `taskId` link on CustomEvent. It means two rows, cascade rules in app code, sync conflicts across two rows, and double counting.

## Related Notes
- [[docs/OPUS_PLAN_REVIEW]]
- [[docs/decisions/009-desktop-platform-and-auth]]
