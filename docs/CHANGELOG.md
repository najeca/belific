# Belific Mobile — Changelog

Every completed feature, fix, or change bumps `mobile/app.json`'s
`expo.version` (patch for fixes, minor for features) and gets an entry
here, dated, as part of the same scoped commit — not added
retroactively at session end. Read this file before starting new work
to know the current version and recent history.

---

## 3.43.0 — 2026-11-11 (Daily flow, F4: Plan my day on one screen, the morning note; PLAN_daily_flow)

**Desktop. No schema change, no migration, no data change: every button writes existing fields and the usual tombstones. The phone is unchanged.**
- **Plan my day is one screen** (`components/desktop/PlanMyDay.tsx`; rules `lib/planDay.ts`; writes `lib/wrapActions.ts` `notToday` and `addToday`), from the Plan button or Ctrl+Shift+P. It takes the place of the left pane and the centre while it is open; **the real Timebox stays on the right**, docked and on today. One main button, **Done**, which only closes; there is no draft, no Cancel, no Next and nothing moves on Done (the four steps, `planningDraft.ts`, `planningActions.finishFlow`, `PlanningFlow.tsx` and `MissedList.tsx` are gone).
  - **On today:** the day's stored and repeating tasks by time; a done one shows as done. **A shift is one item**, with what is inside it folded into its line ("2 inside · 1 to do"); its inside blocks are not rows of their own. Each task has a ticked box: **unticking** a one off task sends it back to its list (Day and time cleared); unticking a repeating task **skips it today** (the usual skip tombstone; its other days stay). The foot says "Planned 11h 15m" (a shift once).
  - **Add to today:** one picker, Brain Dump first, then each list by name, with a **Today** button on each task that has no Day. Below it, **Repeating, not on today**: each repeating task whose next day is not today, with "next: Fri 14 Nov"; Today moves that one day here (Move this day).
  - **The Timebox:** drag any row onto it to give it today and a time (the existing drag and drop, one gesture, Ctrl+Z). A task left alone stays untimed.
  - **Earlier days** are one folded line, "3 from earlier days" (never "missed"), which opens the Earlier panel; closing it comes back to Plan my day.
  - **Saves as you go (D1):** each button is one gesture and folds its row ("Added to today", "Not today, back to its list", "Skipped today, it repeats") with its own Undo; Ctrl+Z and Ctrl+Y work on the screen. Today or Tomorrow being an away day is one line at the top.
  - Words 14 px or more, buttons always visible, nothing red.
- **Morning note (optional):** Settings, Notifications, **Remind me to plan my day**, off by default, at 08:00 unless changed, next to Remind me to wrap up. One calm toast, "Time to plan your day, if you like." (no count, ever); a click opens Plan my day (`scheduler.js` kind `plan`, `settings.js` `planReminder` and `planTime`, `notify:open`). A per computer setting.
- **Tests changed on purpose:** new planDay.test.ts (3); planningDraft.test.ts removed with the draft; scheduler.test.js (+1: the morning note; the defaults); easConfig.test.ts (version); real: new p59 (29 checks: one screen, the Timebox beside it, a shift as one item, skipping a repeating task today and its Undo, a one off task back to its list and Ctrl+Z, Today from Brain Dump and from a list, a repeating task's next day, a drag onto the Timebox and Ctrl+Z, the planned figure, the earlier line and back, Done, Ctrl+Shift+P, Escape, the morning note setting), p5 (sections 1 to 3 are now Plan my day on one screen), p46 (the earlier days line in Plan my day opens Earlier), p56 (Plan my day has no steps); pointer only p10 (the earlier line, the away line) and p11 (the flow's estimate drop-down is gone; and an apostrophe that stopped p11 from parsing since 3.40.0 is escaped) (not run in quiet mode).

## 3.42.0 — 2026-11-11 (Daily flow, F3: Wrap up on one screen, the Earlier panel, past days on the board; PLAN_daily_flow)

**Desktop. No schema change, no migration, no data change: every button writes existing fields and the usual tombstones. The phone is unchanged.**
- **Wrap up is one screen** (`components/desktop/WrapUp.tsx`; rules `lib/wrapUp.ts`, writes `lib/wrapActions.ts`), from the Plan button: today's tasks by time, a tick each (it saves at once, either way). Each unticked one off task has three visible buttons: **Tomorrow** (the time stays), **Back to its list** (Day and time cleared) and **Let go** (to the Trash, restorable for 30 days; D2). One main button, **Done**, which only closes. There is no draft, no Cancel and nothing moves on Done.
  - **Saves as you go (D1):** each button is one gesture. The row folds to one grey line ("Tomorrow", "Back to its list", "Let go, in the Trash") with its own **Undo**, which undoes that row even when later rows were decided after it (`undoStack.stepEntry`, `undoActions.undoEntry`). Ctrl+Z and Ctrl+Y work inside Wrap up and Earlier too.
  - **Steps:** a task with some steps ticked and some not offers **Only the N steps left to tomorrow**: a copy with the steps left goes to tomorrow (same title, list, label, length and time), and today's task keeps its ticked steps and is done. One save, one Ctrl+Z.
  - **A shift is one row**, with its rows (the blocks inside it and its to dos) under it. **Tomorrow on the shift** takes the one off items inside it that are not done; done ones stay as history and repeating ones stay on their day (`breakCarry.carryToDay` has a filter for this). A shift's to do has its tick only (it is the shift's checklist and goes with it).
  - **Repeating tasks never move:** an unticked repeating day has its tick and **Let go** only, which skips that day (the usual skip tombstone; never the whole series). It comes back on its next repeat day.
  - The foot says **"Tomorrow so far: 4 tasks, 3h 30m"** (a shift is one task, counted once). No "missed" or loss words, nothing red, every word 14 px or more.
- **The old Shut down is gone:** its two steps, the carry list and the move on Finish. **Plan my day's Finish no longer rolls** the unfinished tasks of earlier days onto today (they wait in Earlier); Plan my day is otherwise unchanged until F4 (its earlier days column is always shown and is called "From earlier days").
- **Earlier days never stay on the Tasks board (D5):** a day before today shows only what was done there. The Calendar keeps showing the day as it was planned.
- **The Earlier pill is always there** (the "Show missed tasks" switch is gone from Settings; a stored `feature.missed` row is left as it is and not read). Its count counts a shift as one, with what is inside it; no zero is shown.
- **The Earlier panel** (it was the Missed panel): one row per one off task of an earlier day, with its day; a shift is one row with its unticked inside rows under it. Each row has **Tomorrow, Back to its list, Let go** and, before 14:00, **Today**; its tick marks it done on its own day. **Tick all N** at the top marks them all done on their own days in one save, with one Undo at the top. Every action saves at once and folds the row with its own Undo. Pick a day, Drop, Skip all and Move all to today are gone from the panel.
- **Evening note (optional):** Settings, Notifications, **Remind me to wrap up**, off by default, at 18:00 unless changed. One calm toast, "Time to wrap up the day, if you like." (no count, ever); a click opens Wrap up (`desktop/src/scheduler.js` kind `wrap`, `settings.js` `wrapReminder` and `wrapTime`, `main.js` and `preload.js` `notify:open`). It is a per computer setting, like the daily reminder.
- **Tests changed on purpose:** new wrapUp.test.ts (4), undoStack.test.ts (+1: an older entry undone alone), features.test.ts (the missed switch is gone), scheduler.test.js (+1: the evening note; the defaults), easConfig.test.ts (version); real: new p58 (37 checks: the past column, the pill, Wrap up's one screen, the tick and Ctrl+Z, each button with its folded Undo, an older row's Undo, the steps split and Ctrl+Z, a repeating day's Let go, a shift to tomorrow with its open item and Ctrl+Z, the figure, Done, the Earlier panel's buttons, Today before 14:00 only, a shift with Handover, Tick all and its Undo), p5 (no rollover on Finish; Wrap up is one screen), p46 (rewritten: no switch, the Earlier panel's tick and Tick all), p56 (Wrap up has no steps), p23 (Analytics from the Plan menu when the top row is narrow); pointer only p10 (the Earlier panel's buttons; not run in quiet mode).

## 3.41.0 — 2026-11-11 (Daily flow, F2: Clear tools, the batch save, the avatar menu trimmed, two fixes from S4; PLAN_daily_flow)

**Desktop. No schema change, no migration, no data change: every Clear writes existing fields and the usual tombstones. The phone is unchanged.**
- **The avatar menu is only the account and Settings** (signed out: Sign in and Settings; signed in: the account and its sync line, Sync now, Settings, Sign out). **Quick capture, Search, Keyboard shortcuts, Progress and Trash** are plain buttons at the top of Settings ("Go to", with their keys). Every keyboard shortcut works as before (Q, T, Ctrl+K, Shift+/ ...).
- **Clear tools** (`lib/clear.ts` the rules, `lib/clearActions.ts` the writes, `components/desktop/ClearTools.tsx` the confirmation): **Clear day** in the day menu (Tasks board), **Clear week** in a new ⋯ beside the Tasks board's title and in the Calendar's Week header (Monday to Sunday), **Clear list** in the list's edit box, **Clear label** as a Clear button on each label (Labels). Each counts first ("Clear 3 tasks from today?", "Clear the label Work from 2 tasks?"), says in plain words what will happen, and has one main button and Cancel.
  - Clear day and Clear week send the unticked tasks back to their lists (Day and time cleared). Nothing is deleted.
  - Clear list moves its unticked tasks to the Trash (restorable for 30 days). The list stays.
  - Clear label takes the label off its unticked tasks; a smaller second button, **Move the N tasks to Trash**, moves them to the Trash instead (D3).
  - Done tasks are never touched, and free time (a Break) is left alone.
  - A repeating task asks **This day only** (for a list or a label: its next day) or **All days** (chosen). This day only skips that day. All days, for a day or a week, stops the series repeating and sends it back to its list; for a list or the label's Trash it deletes the series (into the Trash). A label is shared by every day of a series, so taking it off asks nothing.
  - A shift counts as one ("A shift counts as one, with the 2 tasks inside it.") and takes what is inside it along, the day after midnight too (not when only a label comes off).
  - The confirmation is 14 px or more, the buttons are always visible, and nothing is red.
- **One batch save, one undo** (`storage.updateTasks`): many rows in one read, one write and one sync batch, each recorded in the undo stack under the same gesture. A Clear is ONE entry: one Ctrl+Z, or the Undo in the note that follows ("Cleared 3 tasks"), restores everything. Wrap up's "Let go" and "Tick all" will reuse it (F3).
- **Fixed from S4:** undoing **Delete repeating task** brings the repeat rule back (`undoStack.planStep`): when the series comes back as a copy under a new id (its own day's id was taken), the copy keeps the rule unless the old series is alive again through another of its rows (then a second series would show every day twice). **Move this day**, **Move to today** and the day menu's moves (Shift unfinished, Push rest of week, Mark as away) take what is inside a shift to the new day too (`breakCarry.carryToDay`), as a drag does; the day menu's Undo is now the undo stack's (one gesture), so it puts the carried items back too.
- **Tests changed on purpose:** new clear.test.ts (6), undoStack.test.ts (+1: the rule comes back, a taken day id, an alive old series), easConfig.test.ts (version); real: new p57 (27 checks: the avatar menu and the Settings links, Q, each Clear with its count and wording, This day only and All days, the shift in a cleared day, one Ctrl+Z after each, the label's Trash button, the repeat rule undo, Move to today carrying), p56 (the avatar menu no longer has Trash or Quick capture); the pointer only checks p6, p7, p23 and cp11 now reach Trash and Progress through Settings (not run in quiet mode).

## 3.40.0 — 2026-11-11 (Daily flow, F1: the Plan button, the Free time line setting, the list on cards; PLAN_daily_flow)

**Desktop. No schema change, no migration, no data change: the one new setting is a user_settings row. The phone is unchanged.**
- **A Plan button in the top bar** (`components/desktop/PlanButton.tsx`, `lib/planEntry.ts`), next to the avatar, on the home screen and in the page strip. It opens **Plan my day** from 04:00 to 13:59 and **Wrap up** from 14:00 to 03:59 (it changes its words by itself); the small chevron button beside it always lists both, so the other is one press away. Both parts are always visible, outlined, 14 px. Plan week is not built yet and is not listed. It follows the Daily planning feature (Settings, Power features): off, no Plan button.
- **Wrap up** is the old Shut down my day: its screen is titled "Wrap up · Step 1 of 2" (it was "Daily Shutdown"); the steps are unchanged for now (F3).
- **An Analytics text button** (plain, underlined, 14 px) beside the Plan button. It moves into the Plan menu when the window is under 1100 px, and also when the centre pane's top row is under 880 px wide (all three panes open on a 1440 px window squeeze it to about 770 px, which would have clipped the avatar). It follows the Analytics feature.
- **The avatar menu** no longer has Plan my day, Shut down my day or Analytics. It keeps Quick capture, Search, Settings, Keyboard shortcuts, Progress, Trash, Sync and Sign in or out. The Daily planning feature's hint now reads "Plan my day and Wrap up, the Plan button and Ctrl+Shift+P."
- **The Free time line is a setting, off by default** (Settings, Planning: "Show free time at the foot of each day"; `freeTimeStore.ts`; the synced user setting `board.free_time_line`). The line now reads "☕ Free time · 1h 40m". The gaps on the Calendar and the Timebox stay the only sign of a break otherwise.
- **A card on the Tasks board shows its list** (the emoji and the name, 14 px; a task in Brain Dump shows "🧠 Brain Dump") on its first line, after a small dot in the label's colour. The band keeps the label's colour; the label's name is the dot's tooltip and screen reader name, and is in the details. The left pane's rows are unchanged.
- **Also:** the Timebox's "Free time" button moved to its title row (the date row was too narrow for its words, and clipped them since 3.37.0).
- **Tests changed on purpose:** planEntry.test.ts (new: which flow when, the words, Analytics's breakpoints, the setting's parser), easConfig.test.ts (version); real: new p56 (the Plan button, its menu and both flows, the avatar menu, Analytics from its button and from the menu at 1000 and 1440 px, the Free time line setting and the card's list), p11 (the card's list rewritten), p14 p27 p28 p48 (they seed the Free time line setting on), p22 (wording); the pointer only checks p5, p6, p7 and p23 now open Plan my day, Wrap up and Analytics from the Plan button (not run in quiet mode).

## 3.39.0 — 2026-11-11 (Shifts, S4: repeating and carry; rows only on long blocks; PLAN_shifts)

**Desktop. No schema change, no migration, no data change: what goes with a shift is still worked out from the times. The phone is unchanged until S5.**
- **Fix from 3.38.0: rows only on a long block.** A Kanban card shows the rows with in place ticks only for a placed task of **2 hours or more** (`SHIFT_MIN_MINUTES`). A shorter task with steps shows its steps ring again, as before 3.38.0, and the blocks inside a shorter task keep their own cards (the grid still draws them inside it). A placed task of 2 hours or more with to dos only (no timed block inside) shows its to dos as rows with the bar, and no summary line.
- **Everything inside moves with it** (`gaps.carryPlan`, `breakCarry.carryBreaks`, in the same gesture, so one Ctrl+Z): free time (as since 3.34.0, G5) and now the blocks fully inside the task's time and shorter than it (what is drawn inside it). It covers a drag on the grid, the arrow keys on a block, a new time or day in the details, and, new, a card dropped on another day column of the Tasks board (the items keep their times on the new day). A repeating item moves the way its shift was changed: a drag or a key changes that day only (`editRepeatingTime` 'day', or `moveDay` for another day), the details' new time changes every repeat day without a time of its own ('panel'). A one off item moves on its day.
- **Inside items repeat with the shift** (as built in 3.38.0's Add inside: "This day only" or "All days of Shift", All days chosen, D4); S4 makes them follow every move of the shift.
- **A shift that crosses midnight** (Night 20:00 for 12 h): what is inside its overnight part on the next day moves with it too (a day move takes it to the day after the new day); the shift's card lists it as "Meds 2:00am (next day) 30m"; on the next day it has no card of its own (D2) and that day's total leaves it out (the shift counts on its own day). A move that would push an item past the following midnight leaves it where it is.
- **Skip and delete ask about what is inside** (`ShiftChoice`, `shiftActions.withShift`): Skip this day, Delete task (card menu and details) and Delete repeating task on a task with separate blocks inside it say "This shift has 5 items inside it. Its to dos always go with it." with **Skip/Delete the shift only**, **Skip/Delete the shift and its 5 items** and Cancel. With its items: a repeating item skips that day (or, for Delete repeating task, its series is deleted), a one off item goes to the Trash. The count is the separate tasks inside it (its to dos are its own checklist and always go with it); a task with several times a day is left out. One gesture, so one Ctrl+Z brings everything back (a deleted task comes back as the Trash's restored copy, and a deleted series as a copy of its day without the rule, as undo has done since 3.21.0).
- **Tests changed on purpose:** shifts.test.ts (+3: the 2 hour rule, midnight rows and the next day's carried item, the items a skip or delete takes), gaps.test.ts (carryPlan: Lunch inside Boot Camp now moves with it; a move past midnight with the day after known; a night shift's two days), easConfig.test.ts (version); real: new p55 (a repeating nurse shift four days a week and a night shift: the 2 hour rule, rows, midnight, this day only, a day move across midnight, skip, delete and delete repeating, each with one Ctrl+Z).

## 3.38.0 — 2026-11-11 (Shifts, S3: the shift's card and details, Add inside; PLAN_shifts)

**Desktop. No schema change, no migration, no data change: a timed item is an ordinary task, a to do is an item of the shift's existing checklist (subtasks), and what is inside a shift is still worked out from the times. The phone is unchanged until S5.**
- **The Kanban card of a shift** (a placed task that has blocks fully inside its time, or a checklist; `lib/shifts.ts` `shiftsOfDay`, `components/desktop/ShiftBody.tsx`) shows, under its title lines: the same summary as the grid ("5h of 10h planned, 5h free"; only when a timed block is inside), a progress bar with "2 of 7 done" (the timed blocks and the to dos together), its rows (up to 6, then "Show N more") and a **+ Add inside** button. Each row has a round tick that works in place, with no details opened: a timed block is ticked like any task (only its own time for a task with several times a day), a to do flips in the shift's checklist. A row's title opens that task. The steps ring of such a card is replaced by the rows; an untimed task keeps its ring.
- **D2: a block inside a shift is a row, not a card.** Its own card is not drawn in that day column (a block in free time, one that only partly overlaps and a block inside a shift that the filter hides keep theirs). The day total still counts the shift once (S1), so nothing looks doubled.
- **The details window** of a placed task shows the same summary, bar, rows and an **Add inside** button above its fields.
- **Add inside** (the details button, a right click on any block on the Day, Week and Timebox: Open / Add inside, and the card's foot): one small form, 14 px text, one filled button ("Add"), no red. A name; **No time, just a to do** (chosen at first) or **At a time** with a time and a length. A to do joins the shift's checklist. A timed item becomes an ordinary task on the shift's day, so it draws inside the shift. A time that starts before or ends after the shift says so in grey ("This would end after Shift (6:00pm)") with **Fit inside**; "Add" waits until it fits. A shift with no time can only take to dos. On a repeating shift: **This day only** or **All days of <shift>** (All days chosen, D4): All days adds the to do to every day (each day keeps its own ticks, seriesWide.ts) or makes the timed item a series on the shift's repeat days from that day on (as the free time tool does); This day only stores that day alone.
- **Ticking the last to do does not complete the shift** (it has its own tick and its timed blocks); ticking an ordinary task's last step still does. Each add and each tick is one gesture, so one Ctrl+Z puts it back.
- **Tests changed on purpose:** new shifts.test.ts (the nurse card, to dos only, free time and partial overlaps are not rows, visible shifts only, the form's rules, the tasks it writes, the tick); `scripts/ios-markers.js` (51 markers: `shiftsOfDay`, "No time, just a to do"); easConfig.test.ts (version); real: new p54 (the nurse day: the card, the details, Add inside with a time from the details, a to do from the card, the grey note and Fit inside, the Calendar's right click menu, both rows ticked in place, four Ctrl+Z steps, a repeating shift with All days); p22 (its break contrast check was stale since 3.34.0: a break is a gap with no text).

## 3.37.0 — 2026-11-11 (Shifts, S2: a shift draws with what is inside it; one kind of block on the desktop; PLAN_shifts)

**Desktop. No schema change, no migration, no data change. The phone is unchanged until S5 (it keeps Task | Break and its chips).**
- **A shift draws with what is inside it** (`lib/nesting.ts` `nestPlan`, `lib/timebox.ts` `layoutNested`), on the Calendar's Day and Week and in the Timebox. A block that sits fully inside a longer block's time is drawn inside that block's lane at its real time and size; blocks inside that overlap share lanes among themselves. One level: everything goes to the outermost block. Free time still comes first: a task inside a gap belongs to the gap.
- **The shell's header:** in a lane at least 280 px wide (Day, a wide Timebox) the left part of the block holds its title, time and summary at 14 px or more, "5h of 10h planned, 5h free" (or "Nothing planned yet, 10h free", "10h planned, nothing free"), and the blocks inside take the rest. In a narrow lane the header is one line, "Shift   5h/10h", and the blocks inside start 8 px in; the Week view keeps its text size (D5), elsewhere it is 14 px. The shell's free parts are a light tint of its label colour. The summary is in its tooltip and screen reader name. Free time cut out of a shift lowers its total (D3); lunch inside it is planned (D1).
- **One kind of block on the desktop:** the details window has no Task | Break control. Free time (a Break) says "Free time is not counted as planned. Blocks inside it count in full." with a visible **Make it a normal block** button (and, inside a longer break, that its free time is ignored there).
- **Partly overlapping blocks** stay side by side and both count. The one that starts inside a longer block and ends after it says so in grey ("Starts inside Shift and ends after it", in its tooltip and details) with a **Fit inside** button that moves it to end with the longer block. Not offered against a shorter block, nor for a task with several times.
- **The scissors are "Free time":** the button shows ✂ and the words "Free time" (tooltip and name "Mark free time (C)"); hint "Click where the free time starts, then where it ends. Esc to stop."; refused "Too short: this would leave 10 min (at least 30)" or "This would cover the whole block"; new rows are titled "Free time"; hint, refusal and hover time at 14 px. The Tasks board's day column line reads "☕ Free time · 1h 40m". No red anywhere on these.
- **Tests changed on purpose:** nesting.test.ts (S2: the nurse day drawn, summaries, free time in a shift, partial overlaps and Fit inside), blade.test.ts and breakLine.test.ts (wording), easConfig.test.ts (version); `scripts/ios-markers.js` (the new hint); real checks p14 (Make it a normal block, then one Ctrl+Z brings the cut back; the former break is drawn inside Boot Camp), p16 (the Free time row; the vibrant checks expect a break to be a gap, stale since 3.34.0), p27 (the line), p28 (Make it a normal block), p31 (no Task | Break control), p48 (rewritten: no control, the Free time row, Make it a normal block, Lunch then drawn as a shell), p51 (wording), new p53 (the nurse day on Day, Week and Timebox, Fit inside).

## 3.36.0 — 2026-11-11 (Shifts, S1: a block inside a longer block counts once; PLAN_shifts)

**Desktop and phone share the counting. No schema change, no migration, no data change: which block is inside which is worked out from the times. Nothing looks different on screen yet (S2 draws it).**
- **A block inside a longer block counts once** (`lib/nesting.ts`: `nestDay`, `nestedMinutesBy`, `nestedMinutes`). A timed block that starts and ends inside a longer block's time (the edges count) adds nothing on top of it; the longer block counts at its own length less any free time cut out of it (D3, G4). One level: everything goes to the outermost block. Free time comes first: a task inside a gap still belongs to the gap and counts in full. Lunch inside a shift is an ordinary block and part of its planned time (D1).
- **Where:** the Tasks board's day totals, the Calendar header total, Daily Planning ("Estimated" and the per label shares), Brain Dump "planned" and the Analytics time card. The Timebox "Scheduled" already counted the union of the blocks, so it is unchanged. The nurse example (Shift 8:00 for 10 h with five things inside) now reads 10h everywhere, not 15h.
- **Still counted twice on purpose:** two blocks with the same start and end, and two that only partly overlap (both count, side by side). A block inside a shift that is done (or not in the list being totalled) counts on its own; so does a done item inside a shift that is not done, in Analytics.
- **Tests changed on purpose:** new nesting.test.ts (the rule, the nurse example in every total, D1, D3, partial and equal overlaps, several times a day), easConfig.test.ts (version); new real check p52 (the nurse's Kanban total and Timebox Scheduled).

## 3.35.0 — 2026-11-11 (Breaks are free gaps, phase 4: the scissors; three fixes from 3.34.0; PLAN_breaks_as_gaps)

**Desktop. No schema change, no migration, no data change: a cut writes exactly what Task or Break = Break writes. The phone is unchanged (P5).**
- **The scissors** (`lib/blade.ts`, `BladeLayer.tsx`): a square button with scissors in the Calendar header (Day and Week) and the Timebox header ("Scissors (C)"), and the key **C** when no card has the keyboard (D2: a focused card keeps C = complete). While on: the button is pressed, a quiet hint reads "Click the start of a break, then its end · Esc to stop", the pointer is a crosshair over the time columns, and blocks do not open, drag or resize (the wheel and the middle button still scroll). Hover: a line across the column with the time, snapped to 5 minutes.
- **Cutting:** click the start, move, click the end, or press, drag and release; either order; at least 5 minutes; kept in the column it started in and inside the task under the first click (the timed task not inside a break; on empty grid it is a one off break). **D3:** a cut that would leave a piece under the smallest piece setting is muted with the reason ("A piece would be 10 min (min 30)") and cannot be made. On a task that repeats, a small flat popover asks **This day only** or **All days of <task>** (All days has the keyboard; Enter picks it): All days makes one Break series from that day on the task's own repeat days. Each cut is ONE Break row in one gesture, so one Ctrl+Z removes it. Esc drops a cut in progress or the popover; Esc again turns the scissors off. They stay on after a cut.
- **Fixed from 3.34.0:** a task cut into pieces can be dragged by ANY piece (it was the last piece only, since Part B: every piece registered the same drag source); each moves the whole task. **Gaps move in 5 minute steps**, the same as their edges (they moved in the blocks' 30). Blocks in a gap take their lane for as long as they are drawn (the 10 px floor), so two 5 minute tasks in a row sit side by side instead of on top of each other. **The details' Task line on the desktop** now says a task inside a break "shows as a block in that break's gap" (`TASK_HINT_DESKTOP`); the phone keeps its chip wording until P5.
- **Tests changed on purpose:** new blade.test.ts; shortcuts.test.ts (the one allowed C pair, D2; the "C means nothing at home" case now uses O); drag.test.ts (5 minute moves); gaps.test.ts (lanes by drawn height); easConfig.test.ts (version); real checks **p27, p28, p42 rewritten for gaps** (blocks in gaps, the block menu by right click, the gap's edge, nested gaps; now quiet, with drags dispatched in the page), p48 (the desktop Task line), p50 (5 minute gap moves; D5 dragged by the first piece), new p51 (the scissors). `desktop/test/real/input.js` gains `drag` and `dragRelease` (page dispatched pointer events).

## 3.34.0 — 2026-11-10 (Breaks are free gaps, phases 2 and 3: gaps drawn and edited; PLAN_breaks_as_gaps)

**Desktop. No schema change, no migration, no data change: a Break is still a task row with `cutsBelow`, and which tasks a break cuts or holds is still worked out from the times. The phone is unchanged (phase P5).**
- **A Break draws as a gap** (`lib/gaps.ts`, `GapLayer.tsx`) on the Calendar's Day and Week views and in the Timebox: under the blocks, at its real times, the full column width, light 45 degree hatching and a 1 px dashed outline (new tokens `gapLine` and `gapHatch`, light and dark). No fill, no ☕, no text. Hover: "Short break · 20 min". A click opens the break's details. A break inside a longer break is a second outline inside the first; yesterday's overnight break is a gap at the top of today.
- **A task inside a break is an ordinary block** at its real time and length, full width (two that overlap share the gap in lanes, as anywhere), with a floor of 10 px instead of 20 so a 10 minute task does not stick out of its gap. Its tooltip says which break it is in. A right click on it opens Open, Move out of break, Remove time (they were on the chip). The details keep "Inside this break" and "Shows inside".
- **A cut that is refused** (a piece under the smallest piece setting, or the break covers the task): the task draws whole over the gap, the gap's outline is drawn above it, and the task's block carries the reason (its badge and tooltip; on the piece under that gap when other breaks did cut it).
- **Editing a gap:** a drag on its body moves it (30 minute steps, as a block; a repeating break moves that day only, as before); its top and bottom edges (a thin strip above the blocks, 6 px, 4 under 24 px) resize it in 5 minute steps, the top edge keeping its end. A resize that would take a task out of its break is refused, as before. One Ctrl+Z undoes each.
- **Breaks follow their task (D5):** when a task moves (a drag, the arrow keys on its block, a new time or day in its details), the breaks wholly inside its old span on that day move by the same amount in the same gesture, so one Ctrl+Z puts everything back. A drag is not refused by the breaks inside the task being dragged. Tasks inside those breaks do not move with them.
- **Removed:** the break chips and "+N" (`HostChip`, `ChipMeasure`, `MoreBadge`, `packChips`, `chipLines`, the 3.28.0 to 3.29.1 Day view packing), the break branches of `TimeBlock` (☕, `BREAK_TINT`, `hostCount`, the inline chip text), and the "N inside" pill on cards. `chipPlan` stays for the phone until P5.
- **Not changed:** the Task line in the details still says a task inside a break "shows as a chip in that break" (the phone shares the words and still draws chips; P5). A cut task takes a drag on its last piece only, as since Part B.
- **Tests changed on purpose:** hosting.test.ts (the packChips and chipLines cases removed), new gaps.test.ts (the Boot Camp example, the 10 px floor, a refused cut and where its note goes, nested and overnight gaps, `carryPlan`), easConfig.test.ts (version); real checks p49 (the 3.28.0 to 3.29.1 chip check rewritten as the Boot Camp gap check), new p50 (gap editing and D5), p14 (the break is a gap; a refused cut's reason is on the task), p47 (a block in the gap, not a chip), p48 (a Break on the Calendar is a gap). **p27, p28 and p42 still test the chips and were not updated** (pointer checks; see build-progress).

## 3.33.0 — 2026-11-09 (Breaks are free gaps, phase 1: counting; PLAN_breaks_as_gaps)

**Desktop and the shared totals code. No schema change, no migration, no data change: a Break is still a task row with `cutsBelow`. Nothing is drawn differently on the Calendar or the Timebox (phase 2).**
- **A Break counts nowhere.** It has no estimate (`estimateOf` is 0 for a Break; `lengthOf` is its raw length). It is left out of the Tasks board's day totals, the Calendar header total, Daily Planning's and Daily Shutdown's figures (and their "tasks" counts), Brain Dump and list "planned" text, and Analytics (`completedIn` skips breaks, so they are not finished tasks, nor in the time card, the per day bars or the per label shares). It is never in the Missed list.
- **A task cut by gaps counts only its pieces (D4).** `gapMinutes` (lib/hosting.ts) takes off the minutes the day's breaks cut away, by the drawing's own rules (lib/cuts.ts with the setting's smallest piece, D3; a cut that would leave a piece under it is refused and the task counts whole; a task wholly inside a break is not cut and counts in full). `totalsOf` and `timeCard` take the smallest piece in place of the old boolean; Analytics reads the day's breaks from all stored tasks, ticked or not.
- **The Timebox "Scheduled" total** counts work, not gaps (`scheduledSpans`): a Break's span is left out, a task inside a break counts at its real length. Boot Camp 9:30 for 7 h with breaks 11:00 (20 min), 12:30 (1 h) and 15:00 (20 min) is 5:20 on its own and 7:00 with 1:40 of tasks in the gaps, in the Tasks board and the Timebox alike.
- **"Count minutes done during a break twice" is gone** (Settings row, `breakTwiceStore.ts`, `hostedEstimate`, `hostedMinutes`, `parseBreakTwice`). A quiet note in its place says breaks are not counted. The old synced row `planner.break_count_twice` is left alone and is no longer read; older builds still read it. The iOS marker for the switch was retired.
- **Day columns (D1).** A Break with a time is no longer a card on the Tasks board. Each day column ends with one quiet line, "☕ 3 breaks · 1h 40m" (`BreakLine.tsx`, lib/breakLine.ts; a Break with no length reads as 30 minutes, as it is drawn), that opens a list of that day's breaks; each opens its details. A Break with no time keeps its card, and it (and every Break card, and the details window of a Break) has no tick box; C does nothing on its card. Breaks stay editable from their block.
- **Tests changed on purpose:** hosting.test.ts (the hostedMinutes / hostedEstimate / parseBreakTwice cases are replaced by gapMinutes and scheduledSpans), splitAudit.test.ts (two shared-minutes assertions removed), taskTotals.test.ts and analytics.test.ts (the 3.8.0 count twice cases replaced; new Boot Camp cases: Monday 7:00, Tuesday 5:20, a refused cut stays whole), easConfig.test.ts (version), new breakLine.test.ts; p27 (the count twice section is now the new totals, quiet line and no tick checks; new seed Break with no time), p48 (a Break with a time is no longer a card).
- **Not in this phase:** the phone still shows its own Break cards and chips (phone phase P5); no gap drawing, no scissors.

## 3.32.0 — 2026-11-08 (Mini Motorways restyle, phase 3: cards, blocks, details, popovers, pages)

**Desktop. No schema change, no migration, no data change, no behaviour change: colours, shapes and type only.**
- **Task cards** (`TaskCard.tsx`): 12 px corners (`radius.card`), a 2 px outline (the border colour, or for a labelled card `labelTint`: the label colour 20 % over the surface), padding 12 x 14. The label is a **6 px band across the top** (it was a 3 px left edge; no label, no band; the hover icons move down by the band). Checkbox 20 px with a 2.5 px text colour ring; done is the accent with a white tick, the title struck through in the secondary colour, and the card is no longer dimmed. Title 15/700. The length is **Inter ExtraBold 13 px** (it was Roboto Mono; Roboto Mono stays on the steps count and clocks). Meta lines 13 px; the day and time are bold in the text colour; the label name stays grey; the Break tag is a square 20 px tag, "3 inside" a 20 px pill. A card is 4 px taller (8 with a band); drag and drop measure the live boxes, so nothing else changed.
- **Calendar and Timebox blocks** (`TimeBlock.tsx`, `TimeboxPane.tsx`, `CalendarPane.tsx`): corners 8 px (were 4), title weight 700 (was 600); the colours, the block size tiers and their padding rules are unchanged; no band and no slab. Break chips keep their chips and "+N" logic; their title is bold. The current time is a **3 px line with a round 13 px dot** (it was a thin line with a triangle).
- **Task details window** (`TaskDetailPanel.tsx`): 640 px wide, 16 px corners, an 8 px accent band, a flat 10 px slab behind it on light (`--ds-slab-window-offset`, the border-strong colour; on dark the soft shadow stays). Title 30/800 beside a 26 px checkbox ring (3 px); the close button is a 44 px ink circle; short 80 px dividers under the title and between sections. Rows are at least 44 px with a 156 px label column (15/700, secondary colour) and values at 16/700; Notes is a raised field with 10 px corners; Task | Break is two square side by side buttons with icons; Save is a square primary button. **Every row and control stays** (date and extra times, Estimated time, Label with emoji, the Shown first switch with its marker, Repeats and its note, Task | Break and its help line, Reminder, List, Notes, Steps, Inside this break with Move out, the menu).
- **Popovers, menus, toasts, pages:** a popover's heading is 13/800; chips (the label, duration and repeat chips) are square and flat (`hostPill`, the chosen one the accent); the undo bar's button is square; Settings, Labels, Trash, Quests, Analytics, Account choice and Templates buttons and chips are flat and square, with section labels at 800. Page titles stay Newsreader as before.
- **Not done on purpose:** no slab on cards, lists or blocks; no band on blocks; Quick capture, Search, Shortcuts, Labels overlay and Daily Planning keep their window shape (their buttons and chips follow the rules above; a band on those windows was not added); the details' length control is still the drop-down and the switch still the switch; page title fonts are unchanged.
- **Tests changed on purpose:** p9 (cards 12 px, 2 px outline, 12 x 14; the label colour is the band; the details modal 640 px with a 30 px title; the estimate is Inter 800 not Roboto Mono), p10 (the label colour is the band), p11 (rows at most 44 px, modal under 840 px, the list emoji at most 13 px), p22 (checkbox 20 px, the duration is a square tag, a card 12 px with a 2 px outline, blocks 8 px, the now line 3 px), p23 (12 px is in the radius scale), p39 (Vibrant is told by its saturated fill, since a dark block's title is bold too), `easConfig.test.ts` (version).

## 3.31.0 — 2026-11-08 (Mini Motorways restyle, phase 2: the desktop shell)

**Desktop (the web export) and the iPhone font list. No schema change, no migration, no data change, no behaviour change: colours, shapes and type only.**
- **Inter ExtraBold (800) is registered** on the desktop (`desktopFonts.ts`, which also declares it under "Segoe UI") and on the phone (`phoneFonts.ts` for the web export, `phoneFonts.native.ts` as `Inter-800`, `type.ts` weight 800). The card's done tick (✓ at weight 800) now draws in the real ExtraBold.
- **Panes** (Brain Dump, the centre, Timebox): an 8 px accent band across the top (`PaneBand`, follows the 16 px corner, no clipping), and on the light theme a flat 7 px slab behind them in the border colour (`paneSlab`: a zero blur box shadow reading `--ds-slab-offset`, which `themeStore` sets from `slabOffset`: 7 px light, 0 dark). No page grid. Widths and gaps are unchanged.
- **Titles:** Timebox 26/800/-0.5; the list's name at the top of Brain Dump 24/800 (it is the list switcher; 26 does not fit "Brain Dump" in the 248 px pane); the Tasks board's month and the Calendar's range 30/800/-0.6; a day's weekday 22/800 with the date at 500, centred, with the day's menu at the right edge. Short centred 4 px dividers (60 to 70 px) under the day heading and the Timebox total, and above "Done today"; the hairline above "Done today" is gone. Hour lines and day separators stay.
- **Buttons** (`ui.tsx`, so every button that used them): square (`radius.square`), the secondary is the soft green `hostPill` with `onHostPill` text, 16/700; the chosen one of a toggle (Filter with labels on, Only today on, Tasks or Calendar, Day, Week or Month) is the accent with `onAccent`. The Tasks/Calendar and Day/Week/Month toggles are two or three square buttons side by side with no track. Small pills are square. A popover's own buttons take a 14 px size (`compactBtnText`). The avatar is a 44 px ink circle (text colour) with its icon or initial in the page colour; the edge buttons and arrows are square.
- **Brain Dump:** the input is 46 px with a 2 px text colour outline and square corners; its rows (cards with no label) are quiet raised rows (`surfaceRaised`, 10 px corners); a count line under the title, "**N** task(s), no day yet" (only for Brain Dump, not at 0); the planned total caption is 13 px.
- **Day columns:** the "Add a task" row is 2 px dashed in `borderStrong`; the day's total is a bold figure in the text colour, not a pill; the Today and Away tags are square (Today is the accent). The Timebox's "Scheduled" total shows its figure in bold.
- **Found by the real checks and fixed:** the wider list title pushed the Earlier pill out of the pane (the header row now wraps); a wider left pane padding put the centre of a Brain Dump card under its hover icons, so a click opened the label menu (the padding is back to 12 px).
- **Tests changed on purpose:** `p22` (four checks: Only today is a flat square button, the Calendar/Tasks toggle is two square buttons, the day heading is 800 with a square Today tag, Add a task is a 2 px dashed row) and `p34` (the planned caption is 13 px, was 12). `easConfig.test.ts` version 3.31.0.

## 3.30.0 — 2026-11-08 (Mini Motorways restyle, phase 1: the tokens; nothing on screen changes)

**Desktop and phone (shared `lib/tokens.ts`). No schema change, no migration, no data change, no visible change.**
- The plan: `docs/design/motorways/BUILD_PLAN.md` (phase 0), from `SPEC.md`, the six mockups and `BUILD_PROMPT.md`.
- **New tokens** in `mobile/lib/tokens.ts`, for light and dark: `radius.square` (0: buttons, tags, chips, segmented toggles; one line to change to 4) and `radius.card` (12); `borderWidth` (hair 1, thick 2, heavy 3); `band` (pane 8, card 6); `divider` (4 px tall, 60 to 80 wide); `focusRing` (2 px, 2 px offset, the text colour); `fontWeight` (400 to 800, `heavy` 800); `slab.offset` (7) with `slabOffset(kind, theme, phone)`: 7 px behind a desktop pane, 10 px behind the details window, 0 in dark, on the phone, or when the offset is set to 0.
- **`labelTint(color, surface, amount = 0.2)`**: a label colour mixed about 20 % over the surface (the card outline of the restyle). Any `#RRGGBB` (the 20 palette colours, the 12 legacy ones, a colour wheel pick, a Vibrant colour), on the light or the dark surface; anything else gives the surface back.
- **`onAccent`** already existed (light `#FFFFFF`, dark `#121212`, 8.1:1 on the dark accent); its move to `#101010` is left to the dark pass (phase 5) so this phase stays pixel identical.
- **Inter ExtraBold (800)** added to `mobile/assets/fonts` (`Inter-800.woff2` for the desktop, `Inter-800.ttf` for the iPhone): `@fontsource/inter` 5.1.0, latin, Inter 4.001, the same package, version and subset as the bundled 400 to 700 (their files match it byte for byte), SIL OFL 1.1 (`Inter-OFL.txt`). **Not registered yet** (phase 2): the card's done tick already asks for weight 800, so loading the real face now would change it.
- `design-tokens/` regenerated with `mobile/scripts/export-tokens.mjs`, which now also writes the weights, line widths, bands, dividers, focus ring and slab offset (json, CSS variables, Tailwind `fontWeight` and `borderWidth`). Only additions; existing entries unchanged.
- **New recorder** `desktop/test/real/motorways-shots.js`: the same 18 screenshots on every run (desktop week board, Day view with a break, task details, Settings, the Filter popover; phone Today, Calendar, Tasks, details; light and dark), the page clock fixed at Mon 9 Nov 2026 10:20. The 3.30.0 shots are pixel identical to the 3.29.1 baseline (18 of 18).
- **Tests:** `tokens.test.ts` +4 (`labelTint` over every palette, legacy, wheel and Vibrant colour on both surfaces; the slab; the shape tokens and the focus ring's contrast; the Inter 800 files). `easConfig.test.ts` version 3.30.0.

## 3.29.1 — 2026-11-02 (Day view break chips: packed from their own widths, the "⋯" only on hover)

**Desktop, the Calendar's Day view. No schema change, no migration, no data change.**
- **Reported (Jethro, 2 Nov):** the repeating 20 minute "Short break" at 11:00 with an extra time at 15:00; "Apply to 1 application" (10m) and "Put laundry in washing machine" (5m) inside the 11:00 one, "Eat banana and do running pre warm up exercises" (10m) inside the 15:00 one, in a Day column of about 1000 px. Seen: the banana chip "cut off with an ellipsis and 10m ...", and the 11:00 chips not visible.
- **Reproduced** in the real app at window widths 1440, 1100 and 800, light and dark, Vibrant colours on, at 100%, 125% and 150% display scaling, with data shaped exactly like Jethro's (the break's stored day, a Must do with a label; the hosted tasks starting at the break's own minute, two of them Breaks themselves; the 7 hour repeating task the breaks cut, the Long Break) and once more on a scratch copy of his own local data (not committed). **On 3.29.0 every chip was drawn whole:** the banana chip's title measured 241 px of 241 px in a 917 px line; both 11:00 chips sat side by side. The causes, one by one:
  - **"Cut off with an ellipsis and 10m ..."**: the chip's menu button "⋯" sits right after the length, so a whole chip read "…exercises 10m ⋯", a title cut short. Nothing was cut.
  - **The 11:00 chips "not visible in a normal view"**: the Calendar opens scrolled to the current time (about 20:40 then), so the 11:00 break was above the visible hours; scrolled to it, both chips are there. Nothing hid or covered them.
  - **No wrong container or width cap**: the title keeps at most half of a one line break (it took 88 px) and a chip at most its line; neither binds at these widths. An **extra time**, a **projected** or **stored** day and a **20 minute (19 px) break** take the same path as p49's synthetic breaks (one line, `flow-inline`).
  - **What was weak, found on the way:** the fit was measured from the drawn chips and could only ever go DOWN for a given size (a measure taken while a pane was folded or before the fonts loaded could leave chips in "+N" until the size changed); and a chip wider than its whole line took the full line, with no room kept for "+N".
- **Now:** each chip's own width is read from a hidden row of unconstrained copies, and `lib/hosting.ts` `packChips` places them in order: a chip goes on the line if it fits whole, else on the next line; when no line is left it and the rest are "+N". Only a chip wider than a whole line is shortened (its title takes the ellipsis), to the room it has, never under 72 px; a one line break keeps room for the "+N" badge. Worked out again on every draw and whenever those widths change (fonts), and nothing is decided while the block is hidden. In Day view the **"⋯" of a chip shows only on hover or keyboard focus** (its room stays, so nothing moves; a right click opens the same menu). The week view, the Timebox and the phone are unchanged.
- **Tests:** `hosting.test.ts`: `chipsThatFit` (3.28.0) replaced by three `packChips` tests (the 2 Nov breaks at 1000 px and narrow, the very long title, 1, 2, 3 and 5 chips over one to three lines, narrower never more). Real **p49** rewritten on the real shaped data (today's stored break with its 11:00 and 15:00 times, tomorrow's projected one with a very long title and with five tasks; widths 1440, 1100, 900, 760; light and dark; 128 checks: shown + N, order, narrower never more, no overlap, the break title whole, no chip cut while it would fit whole, "+N" only when the next chip does not fit the room left, the "⋯" hidden until hover and shown on hover, the week view as before). On the 3.29.0 build the new p49 gave 100/128: the "⋯" checks, and the long title and five task checks that read the new measuring row.

## 3.29.0 — 2026-11-02 (one title, label, list, notes, priority, steps and reminders for every day of a repeating task)

**Desktop and phone (shared `lib/`). No schema change, no migration; the fix writes only when a field is edited.**
- **The bug (Jethro):** a repeating task (Mon Wed Fri) renamed from "Apply to 1 application" to "Apply to 15 application"; today's day, which had been moved into the Short break and shortened to 10 minutes, still showed the OLD title on its Calendar block and as the chip in the break, while the details panel showed the new title.
- **Reproduced** (real check p47 on the build before the fix: 6 of 9, the three title checks failed) and **the cause:** a repeating task's days that have been touched are stored as rows of their own (`apply:2026-11-02`), and an edit was written to ONE row, depending on where it was made. From the details (or card) of a **stored** day, `opsForTask().patch` sent a title change to `patchTask(that row)` only, so every other stored day kept its own copy of the old title. Today's day was stored (the move into the break stored it), and as the latest stored day it was also the series' **template**, so the days not stored yet (drawn from the template) kept the old title too. The details showed the new title because they show the row that was edited. From a day **not stored yet**, `patchSeries` reached the template and the open stored days from today on only (`seriesEditTargets`), so an open day stored before today kept the old title the same way.
- **The rule now:** editing the **title, label, list, notes, priority, steps or reminders** of a repeating task applies to **all** its days: the template and every stored day (open, moved, shortened, before or after today), **except a past day that is already done** (it stays as it was done) and tombstones (skipped days). The day the edit is made on always takes it. Only the **date, time and length** can differ per day. Steps: each day keeps the ticks of the steps it still has (matched by title); the day edited takes the list as edited. Ticking a step is not an edit of the steps and stays on its day.
- **How:** `lib/seriesWide.ts` (new, pure: `SERIES_WIDE_FIELDS`, `wideTargets`, `widePatches`, `mergePatches`); `seriesActions.patchSeries` writes the shared fields with `widePatches` and the rest as before; new `seriesActions.patchRepeatingDay` for a stored day (the shared fields to every day, anything else to this day only); `taskOps.opsForTask` uses it when a repeating day's edit names a shared field. Every write goes through `storage.updateTask`, so it is queued for sync like any edit and recorded for **undo** (the writes of one edit are one undo step); **Moved from** captions are read from the id and the Day, which are not touched.
- **Stored fields that can still differ per day:** `dueDate`, `startTime`, `durationMinutes`, `extraTimes` (the date, time and length, by design); `completed`, `completedAt`, `timesDone` and each step's `done` (what was done that day); `cutsBelow` (Task or Break: a series edit reaches the template and the open days from today on, as before, and one day can be set alone); `emoji` (never copied to a day not stored yet, as before; not in the list asked for); `recurrence`, `recurrenceDays`, `recurrenceMonthDay` (a change of the rule reaches the template and the open days from today on, as before; "Does not repeat" ends every row); `actualMinutes`, `timerStartedAt` (not shown since 3.26.0); `origin`, `createdAt`, `updatedAt`, `deletedAt`; and **everything on a past day that is done**.
- **Tests:** `seriesWide.test.ts` (new, 8): the shared fields; a **rename** from a stored day reaches today (moved into a break, shortened), a day moved to another date and an open past day, not the done past days or a tombstone, keeps each day's time, length and Moved from caption, and the next week's days not stored yet show it; the same rename from a day not stored yet; a **label change, a list change, a notes change** (and clearing the label) on the same series; steps keep each day's ticks; a done past day only when it is the day edited; nothing written when nothing changes. Real **p47** (new, 9: renamed from yesterday's stored day, today's chip in the Short break, today's row and the next day show the new title, the done day keeps the old one, today keeps 15:05 and 10 minutes, Ctrl+Z puts every day back in one step).

## 3.28.0 — 2026-11-02 (Day view: a break shows as many hosted chips as fit, "+N" only for the rest)

**Desktop, the Calendar's Day view. No schema change, no migration, no data change.**
- **Before:** a break that hosts tasks drew one chip beside its title (a short break) or one chip per row (a taller one), the same in every view, so a 20 minute break in a 1000 px wide Day view showed one chip and "+4".
- **Now, in Day view:** the chips sit side by side, each with its title and length: a short break puts them on its one line after the title; a taller break wraps them over the lines it has under its title. "+N" (on the title row, its tooltip listing everything) counts only the chips that do not fit. A narrower window or column shows fewer chips and a larger "+N". The title keeps up to half of a one line break; a single chip wider than the line shortens its own title with an ellipsis. **Nothing overlaps:** the chips are drawn, measured and trimmed until every one shown is wholly inside its line (`lib/hosting.ts` `chipsThatFit`, `chipLines`; measured again when the size, the tasks or their titles change).
- **Unchanged:** the week view and the Timebox (a narrow column) keep the old layout (`chipPlan`); the phone keeps its badge; ticking, opening, the ⋯ menu and dragging a chip are the same.
- **Tests:** `hosting.test.ts` +2 (1, 2, 3 and 5 chips at 600, 320, 210 and 120 px on one line and two; narrower never shows more; a chip that sticks out stops the count; `chipLines`). Real **p49** (new, 161 checks, light and dark: 1, 2, 3 and 5 hosted tasks in a 60 and a 20 minute break at window widths 1440, 1100, 900 and 760: shown plus "+N" equals the tasks in order, a narrower block never shows more, nothing overlaps or sticks out, every chip has a title and a length, the week view keeps "stack"). **p27** changed on purpose: its Calendar part is in Day view, where every chip now fits (no "+N").

## 3.27.0 — 2026-11-02 (Task or Break: the Split switch becomes a two option control; Split is called Break everywhere)

**Desktop and phone. No schema change, no migration, no data change: the stored value is still `cutsBelow` (Break = true, Task = unset); internal names stay.**
- **The details** (desktop modal and the phone sheet): the Split on/off switch is replaced by **Task | Break**, two options with an icon each (a check circle for Task, a coffee cup for Break) and one plain line under them. Task: "A normal task. If you place it inside a break it shows as a chip in that break." Break: "Cuts the tasks it overlaps into pieces and can hold other tasks inside it." On the desktop the row is called **Type** (tooltip and accessible name "Task or Break"); on the phone it is its own section, "Task or Break", with two 44 pt options. The phone had no Split switch before; it has the control now.
- **A Break shows it:** a small **"☕ Break"** tag on its card (meta line 2) and a **☕ before its title** on its Calendar and Timebox block (week and day; its accessible name says "Break").
- **A Task placed over a Break:** its details say **"Shows inside Lunch"** (the "During: Lunch" caption, renamed; desktop and phone; Move out is unchanged). A Task over another Task shows nothing new. The card's "During Lunch" caption is unchanged.
- **Every user visible text changed (Split to Break):**
  1. details row "Split" (switch, tooltip "Split") → row "Type", "Task or Break", Task | Break;
  2. "Splits the tasks it overlaps, so you still see them before and after it." → the Task line or the Break line above;
  3. "Its Split is ignored while it is during Lunch." → "Its Break is ignored while it is inside Lunch.";
  4. the chip's tooltip "· Its Split is ignored while it is inside" → "· Its Break is ignored while it is inside", and its accessible name ", its Split is ignored" → ", its Break is ignored";
  5. Settings "Smallest piece when a break splits a task" (label and accessible name) → **"Minimum piece size when a Break cuts a task"**;
  6. Settings note 'A task with "Split" on (for example a break) splits the tasks it overlaps into pieces. ... the break says why.' → "A Break cuts the tasks it overlaps into pieces. ... the Break says why.";
  7. the block note "Not splitting Boot camp: a piece would be ..." → "Not cutting Boot camp: ..." and the badge "Not split: 20 min piece (min 30)" → "Not cut: 20 min piece (min 30)";
  8. "No breaks today. A break is a task with Split on." → "No breaks today. A break is a task set to Break in its details.";
  9. details "During: Lunch" → "Shows inside Lunch" (desktop and phone).
- **How:** `lib/taskKind.ts` (new: the words, `kindOf`, `kindPatch`), `TaskDetailPanel.tsx` (`KindChoice`), phone `TaskDetails.tsx`, `TaskCard.tsx`, `TimeBlock.tsx`, `HostDetails.tsx`, `HostChips.tsx`, `SettingsPage.tsx`, `TaskPopovers.tsx`, `lib/cuts.ts`.
- **Tests:** `taskKind.test.ts` (new, 2), `cuts.test.ts` (the notes' new words, changed on purpose). Real: **p48** (new, light and dark: Task | Break with icons and lines, Break stores only cutsBelow, the card tag and the block cup, Task clears it, "Shows inside Lunch", nothing new for a Task over a Task, no "Split" in the details, the board or Settings); **phone-p14** (+4: the phone control, 44 pt, Break and Task stored); changed on purpose: **p11** (the row is "Task or Break", up to 72 px with its control and line), **p14** (Task | Break instead of the switch; "Not cut"; the Settings label), **p16** (the row, the option, the tooltip; "no Split" instead of "no cut", since Jethro's Break line says "Cuts"), **p28** ("Shows inside Lunch"; Task instead of the switch), **p31**, **p42** ("Its Break is ignored while it is inside Lunch."), **phone-p14** ("Shows inside Tea").

## 3.26.0 — 2026-11-02 (Actual time and the timer removed from the interface; nothing stored is deleted)

**Desktop (the phone never showed actual time). No schema change, no migration, no new backup, no data change.**
- **Every place that showed actual time or the timer, and what happened to it:**
  - Details modal: the **Actual time** row (its drop-down, "(Start timer)", "■ Stop timer", the running "0:25 / 1:00" figure and the "(Start from 9:00am)" links) is **removed**. Ctrl+E still opens the estimate.
  - Card ⋮ menu: **Start the timer / Stop the timer** and the **Start from** rows are **removed**; "Start a pomodoro" stays (behind its switch).
  - Shortcuts: **Ctrl+B** (actual time) and **Ctrl+Shift+Enter** (timer) are **removed** from the registry and the help overlay.
  - The **floating timer** (bottom right): **no longer shows a task timer** (no run clock, no actual / estimated). It shows only a **pomodoro** when one runs (task, focus or break countdown, Break / Keep going, and a stop button that ends it).
  - Cards and blocks: they carried no timer mark since 2.27.0; nothing to remove (checked).
  - The **day column totals** and the **Calendar header total**: "0:25 / 1:30" (actual / estimated) became the **estimate alone** ("1:30", named "Estimated for the day" / "Estimated"); the over-estimate tint is gone.
  - **Daily Planning** step 1 and **Shutdown** step 1: the "Time spent" figure and the time spent per label are **removed**; each row's "0:25 / 1:00" became the estimate.
  - **Analytics:** the "Actual against estimated" card became **"Estimated"** (the estimated time of the tasks finished in the range); "Time per day" with its "By time" switch became **"Tasks per day"** (count only); the **"Estimated against actual" chart is removed**; the completed list and its group headers show the estimate only.
  - Wording: the Settings hint about breaks no longer says "one timer runs at a time"; the Pomodoro hint says "on a task".
  - The unused `ActualBody` popover and `toggleTimer` / `stopOneTimer` / `StartFromRows` helpers are deleted.
- **Kept as they are, on purpose:** the stored `actualMinutes` and `timerStartedAt`, their sync mapping and columns (an older client still reads, shows and writes them; a newer one passes them through untouched), the data export, the Analytics **CSV's "Actual (minutes)" column** (so recorded time can still be taken out), `lib/taskTimer.ts`, `timerSession.ts`, `timerActions.ts` (the pomodoro runs on them).
- **Pomodoro:** ending it from the widget, or switching Pomodoro off, now **also stops its task timer** the ordinary way (whole minutes added to the stored field; a run over a day still asks). Before, the timer carried on, but nothing would show it any more.
- **Tests changed on purpose:** `taskTotals.test.ts` (the text is the estimate alone; the "over the estimate" test went with `isOverEstimate`), `shortcuts.test.ts` (Ctrl+Shift+Enter is no shortcut). Real checks: **p2** (a stored running timer shows nothing and stays stored; the help lists no timer key; Ctrl+Shift+Enter and Ctrl+B do nothing; the day total is "1:00"), **p5** (Ctrl+I's details have no Actual time), **p6** (the Estimated card, Tasks per day, no By time, no time spent, the list shows the estimate), **p7** (the widget is the pomodoro's, the ⋮ menu has no timer rows, a pomodoro on another task stops the first, switching it off stops the timer), **p9** and **p11** (row order without Actual time; p11's actual drop-down block replaced by "no timer"), **p18** (rewritten: it tested the timer of 2.34.1; now no timer anywhere and nothing stored), **p19**, **p20**, **p27** (the total's new name and value), **cp8f** (no timer button).

## 3.25.0 — 2026-10-31 (Missed: one off tasks only, Skip all and Done, and a "Show missed tasks" switch, off by default)

**Desktop only. No schema change, no migration, no new backup.**
- **Repeating days are never listed as missed.** The Missed panel and the Daily Planning step list only **one off tasks** (a Day before today, not done, not part of a repeating series). The past days of a repeating task (the six Gym days of the old list) are not listed, nothing is written for them (no skip tombstones, no copies) and nothing nags. **Streaks are unchanged:** a past day not done still ends a run quietly, as decision 007 and the Known limits say; they are not made "skipped" for the streak (that would have changed what a streak means; it is one line to change if wanted). `missedItems` lost its occurrence branch; `doTodayCopy`, `skipMissed` and `doMissedToday` are gone.
- **Skip all and Done.** At the top of the Missed list (and in the planning step) **Skip all (N)** sits next to **Move all to today (N)**; each row has a **Done** button. Both mark the task **done on its own day**: its Day and time stay, the completion is recorded at noon of that day (so history, analytics and "finished yesterday" count it there, not on today), the steps tick like any completion, **nothing is deleted**. An **Undo for 8 seconds** (the usual bar in the panel; a note in the flow), **no confirmation**. The Undo puts each task back exactly as it was (steps too), and never overwrites a task changed since. In Daily Planning they are draft edits written on Finish (Cancel writes nothing); `setTaskCompleted` and `completeTaskById` take an optional completion time.
- **Settings, "Show missed tasks" (Power features), off for everyone by default** (the synced row `feature.missed`; a saved `on` or `off` is kept as it is). Off: the **Earlier pill**, the **Missed panel** and the planning **"Here's what you missed"** step are hidden, and **Finish in Daily Planning no longer brings earlier tasks onto today** (`finishWrites(..., rollMissed)`); old one off tasks just stay on their own day (timed ones already fade there). Shutdown's "What you missed" (today's leftovers) is a different list and stays.
- **Tests (changed on purpose where the old behaviour was removed):** `missed.test.ts` (repeating days never listed, nothing written, own-day completion across clock changes), `features.test.ts` (default off, a saved value kept), `planningDraft.test.ts` (rollMissed off); real **`p46.js`** (29, light and dark: off by default, the switch, the pill, no Gym day, Skip all next to Move all, Done, Undo of one and of all, the Undo goes after 8 seconds, own-day completion, Planning draft and Finish); `p10.js` (section 6) and `p5.js` start from a person who turned the switch on and no longer expect repeating days in the list.

## 3.24.0 — 2026-10-31 (middle mouse drag pans the Calendar and the Timebox)

**Desktop only. No schema change, no migration.**
- **Hold the wheel button and drag** over the Calendar or the Timebox (a block, a column, an empty slot) to pan like a hand: the content follows the pointer. In the Calendar's week strip a sideways drag moves through the days (the strip is very long, so it keeps going), a vertical drag scrolls the hours; the Timebox scrolls its hours. Day view only scrolls vertically.
- **A grabbing cursor** shows everywhere while it pans. **No task drag starts, no task opens** (the press never reaches the cards; the left button's drag is untouched), and **no Windows autoscroll circle** appears (the middle mousedown is cancelled; only the pointer event is stopped, since cancelling it would also cancel the mouse events). **Esc** puts the view back where it was and ends the pan. A press on a field, a popover or the details modal does nothing; releasing outside the window stops where it is.
- **How:** `lib/panDrag.ts` (pure: `panPosition`, `startsPan`, `middleHeld`) and `components/desktop/MiddlePan.tsx`, mounted once at the home root with window capture listeners.
- **Tests:** `panDrag.test.ts` (6); real `p45.js` (19, synthetic middle button events: the press is cancelled, both directions, clamping, the cursor, nothing changed or opened, Esc restores, the left press untouched, a press outside does nothing, the Timebox).
- **iOS marker gate:** three markers added (`open a new task card`, `Save the new task`, `belific-pan-cursor`) and two removed on purpose (`Add the task and open its details` and `Type a name first, then open the details.`, whose strings went with the details pen in 3.23.0).

## 3.23.2 — 2026-10-31 (fix: Vibrant task colours no longer merge labels)

**Desktop (`lib/vibrant.ts`, pure). No schema change, no migration.**
- **Problem:** with Vibrant task colours on, the grey Work label drew as the same blue as Study. Every colour was lifted to the same 0.85 saturation, so a grey with a faint blue tint (Slate, Charcoal) became a vivid blue, a warm grey (Stone) an orange-brown, and a muted Sage the same green as the vivid Green.
- **Fix:** (1) a **neutral** (saturation below 0.11: the greys, blacks, Slate, Charcoal, Stone, any grey the wheel makes) never takes a hue of its own: it becomes a quiet slate, charcoal or warm grey, as dark as white text at 6:1 needs (a darker original ends darker, so Slate, Charcoal and Stone stay three colours; a true grey stays grey). (2) A coloured label is lifted **in proportion** to how saturated it was (0.40 for a muted colour to 0.95 for a vivid one), not to one level, and a darker original ends a little darker, so Sage is not Green, Plum is not Magenta, Sky is not Cyan. The hue is kept; white text keeps 6:1 or better on every colour (wheel and custom colours too).
- **What is the same:** the vibrant colour does not depend on the theme (white text on it in Light and in Dark); the setting, its default and the break slate are unchanged.
- **Tests:** `vibrant.test.ts` +5 (they failed 5 of 5 against the old rule): neutrals stay quiet greys; a grey Work is far from a blue Study; every neutral is far from every coloured label; **every pair of the 20 palette colours is at least 7 apart (CIE76, closest 7.1) and every pair of all 33 (with the 12 older colours and the break slate) at least 4 (closest 4.7)**; left edges stay distinct; 6:1 holds for all. Real `p44.js` (8: five real blocks in light and dark, computed colours read back); `p16.js` and `p17.js` still pass.

## 3.23.1 — 2026-10-31 (fix: the card's meta line keeps the label name, on two lines)

**Desktop and phone. No schema change, no migration.**
- **Problem:** on a left pane card the meta line showed only a dot, the emoji and "..." instead of the label name, with the date and time crammed beside it (one row, the label chip capped at 150 px and shrunk by its neighbours).
- **Fix:** the meta line is two lines (`TaskCard.tsx`). **Line 1:** the list emoji, the label dot and the label name (no width cap; an ellipsis only when the name truly cannot fit the card). **Line 2:** the day and time, the "N inside" and "During" captions, "Moved from", the steps ring and the Must do mark, wrapping if needed, never clipped. The same on the phone's Tasks rows (the label on its own line, then the date and time) and Today rows (the list and label first, then the time, steps and captions).
- **Tests:** real `p43.js` (30: windows 1024, 1440 and 1920 wide, light and dark, a normal and a very long label name; nothing cut, nothing spilling out of the card) and `phone-p17.js` (+4).

## 3.23.0 — 2026-10-31 (the + of an Add row opens a new task card)

**Desktop and phone. No schema change, no migration.**
- **The + opens a new task card.** In the left pane's Add row and in a day column's Add row, the + opens the same task details modal as an existing task, with empty fields and the title focused (a Save button instead of the tick and the ⋮ menu; no Actual time row yet). **Nothing is stored until the card has a title:** leaving the title (Enter, a click elsewhere, Escape) or pressing Save stores it, under the card's own id, and the open card carries on as an ordinary task; closing with no title creates nothing, and Save with no title only asks for one. The card starts in the place it was asked for (the shown list, or that day) and keeps the label, time and estimate already chosen in the box. With a title already typed in the field, the + adds that task and opens its details (what the pen did). **Enter in the Add field still quick adds.**
- **Removed:** the extra details pen in the Add row and its hint "Type a name first, then open the details." (`lib/addBox.ts` no longer has a `details` slot or `NEEDS_TITLE`). The row stays clean at narrow and wide widths (the label button, then the total, then the pickers go first; the field never loses its placeholder).
- **Phone (Tasks tab):** the add row's button is now a + (44 pt). With nothing typed it opens the task details sheet as a new card ("New task", Save at the top, no Delete, the title focused); with a title typed it adds that task as before. The round + (quick add sheet) is unchanged.
- **How:** `uiStore.openNewTask(where)` gives the details modal a draft id (`draft_...`); `TaskDetailPanel` keeps the draft in memory and stores it on the first title (`patchDraft`); the phone's `DetailsTarget.draft`. Tests: `addBox.test.ts` (changed on purpose: no details slot); real `p34.js` (50, changed on purpose and extended: the + card, nothing stored empty, Save, Enter, a day column, light and dark) and new `phone-p17.js` (16).

## 3.22.0 — 2026-10-30 (drop a Split task inside another Split task, and the Split audit)

**Desktop (the pure rules also serve the phone). No schema change, no migration.**
- **Drop inside (new gesture):** a Split task dragged over another Split task's block (Timebox or Calendar) and held there for about a second outlines that block with the label **"Drop inside"** (and the lifted card says "Drop inside Lunch, 12:00 to 12:30"); the drop hosts it there: it starts where it fits, or at the break's start (`hostStart`, as for any task). A task **longer than the break** shows "Longer than the break (1 h 30 min)" and the break is **not** highlighted; one exactly as long shows "As long as the break (1 h)" (the two would swap roles). Neither is refused: it is placed as usual. Moving to another target or off the break **cancels the pause**; before the pause, behaviour is as it was (placed at the slot, side by side, Split cut). Any other (non Split) task dropped on a break is hosted at once, as since 3.6.0.
- **A Split task can be hosted (`lib/hosting.ts`):** a Split task that a longer Split task holds whole is hosted by it like any task: a chip, its own Split **ignored** (it never cuts its host or anything else), the tasks inside it belong to the outer break. Decided from the longest down (`HostResult.breakIds` are the entries that are breaks now), equal spans: the first by start and id stays the break, never a swap loop. A hosted Split task may not stick out of its break (3.11.0's rule b), but a Split task may still start inside another break without fitting (side by side, as before). "Do during a break" is offered to Split tasks too (only breaks longer than the task). The chip and the details say so: "Its Split is ignored while it is during Lunch."
- **Split audit, problems found and fixed:** (1) **a false "moved out of the break" notice**: when a break changed so a task inside two breaks was hosted by the other one, `lostGuests` counted it as lost; now only a task that is no longer hosted at all counts. (2) A hosted Split task, its guests and the break lists of the Timebox, the Calendar, the phone drop, `Do during a break` and the refusal checks all read "Split on" as "is a break"; they now read `breakIds` (a hosted Split task is not a break). (3) Nothing else wrong was found by a 4000 day seeded random check of the cut and hosting invariants (pieces inside their task, never overlapping, never under the minimum, never touching an accepted break; hosted inside their break; order independent) and the cases: a task partly over two breaks, three tasks over one break, breaks overlapping each other, a break touching exactly at an edge, short and zero length pieces, extra times, repeating days, midnight, and a host moved, resized, ticked, deleted or with Split off.
- **Tests:** `splitAudit.test.ts` (new, 14), `hosting.test.ts` (one test changed on purpose: "a break is never hosted" is now "a break inside a longer break is hosted by it"; +4 for the pause, the refusal rules, strict fit, `breakEntries`); real checks `p42.js` (23: the pause, the outline in the Timebox and the Calendar, no pause no outline, longer, cancelled, the chip, the details, light and dark).

## 3.21.0 — 2026-10-30 (undo and redo of task changes (Ctrl+Z, Ctrl+Y))

**Desktop. No schema change, no migration, no new backup.**
- **Keys:** Ctrl+Z undoes, Ctrl+Y or Ctrl+Shift+Z redoes (on the home screen; Cmd on a Mac). A text field that has the keyboard keeps Ctrl+Z for its own typing (the registry never fires while typing, and not while a popover or an overlay is open). Both are in the shortcut help.
- **What is undone (`lib/undoStack.ts`, pure, `undoActions.ts`):** every task write (create, edit, move, resize, nudge, time or date edit, tick, one time of several ticked, skip, delete, move out of a break, Do during a break, a repeating day stored by a move) is recorded as the row before and after. The writes of one gesture (a press or key) are ONE entry: a drag that stores a day and the carrier day, a tick that creates the next day. A bounded in memory stack of **50** entries, per session; a new change clears the redo history; signing out or clearing data clears the stack. The phone does not record (its Undo toasts are unchanged).
- **Undo and redo are normal edits:** the inverse is written through the storage layer in the storage lock (a newer `updatedAt`, queued in the sync outbox like any edit). A row that changed since (another device, an edit not in the stack) is **never overwritten**: it is skipped, and an entry with nothing left to do is dropped with a message.
- **Deleted data comes back by the tombstone rules:** a tombstone is never cleared, so undoing a delete (or a skip, or redoing a create) writes a live copy under the Trash's restored id (`restored_<id>`, no repeat rule, no timer, as Restore does) and touches the old tombstone. Skipping the first row of a series stores that day as `root:day` with the rule, so the series goes on. A day of a repeating task that a move or a time edit stored goes back to what the series shows there.
- **Toast:** "Undone: moved Zone 2" with a **Redo** button, then "Redone: moved Zone 2" with **Undo** (`uiStore` offers carry an optional button word; the bar clears only its own offer).
- **Tests:** `undoStack.test.ts` (new, 18: move, resize, nudge, time and date edit, tick, one time of several, extra times, delete, create, skip of a stored, a projected and the first day, a repeating day moved and a time edit with its carrier, the first row moved, a row that changed since, grouping, the 50 limit, sync: queued, newer updatedAt, wins the merge, the tombstone does not take the copy down); `shortcuts.test.ts` changed on purpose (Ctrl+Z and Ctrl+Y were reserved for the editor; now the home screen takes them only when no field has the keyboard) and +1; real check `p41.js` (33).

## 3.20.0 — 2026-10-30 (no repeat popup: a drag changes that day, the first time goes to every repeat day)

**Desktop and phone. No schema change, no migration.**
- **Removed everywhere:** the "Change the time of a repeating task / This day only / All days" popup (desktop popover and phone sheet; `scopeAsk.ts`, `ScopePrompt.tsx`, `ScopeSheet.tsx` are gone) and the old "changes apply to every day from today ... a new time or length asks" wording.
- **New rules (`lib/seriesTime.ts`, pure, tested):** dragging, dropping, resizing or nudging one occurrence changes **that day only**, silently. The **first time** of a repeating task that has none (details panel, a drop from the left list, a drop on a timeless chip) is applied to **every repeat day**: Zone 2 on Mon and Thu dropped on Monday 16:30 now shows 16:30 on Thursday too (before, Thursday stayed an untimed all day chip). A **later** time or length from the details goes to every repeat day that was not changed on its own; a **moved day** or a stored day whose time differs from the series keeps its own time (read from the existing rows, no new column). An edit made on a day that has its own time changes that day only.
- **Details:** a quiet line under the Time row of a repeating task: "Applied to every repeat day. Days you moved keep their own time." (a moved day reads "This day has its own time. Changes here apply to this day only."). Desktop panel and phone sheet.
- **Move out of a break and Do during a break** change that day only (`ops.patchDay`). The phone Calendar drag no longer asks; its Undo puts back what the drag changed.
- **Tests:** `seriesTime.test.ts` (new, 13: the first time reaches Thursday, a later time keeps a changed day, a moved day, an own-length day, a title still reaches every day, a task with no dated row); `scopeAsk.test.ts` removed with its module. Real checks changed on purpose because they pinned the popup: `cp8h`, `p26`, `p28`, `p37`, `phone-p10`, `phone-p12`; new `p40.js`.

## 3.19.0 — 2026-10-29 (defaults for new users: Vibrant on, Theme Light)

**Desktop. No schema change, nothing stored is rewritten.**
- **What the defaults were:** Theme was already **Light** when never saved (desktop `DEFAULTS.theme`, the renderer's `DEFAULT_THEME_MODE`, and the phone's theme all start on `light`; **Match system** has only ever been an opt-in). **Vibrant task colours** was **off**.
- **Now, for a NEW user only (no settings ever saved):** Vibrant task colours is **ON**, Theme is **Light** (unchanged, now pinned by tests). Nothing is stored until a setting is changed; the first change saves the whole object, with Vibrant still on.
- **Existing saved settings do not change.** `loadSettings` (desktop/src/settings.js) keeps what a saved file means: a file with no `vibrantColours` was written when it was off by default, so it reads as **off**; a saved `true` or `false` is kept; a saved theme (light, dark, system) is kept; a file that cannot be read keeps the old off. Only an empty store gets the new defaults.
- **Tests:** `settings.test.js` (changed on purpose for the new default, +5: a new user, settings saved before, explicit choices, unreadable files, the first save); real checks `p38.js` (a new user: Vibrant on in the Timebox and the Calendar, Settings reads on, Theme Light, nothing stored until a change) and `p39.js` (settings saved before: Dark kept, Vibrant off, the file untouched). The older real checks now start from a saved settings file with Vibrant off (`common.js`, as an existing user would have), so they describe the person they always described. Screenshots in `docs/screens-3.19.0/`.

## 3.18.1 — 2026-10-29 (dragging a repeating task from the list onto a day)

**Desktop (the empty Task date also on the phone's repeat editor). No schema change. Fix.**
- **Bug:** a task "Zone 2" repeating Mon and Thu with an empty date, dragged from the left list onto Thursday 16:30 to 18:00, was not placed. The drop preview even said `16:30 to 18:00`.
- **Cause (reproduced first on 3.18.0 with `p37.js`):** the left list's card is a repeating task with **no Day**, so no series exists yet (a series is counted from its first row's Day: `series.seriesOfRows` needs a dated row). The drop went down the 3.2.0 path "a day of a repeating task dropped on another day moves that day only" (`DragProvider.commitDrop` -> `write` -> `seriesActions.moveDay`), because the task has a repeat rule and the target day differs from its empty Day. `moveDay` needs a Day to move from (`ownDay` is undefined) and returned `null` without a word, so nothing was written and nothing was said. Since 3.2.0 only the left list refused a repeating day, and only for projected days; an undated repeating task from the list fell between the two.
- **Fix:** dropping it on a day that matches its repeat rule **starts the series there** and sets that day's time: when the series has no time yet it asks **This day only / All days** (3.4.0); when it already has one, it sets that day alone, without asking. Dropping on a day that is **not a repeat day is refused while dragging** (the card says "Drop on a repeat day (Mon, Thu) or change the repeat", no slot is drawn) and on release the same note shows and nothing is written. New `lib/repeatDrop.ts` (the rule, tested), `seriesActions.startRepeatingOn`, `DragProvider`. A day of a series moved to another day (the weekend swap, `Moved from`) is unchanged.
- **The empty Task date of a repeating task:** setting a repeat on a task with no Day (desktop `RepeatBody`, phone `RepeatEditor`; `repeat.resolveRepeat` gets today) now gives it the first matching repeat day on or after today (the first date with the month day; today for Daily and Every year), so a series always has a start. A repeating task also no longer offers **Remove date** in the details (it keeps a Day, as the date box already did). Tasks that already have no Day (like Zone 2) get theirs on their first drop.
- **Also (a fix to 3.17.0):** the Today tag on the Calendar's month cell read 4.18:1 in dark on the cell's soft accent; it is now on a solid pane colour with an accent border (`p23.js` caught it).
- **Tests:** `repeatDrop.test.ts` (6, new); real check `p37.js` (18: reproduction, Calendar and Timebox drops, This day only, All days, a series with a time, a refused day with its hint, the Task date default); `p26.js`, `cp8d.js`, `cp8e.js`, `cp8h.js` pass unchanged. Screenshots in `docs/screens-3.18.1/`.
- **Edge Function vendor copy:** `repeat.ts` is vendored into `supabase/functions/belific-calendar-feed/vendor/` (a test pins it byte for byte); `node scripts/vendor-feed.js` re-synced the repo copy (the added defaulting only applies when a `todayKey` is passed, which the feed never does, so its behaviour is unchanged). **Nothing was deployed**; the deployed function is untouched until Jethro redeploys.

## 3.18.0 — 2026-10-29 (reminders can be chosen before a time exists)

**Desktop and iPhone. No schema change, no new column. UI only.**
- **The reminder options (At start time, 5 minutes before, ... 1 day before) are no longer greyed out** when a task has no day or no time. Choose them at any time: the choice is stored on the task as usual (`reminders`, with the legacy `reminderMinutes` mirror as always), a small hint **"Applies once you set a time"** shows at the top of the reminder menu and on the details row (and on the phone's chips and Reminders row), and once the task has a time the main process scheduler holds one reminder per lead, as for any timed task. Until then nothing is scheduled (the daily reminder note stays for the Default choice).
- Same on the phone's task sheet: its chips never were greyed, but said "A task needs a time to be reminded"; they now say "Applies once you set a time".
- **Tests:** `reminder.test.ts` +1 (`reminderHint`, the same stored list with and without a time); real checks `p36.js` (18: options enabled, hint, stored, nothing scheduled with no time, then scheduled at the start and 5 minutes before once a day and time are set, a dated task with no time, light and dark) and `phone-p16.js` (+4). `p15.js` (the scheduler) and `cp8b.js` pass unchanged. Screenshots in `docs/screens-3.18.0/`.

## 3.17.0 — 2026-10-29 (Today and Only today swapped, a clear today marker)

**Desktop. No schema change. UI only.**
- **The two buttons swapped places.** **Today** (jump to today) is now in the top row beside the Tasks / Calendar toggle, where Only today was; it switches itself off while the shown pane already shows today, and its tooltip reads "Jump to today (Shift+T)". **Only today** (just today's column) is now next to Day / Week / Month in the Calendar and next to Filter on the board, with the tooltip "Show only today's column. Press again to see every day (Shift+F)." Accessible names are unchanged (`Calendar go to today`, `Show today in Tasks`, `Show only today`). New `todayStore.ts` (each pane reports whether it shows today; the Calendar is asked to jump) and `OnlyTodayButton.tsx`.
- **Today is obvious, not only highlighted:** a small **Today** tag (the board's soft accent pill) on today's column header in Day and Week, with a soft accent fill and an accent underline on that header, and in the Month grid today's cell has a 2 px accent frame, a soft fill, the day number in a filled accent circle and the Today tag. Light and dark; the tag text is 4.5:1 or more on its pill.
- **Tests:** real check `p35.js` (39: positions, tooltips, Today and Only today working on the board and the Calendar, the tag in Day, Week and Month, the month style, light and dark). The older checks p3, p8, p9, p10, p22, cp8h, cp9 pass unchanged. Screenshots in `docs/screens-3.17.0/`. The phone has no Today button or Only today (its Calendar already opens on today); not changed.

## 3.16.0 — 2026-10-29 (the Add row: a full width field, the total under the header, + and details icon)

**Desktop (the phone's Tasks add row checked, unchanged). No schema change. UI only.**
- **Bug:** at the left pane's width the Add field read "Add a tas": the "3h planned" pill and the tag icon took its room.
- **The Add row is a full width field, `+ Add a task`,** and its placeholder is never cut. At a narrow width the secondary controls go away, never the text (`lib/addBox.ts`, tested): an empty row keeps the label button, then a day column's total, then the details icon; while typing it keeps the label, the time picker (day columns), the details icon, then the estimate picker. The field keeps at least 76 px empty (the placeholder is 71).
- **The total moved:** the left pane's `3h planned` is a small quiet caption directly under the list header, outside the Add row.
- **The + works:** clicking it (or the field) focuses the title; Enter creates the task and keeps the field ready.
- **New details icon** at the right of the row: with a title typed it creates the task (in a day column, on that day) and opens its details with the title focused; with no title it creates nothing, says "Type a name first, then open the details." and focuses the field.
- A day column's total (`0:00 / 7:00`) stays on one line.
- **The phone's Tasks add row** (`Add to Brain Dump`, a 44 pt Add button) was checked at 390 wide: the placeholder is whole; unchanged.
- **Tests:** `addBox.test.ts` (4); real checks `p34.js` (48: widths 130 to 420, both buttons, + and Enter, the details icon with and without a title, a day column, light and dark) and `phone-p16.js` (+3). Screenshots in `docs/screens-3.16.0/`.

## 3.15.2 — 2026-10-29 (the bold figure on a card is the length)

**Desktop and iPhone. No schema change. UI only.**
- **The bold figure at the top right of a task card is now the LENGTH** (`3h`, `1h 30m`, `30m`), on every card: the left pane, the Tasks board and its Today column, and the phone's Today and Tasks rows. The start time was shown there and again in the meta line; it now lives in the meta line only (with the day where the card shows one: `Fri · 06:00`; several times: `11:00, 15:00 ✓`). The meta line's accessible name still reads `Starts 11:00, 15:00 (done)`.
- **Consistent:** the figure uses `formatDuration` everywhere (before, a card with no time showed H:MM, `1:30`). A task with no length shows **no figure** (it showed a muted `0:00`).
- **Phone:** Today's rows lost the bold time in front of the title; the bold length sits at the right of the title and the start time is the first item of the meta line (mono). The Tasks rows get the same bold length (the meta line no longer repeats it).
- **Tests:** real checks `p33.js` (46, light and dark) and `phone-p16.js` (+8). Changed on purpose because the start time moved: `cp8f.js` (0:00 and H:MM figures), `cp8g.js`, `cp8h.js`, `p19.js`. Screenshots in `docs/screens-3.15.2/`.

## 3.15.1 — 2026-10-29 (themed list dropdown, native selects follow the theme)

**Desktop. No schema change. UI only. Fix.**
- **Bug:** in dark mode the task details' List dropdown (a native select) opened a white popup with white names, so none could be read.
- **Fix:** the List row is now the app's own themed popover list (`components/desktop/ListPick.tsx`): the list's emoji and name on the button; one row per list, Brain Dump first, a tick on the chosen one; **New list** at the bottom, which asks for a name with the Create list button (off while empty or a duplicate, Enter works), creates the list there and chooses it. A list with no emoji shows its name only, as before.
- **The native selects that remain** (Settings: My day starts at, Smallest piece when a break splits a task; the planning flow's list and size boxes): `themeStore` now injects one rule so their options take the theme's surface and text colour and `color-scheme` follows the theme (it was already set on the page, but a select with a transparent background drew a white popup). Estimated time and the reminder picker were already the app's own popovers. The phone has no native selects.
- **Tests:** real check `p32.js` (29: the popover rows, tick, New list, both themes, option colours of every native select); `p11.js` and `p17.js` read the new List button instead of the select (changed on purpose). Screenshots in `docs/screens-3.15.1/`.

## 3.15.0 — 2026-10-29 (switches redrawn)

**Desktop and iPhone. No schema change. UI only.**
- **One switch everywhere** (`components/Toggle.tsx`): Settings, the filter, the task details (Must do, Split) and the phone (Settings, the task sheet's Top priority). 44 x 26 with a 20 point light knob in both themes, the same focus ring (2 px accent outline, offset 2), a 44 pt touch area on the phone.
- **On** is a deep sage track with the knob to the right and a tick on it; **off** is a plain grey track with the knob to the left. Before, the dark theme drew a dark knob on the sage track and the off track was nearly the page colour.
- New tokens `switchOn`, `switchOff`, `switchKnob`, `switchEdge` (light and dark; `design-tokens` regenerated). `tokens.test.ts` checks the knob on both tracks and both tracks on the pane and a surface at 3:1 or more, in both themes.
- The phone's Top priority switch used the danger red track; it now uses the same sage as every other switch (a red on-state read as an alert).
- **Tests:** `tokens.test.ts` +1; real checks `p31.js` (27) and `phone-p16.js` (12), light and dark, screenshots in `docs/screens-3.15.0/`.

## 3.14.2 — 2026-10-27 (regenerate the design tokens)

**Fix, no behaviour change.** `design-tokens/tokens.css` is generated (`node scripts/export-tokens.mjs` in `mobile/`); 3.13.0 added the picker tokens to it by hand with the wrong indentation in the system dark block, which `designTokens.test.ts` caught in the final run. Regenerated.

## 3.14.1 — 2026-10-27 (Brain Dump's emoji on cards and blocks)

**Desktop and iPhone. No schema change. Fix.**
- **Bug: the Brain Dump brain never showed** on task cards, Calendar blocks or Timebox blocks. **Cause:** `lists.listEmojiOf` (2.27.1) answered nothing for a task with no list, so every surface that draws a list emoji from it (cards on the Tasks board and the left pane, Timebox and Calendar blocks) drew nothing for Brain Dump, and the phone's Calendar blocks did the same by reading the list row themselves. It was a rule of the first version ("Brain Dump gives nothing"), not a loading problem.
- **Fix:** Brain Dump (a task with no list, or on a list that was deleted here or on another device, which already reads as Brain Dump) gives its brain 🧠, and `listNameOf` its name, so the block's tooltip says "Brain Dump". A list with an emoji shows it, a list with none still shows nothing (never the default clipboard), a renamed list keeps its emoji and the tooltip follows the name. iPhone: the Calendar's Day blocks use the same rule, and Today's rows say "🧠 Brain Dump" the way a named list says "🎮 Games". (The Tasks tab's rows carry no list line, the chosen chip names the list, as before; its chips already showed 🧠.)
- **Tests:** `lists.test.ts` (changed on purpose: Brain Dump, a deleted list and a missing list now answer 🧠 and "Brain Dump"; +a renamed list); `p30.js` (new, 58: Brain Dump, Games with an emoji, Plain without one, a renamed list and a task on a deleted list, on the board cards, the left pane's cards, the Timebox and the Calendar's day, with the tooltips; light, after a rename, dark; 37 of 58 failed before the fix); `phone-p15.js` +20 (the chips, Today's rows and the Calendar's blocks, a renamed list, dark and light). Changed on purpose: `p11.js` ("a task with no list shows nothing" now shows the brain).

## 3.14.0 — 2026-10-27 (One emoji per list)

`**Desktop and iPhone. No schema change. No stored list is changed.**
`- **One emoji per list.** A list cannot take an emoji another list has, or Brain Dump's brain. In the picker (desktop and phone) the taken emojis are **greyed out**; hovering, focusing or tapping one says which list has it ("🐶 is already used by Games", "🧠 is Brain Dump's emoji"), and nothing is chosen. A line under the panel explains the grey ("Greyed out emoji belong to another list."). A typed or pasted taken emoji is refused the same way. An emoji counts as the same with or without its text style selector (U+FE0F); a deleted list gives its emoji back.
`- **Brain Dump keeps its brain** (it is not a stored list; no list may use 🧠).
`- **Enforced in the command layer** (`lists.listEmojiProblem`, `taskCommands.createList`, `editList` through `editedList`, and `setListEmoji`): the same sentence comes back as the problem, so nothing but the picker can write a duplicate on this device.
`- **Existing duplicates are not changed.** A list that already shares its emoji keeps it, can still be renamed or saved, and its edit box shows a small note: "🍎 is also used by Twin A. It stays as it is; choose another emoji if you like." Only a change to a taken emoji is refused. Its own emoji is not greyed out in its own picker. (Another device can still write a duplicate until it has this version; those are handled as any existing duplicate.)
`- **Tests:** \`lists.test.ts\` +6 (what is taken, the refusals and their sentences, with and without the selector, a deleted list, the list's own emoji, existing duplicates kept and noted, the command layer calls the check); \`p29.js\` +16 (greyed with the list named, a click chooses nothing, the brain, a pasted taken emoji, a free emoji, the note, a rename of a duplicate, its own picker, the change of emoji, Brain Dump's brain); \`phone-p15.js\` +8.

## 3.13.0 — 2026-10-27 (Emoji picker for lists)

**Desktop and iPhone. No schema change.**
- **A better emoji picker for lists** (new list and the edit box on the desktop; the New list and Edit list sheets on the phone), light and dark:
  - **The chosen emoji shown large** in a panel at the top (a dashed box and "No emoji chosen" when there is none). On a list the picker stays open after a pick, so the choice can be seen and changed; **Done** (desktop) closes it, Save writes it. Task and label emoji fields still close on a pick.
  - **"Frequently used"** row at the top: the emoji chosen most often on this device (most often first, the latest first among equals), at most 8. Nothing is made up: until something is chosen it says "Emoji you choose often will show here." Kept on this device only (desktop `belific_desktop_emoji_use`, phone `belific_phone_emoji_use`, never synced); the desktop's old recent row counts once each, so it carries over (`lib/emojiUse.ts`).
  - **Category tabs with an icon each:** Smileys, People, Animals, Food, Activities, Travel, Objects, Symbols (and Flags on the desktop, where the data has them), the full name above the grid (`lib/emojiCategories.ts`). Tabs are 36 px tall on the desktop and 44 pt on the phone, emoji cells 36 px and 44 pt.
  - **Search:** the desktop keeps its search box (names and keywords). The phone has none: the full emoji data and `searchEmoji` stay desktop only (the iOS marker gate), so the phone has a hand-picked set per category (`lib/emojiCurated.ts`, about 30 each) and its emoji keyboard field (which has a search of its own) for any other emoji.
  - **New tokens** `pickerPreview`, `pickerTabOn`, `pickerCellOn` (light and dark; `design-tokens/` too), text on them 7:1 and the tab icon 4.5:1.
- The desktop's lists menu is wider (360 px) and taller so the picker fits.
- **Tests:** `emojiUse.test.ts` (new, 5), `tokens.test.ts` +1; `p29.js` +12 (opens in place with the emoji large, tabs with icons and sizes, Frequently used empty then filled, a pick stays open, Done, Save, dark and its token); `phone-p15.js` +15 (large panel, 8 tabs 44 pt, 44 pt cells, no search box, pick, Clear, Frequently used, Save, dark and its token). Changed on purpose: `p11.js` (the tabs' names and order: Activities now before Travel, the short names).

## 3.12.0 — 2026-10-27 (Create list button)

**Desktop and iPhone. No schema change.**
- **A "Create list" button next to the name field** wherever a list is made: the desktop's list dropdown (New list) and the phone's New list sheet (the dashed "New list" chip). Enter still works on the desktop (and the phone keyboard's Done).
- **Off while the name is empty or taken, and it says why** in a line under the field: "Type a name to create the list", "Another list has that name", "Brain Dump is always there", "Use 40 characters or fewer" (`lists.createListState`, the same rules `createList` has always enforced). A tap or Enter on the off button creates nothing.
- The phone's New list sheet no longer has a separate Save (Create list replaces it); editing a list still has Save, Cancel and Delete list.
- **Tests:** `lists.test.ts` +1; `p29.js` (new, 10 checks: on and off states, the reason, a click and Enter on a duplicate, Create list, Enter); `phone-p15.js` (new, 6 checks, 44 pt button). Changed on purpose: `phone-p5.js` (taps Create list instead of Save new list).

## 3.11.1 — 2026-10-27 (Resize and nudges keep tasks inside their break)

**Desktop. No schema change, no data change.**
- **Resize handle and keyboard nudges refuse what would take a task out of its break.** Shrinking a break with its bottom handle, or with the keys (30 minutes shorter, earlier, later, another day), is refused when a task it hosts would stick out: the break snaps back, nothing is written, and the notice bar says **"Longer than the break. Shorten it or move it out."** Making the break longer is still fine. The same rule covers a block of a task with several times: a resize or a nudge that would push its time inside a break past that break's end (or start it inside a break it does not fit) is refused with the same note. (`hostActions.blockChangeRefusal`, `hosting.breakLosesGuests`; `TimeBlock.tsx` keys, `DragProvider.tsx` resize.)
- The details panel's own time and length fields are unchanged: a break shrunk there still lets its tasks go with the 3.11.0 note.
- **Tests:** `hosting.test.ts` +1 (shorter, later, earlier, longer, off the day, unchanged, another task); `p28.js` (resize handle refused with the note and nothing moved, keys Shift+Up and Down refused, Shift+Down allowed). Changed on purpose: `p28.js` (the break shrunk by its handle used to let a task go with a note; it is now refused).

## 3.11.0 — 2026-10-26 (Task during a break, follow up P3: refuse, do not just warn)

**Desktop and iPhone. No schema change. A normal task still cannot host tasks (that needs a new column).**
- **The rule** (`hosting.fitRefusal`, `hostActions.breakRefusal`): a change is refused when (a) a new start (a drop, a new time, a new day, a new task) falls inside a break the task does not fit in from there, or (b) a task that was inside a break would overlap it without fitting. A task exactly as long as the break fits; one minute longer does not. A task that starts before a break and runs into it is not refused (Split cuts it, as always), nor is a length change of a task outside every break, nor anything about a break itself.
- **Drops snap back:** a task dragged over a break it does not fit in shows **"Longer than the break (1 h)"** on the lifted card and, released, stays where it came from, with the note in the notice bar (desktop); the phone's hold-drag the same (and, like the desktop, a task that fits starts inside the break when dropped on it). Before, the drop went through as a normal one with a warning.
- **Details refuse:** a time, a length or a day that would leave a hosted task sticking out of its break: **"Longer than the break. Shorten it or move it out."** (desktop Time row; phone, under the break section, whichever row was open). The phone's quick add refuses a time inside a break the new task does not fit (a tap just under a 20 minute break is its 15 minute slot), with "Longer than the break (20 min)".
- **"Do during a break"** lists only the breaks long enough (as before; the shorter ones are only named in its note).
- **A break moved or shrunk is allowed:** its tasks that no longer fit go back to normal blocks and a note says **"1 task no longer fits and moved out of the break"** ("N tasks …"; `hosting.lostGuests`, desktop `breakStore.watchDay`, phone `DayView`). A break deleted or with Split turned off: its tasks go back to normal blocks, without a note.
- **Tests:** `hosting.test.ts` +5 (exactly as long, one minute longer, the notes, a hosted task sticking out, moved clear, starting before, a task already over a break edge, several times, shrunk, moved, gone, a task that moved itself); `p28.js` +12 (a 21 minute task over a 20 minute break refused with its note and snapped back, a 90 minute task in a 90 minute break hosted, the details' refusal, Do during a break's list, the break shrunk with its note, Split off, a deleted break; dark and light); `phone-p14.js` +8 (quick add, details, hold-drag refused; the break shrunk with its note). Changed on purpose: `p27.js` (a task longer than the break, dropped on it, now snaps back instead of dropping as before).

## 3.10.0 — 2026-10-26 (Task during a break, follow up P2: details and cards)

**Desktop and iPhone. No schema change.**
- **A break's details: "Inside this break"** (desktop `HostDetails.tsx`, phone `TaskDetails.tsx`): each task during it with its tick, its title (opens it), its time and length, and **Move out** (a 5 second Undo: the desktop's bar, a row in the phone's details).
- **A hosted task's details: "During: Lunch"** with **Move out** (a task with several times lists each time that is inside a break).
- **Cards:** a break's card shows a small pill **"N inside"**; a hosted task's card says **"During Lunch"**: the desktop's Tasks board and left list, the phone's Today and Tasks rows. Timebox, Calendar and phone timeline blocks get neither (no clutter on small blocks). New tokens `hostPill` and `onHostPill` (6:1 on the pill and on cards, light and dark). `lib/hosting.ts` `hostLinks`, `hostIndex`, `duringCaption`, `insidePill`.
- **Fix (3.9.0):** the Undo of a Move out on a day of a repeating task (This day only) also moved the next day that was stored to carry the series onto that day, so the task showed twice. Undo now leaves that carrying row alone (`hostActions.ts`).
- **Tests:** `hosting.test.ts` +2 (links and the index, two overlapping tasks and a second time, a repeating day moved into a break, Split off, a deleted break), `tokens.test.ts` +1; `p28.js` +19 (pills and captions light and dark, not on blocks, break details with tick, open, Move out and Undo, hosted details, the pill's dark colours, the duplicate found above; failed before the fix); `phone-p14.js` +13 (Today and Tasks rows light and dark, break details, Move out with Undo in the details, During: Tea).

## 3.9.0 — 2026-10-26 (Task during a break, follow up P1: move out of a break)

**Desktop and iPhone. No schema change.**
- **The chip's menu** (a right click on a chip, or its small ⋯ button): Open, **Move out of break** (the task starts when the break ends, the same day, the same length) and **Remove time** (an Anytime task that day). A task with several times moves or loses only its time inside the break. A day of a repeating task asks This day only / All days, as any new time does. A break that ends at midnight refuses Move out with a note.
- Both show an **Undo** message for **5 seconds** (`offerUndo` takes a length); Undo puts back exactly the rows the action changed (a day stored by This day only takes back the time it showed). `lib/hostActions.ts` (new, shared), `hosting.moveOutFields`, `removeTimeOutFields`.
- **A chip drags like a block:** dropped anywhere it is a normal move, so the hosting ends (dropped inside the same break again it is simply hosted again).
- **iPhone:** the break's sheet (`HostedSheet.tsx`, new) has per task a tick, its title (Open) and **Move out**, each 44 pt; Move out shows the Undo bar for 5 seconds.
- iOS marker: `Move out of break`.
- **Tests:** `hosting.test.ts` +2; real checks `p28.js` (new, 18: right click and ⋯ menus, Move out, Remove time, Undo after 5 s gone, Undo, several times, a repeating day with This day only and its Undo, a chip dragged out) and `phone-p14.js` (new, 7: the sheet's 44 pt Tick, Open, Move out, Undo). Changed on purpose: `phone-p13.js` (the sheet's selectors).

## 3.8.0 — 2026-10-26 (Task during a break P4: the Settings switch and the totals)

**Desktop. No schema change: one `user_settings` row (`planner.break_count_twice`, synced like `planner.cut_min`).**
- **Settings, Planning: "Count minutes done during a break twice"** (off by default; `breakTwiceStore.ts`). Off: the minutes a task shares with the break it is inside count once: the day's estimate on a Tasks day column, the Calendar's header figure, the planning flow's Estimated and the Analytics time card take them off (`hosting.hostedEstimate`: only a task and a break that both have an estimate and are both in the figure, per break the time its tasks cover, so two tasks overlapping each other inside it share theirs once). On: every estimate counts in full, and the Timebox's "Scheduled" (the blocks' time, which already counts those minutes once) adds them again.
- **Time spent (actual) never changes:** one timer runs at a time (`lib/timerSession.ts`: starting a timer stops the running one), so a task's and its break's timed minutes cannot overlap. Kept as it is.
- iOS marker: `Count minutes done during a break twice`.
- **Tests:** `hosting.test.ts` +2 (`hostedMinutes` with overlapping tasks, `hostedEstimate`), `taskTotals.test.ts` +1, `analytics.test.ts` +1; `p27.js` +4 (the switch, off by default, stored as a synced setting; on: Scheduled and the day's estimate both rise by the 115 shared minutes).

## 3.7.0 — 2026-10-26 (Task during a break P3: the phone's Day view)

**iPhone. No schema change, nothing stored.**
- **The Calendar's Day view hosts tasks like the desktop** (`lib/phoneDay.ts` uses `lib/hosting.ts`): a task fully inside a break has no block of its own; the break stays one full width block. A break of one line (20 or 30 minutes) cannot show chips and shows a "+N" badge; a taller one stacks a chip per row under its title (light chip, dark text in both themes, a dot in the label colour, title, length), "+N" on the title row for the ones that do not fit. Its screen reader label names the tasks during it.
- **A tap on a break with tasks during it opens a small sheet** ("During Tea"): one row per task (dot, title, time, length; ✓ when done), a tap opens that task's details; "Open Tea" opens the break itself. A break with nothing inside opens as before. The chips themselves are not separate tap targets (too small for 44 pt).
- Today, Tasks and the hold menu do not change.
- **Tests:** `phoneDay.test.ts` +1 (hosted, no block, the break full width, the long task cut as before, no "cover" note), `hosting.test.ts` (the phone's chip plan); real touch check `desktop/test/real/phone-p13.js` (new, 17 checks at 390 x 844, light and dark: "+2" on a 20 minute break, one chip on 60 minutes, three on 90, no overlap, the sheet, a row opens its task, Open Tea, Today unchanged).

## 3.6.0 — 2026-10-26 (Task during a break P2: chips in the break, desktop)

**Desktop. No schema change, nothing stored.**
- **A hosted task is a chip inside its break** in the Timebox and the Calendar (day and week): the break stays one full width block; the chip is light with dark text in both themes (new tokens `hostChip`, `onHostChip`), with a dot in the task's label colour, its title and length. A short break (one line, under 36 px: 20 or 30 minutes) shows its title and one chip on the same line, the chip's text cut short, with "+N" on the right for the rest; too narrow for a chip (under 150 px, a week column) it shows only "+N". A taller break stacks one chip per row under its title, the first ones that fit and "+N" on the title row. Overlapping hosted tasks are a list, never lanes. The hosted task no longer gets a block of its own, a lane, or the old "Not split: it would cover a whole task" note.
- The break's tooltip lists everything during it ("During it: …"). Clicking a chip opens its task; clicking its dot ticks (or reopens) it. A hosted task is still a card in Tasks (and on the phone's Today).
- **Drag onto a break** (Timebox or Calendar): with the pointer on a break, the task starts inside it, at the slot it was dropped on if it fits there, else at the break's start; the lifted card says "During Lunch, 12:30 to 13:00". A task longer than the break is refused, "Longer than the break: …", and drops exactly as before (Split unchanged).
- **"Do during a break"** in the ⋮ menu (not for a break, a done task, or a task with several times): today's breaks the task fits in, with their times; the shorter ones are named under "Longer than the break". Choosing one puts the task on today at the break's start (a repeating day asks This day only / All days, as any new time does).
- iOS markers: `Do during a break`, `DuringBreakBody` (desktop only). `lib/hosting.ts` is not a marker (the phone uses it in P3).
- **Tests:** `hosting.test.ts` +1 (`hostDrop`), `tokens.test.ts` +1 (chip text 6:1 in both themes, the chip 3:1 on every vibrant colour and the slate break); real check `desktop/test/real/p27.js` (new, 64 checks: 20 and 60 minute breaks with one and three hosted tasks, Timebox and Calendar, light and dark, no text overlapping, tooltip, chip opens and ticks, drag in, longer refused, moved out, the menu; screenshots in `docs/screens-3.6.0/`).

## 3.5.0 — 2026-10-26 (Task during a break P1: the hosting rule)

**Logic only, no screen yet. No schema change, nothing stored.**
- **`lib/hosting.ts`** (new, pure): a task that starts and ends fully inside a break (a task with Split on) is *hosted* by it (`hostDay`), derived from the times only. Edges count; a task inside two breaks goes to the shorter; a break is never hosted; the rest of yesterday's overnight task is never hosted; each time of a task with several times is judged on its own. A task that only partly overlaps a break is not hosted, so Split treats it exactly as before. Helpers for the next phases: `dayHostEntries` (a day's entries like the Timebox builds them, repeating days and extra times included), `breakAt`, `hostStart` (the dropped time if the task fits inside the break from there, else the break start; refused, `LONGER_THAN_BREAK`, when the task is longer than the break), `breaksFitting`, `chipPlan` (one line or stacked chips and the "+N" count for a block's size), `hostedMinutes`, and the setting row `planner.break_count_twice`.
- **Tests:** `hosting.test.ts` (16: inside, partly overlapping, longer than the break, several tasks, the Split plan unchanged for the rest of the day, breaks and yesterday's rest never hosted, Split off, extra times on the task and on the break, repeating days, moved out, the drop start, chip plans for 20, 45, 60 and 120 minutes).

## 3.4.1 — 2026-10-26 (Repeating, this day only: the desktop question above the drop-down)

**Desktop. No schema change.**
- **Fix:** picking a new length for a repeating day in the details left the length drop-down open over the "This day only / All days" question until it was answered, so a click meant for All days picked another length. `ScopePrompt.tsx` now renders into `document.body` like `Popover.tsx`, above the drop-down and the details panel.
- **Tests:** `cp8h.js` +1 (the question is on top of the open drop-down; failed before the fix). Changed on purpose for 3.2.0 to 3.4.0: `cp8h.js` (a projected card dropped on its own day's Timebox, and a length change in its details, now answer the question with All days; a projected card is still refused by the left list, with the new hint, and may now go to another Day column, checked in `p26.js`) and `phone-p10.js` (the hold-and-drag on a repeating day answers All days).

## 3.4.0 — 2026-10-25 (Repeating, this day only P4: This day only / All days)

**Desktop and iPhone. No schema change.**
- **A new time or length for a day of a repeating task asks "This day only / All days"** (`lib/scopeAsk.ts`): a small popover where the pointer let go on the desktop (a drag or a resize of a block, the time or estimate in the details, the block keys), a sheet on the phone (the details' time and length, a hold-and-drag on the Calendar, whose Undo follows the answer). Dismissed (Escape, a click outside, Cancel), it does what the app did before: a projected day changes the series, a stored day changes only itself; that answer is marked Default.
- **This day only** (`series.planThisDayEdit`, `seriesActions.editThisDay`): the day is stored with its own time. The series' template is its latest stored row, so a changed day that would become it would hand its time to every later day: the next day of the series is then stored too, from the series as it was, and carries the series. Skip this day on that carrying day keeps the change on the day before it (`planSkip` stores the next day instead of overwriting an open earlier row; a completed earlier row still takes the content over, as before).
- **All days** is the old series edit (the template and every open stored day from today, a moved day's time included, never its Day).
- One change arriving twice (the phone's time field commits on Enter and on blur) is asked once and both writes follow the one answer.
- The series notes say so: desktop "Repeating: changes apply to every day. A new date moves this day only; a new time asks."; the phone's note likewise.
- **Tests:** `seriesMove.test.ts` (+5: a projected Saturday, a stored day, the fields it never takes, a moved day, skip after a this-day change), `scopeAsk.test.ts` (5); real checks `p26.js` (+9: the prompt, its default, Escape, This day only with the next day carrying the series, All days on a stored moved day) and `phone-p12.js` (+4: the sheet, This day only, the carrying day, Cancel). Changed on purpose: `series.test.ts` (skipping the template with an open earlier row stores the next day).

---

## 3.3.0 — 2026-10-25 (Repeating, this day only P3: show moved days)

**Desktop and iPhone. Nothing stored: a day is moved when its id's day is not its Day (`series.movedFrom`).**
- **"↪ Moved from Sat"** (`series.movedCaption`) on the task card's meta line, a tall Calendar or Timebox block's own line, the phone's Today and Tasks rows, and in their screen reader labels. A short block (one or two lines) and a Calendar all day chip show only the ↪ arrow.
- **The whole sentence** "Moved from Sat 31 Oct · this day only" (`movedCaptionLong`) in the tooltips (card caption, block, arrow, chip) and at the top of the details (desktop and phone).
- **Tests:** `seriesMove.test.ts` (the caption, short and long, and nothing when not moved); real checks `p26.js` (+8: card, a tall and a short Timebox block, a Calendar block, no caption on an unmoved card) and `phone-p12.js` (+4: Today row, details, Tasks row).

---

## 3.2.0 — 2026-10-25 (Repeating, this day only P2: move a day on the desktop and the phone)

**Desktop and iPhone. No schema change.**
- **Drag a day to another day:** a repeating day that is not stored yet can now be dragged to another Day column, or to a time slot on another day, and moves that day only (stored first). A stored day moves the same way (the series' first row through the copy of 3.1.0). Dropped on a time slot of its own day it still sets the series' time. The refusal "Repeating: set Repeat to Does not repeat to move it" is gone; only the left list still refuses ("A day of a repeating task stays on a day").
- **Move this day** in the ⋮ menu of a repeating card or block (beside Skip this day): the day picker opens in the same popover, headed "Move this day", with "Only this day moves. The other days stay as they are." and no "Remove day". The card's ☀️ Move to today now works on a projected day too.
- **Details:** the date of a projected day can be changed (the field and the date picker were off); a repeating day cannot be cleared to no date; the series' first row reopens under its new id. Keyboard: the day before or after on a block of a projected day moves that day only (it did nothing).
- **Phone:** the details' date sheet moves a day of a repeating task (projected or stored) through the same helper, says only this day moves, and has no "No date".
- **Tests:** real checks `desktop/test/real/p26.js` (17: drag a projected day, Move this day, the first row) and `phone-p12.js` (11: the date sheet, a projected day and the first row). Changed on purpose: `drag.test.ts` (a projected day's day nudge now moves that day).

---

## 3.1.0 — 2026-10-25 (Repeating, this day only P1: move one day)

**Shared logic (desktop and iPhone). No new column, no migration: a moved day is a stored occurrence whose `id` keeps the day it stands for (`root:2026-10-31`) while `due_date` is where it is now.**
- **Move one day** (`lib/series.ts` `planMoveDay`, `lib/seriesActions.ts` `moveDay`): that day alone goes to another Day, with an optional time or length for that day alone. The moved row keeps its repeat rule; the rule, the template and every other day are unchanged. A projected day is stored first. A new Day on a stored day of a repeating task (details, Move to day, a quest put on today) now goes through it (`lib/taskOps.ts`); a Day set together with a repeat change is still a series edit.
- **Fixed A, the series' first row:** its id has no day, so moving it brought its own day back as a second card (and an old weekly task with no weekdays moved the whole series). Now its day is skipped (the row is tombstoned keeping its rule, as Skip this day does) and the day is stored as `root:day` on the new Day, a copy with its ticks, time and steps. Not in the Trash, not a skipped day for the streak.
- **Fixed B, the template:** a moved row is never the template while another row is left, so a change made to a moved day never reaches the later days.
- **Fixed C, taken days:** a row takes only the day it stands for (`ownDay`). Moving Saturday onto Sunday no longer hides Sunday's own occurrence.
- Skip this day on a moved card skips that row (by its id); Delete repeating task removes moved days with the rest. New `isMovedRow` and `movedFrom`.
- The calendar feed's copy of `series.ts` is in step (`node scripts/vendor-feed.js`).
- **Tests:** `seriesMove.test.ts` (19): Saturday to Friday, Saturday to Sunday, the first row (also weekly with no weekdays, and as template), a time change on one day, back to its own day, skip and delete, sync round trips through the server shape, two devices, the older client's rule. Changed on purpose: `series.test.ts` (the day a row was moved to keeps its own occurrence) and `quests.test.ts` (a moved row is not the template).

---

## 3.0.0 — 2026-10-22 (iPhone catch-up P12: release preparation)

**Version only, and the hand checklist. No code change. Nothing was built or sent (decision 1: 3.0.0 at P12).**
- **3.0.0** is the iPhone catch-up release (P1 to P11, 2.49.0 to 2.59.0): the desktop's look (tokens, Inter and Newsreader, Light, Dark, Match system), three tabs (Today, Calendar, Tasks), Settings behind the avatar, the round + everywhere, touch rules (tap, hold, swipe, drag), Today in time order with Undo, Tasks with lists and Repeating, full task details (priority, date, time, length, label, list, repeat, times a day, reminders, notes, steps), phone reminders with "Remind me on this device", and the Calendar's Day, Week and Month with the sideways swipe and hold-to-drag.
- **`docs/PHONE_RELEASE_3.0.0.md`:** what Jethro does by hand: the waiver question (a second EAS build), the native changes in this build, the variables, the phone backup, `eas build` and `eas submit`, the TestFlight hand test (what to tap, swipe and hold, and what should happen), when Convert routines is safe, and the rollback to the live 2.18.1. `docs/BELIFIC_EAS_TESTFLIGHT.md` points to it; `docs/PLAN_phone.md` has its status.
- `ios.buildNumber` stays "1" (a new version string starts at 1; check it is unused in App Store Connect).

---

## 2.59.0 — 2026-10-22 (iPhone catch-up P11: the Theme setting, the dark audit, the old palette gone)

**iPhone, and one native setting (`userInterfaceStyle` is now "automatic", needed for Match system: it takes effect in the next EAS build). The desktop is unchanged.**
- **Theme in Settings, On this iPhone:** Light (the default), Dark, Match system, per phone (never synced); the whole app switches at once, and the status bar follows.
- **Every phone screen follows the theme:** Settings, the event form, the routine form, the calendar feed section and the routine convert section moved onto the theme (`useThemed`), and Settings' title is Newsreader like the other screens.
- **The old palette is gone:** `phoneColors` is removed from `lib/tokens.ts`; `Colors` on the phone is the light tokens (only the error screen reads it).
- **Retired:** the old Brain Dump, task list and Quests screens (`components/legacy/`) and the old task form (`app/components/TaskForm.tsx`).
- **Found by the audit and fixed:** done items in Week, other months' dates in Month and in the details' date grid used the faint tertiary grey (2.6:1 to 3.3:1); they now use the secondary grey (4.5:1 or more in both themes). The Theme switch's "Match system" fits (13 pt segments).
- **Text size:** calendar blocks grow with the iPhone's text size up to 1.3 times, so the block tiers still hold.
- **Tests:** real touch check `phone-p11.js` (51): twelve phone screens and sheets in Light and Dark, each audited like the desktop's p23 (radius scale, text 4.5:1 on its real background), and the Theme setting. Changed on purpose: `tokens.test.ts` (Colors is the light tokens now), `iosMarkers.test.ts` (reads the current screens).

---

## 2.58.0 — 2026-10-22 (iPhone catch-up P10: hold a block, then drag it)

**iPhone. JavaScript only (no Reanimated, decision 5). The desktop is unchanged.**
- **Press and hold a block on the Day timeline** (about 400 ms, a small haptic, it lifts), then drag it up or down: it follows the finger and shows the time it will get; letting go moves it in 15 minute steps (decision 6). A message says where it went, with Undo. Near the top or bottom edge the timeline scrolls on its own. (`components/phone/calendar/DraggableBlock.tsx`: gesture handler's pan after a long press, raced against the tap.)
- **The desktop's drop rules** (`lib/phoneDrag.ts` on `drag.ts`): a task moves to the new start (30 minutes when it had no length); one time of a task with several times moves alone, and a drop over another of its times is refused with a note; a projected day of a repeating task moves the series' time, never its day; never onto a past day. A split piece moves its whole task by the same amount; yesterday's overnight rest is not draggable.
- **A quick tap still opens a block; a finger that moves before the hold scrolls the timeline.** Screen readers get "15 minutes earlier" and "15 minutes later" on every task block.
- **iOS marker gate:** `multiDropPatch` and `resizeRefusal` removed on purpose (P10): `drag.ts` reaches the phone; `resizeRefusal` comes with it (a pure check, no resize on the phone).
- **Web export only:** a block takes the touch itself (the browser would otherwise start a scroll and cancel the drag); the empty timeline still scrolls.
- **Tests:** `phoneDrag.test.ts` (5); real touch check `phone-p10.js` (9): hold and drag an hour, Undo, the snap to a quarter, a drag without the hold moves nothing, a tap still opens, one of several times moves alone, an overlap is refused, a repeating day moves the series time.

---

## 2.57.0 — 2026-10-22 (iPhone catch-up P9: Week, Month and the sideways swipe)

**iPhone. JavaScript only. The desktop is unchanged.**
- **Week** (`components/phone/calendar/WeekMonth.tsx`): seven narrow columns, today tinted, short titles only (the first word or two, no emoji: `lib/phoneWeek.ts` shortTitle), up to eight a day then "+N".
- **Month:** the weeks of the month, today filled, up to three marks a day (red for top priority, grey for events) and a count past three.
- **A tap on a day in Week or Month opens that day in Day view. It never creates a task.**
- **A sideways swipe** on any view moves to the next or previous day, week or month (a gesture handler pan on the page, with a light haptic): it needs a clearly sideways move (24 pt before 16 pt up or down, `lib/touchRules.ts`), so a vertical scroll always wins, and a quarter of the width or a quick flick turns the page.
- **Tests:** `phoneWeek.test.ts` (2); real touch check `phone-p9.js` (11): swipe left and right on Day, a slanted vertical drag scrolls the timeline and turns nothing, Week's seven columns and short titles, a tap on a day opens it and creates nothing, the week and month swipes, Month's whole weeks.

---

## 2.56.0 — 2026-10-22 (iPhone catch-up P8: the Calendar's Day view)

**iPhone. JavaScript only. The desktop is unchanged.**
- **The Calendar tab is rebuilt** (`app/(tabs)/calendar.tsx`): Day, Week and Month at the top, the arrows and Today under them (Week and Month are drawn in P9).
- **Day is a touch timeline** (`components/phone/calendar/DayView.tsx`): an all day row, 24 hours at the desktop's 56 px an hour, a red line at the current time on today, and the day's blocks side by side where they overlap. The day is built by `lib/phoneDay.ts` with the desktop Calendar's rules: today's stored and projected tasks, a block per time of a task with several times, yesterday's overnight rest, breaks that split the task under them (as on the desktop), the old events in grey (decision 4) and the iPhone's own calendar events (read only, asked for in context as before).
- **Blocks** (`PhoneBlock.tsx`) use the 2.47.0 tiers: one line under 36 px, two to 55 px, the full layout from 56 px; one line each with an ellipsis, so text never runs over text or out of the block. A task takes its label's tint and edge colour.
- **A tap on a block opens it** (the task details; an event of your own opens its edit form). **A tap on an empty part of the timeline** opens the quick add with that quarter hour and 30 minutes filled in (decision 6: 15 minute steps); Cancel is one tap. The tap layer sits under the blocks, so one tap never counts twice.
- **iOS marker gate:** `planCuts` and `refusalNote` removed on purpose (P8): the phone draws breaks. The Split setting's own words stay markers.
- **Web export only:** the phone layout declares its own fonts (the desktop's .woff2 files) so a page that starts on a phone screen shows Inter, not a serif fallback.
- **Tests:** `phoneDay.test.ts` (5); real touch check `phone-p8.js` (15, including the text overlap check of `p24.js` on the phone's blocks). The touch harness reloads the page once at phone size: the app picks its layout when it starts, as an iPhone does (a page narrowed after it started could stay on the desktop entry, which made earlier phone checks flaky).

---

## 2.55.0 — 2026-10-22 (iPhone catch-up P7: Repeat, times a day, reminders; "Remind me on this device")

**iPhone, plus one desktop label. JavaScript only (expo-notifications is already in the app).**
- **Repeat in the phone's details** (`components/phone/RepeatEditor.tsx`): Daily, Weekly with days (Weekdays, Weekends), Every 2 weeks, Monthly on a date, Every year (after the "Every device is updated" tick), with the line that says exactly what will happen and Apply. The desktop's rules and fields (`lib/repeat.ts`); "Does not repeat" ends the series, as on the desktop.
- **Times a day** (`TimesEditor.tsx`): Add another time (the suggested time after the last), change or remove a later time; the times rules (`lib/times.ts`: never overlapping, up to six).
- **Reminders** (`RemindersEditor.tsx`): Default, None, or up to five leads (at the start, 5, 10, 15, 30 minutes, 1 hour, 1 day before); "for each time" on a task with several times. Stored with the shared reminderPatch.
- **The iPhone reminds** (`components/phone/reminderScheduler.ts`, rules in `lib/phoneReminders.ts`): local notifications for timed tasks over the next 14 days, at every lead and every time not done, projected repeating days included, with the desktop's keys; planned again at launch, on coming to the front, after each sync and after every change; at most the iPhone's 64 pending notifications, the event notifications counted. Nothing is scheduled on the web export.
- **Decision 3, one switch per device, on by default on both:** the phone's Settings, On this iPhone, "Remind me on this device" (kv, never synced); on the desktop the switch "Tasks placed on the Timebox" is now named "Remind me on this device" with a line under it (the same per computer setting `notifyTasks`, default on).
- **iOS marker gate:** `effectiveReminders` and `Add another time` removed on purpose (P7). `setDefaultReminders` and "Reminders for a timed task" stay markers (desktop only).
- **Fixed a stale comment:** `syncCore.ts` no longer says migration 004 is not applied.
- **Tests:** `phoneReminders.test.ts` (5: the default lead, a list of leads with passed ones skipped, each time not done, projected days and a skipped day, the limit); real touch check `phone-p7.js` (14). Changed on purpose: desktop check `cp9.js` toggles the switch by its new name.

---

## 2.54.0 — 2026-10-22 (iPhone catch-up P6: task details, part 1)

**iPhone. JavaScript only. The desktop looks and works the same (one shared file moved).**
- **A task's details on the phone** (`components/phone/TaskDetails.tsx`, a full sheet with Done): title and emoji, top priority (the red exclamation mark), date (Today, Tomorrow, No date and a month grid, weeks from Monday: `MonthGrid.tsx`), time (the iPhone's own time picker; a typed field on the web export: `TimeField`), length (the desktop's presets and a typed length), label (with its colour dot; a new label gets the next free colour), list, notes, steps (add, tick, rename, delete) and Delete. Opened from Today (Edit, the menu) and from Tasks (a tap, the menu), in place of the old task form.
- **Every change is written at once and names only its own fields** (`lib/detailsPatches.ts`), through the shared task actions, so cutsBelow, reminders, extra times, times done, the timer, the list and the emoji are never lost when the phone edits a task. A projected day of a repeating task edits its series (as on the desktop); its date moves only that day (stored first). Changing the first time of a task with several times keeps the others (the times rules; an overlap is refused with a note).
- **Shared code:** the desktop's `components/desktop/taskOps.ts` moved to `lib/taskOps.ts` (the old path re-exports it, so the desktop is unchanged); `labels.ts` is used by the phone now (its colour fill is idempotent, tested). The quick menu can show a colour dot and a tick.
- **Tests:** `detailsPatches.test.ts` (5: every edit keeps the Part B and C fields and the timer; clearing the date clears the time; the times rules; the sync sends the kept fields when the server has the columns and never otherwise; the label colour fill is idempotent); real touch check `phone-p6.js` (23). Changed on purpose: `phone-p4.js` and `phone-p5.js` now expect the details (not the old form) and `phone-p4.js` waits for Today's data; the touch harness retries finding an element for up to 4 seconds.

---

## 2.53.0 — 2026-10-22 (iPhone catch-up P5: Tasks with the list switcher and Repeating)

**iPhone. JavaScript only. The desktop is unchanged.**
- **The Tasks tab is the desktop's left pane for a finger:** a list switcher at the top (Brain Dump with its count, every list with its emoji and count, Repeating, New list; it scrolls sideways), an add row, then every task of the chosen list. A named list keeps its dated tasks (the desktop's rule, `thoughts.ts`); Brain Dump shows the tasks with no day and no list and the old phone Brain Dump items (which become tasks when opened, as on the desktop). "Done today, N" under the list.
- **Swipe a row right** to mark it done (with Undo); **swipe left** for Tomorrow and Delete (a repeating task offers Skip instead). Tap opens the task; press and hold for Edit, Duplicate, Move to list, Delete. Every swipe is also a screen reader action.
- **Lists:** press and hold a list to edit its name and emoji or delete it (`components/phone/ListSheet.tsx`, the shared createList, editList and removeList: same name rules, same key, tasks stay).
- **Repeating replaces the old Quests tab:** each repeating task with what is due, its streak small, tick, Skip and Today (the shared `quests.ts` and `questActions.ts`). Routines not yet converted are listed under it and tick as before.
- **Show streaks, on this iPhone:** a new Settings section "On this iPhone" with a per phone "Show streaks" switch (default on, never synced; `components/phone/prefs.ts`).
- **iOS marker gate:** `Show streaks` removed on purpose (P5). `seriesStreak` stays a marker: the phone's streaks come from `quests.ts` as before, so the plan's second removal was not needed.
- **Touch fixes found by the checks:** a row drawn before its data loaded never got its press and hold (gesture handler does not take a change of gesture shape on a mounted detector: the detector is now remounted); a sheet opened by a hold no longer closes on the lifting finger (`useSettled`, shared by the menu, the list sheet and the quick add).
- **Tests:** real touch check `phone-p5.js` (26). The touch harness now holds the page at 390 px (a non mobile viewport; the mobile one zoomed out while the page was still wide) and waits for the tab bar. Changed on purpose: `phone-p2.js` now drives the Tasks rows (the Brain Dump tab went in P3) and `phone-p3.js` the list switcher (the interim All went in P5); `iosMarkers.test.ts` lists the P5 removal.

---

## 2.52.0 — 2026-10-22 (iPhone catch-up P4: Today)

**iPhone. JavaScript only. The desktop is unchanged.**
- **Today is only today:** timed tasks in time order under Planned, tasks with no time under Anytime (top priority first), a small Now and Next line under the date. Repeating tasks show their day for today exactly as the desktop's Timebox reads it; a task with several times a day is one row per time. Rules: `lib/todayView.ts` (pure).
- **A tick** takes the row away with an Undo message for 5 seconds (`components/phone/UndoBar.tsx`); "Done today, N" at the bottom shows them again. A projected repeating day is stored by its tick, as on the desktop.
- **A tap opens the row in place:** notes, steps (each ticks; the last one completes the task, the shared rule), label with its colour dot, list, time and length, and Edit (the old task form until P6). **Press and hold:** Edit, Duplicate, Move to list (Brain Dump or a list), Delete; a repeating task offers Skip this day and Delete repeating task instead of Delete. The actions: `lib/phoneActions.ts` (seriesActions, taskActions, taskCommands, the desktop's paths).
- **Routines until the iOS catch-up:** a routine not yet converted is a row at the top of Anytime (Morning, Afternoon, Evening order) and ticks a routine completion for today exactly as before; a routine whose series `rt_<id>` exists is shown once, as the repeating task. Nothing was converted.
- **Old events (decision 4)** are grey rows among the timed ones; your own events still open their edit form with a tap.
- **Changed on purpose:** ticking a dated repeating task on the phone no longer stores the next day (the phone now shows the next days like the desktop does, decision 023); an undated one still gets its next dated copy. The old Today's Routines, Top 3, breakdown and Full schedule sections are replaced by this list; a new routine can no longer be added (repeating tasks replace them).
- **Tests:** `todayView.test.ts` (6); real touch check `phone-p4.js` (26).

---

## 2.51.0 — 2026-10-22 (iPhone catch-up P3: three tabs, the round +, Settings behind the avatar)

**iPhone. JavaScript only. The desktop is unchanged.**
- **Three tabs:** Today, Calendar, Tasks (`app/(tabs)/_layout.tsx`, the new tokens and Inter). The Brain Dump and Quests tabs are gone; their screens live inside Tasks for now (Brain Dump, All, Repeating), so nothing is lost before P5 replaces them. The old screens moved to `components/legacy/` (`BrainDumpScreen`, `TaskListScreen`, `QuestsScreen`).
- **Settings behind the profile avatar** top right on every tab (no Settings tab; the gear is gone).
- **The round + on every tab** opens the quick add (`components/phone/QuickAdd.tsx`): Today adds for today, Calendar for the chosen day, Tasks to Brain Dump. One title and Add; Cancel is one tap. The task is written by the shared `createTaskIn`. New phone pieces: `components/phone/chrome.tsx` (`ScreenHeader`, `AddButton`, `Segmented`).
- **Changed on purpose:** the + used to add an event on Today and the Calendar; it now adds a task (old events stay and are still edited by tapping them, decision 4).
- **Tests:** real touch check `phone-p3.js` (14) at 390 x 844; `iosMarkers.test.ts` reads the moved files at their new paths.

---

## 2.50.0 — 2026-10-22 (iPhone catch-up P2: the touch kit)

**iPhone. Needs a new EAS build to try on a phone (new native module `expo-haptics`). The desktop is unchanged.**
- **Touch rules in one place:** `lib/touchRules.ts` (pure): a tap is a still touch (under 10 pt of drift) that lifts within 250 ms; press and hold is a still touch of 400 ms; a swipe on a row commits past 35% of its width; a sideways page change needs a clearly sideways move (used in P9).
- **`components/phone/touch.tsx`:** `PressRow` (gesture handler Tap and LongPress, exclusive: a moving finger fails both, so a scroll never opens anything; the hold gives a selection haptic), `SwipeRow` (gesture handler's Swipeable with React Native's own Animated, no Reanimated: swipe right commits the row's main action, swipe left reveals its buttons), `haptic()`, `useReducedMotion()`. Every gesture is also a screen reader action.
- **`components/phone/menu.tsx`:** the quick menu (a sheet from the bottom, large rows, Cancel). Presses in the first 350 ms after it opens are ignored: the finger that held the row lifts over the menu, and that is not a choice.
- **Brain Dump cards use the kit** (until P5 moves Brain Dump into Tasks): tap edits, hold opens Edit and Delete, swipe left shows Delete.
- **New: the phone touch harness** `desktop/test/real/phone-common.js`: the real app's page emulated at 390 x 844 (Chrome DevTools Protocol) with real touch events (touch start, timed small moves, touch end). First check `phone-p2.js` (14): tap opens, a 160 px and a 25 px move open nothing and the list scrolls, a slow lift opens nothing, a 480 ms hold opens the menu, Cancel closes it, a swipe left shows Delete and Delete deletes.
- **Tests:** `touchRules.test.ts` (4).

---

## 2.49.0 — 2026-10-22 (iPhone catch-up P1: the phone's theme, fonts and small pieces)

**iPhone groundwork. Nothing on screen changes yet; the desktop is unchanged.** Plan: `docs/PLAN_phone.md`.
- **Theme:** `components/phone/theme.tsx` (`PhoneThemeProvider`, `useTheme`, `useStyles`): the desktop's light and dark tokens (`lib/tokens.ts`), Light by default, Dark and Match system stored per phone (`belific_phone_theme_mode`, never synced). The setting is shown in P11. The status bar follows the theme.
- **Fonts:** Inter, Newsreader and Roboto Mono as `.ttf` in `mobile/assets/fonts`, unpacked from the desktop's own `.woff2` files (same fonts, same versions; iOS cannot read woff2). Loaded at launch on the iPhone only (`phoneFonts.native.ts`); the web export keeps the desktop's @font-face rules, so the desktop bundle does not grow. `components/phone/type.ts` names a font per weight (iOS picks a custom font by name).
- **Phone kit:** `components/phone/ui.tsx`: card, divider, pill, label dot, round tick, line icon, outlined and primary buttons, icon button, section header; 44 pt targets, the radius scale, 1px outlines. The done tick is the accent with the onAccent tick (the desktop's green on pale green is under 3:1 on dark).
- **Old screens keep `phoneColors`** (lib/theme.ts) until P11; new phone files may not import it (test).
- **iOS marker gate:** `Match system` removed on purpose (P1): the phone's theme store imports `lib/themeMode.ts`. A per device setting, no data risk. `installTheme` and `setThemeMode` stay markers.
- **Tests:** `phoneTheme.test.ts` (3: fonts are TrueType copies of the desktop families with licences; kit text 4.5:1 in both themes; phone files never import the old palette or desktop code); `iosMarkers.test.ts` lists the PLAN_phone removals by phase.

---

## 2.48.0 — 2026-10-22 (edit a list: its name and emoji)

**Desktop only. No database change, no migration.**
- **A pencil on each list row** in the lists dropdown (Lists, Proload and so on; none on Brain Dump, which is not a stored list) opens an edit box in the same popover: a name field, the emoji chooser, Save and Cancel. **Delete list moved into the box**, with the same "Delete this list? Its N waiting tasks go back to Brain Dump." confirmation and rules. The old "This list" section under the lists (rename on blur, emoji, delete) is gone.
- **Save changes the same list:** `editedList` (`lib/lists.ts`, pure) keeps the key, the order and createdAt, so every task, its history and the calendar blocks follow; `editList` (`taskCommands.ts`) writes it once through `putList`, so `updatedAt` moves and one upsert is queued in the outbox like any list edit. The name follows the new list rule (empty, over 40 characters, "Brain Dump" and another list's name are refused with the same sentences; the list's own name in other letters is fine). Nothing is stored before Save; Cancel changes nothing.
- **Style:** the box uses the new tokens (outlined Cancel, accent Save, danger Delete), checked in light and dark.
- **Tests:** `listEdit.test.ts` (4: key and tasks kept, emoji cleared, duplicate rule, one outbox upsert), a sync test in `syncEngine.test.ts` (the other device gets the new name and emoji under the same key, its tasks stay); new real check `p25.js` (29): pencils, the box, the duplicate refusal, Cancel, a new name and emoji, the stored list, the dropdown, the left pane, a Timebox block and a Calendar block, Delete list inside the box, dark. `p2.js` now opens the box before Delete list (changed on purpose). Screenshots in `docs/screens-2.48/`.

---

## 2.47.0 — 2026-10-22 (small Calendar and Timebox blocks no longer overlap their own text)

**Desktop only. Look and behaviour only. No data, database or sync change.**
- **Three tiers by block height** (`lib/blockLayout.ts`, one pure function `blockPlan`): under 36px (15, 20 and 30 minutes) one line, the title with an ellipsis and the length on the right only if it fits, plus the priority mark; 36 to 55px (45 minutes) the title on line 1 and the time and length ("left" on a later piece) on line 2, with the repeat icon and the list emoji only if they fit; 56px and up (60 minutes and more) the layout as before, the Calendar still wraps the whole title there.
- **Width takes parts away in a fixed order:** list emoji, repeat icon, "left" text, time, priority mark last. The title never drops. Every text is one line with an ellipsis, `min-width: 0` on the flex children and `overflow: hidden` on the lines and the block, so nothing paints outside the block or over another element.
- **The hover tooltip** (title, time, length, Repeats, the cut note) is now on every block under 56px in the Timebox too (before, only the Calendar had it).
- **Changed on purpose:** a short Calendar block's title is now one line with an ellipsis (before, 2.28.0 let it run over the line); the tooltip carries the whole title. Real check `p12.js` A3 was reworded to match.
- **Tests:** `blockLayout.test.ts` (4); new real check `p24.js` (146 checks): 15, 20, 30, 45, 60 and 90 minute blocks plus three narrow side by side blocks, in light and dark, on the Calendar's day view and the Timebox; no two text boxes in a block intersect, nothing is painted or cut outside the block, the tooltip holds the whole title. It fails 15 of 146 on the 2.46.0 block. Screenshots in `docs/screens-2.47/`.

---

## 2.46.0 — 2026-10-21 (Ellie Planner look, step 8 of 8: the tokens, exported for Landis and Proload)

**No app change. Files and documents only.**
- **`design-tokens/`:** `tokens.json` (every token as data), `tokens.css` (the `--ds-*` variables: light by default, dark by `data-theme`, one accent per app by `data-accent`), `tailwind-preset.js` and a README. They are generated from `mobile/lib/tokens.ts` by `node scripts/export-tokens.mjs` (run in `mobile/`); `designTokens.test.ts` (5) fails if they are out of date and checks the preset loads and every app accent is readable (text on its fill and as text, 4.5:1; Proload's orange and Landis' dark indigo take near black text on the fill).
- **`docs/DESIGN_SYSTEM.md`:** the rulebook (decisions, tokens, components, label colours on both themes, the rules, how Landis and Proload use it). Decision `033-ellie-planner-restyle.md` records the choices. The design-identity skill points to them (the palette it lists is what the iPhone keeps).
- **iOS marker gate:** `installTheme`, `setThemeMode` and `Match system` added on purpose (the theme store and the setting are desktop only; the tokens and `Colors` are in the phone bundle as its own palette and are not markers).

---

## 2.45.0 — 2026-10-21 (Ellie Planner look, step 7 of 8: Settings and every remaining screen)

**Desktop only. Look only.**
- **Every screen** (Settings, Progress, Analytics, Trash, Labels, Quests, Daily Planning, Sign in, the shortcut help, quick capture, search, the Missed list, the Calendar month) now uses the same pieces and tokens. New real check `p23.js` opens each of them in light and in dark, saves a screenshot, and checks in code that nothing is left in the old style: no radius outside the scale (4, 6, 8, 10, 16, round) and every line of text at least 4.5:1 on its real background (translucent layers included).
- **One radius scale everywhere:** the 14, 12, 18, 20, 9, 7, 5 and 3 px corners left over from the old look (62 places) are now on the scale; round things stay round.
- **Thin line icons instead of interface emoji:** the headings and section titles (Settings, Analytics, Quests, Trash, Progress, Labels, Missed, Timebox, Daily Planning's columns, quick capture, the shortcut help groups), the profile menu rows, the Settings feature switches and several buttons. The person's own emoji (a list, a label, a task) stay emoji, and so do the friendly empty-state lines and the markers on imported calendar events. Screen reader names are unchanged.
- **Analytics charts on dark:** the chart colours are theme tokens (a brighter pair on dark) and a label's colour in a chart is lightened to stay 3:1 on the dark surface.
- **Dark label colours a little deeper:** a label's dark tint keeps 4.5:1 for the secondary text even under a duration chip (the chip is softer on dark too).
- **CSS variables renamed** `--b-*` to `--ds-*`, the name design-tokens/ uses, so Landis and Proload read the same names.
- Real checks changed on purpose, each only because an emoji became a line icon: `p7.js` (the Settings sections and the Progress heading carry a line icon), `p8.js` (the Calendars section), `p3.js` ("Quick capture to Today", no emoji in front of Today). Full real regression re-run: all pass except `run-cp8b`, which failed twice in a row once (a label dropdown check, then its relaunch) and then passed 58 of 58 twice on a rerun with no change; not explained, recorded as a flake to watch.

---

## 2.44.0 — 2026-10-21 (Ellie Planner look, step 6 of 8: the Calendar and the Timebox)

**Desktop only. Look only.**
- **The current time** is a thin red line with a small red triangle at its start, on the Calendar, the Timebox and the Daily Planning preview (red is only ever used for the time).
- **Event blocks** have small 4px corners (were 8) and a 1px inset outline instead of a shadow; all-day chips are 4px too. A label's colour still comes from the label and stays readable in both themes (`p22.js` checks every block).
- **Hour labels** are tiny (10px, grey); the grid lines stay thin and low contrast; the sticky day headers and the hour gutter take the pane colour so the grid is one surface.
- **Not done:** the study's mini checkbox on an event block. Belific has no tick on a block on purpose (2.37.0: a block shows its time's state; ticking is on the card and in the details).
- Found by this step's re-run of the older real checks and fixed (deliberate changes of the earlier steps, none of them a regression): `p9.js` "its title is 23 px" now expects 20 px (the study's modal title); `p11.js` "the whole modal is short (under 640 px)" now under 680 (the study's paddings and the two dividers add about 40 px) and "a card has no lines separating its parts" now looks only INSIDE the card (the card itself has its 1px outline since 2.42.0). In the modal the priority row's mark is again the row's first element (it carries the tooltip, as `p12.js` expects) and the Split sentence is a 11px hint so it keeps its compact row.
- `p22.js` +3 (4px blocks, the red time line, 10px hour labels). Re-run and passing: p9, p11, p12, p14, p16, p17, p20, cp8d, cp8h.

---

## 2.43.0 — 2026-10-21 (Ellie Planner look, step 5 of 8: the task modal and the popovers)

**Desktop only. Look and feel; one small control added (see the last bullet).**
- **Task modal:** the study's layout: a title row (round tick, 20px bold title, the three-dot menu, close), property rows each with a thin line icon, a grey bold label and the value (the hints stay in grey brackets), thin dividers before Notes and Subtasks, header padding 20px 35px 5px and body 0 35px 30px, 16px corners and a 1px outline. The priority row still shows only its mark with its tooltip. The emoji that stood in front of the rows are line icons.
- **Popovers:** 10px corners with a 1px outline; rows are inset and rounded (6px) with a lighter hover; a tick on the chosen row; the search fields (labels, the filter) have a magnifier in front; the label popover keeps New label, Edit labels and Remove label as its footer, set off by a divider.
- **Date popover:** Today, Tomorrow and Next week (the Monday after today) with an icon and the weekday and date on the right in grey, then a month grid (Monday first, nothing before today can be chosen, the chosen day is a filled rounded square), then Remove day. The old plain date field inside it is gone (it was only a browser field).
- **One small control added:** the popover above was written in 2.26 but not shown anywhere any more; it now opens from a small chevron beside the date in the modal's Task date row ("Pick a date"). The date field itself, the time field and every other control are unchanged; skip it if you do not want it.
- Real check `p22.js` +4 (the date popover, the label popover and the list picker, in both themes, with screenshots). Re-run and passing: p4, p5, p6, p10, p13 to p21, cp8f, cp9.

---

## 2.42.0 — 2026-10-21 (Ellie Planner look, step 4 of 8: day columns and task cards)

**Desktop only. Look only.**
- **Day header:** a bold weekday, the date in grey, and a small Today pill (a soft accent fill); Away is a small grey pill.
- **Add a task row:** a bordered 10px row on the raised surface with a circle-plus line icon, a tag line icon, and the day's total as a pill on the right.
- **Task card:** flat and raised: a 1px outline instead of a shadow, 10px corners (was 12), padding 11 x 12, 10px between cards. Hover only changes the outline's colour (nothing moves). The label is a coloured dot and its name (no filled chip). A done task keeps its round green tick, a grey struck title and a dimmed duration pill.
- The three panes (Brain Dump, the centre, the Timebox) are the pane colour with a 1px outline instead of a shadow, so cards are one step brighter than the pane in both themes.
- Real checks changed on purpose: `p9.js` "cards: 12 px corners, a light shadow, no hairline" now expects 10px corners, a 1px outline and no shadow (padding still 11 x 12). `p22.js` +16 (card, header, Add a task, label in both themes). p9, cp8c and cp8e re-run and pass.

---

## 2.41.0 — 2026-10-21 (Ellie Planner look, step 3 of 8: the shared pieces)

**Desktop only. Look only; every control does what it did.**
- **One shared kit** (`components/desktop/ui.tsx`): outlined small buttons, the segmented toggle, pills, the round checkbox and the line icon style, so every screen draws them the same way.
- **Top bar:** the Calendar / Tasks toggle is a bordered segmented control (the active segment filled with the accent) with thin line icons instead of emoji; Only today, Quests, Today, Filter and Back are outlined small buttons (1px outline, 8px corners, a quiet fill on hover); the Earlier button and the Day / Week / Month toggle follow. Emoji that were interface icons in the top bar are now line icons.
- **Pills:** the duration or time on a card is a soft 6px pill; the Earlier count is a round count pill.
- **Round checkboxes** on cards, in the details (the task, its steps and its times), in the Missed list, Daily Planning and Quests; done is the success green on its dark green.
- Real check `p22.js` +8 (round checkbox, outlined buttons, segmented toggle, pill, in both themes). p3, p7 and cp8e re-run and pass.

---

## 2.40.0 — 2026-10-21 (Ellie Planner look, step 2 of 8: fonts)

**Desktop only. Look only.**
- **Newsreader** (a warm serif, SIL Open Font License) is bundled as local files (`mobile/assets/fonts/Newsreader-500/600/700.woff2`, Latin subset, licence beside them and in `THIRD_PARTY_NOTICES.md`), so the desktop app still works offline (the page allows only itself). It is used for the Belific name and the big page titles only: Settings, Analytics, Progress, Quests, Trash, Labels, Sign in, Daily Planning, the account choice. Everything else stays Inter (and Roboto Mono for figures); a task title is never serif.
- The iPhone is unchanged: the font files are only imported by the desktop entry. iOS export and the marker gate pass (38 markers, 0 hits).
- Real check `p22.js` +3 (the name is Newsreader, both families load from the app files, the interface is Inter).

---

## 2.39.0 — 2026-10-21 (Ellie Planner look, step 1 of 8: tokens, themes and the Theme setting)

**Desktop only. Look and feel only: no behaviour change, no schema change, no backup, no migration.**
- **One token source:** `mobile/lib/tokens.ts` holds the colours (Option B light, Option A dark from `docs/DESIGN_TARGET.md`), the radius scale (4, 6, 8, 10, 16, full), the spacing, the fonts and the per app accents. `Colors.x` (`lib/theme.ts`) is now a CSS variable reference on the desktop (`var(--b-text-primary)`), so one change of theme repaints the whole screen at once with no re-render; on the phone and in `node --test` it is still the plain hex the phone shipped with (the phone's look is unchanged).
- **Theme setting (Settings, Appearance):** Light (the default: cream and sage), Dark, or Match system. Kept per computer in the main process settings (`theme`, never synced), cached in the page so the right theme is painted before the first frame.
- **No hard-coded colours left in the desktop components:** scrims, shadows, hover fills, the plain block colour, chips on a tinted card and the break grey are tokens. The label colour wheel and the rainbow swatch are the palette itself and keep their literal colours.
- **Label colours stay readable on both themes:** light keeps every tint it had; on dark a label's block or card is the colour mixed into the dark surface, as strong as the dark secondary text (#A7A7A7) allows at 4.5:1 (`darkTint`, tested for all 32 label colours). Vibrant task colours (white text, 6:1) are unchanged.
- Text with no colour of its own (an emoji, the priority mark) now takes the theme's text colour instead of the browser's black.
- Tests: `tokens.test.ts` (9: contrast of both themes, every label colour on both, the theme mode), settings +1, real check `p22.js` (27: light by default, Dark chosen in Settings repaints at once and is saved, Match system, text readable on every block and a card in both themes, Vibrant in dark) with screenshots of the Calendar Week, Tasks, the task details and Settings in each theme.
- Also fixed: the two migration 004 header tests (`partB.test.ts`, `partC.test.ts`) still expected "NOT APPLIED" after the docs commit `9dbe42b`; they now expect APPLIED (commit `dd0bba3`).

---

## 2.38.1 — 2026-10-21 (the on-block "move to the next free slot" button removed)

**Desktop only. Display only. No schema change.**
- **Removed:** the small button on a late block of the Calendar and the Timebox (a pill like "→ 14:30" at the bottom right of a tall block, a round "→" at the end of the time line of a short one). It sat on the block's time text and cut it off. It showed on every late block (placed, not done, its time passed), not only on hover. A late block still fades; sizes, positions and the split layout are unchanged.
- **What is lost:** the one-press "move this late task to the next free slot today (or tomorrow)". It existed only as this button. Moving a late block is still done by dragging it, the arrow keys on it (30 minutes later, a day before or after), or the details; the Missed list and the day menu are unrelated and untouched. `lib/lateActions.ts` and `lib/lateTasks.ts` (`lateMove`) stay, now unused by the screen.
- Real check `p10.js` section 7 now checks that a late block is faded and has no button on it, and that nothing moves by itself.

---

## 2.38.0 — 2026-10-21 (Part C, P5: reminders at every time of a task)

**Desktop only. No schema change. The phone gets no reminders for these times before its catch-up release (it only shows the task once, at its first time).**
- **A reminder list applies to each time:** a task with several times a day sends one entry per time that is still to do, so each time has its own toasts (a list of "At start time" and "5 minutes before" gives four toasts for two times). A time that is already ticked, or has passed, sends none; a completed task sends none. The first time keeps the timer keys it always had; later times add their time to the key (`task:id#14:00`, `task:id#14:00@5`) so they never collide and a re-send never repeats a toast. Shown days of a repeating task send every time too.
- **Wording:** the Reminder row in the details says "…, for each time" when the task has several times, and its menu has a line "For each time: every time of the day that is not done gets these reminders." One list per task, not one per time.
- Tests: scheduler +3 (a fake clock: each time its own timers and keys, a re-send and a moved time, a junk slot), payload +4, real check `p21.js` (9, real timers: one toast at each time, none for a ticked one, one for a task with one time).
- Not changed: reminders still only work while Belific is running (the tray keeps it running when the window is closed); a reminder missed while it was quit is not shown late. Not added to the iOS marker gate: the wording lives in the shared `lib/times.ts`.

---

## 2.37.0 — 2026-10-21 (Part C, P4: a block for every time on the Calendar and the Timebox)

**Desktop only. No schema change in this release (the fields sync through the unapplied migration 004).**
- **One block per time:** a task with several times is drawn at each of them on the Calendar (day, week) and the Timebox, same length, same colour. The first time keeps the task's own block id; the others add `@HH:mm` (for example `brk@15:00`). A time on a shown day of a repeating task appears on every day of the series, and each time of an overnight task that runs past midnight continues at the top of the next day on its own.
- **Split per time:** a break with two times splits the task it overlaps twice, on its own at each time, into three full width pieces (the drawing in `docs/PLAN_part_b.md`, now twice in a day). Each time is judged alone: a refused one says why on its block and does not stop the other cutting.
- **Ticks per time:** a block whose time is done is drawn done (title struck through; "done" on a block tall enough); the other times of the task are not. Ticking is in the details (P3) and on the card (every time).
- **Drag one time:** dragging a block moves only its time and its tick, on its own day (30 minute steps as before); dropping it on a time that is already there, or too close, is refused with a note at the bottom of the screen and nothing changes. Dropping a block on another day moves the whole task there, every time by the same amount (refused if a time would leave the day); dropping it on a day card or the left list takes the task off the grid, all its times with it, as for a block of one time. On a shown day of a repeating task only the time changes, for the series. The arrow keys on a block move that time by 30 minutes; the day arrows move the task.
- **Resize:** a block's bottom edge changes the length of every time (all blocks follow); refused with a note if two of the task's times would then overlap. A block of a task with several times offers no "move to the next free slot" (there is no single time to move); it still fades when its time has passed.
- **Found and fixed on the way (since 2.31.0):** the Calendar's planned total (the "0:00 / 8:40" by the day or week) counted a task that a break splits twice (once as itself, once as its first piece). It now counts it once.
- Tests: `timeBlocks.test.ts` (9), real check `p20.js` (17).
- Desktop only names added to the iOS marker gate on purpose: `multiDropPatch`, `resizeRefusal`.

---

## 2.36.0 — 2026-10-21 (Part C, P3: one task at several times in a day)

**Desktop only. The two new fields sync through the unapplied migration 004 (NOT APPLIED: until Jethro applies it they stay on the computer). The phone shows the task once, at its first time.**
- **Details panel:** the Time row has a quiet "+ Add another time" link (one control, no wizard). It adds the end of the last time rounded up to the half hour (11:00 for 20 minutes gives 11:30), which you then change. With two or more times the row lists each one with a tick box, a time field and a small ×; removing the first time promotes the next; removing the last two leaves an ordinary task. A change that cannot work says why in a line under the row ("11:10am would start before the 11:00am one ends (20 min each)"): a task's own times may not overlap, there is a maximum of 7 times a day, and a time that is already there is refused.
- **Completion per time:** ticking one time leaves the others; ticking the last open one completes the task; unticking any time of a completed task reopens it with the others still done. `completed` true always means every time is done, so a tick on the phone completes all of them. Ticking the card ticks every time (and unticking clears them all). Moving a time keeps its tick; removing one drops its tick (and completes the task when every remaining time is done); adding one to a completed task reopens it.
- **Repeating tasks:** the other times are a series field (edited on any shown day, copied onto every shown day); what was ticked is not (every day starts undone). Ticking one time on a shown day stores only that day. Skipping a day skips all its times.
- **Card and totals:** the card's time chip lists the times ("11:00, 15:00 ✓", the done one with a tick, and an accessible name "Starts 11:00, 15:00 (done)"); the day's planned time counts every time (20 min at two times is 0:40; the "still to plan" total counts only the times not ticked).
- **Not yet in this release (P4):** the Calendar and Timebox still draw one block, at the first time.
- Tests: `times.test.ts` (12), `series.test.ts` +2, real check `p19.js` (18). The calendar feed (not deployed) still lists the task once, at its first time.
- Desktop only name added to the iOS marker gate on purpose: "Add another time". `lib/times.ts` and `tickTimeProjected` are not markers (the shared `taskActions.ts` and `seriesActions.ts` are in the phone bundle).

---

## 2.35.0 — 2026-10-21 (Part C, P2: sync safety for extra times)

**Nothing visible. Data and sync only; desktop and shared sync code. The migration is amended but NOT APPLIED. No Supabase command was run, nothing deployed.**
- **`004_part_b.sql` amended (it was still unapplied):** two more nullable columns on `belific.tasks`: `extra_times jsonb` (the other times of the day a task happens, `HH:mm`, at most 6) and `times_done jsonb` (the times ticked on that row's day). Additive only: no default, no backfill, no constraint. The header still says NOT APPLIED. DO NOT RUN; the commented rollback now drops all four columns; the README row and post-apply checks are updated. One file means one review, one backup and one apply for Jethro.
- **Two new task fields** `extraTimes` and `timesDone` (types, sanitisers, mappers). `startTime` stays the earliest time; the extras are valid `HH:mm`, distinct, ascending, at most 6 (7 ticked); an empty or unreadable list is NULL.
- **Independent switch:** the probe checks the two Part C columns on their own (`Caps.partC`), so Part B and Part C switch on independently, in either order. Until the columns exist nothing sends them and a pull keeps the local values; when they first appear every task holding values is queued once.
- **Older clients (iPhone 2.18.1, desktops before this):** they never name the new columns, so an upsert from them leaves the values alone; a row they create simply has none (one time, nothing ticked); a tick on the phone completes the task (`completed` true means every time is done).
- Tests: `partC.test.ts` (7), schema probe +1, sync engine +4 against the in process fake server that rejects unknown columns (columns absent, columns appear, an older client editing the same rows, B and C in either order); the `syncCore`/`partB`/`schemaProfile` expectations extended on purpose. The vendored `types.ts` of the (undeployed) calendar feed function was re-copied by `node scripts/vendor-feed.js`.

---

## 2.34.1 — 2026-10-21 (Part C, P1: the timer can be started on any task at any time)

**Desktop only. No schema change, no new synced field, nothing for the phone.**
- **Bug: the timer could not be started on a day of a repeating task that is only shown** (for example today's Boot Camp). Cause: those days are drawn from the series, not stored, and the timer looks for a stored task. The menus and the shortcut hid or refused it for those days, and the details panel's "(Start timer)" found no task, got "missing" and did nothing, with no message (`timerUi.ts` ignored the outcome). It was never about the start time having passed. Fixed: starting a timer on such a day stores it first (the same step that ticking it uses, so it is stored once with the series' title, time, length and repeat), then starts the timer. The card menu, the block menu, the ⋮ menu, the details and `Ctrl+Shift+Enter` all work on those days; "Start a pomodoro" stays for stored tasks only.
- **A start that cannot happen now says so:** if the task is gone (deleted or skipped on another computer), a short note at the bottom of the screen reads "Could not start the timer: this task is no longer there (it may have been skipped or deleted)." and nothing is stored.
- **New: "Start from 11:00am" (menus and details):** when a task is planned for today and its time has already begun (less than 24 hours ago), you can start the timer counted from that scheduled time, so the time so far shows at once. Offered for each of today's times that has begun, most recent first, and never while the timer is running. One timer at a time and the 24 hour stale rule are unchanged.
- Tests: `timerSession.test.ts` +4 (start from a moment, the choices, other days, duplicates and the 24 hour cap), real check `p18.js` (17).
- Desktop only names added to the iOS marker gate on purpose: `startFromChoices`, `StartFromRows`, "Could not start the timer".

---

## 2.34.0 — 2026-10-20 (the List row of a repeating task, list emoji on blocks, readable Vibrant text)

**Display and logic only, desktop only. No schema change, no stored data changed, no new synced field.**
- **Bug: the List row showed "Brain Dump" for a day of a repeating task.** Cause: the days of a repeating task that are only *shown* (and the occurrence stored when you tick one) are built from the template by `occurrenceFromTemplate`, which copied the label, notes, length and so on but not the list. The stored task itself was right (your Boot Camp task has the right list); only its projected days lost it, so their details said Brain Dump, and an occurrence stored by ticking a day would have landed in Brain Dump. Fixed in `lib/series.ts`: the list is carried onto every occurrence, and `listKey` is now an edit-able template field, so changing the List on any day of the series changes the series like the other fields. Two tests failed first (`series.test.ts`), then passed. Existing stored rows were not touched (none of your repeating tasks had lost a list in storage: only the Boot Camp one has a list).
- **List emoji on blocks and cards:** on the time line, right after the duration ("9:30am 7h 🎓", and after "5h 10m left" on a later piece), on Calendar blocks (every piece of a split or continued block), all-day and month chips (after the title, there is no time line on a chip) and Timebox cards. A list with no emoji shows nothing; hover gives the list name; hidden on a block too short for its time line; never in a corner; sizes and positions unchanged; both normal and vibrant mode. Imported and custom events have no list and show nothing.
- **Vibrant text easier to read:** the title stays bold white; the time, duration, "continues" and "left" lines are medium weight (500) in the regular proportional font (the fixed width font is dropped in this mode) with a little more letter spacing and line height; a very subtle dark text shadow (`0 1px 1px rgba(0,0,0,0.28)`, no outline); the contrast bar for white text is now 6:1 (was 4.5:1) for every colour: the 20 palette colours, the 12 legacy colours, all 7560 colour wheel colours and the slate break block (now `#536070`, 6.41:1), darkening only as far as needed with saturation raised to at least 0.85. The white chip behind the ❗ stays. Lowest ratio found: 6.05:1. List cards are unchanged.
- Tests: `vibrant.test.ts` now enforces 6:1, `series.test.ts` +2, `lists.test.ts` +1, real check `p17.js` (32).

---

## 2.33.0 — 2026-10-20 (Split wording, Vibrant task colours)

**Display only, desktop only. No schema change, no new synced field, nothing for the phone.**
- **"Cut" is now "Split" everywhere you read it:** the details row is "Split" (tooltip and accessible name "Split") with the plain description "Splits the tasks it overlaps, so you still see them before and after it."; the note on a refused split reads "Not splitting …" and its badge "Not split: …"; Settings, Planning says "Smallest piece when a break splits a task". Internal names (`cutsBelow`, `planCuts`, `cuts.ts`, the column `cuts_below` in the unapplied `004_part_b.sql`) are unchanged. The old strings left the iOS marker list on purpose and the new visible strings joined it.
- **New setting "Vibrant task colours" (Settings, Appearance, off by default, takes effect at once):** Calendar blocks (day, week, every piece of a split or continued block), all-day and month chips and the Timebox cards use a more saturated version of the label colour (same hue) with bold white text for the title, time, duration, "continues" and "left" lines and the repeat icon. A colour too light for white text (yellow, lime and so on) is darkened only as far as needed so the ratio stays at least 4.5:1; the grey break block is a mid slate (`#5B6675`). The red ❗ is drawn on a small white rounded chip in this mode. Tooltips, sizes, positions and layout do not change; the task cards in the list are not changed; an unlabelled task keeps its plain white block (white text would not show on it); imported and custom events are not label coloured so they are unchanged. **Stored per computer** in the desktop settings (`vibrantColours`, like "Show streaks"), never synced, so no schema or synced field was needed.
- Tests: `vibrant.test.ts` (6: every one of the 20 palette colours, the 12 legacy colours, all 7560 colour wheel colours (hue 0 to 359 at 21 shades), the extremes and the break slate keep at least 4.5:1 with white; hue kept), settings tests, and the real check `p16.js` (45: wording, off by default and exactly as before, on in Timebox / Calendar week / day / month / all day / continued / priority chip / repeat icon, geometry and tooltips unchanged, off again identical).
- Desktop only names added to the iOS marker gate on purpose: `vibrantColor`, "Vibrant task colours", "Splits the tasks it overlaps, so you still see them before and after it.", "Smallest piece when a break splits a task" (the old "Cut tasks underneath" and "Smallest piece when a break cuts a task" markers were retired with the wording).

---

## 2.32.0 — 2026-10-20 (Part B, P5: several reminders per timed task)

**Desktop only. Nothing new in the database beyond P3's `tasks.reminders` (written, NOT APPLIED; until Jethro applies migration 004 the lists stay on the computer and the first reminder still syncs through the older `reminder_minutes`). The phone gets no extra reminders until the iPhone catch-up release.**
- **A list per task:** the Reminder row in the details (and its menu) now has switches for At start time, 5, 10, 15 and 30 minutes, 1 hour and 1 day before (up to five), plus **Default** and **None**; the menu stays open while you choose. Each time is its own toast ("Starts in 5 minutes", "Starts in 1 minute", "Starting now"). Choosing a list writes it into `reminders` and its first (smallest) time into the older `reminderMinutes` (-1 for none), so an older desktop still gets one reminder. Which list applies: the task's own list (empty = none), else the older single value, else the default list.
- **Default list:** Settings, Notifications, "Reminders for a timed task" (per computer, never synced; at the start unless changed; `defaultReminders` in the desktop settings). A reminder whose time has already passed is skipped on its own; the later ones stay. The grouped daily reminder leaves out untimed tasks that asked for none.
- **When Belific is closed (said plainly in Settings):** reminders only work while Belific is running. Closing the window keeps it in the system tray, so they keep arriving; Quit from the tray stops them until Belific starts again. Start with Windows already existed (opt in); Settings now offers a "Turn on Start with Windows" button next to that note and never turns it on by itself. A reminder missed while Belific was quit or the computer was asleep is not shown late (anything more than 5 minutes late is dropped).
- **Re-arming after sleep (found and fixed):** a timer does not count the time a computer sleeps, so a reminder due after a sleep could fire late. The scheduler now re-arms every timer from the real clock on wake (`Scheduler.refresh`, called by the resume event) and also every 30 seconds in case the wake event is missed or the clock is changed. Tested with a fake clock and in the real app (the clock moved forward while the timers did not run).
- **Wording:** "1 minute" (was "1 minutes"), "1 day".
- iOS marker gate: `effectiveReminders`, `setDefaultReminders`, "Reminders for a timed task", "Turn on Start with Windows" (desktop only); `reminders` itself is shared sync code, not a marker.
- Tests: 10 new scheduler tests, 4 reminder tests, 1 payload test; real check `p15.js` (31: scheduled times and wording, Settings, the details menu, toasts with the window in the tray, re-arming after a clock jump, Quit from the tray stopping everything).

---

## 2.31.0 — 2026-10-20 (Part B, P4: Split)

**Desktop only. No schema change here (the switch syncs through the P3 gate, `cuts_below`, once Jethro applies 004); the minimum piece length is a `user_settings` row (`planner.cut_min`), no new table.**
- **The switch:** a task has "Split" (details, after Repeats; off by default). A task with it on is a break: where it overlaps other timed tasks, those are drawn in pieces around it, **stacked at full width, never side by side** (Calendar Day, Week and the Timebox panel). Pieces: the first shows the title and "9:30am 7h"; the break is a full width box (grey with no label colour; its label colour otherwise); each later piece shows the same title, its start and "5h 10m left" (to the task's end). Heights and positions stay tied to real time.
- **Rules (`lib/cuts.ts`, derived each time, nothing stored, the host row is never changed):** only a break splits, never another break (two breaks overlapping stay side by side); a split is allowed only if every piece it leaves is at least the minimum (Settings, Planning: 15, 30 or 60 minutes, default 30, synced); a refused split (too small a leftover, or the break covers the whole task) falls back to side by side and the break says why ("Not split: 20 min piece (min 30)" on the block, the whole sentence in its tooltip, an ⓘ mark on a block too short for the badge); several breaks are judged one by one, earliest first; a break running past the end cuts only inside; overnight tasks cut on both days (the last piece ends at the true end and keeps "continues"; the next day cuts its continuation); every occurrence of a repeating task and break is cut on its own day. Moving, resizing or deleting a break (or switching it off) recomputes at once.
- **Pieces:** a press, a drag and the arrow keys act on the whole task; only the last piece has the resize handle and the late button; a short break or later piece also shows its start time on its one line.
- **Words:** the P1 no-split rule applies to all pieces.
- Desktop only names added to the iOS marker gate on purpose: `planCuts`, `refusalNote`, "Split", "Smallest piece when a break splits a task". The two synced fields are shared sync code, not markers.
- Tests: `cuts.test.ts` (20), real check `p14.js` (39: the drawing in Calendar and Timebox, three breaks, a refused split, overnight, a repeating pair, the switch, the setting).
- *(Wording renamed from "Cut" to "Split" in 2.33.0; internal names such as `cutsBelow`, `planCuts` and the column `cuts_below` are unchanged.)*

---

## 2.30.0 — 2026-10-20 (Part B, P3: sync for the cut switch and the reminder list; migration 004 written, NOT APPLIED)

**No screen changes. Nothing live changed: `004_part_b.sql` is written and NOT APPLIED; Jethro applies it after a backup and his go (never `db push`).**
- **New task fields:** `cutsBelow` (the task cuts the tasks it overlaps; absent = off) and `reminders` (minutes before the start, 0 to 1440, distinct, at most 5; an empty list = no reminder; absent = not set). Copied by a series projection, a next copy and Duplicate; editable on a series (`TEMPLATE_FIELDS`).
- **Sync gate (`Caps.partB`):** the probe asks for both `tasks.cuts_below` and `tasks.reminders`. Until both exist the two values are never named in an upload, a pull keeps the local values (`preserveFieldsFor`), and every other field syncs as before. When the probe first sees them, tasks holding a value are queued once (`hasPartBValues`). Automatic, no switch to flip.
- **Older builds (2.18.1 and before):** they never send the new columns, an upsert only changes the columns it names, so a newer desktop's values are not erased; a row they create has NULL (no cut, no list). Tested against the in process fake server, which now also refuses unknown columns while `partB` is absent.
- **`004_part_b.sql`** (header "NOT APPLIED. DO NOT RUN", additive only: `cuts_below boolean`, `reminders jsonb`, nullable, no default; the rollback is a commented section) and a README row. A test keeps it additive and commented.
- `kanban`-style vendored copies re-synced (`series.ts`, `recurrence.ts`, `types.ts`; local only, the feed function is not deployed).
- Tests: `partB.test.ts` (8), three new `syncEngine` scenarios (columns absent, columns appear, older client), a probe test. The probe expectations in `schemaProfile.test.ts` now include `partB`.

---

## 2.29.0 — 2026-10-20 (Part B, P2: top priority first)

**Desktop display only. No schema, sync or stored change; the only stored value involved is the existing `priority = 'high'`.**
- **Order:** among a day's tasks without a time, the top priority one is first (then oldest created, as before); in the left pane, undated top priority tasks come before the rest (then newest first); in the Calendar's all-day row the top priority chip is first. Timed tasks stay in time order, finished ones last.
- **Overlaps:** an overlapping block of a top priority task takes the first (leftmost) lane of its cluster and is drawn on top (`TimeboxItem.high`, `layoutItems`). Other lanes keep their order. Widths and heights are unchanged.
- The details text "Shown first, with a ❗ marker" is now true ("Shown first in its day").
- `kanban.ts` is vendored into the calendar feed function (not deployed), so its copy was re-synced (`node scripts/vendor-feed.js`, local only) and the priority check is inline there.
- Two unit tests that said "a High priority task no longer sorts (2.26.0)" now say the opposite, on purpose. Real check `p13.js` section P2.

---

## 2.28.2 — 2026-10-20 (Part B, P1: words are never split)

**Desktop display only. No schema, sync or stored change.** On the Calendar's blocks the title, the time line and the "continues" text now break lines at spaces only (`overflow-wrap` and `word-break` normal). A word wider than its lane is clipped at the block's edge, never split ("Leep Tal ent On line", "10:0 / 0am"), and the hover tooltip holds the whole text. Real check `p13.js` (P1): a Range over every word finds none spread over two lines in a three lane overlap, and in Day view.

---

## 2.28.1 — 2026-10-20 (display fix, Part A)

**Desktop display only. No schema, sync or stored change. Not committed.** The red ! (U+2757, "High priority" tooltip and aria-label) now also shows on every Calendar block (day and week), the all-day chips, the month chips, every piece of a "continues" block, and every Timebox card of a top priority task. It sits small beside the repeat icon, after the title, and never over it (`PriorityMark.tsx`). No outline or colour change, and no change to sizes, widths or how overlapping tasks sit. Imported and custom events have no priority and no mark. Real check `p12.js` section A5 (now 37 checks).

---

## 2.28.0 — 2026-10-20 (display batch, Part A)

**Four display changes, desktop only. No schema change, no new table, no sync change, no stored value changed. The phone is untouched. Not committed.**

- **A1. Opens on the Calendar, Week mode, every launch.** `launchPaneState` (`lib/paneState.ts`) sets the centre view to Calendar, the range to Week and "Only today" off after the remembered layout loads; pane widths stay remembered. Changing view or range during the session works as before.
- **A2. The top priority shows as a red exclamation mark (U+2757)** instead of "Must do" on cards, the Missed list, the details row and the ⋮ menu, with the aria-label and hover tooltip "High priority" (`MUST_DO_MARK`, `MUST_DO_TIP` in `lib/mustDo.ts`). The stored value stays `high`; the switch works as before.
- **A3. Calendar blocks show the whole title**, wrapped over as many lines as needed, with the time, duration and repeat icon in full. A block too short for it clips at the bottom (never an ellipsis) and its hover tooltip holds the whole text. Block height and position are unchanged. The Timebox panel keeps its one line blocks.
- **A4. The palette lock note.** The "Every computer runs Belific 2.27 or later" tick and its lock note show only until it is ticked; then one line, "Extra colours on". The notes wrap inside the picker and are never cut at the right edge.
- Tooltips use `components/desktop/tip.ts` (react-native-web drops a `title` prop). - **Fixed on the way:** the Calendar now stays mounted from launch, so its Filter menu and the Tasks board's both opened when Filter was pressed on Tasks (a ghost copy at the top left, which a visit to the Calendar and back could always cause). `Popover` now draws nothing for an anchor in a hidden pane and a hidden copy can no longer close the shown one.
- Older real checks (p2, p3, p4, p7, p9, p10, p11, cp8b to cp8h, cp9 to cp11) now start by pressing Show Tasks, since the app opens on the Calendar; p10 reads the ! mark and "High priority". Real check `p12.js` (25).

---

## 2.27.1 — 2026-10-19 (small fix batch)

**Five fixes asked for by Jethro, one commit each (plus a follow-up that resyncs the calendar feed's vendored `duration.ts`); the version moves to 2.27.1 in the last commit. No schema change, no new table, no sync change, nothing pushed or deployed. The Ellie screenshots were used for behaviour and layout only (no icon, logo, text or asset of theirs). Nothing here changes an iPhone screen.**

### 1. A compact details modal, no lines
- Every row is one 32 px line: the name on the left, the value on the right, tight even spacing, **no divider lines**. Same row order. Values read as text until used (borderless date, time and list fields; quiet Repeats, Reminder and Label); Remove time is a small ×; Notes and the subtask field have no boxes. The modal keeps its own scroll, so a short window cuts nothing off.

### 2. One time drop-down for every task length
- **`DurationSelect`**: a small button with the length as short text ("45 min", "1 h 30") that opens 5, 10, 15, 20, 30, 45 minutes, 1 to 4 hours in 15 minute steps, 5, 6 and 8 hours, then **Custom** (type 90, 1:30 or 1 h 30) and **Clear**. Enter, Space or Down opens it at the current value; Up and Down move; Enter chooses; Escape closes.
- Used for **Estimated time** and **Actual time** in the details (the timer stays beside Actual time), in the **Add a task box** (once you type; the new task gets it) and on the task rows of **Daily Planning and Shutdown** (a draft until Finish). Ctrl+E and Ctrl+B open the details with that drop-down open. Stored exactly as before (whole minutes in `durationMinutes` and `actualMinutes`).
- Fixed on the way: Escape in a drop-down inside Planning closed the whole flow; it now closes only the drop-down.

### 3. The list's emoji on every card
- A card shows its list's emoji, small, at the start of the meta line, before the label, which is now a **coloured chip** (dot, emoji and name). No list, or a list without an emoji: nothing. Tasks board, left pane, Timebox and Calendar blocks tall enough for a time line, and the details List row. Lists already stored and edited an emoji, so no new storage.

### 4. A label's colour is always there
- **Why it failed:** picking a colour did save once the picker was reached, but it was hard or impossible to reach: New label put its form under the list (below the fold of a 320 px menu), editing hid behind a hover-only pencil, the details Label row was a plain select, the Labels page Add and Enter on a typed name made a label with a colour picked for you, and the selected swatch was never announced. Before the tick, nine labels take all 8 original colours, so every swatch was dimmed with no word why.
- **One small form, `LabelForm`, with name, emoji and colour together** for creating and editing, in the task label menu (card, details, Add a task box) and on the Labels page. New label, Enter on a new name, Create "…" and a suggestion all open it. Editing works for every label, 2.26 colours included.
- The label menu lists each label with its colour dot, emoji and name and a pencil; New label, Edit labels, Remove label. The details Label row shows the label and opens that menu.
- The colour section is never hidden: before "Every computer runs Belific 2.27 or later" the 12 new colours and the wheel show a lock with the reason; when every allowed colour is taken it says so and nothing is pre-picked. Still no two labels with one colour.

### 5. One emoji picker everywhere
- **`EmojiPicker`**, used by every emoji field (tasks, labels, lists): a search box over names and keywords ("game" finds the controller), a recently used row, a tab per category, the system emoji font, fully usable from the keyboard.
- Data: **emojibase-data 17.0.0 (MIT)**, trimmed to Emoji 15.0 with no skin tones by `mobile/scripts/build-emoji-data.js` into `mobile/lib/emojiData.ts` (1,870 emoji, 94 KB source; the desktop bundle grows by about 117 KB, 36 KB gzipped). Bundled, no network calls, no dependency added.
- New **`THIRD_PARTY_NOTICES.md`** (emojibase-data, Inter, Roboto Mono, Electron), shipped in the Windows app's resources folder.

### Found by the final gates
- The details move focus to the title just after opening; a click in Notes (or a subtask) in that moment lost the keyboard to the title. The opening focus now leaves it where a click put it (present since 2.27.0).

Real check: new `desktop/test/real/p11.js` (one section per item, 79 checks). p2, p7, p9, p10, cp8b, cp8c, cp8f, cp8h and cp9 follow the new drop-down, label form and picker.

---

## 2.27.0 — 2026-10-18 (fix batch for the desktop redesign)

**Ten fixes asked for by Jethro after using 2.26.0, one commit each; the version in `mobile/app.json` moves to 2.27.0 in the last commit (as asked). No schema change, no new table, no sync change. The Ellie screenshots were used for behaviour and layout only (no icon, logo, text or asset of theirs). Nothing here changes an iPhone screen.**

### 1. The card, the Add a task box and the details modal
- **A click anywhere on a card opens the task details modal**, the same in every view: Tasks, the left list and every list, the Timebox, the Calendar (blocks, the all day row, month chips, "continues from yesterday" blocks). Only the tick box and the steps ring do something else. Enter on a focused card opens it too. A day of a repeating series that is only shown (not stored) opens as well: the modal edits the series and opening it writes nothing. A legacy phone Brain Dump item is converted to a task when opened (its first edit, as before).
- **The inline expand and collapse and the inline row of controls are gone** (and the Timebox block menu, `TaskBlockPopover.tsx`, is removed). The card face shows only the tick box, the emoji and title, the time (a placed task's start time, else the estimate), the label's colour and emoji, the steps ring with "1/2" when there are steps (no counter without steps), a small "Must do" marker, and, on today's card of a repeating task, the quiet run line of decision 007.
- **On hover at most three small icons**, top right, in the card's colour: 🏷️ Label first, ☀️ Move to today (not on today's tasks or a repeating day) and the ⋮ menu (Open details, Start or stop the timer, Start a pomodoro when on, Duplicate, Skip this day or Delete). The card never changes size on hover.
- **The steps ring** ticks the next open step; with all done it opens the details at the steps.
- **The details modal** now holds what left the card: the time of day beside the date (and Remove time), a Reminder row, and the steps (add with Enter, rename by clicking, delete). The card keys open it where they used to act: S, O and Ctrl+I open it, Ctrl+S at a new step, Ctrl+E at the estimate, Ctrl+B at the actual time. Ctrl+L still opens the card's label menu, Ctrl+Delete the ⋮ menu at "Delete?".
- **The Add a task box** (one component, `AddTaskBox.tsx`, on every day and in the left list) has the title, a time (on a day; it shows once you type) and the 🏷️ Label button, which is always there and sits inside the box. Enter adds the task with them.
- **Fix found on the way:** the Tasks strip sometimes opened five years back (October 2021) because the jump to today ran before the strip was laid out; it now tries again until it lands.
- Real checks: new `desktop/test/real/p10.js` (one section per item); p2, p3, p5, p7, p9, cp8b, cp8c, cp8d, cp8e, cp8f, cp8g, cp8h and cp11 moved from the inline controls to the modal (same typing and editing checks, now in the details).

### 2. Label colours
- **Twenty swatches: the original eight, unchanged (names, keys, colours), then twelve vibrant, well separated ones of our own:** Red `#E23B3B`, Orange `#F07A1A`, Yellow `#BF9100`, Lime `#6FA80F`, Green `#1F9E4E`, Teal `#0F9E8E`, Cyan `#0B97CF`, Blue `#2F6FEB`, Indigo `#4F46C8`, Purple `#A44BE0`, Magenta `#CC36B4`, Pink `#E8508E`, each with a light tint. Tested: both text colours stay AA on every tint, every edge is at least 2.5:1 on the surface, the twelve are at least 20 apart in CIE Lab (red, orange, yellow and pink at least 30).
- **The twelve muted 2.26 colours are no longer offered**; a label that has one keeps it and is drawn exactly as before (`LEGACY_COLORS`).
- **A labelled card now has a 3 px left edge in the label's strong colour** (the tints have to stay light for readable text, so the edge carries the colour on the board, as blocks already did on the Calendar and Timebox).
- **The colour wheel:** the last swatch opens a picker for any colour (hue, shade and a hex field, `ColorWheel.tsx`), stored as `#RRGGBB` in the existing label colour field (no schema change). Its card tint is worked out from it so text stays AA.
- **The tick is now "Every computer runs Belific 2.27 or later"** (a new local key, so a 2.26 tick does not count), and it unlocks the twelve and the wheel. An older Belific never breaks on a custom colour: 2.26 keeps a key it does not know and draws it neutral, the iPhone shows no label colours and passes the value through, and a desktop before 2.26 would change it back to one of the eight (the tick is there for that).
- A new label takes the first free colour; the vibrant ones only once the tick is on.
- Real checks: p9 step 5 and cp9 (the 20 swatches, the lock, the teal tint and edge, the new local key) and p10 section 2 (the order of the swatches, the tick, a wheel colour stored as hex and drawn on the card).

### 3. No two labels with the same colour
- **A colour another label already has is dimmed, carries a small white marker and says which label has it** ("Sage colour for the new label, used by Work"); it cannot be picked, in the label menu's New label form, on the Labels page or anywhere else the picker shows. Locked colours (no 2.27 tick yet) and taken colours are told apart.
- **The colour wheel refuses a colour too close to another label's** (CIE Lab distance under 12) and names it: "Too close to the colour of “Work”".
- **The storage rule refuses it too** (`setLabelColor` returns the message; creating a label with a taken colour takes the next free one), so no path can write a clash. A rule of this app only: the server does not check it.
- **Labels that already share a colour are left alone.** The Labels page shows a notice naming them ("Work and Home share a colour. Change one of them to tell them apart"), until one is changed.
- Real check: p10 section 3.

### 4. Lists never look empty
- **A named list keeps every task in it.** A task given a day (or a time) stays in its list and shows its day ("Tomorrow", "Wed 21 Oct") and, when placed, its time; it is on its day on the board as well. Unscheduled tasks come first, then the scheduled ones, earliest first; a repeating task shows once. The count beside the list's name counts them too.
- **Brain Dump keeps its rule**: a task with a day leaves it (it is the inbox of tasks with no day).
- Decision written in `docs/build-progress.md` (fix batch decision 13). Real check: p10 section 4.

### 5. The weekday on 18 October 2026
- **Checked: the maths is right.** The day header, the Today button and the strip all work in local time; Sunday 18 October 2026 (Europe/London, BST) shows as Sunday at every hour, and so does the day of the clock change a week later. New unit test `lib/weekday.test.ts` with fixed dates (it runs a child process with `TZ=Europe/London`).
- **Bug found and fixed:** the Timebox and the Calendar kept the day they were opened on. Belific lives in the tray for days, so after midnight they still showed yesterday instead of today. Now a view that was on today moves on to the new today at midnight, and a view moved to another day stays put; the Calendar week also keeps its first day (the strip is counted from today, so before this it slid by a day). The Tasks board already followed (it redraws every 30 seconds and jumps to today when the date changes).
- The October 2021 startup fix is in item 1.

### 6. The Missed list
- **What is missed:** a one off task with a day before today, not done and not deleted; and a day of a repeating task in the last 7 days that was due and is neither done nor skipped (stored or only ever shown). Worked out from the stored rows every time; nothing is stored for it and nothing moves by itself (no rollover on launch, as before).
- **🕓 Earlier in the left pane**, beside the list name, with a count badge (none when nothing is waiting); it opens the Missed panel. The button says "Earlier", not "Missed": the board never shows loss wording or a zero (the design identity rule that real check cp11 enforces), so the word stays inside the panel and the daily flows, which you open yourself. Missed tasks are never put in the day columns (a past task stays on its own past day, as before).
- **One off tasks:** Today, Tomorrow, Pick a day (today or later), Drop (the day and its time are cleared; the task stays in its list), and "Move all to today" when there are two or more. A time of day is kept when a task moves. Must do first, then the oldest day.
- **Repeating days are never moved:** Skip (the usual skip of that day, so the streak treats it as a skipped day: neutral) and Do it today (a one off task for today with the same name, emoji, label, estimate, notes and unticked steps, no repeat; that missed day is skipped at the same time, so it leaves the list).
- **Streak:** a day you skip, or do as a one off today, is a skipped day for the streak (neutral: the run is neither broken nor lengthened by it). Ticking the one off copy does not count as the series being done. A missed day left alone stays a day not done and ends the run, as before.
- **Daily Planning and Daily Shutdown use the same list and the same actions** (Planning step 1 "Here's what you missed"; Shutdown step 1 "From earlier days" when there are any), as draft edits written on Finish; Cancel writes nothing. Their rules are unchanged: Finish in Planning still brings the one off tasks you did not decide about to today, keeping their time; Shutdown still moves only today's chosen tasks to tomorrow. A skip chosen in a flow is held in the draft and written on Finish.
- Real checks: p10 section 6 (the badge, the order, every action, the series rules, Planning's draft); p5's step 1 check now expects a missed repeating day to be listed with Skip and Do it today and never offered a move.

### 7. Late timed tasks
- **A placed task whose time is over and that is not done is faded** (half opacity) in the Timebox and the Calendar, the same block in both. It turns late on its own (the panes redraw every 30 seconds); nothing moves by itself.
- **A small action on the block** (`→ 14:30` at the bottom right of a tall block; a plain `→` on a narrow or short one, so the block can still be picked up and dragged by its top) moves it to the next free half hour from now today where its estimate fits (30 minutes without one), around the tasks placed today (repeating days included) and your own events; when nothing fits before midnight it reads `→ Tomorrow` and moves it to tomorrow at the same time. Its full label says which ("Move to next free slot today (14:30)", "No free slot left today: move to tomorrow"). The slot is worked out again when pressed. Calendars subscribed by link are not counted as busy.
- **A repeating day is never late** (stored or only shown): its days are never moved. A late task of an earlier day is also in the Missed list.
- Real check: p10 section 7 (skipped before 00:16, when the seeded block is not late yet).

### 8. Away days
- **A day header menu** (⋯ beside each day's name on the Tasks board, today and later) has **Mark as away** (and Not away any more). Stored with existing storage only: one `user_settings` row per day, key `away.YYYY-MM-DD`, value `1` or `0` (a value, not a delete, because a delete wins on sync and the day could never be marked again). No schema change, no new table; it syncs to the other computer like any setting.
- **Marking a day that has unfinished one off tasks asks first:** move them all to the next free day, spread them one a day across the next free days (in the order the board shows them), or leave them. Away days are skipped when picking free days; each task keeps its time of day; done tasks and repeating days never move. A move can be undone straight after (the undo bar, 12 seconds).
- **Greyed** on the Tasks board (with a ✈️ Away tag) and in the Calendar (day and week headers and columns, month cells).
- **Adding a task to an away day warns** ("This is an away day. The task is added anyway.") and adds it.
- **Daily Planning shows it:** a line in the rail when today or tomorrow is away, and on the Tomorrow column.
- **An older Belific does not break:** 2.26 reads only the settings keys it knows (features, templates, panes, the calendar feed token) and keeps other rows as they are when it syncs; the iPhone does the same. They simply do not show away days.
- Real check: p10 section 8.

### 9. Must do
- **One Must do switch**, in two places only: the details modal (❗ Must do) and the card's ⋮ menu (a toggle row). Nowhere else; no new field.
- **On stores priority `high`; off goes back to what a new task has, which is no priority at all** (stored as nothing, which reads as normal). A task stored as 'low' by an older version shows the switch off and keeps 'low' until the switch is used. **A task already stored as high counts as Must do**: it shows the small Must do marker on its card (item 1) and comes first in the Missed list.
- **Priority sync is unchanged** (the existing priority column, as before). On a repeating task the switch applies to the series, like any edit of it.
- The switch now tells a screen reader whether it is on (react-native-web left `aria-checked` off a switch).
- Real check: p10 section 9.

### 10. Shift a day
- **The day header menu has "Shift unfinished to next day"** (that day's unfinished one off tasks to the day after) and **"Push rest of week by a week"** (every unfinished one off task from that day to the Sunday ending its week, each seven days on). Each says how many will move before you choose ("3 tasks will move"), and is greyed out when there is nothing to move.
- **Each task keeps its time of day and its place among the others** (the board orders a day by its own fields, which do not change). **Done tasks and repeating days never move** (a repeating task's days belong to its rule).
- **Undo straight after:** the undo bar ("Moved 3 tasks from Mon 19 Oct to Tue 20 Oct. Undo") puts every task back on its old day, if it is still where it was moved to.
- Real check: p10 section 10.

### Found by the full gates
- **The Tasks strip could still open five years back** in a window that opens behind another one: such a window gets no layout callbacks, so the board never learned its width and the jump to today (which waited for it) never ran. The jump no longer waits for the width and keeps trying, more slowly, for up to a minute (found by cp8c, cp8d and cp8e in a full run).
- **A late block could not be dragged by its top in a narrow week column** (the move pill covered it; a press on a button is never a drag). The pill is now a small arrow on narrow or short blocks and sits at the bottom of tall ones (found by p9).
- Checks: p9 expects the Must do row in the details; cp8c brings its window to the front at start, like p5 and p10 (in a window behind another one a click on a hover-only icon lands on the card).

## 2.26.0 — 2026-10-17 (desktop redesign)

**Desktop redesign after Jethro's review, with the Ellie planner as the reference for layout, behaviour and feel only (no copied icons, text or visuals). No schema change, no sync change: every stored value (priority included) is untouched and still syncs. Built and committed step by step; this entry grows with each step.**

### Layout (step 1)
- **Three full height columns, nothing across the top of the window.** Left pane: the Belific mark and name with its hide button, then the list switcher, the "Add a task" box with the time still planned in the list ("5h planned", estimates of unfinished tasks), then the tasks. Centre pane: its own top row with only ✅ Tasks | 📆 Calendar, 📅 Only today, 🎯 Quests and the profile button, then the board or the Calendar. Right pane: only the Timebox, with its hide button beside its header.
- **Hiding:** the left pane's hide button (or `[`) hides it and a small show button appears at the left of the centre's top row; the Timebox's hide button (or `]`) hides it and its show button appears at the right of the centre's top row. Remembered as before (`ui.panes`).
- **Window widths** (page width): the list docks from 900 px, the Timebox from 1180 px; narrower, they fold away by themselves and their show buttons open them over the centre (Escape or a press outside closes them) without changing the remembered choice. The Calendar takes the whole centre and never shows the Timebox panel. **The phone layout is only for a page under 640 px** (`DESKTOP_BREAKPOINT` in `mobile/lib/useIsDesktop.ts`; it was 1024, the same as the window's minimum outer width, so the smallest window always fell to the phone's Today page). The window's minimum width is now 760.
- **Profile menu:** Plan my day, Shut down my day, Quick capture, Search and Keyboard shortcuts join the account items. The top strip, the pane rails and the ⌨️ button are gone; every shortcut still works (Shift+/ still shows the overlay). Settings has a Keyboard shortcuts section generated from the same registry.
- **Kanban is now called Tasks** in the desktop interface.
- **Logo:** the mark from the app icon (`mobile/assets/belific-mark.png`, cut by `desktop/scripts/make-icons.js`); the window, taskbar, tray and installer icons were already the Belific mark and are unchanged.
- Real check p3 now covers the widths and the folding; p5 and p7 open Planning and Shutdown from the profile menu.

### Continuous days, Today, Add a task per day, no carry over, no drop to subtask (step 2)
- **The Tasks board is one continuous strip of days** (`lib/dayStrip.ts`): it opens with today at the left edge and scrolls sideways (mouse wheel, scroll bar, or ‹ › one screen at a time) to any day five years back or ahead, with no week boundaries: on a Sunday, Monday is simply the next column. Only the columns on screen and three either side are drawn. **Today** ("Show today in Tasks") jumps back; **Jump to date** now takes any date, past included. Holding a drag at either edge scrolls the strip (the old week change is gone).
- **Columns** read "Sat Oct 17" (weekday 20 px bold, date muted) with a sage "Today" tag; past days are dimmed and refuse drops (unchanged rule).
- **Add a task on each day** from today on: a box at the top of the column (Enter adds a task on that Day) with the day's actual against estimated time.
- **No carry over:** unfinished tasks of earlier days no longer appear in Today; they stay on their own day (scroll back to find them). No stored date changes. Daily Planning and Shutdown still move tasks only when the person chooses.
- **Dropping a task on another card no longer makes it a subtask**: the code is removed (`planDropAsSubtask`, the hover dwell, the "Added to... Undo" bar, the card highlight). A drop is only ever a move to a day, a time or the list. Subtasks are added on the card or in the details window. The Trash still recognises merges made by older versions.
- **Drag feedback:** the day a dragged task would land in shows a dashed placeholder with its name.
- The left list's header no longer repeats the actual / estimate figure (its box shows "… planned").
- New real check `desktop/test/real/p9.js` (strip, Today, arrows, wheel, add per day, no carry over, placeholder, past day refusal, never a merge). cp8b, cp8g, cp8h and p3 updated for the strip (cp8h keeps its weeks by naming seven days and jumping to them).

### Cards and text (step 3)
- **Inter for the whole interface and Roboto Mono for timer and clock figures**, shipped inside the app (`mobile/assets/fonts`, with their licences: Inter under the SIL Open Font License, Roboto Mono under the Apache License 2.0), so it works offline. `components/desktop/desktopFonts.ts` registers them (the same Inter files also stand in for "Segoe UI", the first family of react-native-web's text stack on Windows, so every text is Inter without touching the icon font or emoji); `mobile/metro.config.js` adds `.woff2` as an asset type. Desktop only.
- **Cards** (measured from the reference): a soft solid fill in the label's colour (white with no label), no hairline, 12 px corners, a light shadow that deepens on hover (120 ms; nothing moves), padding 11 × 12, 10 px between cards. Two lines: a rounded tick box, the emoji and title (14 px, 600) and the estimate (mono); then what the task carries as quiet text (label, time, steps ring, repeat, reminder, time spent). The controls lie over that second line on hover or keyboard focus (so the card never changes height) and sit in the flow when the card is expanded.
- **Steps ring:** the grey ☑️ is now a ring that fills in sage as steps are ticked and turns solid sage with a tick when every step is done.
- p9 checks the fonts, the card's measured style and the ring.

### The Calendar does what the Timebox does (step 4)
- **Drag, resize and drop on the Calendar**, with the Timebox's own code: a task block is now one shared component (`TimeBlock.tsx`) used by the Timebox and the Calendar's day and week views, on the same `DragProvider` and `lib/drag.ts` rules. Drag a block to another time or day (30 minute steps, the Timebox's snap; never onto a past day; a projected day of a repeating series changes the series' time, never its day), drag its bottom edge to change the estimate, drop a task from the list or the board onto a time, drag an all day task onto the grid, and drop a block on the all day row to take its time away. Imported events stay fixed. Phase 3 had left the Calendar read only because the drag layer and its drop zones belonged to the Timebox; zones now accept any number of day columns (clipped below the sticky headers).
- **Keyboard moves** on a focused block (Timebox and Calendar): Up and Down 30 minutes earlier or later, Left and Right the day before or after, Shift+Up and Shift+Down 30 minutes shorter or longer (`lib/drag.ts` `nudgeBlock`, listed in the shortcuts). Plain arrows rather than Alt: Alt is never a shortcut in Belific.
- **The week view is a rolling strip of days**: seven columns fill the width, it opens on today and scrolls sideways to any day (‹ › move a week, Today jumps back); its title names the seven days ("17 to 23 Oct 2026"). Day headers, the all day row and the hours stay put while the grid scrolls.
- **Drag feedback, the same everywhere:** the lifted card is drawn like a task card (emoji, title, snapped time); a day column shows a dashed placeholder, a time grid a dashed slot with its time.
- p9 checks the Calendar drag to another day and time, the slot preview, the resize, the drop from the list, the arrow keys (and that Left stops at today), the drop on the all day row, and Next and Today on the rolling week. p3 updated for the rolling week.

### The labels menu: 20 colours and emoji (step 5)
- **Twelve new label colours** beside the original eight (Teal, Forest, Olive, Mustard, Amber, Coral, Berry, Lavender, Indigo, Ocean, Stone, Charcoal), each readable with Belific's text on its tint (AA, tested). **The original eight keep their keys, names and colours exactly**, and no existing label changes colour.
- **Safe on older versions.** A desktop before 2.26.0 treats a colour it does not know as missing, gives the label one of the original eight and syncs that, so it would change the colour back everywhere. So the new colours are locked in the picker until "Every computer runs Belific 2.26 or later" is ticked (kept on this computer only, never synced), and a new label is only ever given one of the original eight automatically. From 2.26.0 a colour the app does not know is left alone and drawn neutral, so a later palette cannot be overwritten. The iPhone app does not show label colours, so nothing changes there.
- **The label menu** (Ctrl+L on a card, the card's label button, a Timebox block): New label opens a small form with the name, an emoji and the 20 colours; Edit labels opens the Labels page; Remove label (was "No label") takes the label off the task. Search, create by typing, rename, recolour, emoji and delete on each row and the Suggested list are unchanged. The Labels page's colour popover uses the same 20 colour picker.
- No sync or schema change: the colour is the existing `color_key` text.
- p9 checks the New label form, the lock and its tick, creating a label with an emoji and a new colour, the card's tint, Remove label and Edit labels. cp9 updated for the 20 colour picker.

### Tasks, not Kanban (step 6)
- The board is called **Tasks** everywhere on the desktop (the centre switch "✅ Tasks | 📆 Calendar", the shortcut list "Switch between Tasks and Calendar", the Today button "Show today in Tasks", done in step 1) and now in the living docs: the glossary (`UBIQUITOUS_LANGUAGE.md`), the build plan, build progress, CURRENT_TRUTH and the home spec. Session notes, decisions and older CHANGELOG entries keep the old name as history.

### The task details modal (step 7)
- **Task details is a centred modal** (600 px wide, a 23 px title with the done box and the task's emoji beside it) instead of the panel over the right side. Rows in order: Task date, Estimated time, Actual time, Label, Repeats, then List, then Notes and Subtasks. **Emoji, Duplicate, Save as template, Start a pomodoro and Delete are in the ⋮ menu** at the top right. It opens the same way (O on a card, More, Open details), closes with ×, a press outside or Escape, and puts the keyboard back on the card. Every edit still saves as it is made, through the same task commands as the card.
- Escape now closes it from a text field too (the title has the keyboard when it opens), saving the field first; an open popover inside it still takes Escape first.
- p9 checks the size and position, the 23 px title, the row order, the ⋮ menu, an emoji and a rename from the modal, and a press outside. p2 and p7 open the ⋮ menu for the emoji and Save as template.

### Today and Add a task on each day (step 8)
- Done in step 2 and checked by p9 there: the Today button jumps the scrolling days back to today in Tasks ("Show today in Tasks") and in the Calendar ("Calendar go to today"); each day from today on has its own "Add a task" box with that day's planned time; the left list's box shows "N planned".

### Priority removed from the interface (step 9)
- **Priority is gone everywhere you can see it, on the desktop and the iPhone:** the flag and the muted Low title on cards (desktop cards, the iPhone's Today, Tasks and Calendar screens, events included), the Priority option on a card and on a Timebox block, the Priority row in the task details, the Priority picker in the iPhone's task and event forms, the Priority power feature toggle and its Settings text. Priority no longer sorts anything: a day column and the iPhone's task list order by time, then oldest first.
- **Stored priorities are untouched and still sync**: the `priority` column, the task and event fields, the sync, templates, Duplicate, Restore and the data export all keep it. Editing a task or an event on the iPhone writes its stored priority back unchanged. A stored `feature.priority` setting row is left as it is and no longer read.
- **The iPhone part needs the next TestFlight build**: until then the iPhone keeps showing priority.
- p9 checks no priority control on a card or in the details; p7 checks there is no Priority toggle and that editing keeps a stored High; p2 and cp8b updated (no priority control).

### Quests show and tick their steps (step 10)
- **A quest with steps shows how many are done** beside its name ("Morning Routine 0/3", in Roboto Mono) and the steps ring, and **expands** (the ring and chevron button, "Show the steps of …") to list them for the day that is due ("Today"). Ticking a step there is the same tick as on the board: a day that is only projected is stored on the first tick (decision 023), the series template is never changed, a second tap unticks, and ticking the last step completes the day as everywhere else. When this period is already done, the card shows the done day's steps. Quest cards are 340 px wide so the name and count share a line.
- p9 seeds a daily "Morning Routine" with three steps and checks the 0/3 count, that the list is hidden until expanded, ticking a step (today's occurrence stored with that step done, the template untouched), the 1/3 count, and unticking.

## 2.25.0 — 2026-10-17 (build plan phase 8, calendar connections)

**Desktop and iPhone. No table or column change. One grant written for review (003, not applied). One Edge Function written and tested locally, NOT deployed. The iPhone part needs a new TestFlight build (a new native module).** Section 7 steps 1 to 3 of the build plan; two way Google and Microsoft sync (step 4) is out.

- **iPhone calendars, read only** (`lib/deviceCalendar.ts`, Calendar tab, Settings, Calendars): the Calendar tab did not read the phone's calendar before (only Belific's own events). Now, after the person presses "Show my calendars" (asked in context, with the reason; iOS asks once), the events of every calendar on the phone (iCloud, Google, Outlook accounts) show in the day sheet beside that day's tasks, with a dot on days that have any. Read for the month on screen, kept in memory only, never stored, synced or written back. Denied: a plain explanation and Open Settings. `expo-calendar` 15.0.8 (the SDK 54 version, pinned) with `NSCalendarsUsageDescription` and `NSCalendarsFullAccessUsageDescription`; no Reminders strings (the package's config plugin is not used for that reason). Writing tasks to the phone calendar is not built (Jethro's decision).
- **Outbound feed** (`lib/icsFeed.ts`, `lib/calendarFeed.ts`, `lib/calendarFeedActions.ts`, Edge Function `belific-calendar-feed`): a secret link Google, Apple and Outlook can subscribe to. Timed tasks only, 30 days back to 365 ahead, the title with its emoji and a ✓ when done, nothing else; floating times; repeating series expanded with the app's own series code. The token (32 random bytes) is the `user_settings` row `calendar.feed_token`, so it follows the person; Make a new link replaces it (the old link is dead as soon as the change reaches the server; the app syncs at once and says whether it has), Turn off writes a tombstone. Settings, Calendars on both devices: the link with Copy (desktop) or Share (iPhone), Make a new link and Turn off, each confirmed. The data export already leaves the row out.
- **The function** reads, with the service role, only the owner of the token and then that owner's task rows (12 columns); writes nothing; one fixed sentence per failure; logs the status only; per token and per caller rate limits; no CORS. Deploy with `--no-verify-jwt` (also in `config.toml`). `003_calendar_feed_grants.sql`: `grant select on belific.user_settings to service_role` (Jethro's check: the other privileges were already there). Steps and checklist: `docs/CALENDAR_FEED_DEPLOY.md`.
- **Windows: imported calendars** (`lib/icsParse.ts`, `lib/externalEvents.ts`, `lib/icsSubscriptions.ts`, `desktop/src/icsFetch.js`, `icsStore.ts`, `CalendarsSection.tsx`, `CalendarPane.tsx`): paste an ICS or webcal link in Settings, Calendars; it is added only if its first fetch works. Its events show in the Calendar (day, week, month) beside the tasks, read only (a dashed outline and 📅; nothing opens or moves them): all day events and anything of 24 hours or more in the all day row, shorter ones on the grid, cut at midnight so the rest shows on the next day. Repeats (daily, weekly, monthly, yearly with INTERVAL, COUNT, UNTIL, BYDAY with 1MO or -1FR, BYMONTHDAY, BYMONTH, BYSETPOS, WKST), EXDATE, RDATE, moved and cancelled instances, time zones by IANA name, Windows name or the calendar's own VTIMEZONE, counted in the event's own wall clock so a clock change keeps 09:00 at 09:00. Refreshed every 30 minutes while the window is visible (10 after a failure), when it becomes visible, and with Refresh; last refreshed and the error in words; a failed refresh keeps the last events. Local to the computer, never synced, never in the export. Up to 10.
- **Fetching is the main process's**, never the page's: https on 443 only, no user name or password, every address the name resolves to must be public (checked at connect time, so a name cannot switch to a private address in between), at most 3 redirects each checked the same way, 15 seconds, 5 MB (also after gzip), must be a calendar. Only the host and a reason code are logged, never the link.
- Tests: `icsFeed`, `icsParse`, `externalEvents`, `icsSubscriptions`, `calendarFeed`, `calendarFeedFunction` (718 in all), `desktop/test/icsFetch.test.js`; the real function under Deno against a fake PostgREST (`scripts/feed-local-test.js`); real check `desktop/test/real/p8.js` (44 checks). iOS marker gate: `parseIcs`, `expandCalendar`, `addSubscription`, `Calendars shown in Belific` added (20 markers, 0 hits).

## 2.24.0 — 2026-10-16 (build plan phase 7, power features)

**Desktop only. No schema change, no sync change.** Every new piece of state is a `user_settings` row, which already existed and already syncs.

- **Power feature toggles** (Settings, ⚡ Power features): due dates and reminders, priority, daily planning, pomodoro, task templates, analytics, attachments. One `feature.<name>` row each (`on` or `off`), so a choice follows you to your other computer. Off means hidden, never deleted: turn it on again and everything is there (a reminder already set keeps working). Reminders, priority, planning and analytics start on (today's screens are unchanged); pomodoro and templates start off. Attachments are a "Coming later" row with no switch: nothing is stored or uploaded.
- **Labels is an overlay**, not a page: it opens over Settings (or anything else), closes with Escape, its button or a press outside, and focus returns to the button that opened it. Each label has an emoji.
- **Pomodoro** (🍅, on a card and in the details panel): a countdown laid over the one task timer, never a second timer. Starting it starts the task's timer the ordinary way (so starting it stops any other timer); when the 25 minutes are up the floating timer offers a break or keep going; a break stops the task timer exactly like any stop (whole minutes, rounded down, a timer over 24 hours asks first) and counts 5 minutes with no task timer running; skipping or finishing the break starts the next focus period. Starting another task's timer, or stopping this one, ends the pomodoro. The countdown is this computer's own state (never synced) and is found again after a restart.
- **Task templates**: "Save as template" in the details panel stores the title, estimate, notes, priority, label and steps (no Day, no progress) as one `template.<id>` row; 📑 beside the Brain Dump capture makes a new task from one in the list showing; Settings renames and deletes them. A template is trimmed to fit one setting (the notes first, then the last steps, never the title); 50 at most.
- **Reset local cache and resync** (Settings, Data): asks first, then does a full sync, then clears this computer's copy and downloads it again. It REFUSES, and clears nothing, if you are signed out (this computer would hold the only copy), the sync did not finish, anything is left in the outbox, or a write slipped in while resetting (checked again under the storage lock). Every refusal says so in words.
- Emoji on the Settings sections, the Progress heading and each repeating task there, and the Labels overlay.
- Real check `desktop/test/real/p7.js` (54 checks); unit tests for the toggles, pomodoro, templates and every refuse case of the reset. The Labels checks in cp9 and cp11 now expect an overlay.

## 2.23.0 — 2026-10-16 (build plan phase 6, Analytics, Trash, data export)

**Desktop only. No schema change, no sync change.**

- **Analytics** (📊 in the profile menu, a page): ranges work week (Mon to Fri), last 7 days, last 14 days, last month, last 3 months, custom (a year at most). Cards: tasks completed against the period before (neutral words: more, fewer, the same), actual against estimated (over finished tasks with an estimate; a missing actual is 0), the average age of Brain Dump thoughts. Charts: time per day (by tasks or by time, grouped into weeks for long ranges), estimated against actual per task (outline against solid, so colour is never the only signal), tasks by label (percentages that add to 100). The completed list, grouped by day or label, with a CSV download (formula looking titles are written as text). Every bar shows its number, has a name for assistive technology, and hover or press shows it in a readout. Chart colours are at least 3:1 on the surface (tested). Empty states say what is missing and nothing more.
- **Trash** (🗑️ in the profile menu): tasks deleted in the last 30 days. **Restore makes a NEW task with the same fields and a new id** (`restored_<oldId>`, deterministic, so two devices restoring at once make one task); the old tombstone stays and is touched so the entry leaves the Trash on every device. A deleted repeating task is one entry that restores as one plain task (its repeat was cleared when it was deleted). Skipped days are not in the Trash. A task merged into another one is told apart by its effect and shown with "Merged into another task" and no Restore button. There is no delete forever: tombstones stay for sync (90 days; 400 for repeating days).
- **Data export** (Settings, Data): "My data (JSON)" has every table, "My tasks (CSV)" one row per task. Only data on this computer; deleted rows left out; anything secret looking (a token, session, password) is left out and counted; the message says how many rows were exported.
- Real check `desktop/test/real/p6.js` (39 checks); unit tests for the CSV, analytics, Trash, export and chart colours, and a two device restore through the real sync engine.

## 2.22.0 — 2026-10-16 (build plan phase 5, Daily Planning, Daily Shutdown, rollover)

**Desktop only (the iPhone gets the flows in a later step). No schema change, no sync change.**

- **Daily Planning** (Ctrl+Shift+P, or the sunrise button in the top strip), 4 steps: review yesterday's work and what was missed (tick any that were actually done), choose today's tasks from a list or add new ones, move what can wait to tomorrow or next week, give tasks a time against a small Timebox with an all day row and the current time line. **Daily Shutdown** (the moon button), 2 steps: what was done today (corrections allowed) and what is left over (ticked ones go to tomorrow), then tomorrow's list with "N already planned tasks, M tasks from Today".
- Both are full screen overlays with a step rail. **Everything is a draft until Finish; Cancel or Escape changes nothing** (checked byte for byte in the real app).
- **Rollover** runs only on Finish: Planning moves unfinished tasks of earlier days to today, Shutdown moves the chosen unfinished tasks of today to tomorrow. Never a repeating task, a placed task keeps its time, and it is worked out from the latest stored rows at Finish. Idempotent: twice, or from two devices through the sync engine, it gives one result and a second run writes nothing.
- **Keys:** Ctrl+Shift+P Daily Planning, Shift+T today's first task, Shift+B the first Brain Dump task, Left and Right the first task of the day before or after, Ctrl+I the time section on a card. None fires while typing.
- Real check `desktop/test/real/p5.js` (34 checks).

## 2.21.0 — 2026-10-16 (build plan phase 4, Quests)

**Desktop and iPhone. No schema change, no sync change.**

- **Quests** on the desktop (🎯 Quests in the top strip, a page like Progress) and the iPhone (a new Quests tab): every repeating series, in Daily, Weekly, Every 2 weeks, Every few weeks (every 3 weeks), Monthly, Every year and Other repeats (a rule from a newer device), so no repeating task is hidden. One card each: emoji, name, how it repeats, what is due this period ("Due today", "Due this week", "Done this week", "Next: Fri"), current and best streak (never a zero, never a warning), one tap to complete (a second tap reopens), a planned skip, Today, and Timebox (desktop).
- **Streaks counted in periods** (`lib/quests.ts`): days, weeks, fortnights, stretches of 3 weeks, months, years. A period counts when every scheduled day in it is done or skipped; all skipped is neutral; the current period never ends a run. Derived from the stored rows and a converted routine's old ticks, never stored. Tested across month ends, leap years, daylight saving changes and five time zones.
- **Every year** repeat: stored as `annual` in the existing rule text with its date number in `recurrence_month_day`, so a Feb 29 repeat falls on Feb 28 and comes back on the 29th. Choosing it shows a warning and needs "Every device is updated" ticked before Apply. An older Belific keeps the rule.
- **Putting a quest on today** stores its occurrence with today as its Day; the occurrence still stands for its own day, so the rule and the streak do not move (`series.ownDay`, the series template and anchor now read it).
- **Repeats in the details panel**: the card's own Repeat control, opened from the panel.
- **iPhone:** Brain Dump captures tasks (old Brain Dump items stay until edited, then become tasks, as on the desktop); **Convert routines** in Settings, Data with the desktop's dry run, confirmation and Undo (no backup step: the phone has none). The iOS marker gate drops `convertRoutines`, `undoConversion` and `routineConvertActions` on purpose.
- Skips of monthly and annual series are kept locally for ten years (their streaks look back that far); others 400 days as before.
- Real check `desktop/test/real/p4.js` (29 checks).

## 2.20.0 — 2026-10-16 (build plan phase 3, desktop layout)

**Desktop only. No schema change. `mobile/app.json` is now 2.20.0 (a feature, so a minor bump); the iPhone code is unchanged, the version is shared. Phases 2 and 3 were committed before the bump, so it was made afterwards in its own commit (the CHANGELOG rule says to bump in the same commit as the feature; from here on it is).**

- **Panes:** the left and right panes collapse to rails (`[`, `]`, or the buttons in the top strip) and the centre works with either, or both, hidden. The layout is remembered in the user_settings row `ui.panes` with a local fallback.
- **Calendar** in the centre, switched with **V** (Tab keeps normal focus): **D** day, **W** week, **M** month; the 24 hour grid with an all day row, a current time line and overnight tasks; its own Filter. The Timebox on the right gets the current time line too.
- **Search** (Ctrl+K), **quick capture** (Q into the list shown, T onto today, Shift+Enter keeps the box open) and **show only today** (Shift+F).
- Real check `desktop/test/real/p3.js` (52 checks); new tests for the pane state, the calendar maths and search.

## 2.19.0 — 2026-10-16 (build plan phase 2, task model and timer)

**Desktop only. No schema change. A feature, so a minor bump; 2.20.0 followed the same day with phase 3.**

- **Task details panel** (every field, an overlay), the **timer** (start and stop on the card, in the panel or with Ctrl+Shift+Enter; one at a time; a timer over 24 hours asks first) with a **floating timer** that survives navigation and a restart, **actual time** (whole minutes), estimate presets 5 min to 2 h plus custom, **lists** beside Brain Dump, **emoji** on tasks, labels and lists, **duplicate**, estimate against actual per day and list.
- **Keyboard shortcuts** from one registry, with the help overlay on Shift+/; nothing fires while typing.
- Real check `desktop/test/real/p2.js` (42 checks); the older real checks still pass; new tests for the totals, the timer session, duplicate, lists, emoji and the shortcut rules.
- Decision 028 (Proposed). Decision 022's removal of Actual time is superseded by it.

## Build plan phase 1 (data foundations) — 2026-10-16, no version bump

**No user visible change, so `expo.version` stays 2.18.1. Migration 002 applied by Jethro through the Supabase migration tool (`20261016153525 belific_lists_settings_timer`). Nothing deployed.**

- **Schema 002** (`mobile/supabase/belific_schema/002_lists_settings_timer.sql`): `tasks.actual_minutes` (NULL = 0), `tasks.timer_started_at`, `tasks.list_key`, `tasks.emoji`, `projects.emoji`, and the tables `lists` and `user_settings`, in the 001 house style.
- **Sync:** 9 tables; a `planner` capability gates the new tables and fields (kept locally and queued until the server has them); sanitisers for every new value; an unknown repeat rule is sent back unchanged instead of wiped.
- **Storage:** lists and user settings (local, synced). **Timer maths:** `mobile/lib/taskTimer.ts`. No UI yet.
- **delete-account (code only):** also deletes from `lists` and `user_settings`. Still never deployed to the shared project.
- **Decision 027:** no XP, levels or multiplier; streaks on recurring tasks only. Supersedes 014 and the XP parts of 008.
- Docs: `docs/belific-build-plan.md` updated with Jethro's phase 1 decisions; `docs/build-progress.md` added.

## 2.18.1 — 2026-10-15

**The iPhone gets Google sign in, signs out locally, and the build is ready for a TestFlight only run against the shared project. Nothing deployed, no EAS command run, no dashboard or database contact. (Phone move checkpoint.)**

- **Settings, Account (iPhone):** a "Sign in with Google" row under "Sign in with Apple" (a Cancel row and a short fixed message while the browser is open). Google opens the system browser (Linking, no new native module), PKCE, and comes back through `belific://auth-callback`. Apple is unchanged.
- **Phone callback rules** (`lib/phoneAuthCore.ts`, `phoneGoogleFlow.ts`, `phoneGoogleAuth.ts`): the exact Belific authorize URL only, Google only, redirect exactly `belific://auth-callback`; a link is accepted only for a sign in started in this run, within 10 minutes, once, three failures end it; quiet, fixed sentences. The flow id is in the link only if auth-js is told to add it (it is off, and stays off: the redirect allow list compares the query string); the exchange is bound to this flow's stored verifier instead.
- **Real PKCE on the phone.** Hermes has no `crypto.subtle`, and auth-js then silently falls back to a **plain** challenge (the verifier itself in the browser address). The phone installs `@noble/hashes` (audited, pinned at 1.8.0) as `crypto.subtle.digest` when missing, and the gate **refuses** to open the browser unless the challenge is S256 **and** the PKCE verifier (read back from the session store) came from secure randomness: it has the shape of auth-js's `crypto.getRandomValues` branch, hashes to exactly the challenge in the URL (hash of bytes the app builds itself, no TextEncoder), and `crypto.getRandomValues` itself passes a run time check that it never touches `Math.random`. `flowType` is now `pkce` on both platforms (Apple's `signInWithIdToken` is unaffected).
- **expo-router** no longer sees the callback as a screen: `app/+native-intent.ts` sends `belific://auth-callback` to Settings.
- **Phone sign out is local scope** (Sign Out and Delete account): the default global scope would have signed out the desktop and the other apps that share the login.
- **iOS marker gate:** `startGoogleSignIn` and `Continue with Google` removed on purpose; five desktop only auth names added (19 markers, 0 hits). Decisions 018 and 026 updated.
- **`eas.json`:** the production profile reads the `production` EAS environment (`"environment": "production"`); no values in the repo. The build number stays in `app.json` and is raised by hand (`docs/BELIFIC_EAS_TESTFLIGHT.md` section 3); no `appVersionSource`, no `autoIncrement`.
- **Docs:** `docs/BELIFIC_EAS_TESTFLIGHT.md` (variables, build, TestFlight only, the one-time waiver, rollback), stale banners on the Landis `eas-build` skill and `docs/publishing-reference.md`, the waiver in `TESTING_PROTOCOL.md`.
- Tests: `phoneAuthCore.test.ts` (callback, URL check, gate, real supabase-js PKCE with and without WebCrypto, SHA-256 against Node, the verifier randomness proof, native intent, sign out scope), `phoneGoogleFlow.test.ts` (fakes), `easConfig.test.ts`, `iosMarkers.test.ts`. Not testable without a device: end of `phoneAuthCore.test.ts` and `docs/sessions/2026-10-15-project-move.md` section 8.
- **Not changed (user visible wording):** the delete texts, `privacy.html` and `terms.html` (they still say Google is Windows only: update before anyone but Jethro installs the phone build).

---

## 2.18.0 — 2026-10-08

**A Sign in page with Apple and Google on the desktop. Desktop only; the iPhone app is unchanged. No migration, no database or dashboard contact, nothing deployed. (Checkpoint 12, part 1 of 2; email and password is 2.19.0, not started.)**

- **Sign in page** (`SignInPage.tsx`, decision 026): a page inside the app like Settings and Progress, with Back, Escape and focus return. Continue with Apple, Continue with Google, Not now (it also ends a sign in that is waiting in the browser) and the line "You can use Belific without an account." The profile popover and Settings, Account now each have one **Sign in** button that opens it; the old "Sign in with Apple" buttons are gone. There is no "Use email" button yet.
- **Google sign in** through the system browser, PKCE, the same `belific://auth-callback` callback and the same validation as Apple. Google gets an account chooser (`prompt=select_account`). `checkAuthorizeUrl` now allows exactly one provider from apple and google (a second `provider` parameter, other spellings and other providers are refused); `externalLinks.js` is unchanged in effect.
- **Code layout:** `mobile/lib/authCore.ts` is new and pure (providers, the signInWithOAuth options, every sentence of the page and of a failure, the account label). `desktopAuth.ts` is the desktop wiring (`startAppleSignIn`, `startGoogleSignIn`, `cancelSignIn`). The phone wiring (`auth.ts`) is untouched. Failure sentences are provider agnostic, so Apple and Google fail with identical words, and an error from the client or the network is never shown.
- **Account line:** the email, else "Apple account" or "Google account" (was always "Apple account").
- **iOS marker gate:** `SignInPage`, `startGoogleSignIn` and `Continue with Google` added (16 markers; export checked, 0 hits).
- **delete-account function (code only, NOT deployed):** it no longer logs the user id or any error text, and no longer returns raw error text; callers get "Unauthorized" or "The account could not be deleted". The deployed version still has the old behaviour until Jethro deploys this one.
- **Docs:** `docs/GOOGLE_SIGNIN_SETUP.md`, `docs/ACCOUNT_LINKING_TEST.md`, decision 026 (Proposed), decision 012 updated, privacy and terms updated for Google (effective 8 October 2026; also fixed `%APPDATA%elific-desktop`, which had lost its backslash on the privacy page).
- **Not built:** "Add a sign in method" in Settings, Account (needs manual linking switched on in the Supabase dashboard; left for 2.19.0), Apple token revocation on delete (findings only, in the session note).
- Tests: `authCore.test.ts` (12), `authLink.test.js` (Google, refusals), `iosMarkers.test.ts`, real check `npm run test:real:cp12` (58 checks, fake Apple and Google pages inside the in process fake Supabase). cp6, cp9, cp10 and cp11 now start sign in through the Sign in page.

---

## 2.17.0 — 2026-10-07

**Streaks and a Progress page, derived from repeating series. Desktop only; the iPhone app is unchanged. No migration, no sync change, no database contact, no stored counters. (Checkpoint 11.)**

- **Streaks are derived** (`mobile/lib/seriesStreak.ts`, pure): from the stored occurrences `root:date`, the skip tombstones and, for a converted routine (`rt_<id>`), its old routine completions. A day is done when its occurrence is completed (ticking the last subtask completes it, so there is one rule). A skipped day is neutral, a day not done ends the run silently, today before it is done is neutral, days that are not scheduled are neutral. Weekly, every 2 weeks and monthly series count scheduled occurrences. Dates are stepped by the calendar, never by milliseconds, so clock changes cannot skip or repeat a day; "My day starts at" is not an input.
- **The line.** "N days in a row" for a daily series and "N in a row" for other rules, from 2 only, on TODAY's card and in the block popover. Never a zero, never a warning, no icon or colour change. Settings, Planning has **Show streaks** (default on, desktop setting, not synced; it hides the lines, not the Progress page).
- **Progress page.** A page inside the app (decision 025), reached from a new Progress row in the profile menu or File, Progress. Per live series: the run, the best run (each from 2), "Last 7 days: 5 of 6" and "Last 30 days" (hidden when none were done) and a 7 day strip. Every square has a text name ("Monday, done", "Tuesday, not done", "Wednesday, skipped", "Thursday, not scheduled", "Today, open") and its shape differs by state (tick, empty outline, dash, dot, dashed outline), so colour is never the only signal. No totals across series, no chart.
- **Keyboard.** The pages (Settings, Labels, Progress) now close with Escape (unless a popover or a text field has it), and Back or Escape returns focus to the control that opened the page (the profile icon when it came from the profile menu, the button that opened Labels, the card that had focus for File, Progress). A focused switch or button does not block Escape.
- **Skip tombstones are kept 400 days locally** (`series.keepsOccurrenceTombstone`, was: while the day is today or later), longer than the 366 day streak lookback, so a skip never ages into a miss. Local only; the server never prunes and sync is unchanged.
- **iOS marker gate:** `npm run check:ios-markers -- <export folder>` (`mobile/scripts/ios-markers.js`). Exits 1 on any marker (now including `ProgressPage`, `seriesStreak`, `Show streaks`), 2 on a missing folder or bundle; `copyRoutineCompletions` is the one allowed name, checked in source with `git grep`. `seriesStreak` stays a marker until the iOS catch-up release reuses it (decision 018, CURRENT_TRUTH).
- Tests: `seriesStreak.test.ts` (37, including the banned wording check over every string and the walk across the Europe, US and Auckland clock changes in real time zones), `iosMarkers.test.ts` (9), editable and settings tests, real check `npm run test:real:cp11` (52 checks). cp9 no longer presses Escape on the Settings page body (Escape now leaves the page; cp11 checks that).

---

## 2.16.0 — 2026-10-07

**Routines from the iPhone can become repeating tasks, by a button the person presses later. Desktop only; the iPhone app is unchanged. No migration, no database contact. (Checkpoint 10.)**

- **Settings, Data** shows a quiet line "N routines from your iPhone" whenever routine rows exist, with a "Convert routines from your iPhone…" button. There is no other routine UI on the desktop.
- **The confirmation step** (inline, not a modal) lists each routine's title and time of day, says "Nothing has changed yet.", shows the warning "Your iPhone will stop showing these routines until the next iPhone update. Only convert when you are ready. You can undo this." and keeps **Convert disabled until the safety backup of this step exists** (a `routine-convert` backup folder, checked on disk by the main process).
- **Convert** writes through normal storage and the outbox: one daily, untimed series per routine (id `rt_<routineId>`, reminder off, no label, no priority, no steps, starting the local day Convert is pressed), then a tombstone on each routine written directly (never `deleteRoutine`). `routine_completions` are not touched. Converting again never makes a second series (deterministic ids; a routine whose series row exists only gets its tombstone).
- **Undo** ends the series (open days deleted, finished days kept but no longer repeating) and gives each routine back as a NEW routine row (same title and time of day) with its completions copied to the new id. A tombstone can never be cleared by sync (a pulled tombstone always wins and a live upsert never sends `deleted_at`), so the old row cannot be revived; the old rows and completions stay as they were.
- **Account switch fix:** `hasLocalData` (which decides whether a different account must choose between uploading and starting empty) now includes `belific_routine_completions` (`USER_DATA_KEYS` in `accountSwitch.ts`, with a test that it covers every key `clearAllData` removes). `clearAllData` already removed the completions.
- **Backups:** the page may now ask for a `routine-convert` labelled backup as well as `account-switch`; the main process returns the backup folder's name after checking it exists.
- Tests: `routineConvert.test.ts` (18), account switch key tests, real check `npm run test:real:cp10` (50 checks, in memory fake server only). The fake server in `desktop/test/real/common.js` gained an opt in in memory table store.

---

## 2.15.1 — 2026-10-07

**Small fixes after checkpoint 9. Desktop and the two public pages only; the iPhone app is unchanged. (Checkpoint 9.1.)**

- **Switches use the palette.** One shared desktop `PaletteSwitch` (off white thumb, sage track when on, neutral track when off) replaces the Settings and Filter switches. react-native-web painted a teal thumb while a switch was on; the active thumb colour is now set too. The iPhone settings screen is untouched.
- **`terms.html` is accurate again.** Section 3 no longer says all data stays on the device: it now describes optional sign in with Apple and sync to Supabase (EU West, Ireland), that settings are not synced, and how to delete the account in each app, using the same facts as the privacy page. No dashes. Contact stays the GitHub issues link for now.
- **Privacy page** unchanged (contact is still the GitHub issues link; no new statements).
- **Docs:** Import is not built and needs its own checkpoint; settings do not sync; a "Before publishing" checklist for the two public pages.

---

## 2.15.0 — 2026-10-07

**One profile icon, a Settings page, a Labels page, a keyboard route for cards, a corrected security scan and a rewritten privacy policy. Desktop only; the iPhone app is unchanged. (Checkpoint 9.)**

- **Profile icon.** A slim strip above the three panes holds one profile icon at the top right, always visible. Signed out it is a neutral person glyph and its small popover says "Local only, not signed in", "Sign in to keep your tasks on all your devices", a Sign in with Apple button (the existing flow) and a Settings row. Signed in it shows your initial; the popover shows the account, sync status with the last synced time and any error in plain words, Sync now, Settings and Sign out. It is the shared Popover, never a modal. The old account line at the bottom left of the Brain Dump pane is gone. The account choice modal, the pre sign in backup and the revoke handling are untouched. Decision 025.
- **Settings page.** The Settings modal is replaced by a page inside the app with a Back button (not an overlay), opened from the popover and from File, Settings (Ctrl+,). Sections: Account (sign in or out, Delete account with its inline confirm, and a plain message if the server function is unavailable), Sync, Planning (My day starts at), Notifications (the toggles, the daily reminder time, close to tray, start with Windows), Data (backups folder, export), Labels and About (version, privacy policy, issue tracker, the Chromium and Electron licences when that file ships in the app folder). Every setting behaves as before.
- **Labels page.** Every label with its colour swatch, name and the number of open tasks using it. Rename inline, recolour from the eight colour palette, delete with an inline confirm (tasks move to a same-named label, otherwise lose the label), add from the suggestions or by typing. Duplicate names are refused. No reordering.
- **Hidden panes are inert.** While Settings or Labels shows, the three panes are hidden and inert (no focus, no drag, no keys), and the notification payload keeps updating.
- **Keyboard route for cards.** A card is reached with Tab, Enter expands or collapses it, Escape collapses it, with a visible focus ring in the accent colour. Typing in any field is unaffected (the 2.12.1 space key fix stays).
- **Security scan.** `security-scan.sh` no longer fails on the environment variable name in `delete-account/index.ts`, and is stricter in other ways: secret values are now searched in every tracked file (docs, markdown and env files too). Tested with fixture repositories (`securityScan.test.ts`).
- **Privacy policy** rewritten for both apps (device storage, optional Apple sign in and sync to Supabase EU West (Ireland), what is and is not collected, how to delete data and the account). Linked from About.
- **Installer.** Publisher and copyright metadata, and a note in both READMEs that the installer is not code signed so Windows may show a SmartScreen warning ("More info", then "Run anyway"). No signing or auto update code.
- **Not built:** Import of data (needs its own checkpoint). No database change and no migration.

---

## 2.14.0 — 2026-10-07

**Repeating tasks are series that show on every matching day, a 24 hour Timebox for any lifestyle, overnight tasks, ordered columns, Actual time removed and more space between cards. Desktop only; the iPhone is unchanged. (Checkpoint 8.4.)**

- **Repeating tasks show on every matching day.** A Daily task now appears in every day column from today forward (and in the Timebox on each day), a weekly one on its weekdays, "Every 2 weeks" on its weeks, monthly on its date (the 31st falls on the last day of shorter months). These are *projected* occurrences: computed when drawn, never stored, never synced, never in the left list, never in the past. A projected card looks like a normal card, a little lighter. Decision 023.
  - Ticking a projected card or one of its subtasks stores **that day** as a real task (`rootId:date`) and changes nothing else. A day that has a stored occurrence shows it, never a duplicate. Completing a repeating task no longer creates the next copy on the desktop (the days are already shown); the iPhone still does.
  - Editing a projected card (title, label, priority, estimate, repeat, reminder, notes, subtasks, start time) edits the series: the template row and every open stored row from today. The card says "Repeating: changes apply to every day". Dragging it onto the Timebox sets the start time of the whole series (a daily 05:00 routine shows at 05:00 every day); it cannot go to another Day column or the left list.
  - **Skip this day** (card overflow menu) hides one day with a tombstoned occurrence (the existing tombstone mechanism; no new column). **Delete repeating task** (inline "Delete this repeating task? Yes / No") tombstones the open days and stops the series; **Does not repeat** clears the rule on every row of the series, so an ended series can never come back.
  - Reminders: the next 48 hours include projected occurrences (timed ones with their own lead; untimed ones in the grouped daily reminder). The label filter and Show complete apply to them. An unfinished past occurrence of a repeating task is no longer shown as overdue.
  - No database change and no migration; existing stored repeating tasks keep working.

- **The Timebox is the whole day.** 00:00 to 24:00 with an hourly label on every hour, the faint half hour lines and the 30 minute snapping as before. A block can start as late as 23:30 and run past midnight.
- **"My day starts at".** New setting in the Settings modal (Planning), a time in 30 minutes steps, default 05:00, stored in the main process settings (not synced). Any day other than today opens with that time at the top; today opens about an hour before now (never before the day start once it has begun). No other part of the app assumes a daytime schedule.
- **Overnight tasks.** A task belongs to the Day it starts on. If it runs past 24:00 its block goes to 24:00 and the rest shows at the top of the next day as a lighter block, "Continues from yesterday" (derived, never stored; clicking it opens the same task popover). Move and resize from the original block only; resize may go past midnight up to 24 hours. The chip keeps showing the full estimate.
- **Day column order.** Tasks without a start time first, then timed tasks earliest first, then completed ones.
- **Fix:** the Daily reminder time in Settings could not be changed (a mistyped pattern rejected every value); it can now.

- **Actual time is gone.** Jethro only wants the estimate, so the timer, the play button, the "Actual" and "Estimated" row, the forgotten-timer prompt, `lib/timer.ts` (and its controller, binding and tests), the `belific_timer` key, `Task.actualSeconds`, the `actual_seconds` sync column and its capability flag are removed. The two unapplied migration files (`20261007130000_task_actual_seconds.sql` and its rollback) are deleted: it was never applied to any database. A stored task that still carries `actualSeconds` is cleaned when it is loaded. The H:MM chip and the typed dropdown are unchanged. Decision 022 is marked superseded.
- **More space.** Cards in the week columns are 12px apart (was a hairline) and rows in the left list 10px apart, keeping the hairline. The reserved space for the hover icons from 2.12.3 is unchanged.

---

## 2.13.0 — 2026-10-07

**Duration chip and dropdown like the Ellie planner, plus Estimated and Actual time with a simple timer. Desktop only; the iPhone is unchanged.**

- **Chip.** Every card and left-list row shows the duration as H:MM in the app's tabular figures: `0:00` when none is set (it used to say "None"), `0:15`, `1:30`, `24:00`. A placed task shows its start time as separate small muted text beside the chip (`09:30  0:15`), so the two numbers are never read as one value. Time is still set only by dragging onto the Timebox.
- **Dropdown.** Clicking the chip opens a small popover with a focused field ("45m, 1h 30m, 130...") and a scrollable preset list (5, 10, 15, 20, 30, 45 min, 1h, 1h 30m, 2h, 3h, 4h) with a tick on the current one and a "No duration" row. Typing accepts `45m`, `45`, `1h`, `1h 30m`, `1h30`, `1.5h`, `130` (minutes) and `1:30`; any whole minute from 1 to 1440 is valid. Enter applies; invalid text shows a quiet hint and applies nothing; Escape closes. The old Custom hours and minutes fields are gone.
- **Estimated and Actual.** An expanded card has one quiet row under its controls: a play/pause button, then "Actual 0h 0m" and "Estimated 0h 0m". Estimated is the duration (click it for the same dropdown). The timer stores its start timestamp in the main process store (not synced), so it survives closing the app; elapsed time is always computed from timestamps. Only one timer runs: starting another stops the first and saves its time. A running card shows a small dot and a live Actual (refreshed every 30 seconds). Completing a task stops its timer. Click Actual to type a corrected value. No colours, comparisons, streaks or notifications.
- **Forgotten timers.** Stopping a timer that ran over 12 hours does not add the time: the card asks inline, "That's 14h 20m. Add it, or enter a different time?" with an Add button and a field.
- **Deleted or merged tasks.** Deleting a task, or dropping it onto another as a subtask, stops its timer without adding time; at startup a stored timer whose task is gone or completed is dropped.
- **Repeating tasks.** The next occurrence copies the estimate and starts with Actual cleared.
- **Sync.** New nullable column `tasks.actual_seconds` (migration `20261007130000_task_actual_seconds.sql`, written, NOT applied). Until it exists the client does not send it and a pull keeps each device's local value; when it appears the local values are queued and uploaded.

---

## 2.12.3 — 2026-10-07

**Fix: task cards no longer shift when the pointer arrives or leaves. Desktop only.**

- The calendar and overflow icons on a card used to appear on hover and pushed the title and controls by a few pixels, so a quick click could land on the wrong thing. They now keep their space and only fade in; nothing in the card moves.

---

## 2.12.2 — 2026-10-07

**"Daily" is now an explicit choice in the Repeat dropdown. Desktop only.**

- Options in order: Does not repeat, Daily, Weekly, Every 2 weeks, Monthly. Daily stores a daily repeat with no day chips and the summary "Repeats every day."; the next occurrence is the day after the later of the task's Day and today, as before. Ticking all seven days on Weekly switches the selection to Daily. A stored daily task opens the dropdown on Daily.

---

## 2.12.1 — 2026-10-07

**Fix: typing a space in the Notes field of an expanded task card collapsed the card. Desktop only.**

- Space (and Enter in the rename box) typed in any field on a card, or in a popover, no longer reaches the card. Notes accept spaces, Enter (a new line), Backspace and arrows normally and the card stays open. Escape in Notes leaves the field (which saves it) without collapsing the card; a second Escape collapses it.

---

## 2.12.0 — 2026-10-07

**Edit tasks on the card, not in a pop up (checkpoint 8.2, decision 021). Desktop only; the iPhone is unchanged.**

- The big task editor is gone. A task card (board and left list) now carries its own controls: click the title to rename it in place; a duration chip at the top right; and a row of small icons for complete, repeat, subtasks (with a counter such as 0/4), priority, reminder and the label. Each icon opens a small dropdown beside it, never a full screen, so many tasks can be edited in a row.
- Clicking the card body expands it in place to show notes and the subtasks list. Subtasks can be added (Enter adds the next), renamed, ticked, reordered with a handle and deleted. Ticking the last subtask completes the task, ticking the task ticks them all, and unticking one reopens a completed task. A repeating task's next occurrence carries its subtasks, unticked.
- The label dropdown has a search field, create from the typed text, suggestions, and rename, colour and delete (with the same rules as before). Priority, duration (None, quick chips, Custom hours and minutes), repeat (with its plain summary line) and the new reminder (None, at start, 5, 10, 30 minutes or 1 hour before) are small dropdowns too. Move to day is a calendar icon with its own dropdown. Delete is in a small overflow menu with the inline confirm.
- Clicking a placed task on the Timebox opens a small popover with the same controls, plus Remove time. Events keep their editor.
- Dragging a task onto another task's card and holding it there for about 300 ms shows "Add as subtask"; releasing then adds it as a subtask (with "Added to X. Undo" for 6 seconds). Releasing earlier, or on a column or between cards, is the normal Day drop.
- New Filter button beside the week label: pick labels, "No label" and "Show complete" (completed tasks are hidden by default). It filters the board, the left list and the Timebox tasks (not events), and is remembered across restarts.
- Per task reminders: the desktop notifies a placed task the chosen number of minutes before it starts, or not at all when set to None. The grouped daily reminder skips tasks set to None.
- New sync columns `tasks.subtasks` and `tasks.reminder_minutes` (migration written, not applied). Until it is applied the app keeps both locally and syncs everything else as before.

---

## 2.11.2 — 2026-10-06

**Desktop sign out only ends this computer's session (checkpoint 6.1 follow-up). The iPhone is unchanged.**

- The desktop sign out, and the retry of a sign out that could not reach the server, now use scope `local`. Before, they used Supabase's default (global), which also signed the iPhone out.

---

## 2.11.1 — 2026-10-06

**Desktop sign in hardening (checkpoint 6.1, fixes from the security review of checkpoint 6). The iPhone and the sync rules are unchanged.**

- A stray `belific://auth-callback` link can no longer destroy a sign in in progress. A failed code exchange keeps the pending sign in alive (the PKCE verifier is restored from a private copy); it closes after 3 failed attempts, a successful sign in, cancel, sign out or the 10 minute expiry.
- Signing in as a different account (or after deleting the account) on a computer that has local data now asks first: upload this computer's data to the account, or start empty (a backup is kept). Nothing is uploaded until you choose, even after a restart.
- Session files are never included in backups or in Export data. If sign out cannot reach the server, the revoke is retried when the network is back and at launch; Settings shows a quiet note meanwhile.
- PKCE verifiers are kept in memory only and wiped when a sign in ends. If encrypting the session fails, Settings shows the warning instead of claiming it is saved.
- Links open in the browser only for Belific's Supabase sign in, the privacy and terms pages (najeca.github.io/belific) and the support page (github.com/najeca/belific/issues).
- The page can no longer read or write session files or the first sign in backup flag; labelled backup folders are never replaced; a second sign in cannot start while one is running; the content security policy gained object-src, base-uri, form-action and frame-ancestors.

---

## 2.11.0 — 2026-10-06

**Desktop notifications, tray and a Windows installer (checkpoint 7, decisions 017 and 020). The iPhone is unchanged.**

- Event starts and tasks placed on the Timebox now notify at their start time, from the desktop's main process, so they arrive with the window closed.
- New daily reminder (decision 020, proposed): one grouped notification at 09:00 (adjustable, can be turned off) such as "3 tasks planned for today", for tasks with a Day but no time. Completed tasks are excluded, and nothing is sent when there are none.
- Closing the window keeps Belific in the system tray (Open Belific, Quit Belific). A one time note explains it. Close to tray can be turned off; Start with Windows is optional and off by default.
- Settings gained Notifications and Window sections.
- `npm run dist` in `desktop/` builds an unsigned per user Windows installer (NSIS) into `desktop/dist`. See `desktop/README.md` for install, the SmartScreen warning, data location and uninstall.

---

## 2.10.0 — 2026-10-06

**Desktop sign in with Apple (checkpoint 6, decision 012). The iPhone is unchanged. The live Apple round trip is not verified until the setup guide is done.**

- The desktop can sign in through the system browser (PKCE, `belific://auth-callback`). Only a callback for a sign in started in this run, within 10 minutes, used once, is accepted; anything else is ignored.
- The session is stored encrypted (Electron safeStorage). If the computer cannot encrypt it, the sign in lasts for that run only.
- Before the first ever sign in the app takes a backup named `YYYY-MM-DD-pre-signin`. Sign out keeps all local data.
- The "Local only · not signed in" line is now clickable and opens a small Settings modal: Account (sign in, sign out, delete account), Sync (status, last success, last error, Sync now) and Data (export, open backups folder).
- `docs/APPLE_SIGNIN_SETUP.md`: the Apple and Supabase steps for Jethro.

---

## 2.9.0 — 2026-10-06

**Sync hardening (checkpoint 5, decision 013). Shared by the iPhone and the desktop; the desktop stays signed out.**

- Every local write is queued in a persisted outbox (survives restarts,
  one entry per row, retried with backoff, never blocks the UI) and pushed
  in batches of up to 500 with every server error checked and recorded.
- A storage lock stops a sync from overwriting a write made while it was
  waiting on the network.
- Pulls are paginated (no more 1,000 row cap) and, once migration 1 is
  applied, incremental by a server-set `server_updated_at` cursor.
- Conflicts: the last change to reach the server wins; deletes always win
  over edits; timestamps are compared as times, not strings.
- Un-completing a routine on one device is no longer undone by another, and
  routine completions are no longer pruned after 90 days.
- Durations, Timebox times, repeat settings and label colours now sync (after
  migration 2). Until then a pull never erases them.
- The iPhone completes tasks through the same function as the desktop, so a
  repeating task made on the desktop creates its next occurrence on the phone.
- Sync status (idle, syncing, offline, error with the last error) is recorded;
  the desktop shows one quiet line in the Brain Dump pane.
- New migrations (not applied yet): `20261006120000_sync_hardening.sql`,
  `20261006120100_task_pipeline.sql`, with manual rollback, backup and
  verification scripts in `mobile/supabase/rollback/`.
- The delete-account function answers CORS for the desktop app's origin only
  (not deployed).

## 2.8.4 — 2026-10-06

**Desktop Home: optional and short durations (checkpoint 4.4, web/Electron only; the iPhone app is unchanged).**

- Duration is optional: a None chip (the default for a new task) stores no
  duration. Quick chips are None, 15m, 30m, 1h, 2h; Custom has hours 0 to 24
  and minutes 0 to 55 in 5 minute steps (5 minutes to 24 hours, 24h only with
  0 minutes). Durations read "10m", "1h 5m" and so on; stored values load
  unchanged.
- Timebox: a block under 30 minutes is drawn at true scale down to a compact
  20px minimum, so it no longer looks like a full 30 minute slot, and shows one
  line with its title and true duration ("Call back 10m"). Moves and drops still
  snap to 30 minutes, resize still has a 30 minute minimum, and a task with no
  duration dropped on the Timebox still gets 30.

## 2.8.3 — 2026-10-06

**Desktop Home: simpler Repeat, ready made labels, label rename and delete (checkpoint 4.3, web/Electron only; the iPhone app is unchanged).**

- Repeat is now Does not repeat, Weekly, Every 2 weeks, Monthly. Weekly and
  Every 2 weeks take 1 to 7 day chips (Weekdays and Weekends shortcuts kept).
  Weekly with all seven days reads Daily ("Repeats every day") and is stored
  as the existing daily kind; untick a day and it is Weekly again. Every 2
  weeks always stays Every 2 weeks.
- Monthly has one "Day of the month" field (1 to 31, default the Day's date,
  else 1): "Repeats on the 1st of every month", with "In shorter months it
  falls on the last day." for 29 to 31. A Day on another date moves to the next
  matching date ("starts Sun 1 Nov").
- Ten suggested labels (Work, Study, Health, Fitness, Home, Errands, Money,
  Social, Admin, Personal) can be added with one tap; each disappears once a
  label with that name exists.
- Label names are unique (trimmed, case insensitive): creating an existing
  name selects that label. The selected label can be renamed (Enter saves;
  duplicates are rejected) or deleted with an inline confirm that says how
  many tasks use it. Deleting is a tombstone; its tasks move to another label
  with the same name, or lose their label.

## 2.8.2 — 2026-10-06

**Desktop Home: time by drag only, clearer Repeat, matching numbers (checkpoint 4.2, web/Electron only; the iPhone app is unchanged).**

- The kanban card's "Schedule at" clock and its time popover are gone. A task
  gets a time only by being dragged onto the Timebox, and loses it by being
  dragged off. Move to day (Remove day, Today, Tomorrow, a date) is unchanged.
- Repeat in the task editor: Does not repeat, Every day, Specific days, Every 2
  weeks, Monthly. Specific days and Every 2 weeks take any mix of the seven day
  chips (at least one), with Weekdays and Weekends shortcuts. A summary line
  always says exactly what will happen ("Repeats every Wed, Fri and Sun",
  "Repeats every other week on Mon and Thu", "Repeats on the 14th of every
  month"), including "starts Wed 14 Oct" when the Day moves to the first
  chosen weekday. "Weekly" is never shown.
- Completing a repeating task creates the next one on the next chosen day
  strictly after the later of its Day and today. Every 2 weeks counts from the
  week of the task's Day. Monthly keeps its date number (a new local only
  `recurrenceMonthDay`), so a 31st stays the 31st after a short month and a
  late completion no longer shifts the date. Older weekly tasks with no days
  repeat on their Day's weekday.
- Brain Dump rows show a short repeat form ("Wed Fri Sun"); Timebox blocks now
  show the repeat mark cards already had.
- Numbers: the Day, jump-to-week, move-to-date and duration fields used Times
  New Roman (they inherited the page's default font); they now use the app's
  font. Timebox hour labels, column counts and duration chips are slightly
  larger and heavier so figures match the letters beside them; hour labels and
  counts use tabular figures.

## 2.8.1 — 2026-10-06

**Desktop Home: label colours and custom durations (checkpoint 4.1, web/Electron only; the iPhone app is unchanged).**

- A label now has a colour from one palette of eight muted tones (sage, clay,
  sky, sand, plum, moss, rose, slate; `lib/labelColors.ts`). Kanban cards and
  Timebox blocks with a label get a soft tint and a 4px left edge in its
  colour; Brain Dump rows get a small dot next to the label name. A task with
  no label stays neutral.
- A new label takes the next unused colour; the selected label's swatches in
  the task editor change it. Labels created before this get a colour the
  first time the desktop reads them (a silent local fill: `updatedAt` is not
  changed). `colorKey` is local only until checkpoint 5.
- Duration in the editor: quick chips 30m, 1h, 2h plus Custom (hours 0 to 24,
  minutes 0 or 30, 30 minutes minimum, 24h only with 0 minutes). Older stored
  values (15, 120 and so on) load and show as they are ("15m", "2h") and are
  only rounded when a new duration is picked.
- A Timebox block that runs past 23:00 is drawn to the grid end with a quiet
  "continues" marker; one longer than the whole grid is placed at 06:00 and
  shown clamped. Resizing still stops at 23:00.

## 2.8.0 — 2026-10-06

**Desktop Home: drag and drop (checkpoint 4, web/Electron only; the iPhone app is unchanged).**

- Drag a Brain Dump row onto a day column to give it that Day, or onto a
  Timebox slot to give it the Timebox's day and that 30 minute slot (a task
  with no duration gets 30 minutes; an existing duration is kept). Legacy
  Brain Dump items convert into Tasks on drop.
- Drag a card to another day (it keeps its time), or onto the Brain Dump pane
  to clear its Day and time.
- Drag a Timebox block up or down to change its time, or its bottom edge to
  change its duration, in 30 minute steps kept inside 06:00 to 23:00 (minimum
  30 minutes). Drag a block onto a day column (sets the Day, clears the time)
  or onto the Brain Dump pane (clears both).
- Past days reject a drop with a quiet "Past day" note. Escape or a drop
  outside any target leaves the item where it was. A click still opens the
  editor; the checkbox, keyboard focus and the hover actions are unchanged.
- Holding a drag at the left or right edge of the week board scrolls the
  board sideways, then changes the week after a short dwell (never before this
  week). The wheel and edge auto scroll work during a drag.
- Faint half hour lines on the Timebox grid.
- Under the hood: pointer events, not HTML5 drag and drop (decision 019);
  pure maths in `lib/drag.ts`; the desktop panes moved from
  `app/components/desktop` to `components/desktop` behind
  `DesktopEntry.web.tsx`, so the iOS bundle no longer contains any desktop
  code.

## 2.7.0 — 2026-10-05

**Desktop Home: the thing you capture IS the task (web/Electron only; the iPhone app is unchanged).**

- Typing in the Brain Dump pane and pressing Enter creates a Task straight
  away (title only, no Day, `origin: 'dump'`). There is no form and no
  "Make task" or "New task" button any more.
- The left pane lists every incomplete task with no Day (newest first) plus any
  legacy `BrainDumpItem`s, shown identically. Opening and saving a legacy item
  converts it into a Task in one step (title, notes and creation time kept) and
  removes the item.
- Clicking anywhere on a row or on a kanban card (not only the title) opens
  the editor (name, duration, priority, label, notes, Day, Repeat, Done, delete
  with an inline confirm). Setting a Day moves a task off the left list onto
  the board; clearing it ("Remove day" on the card, or in the editor) brings it
  back.
- The Unscheduled column is removed from the week board. "Move to day" now
  offers Remove day, Today, Tomorrow and a date.
- A collapsed "Done today" line at the bottom of the left pane lists tasks
  completed today (no Day) with a checkbox to undo a mistaken tick.
- Recurring tasks: the next occurrence now counts from the later of the task's
  Day and today, so completing an overdue recurring task never produces a
  past-dated next occurrence.
- Fixed: hover-only buttons on rows and cards disappeared under the pointer
  (react-native-web ends a parent's hover when the pointer enters a nested
  pressable), so the click landed on the row instead. New `HoverPressable`
  uses DOM `mouseenter`/`mouseleave`.
- Fixed: Escape did not close the task or event editor while a text field had
  focus (react-native-web's `TextInput` stops key events bubbling); the
  listener is now in the capture phase.
- New pure `lib/thoughts.ts` (list split, Done today, new thought, dump item
  conversion) with 15 tests; the board tests no longer include Unscheduled. 79
  mobile tests and 19 desktop tests pass.
- `taskActions.ts` gains `createThought` and `convertDumpItem`. `sync.ts` and
  the iPhone screens are untouched; new Task fields stay local only until
  checkpoint 5.

---

## 2.6.0 — 2026-10-05

**Recurring tasks, set in the Brain Dump task form (web/Electron only; iOS unchanged).**

- `Task` gains optional `recurrence` and `recurrenceDays` (the same types
  `CustomEvent` uses). **Local only** until the sync migration (checkpoint
  5).
- The task form has a Repeat control: Does not repeat (default), Daily,
  Weekly (with weekday chips; none selected means every 7 days), Every 2
  weeks, Monthly. The form fields are now in the order name, duration,
  priority, label, notes, Day, Repeat. Edit mode has a Done toggle.
- Only the next occurrence exists. New `lib/taskActions.ts`
  `setTaskCompleted` is the single place a task is completed: when a
  recurring task is completed it creates the next one with the id
  `${rootId}:${nextDueDate}` (same name, duration, priority, label, notes and
  repeat settings, not completed), and does nothing if a task with that id
  already exists, live or deleted. Creation is serialised so a double click
  cannot duplicate it. Un-completing never removes an occurrence already
  created. The kanban checkbox and the form's Done toggle both call it; the
  board never creates occurrences.
- New pure `lib/recurrence.ts` `nextOccurrence`: daily +1 day; weekly with
  weekdays the next selected weekday; weekly with none +7; every 2 weeks +14;
  monthly the same day next month, clamped to the month end. A recurring
  task with no Day counts from today. The result depends only on the task's
  own Day. 15 tests (month-end clamping, leap years, year boundaries, weekday
  sets, clock changes in five time zones); 64 mobile tests pass.
- Recurring cards show a small repeat icon.
- Checkpoint 5 to-do: the iOS app must complete tasks through
  `setTaskCompleted` once sync lands, or a recurring task completed on the
  phone will never create its next occurrence.

---

## 2.5.0 — 2026-10-05

**Desktop Home: forward-only week board (web/Electron only; iOS unchanged).**

- Replaced the rolling 14 day board with a week board: a pinned Unscheduled
  column plus the days of the displayed week (Monday based, one constant).
  The current week shows today to Sunday; future weeks show Monday to Sunday.
  No past days or weeks can be shown or chosen.
- Week header: previous arrow (disabled on the current week), a label such
  as "Wed 7 Oct to Sun 11 Oct" (year added when not the current year; weeks
  across a month or year read correctly), next arrow, a "This week" button,
  and a "Jump to week containing" date input (min today). Arrows have 44px
  hit areas and are keyboard focusable.
- Removed the "Later" column.
- Overdue stays as decided: an unfinished task with a past Day shows first
  in Today with a "from <date>" tag, only while the current week is shown.
- "Move to day": Unscheduled, Today, Tomorrow and a date input (min today),
  with a quiet "Moved to Mon 2 Nov" line when the target is outside the
  displayed week.
- Pure helpers (`weekStartOf`, `addWeeks`, `weekDays`, `formatWeekLabel`,
  `clampToToday`, `isDayInView`) with tests, including month, year and leap
  boundaries and clock changes in five time zones. 49 mobile tests pass.
- Timebox day navigation is unchanged.

---

## 2.4.1 — 2026-10-05

**Desktop Home: tasks are created only from the Brain Dump pane (web/Electron only; iOS unchanged).**

- Removed the "+" from every kanban column header. The kanban no longer
  creates tasks; clicking a card still edits an existing one.
- Brain Dump pane header gets a "New task" button that opens the task form
  blank. "Make task" on a row still opens it pre-filled and removes the item
  on save.
- The task form's Day field (create and edit) is a web date input with
  `min` set to today: past dates cannot be chosen. A task that already has a
  past Day keeps it until the user changes it.
- Verified: `tsc --noEmit` clean, iOS JS bundle export succeeds, tests pass.

---

## 2.4.0 — 2026-10-05

**Desktop Home: Timebox day pane (web/Electron only; iOS UI unchanged).**

- New `TimeboxPane.tsx` replaces the last placeholder: an hourly grid from
  06:00 to 23:00, scrolled to the current hour on open, with previous and
  next day buttons, a "Today" button and a date dropdown (web date input) to
  jump to any day.
- It draws the day's events (same sources as the Calendar tab: the weekly
  template plus custom events, with category colours) and **placed tasks**
  (a Task whose Day is this day and that has a `startTime`; height from
  `durationMinutes`, default 30). One row per task, never copied.
- Overlapping items sit side by side; items crossing midnight or outside
  the visible hours are clamped, and items entirely outside are listed in a
  line above the grid instead of disappearing. A quiet line shows the day's
  scheduled time (the union of all blocks, so overlaps are not double
  counted).
- Kanban cards get a hover "Schedule at" action (time input; "Choose a day
  first" when the task has no Day; "Unschedule" clears `startTime`) and show
  their time. Clicking a placed task opens the task modal. Clicking a custom
  event opens an inline editor (title, start and end time inputs, delete with
  an inline confirm; edits that one occurrence only).
- New pure helpers `lib/timebox.ts` with 18 tests (layout maths, overlap
  columns, clamping, midnight crossing, scheduled-time union, task items).
- `startTime` and `durationMinutes` remain local only until migration 2.
- Verified: `tsc --noEmit` clean, iOS JS bundle export succeeds, 37 mobile
  and 19 desktop tests pass, and the built desktop app was driven headless
  and checked against the data files and screenshots. Not device tested on
  iOS.

---

## 2.3.0 — 2026-10-05

**Desktop Home: weekly kanban and task modal (web/Electron only; iOS UI unchanged).**

- `Task` gains optional `durationMinutes` and `startTime` (decision 015), and
  `dueDate` is now documented as the planned Day. **Local only**: `sync.ts`
  is untouched, so these fields are not uploaded until migration 2
  (checkpoint 5). Desktop stays signed out until then. iOS ignores them.
- New `KanbanPane.tsx`: an Unscheduled column plus 14 days from today,
  horizontal board scroll, each column scrolling on its own. Cards show
  title, High priority flag, label name and duration; finished tasks stay in
  their column, struck through, sorted last. Unfinished past tasks appear in
  Today first with a muted "from <date>" tag, and their stored date is left
  alone. A "Later" column appears only when a task is dated beyond day 14.
- New `TaskModal.tsx`: centred overlay for create and edit (title, Day via a
  web date input, priority, label, duration chips, notes, inline delete
  confirm). A "+ Label" link creates a label inline. Brain Dump rows get a
  hover "Make task" action that opens it pre-filled; saving moves the item
  (the Brain Dump item is deleted, the Task is marked `origin: 'dump'`).
- New pure helpers `lib/kanban.ts` with 19 tests (`npm test` in `mobile/`),
  including month, year and leap boundaries and clock changes in six time
  zones.
- `tsconfig.json`: `allowImportingTsExtensions` so the test file can import
  with an explicit `.ts` extension, as Node requires. No source file uses it.
- Verified: `tsc --noEmit` clean, iOS JS bundle export succeeds, 19 mobile
  and 19 desktop tests pass, and the built desktop app was driven headless
  (create, Make task, move, complete, delete, with the results checked in
  the data files). Not device tested on iOS.

---

## 2.2.0 — 2026-10-05

**Desktop Home: real Brain Dump pane (web/Electron only; iOS unchanged).**

- New `app/components/desktop/BrainDumpPane.tsx` replaces the left
  placeholder: pinned capture input (Enter adds), flat list with hairline
  dividers, click a title to edit inline (Enter saves, Escape cancels),
  hover shows a delete icon with an inline "Delete? Yes / No" confirm. Uses
  the existing `storage.ts` Brain Dump functions, so deletes are tombstones
  exactly as on iOS.
- `DesktopHome.tsx` holds one refresh counter shared by the panes so a
  change in one shows up in the others.
- New top-level `desktop/` folder (Electron shell, file store, daily
  backups, export) with its own tests; see `desktop/README.md`.
- Verified: `tsc --noEmit` clean, iOS JS bundle export succeeds, 19
  `node --test` tests pass, and the built desktop app was launched headless
  and screenshotted (see `docs/sessions/2026-10-05-cp1.md`). Not device
  tested on iOS (no iOS code path changed).

---

## 2.1.1 — 2026-10-05

**Storage goes through one `kv` entry point (groundwork for the Windows
desktop app, decision 011). No behaviour change on iOS.**

- New `mobile/lib/kv.ts`: `getItem` / `setItem` / `removeItem` /
  `multiRemove`. On the desktop app the Electron preload provides a
  file-backed store (`globalThis.belificDesktop.kv`); everywhere else,
  including iOS, it is plain AsyncStorage as before.
- `storage.ts`, `ownerSeed.ts`, `devSeed.ts` and the Supabase client's
  session storage now call `kv` instead of AsyncStorage directly. Same
  keys, same values.
- `_layout.tsx` skips `requestPermissions()` on web (expo-notifications has
  no scheduler there; desktop notifications are decision 017).
- Verified: `tsc --noEmit` clean and an iOS JS bundle export succeeds. Not
  device tested on iOS.

---

## 2.1.0 — 2026-09-04

**P-NAV, part 1: Focus/Pomodoro removed entirely.** Jethro found the
4-session Pomodoro flow confusing and didn't think it'd land with other
users either — see `docs/TIMEBOX_AND_NAV_SPEC.md`. Verified beforehand
that `focus.tsx` and its timer state were isolated (only referenced by
`focus.tsx` itself and `settings.tsx`'s Pomodoro config section, not any
of the 7 synced types), so this has no Supabase/sync involvement.

- Deleted `app/(tabs)/focus.tsx` and `lib/store.ts` (the Pomodoro
  `TimerStore`/zustand store — nothing else used the `useTimerStore`
  pattern, so the whole file went, not just its timer-specific exports).
- Removed `TimerSettings`, `TimerPhase`, `TimerStore` from `lib/types.ts`
  and `loadTimerSettings`/`saveTimerSettings` from `lib/storage.ts`.
- Removed the Pomodoro config section from `settings.tsx` (the
  `SettingRow`/`POMODORO_SETTINGS`/`SettingKey` machinery and its edit
  modal) and the `store.update(...)` timer reset from `handleClearAll` —
  "Clear All Data" no longer mentions resetting timer settings.
- Removed the `useTimerStore` hydrate call from `app/_layout.tsx` (no
  longer anything to hydrate on launch).
- Removed the now-route-less `focus` `Tabs.Screen` entry from
  `app/(tabs)/_layout.tsx` — required for the tab bar to still resolve
  correctly with the screen file gone; the `settings` tab is untouched,
  its relocation is P-NAV part 2, not part of this change.
- **Old `belific_pomodoro` AsyncStorage key deliberately left alone** —
  no migration to purge it, not worth the risk for a few orphaned bytes
  on existing installs. `clearAllData()` still removes it as part of an
  explicit user-initiated full wipe, which is unrelated to a migration
  and stayed as-is.
- Verified via `npx tsc --noEmit` (clean) and a grep pass confirming no
  remaining `TimerSettings`/`TimerStore`/`useTimerStore`/`lib/store`
  references anywhere in `app/` or `lib/`.

---

## 2.0.1 — 2026-08-01

**Retroactive entry** — this shipped in commit `99852f3` ("Add optional
notes field to Tasks") without a version bump or changelog entry at the
time; added now for process integrity (see `docs/decisions/` process
notes and `docs/NEXT_PLAN.md` P0.1).

- **Feature:** Task gains an optional `notes` string. Editable via a
  multiline field in `TaskForm` ("Notes (optional)", shown for both
  new and existing tasks), stored alongside the task's other fields.
  The Tasks list shows it as a smaller, secondary-colored line under
  the title (`taskNotes` style, `numberOfLines={1}`) so it reads as a
  note, not a second task title.
- Synced like every other `Task` field — `sync.ts`'s `RemoteTask`
  interface, `taskToRemote`/`taskFromRemote` mappers, and a new
  Supabase migration (`20260801004209_add_task_notes.sql`, adds a
  nullable `notes` column to the `tasks` table) all updated together.
  Whether this migration has actually been applied to the live
  Belific Supabase project is tracked separately — see
  `docs/NEXT_PLAN.md` P0.3.

---

## 2.0.0 — 2026-07-31

**Major, not minor — this reverses decision 003 ("No Supabase for v1"),
a named architectural decision reconfirmed multiple times throughout
this project's history.** A version bump that size deserves to say so
plainly rather than blend into the usual 1.x.x feature/fix rhythm.
Optional accounts + cloud backup, Phases C and D of the accounts plan,
shipped together — auth without a sync layer, or sync without auth, is
an unshippable half-feature, so both land in the same release. (Phase
A — local data-shape migration — and Phase B — Supabase project/schema
— already shipped standalone in 1.7.0 and its own infra-only commit;
neither changed the app's actual behavior by itself.)

Accounts remain fully **optional** — every screen, every feature, works
identically signed out, exactly as before. Nothing here changes
behavior for anyone who never signs in.

### Phase C — Sign in with Apple
- Settings gained an **Account** section: "Sign in with Apple" when
  signed out; signed-in email (or Apple's private-relay address if the
  user chose Hide My Email) + Sign Out + Delete Account when signed in.
- `com.apple.developer.applesignin` entitlement added the correct,
  Expo-managed way — `usesAppleSignIn: true` + the `expo-apple-authentication`
  plugin in `app.json`, regenerated automatically on every `prebuild`,
  not a hand-edit of the gitignored entitlements file.
- **Delete Account** is a real, server-verified deletion (guideline
  5.1.1(v)): a Supabase Edge Function (`delete-account`) — the only
  safe place for this, since the client can never call the service-role
  admin API needed to delete its own auth user — removes every row
  across all 7 synced tables for that user, then the auth user itself.
  Double-confirmation on-device before it runs; verified directly
  against the Supabase API afterward (not just trusting the UI) that
  `auth.users` and all 7 tables were genuinely empty for the test
  account, no orphaned rows.
- One real bug caught during verification: the first delete attempt
  showed local success (session cleared, Settings reverted) while the
  account was still present in `auth.users` server-side — a silent
  failure. Redeployed the Edge Function with explicit error handling
  and step-by-step logging so a failure can't complete silently again;
  confirmed clean on retry.
- Apple's Sign In with Apple key is team-scoped, not per-App-ID —
  reusing Landis's existing key was technically valid, but a dedicated
  key was generated for Belific instead to avoid coupling the two
  apps' credential blast radius/revocation lifecycle together, matching
  the same separate-Supabase-project decision already made in Phase B.

### Phase D — Sync layer
- Local-first, optimistic: every local write in `storage.ts` already
  completes and updates the UI before any network call happens; a
  fire-and-forget push to Supabase follows via `sync.ts`, via a dynamic
  `import('./sync')` inside `storage.ts` specifically to avoid a
  circular static import (`sync.ts` needs `storage.ts`'s raw loaders to
  reconcile). Signed-out (the default) or offline is a fast, silent
  no-op — nothing ever blocks on network, same feel as before for every
  user regardless of account status.
- No polling timer — sync triggers only after a local write and on app
  foreground (`AppState` transition to `active`), which is what a
  personal, human-paced app actually needs.
- One `runFullSync()` reconcile handles both cases from the plan
  uniformly: a brand-new account's one-time bulk upload (remote is
  empty, so everything local just uploads) and merging onto an
  existing account's data on a second device (union by id, newest
  `updatedAt` wins on a genuine conflict, local wins ties since
  re-uploading an identical row is harmless).
- `RoutineCompletion` syncs differently from the other six types, on
  purpose (see Phase A's own reasoning) — no `updatedAt`, no tombstone;
  a delete is pushed as a real row delete immediately, and the
  reconcile pass is a plain union by `(routineId, date)`, not a
  timestamp comparison.

Sources: Apple guideline 5.1.1(v) (account deletion), guideline 4.8
(login services — doesn't trigger here, Apple is the only login
method offered).

---

## 1.7.0 — 2026-07-31

- **Phase A of optional accounts + cloud backup: local data-shape
  restructuring, no backend yet.** Reverses no part of decision 003
  ("No Supabase for v1") by itself — this ships standalone, works
  identically offline-only, and is a prerequisite for the sync work in
  003's own "Do Not Change Unless" clause, not the sync itself.
  - **`updatedAt`** added to `CustomEvent`, `BrainDumpItem`, `Routine`,
    `Task`, `Project`, `CustomCategory` — needed for last-write-wins
    conflict resolution once sync exists. `Project`/`CustomCategory` had
    no timestamps at all before this; both also gained `createdAt`.
    Every `addX`/`updateX` in `storage.ts` now stamps it server-side
    (the single source of truth — call sites don't need to remember to
    set it correctly on every edit).
  - **One-time migration** (`migrateToSyncableSchema`, gated by a new
    `belific_schema_migrated_v2` flag, same pattern as
    `belific_owner_seeded`) backfills `updatedAt` on every already-saved
    row from `createdAt` where it exists, or a single shared migration
    timestamp for `CustomEvent`/`Project`/`CustomCategory` (which had no
    earlier timestamp to recover). Runs once on app launch, before
    anything else touches storage; every write it does is
    backfill-if-missing, so it's safe to no-op or retry indefinitely.
    Never rewrites an id, never removes a row.
  - **Ids switched to real random UUIDs** (RFC4122 v4, generated from
    `crypto.getRandomValues`, already polyfilled via
    `react-native-get-random-values` per decision 003's own
    "Consequences" note) for all *newly created* rows — needed once ids
    may need to be unique across devices, not just within one device's
    own AsyncStorage. Deliberately **not** a new npm dependency (a
    ~10-line local generator instead) given this repo's build history of
    dependency-change pain documented in `IOS_BUILD_NOTES.md`. Existing
    `Date.now()`-based ids are never touched or regenerated — both
    formats coexist permanently as opaque strings.
  - **Soft-delete tombstones** (`deletedAt?`) added to `CustomEvent`,
    `BrainDumpItem`, `Routine`, `Task`, `Project`, `CustomCategory`.
    Delete functions in `storage.ts` now set this instead of removing
    the row outright; every loader filters tombstoned rows out (never
    visible to any screen) and prunes them for real after 90 days once
    old enough that a slow-to-sync device would have had a chance to see
    the delete. `shouldShowStarterRoutine` updated to use the
    tombstone-filtered loaders instead of raw `AsyncStorage` reads — it
    would otherwise have permanently miscounted a store containing only
    soft-deleted rows as "has data."
  - **`RoutineCompletion` deliberately excluded** from all of the above —
    no `updatedAt`, no tombstone. Un-completing a routine is frequent,
    intentional, everyday behavior (per its own existing code comment),
    not an occasional cleanup action; tombstoning it would mean
    permanently retaining a complete/uncomplete pair for every day of
    every routine's life. Its sync story (Phase D, not yet built) is a
    real row delete on its `(routineId, date)` composite key, with
    conflicts resolved by whichever device's sync reaches the server
    last — deliberately the simple version, not a rigorous per-row
    timestamp queue, since this is one person's own data across their
    own devices and a same-day toggle collision is rare, low-stakes, and
    self-correcting.

---

## 1.6.1 — 2026-07-31

- **Starter Routines now show a one-emoji icon per item** (💧 drink
  water, 🪥 brush teeth, 🚿 shower, 🥗 lunch away from desk, 🍃 fresh
  air, 📵 phone away before bed) — on-device feedback was that the
  plain-text starter rows read as less expressive than the rest of the
  app. Starter Top 3 Tasks deliberately stay icon-free: real Task rows
  never show one either, and keeping it that way is what visually
  tells Routines and Tasks apart despite sharing the same row styling.

---

## 1.6.0 — 2026-07-31

- **Expanded the new-user starter template** to cover Routines, Top 3
  Tasks, and Brain Dump — previously only the Full Schedule had example
  content; the other three sections just showed a bare empty state.
  All four now show casual, relatable examples (Morning: "Drink water
  on waking up", "Brush teeth", "Shower"; Afternoon: "Eat lunch away
  from your desk", "Get some fresh air"; Evening: "Put your phone away
  before bed", "Brush teeth"; Top 3 Tasks: "Do laundry", "Grocery
  shopping", "Walk the dog"; Brain Dump: "Clean room", "Schedule
  meeting with a friend", "Cook rice", "Take chicken out of the
  freezer"; Full Schedule reworded to Work block / Gym / Downtime
  alongside Lunch break / Cook dinner). All starter rows are
  non-interactive display-only, same treatment as the existing
  Full Schedule template — never written to storage.
- **Fix:** `shouldShowStarterRoutine` was a one-time flag — it flipped
  to "seen" on its very first call ever and never showed starter
  content again after that, even with zero real data, even on a
  different tab that hadn't loaded yet. That's incompatible with
  showing starter content consistently across Today, Tasks, and Brain
  Dump regardless of which tab loads first. Now purely computed from
  whether any of custom events / Brain Dump / Routines / Tasks have
  real data — starter content shows for as long as none of the four
  do, and disappears the moment any one of them gets its first real
  entry. `belific_first_launch` is no longer read for this; `Clear All
  Data` still clears the now-unused key.

---

## 1.5.5 — 2026-07-31

- **Fix:** Settings' "Version" row was a hardcoded literal `"1.0.0"`
  string — never wired to `app.json`'s actual `expo.version` at all,
  in any version of this file. Every version bump this session (and
  presumably before it) was genuinely correct in `app.json`/
  `CHANGELOG.md`; the Settings UI simply never displayed it. This was
  not a stale-build or caching issue — confirmed by reading the source
  directly before assuming anything. Now reads
  `Constants.expoConfig?.version` from `expo-constants` (promoted from
  an already-present transitive dependency to an explicit one via
  `npx expo install expo-constants`; no prebuild needed, since its
  native module was already linked as part of the `expo` package —
  every build log this session shows the `[CP-User] Generate
  app.config for prebuilt Constants.manifest` step that populates this
  at build time). Version now genuinely reflects the installed build.

---

## 1.5.4 — 2026-07-31

- **Fix:** Top 3 Tasks checkbox on Today didn't show a checked state
  and completing a task there was effectively irreversible from that
  view. Two compounding bugs: the checkbox icon was hardcoded to
  `ellipse-outline` unconditionally, never checking `task.completed`
  at all (unlike the Routine checkbox, which already switched icons
  correctly); and `toggleTopTask` called `loadTopTasks()` right after
  toggling, which re-derives the list via `getTopTasks()` —
  deliberately filters out completed tasks — so the row would vanish/
  get replaced the instant it was tapped, before any checked state
  could be seen and with no way to tap again to undo from the same
  spot. Fixed both: the icon now reflects `task.completed`, and
  toggling updates the row in place (optimistic local state update)
  instead of immediately re-fetching/re-filtering, so it stays visible
  and genuinely reversible — tap again to un-complete — until the next
  natural refresh (refocus/pull-to-refresh), which is when a completed
  task should actually vacate its Top 3 slot. Confirmed the Tasks
  screen's own checkbox was unaffected — it already conditioned the
  icon on `item.completed` and its full list keeps completed tasks
  visible (dimmed, moved to the bottom) rather than filtering them out.

---

## 1.5.3 — 2026-07-31

- **Simplified Brain Dump back to fast-capture only.** Removed the
  2-option sheet (Schedule / Make Task) entirely — tapping a card now
  opens a simple edit view with just title and notes, nothing else.
  No date/time fields, no scheduling, no promotion to Task anywhere
  in this flow. Swipe-left-to-delete unchanged. Tasks and Events are
  now fully independent of Dump again — both are created via their
  own existing quick-add flows (Tasks screen, Today/Calendar), not
  through Dump. `BrainDumpItem.notes` (from the original Phase 3 data
  model) already existed and the card-preview-of-notes was already
  implemented — neither needed rebuilding, just re-exposed via the
  new edit view. New `updateBrainDumpItem` in `lib/storage.ts` (didn't
  exist before; only add/delete did).
- Note: `EventForm`/`TaskForm`'s `origin`/`initialTitle` props (added
  for the now-removed Dump promotion paths) are left in place —
  they're harmless, optional, and still used by their own components'
  types; only Dump's actual usage of them was removed. This does mean
  the 🧠 origin indicator on Tasks/Events is now vestigial for new
  items (nothing creates one anymore) but still correctly reflects
  historical data from items promoted before this change.

---

## 1.5.2 — 2026-07-31

- **Fix:** `splash.image` and the `expo-notifications` plugin's `icon`
  in `app.json` now also point to `./assets/belificappicon.png`,
  matching the app icon fixed in 1.5.1 — both previously still
  referenced the old default `icon.png`.
- Deleted the stale alpha-containing source file at the repo root
  (`assets/belificappicon.png`, the legacy web app's assets folder,
  untracked in git) now that the flattened version lives in
  `mobile/assets/` and nothing references the old one.
- Required another `expo prebuild --platform ios` to regenerate the
  native splash asset catalog (confirmed: `SplashScreenLegacy.imageset`
  was still the old 512×512 asset before this). As documented in
  `IOS_BUILD_NOTES.md` #9, this re-added the `aps-environment`
  entitlement and broke the build again — stripped it again, exactly
  as expected since `mobile/ios/` is gitignored and this recurs on
  every prebuild, not just the first time.
- Verified directly from the regenerated native source of truth
  rather than trying to screenshot a fast-dismissing splash frame:
  `SplashScreen.storyboard`'s embedded `SplashScreenBackground` color
  resource decodes to exactly `#F0EEE8`, and its image view references
  `SplashScreenLegacy`, confirmed regenerated from the new icon
  (1024×1024, was 512×512). Home screen icon re-confirmed unaffected
  (still correct) by this second prebuild/rebuild via simulator
  screenshot.

---

## 1.5.1 — 2026-07-31

- **Fix:** real app icon installed, replacing the Expo default. Source
  file was found at the repo root (`assets/belificappicon.png`, the
  legacy web app's assets folder) rather than `mobile/assets/` as
  initially expected — moved into the correct location. It had an
  RGBA alpha channel (`sips` reports `hasAlpha: yes`); flattened to
  solid `#F0EEE8` (matching the app background) and re-encoded as
  RGB with no alpha channel, since iOS/App Store icon validation
  rejects on the alpha channel's mere presence regardless of whether
  any pixel is actually transparent — manually decoding the pixel
  data confirmed this specific image was already 100% opaque
  everywhere, so the flatten step changed nothing visually, only
  stripped the channel. `app.json`'s `expo.icon` now points to
  `./assets/belificappicon.png` (`splash.image` and the notifications
  plugin's `icon` still reference the old `icon.png` — left alone,
  out of scope for this fix).
- **Fix:** `npx expo prebuild --platform ios` (required to regenerate
  the native icon asset catalog) also regenerated
  `Belific.entitlements` with an `aps-environment` key that automatic/
  free-tier signing doesn't support, breaking the build. Removed it —
  Belific never uses remote push (decision 002, local notifications
  only). Since `mobile/ios/` is gitignored, this isn't a one-time fix;
  documented in `IOS_BUILD_NOTES.md` #9 as a step required after every
  future prebuild, the same way the fmt patch already is.
- Verified via simulator screenshot (physical-device screenshots have
  no CLI tooling available) — new icon renders correctly, no
  transparency artifacts, no leftover default icon. A duplicate
  "Belific" icon under the old `com.belific.app` bundle ID also
  appeared during verification; confirmed as pre-existing simulator
  cruft from before the bundle ID was corrected to `com.najeca.belific`
  (unrelated to this fix) and removed from the test simulator.

---

## 1.5.0 — 2026-07-30

- **Feature:** Projects — a lightweight `{ key, name }` tag, no color/
  icon/screen of its own. Tasks can optionally carry a `projectKey`,
  set via a chip picker (+ "Add" via a single-field prompt) in
  TaskForm; the Tasks screen shows an "All" + per-project filter row
  whenever any project exists.
- **Feature:** Brain Dump gets its third path back, in a smaller form
  than before. Tapping a card now opens a 2-option sheet — Schedule
  (unchanged: opens EventForm, copies onto the calendar, dump item
  untouched) or Make Task (opens TaskForm prefilled with the title).
  Making a Task is a **move**, not a copy — deleting the dump item —
  deliberately the opposite of Schedule's copy behavior, since a Task
  has no calendar slot for the original thought to "also" occupy.
  Promoted Tasks get the same 🧠 origin indicator as promoted
  CustomEvents, shown on both the Tasks screen and Today's Top 3
  section. Swipe-to-delete is unchanged.

This completes the planned Routines/Tasks/Projects phase (1.3.0–1.5.0).

---

## 1.4.0 — 2026-07-30

- **Feature:** Tasks — a to-do list distinct from both Calendar events
  (always have a concrete date/time) and Brain Dump (no due date at
  all). A Task has an optional due date (date-only) and priority
  (reuses the existing Low/Normal/High picker, factored out of
  `AddEventModal` into `lib/data.ts` so both forms share it).
  "Top 3 tasks" section on Today — incomplete only, due-today-or-
  overdue first, then High priority, then oldest created — with
  checkbox-tap-to-complete directly from Today. "See all" pushes a
  new stack screen (`app/tasks.tsx`, not a tab — keeps the 5-tab
  decision intact) with a pinned quick-add (same pattern as Brain
  Dump: title-only, submit-and-refocus), the full sorted list,
  completed tasks dimmed at the bottom (manually deletable via the
  edit sheet, no auto-purge, no counts anywhere). The pushed screen
  builds its own custom header with a back chevron rather than
  enabling the native Stack header, matching every other screen's
  hand-built header instead of introducing a visually inconsistent
  one.
- No Project support yet (tagging/filtering) — deliberately deferred
  to land with Brain Dump's third promotion path in the next version,
  per the agreed sequencing.

---

## 1.3.0 — 2026-07-30

- **Feature:** Routines — a habit tracker, separate from the schedule.
  New "Routines" section on Today, between the NOW/NEXT UP cards and
  the existing stat/schedule sections, grouped by Morning/Afternoon/
  Evening (empty groups hidden; one combined empty state only when
  zero routines exist at all). Tap a routine to mark it done for
  today (tap again to un-mark — genuinely reversible, no streak
  count, no history view, missing a day is never flagged). Long-press
  to edit; "+" in the section header to add a new one (title +
  time-of-day, via the new `RoutineForm` component). `Routine` and
  `RoutineCompletion` types + storage landed in a prior unversioned
  commit (foundation for this whole phase); this is the first of them
  to actually ship.
- `docs/UBIQUITOUS_LANGUAGE.md` updated: clarifies the two unrelated
  senses of "Routine" now in the app (the habit feature vs. the
  pre-existing `routine` category), documents Task and Project ahead
  of their own UI landing, and corrects a stale "Promote" definition
  that still described the old delete-on-schedule Dump behavior
  reversed back in 1.1.0.

---

## 1.2.0 — 2026-07-30

- **Feature:** each Priority option (Low/Normal/High) now shows a
  short description underneath — "Nice to do, flexible timing" / 
  "Standard importance" / "Time-sensitive or non-negotiable" — so the
  picker gives a sense of how to use each level rather than just a
  bare label. Chips restyled from inline pills to a 3-across card row
  to fit the subtext.

---

## 1.1.2 — 2026-07-30

- **Fix:** Brain Dump's swipe-to-delete rebuilt on
  `react-native-gesture-handler`'s `Swipeable`, replacing the
  hand-rolled `PanResponder` version — real device testing showed the
  PanResponder implementation only completing partial swipes instead
  of a clean full reveal, the exact risk flagged when it was chosen
  over gesture-handler to avoid a native dependency. New setup: the
  gesture-handler import is now first in `mobile/index.js` (ahead of
  the existing polyfill chain), and the root layout is wrapped in
  `GestureHandlerRootView`. See `docs/IOS_BUILD_NOTES.md` #8 — no
  Podfile patch was needed, confirmed via a clean local Release build.

---

## 1.1.1 — 2026-07-30

- **Fix:** the event title field autofocused unconditionally on every
  form open, including when already populated (editing an event, or
  Dump promotion via `initialTitle`) — keyboard up + cursor in
  existing text on open is the exact mechanical pattern of a rename
  dialog, which is what made it feel that way. A genuinely blank new
  event still autofocuses (correct — matches the fast-capture goal);
  editing and Dump-prefilled opens no longer do.

---

## 1.1.0 — 2026-07-30

Batch: Dump interaction rework, recurrence day-picker, category
reduction, priority, Brain Dump branding.

- **Fix:** scheduling a Brain Dump item no longer deleted it from
  Dump. Original design was promote-and-remove; testing showed that
  reads as data loss on every schedule. Scheduling now copies the
  item onto the calendar and leaves Dump untouched — swipe/delete is
  the only removal path.
- **Removed progressive disclosure** from `EventForm` — category,
  date, start/end time, duration, repeat, and notes are all always
  visible now, for both direct event creation and Dump promotion.
  Reversal of the earlier "More options" collapse design.
- **Dump interaction rework:** tapping a card opens the (now fully
  expanded) event form directly — no separate action-sheet step.
  Swipe left reveals Delete, the only removal path now. Closing the
  form without saving leaves the item in Dump unchanged.
- **Recurrence day-of-week picker:** Weekly/Every 2 weeks/Every 3
  weeks now support selecting specific weekdays (Mo–Su), not just the
  anchor date's own weekday.
- **Category reduction:** the picker now shows 5 defaults (Work,
  Routine, Fitness, Chore, Free) plus a "+" to add custom categories.
  The other 9 legacy categories automatically resurface in the
  picker for anyone with existing events using them — no migration
  step, nothing stored changes.
- **Tap-to-edit:** custom events on Today and in Calendar's
  day-detail sheet can now be tapped (not just long-pressed) to edit,
  on any date — this was an affordance gap, not a date restriction.
- **Priority field** (Low/Normal/High) added to events — flag glyph +
  weight change on High, muted text on Low, no red/alarm styling.
  Overlap detection deliberately out of scope.
- **Brain Dump branding:** tab/header renamed "Dump" → "Brain Dump".
  Any event scheduled from a Dump item now permanently shows a 🧠 icon
  regardless of category, including through later edits.
