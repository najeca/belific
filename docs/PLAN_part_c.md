# Belific Part C plan (desktop, from 2.34.0)

Status: **draft for Jethro's approval.** No code written. Nothing live changes, nothing is applied, without Jethro's explicit go.

## Problem
1. A task that happens several times a day (Short break at 11:00 and 15:00) has to be two task cards. The left pane, the planned hours and every edit are duplicated. Long Break (12:30, a different length) is a separate task and stays one.
2. The timer can't be started on some tasks. For a repeating task's day (the Boot Camp), the menu has no "Start the timer" row. The details panel's "(Start timer)" does nothing at all.
3. Jethro saw an "error loading Belific" message around the same time.

## Aim
One task card can have up to seven times in a day (its time plus six more), all the same length. Each time is drawn, cut, ticked and reminded on its own. The timer can be started on any task at any time, and can optionally count from the scheduled start.

## Existing solutions (one line, from memory, not searched)
Google Calendar and Outlook only offer separate events or a repeat rule, never "this event at 11:00 and 15:00". Todoist and TickTick repeat by day, not by several times in a day. Belific's version is one card with a short list of times, and every time is ticked separately.

## Audience
Jethro, one person on Windows, with the iPhone (2.18.1) synced. Keyboard and screen reader names must keep working.

## Cause found: timer (item 2)
This is read-only analysis of the 2.34.0 source.

- **What a "projected" day is:** each day of a repeating task, from today on, is only drawn. It isn't stored until something is done to it (`lib/series.ts`, `projectOccurrences`). Today's day of the weekly Boot Camp is one of these.
- **Menus:** the card and block menus hide the timer rows for a projected day (`TaskPopovers.tsx:694`, `!projected`). The `Ctrl+Shift+Enter` shortcut is also refused for a projected day (`TaskCard.tsx:145`).
- **Details panel:** it still shows "(Start timer)" for a projected day (`TaskDetailPanel.tsx:294`). Pressing it calls `startTimerFor`, which looks for a stored row with that id. It finds none and returns `missing`. `toggleTimer` ignores that outcome (`timerUi.ts:14-23`), so nothing happens and there is no message.
- **Start time:** I found no check on the start time anywhere in the timer code (`taskTimer.ts`, `timerSession.ts`). A non-repeating task whose start has passed should start normally. *Guess:* the passed start time was a coincidence, and the real trigger was that the task repeats.
- **The fix:** tick and subtask edits already turn a projected day into a stored row first (`seriesActions.ts` `materialise`). Starting a timer would do the same, so the timer rows are offered on every task. "Missing" would show a short note, never silence.
- **Count from the scheduled start:** a second menu row, "Start from 11:00 (25 min ago)". It is offered when one of the task's times today has started and less than 24 hours have passed. It sets `timerStartedAt` to that time. The 24 hour stale rule and "one timer at a time" stay as they are.

**"Error loading Belific":** no such text exists in the 2.34.0 source, the current web bundle (`mobile/dist`) or the Electron main process.
- The nearest message in the app is the error screen's "Something went wrong" (`app/_layout.tsx:45`).
- `desktop/logs/main.log` has nothing after 19 Oct. Page errors are not written there, only to the console.
- So I can't link it to the timer from the code. It may also have come from the 2.18.0 install that was opened by mistake that morning. See Q5.

## Objectives (each checked by a real Electron check unless noted)
1. **Start a timer on any day:** on a repeating task's today, "Start the timer" works from the menu, the shortcut and the details. The day is stored once, and the timer runs and syncs.
2. **Count from the start:** "Start from 11:00" on a task started 25 minutes ago shows 25:00 straight away. Stopping it adds 25 minutes or more.
3. **Several times on one card:** one Short break with 11:00 and 15:00 shows as two blocks on Calendar and Timebox, and one card in the left pane with "11:00am, 3:00pm". Planned hours count 2 × 20 min.
4. **Ticks per time:** ticking the 11:00 block leaves 15:00 open. Ticking both completes the task. On a repeating task this holds on every repeat day, with each day stored only when ticked.
5. **Split per time:** with Split on, each time of a break cuts the tasks it overlaps independently. A host with several times is cut per block.
6. **Reminders per time:** each time gets the task's reminder list (unit tests with a fake clock; one toast by hand).
7. **Older clients don't wipe the times:** a client that doesn't know the new columns never erases them. This is checked with a unit test against the fake server, plus one live check after the migration.

## Non goals
- No different length per time. Resizing one block changes the length of every time (this is said in the tooltip).
- Nothing like "skip only the 15:00 of this day". Skipping a day skips all its times; a single time is just left unticked.
- No automatic merge of the existing two Short break cards. Jethro adds 15:00 to one and deletes the other.
- No actual time tracked per time. The timer and actual time stay per task.
- No phone changes before the iPhone catch-up release.

## Decisions (recommended)
- **One list of times:**
  - `startTime` stays the earliest time. `extraTimes` holds the others, sorted, unique, as `HH:mm`, at most 6.
  - Everything is normalised on read. An older client that moves `startTime` past an extra time is sorted back on the next draw, and nothing is written until an edit.
  - Extra times exist only with a `startTime`. Clearing the time ("No time") clears them too.
  - Removing the earliest time promotes the next one to `startTime`.
- **A task's own times may not overlap.** A time that starts before the previous one ends is refused with a note (Q3). This keeps Split and lanes simple.
- **Completion per time:**
  - `timesDone` is stored on the row: the list of times ticked on that row's day.
  - `completed` (with `completedAt`) becomes true when every time is in `timesDone`. Unticking any time makes it false.
  - `completed = true` always means "every time done", whatever `timesDone` says. So a tick from the phone or an older desktop completes all times, and unticking one time on the desktop then expands the list first.
- **Repeating tasks:**
  - `extraTimes` is a series field. It is added to `TEMPLATE_FIELDS` and copied by `occurrenceFromTemplate`, like `cutsBelow` and `reminders`.
  - `timesDone` is never copied. Like `completed`, a projected day always starts with nothing done.
  - Ticking one time on a projected day stores that day first (the existing `materialise`), with `timesDone = [that time]` and `completed = false`.
  - Streaks count a day as done only when it is completed, meaning all its times. *Guess*, matching today's rule.
- **Adding, moving or removing a time** follows today's rule for editing a start time:
  - On a repeating task, it edits the template and every open row from today on (`seriesEditTargets`). Completed and past rows never change.
  - On a row that is already partly ticked:
    - A moved time keeps its tick. The entry in `timesDone` is renamed.
    - A removed time drops its tick. If every remaining time is done, the row completes.
    - An added time is not done, so a completed row reopens.
- **Drawing:**
  - Each time is its own block, with the id `${taskId}@HH:mm`. The `@` is new and never appears in task ids, which use `:`. Continuation ids follow the same pattern (`cont:${taskId}@HH:mm`).
  - Every place that maps a block id back to its task strips the `@` part. This is one helper with a unit test.
  - The cut code (`lib/cuts.ts`) already works per block id, so each time is cut, and cuts, on its own. No rule changes.
  - Dragging a block moves only that time. Resizing changes the length of every time.
  - A time past midnight continues into the next day as today.
  - Late fading (`lateTasks.ts`) works per block for non-repeating tasks.
- **Left pane and totals:**
  - One card, with its times listed after the title ("11:00am, 3:00pm").
  - The card's tick ticks every time (Q2). Each block's tick ticks only its own time.
  - Planned hours (`taskTotals.ts`) multiply the length by the number of times not yet done.
- **Details panel:**
  - The Time row lists each time with a small ×, then one quiet "+ Add another time" link.
  - The link adds a time input, pre-filled with the last time plus the length, rounded up to the half hour. It hides at 7 times. There is no wizard.
- **Reminders:**
  - The task keeps one reminder list. The Reminder menu says "For each time" when there is more than one time.
  - `buildNotifyPayload` (`desktopNotifyCore.ts`) emits one entry per time per reminder, with the time in the dedupe key. Projected repeat days already reach the scheduler, so they get every time too.
- **Phone 2.18.1 and older desktops (including the installed 2.18.0):**
  - They read only `start_time`, so they show the task once, at its earliest time.
  - Ticking it there completes all its times.
  - Their reminders, if any, are for the first time only.
  - They never send the new columns, so they can't erase them. This was checked for 2.18.1's `taskToRemote` in Part B and will be re-checked in P2.
  - Written in CURRENT_TRUTH as a known limit.

## Data and sync model
**Two nullable columns on `belific.tasks`:**
```sql
add column extra_times jsonb,   -- array of 'HH:mm', at most 6, NULL = none
add column times_done  jsonb    -- array of 'HH:mm' ticked on this row's day, NULL = none
```
- Additive only: no default, no NOT NULL, no CHECK, no backfill.
- Existing rows get NULL, which means today's behaviour exactly.
- The client sanitises both columns (invalid or duplicate entries dropped, cap of 6), as with `reminders`.

**Fold into 004 (recommended) or a new 005?** 004 is written but not applied, so amending it is safe.
- **Folding means one review, one backup, one apply and one set of checks.** The header, the rollback (which would drop four columns) and the post-apply checks are updated together.
- **The probes stay separate:** a new `caps.partC` probes `extra_times` and `times_done`, beside `caps.partB`. So each part's sync turns on only when its own columns exist, whichever part ships first.
- **005 only if** Jethro wants to apply Part B before Part C is approved (Q1).

**Until applied:** the values stay on the device, are kept on pull, and are queued for upload when the probe first sees the columns. This is the same as Part B.

**Before anything live (Jethro only, as for 002, in P6):**
1. Review the amended `004_part_b.sql`, its rollback and the checks.
2. Back up with the scripts in `mobile/supabase/rollback/`, plus a desktop Settings, Data, Export.
3. Apply through the migration tool or the SQL editor. **Never `supabase db push`.**
4. Run the checks:
   - All four columns exist.
   - NULL counts equal the row counts.
   - Row counts of every table are unchanged.
   - RLS and grants are unchanged.

The rollback drops the columns **and every value in them**. That is the only step that can't be undone.

## Phases, in build order
| # | Version | What | Done when | Live? |
|---|---|---|---|---|
| P1 | 2.34.1 | Timer fix: start on a projected day (stored first), no silent "missing", "Start from HH:mm" row | Unit tests for the start plan from a scheduled time; `p18`: menu, shortcut and details on a repeating day; "Start from" shows the elapsed time at once | No |
| P2 | 2.35.0 | Amend 004 (not applied), mappers, `caps.partC`, local-only until applied | Unit tests: round trip; an older client's upsert leaves both columns alone; values kept on pull while the columns are missing | No |
| P3 | 2.36.0 | Pure `lib/times.ts` (normalise, tick per time, completion rule, move/remove/add), series fields, details "Add another time", left card, totals | Unit tests for every rule above; `p19`: details control, card text, planned hours | No |
| P4 | 2.37.0 | Calendar and Timebox: a block per time, ids, ticks, drag per time, Split per block, continuations | `p20`: two Short break blocks; ticks per time; repeating task on three days; Split per time; drag 15:00 to 15:30; overnight | No |
| P5 | 2.38.0 | Reminders per time, "For each time" note | Scheduler unit tests with a fake clock; one toast by hand | No |
| P6 | none | Jethro backs up and applies 004 | Checks pass; times and ticks reach the second computer and survive an edit on the phone | **Yes, Jethro only** |

Every phase ends with the usual full gates:
- tsc, unit tests and the security scan.
- The iOS export with 0 marker hits. `lib/times.ts` stays out of the phone bundle or is added to the markers.
- The full real check suite.

*Effort guess:* P1 small, P2 small, P3 and P4 the bulk (about two sessions each), P5 small.

## Risks
| Risk | Likelihood | Impact | Reduced by |
|---|---|---|---|
| Some code maps a block id to a task without stripping `@HH:mm`, so a press or drag acts on nothing | Medium | Medium | One helper, used everywhere; `p20` presses, drags and menus every block |
| An older desktop (like the 2.18.0 install) or the phone ticks the task, and the desktop then shows partial ticks wrongly | Low | Low | "`completed` wins" rule, unit tested |
| Tick state lost when a time moves on a partly ticked row | Low | Medium | Rename rule, unit tested |
| The installed 2.18.0 desktop rewrites other data, as it did to label colours on 21 Oct | Medium | Medium | Not caused by this plan. Recommend uninstalling it, or replacing it with a 2.38.0 installer, before P6 |
| Applying 004 to the shared project | Low | High | Additive only, backup first, Jethro applies, never `db push` |

## Legal, privacy, ethics
No new personal data beyond a few times and ticks on existing task rows. No new services. No reused code or licences.

## Open questions (reply "defaults" to take all)
1. **Migration:** fold the two columns into the unapplied 004, or a new 005? *Default: fold into 004, with separate probes.*
2. **Left card tick:** ticks every time, or only the next open time? *Default: every time.*
3. **Overlapping own times** (15:00 and 15:10 on a 20 min task): refuse with a note, or allow side by side? *Default: refuse.*
4. **"Start from HH:mm" window:** offered for any time today that started less than 24 hours ago, or only while that time's block is still running? *Default: any time today that has started, under 24 hours.*
5. **"Error loading Belific":** can you send the exact wording or a screenshot, and say whether it came from the 2.18.0 window or 2.34.0? *Default: treat it as separate from the timer, and look again once I have the wording.*

## Success check (by hand at the end)
1. Short break has 11:00 and 15:00 on one card. Both blocks show, and planned hours count 40 min.
2. Tick 11:00: 15:00 stays open. Tick 15:00: the card completes.
3. Boot Camp (repeating): "Start the timer" works on today. "Start from 9:30" shows the right elapsed time.
4. With Split on, each break time cuts Boot Camp into its own pieces.
5. Two reminders arrive, one per time.
6. After P6: the phone shows Short break once at 11:00, and the desktop's 15:00 survives a phone edit.
