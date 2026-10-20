# Belific Part B plan (desktop, from 2.28.1)

Status: **draft for Jethro's approval.** No code written. Nothing live changes without Jethro's explicit go.

## Problem
In Calendar week view, a 20 minute "Short break" at 11:00 inside a 7 hour boot camp block (9:30 to 16:30, daily) is drawn in a narrow lane beside it. Since 2.28.0 titles wrap in full, and the style used (`overflow-wrap: anywhere`, my 2.28.0 choice) breaks words in the middle ("Leep Tal ent On line"). There is only one reminder per task. High priority tasks are not actually shown first anywhere except the Missed list. The details row says "Shown first, with a ❗ marker", which is untrue today.

## Aim
A break can cut a long task into full width pieces stacked in one column, as in Jethro's drawing. Timed tasks can have several reminders. Top priority comes first where it helps. All of this without losing data on older devices.

## Existing solutions (one line, from memory, not searched)
Google Calendar and Outlook never split events; they only use side by side lanes. Motion and Sunsama split tasks around fixed events, but only by rescheduling them. Belific's version is different: display only. The task keeps its stored time, and the pieces are derived.

## Audience
Jethro, one person on Windows, with an iPhone later. Keyboard and screen reader names must keep working.

## Objectives (each checked by a real Electron check unless noted)
1. With "Cut tasks underneath" on, the break's example renders as three full width boxes: "9:30am 7h", the break "11:00am 20m", then "11:20am 5h 10m left". There are no lanes.
2. No title breaks in the middle of a word in any lane width.
3. A timed task can carry several reminders (for example at start and 5 min before), and each fires once while the app runs.
4. Top priority untimed tasks are listed first in each day, and a top priority block is drawn first and on top in overlaps.
5. An older client syncing these rows never erases the new values (unit test against the fake server, plus one live check after the migration).

## Non goals
No automatic rescheduling of tasks. The phone gets no cut pieces and no extra reminders before the iPhone catch-up release. No reminders while Belific is fully quit. No change to how a break is stored as a task.

## Decisions (recommended)
- **Pieces are derived, never stored**, like today's "continues" blocks (`lib/timebox.ts` `continuationOf`). Moving, resizing or deleting the break or the host recomputes them. The host task row is never changed by a cut. A press, drag or resize on any piece acts on the whole task.
- **Where the cut is computed:** a new pure `lib/cuts.ts`, run per day after series projection and continuation, before `layoutItems`. The Calendar and Timebox both use it.
  - Only breaks cut, and they never cut each other (overlapping breaks keep lanes).
  - Every leftover piece must be at least the minimum (setting 15, 30 or 60, default 30). Otherwise there is no cut for that host on that day, and a note is shown.
  - Rules:
    - A break that runs past the host's end cuts only the part inside the host.
    - A break covering the whole host is not a cut. It falls back to lanes with a note.
    - Three breaks in a day: subtract all of them, then check every piece.
    - Recurring tasks: each projected occurrence is cut on its own day.
    - Overnight tasks: the piece after midnight and its "left" time use the task's true end.
- **Piece labels:** the first piece shows the start and the full length ("9:30am 7h"). Each later piece shows its start and the time left to the task's end ("11:20am", "5h 10m left"). The pieces of one host share its colour. The break keeps its label colour, or the plain neutral if it has no label (grey in the drawing). No new colours.
- **The "not cut" note:** a small line on the break's block when it fits, plus its tooltip, for example "Not cutting Boot camp: a piece would be 10 min (minimum 30)".
- **Word breaking:** use `overflow-wrap: normal` and `word-break: normal`, so lines break only at spaces. A single word wider than its lane is clipped at the edge, and the tooltip has the full text. This applies to every block, chip and continuation.
- **Existing "Short break" data:** nothing changes automatically. Jethro turns the switch on for his break once. If it is a repeating series, the switch is on the series root, so every occurrence cuts.
- **Reminders:**
  - A per task list of minutes before the start (0 = at start, maximum 1440, at most 5 entries).
  - The default list is in Settings, Notifications (default: at start).
  - The existing `reminderMinutes` stays the legacy single value: -1 still means off.
  - The Electron main process scheduler (`desktop/src/scheduler.js`) schedules one toast per entry. Projected repeat days are already in its payload.
- **When the app is closed:**
  - Closing the window keeps Belific in the tray (built in checkpoint 7), so reminders still fire.
  - Quitting from the tray stops them until Belific next starts.
  - Start with Windows already exists and is opt in. Plan: offer it once in the reminder settings, never turn it on by itself.
  - Reminders missed while the app was quit or the PC was asleep are not shown late (see Q4).
  - Windows Focus assist can hide toasts. Not verified: the scheduler re-arming after sleep and resume. This will be checked and fixed if needed.
- **High priority first (display only, nothing stored):**
  - Untimed tasks in each day column and the left pane: top priority first, otherwise the current order is kept (`mustDoFirst`, already written).
  - Timed tasks stay in time order.
  - Overlapping blocks: the top priority block takes the first, leftmost lane and draws on top.
  - Stored: only the existing `priority = 'high'`.

## Data and sync model: where the cut switch and reminders live
| Option | Live change | Older clients (iPhone 2.18.1 and earlier, desktop before Part B) | Verdict |
|---|---|---|---|
| **A. New columns** `belific.tasks.cuts_below boolean null`, `belific.tasks.reminders jsonb null` in a new file `004_part_b.sql` | Additive: two nullable columns, no default rewrite, no data touched | They send only the columns they know (`taskToRemote`, checked in the 2.18.1 source: no Part B or `user_settings` code), and an upsert updates only the columns sent, so **the new values are not erased**. Rows they create have NULL (no cut, default reminders). They never see the fields. | **Recommended**: one place, typed, deleted with the task, gated like migration 002 (capability probe; until applied the fields stay local and are kept on pull) |
| B. `user_settings` rows (`task.cut.<id>`, `task.reminders.<id>`) | No schema change | 2.18.1 does not sync `user_settings` at all, so it is safe | Works without a migration, but leaves orphan rows when tasks are deleted, puts per task data in the settings table, and a delete wins on sync (needs the `'0'` trick as for away days). Fallback if Jethro says no to a migration |
| C. Reuse an existing column (notes tag, a new `priority` value, an array in `reminder_minutes`) | None | **Unsafe**: older clients sanitise an unknown `reminder_minutes` to NULL and send it back on their next edit, which erases it. A notes tag is visible and editable as text. | Rejected |

**With A:**
- Belific also keeps writing the first reminder into `reminder_minutes`, so older clients still get one sensible reminder.
- If an older client changes `reminder_minutes`, the desktop's `reminders` list still wins. This is a known limit, written in CURRENT_TRUTH.
- The minimum piece setting is a synced `user_settings` row (`planner.cut_min`), which needs no schema change.
- The default reminder list stays on each computer, like today's notification settings.

**Before anything live (Jethro only, as for 002):**
1. Review `004_part_b.sql`, its rollback and the post-apply checks.
2. Make a backup: the scripts in `mobile/supabase/rollback/` plus a desktop Settings, Data, Export.
3. Apply it through the migration tool. **Never `supabase db push`.**
4. Run the checks: the columns exist, NULL counts equal the row counts, row counts are unchanged, RLS and grants are unchanged.

The rollback drops the two columns **and every value in them**. That is the only part that cannot be undone.

## Phases, in build order
| # | Version | What | Done when | Live? |
|---|---|---|---|---|
| P1 | 2.28.2 | Word breaking fix only | `p13`: no word is split at lane widths of 60 to 200 px; tooltips intact | No |
| P2 | 2.29.0 | B3 high priority first (display only); fix the untrue details text | `p13`: day and left pane order; leftmost lane and top in overlaps; nothing stored changes | No |
| P3 | 2.30.0 | Write `004_part_b.sql` (not applied), sync mappers, capability `partB`, local-only until applied | Unit tests: mapper round trip; an older client's upsert leaves the new columns alone (the fake server must update only the columns sent); local values are kept on pull while the columns are missing | No |
| P4 | 2.31.0 | B1 cuts: `lib/cuts.ts`, the details switch, the minimum setting, labels, note, Calendar and Timebox | Unit tests for every rule above; `p14`: the drawing exactly, three breaks, a repeating host, a break past the end, a whole cover, overnight, moving and deleting the break, the Timebox, the "not cut" note | No |
| P5 | 2.32.0 | B2 reminders: per task list, Settings defaults, scheduler, Start with Windows offer | Scheduler unit tests with a fake clock (several per task, none in the past, dedupe, -1 off, repeat days); `p15`: the list in the details and Settings, the payload sent to main; one real toast checked by hand | No |
| P6 | none | Jethro backs up and applies 004 | Post-apply checks pass; desktop sync carries `cuts_below` and `reminders` to the second computer (manual) | **Yes, Jethro only** |

Every phase ends with the usual full gates: tsc, unit tests, the security scan, the iOS export with 0 marker hits (`lib/cuts.ts` must stay out of the phone bundle or be added to the markers), and the full real check suite (p2 to p15, cp6 to cp12, run-cp7, run-cp8b, run-cp8f).

## Risks
| Risk | Likelihood | Impact | Reduced by |
|---|---|---|---|
| The fake server's upsert sets missing columns to null, unlike PostgREST, so a wipe test passes when it should fail | Medium | High | P3 adds a test of the fake itself; one live check in P6 with a known row |
| Rounded "left" times or the minimum rule are off by a minute at an edge | Medium | Low | Pure function, boundary tests (exactly 30, 29, midnight) |
| Drag on a piece behaves oddly (grab offset) | Medium | Medium | A piece maps to the host task, with the grab offset relative to the host start; covered in `p14` |
| Toasts silently missing after sleep or Focus assist | Medium | Medium | Re-arm on resume; say so in the hand checklist |
| Applying 004 on the shared project | Low | High | Additive only, backup first, Jethro applies, never `db push` |

## Legal, privacy, ethics
No new personal data beyond a switch and a list of minutes on existing task rows. Reminders stay local to the computer (no push service). Nothing new is shared with Landis or Proload beyond the shared project's columns. No reused code or licences.

## Open questions (reply "defaults" to take all)
1. **Storage:** new columns (A) or `user_settings` rows (B)? *Default: A.*
2. **Minimum piece setting:** synced across computers or per computer? *Default: synced (`planner.cut_min`).*
3. **A break covering a whole host:** keep lanes with a note, or hide the host for that day? *Default: lanes with a note.*
4. **Reminders missed while Belific was quit or asleep:** skip them, or show one summary when it starts? *Default: skip.*
5. **Priority first:** only untimed tasks and overlaps (as planned), or also put timed top priority tasks above earlier timed ones? *Default: untimed and overlaps only.*

## Success check (by hand at the end)
1. Turn the switch on for the 11:00 Short break. The boot camp shows the three stacked boxes from the drawing, every day of the week.
2. Move the break to 16:10: no cut, and a note says why.
3. Set two reminders on a task, close the window to the tray, and both toasts arrive.
4. A top priority task is first in its day.
5. After P6, edit the same task on the second computer; the switch and reminders survive.
