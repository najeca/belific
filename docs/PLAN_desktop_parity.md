# Plan: the phone's 3.59.0 to 3.65.1 work on the Windows desktop (PLAN_desktop_parity)

Written 2026-11-21 on `v2-redesign` at 3.65.1. **Plan only: no app change, no database change, no push, no EAS build.**
Where this plan makes a choice of its own it says "chosen here"; the questions at the end ask Jethro to confirm them.

Read first: `docs/CURRENT_TRUTH.md`, `docs/PROJECT_HANDOVER.md`, `docs/PLAN_phone_stepflow.md` (sections 1 to 4 and
its decisions), `docs/PLAN_phone_parity.md` (phase 9). **`docs/PLAN_push_after.md` does not exist** on any branch, and no
file in `docs/` or `mobile/` describes a "push after" behaviour (searched for push after, push_after, pushAfter). Its
row below is a placeholder and question 1 asks what it is.

Facts below were read from the code at 3.65.1. "Deciding file" is the file that settles the answer.

## 1. Feature table

| # | Phone feature (version) | Desktop has it? (deciding file) | Desktop adaptation | Shared code to reuse |
|---|---|---|---|---|
| 1 | **Step by step add flow** (3.59.0): What's on your mind (Next stores the task at once, no Day), then When (Today, Tomorrow, Pick a date), What time (time, length chips, Just a reminder), Which list or label, Anything else (notes, smaller tasks). Skip, Back, dots, close keeps the task. | **No.** The desktop adds through `QuickCapture.tsx` (one line with phrases) and the pane add boxes (`AddTaskBox.tsx`); neither has the steps. | A centred dialog (about 560 px wide) over the home, not full screen. Opened by a "+ Add" button in the header and a keyboard shortcut. Enter is Next, Esc closes (keeps the task, as on the phone), Tab moves through answers, keys 1 to 3 pick Today, Tomorrow, Pick a date. Quick Capture stays as the fast path. | `lib/stepFlow.ts` (which screens follow), `lib/quickParse.ts`, `lib/detailsPatches.ts`, `lib/taskCommands.ts`, `lib/taskOps.ts`, `lib/parts.ts`, `lib/partActions.ts`, `lib/hostActions.ts`. **The store and write sequence lives inside `components/phone/StepAdd.tsx` (`store()`, `next()`) and must move to a shared `lib/stepAddActions.ts` first.** |
| 2 | **Today Now card** (3.60.0): Now with time left, Next with "in 55 min", label edge and pill, Free time, Nothing else today, A free day, a Done button; updates each minute and on return from the background. | **No.** The Timebox draws a now line only (`TimeboxPane.tsx`); there is no Now and Next card. | A wide card at the top of a new Today view (section 2). Minute timer while the window is shown, and a redraw on window focus and on resume from sleep (Electron `powerMonitor` resume), the desktop's version of the phone's `AppState` listener. | `lib/nowCard.ts` (words). **The item mapping (today's timed items to `NowCardItem`) is inline in `app/(tabs)/today.tsx` lines 254 to 263 and must move to shared.** |
| 3 | **Today timeline of bubbles** (3.60.0): one bubble per timed item, height by length (44 to 160 pt), list emoji, label colours, tick on the right, Now marker on the line, cut breaks as gaps, smaller tasks and shift rows nested. | **Partly.** The Timebox (`TimeboxPane.tsx`, `TimeBlock.tsx`) is a 24 hour grid of the same items with drag and resize, but not the bubble timeline. | Inside the Today view, a column beside the Anytime column (not under it). Same bubble rules; a hover shows the tick and a menu button; right click opens the same menu. The Timebox stays as the place to set and change times. See question 3. | `lib/todayTimeline.ts` (heights, Now marker), `lib/todayView.ts` (`buildToday`), `lib/cuts.ts`, `lib/shifts.ts`, `lib/hosting.ts`, `lib/parts.ts`. **Timeline sorting and the shift hiding (`ownTasks`, `shifts`, `view`, `timeline` in `today.tsx` lines 239 to 280) must move to shared.** |
| 4 | **Hours per label strip** and the **Count in daily hours** switches (3.60.0): a bar per label, done and planned both, reminders never counted, a shift once, Sleep and Break off by default; switches in Settings and in the label sheet. | **No** for today's strip. Analytics (`AnalyticsPage.tsx`) has per label totals over a period with its own rules (`lib/analytics.ts`), and does not read the switches. The switches are only in the phone's `app/components/DailyHoursSection.tsx` and `components/phone/LabelSheet.tsx`. | The strip under the Now card, full width, with the legend on one line. The switches: a "Daily hours" section in the desktop `SettingsPage.tsx` and a switch in `LabelForm.tsx`. | `lib/labelHours.ts` (pure), the `hours.count.<labelKey>` rows through `lib/storage.ts` (`loadUserSettingsRaw`, `setUserSetting`, already used by desktop stores such as `cutStore.ts`). |
| 5 | **Anytime slab cards with a per day order** (3.60.0): each untimed task for today its own card, hold then drag reorders, the order stored as `user_settings` `today.order.YYYY-MM-DD`, rows older than 14 days deleted. | **No.** The desktop Tasks board (`KanbanPane.tsx`) orders a day's cards by its own rule and has no stored order; `lib/anytimeOrder.ts` says "The desktop does not read it". | The Anytime column of the Today view. Drag and drop with the mouse through the existing `DragProvider.tsx` (pointer events, decision 019), with a drop line between cards; Alt+Up and Alt+Down move the focused card (chosen here). **Question 4: should the Tasks board's today column use the same order?** | `lib/anytimeOrder.ts` (`parseOrder`, `applyOrder`, `staleOrderKeys`, `orderKey`). **The stale row clean up runs inside `today.tsx` `load()` (lines 214 to 219); it must move to shared so only one rule deletes rows.** |
| 6 | **Tasks tab slab cards** (3.61.0): every task its own card with a gap, list name small, label edge and dot. | **Partly.** Desktop cards (`TaskCard.tsx`) already are separate cards with a meta line (p43: list emoji, label), but no slab offset shape and no label colour edge. | The slab offset on the desktop is a real `boxShadow` (web supports it), same offset, colour and radius as `components/phone/Slab.tsx`, off in dark. A 4 px label edge on the left of `TaskCard`. Applies to the left pane and the board. | The slab numbers as tokens in `lib/tokens.ts` (new), `lib/labelColors.ts`. |
| 7 | **Repeats grouped** by Daily, Weekly, Every 2 weeks, Monthly (and Every few weeks, Every year, Other when present), each collapsible and remembered per device, the pattern in words, "Until 17 Dec". | **Partly.** Quests (`QuestsPage.tsx`) groups series by `QUEST_SECTIONS`, with streaks, not folds, words or Until. The left pane (`BrainDumpPane.tsx`) has no Repeats group. | A "🔁 Repeats" entry in the left pane list switcher (`ListSwitcher.tsx`) that shows the groups; a header click or Enter folds; the fold state in the desktop's local `kv` (never synced, as decision B2.2). | `lib/quests.ts` (`QUEST_SECTIONS`, `questsBySection`), `lib/repeatWords.ts`, `lib/repeatFolds.ts`. **The grouping of the Tasks tab (`REPEATING` and the group build inside `app/(tabs)/tasks.tsx`) must move to a shared `lib/repeatGroups.ts`.** |
| 8 | **Plan my day, Wrap up, Plan week** and the time of day rule for the Plan button (3.62.0, 3.65.0). | **Yes.** The desktop had them first: `PlanButton.tsx` (`planFlowAt`), `PlanMyDay.tsx` (one screen), `WrapUp.tsx`, `PlanWeek.tsx`; writes in `lib/wrapActions.ts`. | Nothing to build, unless question 5 asks for the phone's one task at a time style. | Already shared: `lib/planEntry.ts`, `lib/planDay.ts`, `lib/wrapUp.ts`, `lib/wrapActions.ts`. **Drift risk:** the phone's queues (`lib/planQueue.ts`, `lib/wrapQueue.ts`, `lib/weekQueue.ts`) decide what is asked; the desktop screens decide it inside their own components. See section 3. |
| 9 | **Push after** (planned). | **Not recorded.** No plan file or code found. | Not planned until question 1 is answered. If it means moving the rest of today later when running late, the desktop already has a part of it: `lib/lateTasks.ts` and `lib/lateActions.ts` ("Move to next free slot today", one task at a time, on faded blocks in `TimeBlock.tsx`). | Possibly `lib/lateTasks.ts`, `lib/lateActions.ts`. |
| 10 | **No red and no priority** on the phone (3.60.0, 3.63.0): no ❗, no Top priority switch. | **No.** The desktop draws the red ❗ (`PriorityMark.tsx`, used by `TaskCard.tsx`, `TimeBlock.tsx`, `CalendarPane.tsx`, `TimeboxPane.tsx`) and has the switch (`TaskDetailPanel.tsx`, `TaskPopovers.tsx`). The danger colour is used for delete actions. | Hide the mark and the switch on the desktop; quiet delete actions. The stored value and the sort rules stay (question 2). | `lib/mustDo.ts` stays as it is. |
| 11 | **Done today fold** under Anytime (3.60.0). | **Partly.** The left pane has a collapsed "Done today" (CURRENT_TRUTH, Brain Dump pane). | Part of the Today view, under Anytime. | `buildToday` (`done`). |
| 12 | **Labels: create, edit, delete** (3.61.0, 3.64.1). | **Yes** (`LabelsPage.tsx`, `LabelForm.tsx`, the shared `deleteLabel`). Only the Count in daily hours switch is missing (row 4). | Row 4. | |
| 13 | **Search and Trash** (3.61.0). | **Yes** (`SearchPalette.tsx`, `TrashPage.tsx`). | Nothing. | `lib/taskSearch.ts`, `lib/trash.ts`. |
| 14 | **Earlier pill** (3.59.1). | **Yes**, as Missed (`MissedButton.tsx`, `MissedPanel.tsx`). | Nothing; question 6 asks whether to rename it Earlier. | `lib/wrapUp.ts` `earlierItems`. |
| 15 | **Calendar shells** for shifts on the Day view (3.64.0). | **Yes** (`ShiftBody.tsx`). | Nothing. | `lib/shifts.ts`. |
| 16 | **Press and hold card** of actions (`HoldCard.tsx`). | **Partly.** Cards have hover controls and popovers (`TaskPopovers.tsx`); right click only on Timebox blocks (`TimeBlock.tsx` is the only file with `onContextMenu`). | Right click on every task card, Anytime card and bubble opens one menu with the HoldCard's actions; Shift+F10 and the Menu key open it from the keyboard. | The action list should be one shared list (section 3). |
| 17 | **Phone calendars, read only** (iOS `deviceCalendar.ts`). | Not applicable: Windows has no system calendar API in this app. The desktop has ICS subscriptions (`icsSubscriptions.ts`). | Nothing. | |

Phone things with no desktop need: the iPhone Google sign in sheet, the swipe actions, the tab bar.

## 2. Desktop decisions

- **Hold to reorder becomes drag and drop.** Through the existing `DragProvider.tsx` (pointer events, decision 019), not
  a second drag system. Drag starts after a 4 px move, as desktop drags do now. A plain click still opens the card.
  Keyboard: Alt+Up and Alt+Down move the focused Anytime card (chosen here). Each move writes the same
  `today.order.<day>` row the phone writes.
- **Keyboard and focus for the add flow.** One shortcut opens it (chosen here: a key free in `lib/shortcuts.ts`, checked
  in the phase and listed in `ShortcutHelp.tsx`). Focus starts in the text box. Enter is Next; Shift+Enter is a new
  line on screen 1. Esc closes and keeps the task, as on the phone. Tab order on each screen: the answers, then Back,
  Skip, Close. Keys 1 to 3 pick the first three answers on screens 2 and 4. The dots read "Step 2 of 5".
- **A wide window, not a copy of the phone column.** A new **Today** view in the centre, beside the Tasks board and the
  Calendar (chosen here; question 3). The Now card and the hours strip across the top. Under them, two columns side by
  side: the timeline on the left (about 60 percent), Anytime and Done today on the right. The Timebox stays on the
  right of the home as now. Under about 1100 px wide the two columns stack.
- **Right click and hover menus.** Right click on any card or bubble opens one menu with the phone HoldCard's actions.
  Hover shows the tick and a small "..." button, as desktop cards do now. Nothing appears only on hover that cannot be
  reached by keyboard.
- **No red and no priority display**, as on the phone (question 2): the ❗ goes from every desktop surface, the Top
  priority switch goes from the details, delete actions use the quiet style. The stored value stays and syncs.

## 3. Shared modules versus phone only files

**Already shared and pure (both apps can use them today):** `nowCard.ts`, `todayTimeline.ts`, `anytimeOrder.ts`,
`labelHours.ts`, `stepFlow.ts`, `repeatWords.ts`, `repeatFolds.ts`, `quests.ts`, `todayView.ts`, `planEntry.ts`,
`planDay.ts`, `wrapUp.ts`, `wrapActions.ts`, `planQueue.ts`, `wrapQueue.ts`, `weekQueue.ts`, `planGuard.ts`,
`flowActions.ts`, `planActions.ts`, `earlierUndo.ts`. Of these, no desktop file imports `nowCard`, `todayTimeline`,
`anytimeOrder`, `labelHours`, `stepFlow`, `repeatWords`, `repeatFolds` or the phone's three queues yet.

**Rules that live only in phone screens and must move to shared before the desktop uses them** (otherwise the desktop
needs a second copy):
1. `app/(tabs)/today.tsx` `load()` and the memos (lines about 190 to 285): shift hiding, which items are "own", the Now
   card item mapping, the timeline order, Anytime with its order, the done split, and the stale order row clean up.
   Move to a pure `lib/todayModel.ts` (one function from tasks, day, minute, cut, order, stored switches to the whole
   view) plus `lib/todayModelActions.ts` for the clean up. **Highest drift risk:** both apps would otherwise decide
   what is "now" and what is "Anytime" separately.
2. `components/phone/StepAdd.tsx` `store()` and `next()`: what each step writes, the phrase answers, closing with text
   stores it. Move to `lib/stepAddActions.ts`.
3. `app/(tabs)/tasks.tsx`: the Repeats groups (which tasks, which group, sort inside a group). Move to
   `lib/repeatGroups.ts`.
4. The action list of `components/phone/HoldCard.tsx`: which actions a card offers. Move to `lib/cardActions.ts` so the
   desktop right click menu offers the same ones.

**Places where the desktop already has its own copy of a rule (flagged, not changed by this plan):**
- **What Plan my day, Wrap up and Plan week ask.** The phone uses `planQueue.ts`, `wrapQueue.ts`, `weekQueue.ts`; the
  desktop builds its lists inside `PlanMyDay.tsx`, `WrapUp.tsx`, `PlanWeek.tsx` from the same `planDay` and `wrapUp`
  helpers. The writes are shared; the selection is not. Phase D6 makes the desktop screens read the phone's queues.
- **The phone's Plan my day writes** go through `lib/planActions.ts` (with `planGuard.ts` refusing Not today on an
  unstarted series); the desktop's go straight to `wrapActions.ts` and have no such guard. The underlying shared
  `series.planSkip` behaviour is still open item 7 of the handover.
- **Per label hours.** Analytics (`lib/analytics.ts`) and the hours strip (`lib/labelHours.ts`) count minutes with
  different rules (the strip skips reminders and switched off labels). Chosen here: they stay different on purpose
  (a period report versus today's plan), and the Analytics page says so in a line.
- **The Anytime fallback order** (when no stored order) uses top priority first. With priority hidden (question 2) it
  would still sort by a value nobody can see. Question 2 covers this.

## 4. Phases in build order

Each phase: a version bump in `mobile/app.json` and `easConfig.test.ts`, CHANGELOG, `docs/build-progress.md`, an app
commit, a separate commit for checks changed on purpose, then the gates (tsc, mobile and desktop unit tests, the iOS
export and marker gate, the security scan) and the targeted real checks. Phases D1 and D2 change no behaviour on
either app; each later phase is desktop only unless it says so.

| # | Version | Phase | Files touched | Targeted tests | Model |
|---|---|---|---|---|---|
| D1 | 3.66.0 | **Move the phone screen rules to shared** (section 3, items 1 to 4). No behaviour change. | new `lib/todayModel.ts`, `lib/todayModelActions.ts`, `lib/stepAddActions.ts`, `lib/repeatGroups.ts`, `lib/cardActions.ts`; `app/(tabs)/today.tsx`, `app/(tabs)/tasks.tsx`, `components/phone/StepAdd.tsx`, `components/phone/HoldCard.tsx` | new unit tests for each new file; phone real checks phone-p25 (add flow), phone-p27 (Today), phone-p28 (Tasks) unchanged and passing | Opus |
| D2 | 3.67.0 | **No red and no priority on the desktop** (row 10), if question 2 says yes. | `PriorityMark.tsx` and its five users, `TaskDetailPanel.tsx`, `TaskPopovers.tsx`, delete button styles | quiet checks that read the ❗ or the switch, changed on purpose; a new quiet check `p70` (no ❗ anywhere, no switch) | Sonnet |
| D3 | 3.68.0 | **Today view**: Now card, hours strip, timeline, Anytime with drag order, Done today; the Daily hours switches in Settings and `LabelForm`. | new `components/desktop/TodayPane.tsx`, `NowCard`, `HoursStrip`, `Timeline`, `AnytimeColumn` desktop parts; `DesktopHome.tsx` (the view switch), `DragProvider.tsx` (an Anytime drop target), `SettingsPage.tsx`, `LabelForm.tsx`, `useHomeShortcuts.ts` | quiet check `p71` (each Now card state with a fixed clock, the minute update, focus redraw, timeline order and heights, strip and switches, light and dark); **pointer check `p72`** (drag reorder stored and kept after a reload, Alt+Up/Down) | Opus for the view and drag, Sonnet for Settings |
| D4 | 3.69.0 | **Step by step add on the desktop** (row 1). | new `components/desktop/StepAddDialog.tsx`; `DesktopHome.tsx` (button), `lib/shortcuts.ts`, `ShortcutHelp.tsx` | quiet check `p73` (each screen, Skip, Back, Esc keeps the task, Just a reminder stores 0 minutes, the stored row after each answer, keyboard only run) | Sonnet |
| D5 | 3.70.0 | **Repeats groups and slab cards** (rows 6, 7) and the right click menu (row 16). | `ListSwitcher.tsx`, `BrainDumpPane.tsx`, `TaskCard.tsx`, `lib/tokens.ts`, a desktop menu over `lib/cardActions.ts` | quiet check `p74` (groups, words, Until, folds kept after a reload, slab and edge in light and dark, right click and Shift+F10 menus); pointer checks that click card controls rechecked (p43, cp8e) | Sonnet |
| D6 | 3.71.0 | **Plan flows read the shared queues** (section 3, the flagged copy). The desktop look stays unless question 5 says otherwise. | `PlanMyDay.tsx`, `WrapUp.tsx`, `PlanWeek.tsx`, possibly `planQueue.ts` for one desktop only answer | the desktop Plan checks (run the existing quiet ones that open the Plan screens); unit tests of the queues extended | Opus |
| D7 | later | **Push after**, after question 1. | not known | not known | Opus to plan |

Order chosen here: D1 first (it removes every second copy before the desktop uses the rules), then D2 (small, makes
the new screens start without red), then the Today view, the add flow, the lists, and last the plan flows.

## 5. Risks

- **Sync conflicts on the Anytime order.** One `user_settings` row per day is last writer wins: a reorder on the phone
  and one on the desktop before either syncs keeps only one of the two. Nothing is lost (a task missing from the order
  goes after the ordered ones), only the order. Also: both apps run `staleOrderKeys` clean up; both must use the same
  14 days (D1 makes it one function). A device with a wrong clock could delete today's row; the rule should only delete
  rows older than 14 days by the row's own day key, which it does now.
- **The Count in daily hours switches** have the same last writer wins behaviour; rare and harmless.
- **Push after:** unknown until question 1. If it moves several tasks at once, a push on one device while the other
  edits one of those tasks is the usual per task last writer wins; a push should be one Undo step on the device that
  made it and must not write rows that did not move.
- **Hiding priority on the desktop** removes the only place it can be set. Old tasks keep the flag and it still sorts
  them. Question 2.
- **Electron and the minute update.** A timer does not run while Windows sleeps; the redraw on resume and focus is the
  fix and only a real machine shows it.
- **Pointer only checks** (26, run by Jethro with the mouse cleared): `cp8b` to `cp8h` (drag, card controls, the
  duration chip, the Timebox, repeating), `cp9` (the profile icon), `cp10`, `cp11`, `cp12`, `p2`, `p3` (the layout:
  D3 adds a centre view), `p6`, `p7`, `p9`, `p10`, `p11`, `p18`, `p20`, `p26`, `p37`, `p40`, `p43` (the card meta line:
  D5 changes the card), `p45`. Likely to need an update: **p3** and **p9** (the home layout and header, D3 and D4),
  **p43** and **cp8e** (the card, D5), **cp8b** and **p37** (drag, D3 adds a drop target), and any that read the ❗
  (D2). New pointer only: **p72** (drag reorder). Each phase lists the pointer checks to rerun; Jethro runs them.

## 6. Questions for Jethro (with recommended answers)

1. **What is "push after"?** There is no plan or code for it. *Recommended:* write a short brief (what is pushed, by how
   much, from where) before any work; until then D7 stays unplanned.
2. **No red and no priority on the desktop too?** The phone plan kept them on the desktop (decision 7 of 2026-11-18).
   *Recommended:* yes, hide the ❗ and the switch on the desktop; keep the stored value and stop using it in the
   Anytime fallback order (oldest first only), so nothing sorts by a hidden value.
3. **Where does Today live on the desktop?** *Recommended:* a new Today view in the centre, beside Tasks and Calendar,
   opened at start; the Timebox stays on the right. (The alternative, the Now card and strip above the Tasks board, is
   cramped next to seven day columns.)
4. **Should the Tasks board's today column follow the Anytime order too?** *Recommended:* no for now; the order is
   only the Today view's Anytime column, as on the phone. One order in two places can be a later step.
5. **Plan my day on the desktop: keep its one screen style or switch to one task at a time like the phone?**
   *Recommended:* keep the one screen style (it uses the wide window and the Timebox drag); D6 only makes both read
   the same queue.
6. **Rename Missed to Earlier on the desktop?** *Recommended:* yes, one word on both apps (a label change only).

## Also reported: desktop features that exist today but were only tested on the phone side

- **None of the 3.59.0 to 3.65.1 features are drawn on the desktop.** The shared rules they rely on
  (`nowCard.ts`, `todayTimeline.ts`, `anytimeOrder.ts`, `labelHours.ts`, `stepFlow.ts`, `repeatWords.ts`,
  `repeatFolds.ts`, `planQueue.ts`, `wrapQueue.ts`, `weekQueue.ts`, `planGuard.ts`, `flowActions.ts`,
  `planActions.ts`) are covered by mobile unit tests and the phone real checks, and are not imported by any desktop
  screen.
- **Data written by the phone that the desktop already stores and syncs but has never been checked on the desktop:**
  the `today.order.<day>` and `hours.count.<labelKey>` `user_settings` rows (the desktop syncs `user_settings` and
  ignores these keys), and the phone's label deletes through the shared `deleteLabel` (the desktop's own
  `LabelsPage` delete is covered by desktop checks).
- **Shared code touched by the phone work and used by the desktop:** `lib/wrapActions.ts`, `lib/planDay.ts`,
  `lib/wrapUp.ts`, `lib/planEntry.ts`, `lib/earlierUndo.ts`. These were checked on the desktop only by the full quiet
  regression at 3.65.1 (88 checks, 0 failures); the 26 pointer only checks have not been run this round.

## Built

- D1 as 3.66.0, D3 as 3.67.0, D6 as 3.68.0 (2026-11-21); D2 as 3.69.0, D4 as 3.70.0, D5 as 3.71.0, the top row fix as 3.72.0 (2026-11-22). D7 written as a plan: docs/PLAN_push_after.md, not built.
- Answers used (Jethro, 2026-11-21): Today is a new centre view with the Timebox on the right; the Tasks board today column does not follow the Anytime order yet; the Plan screens keep their one screen style.
