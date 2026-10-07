# Decision 024 — The Timebox is 24 hours, with a day start you choose and overnight tasks

**Date:** 2026-10-07
**Status:** Proposed — awaiting Jethro's confirmation

Source: Jethro's instruction for checkpoint 8.4 (night shift workers must work as well as day workers).

---

**Decision.** The desktop Timebox shows the whole day, **00:00 to 24:00**, with an hourly label on every hour (25 labels, 00:00 to 24:00), faint half hour lines and the existing 30 minute snapping. No other part of the app assumes a daytime schedule.

**"My day starts at".** A new setting in the desktop Settings modal (Planning section), a time in 30 minute steps, default **05:00**. It is UI state in the main process settings store (`belific_desktop_settings.dayStart`, validated, never synced, never a task or event column). It only decides where the Timebox **opens**:
- Any day other than today opens scrolled so the day start is at the top.
- Today opens about an hour before the current time, never earlier than the day start once the day has started. Before the day start (the small hours of a night shift) it is an hour before now.
- The grid has spare room under 24:00 so any time up to 23:30 can be scrolled to the top.

**Overnight tasks.**
- A task belongs to the Day it **starts** on. If its start time plus its estimate passes 24:00, its block runs to 24:00 in that day's Timebox with a quiet "continues" marker, and the rest is drawn at the top of the **next** day's Timebox as a lighter dashed block labelled **"Continues from yesterday"**, from 00:00 to the end time.
- The continuation is **derived every time it is drawn, never stored**. It is not a task, an event or a row; nothing syncs for it. Clicking it opens the same task popover as the original block.
- Moving and resizing is done from the original block only. Resizing may extend past midnight, up to the 24 hour limit; dropping a block near the bottom of the day (latest start 23:30) can place it so that it runs past midnight. The chip keeps showing the full estimate. A task is at most 24 hours long, so its rest always fits in the next day.
- Time scheduled in a day's header counts only that day's part; the continuation counts in the next day.

**Column order (checkpoint 8.4, part D).** Inside a Day column: tasks without a start time first (the existing order: carried over from a past day, High priority, oldest created), then tasks with a start time, earliest first, then completed tasks (most recently completed first). A task carried over from a past day keeps its old start time but counts as untimed here. No manual reorder.

**Why.** A 06:00 to 23:00 grid hid a night shift's work and made a late drop impossible. Showing every hour and letting the person say where their day begins fits any lifestyle without a setting that changes what exists in the data.

## Related Notes
- [[docs/decisions/015-task-timebox-link]]
- [[docs/decisions/019-desktop-drag-pointer-events]]
- [[docs/decisions/023-repeating-tasks-as-series]]
