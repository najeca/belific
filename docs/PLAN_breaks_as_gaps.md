# Plan: breaks as gaps

Planning only, 2026-11-09, on top of 3.32.0 (branch v2-redesign). No code yet. Goal: a Break is a free gap in
the day, not a task.

## 0. Today in three lines

1. **Stored**: a Break is an ordinary task row with `cutsBelow: true` (column `cuts_below`, migration 004, synced, copied to
   every day of a series). Title, length, day and time are normal task fields. Nothing about cuts or hosting is stored: both
   are worked out from the times each time a day is drawn (`lib/cuts.ts`, `lib/hosting.ts`).
2. **Drawn**: on Calendar Day and Week and in the Timebox, a Break is a tinted ☕ block. It cuts the tasks it overlaps into
   pieces (each piece at least `planner.cut_min`, default 30 min). A task that sits wholly inside it becomes a chip in it:
   Day packs the chips by width (3.28.0 to 3.29.1); Week, Timebox and the phone use `chipPlan`, which gives one inline
   chip or "+N", or stacked rows. In Kanban day columns and in Brain Dump a Break is a normal card with a tick box and a
   "☕ Break" tag. Calendar blocks have no tick box at all.
3. **Counted**: as a task, everywhere. Its estimate counts in the Kanban day totals, Daily Planning, Brain Dump "planned"
   and the Analytics time card (once ticked), and it can appear in Missed. The minutes that tasks inside it share with it are
   taken off once (`hostedEstimate`) unless "Count minutes done during a break twice" is on. The Timebox "Scheduled" figure
   is the union of the blocks' spans, so a Break's span counts and the chips inside it add nothing.

## 1. What changes, in one table

| | Today | Wanted |
|---|---|---|
| Kanban day total, Daily Planning, Brain Dump "planned" | Break estimate counts | Never counts |
| Timebox "Scheduled" | Break span counts | Gaps excluded; tasks in gaps count at their real length |
| Analytics time card | Ticked breaks count | Breaks never count, history included |
| Day column card | Card with tick box and ☕ tag | Hidden; one quiet line per day (Q1) |
| Tick box | On the card | None, on any Break card |
| Missed | A past unticked one off break can show | Never |
| Calendar and Timebox drawing | Tinted ☕ block with chips | A light hatched gap; tasks in it are full width blocks |
| Making a break | New task, then Task or Break = Break | Also the scissors (C) |
| "Count minutes done during a break twice" | A setting | Removed (it means nothing once breaks do not count) |

## 2. Counting, cards, tick box (wanted 1)

One pure helper in `lib/taskKind.ts`: `isBreak(t) = !!t.cutsBelow`. Every total goes through it:

- `taskTotals.totalsOf` and `plannedText` skip breaks. `hostedEstimate` is no longer subtracted. A task in a gap no longer
  shares minutes with anything, so it counts in full, once.
- **A task cut by gaps counts only its pieces (Q4).** Boot Camp is stored as 7 h, but with 1 h 40 of gaps in it the day
  holds 5 h 20 of Boot Camp. A new `gapMinutes(tasks)` (next to `hostedEstimate`, the same per day walk over `cutDay`) takes
  the cut away minutes off the estimate. Kanban, Daily Planning and Analytics then agree with the Timebox: 7:00 for the
  example below, not 8:40.
- `analytics.timeCard` skips breaks: they are no longer done or estimated work. Counts of done tasks skip them too.
- `TimeboxPane` "Scheduled" is the union of the items that are not gaps (section 3 already takes gaps out of `items`).
- `lib/missed.ts` skips breaks. `planningDraft` (Daily Planning lists) skips breaks with a time and does not count any break.
- Settings loses the "Count minutes done during a break twice" row. `breakTwiceStore` and `BREAK_TWICE_KEY` stay until the
  phone phase (P5), then go. The stored `user_settings` row is left alone; older builds still read it.
- **Cards.** A Break with a day and a time is not a card in its day column. It is drawn on the grid and is edited from its
  gap there. The column ends with one quiet line instead (Q1): `☕ 3 breaks · 1h 40m`, muted, no tick. Pressing it opens a
  small popover that lists them; each row opens that break's details.
- **No time yet** (in Brain Dump, a list, or a day with no time): the Break keeps a card, because the grid has nothing to
  draw. The card has no tick box, still shows the "☕ Break" tag, and counts in no "planned". `C` on that card does nothing.
- The details of a Break hide the tick and its timer leftovers. Everything else stays editable: title, length, time, day,
  repeat, and Task or Break.

## 3. A break draws as a gap (wanted 2)

### Look (Day, Week, Timebox; the same component)

- A **gap layer** under the blocks of each day column: for each break entry (`hostDay(...).breakIds`) a rectangle at its real
  times, full column width. Light hatching (web `repeating-linear-gradient`, 45°, 1 px lines about 6 px apart) and a 1 px
  dashed outline. No fill tint, no ☕, no text. New tokens `gapLine` and `gapHatch` in light and dark (Motorways tokens,
  square corners like the 3.32 blocks).
- **Hover**: a tooltip `Short break · 20 min` (name and length). The existing hover "⋯" menu sits at the top right of the gap.
- **Click** on the visible part of a gap opens the break's details. Drag on its body moves it, and its top or bottom edge
  resizes it (section 7).
- A **task in a gap** (hosted, the rule in `hosting.ts` is unchanged) is now an ordinary item in `layoutItems`: a normal full
  width block at its real time and length, label colour, the usual tiers (`blockLayout.blockPlan`). Two tasks that overlap
  inside one gap share it in lanes, as anywhere else. The rest of the gap stays hatched.
- **Real size**: a block in a gap ignores `MIN_BLOCK_PX` (20) and uses a floor of 10 px, so a 10 min task does not stick out
  past the gap into the piece below. Its tooltip carries the text that tier 1 cannot show.
- The host's pieces are unchanged (`cuts.ts`): the piece after a gap still reads "11:20 · 5h 10m left".

### Wiring

`CalendarPane` and `TimeboxPane` build `entries` today, then pass `entries.filter(not hosted)` to `planCuts`. After the change:

1. Break entries go to `gaps` and stay out of `planCuts` items (`cutDay` still uses them to cut).
2. Hosted entries stay out of `cutDay`, so a task inside a gap is not "covered". They are pushed into `items` as plain items.
3. `hostedBy`, `HostChips` and `chipPlan` stop being used on the desktop. `HostChips.tsx`'s "Move out of break" and "Remove
   time" move to the block menu of a task that is in a gap (the same `hostActions`).
4. `TimeBlock`'s break branches (☕ cup, `BREAK_TINT`, `hostCount`, the inline chip text) go. A break never reaches
   `TimeBlock` again.

### Edge cases

- **A refused cut** (a piece would be under the minimum, or the break covers the task): the host draws whole over the gap.
  The gap's dashed outline is drawn above the host (no pointer events), and the hover note says why (`refusalNote`). With Q3's
  default the scissors cannot make one, so only old data or later edits reach this.
- **A break inside a longer break** (3.22.0) is just a second outline inside the first. Neither one hosts the other on screen.
- **Overnight**: the rest of yesterday's break (`cont`) is a gap at the top of today, the same as a block.
- **A break on empty grid** (nothing under it) is a gap on its own: free time you have marked.

## 4. The scissors (wanted 3)

### Behaviour

- **Toggle**: a square flat button with scissors in the Calendar header and in the Timebox header, and the key `C` (Q2). While
  it is on, the button shows as pressed, the pointer is a crosshair over the grid, and a quiet hint reads
  `Click the start of a break, then its end · Esc to stop`.
- **Hover**: a horizontal line across the day column under the pointer (time runs down, so the blade lies flat), snapped to 5
  minutes, with the time (`11:05`) in a small tag at the time gutter.
- **Cut**: click to set the start. Move: the preview gap (hatched) runs from the start to the snapped pointer. Click again to
  set the end. A press, drag and release longer than 4 px does the same in one movement. Start and end can be in either
  order. The shortest gap is 5 min. The gap stays in the column where it started, so in Week it cannot cross into another day.
- **The task under it** is the timed, non-break task block under the first click. If there is one, the gap is clamped to that
  task's span and its title is used in the popover. If there is none, the gap is a one off break on the empty grid.
- **Minimum piece (Q3)**: if the gap would leave a piece of the task shorter than `planner.cut_min`, the preview turns muted
  and shows the reason (`A piece would be 10 min (min 30)`), and the second click does nothing.
- **Popover** at the second click, only when the task under it repeats: `This day only` / `All days of Boot Camp`, with the
  second focused (Enter picks it). Esc closes it and drops the cut. The popover is flat and square, like 3.32's.
- **Create**: `stack.markGesture()`, then one `addTask`:
  - `{ title: 'Break', cutsBelow: true, dueDate: day, startTime, durationMinutes }` for this day only, or with no task under it;
  - for All days, also the task's `recurrence`, `recurrenceDays` and `recurrenceMonthDay` (from the series template). The new
    break series starts on the clicked day and repeats on the same days as the task from there on. Earlier days do not
    change.
  - A task with several times a day: the break is made for the time that was cut only (one `startTime`).
- **Undo**: one row in one gesture is one entry, `created Break`, so one Ctrl+Z removes it (a tombstone, as for any create).
- **Esc**: drops a cut in progress or the open popover. A second Esc (nothing in progress) turns the tool off. The tool stays on
  after each cut, as the blade does in Resolve.
- While the tool is on, blocks do not open, drag or resize, and the hover "⋯" menus are hidden. Middle mouse pan (3.24.0) and
  the wheel still work.

### Code

- `mobile/lib/blade.ts`, pure, desktop only (added to `scripts/ios-markers.js`): `snap5`, `bladeSpan(a, b, host?)`
  (ordered, at least 5, clamped to the day and to the host), `bladeCheck(span, hostEntry, entries, cutMin)` (the `cutDay`
  refusal, worded), `bladeTask(span, dayKey, scope, template?)`, and the tool's states: `off → armed → cutting → asking`.
- `components/desktop/BladeLayer.tsx`: the line, the time tag, the preview and the popover, over a day column. It is used by
  `CalendarPane` (each day column) and `TimeboxPane`. It reads `yToMinutes` from `lib/drag`.
- `uiStore`: `bladeOn` and its toggle. `lib/shortcuts.ts`: `{ id: 'blade', keys: 'C', scope: 'home' }` (Q2).

## 5. Data model and older builds (wanted 4)

**No database change.** A gap is a Break, which is a task row with `cutsBelow: true`. The scissors write exactly what Task or
Break = Break writes today, with a day, a time, a length and, for All days, the host's repeat rule. Hosting and cutting stay
derived. Nothing new is synced. The `planner.break_count_twice` row is simply no longer read. Every change is in how rows are
drawn and summed.

Older builds see the same rows they understand today:

- 3.5.0 to 3.32.0 (desktop and phone): the break is a ☕ block that cuts its task, and the tasks dropped into it are chips.
  That is a sensible calendar. Their totals still count breaks, which is expected on an old build.
- Builds before Part B (no `cuts_below` column): the break is an ordinary overlapping task beside its host. Nothing is lost.
- The calendar feed (`supabase/functions/belific-calendar-feed`) is unchanged by this plan. Breaks keep exporting as they do
  today (see risks).

## 6. The example, before and after

Boot Camp 9:30 for 7 h, repeating Mon to Fri. Short break 11:00 for 20 min, long break 12:30 for 1 h, short break 15:00 for 20
min, all three repeating with it. On Monday only, four tasks were dropped into the gaps: Get changed and warm up (11:00, 20 min),
Run (12:30, 30 min), Lunch (13:00, 30 min), Shower (15:00, 20 min). One row is 10 minutes. `▌` is a block, `░` a tinted break
block (today), `╱` a gap, `( )` a chip.

### Day, before (3.32.0)

```
 9:30 │▌Boot Camp                       9:30 7h │
 9:40 │▌                                        │
 9:50 │▌                                        │
10:00 │▌                                        │
10:10 │▌                                        │
10:20 │▌                                        │
10:30 │▌                                        │
10:40 │▌                                        │
10:50 │▌                                        │
11:00 │░☕ Short break (● Get changed and… 20m) │
11:10 │░                                        │
11:20 │▌Boot Camp              11:20 5h 10m left│
11:30 │▌                                        │
11:40 │▌                                        │
11:50 │▌                                        │
12:00 │▌                                        │
12:10 │▌                                        │
12:20 │▌                                        │
12:30 │░☕ Long break                   12:30 1h│
12:40 │░(● Run 30m) (● Lunch 30m)               │
12:50 │░                                        │
13:00 │░                                        │
13:10 │░                                        │
13:20 │░                                        │
13:30 │▌Boot Camp                 13:30 3h left │
 ...  │▌  (9 rows)                              │
15:00 │░☕ Short break (● Shower 20m)           │
15:10 │░                                        │
15:20 │▌Boot Camp              15:20 1h 10m left│
 ...  │▌  (7 rows, to 16:30)                    │
                                Day total today: 8:40
```

### Day, after

```
 9:30 │▌Boot Camp                       9:30 7h │
 9:40 │▌                                        │
 ...  │▌  (9 rows)                              │
11:00 │▌Get changed and warm up      11:00 20m  │
11:10 │▌                                        │
11:20 │▌Boot Camp              11:20 5h 10m left│
 ...  │▌  (7 rows)                              │
12:30 │▌Run                          12:30 30m  │
12:40 │▌                                        │
12:50 │▌                                        │
13:00 │▌Lunch                        13:00 30m  │
13:10 │▌                                        │
13:20 │▌                                        │
13:30 │▌Boot Camp                 13:30 3h left │
 ...  │▌  (9 rows)                              │
15:00 │▌Shower                       15:00 20m  │
15:10 │▌                                        │
15:20 │▌Boot Camp              15:20 1h 10m left│
 ...  │▌  (7 rows, to 16:30)                    │
                 Day total 7:00 (5:20 Boot Camp + 1:40 tasks)
        Day column: Boot Camp, the four tasks, then  ☕ 3 breaks · 1h 40m
```

All three gaps are full here, so no hatching shows. Remove Lunch and 13:00 to 13:30 shows `┊╱╱╱╱╱╱╱╱┊` under the Run block.

### Week, before (3.32.0; columns too narrow for an inline chip)

```
       Mon 9                  Tue 10
 9:30 │▌Boot Camp 9:30 7h   │▌Boot Camp 9:30 7h   │
 ...  │▌                    │▌                    │
11:00 │░☕ Short break    +1 │░☕ Short break       │
11:10 │░                    │░                    │
11:20 │▌Boot Camp 11:20 5h… │▌Boot Camp 11:20 5h… │
 ...  │▌                    │▌                    │
12:30 │░☕ Long break  12:30 │░☕ Long break  12:30 │
12:40 │░(● Run 30m)         │░                    │
12:50 │░(● Lunch 30m)       │░                    │
13:00 │░                    │░                    │
 ...  │░                    │░                    │
13:30 │▌Boot Camp 13:30 3h… │▌Boot Camp 13:30 3h… │
 ...  │▌                    │▌                    │
15:00 │░☕ Short break    +1 │░☕ Short break       │
15:10 │░                    │░                    │
15:20 │▌Boot Camp 15:20 1h… │▌Boot Camp 15:20 1h… │
```

### Week, after

```
       Mon 9                  Tue 10
 9:30 │▌Boot Camp 9:30 7h   │▌Boot Camp 9:30 7h   │
 ...  │▌                    │▌                    │
11:00 │▌Get changed…    20m │┊╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱┊ │  hover: Short break · 20 min
11:10 │▌                    │┊╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱┊ │
11:20 │▌Boot Camp 11:20 5h… │▌Boot Camp 11:20 5h… │
 ...  │▌                    │▌                    │
12:30 │▌Run             30m │┊╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱┊ │  hover: Long break · 1 h
12:40 │▌                    │┊╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱┊ │
12:50 │▌                    │┊╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱┊ │
13:00 │▌Lunch           30m │┊╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱┊ │
13:10 │▌                    │┊╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱┊ │
13:20 │▌                    │┊╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱┊ │
13:30 │▌Boot Camp 13:30 3h… │▌Boot Camp 13:30 3h… │
 ...  │▌                    │▌                    │
15:00 │▌Shower          20m │┊╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱┊ │
15:10 │▌                    │┊╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱┊ │
15:20 │▌Boot Camp 15:20 1h… │▌Boot Camp 15:20 1h… │
```

The Timebox draws the same as one Day column. Its "Scheduled" is 7h on Monday and 5h 20m on Tuesday. Today it shows 7h on both.

### Making Tuesday's gaps with the scissors

```
C                      → tool on, line follows the pointer:  11:05 ─────────────
click at 11:00 on Boot Camp, move to 11:20, click
                       → popover at the pointer:  [ This day only ]  [■ All days of Boot Camp ]
Enter                  → one Break series, 11:00 20 min, Mon–Fri from Tue 10. Ctrl+Z removes it.
```

## 7. Risks

| Risk | What breaks | Plan |
|---|---|---|
| Break chips, 3.28.0 to 3.29.1 (`packChips`, `chipLines`, `HostChips`, `CHIP_*`) | All of it stops being used on the desktop | P2 deletes the desktop use. `chipPlan` stays for the phone until P5. `packChips` and `chipLines` are deleted with their tests in P2. |
| Block size tiers (`blockLayout`, `MIN_BLOCK_PX`) | Blocks in gaps are often short (20 min is 19 px, tier 1). The 20 px floor would overflow a 10 min gap. | Use the normal tiers. In a gap the floor is 10 px. A tier 1 block's tooltip carries its text. |
| Drag and drop (`DragProvider`, `hostDrop`, `dwellDrop`) | A drop on a gap still lands inside it (`hostStart`), and a task too long for it is refused. Gaps are no longer blocks, so the drop target is the gap layer's span, not a block. | Keep the rules. Feed `setDayBreaks` from the gap list (the same data). Dragging a Break onto a gap: the 3.22.0 dwell stays. |
| Resize and move a gap | A gap is under the blocks, so its edges can be covered by tasks inside it | The gap's edge handles sit in a thin strip above the blocks (z above, 6 px). Its body can be dragged where no task covers it. `lostGuests` and its note stay. |
| Host moved "this day only" (3.20.0), or a series time changed from the details | The break series does not follow, so the gaps are left on empty grid and the moved task is whole again | Q5: in the same gesture, move the breaks that sat wholly inside the host's old span on that day by the same delta. That is derived, nothing stored, and still one undo. For a series edit, move the break series the same way. |
| Totals change on screen for every user with breaks | Day totals and Analytics drop | A CHANGELOG line, and the Settings row is removed with a note in its place for one version: "Breaks no longer count in totals". |
| The phone | It shares `lib` (totals, missed) but draws chips (`PhoneBlock`, `HostedSheet`) | P1's counting change reaches the phone on its next build. P5 draws gaps on the phone. There is no scissors on the phone (no hover). |
| Tests that pin the chip layout | `hosting.test.ts` (32 chip refs), `tokens.test.ts`, real tests p27, p28, p42, p47, p48, p49, phone-p13, phone-p14 (`data-host-chip`, `break-cup`, `break-tag`, `host-pill`), p14 (cuts), plus `taskTotals`, `analytics`, `partB`, `planningDraft` expectations that breaks count | Each phase rewrites the tests it breaks (section 8). The Motorways screenshot baseline is re-recorded in P2. |
| Key C | `C` already ticks the focused card | Q2 |
| Calendar feed | Breaks export as busy events | Out of scope. A one line follow up later (export them as free, or skip them). |
| Missed and Daily Planning | An unticked past break would nag | Covered in P1 |

## 8. Phases and effort

Each phase is one version, with targeted tests while building and the full regression at the end of P5 (test-policy).

| Phase | Version | What | Tests touched | Effort |
|---|---|---|---|---|
| P1 Counting | 3.33.0 | `isBreak`, `gapMinutes`, totals, planned, Analytics, Scheduled, Missed, Planning; no tick on break cards; day column quiet line; Settings row removed | `taskTotals`, `analytics`, `partB`, `planningDraft`, `missed` units; p42 and p48 card checks; one new real check of the quiet line | ½ day |
| P2 Gaps drawn | 3.34.0 | Gap layer and tokens; hosted tasks as items; refusal outline; chip code off the desktop; block menu "Move out" | `hosting.test` chip cases removed, new `gapItems` units; p27, p28, p47, p49 rewritten to assert gap and block; screenshot baseline | 1½ days |
| P3 Gap editing | 3.35.0 | Drop onto gaps, move and resize a gap, edge strip, Q5 carry on host move | `hostActions`, `seriesMove` units; p14 and p48 drag checks; a new resize real check | 1 day |
| P4 Scissors | 3.36.0 | `blade.ts`, `BladeLayer`, button, `C`, popover, Esc, undo | `blade.test.ts` (snap, span, clamp, refusal, task fields, All days rule); `shortcuts.test`; a real check that cuts a gap, picks All days, and undoes | 1½ days |
| P5 Phone | 3.37.0 | Phone draws gaps and hosted blocks; `chipPlan`, `HostedSheet` chips and the break twice store removed | phone-p6, phone-p13, phone-p14; `phoneDay.test`; iOS markers | ¾ day |

About 5 days in all. P1 is safe to ship alone. P2 and P3 belong together for a beta, because after P2 a gap cannot yet be resized.

## 9. Questions (each with the default I would build)

1. **Breaks in a day column**: one quiet line `☕ 3 breaks · 1h 40m` at the foot of the column that opens a list, or hidden
   completely? *Default: the quiet line.*
2. **Key C** already ticks a focused card. *Default: `C` turns the scissors on and off when no card has focus, and a focused
   card keeps `C` = complete. The button's tooltip says "Scissors (C)".* The other choice is `B`, as in Resolve.
3. **Minimum piece** (`planner.cut_min`, 30 min): keep it for gaps? *Default: keep it. The scissors show the reason live and
   refuse the cut.* The other choice is to drop the minimum for breaks only, so any gap of 5 min or more always cuts.
4. **A task cut by gaps counts only its pieces** (Boot Camp counts 5:20, not 7:00). *Default: yes, so the totals match the
   Timebox.*
5. **When the host moves on one day, or its series time changes**: do the breaks inside it move with it? *Default: yes, in
   the same gesture and the same undo.*

## 10. Done when

- No total, estimate or Analytics figure includes a break. The example reads 7:00 on Monday and 5:20 on Tuesday, in Kanban
  and in the Timebox alike.
- No break card has a tick box. Breaks with a time are not cards in day columns.
- Day, Week and Timebox draw gaps hatched, with name and length on hover. Tasks in a gap are full width blocks at their real
  times.
- The scissors cut a gap as described, the popover defaults to All days, Esc cancels, and one Ctrl+Z removes the gap.
- No schema change. A 3.32.0 build on the same account still shows the breaks with their chips.
- The full regression is green after P5.
