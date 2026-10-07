# Decision 022 — Estimate and actual time, reported without judgement

**Date:** 2026-10-07
**Status:** Proposed — awaiting Jethro's confirmation

Source: Jethro's instruction for checkpoint 8.3 (reference: the Ellie planner).

---

**Decision.** A task has an **Estimated** time (the existing `durationMinutes`) and an **Actual** time (new `Task.actualSeconds`, whole seconds). A simple timer on the expanded card adds to Actual. The app only reports these numbers.

**Rules.**
- **No judgement.** No red, no over or under comparison, no streaks, no totals that rank anything, and no notifications from the timer. Estimated and Actual are shown side by side in the same quiet text.
- **Duration input.** Any whole minute from 1 to 1440 is a valid duration (the old 5 minute step is dropped for typing). The shared parser (`lib/duration.ts`) accepts `45m`, `45`, `1h`, `1h 30m`, `1h30`, `1.5h`, `130` (a bare number is minutes) and `1:30`, and rejects 0, negatives, over 1440 and text. A corrected Actual uses the same parser and also accepts 0.
- **One timer at a time.** The running timer is `{ taskId, startedAt }` under one key (`belific_timer`) in the main process store: local UI state, never synced, kept across closing the app. Elapsed time is computed from two timestamps, never by counting ticks, and is never negative if the clock goes backwards. Starting a timer stops the running one and adds its time.
- **Forgotten timers.** A run over 12 hours is never added automatically. Stopping it (or starting another task while it runs) asks inline: add it, or type a different time. Completing a task whose timer ran over 12 hours drops that run without adding it (there is nobody to ask at that point).
- **Gone tasks.** Completing a task stops its timer and adds the time. Deleting a task, or dropping it onto another task as a subtask, stops and clears its timer with no time added. At startup a stored timer whose task is missing, deleted or completed is dropped.
- **Repeats.** The next occurrence copies the estimate and starts with Actual cleared.
- **Sync.** `tasks.actual_seconds integer` (nullable), migration `20261007130000`, additive only. Capability probe, no send and keep-local on pull while the column is missing, queue when it appears, exactly as for migration 3. The iPhone carries the value through sync and shows nothing.

**Why.** Seeing how long things really take helps planning, but a number that is scolded or scored turns into pressure; the app stays quiet and lets the person read it.

## Related Notes
- [[docs/decisions/015-task-timebox-link]]
- [[docs/decisions/021-edit-on-the-card]]
- [[docs/DESKTOP_HOME_NAV_SPEC]]
