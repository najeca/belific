# Plan: shifts (blocks with smaller things inside)

Planning only, 2026-11-11, on top of 3.35.0 (branch v2-redesign). No code yet, no version bump.

Goal: a beginner, or someone over 50, can plan a long shift with smaller things inside it, with no types to understand.

## 0. Today in six lines

1. **Task and Break.** One table of tasks. A Break is a task with `cutsBelow: true` (column `cuts_below`). The "Task or Break" two-option control (`lib/taskKind.ts`, `KindChoice`) sits in the desktop details (`TaskDetailPanel.tsx:501`, row "Type") and in the phone details (`TaskDetails.tsx:482`).
2. **Hosting** (`lib/hosting.ts`, `hostDay`) is worked out from the times, never stored. **Only a Break hosts**: a task fully inside a break (edges count) is its guest, and the shortest break wins. A break inside a longer break is hosted (3.22.0). Two plain tasks never nest. `fitRefusal` refuses a task that would stick out of a break it starts in.
3. **Breaks as gaps, P2 to P4 (3.34.0 to 3.35.0).** On Day, Week and Timebox a break is a hatched gap under the blocks (`GapLayer`). Guests are ordinary blocks at their real size (10 px floor). Gaps move and resize in 5 minute steps. D5 carries breaks with the task under them. The scissors (button and `C`) cut a gap, with This day only / All days and one undo. `cutDay` cuts a task around a gap, and every piece must be at least `planner.cut_min` (30).
4. **Overlap.** Two plain blocks that overlap sit side by side in lanes (`timebox.layoutItems`, a top-priority task gets the left lane). The only exceptions are gaps, which cut, and guests, which sit in their gap.
5. **Repeating.** A series is one stored template row. Coming days are projected, not stored (`lib/series.ts`). "This day only" stores that day's row. Skip writes a tombstone. Subtasks are copied unticked to each day.
6. **Day totals.** Kanban, Daily Planning and Analytics sum each non-break task's length, minus the minutes gaps cut away (`gapMinutes`, D4). The Timebox "Scheduled" is the union of the drawn spans. So today a 10 h shift with 5 h of tasks on top reads **15 h** in Kanban and 10 h in the Timebox, and the five tasks sit beside the shift in narrow lanes.

## 1. What changes, in one table

| | Today | Wanted |
|---|---|---|
| Types on screen | "Task or Break" control in details | Gone. One kind of block. |
| Making free time | Break in details, or the scissors | The scissors only, renamed "Free time" |
| A block fully inside another block's time | Side by side in lanes (only breaks host) | Drawn **inside** it at its real size, on Day, Week and Timebox |
| Counting a shift with things inside | Shift plus every task (15 h) | The shift once, at its own length (10 h) |
| Shift's own summary | None | "5h of 10h planned, 5h free" plus a bar "2 of 7 done", on the block, card and details |
| Adding something inside | Make a task, set day and time to fit | "Add inside" (details, right-click menu), or drag a task onto the shift |
| To-dos with no time | A checklist on the task (subtasks), opened from the card | The same checklist, shown as rows in the shift's card with a tick that works in place |
| Repeating inside items | By hand | "This day only" or "All days of Shift" when added; they move with the shift (D5 extended) |

## 2. One kind of block (wanted 1)

- Remove `KindChoice` and its row from the desktop details and from the phone details. Remove `TASK_HINT`, `TASK_HINT_DESKTOP` and `BREAK_HINT` from the screen. `kindOf`, `isBreak` and `kindPatch` stay, because the data still has breaks.
- **Existing breaks** stay breaks: they are drawn as free time, as since 3.34.0. Their details get one plain button, **"Make it a normal block"** (`kindPatch('task')`), shown only on free time. This is the only way back, and it is visible.
- **The scissors become "Free time".** The button shows ✂ with the text "Free time" next to it, not an icon on its own. Its tooltip is "Mark free time (C)". Plain wording:
  - hint: `Click where the free time starts, then where it ends. Esc to stop.`
  - refused (D3, muted grey, never red): `Too short: this would leave 10 min (at least 30)`
  - popover on a repeating block: `This day only` / `All days of Shift`
  - new rows are titled `Free time`; old rows keep "Break"
  - gap tooltip: `Free time · 20 min`
  - the day column's quiet line (D1): `☕ Free time · 1h 40m`
- Nothing else makes a break. `C` stays as D2: it ticks a focused card, and otherwise toggles Free time.

## 3. Nesting, derived from times (wanted 2)

### Rule (new pure `lib/nesting.ts`, shared by desktop and phone, see `nesting.test.ts`)

- After gaps are settled (`hostDay`, unchanged), take the day's remaining timed entries. Breaks and guests of a gap are left out.
- **An entry nests in another when outer start ≤ inner start, inner end ≤ outer end, and the outer is strictly longer.** The edges count. Two blocks of the same span do not nest: they sit side by side, as today.
- Go from the longest down. Each inner entry goes to the **shortest** block that holds it (then the earlier one, then by id), as `hostDay` already does for breaks.
- **One level.** A block inside an inner block is drawn and counted as part of the outermost one. It sits in a lane of the outer block. Two levels of boxes are too much for the people this is for.
- Each time of a task with several times is its own entry, as today. The rest of yesterday's overnight task (`cont`) **also hosts** (see risks: night shifts).
- Nothing is stored. Moving an item out of the shift's time un-nests it at once, and moving it back nests it again.

### Drawing (Day, Week, Timebox)

- The outer block draws as today (label colour, square corners). Its top strip is the **header**: the title, the time, the summary line, and a thin progress bar with "x of y done" (section 4). On Week, where columns are narrow, the strip shows only the title and `5h/10h`. The full line is in the tooltip.
- Inner blocks are drawn **inside** the outer rectangle. They are inset 8 px from its left edge. Each one sits at its real time and real height (the 10 px floor from 3.34.0). Inner blocks that overlap each other share lanes inside the shell (`layoutItems` run on the inner set). The header strip covers no inner block, because the strip is part of the shell's first minutes. An item starting at the shift's start is drawn over the strip, and the strip moves to the right of it.
- The parts of the shell with nothing in them are its **free** time. They are drawn with a lighter tint of the label colour, not hatched, because hatching means free time cut by the scissors.
- **Free time inside a shift** (a gap): the shift is cut around it as today (`cutDay`, D4). Its pieces are drawn as one shell, with the hatched gap showing through. Items inside the gap are the gap's guests, as today.
- Click an inner block to open its details. Click the header or a free part of the shell to open the shift. Drag works as today (5 minute steps).

### Overlap rule after this

| Case | Result |
|---|---|
| Fully inside a longer block | Nested inside it, not added to totals |
| Same start and end | Side by side, both count |
| Partly overlapping (starts inside, ends after) | Side by side in lanes, as today, and both count. A quiet grey note on hover and in details: `Starts inside Shift and ends after it`, with a button **"Fit inside"** that moves the item's start so it ends at the shift's end (or shortens it if it is longer than the shift). No refusal: refusing confuses beginners. |
| Fully inside free time (a gap) | The gap's guest (unchanged) |
| A block dropped on a shift | Lands inside at the drop time (`hostStart`, clamped so it fits). If it is longer than the shift, it lands where dropped, side by side. |

`fitRefusal` and its "Longer than the break" refusal stay for gaps only.

## 4. The shift's summary and progress (wanted 3)

New pure helper in `lib/nesting.ts`:

`shiftSummary(outer, inners, subtasks, gaps)` returns `{ total, planned, free, done, count }`:

- `total` is the outer length minus the gaps inside it (D4: the same figure the day totals use).
- `planned` is the **union** of the inner items' spans, clipped to the shift, so two overlapping inner items do not count twice. Untimed to-dos add nothing.
- `free` is `total − planned`.
- `count` is the number of inner timed items plus the shift's subtasks. `done` is how many of them are ticked. A timed item with several times counts each time, as `timesCount` does.

Words (`formatClock` style, plain):

- `5h of 10h planned, 5h free`
- `10h planned, nothing free`
- `Nothing planned yet, 10h free`
- bar label: `2 of 7 done`, or nothing when `count` is 0

The bar is a 6 px track in the label colour at 25 % and its fill at 100 %. No red, ever: an overfull shift is impossible, because `planned` is clipped.

**Counting (the outer counts once).** A new `nestedMinutes(tasks)` sits next to `gapMinutes`, with the same per-day walk. It takes off each nested item's minutes. `totalsOf`, `plannedText`, Daily Planning and Analytics use it. The Timebox "Scheduled" already uses the union, so it needs no change.

Analytics, done time:

- a ticked shift counts its length, and its ticked inner items add nothing;
- an unticked shift with ticked inner items counts those items.

The same summary shows on the block header, the Kanban card and the details window.

## 5. Adding something inside (wanted 4)

- **"Add inside"** is a labelled button, not an icon. It appears:
  - in the details window, under the summary;
  - in the right-click menu of the block on Day, Week and Timebox;
  - at the foot of the shift's Kanban card.
- It opens one small form with 14 px text:

```
  Add inside Shift
  What is it?      [ Ring patients              ]
  When?            (•) No time, just a to do
                   ( ) At a time  [11:00] for [2h ▾]
  Repeat?          [ This day only ] [■ All days of Shift ]     (only when the shift repeats)
                                        [ Cancel ]  [ Add ]
```

- **No time**: the item is added to the shift's `subtasks`. A subtask is the checklist that exists since checkpoint 8.2: synced jsonb, at most 50 items. It lists as a to-do row in the shift's card and details. The round tick on the row works in place (`subtasks.toggle`), with no need to open anything.
- **At a time**: the form creates an ordinary task with the shift's day, its time and its length. The time is checked against the shift: if it does not fit, the form says `This would end after the shift (18:00)` in grey and offers **"Fit inside"**. The task nests because of its time. It shows as a row in the card (with its time) and as a block inside the shift on the grid.
- **Set a time** on a to-do row turns it into a timed item: the subtask is removed and a task is created, in one gesture. **"No time"** on a timed item does the reverse.
- **Dragging**:
  - a card from a list or Brain Dump dropped on the shift lands inside it at the drop time;
  - an inner block dragged within the shift moves in 5 minute steps;
  - an inner block dragged out of the shift is no longer inside it.

  This is the existing drag. Only the target changes from "a break" to "any longer block".
- Lunch and phone calls are ordinary inside items. Lunch counts as **planned**: it is a planned thing. To make lunch count as free, cut it as free time with the scissors (Question 1).

## 6. Data model and older builds (wanted 5)

**No database change.**

- Nesting is derived from day and time, like hosting and cuts. No parent column.
- Untimed items are the existing `subtasks` jsonb (migration `20261007120000_task_subtasks_reminders.sql`).
- Timed items are ordinary task rows.
- Free time is the existing `cuts_below`.
- Removing the control removes only a way to write `cutsBelow`, not the column.
- Giving subtasks a time inside the jsonb was considered and rejected. An older build that rewrites the list could drop the unknown key, and a timed thing needs its own tick, timer and reminder anyway, which tasks already have.

Older builds:

| Build | What it shows |
|---|---|
| 3.34 to 3.35 desktop, current phone | The shift and its timed items side by side in lanes. Totals count both (15 h). The checklist shows as subtasks. Nothing is lost. |
| 3.27 to 3.33 | The same, and breaks as ☕ blocks with chips. The Task or Break control is still there, so someone could still make a Break there. It then shows as free time here. |
| Before checkpoint 8.2 | No checklist. Timed items as plain tasks. |

## 7. Repeating (wanted 6)

- The shift repeats as any series (e.g. Mon, Tue, Thu, Fri). Its summary is worked out per day, so a projected day shows its own inside items.
- **Untimed to-dos.** All days adds the to-do to the series template, so every coming day gets it unticked (`copyForNextOccurrence`). This day only stores that day's row with the extra subtask (the existing one-day change, `series.ts` "This day only"), and the template is unchanged.
- **Timed items.** All days creates the item as its own series. It starts on that day and copies the shift's `recurrence`, `recurrenceDays` and `recurrenceMonthDay`, exactly as the scissors do for free time (`bladeTask`). This day only creates a one-off task.
- **D5, extended to inside items.** When the shift moves on one day, or its series time changes, everything wholly inside its old span moves by the same delta in the same gesture: free time and inner items alike. This uses `carryPlan` and `carryBreaks`, widened from breaks to nested entries, so one Ctrl+Z undoes it all.
- **Skip this day** on a shift asks once: `Also skip its 4 items on this day?` with **Yes** focused. Yes writes a skip tombstone for each inner item's series on that day.
- **Delete repeating task** on a shift asks: `Also delete its 4 inside items?`.
- Nothing links the rows except their times, so these offers are worked out from the day as drawn.
- **Free time and nesting together.** Gaps are settled first (`hostDay`), then nesting runs on what is left. A gap inside a shift cuts it, and the shift's `total` drops by the gap. A thing inside the gap belongs to the gap, not to the shift, and adds nothing to `planned`.
- **Two non-nested blocks that overlap** stay side by side in lanes, and both count, as today (section 3 table).

## 8. Wording and look (wanted 7)

- Plain words only: "inside", "free time", "planned", "done", "Add inside", "Fit inside", "Make it a normal block". Never "host", "guest", "nest", "break type", "cut" or "Split".
- Buttons have visible text. No icon-only control is added. Free time gets its label.
- **Text at least 14 px** on everything this plan adds or touches:
  - the shift header on Day and Timebox
  - the card rows
  - the details
  - the Add inside form
  - the Free time hint, refusal and popover

  Week block text stays at its current size, because seven columns do not fit 14 px (Question 5). The tooltip carries the full text at 14 px.
- **No red** on any of these surfaces. Refusals and notes are muted grey (`textMuted`), and the progress fill is the label colour. Tick circles stay sage when done.
- Touch targets stay at least 44 pt on the phone, and the tick rows are 44 pt tall there.

## 9. The example

A nurse, 10 hours, 4 days a week (Mon, Tue, Thu, Fri). Shift 8:00 for 10 h, repeating. Inside it, all days:

- Briefing, 8:30, 30m
- Teams press meeting, 10:00, 1h
- Ring patients, 11:00, 2h
- Lunch, 13:00, 30m
- Ring other departments, 14:00, 1h

Two to-dos with no time: Check emails, Order supplies. By 12:00, Briefing and Teams are ticked.

Planned is 30m + 1h + 2h + 30m + 1h = **5h of 10h, 5h free**, and **2 of 7 done**. One row is 30 minutes. `┃` is the shift's shell, `▌` an inner block, and `·` free shell.

### Day

```
        Thursday 12 Nov
 8:00 ┃ Shift  8:00–18:00     5h of 10h planned, 5h free ┃
      ┃ ▓▓▓▓▓░░░░░░░░░░░░░  2 of 7 done                   ┃
 8:30 ┃  ▌Briefing                           8:30 · 30m  ┃
 9:00 ┃  · · · · · · · · · · · · · · · · · · · · · · · · ┃
 9:30 ┃  · · · · · · · · · · · · · · · · · · · · · · · · ┃
10:00 ┃  ▌Teams press meeting                10:00 · 1h  ┃
10:30 ┃  ▌                                               ┃
11:00 ┃  ▌Ring patients                      11:00 · 2h  ┃
11:30 ┃  ▌                                               ┃
12:00 ┃  ▌                                               ┃
12:30 ┃  ▌                                               ┃
13:00 ┃  ▌Lunch                             13:00 · 30m  ┃
13:30 ┃  · · · · · · · · · · · · · · · · · · · · · · · · ┃
14:00 ┃  ▌Ring other departments             14:00 · 1h  ┃
14:30 ┃  ▌                                               ┃
15:00 ┃  · · · · · · · · · · · · · · · · · · · · · · · · ┃
 ...  ┃  · (free to 18:00)                               ┃
17:30 ┃  · · · · · · · · · · · · · · · · · · · · · · · · ┃
18:00
                                         Day total 10h (not 15h)
```

The Timebox draws the same as this column. On Week the header strip reads `Shift 5h/10h` and the inner blocks are inset in the narrow column.

### Kanban (Thursday column)

```
┌ Thu 12 ─────────────────────────────────┐
│ ┌─────────────────────────────────────┐ │
│ │ ○ Shift                8:00 · 10h  ↻│ │
│ │ 5h of 10h planned, 5h free          │ │
│ │ ▓▓▓▓▓░░░░░░░░░░  2 of 7 done        │ │
│ │   ● Briefing              8:30  30m │ │
│ │   ● Teams press meeting  10:00   1h │ │
│ │   ○ Ring patients        11:00   2h │ │
│ │   ○ Lunch                13:00  30m │ │
│ │   ○ Ring other depts     14:00   1h │ │
│ │   ○ Check emails                    │ │
│ │   ○ Order supplies                  │ │
│ │   [ + Add inside ]                  │ │
│ └─────────────────────────────────────┘ │
│ Planned 10h                             │
└─────────────────────────────────────────┘
```

- Inner timed items are rows of the shift's card, **not separate cards** in the column (Question 2).
- Each row's tick works in place: a timed row ticks that task, and a to-do row ticks the subtask.
- A shift with more than 6 rows shows 6 and `Show 3 more`.
- The details window shows the same header, bar, list and button, at full width.

## 10. Outlook calendar on the Timebox (wanted 8, a later phase, not this build)

- Read-only ICS subscriptions already exist on the desktop Calendar (`lib/icsParse.ts`, `lib/icsSubscriptions.ts`, `icsStore`, fetched by `desktop/src/icsFetch.js`). They are kept on this computer and never synced. The link is never logged.
- Outlook gives such a link from Settings, Calendar, Shared calendars, **Publish a calendar**, ICS link.
- **Later phase:** feed `importedOccurrences` for the day into `TimeboxPane` as read-only blocks:
  - a dashed outline in the subscription's colour, and a small calendar mark;
  - tooltip `From Outlook · Teams press meeting · 10:00–11:00`;
  - no tick, no drag, no resize; clicking opens a read-only popover, as on the Calendar.
- They nest by the same time rule, so a Teams meeting inside the shift draws inside it and counts toward `planned`, but not toward "x of y done", because it has no tick.
- A meeting that overlaps without fitting sits beside the shift in a lane.
- Nothing is written to the database.
- Effort about ½ day. Risks: Outlook's own refresh delay, which can be hours (say so in Settings), and a meeting and a task for the same thing showing twice. A later "Hide my task when an Outlook meeting has the same title and time" is possible but not planned.

## 11. Phases and effort

Each phase is one version, with targeted real checks in quiet mode while building, and the full regression at the end of S5 (test-policy).

| Phase | Version | What | Tests touched | Effort |
|---|---|---|---|---|
| S1 Rule and counting | 3.36.0 | `lib/nesting.ts` (`nestDay`, `shiftSummary`, `nestedMinutes`); totals, planned, Daily Planning, Analytics use it | New `nesting.test.ts`; `taskTotals`, `analytics`, `planningDraft` units | ¾ day |
| S2 Drawing and one kind | 3.37.0 | Shell, header strip, inset inner lanes on Day, Week and Timebox; "Fit inside" note; drop target is any longer block; Task or Break control removed; "Make it a normal block"; Free time wording | `timebox.layoutItems` units; p27, p28, p42, p47 to p51 wording and selectors; p14, p16, p31, p48 (`data-kind-choice`); one new real check of the example day | 2 days |
| S3 Card, details, Add inside | 3.38.0 | Summary and bar on the card and in details; inner rows with ticks; Add inside form and menu item; Set a time / No time | `subtasks`, `hostActions` units; a new real check: add both kinds, tick in place, totals | 1½ days |
| S4 Repeating and carry | 3.39.0 | All days for inner items; D5 carry widened; skip and delete offers | `seriesMove`, `breakCarry` units; p50 extended | 1 day |
| S5 Phone | 3.40.0 | Merges breaks P5: gaps and shells on the phone, control removed, Add inside, card rows; iOS markers reviewed | phone-p6, phone-p13, phone-p14, `phoneDay.test`; full regression | 2 days |
| S6 Outlook on Timebox (later) | — | Section 10 | `icsFeed`, a Timebox real check | ½ day |

That is about 7 days for S1 to S5. S1 is safe alone: totals become right before anything looks different. S2 and S3 belong together for a beta.

## 12. Risks

| Risk | What breaks | Plan |
|---|---|---|
| **Sync** | Nothing new is synced, but two devices on different builds total differently (old: 15 h, new: 10 h) | A CHANGELOG line. Older builds are explained in section 6. Subtasks already merge per row as today. |
| **Repeating days** | Inner items are their own series, linked only by time. Moving the shift on one day in an old build leaves them behind. Skip or delete of the shift in an old build leaves them standing. | D5 carry in this build; skip and delete offers; a moved shift's items un-nest visibly rather than silently. No stored link, by choice. |
| **Projected days** | Ticking a to-do or inner item on a coming day must store that day's row (series rule) | S3 checks it with a real tick on a projected day |
| **Night shifts** | `cont` (yesterday's overnight rest) never hosts today, so items after midnight would not nest | S1 lets `cont` host, with units for 20:00–08:00. The shell then shows on both days. |
| **The phone** | Still draws chips and has the control until S5. A shift made on the desktop shows lanes side by side there. | S5 merges with breaks P5. Until then, say so in the beta notes. |
| **Tests that pin chips and gaps** | `hosting.test` (break-only hosting), `timebox` lane units, p14, p27, p28, p42, p47 to p51 (`data-gap`, gap layout), p14, p16, p31, p48, phone-p14 (`data-kind-choice`), phone-p13 (`data-host-chip`), `taskKind.test` hints, `taskTotals` and `analytics` expectations | Each phase rewrites the tests it breaks. The gap tests keep passing because gaps are unchanged under nesting. Only wording and selectors move. |
| **Narrow Week columns** | A shell with an inset leaves little width for inner text | Inner blocks keep tier 1 (title only) and the tooltip carries the rest |
| **Unexpected nesting** | Two unrelated plain tasks where one happens to sit inside the other will now nest | That is the rule asked for. The header makes it visible, and moving one out un-nests it. Named in the CHANGELOG. |
| **Totals change** | Day totals drop for anyone with overlapping plain tasks | A CHANGELOG line, as for P1 of breaks |
| **Old breaks with no control** | Someone used Break as "busy" | "Make it a normal block" on free time details |

## 13. Questions (recommended default first)

1. **Lunch: planned or free?** *Default: planned* (it is an ordinary inside item, as asked). Use Free time to make it free.
2. **Inner timed items on Kanban: only as rows in the shift's card, or also their own cards?** *Default: only rows*, so the column has one card per shift and the day total cannot look doubled.
3. **Free time inside a shift: does it lower the shift's total?** *Default: yes*: 10 h with a 30 min gap reads "of 9h 30m", matching D4 and the day total.
4. **Add inside on a repeating shift: which choice has the focus?** *Default: All days of Shift*, matching the scissors. This day only is one press away.
5. **Week view text: keep the current size for blocks in seven narrow columns?** *Default: yes*. Everything else this plan touches is at least 14 px, and the Week tooltip is 14 px.

## 14. Done when

- No "Task or Break" control anywhere. Free time is made only with the labelled ✂ Free time tool, in plain words.
- The example day draws the five items inside the shift on Day, Week and Timebox. The shift reads "5h of 10h planned, 5h free" and "2 of 7 done" on the block, the card and the details. The day total is 10h in Kanban, Daily Planning, Analytics and the Timebox.
- Add inside works from details, the right-click menu and the card. To-dos tick in place. Timed items draw inside.
- The shift repeats 4 days a week. Its items repeat with it or not, as chosen, and move with it in one undo.
- No schema change. A 3.35.0 build on the same account shows everything, side by side.
- The full regression is green after S5.
