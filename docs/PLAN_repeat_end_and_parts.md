# Plan: Repeat until, and Parts

Planning only, 2026-11-12, on top of 3.46.0 (branch v2-redesign, F1 to F7 of PLAN_daily_flow done). No code yet, no
version bump, **no migration applied, the live database untouched**. The five questions in section 10 have recommended
defaults; once answered they become decisions **E1 to E5** (so they never clash with D1 to D5 of PLAN_daily_flow or
G1 to G5 of PLAN_breaks_as_gaps).

Goal: a repeating task can stop on a chosen date, and a task can hold smaller full tasks ("Parts") with no time needed,
in words a beginner understands at once.

## Decisions (answered 2026-11-12)

The five questions of section 10 are answered as recommended, with one addition to E3.

- **E1** The chosen day is the last day it happens (the end date is inclusive).
- **E2** The parent's own estimate wins; the parts' sum is shown as a quiet line and used only when the parent has none. A new part has no estimate.
- **E3** Add part replaces Add subtask for new items; existing steps keep working with Turn into parts. **Adding parts must be quick:** type a title, press Enter, the box stays open for the next one.
- **E4** Wrap up Tomorrow splits a task with some parts done the way steps do (done stay today, open go to tomorrow).
- **E5** The second half of a split series starts a new streak; that is fine for now.

R0 status: file `mobile/supabase/belific_schema/005_repeat_until_and_parts.sql` written with exactly the draft SQL of section 5; no app code changed, no version bump. Jethro applied 005 after R0.

R1 status (3.47.0): both fields sync behind the probe `Caps.repeatParts`; nothing visible.

## 0. Today in six lines

Paths below are under `mobile/` (for example `lib/series.ts` is `mobile/lib/series.ts`).

1. **Repeating tasks** (`lib/series.ts`, decision 023). A series is every row whose id is `root` or `root:YYYY-MM-DD`
   (`lib/recurrence.ts` `rootTaskId`, `nextOccurrenceId`). The **root row** is the first one; a **stored day row**
   exists only when a day was ticked, moved, skipped (a tombstone) or changed "This day only". The **template** is the
   latest live unmoved row by its own day (`seriesOfRows`). Coming days are **projected**, never stored
   (`projectOccurrences` builds them with `occurrenceFromTemplate`). Desktop and phone both project through
   `timeboxTasks.ts`; ticking a stored day also stores the next one (`taskActions.ts` `createNextOccurrence`, the old
   iPhone model, harmless because the id is fixed).
2. **Where the rule is read.** The rule is `recurrence`, `recurrenceDays`, `recurrenceMonthDay` on every row
   (`RULE_FIELDS`), read from the template by `occursOn(rule, day, anchorKey)` in `series.ts`, and by `nextOccurrence`
   in `recurrence.ts`. Words come from `repeat.ts` `shortRepeat`. Projection callers: Kanban, Calendar, Timebox, the
   details, Clear tools, Wrap up, Plan my day and Plan week (`planDay.ts`), notifications (`desktopNotifyCore.ts`,
   `phoneReminders.ts`), late tasks, the ICS feed (`icsFeed.ts`) and the server calendar feed (its own vendored copy in
   `supabase/functions/belific-calendar-feed/vendor/series.ts`).
3. **Nesting** (`lib/nesting.ts`, Shifts S1) is **never stored**: any timed block fully inside a longer block's time is
   inside it, worked out from the times every time a day is drawn (`nestDay`), one level, the shortest holder wins.
   The shell counts once at its own length (`nestedMinutesBy`), what is inside adds nothing. `shifts.ts` turns that into
   rows on the shift's card ("5h of 10h planned", "2 of 7 done").
4. **Steps** (the checklist) are `task.subtasks`, a jsonb array `[{id, title, done}]`, at most 50 (`lib/subtasks.ts`).
   The card shows a ring "2/5" that ticks the next step; the details call them "Subtasks" with "Add subtask". Ticking
   the last one completes the task. A repeating day gets them unticked with ids from its own id
   (`copyForNextOccurrence`); edits reach every day (`seriesWide.ts`). A shift's "to dos" are this same checklist.
5. **Schema.** `001` and `002` applied, **`003` (calendar feed grant) written but NOT applied**, **`004` applied**
   (2026-10-21). **The next file is `005`.** The house style: additive, nullable, no CHECK, no backfill, one
   transaction, applied by Jethro, never `supabase db push`.
6. **Sync** keeps a new column's value on the device until a probe sees the column (`syncServer.ts` `probe`,
   `Caps.partB`, `Caps.partC`), and an upsert names only the columns a build knows, so **an older build never erases a
   column it does not know**.

## 1. What changes, in one table

| | Today | Wanted |
|---|---|---|
| A repeat that stops | By hand: "Does not repeat" on the last day | **Repeat until** a date in the details. Later days hidden, not deleted |
| Changing a series from a day on | Not possible | **This and following**, beside This day only and All days |
| Ending from a card | Not possible | **End repeat here** in the right click menu |
| Smaller things inside a task, with no time | Steps: a title and a tick each | **Parts**: full tasks with title, notes, estimate and tick |
| Smaller things inside a task, with a time | Timed blocks inside a shift (worked out from times) | Unchanged |
| Card | Steps ring "2/5" | Part rows with in place ticks and a bar "2 of 5 done" |
| Totals | Steps add nothing | Parts count once, inside the parent (section 3.5) |

## 2. Repeat until

### 2.1 What the person sees

- One date field in the details, under Repeat: **Repeat until** with "No end" as its empty state and a visible
  **Clear** button. Plain wording on the repeat line: "Mon to Thu, until Thu 17 Dec".
- The date is **the last day it happens** (inclusive). Example: a boot camp repeating Monday to Thursday, until
  Thursday 17 December. Nothing shows from Friday 18 December on.
- **Days after the end are hidden, not deleted.** No row is tombstoned or rewritten when the date is set. Clearing the
  date brings every coming day back at once (projections are worked out, never stored).
- **Past days and done days stay.** A done day after the end (ticked before the end was set) stays where it was, as
  history. An open stored day after the end (moved, or changed "This day only") is hidden with the rest and comes back
  with them.
- A date before the series started is refused in place with a quiet line "Pick a day on or after Mon 2 Nov", not a red
  error. A date in the past is allowed: the series has simply ended.

### 2.2 Stored and read

- New field `repeatUntil?: string` ('YYYY-MM-DD') on `Task`, column `repeat_until`. It is part of the rule:
  added to `RULE_FIELDS`, `TEMPLATE_FIELDS` and `SERIES_WIDE_FIELDS`, so "Does not repeat" and "Delete repeating task"
  clear it with the rest, and setting it reaches the template and every open row (as a series edit does today).
- Read in ONE place for projection: `occursOn` returns false for a day after `repeatUntil`. Every projection caller
  (row 2 of section 0) then stops at the end with no change of its own.
- `nextOccurrence` returns null when the next day is after the end (the next stored day is never made).
- One new helper `afterEnd(row, series)` hides an open stored row after the end. It is applied where stored rows are
  turned into a day's tasks: `timeboxTasks.ts` (Timebox, Calendar, the phone), the Kanban day columns, `planDay.ts`,
  `wrapUp.ts`, `clear.ts`, `missed.ts` (Earlier), the two notification files and both feeds.

### 2.3 This and following, and End repeat here

- **End repeat here** in the right click menu of a repeating day, with the sub line "This day is the last. Later days
  are hidden." It sets Repeat until to that day. One gesture, one Ctrl+Z.
- **This and following** is a third choice wherever the app asks "This day only" or "All days" today (Clear tools,
  the Free time scissors, Add inside on a shift), and in the details of a repeating day as one quiet row
  "Changes go to: This day only · This and following · **All days**" (All days stays the default, so nothing changes
  for anyone who does not pick).
- How it works, with no new column: the series is **split**. The old series gets Repeat until the day before; a new
  series starts on the chosen day with a new root id, a copy of the template with the change applied, and copies of its
  parts (section 3.7). Done and past days stay with the old series. One batch, one Ctrl+Z.
- Cost of the split: the Quests streak of the new half starts again (see question 5).

### 2.4 How each screen treats the end

- **Plan week:** days after the end show nothing of that series and count nothing in their totals. The repeating row
  reads "Mon to Thu, until Thu 17 Dec"; in the last week, the last day's cell has a quiet caption "Last day".
- **Clear tools:** after the end there is nothing to clear. Clear day and Clear week offer **This and following** for a
  repeating task: it ends the repeat the day before (that day and every later one are hidden; nothing is deleted).
  "All days" stops the series as today.
- **Wrap up:** the last day lists it as usual with the caption "Last day"; the next day it is gone. Let go still skips
  that day only.
- **Calendar header:** the day and week headers (each day's total and the all day row) and the month grid count and
  show nothing after the end, because they come from the same projection. The block on the last day carries "Last day"
  in its tooltip.
- **Notifications and feeds:** nothing after the end (desktop, phone, the ICS feed). The **server calendar feed** has
  its own vendored `series.ts`: it is updated and redeployed in the same phase, or it keeps sending days past the end.

### 2.5 Older builds

- They do not know the column, never send it and never erase it. **They keep showing days after the end.** Ticking one
  there stores a done row past the end, which the new app keeps as history (a done day stays). The phone before its
  phase is such a build if it is not rebuilt (section 7).

## 3. Parts

### 3.1 What a part is

A **part** is a full task inside another task, with no time needed. It has its own **title, notes, estimate and
tick**. It has no Day, time, label, list or repeat of its own: those are the parent's. One level only: a part never
has parts. Example: **Upper day** with parts **Bench press**, **Shoulders** and **Back**, each with notes such as
"4 sets, slow on the way down".

### 3.2 How parts differ from steps and from things inside a shift

| | Steps (checklist) | Parts | Timed things inside a shift |
|---|---|---|---|
| Stored as | A line in the task's `subtasks` jsonb | Its own task row with `parentId` | An ordinary task |
| Has notes, estimate | No | Yes | Yes |
| Has a time | No | No | Yes, that is why it is inside |
| How it is "inside" | It belongs to the task | Linked: `parentId` | Worked out from the times, never stored |
| On the Timebox | Never | Never | As its own block, inside the shift |
| Counts in totals | No | Once, in the parent (3.5) | No while its shift counts |

### 3.3 One simple story for a beginner

- The details have ONE section, **Parts**, with one visible button **Add part**. Typing a name and pressing Enter adds
  one; the box stays open for the next, as Quick capture does. Opening a part shows the same details window, smaller,
  with "Part of Upper day" at the top and a link back.
- **Add subtask** is no longer offered for new items (question 3). A task that already has steps keeps them, shown
  under a small "Checklist" heading that works as today, with a visible button **Turn into parts**.
- **Steps can be converted to parts:** each step becomes a part with the same title and tick, in the same order, and
  the checklist is emptied. One gesture, one Ctrl+Z. Never automatic, because older builds would lose the list.
- A shift's "to dos" stay its checklist for now (S3 behaviour is pinned by tests); the shift card already shows rows,
  so parts on a shift appear as rows there too.

### 3.4 On the Kanban card

- Parts appear as **rows in the parent's card**, never as cards of their own, each with a tick that works in place
  (the shift rows of S3, reused), and a bar **"2 of 5 done"**.
- More than five parts: the first five rows and "3 more" that opens the details.
- Ticking the last open part completes the parent; unticking a part of a done parent reopens it; completing the parent
  ticks every part (the same rules as steps).
- Dragging a part row out of the card onto a day or a list asks nothing: the part becomes an ordinary task there
  ("Taken out of Upper day", with Undo). Dragging a card onto a card never makes a part (too easy to do by mistake).

### 3.5 Totals (counted once)

- A part never counts on its own in any total (Kanban, Timebox, Daily planning, Plan week, Analytics).
- **The parent's own estimate wins** when it has one: the parts' estimates are shown as "Parts add up to 1h 15m" in
  the details, a quiet line, never red, never added on top.
- **When the parent has no estimate**, its estimate is the sum of its parts' estimates (done or not, as a planned
  total is today). A parent with no estimate and no part estimates counts 0, as an unestimated task does today.
- **Default for a new part: no estimate** (it adds nothing until one is set). The parent's block on the Timebox uses
  the same number for its height when it has a time and no length of its own (30 minutes when everything is empty, as
  today).
- Analytics counts a done part once, under its parent, never as a separate done task.

### 3.6 Stored

- New field `parentId?: string` on `Task`, column `parent_id`: the id of the parent (for a repeating parent, its
  **root** id, see 3.7). A part row has no `dueDate`, no `startTime`, no repeat and no label. It keeps the parent's
  `listKey` (written when made and when the parent's list changes), so an older build shows it beside its parent.
- Because a part has no Day of its own, **moving the parent moves its parts with no write** (Wrap up Tomorrow, Plan my
  day, Plan week, drags). This is the main reason for not copying the Day.
- **Orphan rule:** a part whose parent is missing, in the Trash or itself a part shows as an ordinary task in its list.
  Restoring the parent puts it back under it, because `parentId` never changed. This one rule covers older builds,
  another device deleting the parent and sync arriving out of order.
- One new pure file `lib/parts.ts` (`partsOf`, `isPart`, `partTotal`, `partRows`, `deletePlan`, `stepsToParts`) with
  tests, in the house style.

### 3.7 Repeating parents

- Parts repeat with the parent and **start each day unticked**. The part row itself (`parentId` = the parent's root id)
  is the part's template; its title, notes and estimate apply to every day (series wide, as steps are).
- A tick on a day is stored as a day row of the part, `part:YYYY-MM-DD` (the existing occurrence id scheme), with
  that day's `dueDate` and the same `parentId`. Untick updates it. A day not touched has no row, exactly like a
  projected day of the parent.
- This and following on a repeating parent copies its parts to the new series (new ids, no ticks).
- "Does not repeat" on the parent: its parts become ordinary parts of the last stored day.

### 3.8 Delete, Clear tools, Wrap up, planning, undo

- **Delete** on a parent asks, with two visible buttons: **Delete the task only** (its parts become ordinary tasks on
  the parent's Day and list) and **Delete the task and its 3 parts** (all to the Trash together; Restore brings them
  back together). The wording follows the shift's "Delete the shift and its 2 items". A repeating parent: "Delete
  repeating task" asks the same; the parts' done day rows stay as history.
- **Clear tools:** Clear day and Clear week take the parent back to its list; its parts go with it (no write).
  Clear list moves the parent and its parts to the Trash, counted as one ("Upper day, with 3 parts"). Clear label: the
  label is the parent's, so its parts go with it; a part never shows in a label filter on its own.
- **Wrap up Tomorrow:** with no part done, the parent moves to tomorrow with its parts. With some done and some not,
  the same rule as steps (question 4): today's parent stays done with its done parts, and a copy goes to tomorrow
  holding the open parts (re-linked, not copied). A repeating parent never moves; its parts have their ticks only.
- **Plan my day:** the parent is one row with "3 parts" beside it; parts are never offered on their own in "Add to
  today".
- **Plan week:** the parent counts once with its total (3.5); its parts show as a caption.
- **Earlier:** an undone part of an earlier day goes with its parent, never as its own row.
- **Undo:** every gesture above (add, tick, delete with or without parts, convert steps, take out, Tomorrow) is ONE
  batch on the existing undo stack: one Ctrl+Z or the row's Undo puts it all back.

### 3.9 The phone, and older builds

- **The phone** stays as it is until the phone phase. Until then it shows parts as ordinary tasks in the parent's
  list (the orphan view); ticking one there ticks that part, which syncs back. The phone phase adds the Parts section in
  its details and rows under the parent.
- **Older builds** (desktop before this, the phone before its phase): parts are ordinary undated tasks in the parent's
  list (or Brain Dump); a repeating parent's ticked day rows are done tasks on their day. Editing one there never
  erases `parent_id` (an upsert names only its own columns). Deleting a parent there deletes the parent only; its parts
  show as ordinary tasks until the parent is restored (orphan rule).

## 4. Workout logging is out of scope

Sets, reps and weight are not built: Proload does that. **Where a link could go later:** one row in a part's details,
"Log in Proload", opening a deep link that carries the part's title, and later the parent's title as the session
name. It needs no column here (the part's id is enough to come back). Nothing is built for it now.

## 5. Migration 005 (draft, NOT applied)

File: `mobile/supabase/belific_schema/005_repeat_until_and_parts.sql`, written in the parts phase, applied by Jethro.

```sql
-- Belific migration 005: Repeat until, and Parts (PLAN_repeat_end_and_parts).
--
-- *** NOT APPLIED. Apply only after Jethro's review, through the Supabase migration tool.
-- Never `supabase db push`. ***
--
-- Additive only: two nullable columns on belific.tasks. No default, no NOT NULL, no CHECK,
-- no foreign key, no backfill, nothing rewritten or dropped, nothing outside the belific schema.
-- Existing rows get NULL, which the app reads as "no end" and "not a part".

begin;

alter table belific.tasks
  add column repeat_until date,   -- the last day a repeating task happens ('YYYY-MM-DD'); NULL = no end
  add column parent_id text;      -- the id of the task this one is a part of (a repeating parent: its root id); NULL = not a part

commit;

-- MANUAL ROLLBACK (never applied automatically; only with a backup and Jethro's go). DESTRUCTIVE:
-- every end date and every part link is lost (parts become ordinary tasks). Clients keep working:
-- the probe sees the columns missing and keeps the values on each device.
-- begin;
-- alter table belific.tasks drop column if exists parent_id, drop column if exists repeat_until;
-- commit;
```

- **Why `date`** for `repeat_until` (as asked): it is a calendar day. `due_date` is `text` for history; the client
  sanitises (`isDateKey` plus a round trip check, so "2026-02-30" never reaches the server) because a bad value would
  fail the whole batch. If consistency with `due_date` matters more, `text` works the same; say so before it is applied.
- **Why no foreign key** on `parent_id`: rows are soft deleted (tombstones), a part can arrive before its parent in a
  sync batch, and the primary key is `(user_id, id)`. A key would fail batches; the orphan rule (3.6) does the job.
- **No index**: a person has hundreds of tasks, and the app reads them all. One can be added later, additively.
- **Row level security:** no change. The existing `owner_full_access` policy on `belific.tasks` covers every column;
  grants are table level, so `authenticated` gets the new columns with no new grant. A `parent_id` can only ever be
  matched among the same person's rows, so a forged id points at nothing. The calendar feed's `service_role` already
  reads `belific.tasks`; 003 is unrelated and stays unapplied.
- **Older builds** never send or erase the columns. Repeats continue past the end there; parts show as ordinary tasks.
- **A deleted parent:** the app writes a tombstone (never a hard delete), and with "the task only" clears each part's
  `parent_id` in the same batch. If another device or an older build deletes the parent, its parts show as ordinary
  tasks (orphan rule) until the parent is restored. Account deletion already removes every row through `user_id`.
- **Probe:** one capability `Caps.repeatParts` that checks both columns (one transaction, so both or none). Until it
  is on, the values stay on the device and are queued when it first sees them, as Part B and Part C did.
- **Roll out in this order:** 1. Jethro applies 005 (checks: both columns exist, NULL count equals the row count, row
  counts unchanged, policies and grants unchanged). 2. Ship the desktop build that sends them. 3. Redeploy the server
  calendar feed with the new `series.ts`. 4. The phone in its phase. A build shipped before step 1 is safe (it keeps
  the values locally), only slower to share them.

## 6. Sketches

The details window of a repeating parent with parts (desktop, text 14 px or more):

```
┌─ Upper day ─────────────────────────────────────────────── [Close] ┐
│ Day      Mon 16 Nov        Time  18:00      Length  1h 15m          │
│ Repeat   Mon to Thu                                    [Change]     │
│ Repeat until  [ Thu 17 Dec  ▾ ]                        [Clear]      │
│ Changes go to:  ( ) This day only  ( ) This and following  (•) All days │
│                                                                      │
│ Parts  2 of 3 done   ███████████░░░░░                               │
│  [✓] Bench press      20m   4 sets, slow on the way down     [Open] │
│  [✓] Shoulders        25m   light, 3 rounds                  [Open] │
│  [ ] Back             30m                                    [Open] │
│  [ Add part…                                       ]  [Add part]    │
│  Parts add up to 1h 15m.                                            │
│                                                                      │
│ Notes  ...                                                          │
│                                     [More ▾]      [ Done ]          │
└──────────────────────────────────────────────────────────────────────┘
```

A Kanban card with parts:

```
┌──────────────────────────────────┐
│ [ ] Upper day           18:00 1h │
│     Mon to Thu, until 17 Dec     │
│  ██████████░░░░░  2 of 3 done    │
│   [✓] Bench press           20m  │
│   [✓] Shoulders             25m  │
│   [ ] Back                  30m  │
└──────────────────────────────────┘
```

The right click menu of a repeating day:

```
  Open
  Move this day        Only this day
  Skip this day        Hides this day only
  End repeat here      This day is the last. Later days are hidden.
  Delete repeating task
```

## 7. Phases, effort and model

| Phase | What | Effort | Model |
|---|---|---|---|
| **R0** | Write `005`, its rollback note and schema tests; Jethro applies it | Small (half a session) | Sonnet |
| **R1** | Sync both fields: mappers, sanitisers, `Caps.repeatParts` probe, keep locally, queue on first sight; fake server tests | Small to medium | **Opus** (sync is where data is lost) |
| **R2** | Repeat until: `occursOn`, `nextOccurrence`, `afterEnd`, the details field, the repeat wording, End repeat here, Plan week, Clear, Wrap up, Calendar, notifications, ICS feed and the vendored server feed | Medium | Sonnet |
| **R3** | This and following: the split, its place in Clear tools, the scissors, Add inside and the details; one undo | Medium | **Opus** (series rules, templates, quests) |
| **R4** | Parts core: `lib/parts.ts`, Add part, card rows and bar, totals, Analytics, Earlier, delete choice, orphan rule, take out, steps to parts, undo | Large | **Opus** |
| **R5** | Parts with repeating parents, Wrap up Tomorrow split, Plan my day, Plan week, Clear tools | Medium | Sonnet, with the R4 rules in place |
| **R6** | The phone (in the phone phase): Repeat until field, Parts in the details, rows under the parent | Medium | Sonnet |

Each phase follows the usual rules: targeted real checks only (`BELIFIC_TEST_DISPLAY=2`, `BELIFIC_QUIET=1`), version
bump, CHANGELOG, build-progress, a commit, then stop. One full regression after R5.

## 8. Risks

- **Sync.** Two new columns on the busiest table. Mitigation: the proven probe and keep locally pattern; a part that
  arrives before its parent shows as an ordinary task for a moment (orphan rule), never lost. A `date` value the
  server refuses would fail a whole batch, hence the round trip check.
- **Repeating days.** Hiding stored rows after the end must happen everywhere stored rows become a day's tasks; one
  missed place shows a "ghost" day. Mitigation: one helper (`afterEnd`) and a list of every caller in R2's checks.
  The split in R3 must never move a done or past day, and the template rule (latest unmoved row) must hold on both
  halves.
- **Quests.** A split series starts a new streak (question 5).
- **Older builds.** Repeats run past the end and parts look like loose tasks there. Said in the CHANGELOG, as for
  quick reminders. Ticks made there sync back correctly.
- **Totals.** A part counted on its own anywhere doubles a total. Mitigation: parts have no Day, so the day based
  totals never see them; Analytics (by completion time) needs its own filter and a test.
- **The server feed.** Its vendored `series.ts` is a separate copy: forgetting the redeploy keeps sending days past
  the end.
- **Tests that pin the old behaviour:** `series.test.ts` (projection, `RULE_FIELDS`, `TEMPLATE_FIELDS`),
  `seriesWide.test.ts` (the wide field list), `syncCore.test.ts` (field lists and mappers), `schemaProfile.test.ts`
  and `belificSchemaSql.test.ts` (columns the sync sends, the probe), `calendarFeedFunction.test.ts` (the vendored
  copy), `subtasks.test.ts` and `shifts.test.ts` (the checklist and to dos), `wrapUp.test.ts`, `clear.test.ts`,
  `taskTotals.test.ts`, `analytics.test.ts`, and real checks that count cards or read "Add subtask" (cp8 series, p57 to
  p62). Each is changed on purpose and listed in build-progress.

## 9. Files that change (expected)

`lib/types.ts`, `lib/series.ts`, `lib/recurrence.ts`, `lib/repeat.ts`, `lib/seriesWide.ts`, `lib/seriesActions.ts`,
`lib/timeboxTasks.ts`, `lib/kanban.ts`, `lib/planDay.ts`, `lib/wrapUp.ts`, `lib/wrapActions.ts`, `lib/clear.ts`,
`lib/missed.ts`, `lib/taskTotals.ts`, `lib/analytics.ts`, `lib/trash.ts`, `lib/syncCore.ts`, `lib/syncServer.ts`,
`lib/desktopNotifyCore.ts`, `lib/phoneReminders.ts`, `lib/icsFeed.ts`, new `lib/parts.ts`; desktop
`TaskDetailPanel.tsx`, `TaskCard.tsx`, `TaskPopovers.tsx`, `ClearTools.tsx`, `WrapUp.tsx`, `PlanWeek.tsx`,
`PlanDay`; the vendored feed files; new `005_repeat_until_and_parts.sql`.

## 10. Questions (recommended defaults)

1. **End repeat here:** is the chosen day the last day it happens? **Recommended: yes** (the end date is inclusive).
2. **A parent with its own estimate and parts with estimates:** does the parent's own estimate win? **Recommended:
   yes**; the parts' sum is shown as a quiet line, and is used only when the parent has none. A new part has no
   estimate.
3. **Add subtask:** replace it with Add part for new items, keeping existing steps working with "Turn into parts"?
   **Recommended: yes** (one story). Shift to dos stay a checklist for now.
4. **Wrap up Tomorrow with some parts done:** split as steps do (done parts stay today, open ones go to tomorrow)?
   **Recommended: yes**, so today keeps a true record.
5. **This and following and Quests:** accept that the new half starts a new streak for now? **Recommended: yes**;
   linking the two halves would need another column and can come later if it matters.
