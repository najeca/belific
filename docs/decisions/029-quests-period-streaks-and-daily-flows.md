# Decision 029 - Quests, period streaks, Every year, and the daily flows

**Date:** 2026-10-16
**Status:** Proposed. The rules marked "Jethro" were his decisions for phases 4 and 5; the rest are the choices made while building them (listed in `docs/build-progress.md`). Confirm after using the Quests screen and the two flows.

Source: the phase 4 and 5 brief and Jethro's answers of 2026-10-16. Builds on decisions 007 (honest streaks), 023 (repeating tasks are series), 027 (no XP; streaks only on recurring tasks) and 028 (timer, shortcuts, layout).

---

**Quests.**
- A quest IS a repeating series. There is no second routine concept (Jethro). Daily is the daily series; a routine converted in 2.16.0 is the daily series `rt_<routineId>`, and its old routine_completions count as its days before its first row.
- Sections: Daily, Weekly, Every 2 weeks, Every few weeks (every 3 weeks; Jethro), Monthly, Every year, and Other repeats for a rule this version does not know, so no repeating task is hidden.
- Due state for the current period: "Due today", "Due this week" (an earlier day of the period not done yet), "Done this week", "Skipped this week", "Next: Fri". One tap completes the earliest undone scheduled day of the period up to today, else the next one this period, done early (Jethro). A second tap on a done quest reopens the latest done occurrence of the period.
- Planned skip is the existing "Skip this day" tombstone. It cannot be unskipped (tombstones win).
- Today puts the target occurrence on today's plan (its Day becomes today). Timebox on the desktop also gives it the next half hour; it can be dragged afterwards. Neither is offered for the series' root row.

**Period streaks (Jethro).** Days, weeks (Monday to Sunday), fortnights and stretches of 3 weeks (counted from the series' own week), calendar months, calendar years. A period counts when every scheduled day in it is done or skipped and at least one is done; a period where every day was skipped is neutral; a scheduled day not done ends the run with no wording about it. The current period never ends a run: unfinished it is neutral, complete it counts. Streaks are derived from the stored rows, never stored. Only current and best are shown, never a zero.

**An occurrence stands for its own day.** The series template and the rule's anchor read the date in the occurrence's id (`series.ownDay`), not its Day field, so an occurrence moved to another day (a quest on today's plan) never moves the rule, the template or the streak.

**Every year.** Stored as `annual` in the existing rule text, with its date number in `recurrence_month_day` (no schema change). Feb 29 falls on Feb 28 in other years and comes back on the 29th in a leap year (Jethro). An older Belific keeps the rule (phase 1). The Repeat control warns that every device must be updated and needs "Every device is updated" ticked before an annual repeat is first applied (Jethro).

**Skip tombstones.** Monthly and annual skips are kept locally for ten years (their streaks look back that far); every other skip 400 days, as before.

**iPhone.** Brain Dump captures tasks; old Brain Dump items are left as they are until edited, then become tasks (the desktop's path; nothing moves in bulk). Convert routines in Settings, Data has the desktop's dry run, confirmation and Undo, without the desktop's backup step (the phone has no backup folder). It never runs by itself.

**Daily Planning and Daily Shutdown.**
- Full screen overlays with a step rail. Everything is a draft until Finish; Cancel or Escape changes nothing (Jethro).
- Rollover runs only on Finish, never on launch; it moves a task only if its Day is before today (Shutdown: is today, and was chosen) and it is not complete; a placed task keeps its time; never a row of a repeating series (Jethro). It is worked out from the latest stored rows when Finish is pressed and is idempotent, so two devices cannot disagree.
- In step 4 of Planning a time is chosen from a list of half hours rather than by dragging (the flow is a draft, and the drag layer belongs to the Timebox).

## Related Notes
- [[docs/decisions/007-honest-routine-gamification]]
- [[docs/decisions/023-repeating-tasks-as-series]]
- [[docs/decisions/027-no-xp-streaks-on-recurring-tasks-only]]
- [[docs/decisions/028-desktop-timer-shortcuts-and-layout]]
- [[docs/belific-build-plan]]
