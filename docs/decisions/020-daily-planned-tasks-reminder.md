# Decision 020 — Daily reminder for planned tasks without a time

**Date:** 2026-10-06
**Status:** Proposed — awaiting Jethro's confirmation
**Note:** Extends decision 017. Decision 002 (local only) and the "no engagement bait" rules still hold.

---

**Decision.** The desktop sends at most **one** grouped notification per day for tasks that are planned for that day (they have a Day) but have **no startTime**, for example "3 tasks planned for today".

- **When:** one global time, default **09:00**, adjustable in Settings, with an off toggle (on by default; it can be turned off in one click).
- **What counts:** tasks whose Day is that day, with no `startTime`, and **not completed**. Completed tasks are excluded. If the count is zero, nothing is sent (no "you have no tasks" message).
- **Never:** one notification per task, a repeat or "nag" later the same day, a counter or badge, overdue or streak wording, or guilt language. The wording is a plain count and nothing else.
- **Why it fits:** placed tasks and events already notify at their own time (decision 017), because they are commitments. A task with only a Day has no time to notify at, so one calm morning summary is the only thing that makes it visible without a window open. It is tied to something the user planned, not to engagement.
- **How:** the main process owns it, like the other notifications (`desktop/src/scheduler.js`). It is planned from the next 48 hours of data the page sends; the count is recomputed whenever data changes, so a task added or completed before 09:00 changes the count. If the app is not running at 09:00 (or the computer was asleep more than 3 hours past it) that day's reminder is skipped, never shown late.
- **Not on iOS.** The iPhone is unchanged. If this is liked, an iOS version can follow in a later release.

## Related Notes
- [[docs/decisions/017-desktop-notifications]]
- [[docs/decisions/002-local-notifications-only]]
