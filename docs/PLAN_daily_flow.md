# Plan: a calm daily flow

Planning only, 2026-11-11, on top of 3.38.0 (branch v2-redesign; shifts S1 to S3 built, `docs/PLAN_shifts.md`). No code
yet, no version bump. The five questions were answered the same day; they are decisions **D1 to D5** (section 15). The
names D1 to D5 are used because nothing in this plan refers to another plan's decisions (PLAN_shifts has its own D1 to D5
and calls PLAN_breaks_as_gaps' G1 to G5; this plan only refers to the shifts phases S1 to S4). F1 to F7 stay the names
of this plan's phases.

Goal: a calm, uncluttered planning flow, simple enough for a beginner and for someone over 50. A shift (a long block
with things inside it) counts as ONE item on every screen below, and what is inside it travels with it.

Rules for every screen: no red, no "you missed" counts, no streak loss, visible buttons (never hover only), text at
least 14 px, one main (filled) button per screen, plain words.

## 0. Today in six lines

1. **Plan my day** (`PlanningFlow.tsx`, mode `planning`) is a full screen overlay of four steps:
   - Review your work: done yesterday, and missed;
   - What do you want to get done today? (lists on the left, Today on the right);
   - Can anything wait? (Today, Tomorrow, Next week);
   - Finalise (a time per task and a preview Timebox).

   Everything is a draft (`planningDraft.ts`) until Finish (`planningActions.finishFlow`). Finish also rolls every unfinished one off task of an earlier day onto today (`rollover.planRollover`; never a repeating day). Cancel throws the draft away. It opens from the avatar menu, from a shortcut, or behind the `planning` feature.
2. **Shut down** (mode `shutdown`) has two steps:
   - review today ("Here's what you did today" and "What you missed", where the ticked ones go to tomorrow);
   - What do you want to get done tomorrow?

   Finish moves the chosen unfinished one off tasks of today to tomorrow (`planCarryToTomorrow`; repeating days never move).
3. **The Missed list** (`missed.ts`, `MissedList.tsx`, `MissedPanel.tsx`) holds the one off tasks with a Day before today that are not done. Repeating days are never listed. The left pane's quiet **Earlier** pill (`MissedButton.tsx`, a count and no loss wording) opens a panel with Today, Tomorrow, Pick a day, Remove day and Done on its own day, plus Skip all and Move all to today. Each action writes at once with a 5 second Undo. The Flows reuse the same rows as draft edits. The board's past day columns still show their unticked tasks.
4. **Quick capture** (`QuickCapture.tsx`): `Q` adds to the list the left pane shows, `T` adds to today. It is a title only, with no parsing; Enter adds and Shift+Enter keeps the box open. **Reminders:**
   - a placed task notifies at its start, or up to five chosen leads before it (`reminder.ts`, mirrored by `desktop/src/scheduler.js`);
   - planned tasks with no time get ONE grouped daily reminder (decision 020);
   - there is no morning or evening "plan" reminder.
5. **No bulk delete or clear exists.** The day menu (`DayMenu.tsx`) only has:
   - Shift unfinished to next day;
   - Push rest of week by a week;
   - Mark as away (move, spread or leave).

   **Deleting one task** writes a tombstone (`deletedAt`). It stays in the Trash for 30 days, and Restore makes a new task with a new id (`trash.ts`).
6. **Undo for one task:** Ctrl+Z (`undoStack.ts`) undoes the last gesture in this session (50 entries; writes closer than 1.5 s are one entry), and writes rows back as ordinary edits. **A repeating task's** ⋮ menu has:
   - **Skip this day**: a tombstone that keeps its rule. It is not in the Trash, but Ctrl+Z undoes it in the session.
   - **Delete repeating task**: clears the rule on every row and tombstones it. It goes to the Trash, and Ctrl+Z undoes it.

## 1. What changes, in one table

| | Today | Wanted |
|---|---|---|
| Entry | Avatar menu: Plan my day, Shut down my day, Analytics | One **Plan** button in the top bar (it picks the right flow by the clock, and any other can be chosen), and an **Analytics** text button. The avatar menu loses all three. |
| Plan my day | 4 steps, a draft, Finish | ONE screen: On today, Add to today, today's Timebox. One **Done** button. |
| Shut down | 2 steps | Renamed **Wrap up**. ONE screen: a tick per task, and Tomorrow / Back to its list / Let go on each unticked one. |
| Earlier days | Unticked tasks stay in past columns; Finish in Planning rolls them to today | Never on the board. They wait in the Earlier pill with the same three buttons and **Tick all**. No automatic roll. |
| Plan week | None | ONE screen: lists on the left, seven days with totals on the right |
| Clear | None | Clear day, Clear week, Clear list, Clear label: the count first, then one Ctrl+Z puts everything back |
| Free time line | Always at the foot of a day column | A setting, off by default |
| Quick reminder | None | Text and a time. A small bubble that takes no room and counts nowhere, with a notification. |
| Quick add | Title only | Understands "ring dentist tomorrow 9am", "gym Mon Wed 6pm 1h" |
| Card meta | Label chip (dot and name) | List chip (emoji and name). The band and dot keep the label colour. |

## 2. The entry: one Plan button (wanted 9)

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ [Tasks][Calendar][Today][Quests]                              Analytics   [☀ Plan my day ▾] (●)│
└──────────────────────────────────────────────────────────────────────────────────────────────┘
                                                                           ┌──────────────────┐
                                                                           │ ☀ Plan my day    │
                                                                           │ 🌙 Wrap up       │
                                                                           │ 🗓 Plan week     │
                                                                           └──────────────────┘
```

- The button's words follow the clock (local time):
  - **Plan my day**, 04:00 to 13:59;
  - **Wrap up**, 14:00 to 03:59;
  - **Plan week**, Sunday from 16:00 and Monday until 13:59 (Monday afternoon goes back to Wrap up).

  A press opens that flow. The ▾ part (a separate, visible chevron button) always offers all three. Both parts are visible at all times, 14 px or more, with an outlined style (the screen's main button is inside each flow).
- **Analytics** is a plain text button left of it (14 px, underlined on hover and with focus, always visible). It opens the existing Analytics page.
- **The avatar menu** loses Plan my day, Shut down my day and Analytics (both copies). It keeps Quick capture, Search, Settings, Keyboard shortcuts, Progress, Trash, Sync and Sign out.
- **Does it fit the three pane layout?** Yes. The top row already holds the centre switch (Tasks, Calendar, Today, Quests) on the left and the avatar on the right, with free room between them at 1280 px and wider. The two new controls take about 260 px. Below 1100 px the Analytics text moves into the ▾ menu as a fourth row, so nothing wraps. No left rail, no Daily highlights, no Weekly review.
- Shortcuts stay: the existing `dailyPlanning` key opens Plan my day. New keys are added in `lib/shortcuts.ts` only if they are unused (`Shift+W` Wrap up, `Shift+P` Plan week; the uniqueness test checks).

## 3. Plan my day: one screen (wanted 1)

```
┌ Plan my day · Thursday 12 November ──────────────────────────────────────────────────── [ Done ] ┐
│                                                                                                  │
│ ON TODAY                        │ ADD TO TODAY                         │ TODAY'S TIMEBOX          │
│ Untick to skip just today       │ [ Brain Dump ▾ ] ← one picker        │  08:00 ┃ Shift  5h/10h   │
│                                 │                                      │  08:30 ┃ ▌Briefing       │
│ ☑ Shift            8:00 · 10h ↻ │  Book the boiler service     [Today] │  09:00 ┃                 │
│     5 inside · 2 to dos  ▸      │  Ring the bank               [Today] │  10:00 ┃ ▌Teams press…   │
│ ☑ Water the plants        15m ↻ │  Buy a birthday card         [Today] │   …    ┃                 │
│ ☑ Pay the gas bill        30m   │                                      │  18:00                   │
│ ☐ Gym (skipped today)       ↻   │ Repeating, not on today              │  19:00  ▌Read            │
│                                 │  Clinic (next: Fri)          [Today] │                          │
│ Leave untimed, or drag a task   │                                      │  Drag a task here to     │
│ to the Timebox →                │ ▸ 3 from earlier days                │  give it a time.         │
│                                 │                                      │                          │
│ Planned 11h 15m                 │                                      │                          │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **On today** (left) lists the day's stored and repeating tasks (`bucketTasks` with projections), in the board's order. A shift is ONE row with a folded line "5 inside · 2 to dos". Opening it shows the rows with ticks (`ShiftBody`, S3).
- **Unticking a row means "not today":**
  - a one off task goes back to its list (Day cleared, time cleared);
  - a repeating day writes the usual skip tombstone ("Skip this day").

  The row stays, greyed, with "(skipped today)" and a tick to bring it back (the reverse write).
- **Add to today** (middle) has one picker: Brain Dump, then each list by name. Under it:
  - "Repeating, not on today": a series whose next day is not today. **Today** moves its next day here (the existing `moveDay`: it shows "↪ from Fri").
  - **Earlier days** stay folded as ONE line, "▸ 3 from earlier days". Opening it shows the rows with **Today**, plus the Wrap up buttons (section 5).
- **Today's Timebox** (right) is the real Timebox component for today. Drag any row onto it to give it a time (the existing drag and its 5 minute steps). A row left alone stays untimed.
- **Writes as it goes (D1):** every button, tick and drag is an ordinary write in its own gesture, so Ctrl+Z puts it back. **Done** only closes. There is no draft and no Cancel, because a real Timebox cannot show a draft. `planningDraft.ts`, `finishFlow` and the rollover on Finish go (rule 3 replaces them).
- **The figure** at the foot is "Planned 11h 15m": `totalsOf` (a shift counts once, S1). Nothing else is counted.
- **Morning notification (optional):** Settings, Planning has "Remind me to plan my day", off by default, with a time (default 08:00). It is one toast, "Good morning. Your day is ready to plan when you are.", and a click opens Plan my day. The scheduler gets a new kind, `plan`, next to `daily`. It is stored as a `user_settings` row (synced, no schema change). It never has a count in it.

## 4. Wrap up: one screen (wanted 2)

```
┌ Wrap up · Thursday 12 November ─────────────────────────────────────────────────────────── [ Done ] ┐
│                                                                                                     │
│  ☑ Pay the gas bill                                                                    30m          │
│  ☑ Water the plants                                                                    15m ↻        │
│  ☐ Book the boiler service                     [ Tomorrow ] [ Back to its list ] [ Let go ]         │
│  ☐ Tidy the shed  (2 of 5 steps)               [ Tomorrow ] [ Back to its list ] [ Let go ]         │
│        [ Only the 3 steps left to tomorrow ]                                                       │
│  ☐ Gym                        ↻                [ Tomorrow ]                      [ Let go ]         │
│  ☑ Shift                      8:00 · 10h  ↻    5 of 7 done  ▾                                       │
│        ☐ Ring other departments  2:00pm        [ Tomorrow ] [ Back to its list ] [ Let go ]         │
│        ☐ Order supplies (to do)                [ Tomorrow ]                      [ Let go ]         │
│                                                                                                     │
│  Tomorrow so far: 4 tasks, 3h 30m                                                                    │
└─────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- Every task of today gets a tick that writes at once.
- **Each unticked task has three visible buttons:**
  - **Tomorrow** sets the Day to tomorrow and keeps its time and length. A repeating day moves that day only (`moveDay`).
  - **Back to its list** clears the Day and time, so it returns to its list (or the Brain Dump). It is not offered for a repeating day.
  - **Let go** moves it to the Trash (a tombstone, restorable for 30 days, Ctrl+Z at once; D2). A repeating day is skipped (its skip tombstone), never the whole series.

  When a row is decided it folds to one grey line ("Tomorrow · Undo"). The Undo there is the same as Ctrl+Z.
- **Steps:** a task with some steps ticked and some not also offers **Only the N steps left to tomorrow**. In one gesture:
  - a copy goes to tomorrow with only the unticked steps (a new task, same title, list, label, length);
  - today's task keeps its ticked steps, loses the unticked ones, and is ticked done.

  One Ctrl+Z undoes both.
- **A shift is one row.** Its unticked inside rows are listed under it with the same buttons.
  - **Tomorrow on the shift** moves the shift and everything inside it that is not done (needs S4's carry, see the phases).
  - An inside to do offers only Tomorrow (it moves with the shift's tomorrow, or a copy of the shift's checklist item if the shift stays) and Let go (removes it from the checklist).
- **Done** closes. The figure "Tomorrow so far: 4 tasks, 3h 30m" counts a shift as one task and once (S1).
- **Evening notification (optional):** "Remind me to wrap up", off by default, default 18:00. One toast, "Time to wrap up the day, if you like.", which opens Wrap up.

## 5. Earlier days never stay on the board (wanted 3)

- **Past day columns** on the Tasks board draw only DONE tasks (history). An unticked one off task of an earlier day is not drawn there. It waits in the **Earlier** pill.
- Nothing moves on its own: there is no automatic roll, and Plan my day's Finish rollover is removed.
- The Calendar keeps showing past days as they were (D5).
- **The Earlier panel** is the Missed panel, rebuilt with the Wrap up rows:
  - Tomorrow, Back to its list and Let go on each row, plus one **Tick all** at the top ("Tick all 3: done on their own days", the existing Skip all write);
  - a fourth button, **Today**, shows only before 14:00, when you are planning, not wrapping up.
- Repeating days are still never listed (unchanged, 3.25.0).
- The pill keeps its quiet count. Its words stay "Earlier", never "missed" or "overdue".
- **Shifts:** an earlier unticked shift is one row, with its inside rows folded under it.
- Plan my day shows the same rows folded as one line (section 3).

```
┌ Earlier ─────────────────────────────────────────────── [ Tick all 3 ] ┐
│ Tue 10  Book the boiler service   [Today] [Tomorrow] [Back to its list] [Let go] │
│ Wed 11  Ring the bank             [Today] [Tomorrow] [Back to its list] [Let go] │
│ Wed 11  Shift (2 inside left)  ▸  [Today] [Tomorrow]                    [Let go] │
└──────────────────────────────────────────────────────────────────────────────────┘
```

## 6. Plan week: one screen (wanted 4)

```
┌ Plan week · 16 to 22 November ───────────────────────────────────────────────────────────── [ Done ] ┐
│ THIS WEEK'S LISTS          │ Mon 16   │ Tue 17   │ Wed 18   │ Thu 19   │ Fri 20   │ Sat 21 │ Sun 22   │
│ [ Brain Dump ▾ ]           │ 10h 30m  │ 10h      │ 1h       │ 10h 30m  │ 10h      │ —      │ —        │
│  Book the boiler service   │ Shift ↻  │ Shift ↻  │ Dentist  │ Shift ↻  │ Shift ↻  │        │          │
│  Clean the oven            │ Read     │          │          │ Read     │          │        │          │
│  Call Mum                  │          │          │          │          │          │        │          │
│                            │          │          │          │          │          │        │          │
│ ▸ 4 left from last week    │          │          │          │          │          │        │          │
│                            │ Click a task, then a day. Or drag it.                                    │
└───────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- The **left** column shows the Brain Dump and the lists, through one picker, like Plan my day.
- The **right** side shows the seven days of the week the flow is for. On Sunday from 16:00 that is next week, otherwise this one.
  - Each day shows its titles and its planned total (`totalsOf`, so a shift counts once at its own length, S1).
  - The rows inside a shift are not listed: the shift is one line.
- **Placing:** drag a task onto a day, or click a task (it is highlighted with "Choose a day") and then click a day. Both write at once, one gesture each, and Ctrl+Z works.
- **Last week's leftovers** are one folded line, with the Wrap up buttons plus a day picker ("This week ▾").
- Plan week has no notification of its own. The Plan button simply offers it on Sunday evening and Monday morning.

## 7. Clear tools (wanted 5)

**Where:**
- **Clear day** is in the day header ⋯ menu (`DayMenu`, the board).
- **Clear week** is in the Tasks board's nav row (a ⋯ next to the title) and the Calendar's Week header.
- **Clear list** is in the list menu (`AddTaskBox` list menu).
- **Clear label** is in the label's menu (`LabelsPage`, and the Filter's label rows).

```
┌ Clear Wednesday? ─────────────────────────────────────────────┐
│ 14 tasks are planned for Wednesday 18 November.                │
│ They go back to their lists. Nothing is deleted.               │
│                                                                │
│ 2 of them repeat:  (•) This day only   ( ) All days            │
│                                                                │
│                          [ Cancel ]   [ Clear 14 tasks ]       │
└────────────────────────────────────────────────────────────────┘

┌ Clear the label "Home"? ──────────────────────────────────────┐
│ 9 tasks have this label. The label comes off them; the tasks   │
│ stay where they are.                                           │
│                                                                │
│ [ Move the 9 tasks to Trash ]       [ Cancel ]  [ Clear label ]│
└────────────────────────────────────────────────────────────────┘
```

**The count comes first** and counts what will change: a shift is one, plus its inside items ("14 tasks, a shift counts as one with what is inside it"). Done tasks are never touched: they are history.

**Safest data handling (D3 for the label):**

| Tool | What it writes | Why |
|---|---|---|
| Clear day / Clear week | Unticked one off tasks lose their Day and time and go back to their lists. Repeating days: **This day only** writes a skip tombstone for each of those days; **All days** stops the series from that day on (the existing "Does not repeat" from that day, not a delete). | Nothing is deleted. The work stays in its list. |
| Clear list | Its unticked tasks go to the **Trash** (tombstones, restorable 30 days). The list itself stays. A repeating task asks This day only / All days: All days is "Delete repeating task", into the Trash too. | The only tool that removes tasks, so it says "move 14 tasks to the Trash". |
| Clear label (D3) | By default the label comes off its tasks (`projectKey` cleared) and the tasks stay where they are. The confirmation also has a small, outlined second button, **Move the N tasks to Trash**, which tombstones the unticked ones (the label's done tasks stay as history). Repeating tasks ask This day only / All days, as for Clear list. | A label is a colour, not a place: removing tasks by colour must be the deliberate, second choice, never the main button. |

**Undo:**
- Each tool is ONE gesture, so ONE Ctrl+Z restores everything.
- A new batch write, `storage.updateTasks(rows)`, records the rows as one undo entry, instead of hundreds of single writes that could stretch past the 1.5 s grouping. It also queues them for sync together.
- A toast offers "Cleared 14 tasks · Undo" for 10 s.
- For longer than the session: Clear list's tasks are in the Trash, and Clear day, week and label wrote ordinary edits that nothing deletes.

**No database change:** every write is an existing field (`dueDate`, `startTime`, `projectKey`, `deletedAt`, the rule fields) or an existing tombstone.

## 8. The Free time line becomes a setting (wanted 6)

- A new row in Settings, Planning: "Show free time at the foot of each day". It is **off by default**.
- It is stored as a `user_settings` row, `board.free_time_line` (synced, no schema change).
- When off, `KanbanPane` does not draw `BreakLine`, and the gaps on the Calendar and Timebox stay the only sign of free time.
- A Break with no time still has its card (unchanged).

## 9. Quick reminders (wanted 7)

- **What it is:** text and a time, with no length. For example "Ring the pharmacy 11:15" or "Take tablets 20:00".
- **Where it shows:**
  - On the **Timebox** and the **Calendar** it is a small round bubble at its time on the left edge of the column, with "⏰ 11:15 Ring the pharmacy" on hover and in a 14 px label when there is room. It takes no lane, and blocks are laid out as if it were not there (`layoutItems` never sees it).
  - On the **Tasks board** it is a one line row at the top of its day column ("⏰ 11:15 Ring the pharmacy", a tick at the left), not a card.
  - It counts in no total, estimate, shift summary or Analytics figure.
- **It notifies** at its time (the existing per task reminder at the start). A tick clears it: the bubble goes, and the row folds into the day's done list.
- **Storage (D4):** a quick reminder is a timed task with `durationMinutes: 0`.
  - `syncCore.sanitizeDuration` today only accepts 1 to 1440, so a 0 would be uploaded as NULL and every other device
    would draw a 30 minute block. F6 allows 0 there (writing and reading; the same shared file, so the phone accepts it
    too).
  - **No database change.** Jethro checked the live database: `tasks.duration_minutes` is a plain integer with no check
    constraint. (The draft schema's `> 0` check and the migration's "1 to 1440" comment were never applied.)
  - **Older builds** receive 0 and draw it as a 30 minute block that counts 0 minutes. An older build that EDITS a
    reminder uploads NULL and turns it into an ordinary task: a quiet, rare loss, said in the CHANGELOG.
  - The pure rule is `isQuickReminder(t) = t.durationMinutes === 0 && !!t.startTime && !!t.dueDate`.
- **Making one:** in Quick capture, a time with no length ("ring the pharmacy 11:15") offers a small toggle, "Just a reminder (no length)", which defaults on when the text has a time and no length. The details window has a "Reminder only" switch.

## 10. Quick add understands simple phrases (wanted 8)

- **A small pure parser,** `lib/quickParse.ts`, with tests. It reads the end of the text and leaves the rest as the title:
  - days: today, tomorrow, a weekday (the next one), "next Mon", "12 Nov";
  - times: "9am", "9:30", "18:30", "6pm";
  - lengths: "1h", "30m", "1h 30m", "for 45 min";
  - repeats: two or more weekdays ("Mon Wed") or "every Mon" (weekly on those days), "every day".
- **The parse shows before Enter** as one line under the box: "Tomorrow · 9:00am" or "Mon, Wed · 6:00pm · 1h · repeats". It has an × that keeps the words as plain title text instead.
- **Examples:**
  - "ring dentist tomorrow 9am" gives "ring dentist", tomorrow, 09:00.
  - "gym Mon Wed 6pm 1h" gives "gym", weekly Mon and Wed from the next of them, 18:00, 60 min.
- **Worth building:** exactly this set, about one day with its tests. **Not worth it:** relative phrases ("in 3 days", "the week after next"), months of the year in words beyond "12 Nov", ranges ("9 to 11"), and labels or lists typed with symbols (#, @). Those are rare for the people this is for, and a wrong guess costs more than typing the time.

## 11. Cards show the list (wanted 10)

```
┌──────────────────────────────┐      ┌──────────────────────────────┐
│▀▀▀▀▀▀▀▀ label colour band ▀▀▀│      │▀▀▀▀▀▀▀▀ label colour band ▀▀▀│
│ ○ Book the boiler service 30m│  →   │ ○ Book the boiler service 30m│
│   ● Home                     │      │   ● 🏠 House jobs            │
└──────────────────────────────┘      └──────────────────────────────┘
       (dot + label name)                  (dot in label colour + list emoji and name)
```

- `TaskCard`'s first meta line becomes: the dot in the label colour, then the list's emoji and name (`listTitle`), at 14 px. The band keeps the label colour.
- The label name moves to the card's tooltip and the details. A Brain Dump task (no list) shows the dot only.
- The left pane's rows already sit in their list, so they keep showing nothing extra.

## 12. Shifts on every screen

| Screen | A shift is | What is inside it |
|---|---|---|
| Plan my day | One row on "On today", "5 inside · 2 to dos" | Folded under it. Unticking the shift skips the shift only. |
| Wrap up | One row | Its unticked rows under it with the buttons. Tomorrow on the shift takes them along. |
| Earlier | One row | Folded |
| Plan week | One line, its own length in the total | Not listed |
| Clear | One in the count | Changed with it |
| Totals everywhere | Once, at its length less free time (S1) | Never added |

## 13. Phases, effort and model

**Shifts S4 runs first** (inside items move with their shift; skip and delete offers; `docs/PLAN_shifts.md`, about 1 day,
Opus): Wrap up's Tomorrow on a shift, and Clear on a day with a shift, move or change what is inside it with the shift.

Then, in this order. Each phase is one version, with targeted real checks in quiet mode while building and the full
regression at the end of F7.

| Phase | What | Model | Why | Effort |
|---|---|---|---|---|
| F1 Entry and small things | The Plan button and its chevron, the Analytics text button, the avatar menu trimmed; the Free time line setting; cards show the list | **Sonnet** | UI moves on settled code | 1 day |
| F2 Clear tools | Day, week, list and label; the count first; `updateTasks` batch write as one undo entry; This day only / All days; Clear label's second button "Move the N tasks to Trash" (D3) | **Opus** | Bulk writes, undo grouping and series rules are where data can go wrong | 1½ days |
| F3 Wrap up and Earlier | The Wrap up screen; the three buttons; steps to tomorrow; shifts as one row; Earlier panel rebuilt with Tick all; past board columns draw done tasks only (D5); no rollover; the evening notification | **Opus** | Repeating days, the steps split, shifts and undo meet here | 2 days |
| F4 Plan my day | One screen; untick to skip today; Add to today with the picker and repeating tasks; the real Timebox to drag onto; save as you go with Undo (D1); `planningDraft` removed; the morning notification | **Opus** | It removes the draft model, and the drag and skip writes must stay one gesture each | 2 days |
| F5 Plan week | One screen, seven days with totals, click or drag, last week's leftovers | **Sonnet** | Reuses F3 and F4 pieces | 1½ days |
| F6 Quick reminders | `isQuickReminder`, 0 allowed in sync (D4), the bubble on the Timebox and Calendar, the board row, notification, tick | **Opus** | Sync rules and older builds, and the layout must ignore it | 1½ days |
| F7 Quick add phrases | `quickParse.ts`, the preview line, the reminder toggle | **Sonnet** | Pure parser with tests | 1 day |

That is about 10½ days for F1 to F7, plus S4 first.

**Does Clear (F2) depend on the others?** No. It needs only what is built already: the existing writes (Day and time
cleared, `projectKey` cleared, tombstones, skip, "Does not repeat from here") and S3's `shiftsOfDay`, to count a shift as
one with what is inside it. It adds the batch write `storage.updateTasks` itself. Wrap up's "Let go" (D2) and Tick all
(F3) then reuse that batch write, so F2 first saves work later. Its only link is S4: a cleared day that holds a shift
takes the shift's inside items along, which uses S4's carry rules, and S4 runs first anyway.

F1 and F2 are each safe alone. F3 and F4 belong together for a beta, because rule 3 (no rollover) needs both the Earlier
panel and Plan my day's folded line.

## 14. Risks

| Risk | What breaks | Plan |
|---|---|---|
| **Sync** | A Clear writes hundreds of rows at once. An older build's Daily Planning Finish still rolls earlier tasks onto today. A reminder edited on an older build loses its 0. | `updateTasks` batches the queue. Older builds' rolls are the person's own action, and the rows are ordinary edits. The reminder loss is in the CHANGELOG and is rare. The live `duration_minutes` has no check constraint (D4). |
| **Repeating days** | Unticking in Plan my day, Let go, Clear "This day only" and Tomorrow on a series day each touch one day of a series | They use only existing writes (skip tombstone, `moveDay`, "Does not repeat from here"). "All days" never deletes in Clear day or week, and only Clear list puts a series in the Trash. |
| **Undo** | The stack is session only, 50 entries, grouped by time | Each button is one gesture (`markGesture`); a Clear is one batch. For anything older, the Trash (30 days) and plain edits remain. |
| **Shifts** | A shift moved to tomorrow without its inside items splits it across days | S4 runs first. Wrap up's Tomorrow and Clear go through the shift carry. |
| **Removing the draft** | Plan my day writes as it goes, and there is no Cancel (D1) | Every write is undoable at once, and the folded "Tomorrow · Undo" lines make it visible. |
| **Past columns hide unticked tasks** | Someone looks for yesterday's task on the board | The Earlier pill and its count are next to the board. The Calendar keeps history (D5). |
| **Tests that pin the old flow** | Units: `planningDraft.test`, `rollover.test` (Finish rollover), `missed.test` (actions), `shortcuts.test` (new keys). Real checks: p5, p7, p23, p43, p46 (Planning and Shutdown steps, Finish, Missed panel), cp11 (no loss wording), p27 and p48 (the "☕ Free time" line, now off by default), p22 and any check of card meta (label chip to list chip), avatar menu checks (ProfileMenu rows). Phone: phone-p9 and phone-p17 are untouched (the phone keeps its flows until a phone phase). | Each phase rewrites the checks it breaks, on purpose, listed in the CHANGELOG |
| **The phone** | It shares `lib` (missed, rollover, totals, sync) | Desktop only for F1 to F7. A phone phase follows S5. `sanitizeDuration` (F6, D4) is shared, so the phone's reader must accept 0 too (the same file). |

## 15. Decisions (2026-11-11)

1. **D1, save as you go with Undo.** Plan my day and Wrap up write each tick, button and drag at once, in its own
   gesture: Ctrl+Z and the folded "Undo" on a decided row put it back. Done only closes. There is no draft and no Cancel.
2. **D2, Let go moves to the Trash.** A one off task is tombstoned (restorable for 30 days, Ctrl+Z at once). A repeating
   day is skipped, never the whole series. It is not counted as done.
3. **D3, Clear label takes the label off by default.** The confirmation's main button clears the label and leaves the
   tasks where they are. A small, outlined second button, **Move the N tasks to Trash**, tombstones them instead.
4. **D4, quick reminders are timed tasks with 0 minutes, allowed in the app code.** `sanitizeDuration` and its reader
   accept 0. Jethro checked the live database: `duration_minutes` is a plain integer with no check constraint, so **no
   database change**.
5. **D5, past days: the board only.** The Tasks board's past columns draw only done tasks; unticked ones wait in the
   Earlier pill. The Calendar keeps showing past days as they were planned.
