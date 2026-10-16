# Decision 030 - Trash restore, data export, power feature toggles, pomodoro, templates and the safe cache reset

**Date:** 2026-10-16
**Status:** Proposed. The Trash design and its two changes, the Phase 7 assumptions (one setting row per toggle and per template, due dates and reminders only hiding fields, attachments as "Coming later") were Jethro's decisions; the rest are choices made while building (listed in `docs/build-progress.md`). Confirm after using them.

Source: the phase 6 and 7 brief and Jethro's answers of 2026-10-16. Builds on decisions 013 (sync), 022 (estimate and actual time), 023 (series), 027 (no XP) and 028 (timer, shortcuts, layout).

---

**Trash.** A delete is a tombstone whose `deletedAt` equals its `updatedAt` (by parsed time) and which carries no repeat rule. The Trash shows the last 30 days (tombstones are kept longer for sync: 90 days, 400 for repeating days, ten years for monthly and annual skips). **Restore makes a NEW task** with the same fields and a deterministic id (`restored_<oldId>`, then `restored2_...`); the old tombstone is only touched, so it leaves the Trash on every device and a tombstone is never revived (they always win a merge). Two devices restoring the same entry write the same id, so they make one task. A deleted repeating task is one entry and restores as one plain task. Skipped days are never listed. **A task merged into another as a subtask** writes the same tombstone as a delete; it is told apart only by its effect (a live task has a subtask with the same normalised title, changed within 10 seconds of the tombstone or later). Such an entry is shown as "Merged into another task" with no Restore button. This is a heuristic and can be wrong in both directions; if merges ever need to be exact, the merge should record that fact (a schema or field change, so a decision for Jethro).

**Data export.** Settings, Data: JSON (nine tables) and CSV (tasks). Only data on the computer; deleted rows left out; anything whose key or field name looks secret is left out and counted; the message says how many rows were exported. A CSV cell that starts with `=`, `+`, `-` or `@` is written as text.

**Power feature toggles.** One `user_settings` row per toggle (`feature.<name>`, `on` or `off`) so a choice follows the person across devices. Off hides the field or screen and deletes nothing; a reminder already set keeps working. Defaults keep today's screens (reminders, priority, planning and analytics on); pomodoro and templates start off. "Due dates and reminders" hides only the reminder bell and option, never the Day (the board). Attachments are a "Coming later" row that cannot be on; no file is stored.

**Labels** is an overlay, not a page, with an emoji per label.

**Pomodoro** is a countdown over the one task timer. It starts the timer through the ordinary exclusive start, takes a break with the ordinary stop (whole minutes, rounded down, over 24 hours asks first) and never writes a minute itself, so the one timer rule and the rounding cannot be bypassed. No task timer runs during a break. It ends when its timer is stopped or another task's timer starts. Its state is local to the computer (never synced).

**Templates.** One `template.<id>` setting per template holding what a task describes (never progress), trimmed to fit one setting; 50 at most; deleted by a tombstone.

**Reset local cache and resync.** It uploads everything first and refuses, clearing nothing, unless the person is signed in, a full sync finished idle after the click, the outbox is empty and still empty under the storage lock. Only then it clears the local data and the sync bookkeeping and downloads everything again.

## Related Notes
- [[docs/decisions/013-sync-model]]
- [[docs/decisions/023-repeating-tasks-as-series]]
- [[docs/decisions/027-no-xp-streaks-on-recurring-tasks-only]]
- [[docs/decisions/028-desktop-timer-shortcuts-and-layout]]
- [[docs/decisions/029-quests-period-streaks-and-daily-flows]]
- [[docs/belific-build-plan]]
