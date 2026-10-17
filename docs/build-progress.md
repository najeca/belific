# Belific build progress

The running record of `docs/belific-build-plan.md`. A new session can start cold from the plan and this file: read both, then `docs/CURRENT_TRUTH.md` for anything outside the plan. Add a checkpoint at the end of every phase.

Branch: `v2-redesign`. App version: **2.25.0** (phase 2 is 2.19.0, phase 3 is 2.20.0, phase 4 is 2.21.0, phase 5 is 2.22.0, phase 6 is 2.23.0, phase 7 is 2.24.0, phase 8 is 2.25.0; phases 4 to 8 bumped in their own commits). The bump was made after both phases were committed, in its own commit, once Jethro allowed `easConfig.test.ts` to change; from now on every feature or fix bumps `app.json` in the same commit (CHANGELOG rule: patch for fixes, minor for features).

## Where things stand

| Phase | State |
|---|---|
| 1 Data foundations | **Done 2026-10-16.** Migration 002 applied live; sync mapping, storage and timer maths in code with tests. No UI. |
| 2 Task model and timer | **Done 2026-10-16** (commit `c15e9d4`). Details panel, timer and floating widget, lists, label emoji, duplicate, soft delete, estimate against actual, shortcut registry and help. Desktop only. |
| 3 Desktop layout | **Done 2026-10-16** (second commit). Collapsible panes remembered, V between Kanban and Calendar, Calendar day, week and month, all day row, current time line, search, show only today, quick capture. Desktop only. |
| 4 Quests | **Done 2026-10-16** (commit `3935fd8`, 2.21.0). Desktop and iPhone. Period streaks, Every year, the iPhone's Brain Dump on tasks and Convert routines. |
| 5 Daily Planning, Shutdown, rollover | **Done 2026-10-16** (2.22.0). Desktop only. |
| 6 Analytics, Trash, data export | **Done 2026-10-16** (commit `85bb6dc`, 2.23.0). Desktop only. |
| 7 Power features | **Done 2026-10-16** (2.24.0). Desktop only. |
| 8 Calendar connections | **Done in code 2026-10-17** (2.25.0). Section 7 steps 1 to 3. Desktop and iPhone. Edge Function `belific-calendar-feed` and grant 003 written and tested locally, **not deployed or applied** (Jethro deploys). The iPhone part needs a new TestFlight build. |
| 9 | Not started. |
| iOS adaptation | Steps 1 (Brain Dump on tasks) and 2 (Convert routines) **done in code** with phase 4, plus the Quests tab. Not run on a device. Phases 2, 3 and 5 have no iPhone UI yet. |

## Decisions in force (from Jethro, 2026-10-16)

These are also written into the plan (section 0, items 1 to 11) and, where they are decisions, into `docs/decisions/`.

1. **Schema:** evolve the live tables with small additive numbered files in `mobile/supabase/belific_schema/`, in the 001 house style (text keys, composite primary keys, no foreign keys between tables, no CHECK constraints, tombstones, `server_updated_at` trigger and index, owner only row level security with `(select auth.uid())`, anon and public revoked). The earlier draft SQL (`docs/belific_schema_draft.sql`) is **withdrawn**; never apply it.
2. **Sync:** keep the outbox, the cursor on `server_updated_at` and "last to reach the server wins" (decision 013). No Realtime.
3. **Quests** are a view over the repeating series (decision 023). Quests Daily is the daily series (desktop routines became `rt_<id>` series in 2.16.0). The quest emoji is `tasks.emoji` on the series root. No third repeat system.
4. **No XP, levels or multiplier** (decision 027, which supersedes 014 and the XP parts of 008). Streaks only on recurring tasks, current and best only, never shaming (007).
5. **Order per phase:** shared logic, then desktop UI, then the iOS adaptation.
6. **Trash** shows the last 30 days. Retention stays as the repo defines it: 90 days for ordinary tombstones, 400 for skipped days of repeating tasks.
7. **Recurrence:** unknown repeat rules are kept, never wiped, on upload (done). **Annual is phase 4**; Jethro updates both devices before creating any annual task.
8. **`actual_minutes`** is nullable, NULL means 0, everywhere (totals, analytics).
9. **Emoji (phase 2 onward):** native system emoji wherever a natural one exists (tabs, lists, labels, quests, section headings, empty states, settings rows). Ionicons only for chevrons, close, check, drag handle, play and pause.
10. **Keyboard:** Tab is for focus. **V** toggles Calendar and Kanban. Checked at phase 1: no existing V shortcut (the desktop panes only handle Escape; the menu has Ctrl+, and Ctrl+Q); check again when the registry is built. Single letter shortcuts never fire while a text field has focus (use `isTextEntryTarget`, `mobile/lib/editable.ts`).
11. **Lists are desktop only** until the iOS adaptation moves the iPhone's Brain Dump from `brain_dump_items` to tasks.

Working rules (from Jethro): one phase at a time; no new libraries without justifying them first; show every migration and wait for approval before it is applied; typecheck and tests after each phase; one commit per phase; ask rather than guess.

## Checkpoint: phase 1, data foundations (2026-10-16)

**Migration 002** (`mobile/supabase/belific_schema/002_lists_settings_timer.sql`, rollback beside it). Applied by Jethro on 2026-10-16 through the Supabase migration tool on the shared "belific landis proload" project (`vlogfwnmaqorhialcqbr`), recorded as `belific_lists_settings_timer`, version `20261016153525`. His checks passed: the five columns present; `lists` and `user_settings` with row level security and one owner policy each; no anon or public grants; row counts unchanged (36 tasks, 10 projects).
- `tasks`: `actual_minutes integer` (NULL = 0), `timer_started_at timestamptz`, `list_key text`, `emoji text`. All nullable, no default.
- `projects` (labels): `emoji text`.
- `lists`: key, name, emoji, sort_order, created_at, updated_at, deleted_at, server_updated_at; primary key (user_id, key).
- `user_settings`: key, value (text), updated_at, deleted_at, server_updated_at; primary key (user_id, key). For settings that follow the person (feature toggles in phase 7). UI state stays local.
- Not added: `created_at` (tasks already had it), emoji on `routines` (series roots carry it), XP tables, time entries, foreign keys, CHECK constraints, uuid ids, Realtime.

**Brain Dump mapping:** a task with no `dueDate` and no `listKey` is in Brain Dump. The legacy `brain_dump_items` table stays as it is: the desktop converts those rows to tasks on first save, and the iPhone still uses it until the iOS adaptation.

**Code** (all in `mobile/lib/` unless noted):
- `types.ts`: `Task.actualMinutes`, `timerStartedAt`, `listKey`, `emoji`; `Project.emoji`; new `TaskList` and `UserSetting`.
- `syncCore.ts`: tables `lists` and `user_settings`; capability `planner`; `tableReady` (the two tables are skipped by pull and push until the server has them, and their rows wait in the outbox); `TASK_PLANNER_FIELDS` and `PROJECT_PLANNER_FIELDS` kept locally on pull until then; `hasPlannerValues`; mappers and sanitisers for every new value (bad values become null or the default, so a batch never fails); `sanitizeRecurrence` keeps an unknown repeat rule (lowercase letters and underscores, up to 32 characters) instead of wiping it.
- `syncEngine.ts`: skips tables that are not ready; when `planner` first appears, queues every local task or label that holds the new values.
- `syncServer.ts`: probes `tasks.actual_minutes`, `projects.emoji`, `lists.sort_order`, `user_settings.value`; a missing table (`42P01`, `PGRST205`) counts as "not migrated", like a missing column.
- `storage.ts`: `loadLists`, `putList`, `deleteList` (tombstone), `loadUserSetting`, `setUserSetting`; both new keys in `clearAllData`, with their cursors. `accountSwitch.ts` counts them as user data. `sync.ts` loads and saves them.
- `taskTimer.ts` (new): `startTimer` (a second start keeps the first), `stopTimer` (adds whole elapsed minutes, rounded down, and clears the timer; more than 24 hours returns `confirm` so the UI asks what to add), `stopTimerWith`, `shownMinutes` (total plus running time), `setActualMinutes` (hand entry), `elapsedMinutes` (a start in the future counts 0). Totals are capped at a year of minutes.
- `mobile/supabase/functions/delete-account/core.ts`: deletes from 9 tables (adds `lists`, `user_settings`). **Not deployed** (see below).

**Tests:** typecheck clean; 494 tests pass. New: `taskTimer.test.ts`; 002 mapper, sanitiser, gating and unknown rule tests in `syncCore.test.ts`; two engine tests in `syncEngine.test.ts` (a server without 002: nothing sent or pulled, values kept locally, uploaded when 002 appears, then seen by a second device; a timer stopped on one device stops on the other; a deleted list is a tombstone everywhere); a probe test for missing tables in `schemaProfile.test.ts`; static checks of the 002 file and its rollback in `belificSchemaSql.test.ts`; the delete-account table list checked against every numbered schema file.

**Not verified:** nothing has run between two real devices against the live project. No UI uses the new fields yet, so the first real check is phase 2 (start a timer on Windows, see it on a second signed in desktop or the phone build). iOS: nothing to adapt in phase 1 (no UI); the shared code is on the iPhone path and is covered by the same tests.

**delete-account:** the repo version now covers 9 tables, but the function has never been deployed to the shared project, and `docs/CURRENT_TRUTH.md` (Still pending) blocks deploying it until Jethro decides Apple's account deletion expectation for a login shared with Landis and Proload. Until it is deployed, the in app "delete account" on the new builds has no function to call on the shared project. The header comment in 002 that says "deploy again" is wrong and left as applied.

**Hazard added:** never run `supabase db push` or `migration repair` against the shared project (its history holds 002 with no file in `mobile/supabase/migrations/`, and that folder holds five old project files that create tables in `public`).

**Open for later phases:**
- Phase 4: whether triweekly series get their own Quests section or join Biweekly (they must be shown either way).
- Phase 4: annual needs a month as well as a day. `recurrence_month_day` exists; a month column (or deriving the month from the series start day) is a phase 4 decision, and a column would be migration 003.
- `docs/belific_schema_draft.sql` is withdrawn and left uncommitted; delete it or keep it out of the repo.

## Checkpoint: phase 2, task model and timer (2026-10-16)

No schema change, no sync change: everything uses the phase 1 fields (`actualMinutes`, `timerStartedAt`, `listKey`, `emoji`, `Project.emoji`, lists, user settings). Desktop only; the iOS screens were only kept compiling.

**Shared logic (pure, in `mobile/lib/`, each with tests):**
- `taskTotals.ts`: estimate and actual per task, day or list; a missing actual is 0; a running timer counts for the time it has run; text `0:25 / 1:30` (actual first); nothing planned and nothing spent shows no text. Over the estimate only tints the figure (never a warning).
- `timerSession.ts`: running timers, the active one (most recently started), and the plan for starting one: **one timer at a time**, starting a second stops the first and adds its whole minutes; another timer running over 24 hours returns `confirm` and nothing is written. `taskTimer.ts` (phase 1) holds the maths: whole minutes rounded down, a future start counts 0, over 24 hours asks.
- `taskCopy.ts` (duplicate: keeps title, notes, priority, label, list, emoji, Day, estimate, reminder, subtasks with new ids unticked; drops progress, actual, timer, time slot, repeat and series), `lists.ts` (names, duplicates, counts, a task whose list was deleted reads as Brain Dump), `emoji.ts` (one emoji kept from typed or pasted text; suggestions), `shortcuts.ts` (the registry).
- Commands that write (desktop only): `timerActions.ts`, `taskCommands.ts` (duplicate, capture into a list or a day, create, rename, re-emoji and delete lists; deleting a list sends its tasks back to Brain Dump), `labels.ts` (`setLabelEmoji`, `createLabel(name, emoji?)`).
- Estimate presets are now 5, 10, 15, 30, 45 min, 1h, 1h 30m, 2h plus the custom field; stored values such as 20m, 3h and 4h still display and parse.

**Desktop UI (`mobile/components/desktop/`):**
- **Task details panel** (`TaskDetailPanel.tsx`): every field as a field, an overlay on the right of the home screen, not a screen. Title, emoji, complete, list, Day, estimate (presets and custom), actual (typed, plus start or stop), label, priority, notes, subtasks (tick only), duplicate, delete. No Repeats field (phase 4). Opens from the card's More menu or **O** on a focused card; Escape closes.
- **Card:** emoji before the title; actual time beside a play or pause button; "Timer active" line; the small icons are emoji (🔁 ☑️ 🚩 🔔 📅) with quiet and full strength states; label shows its emoji. The More menu has Open details, Duplicate task, Delete task.
- **Floating timer** (`TimerWidget.tsx`): mounted once at the home root, outside the page switch, so it stays over Settings, Labels and Progress. It reads running timers from the stored tasks (every 8 seconds and on every change), so it survives an app restart and shows a timer started on the other device after a sync. Shows the task, the run so far (m:ss) and actual / estimate, one button to stop. A timer over 24 hours shows a question there instead (add all, add none, or type a time); nothing is added until it is answered.
- **Lists** (`ListSwitcher.tsx`): a button at the top of the left pane names the list (Brain Dump by default); the popover lists them with counts, creates a list (name and emoji), and for the shown list renames, re-emojis or deletes it. The shown list is remembered locally (`belific_desktop_list`, UI state, not synced). New tasks typed in the capture box go to the shown list.
- **Totals:** the left pane header shows actual / estimate for what waits in the list; each board column shows it for its day.
- **Shortcuts:** `shortcuts.ts` is the one registry and the help overlay (Shift+/ or the ⌨️ button) is generated from it, so it lists only wired keys. Card keys (act on the card with the keyboard focus): C complete, S show or hide notes and subtasks, Ctrl+S new subtask, O details, Ctrl+E estimate, Ctrl+B actual, Ctrl+L label, Ctrl+Shift+Enter timer, Ctrl+Shift+D duplicate, Ctrl+Delete delete (opens the More menu already asking "Delete? Yes / No"), Up and Down between cards. Home keys: Shift+/ help, Q capture. **Nothing fires while typing in an input, textarea, select or contenteditable, while a popover or overlay is open, or on a held key (except the arrows); Tab, Space and Alt are never shortcuts.** Tests enumerate every registered key against these rules.
- Pane headings and empty states use emoji (🧠 🗓️ 🕐 📆).

**Verification:** typecheck clean; `npm test` green; security scan passed. Real app check `desktop/test/real/p2.js` (42 checks, real key and text input): a timer left running is found on launch and stopped from the widget (whole minutes), a 30 hour timer asks and adds the typed 90 minutes, Shift+/ and the typing guard, a task created, estimated, labelled, timed, given an actual time, completed, duplicated and deleted from the keyboard, the details panel, lists, day totals, label and task emoji. The older real checks cp6, cp8c to cp8h and cp9 to cp12 all still pass. Not verified: two real devices (a timer started on one showing on the other); that is a sync of fields already proven against the fake server.

## Checkpoint: phase 3, desktop layout (2026-10-16)

No schema change. Desktop only.

- **Panes** (`lib/paneState.ts`, `usePaneState.ts`): left and right panes collapse to a narrow rail (buttons in the top strip, `[` and `]`, or the rail itself). A collapsed pane stays mounted (hidden), so its list, week and scroll are there when it returns. The centre never hides and works with either sidebar hidden, or both. State is `leftCollapsed`, `rightCollapsed`, `center` (kanban or calendar), `calendar` (day, week, month) and `onlyToday`, stored as JSON in the **user_settings row `ui.panes`** (synced when signed in) with a **local fallback** `belific_desktop_panes`; the setting is read first, then the local copy, then the default; a damaged value in either place falls back and never breaks the screen; both are written on every change and neither write can throw. Loaded once at start, so a change made on the other device shows at the next start, not live.
- **Centre toggle:** Kanban or Calendar, with **V** (not Tab; Tab keeps normal focus order) or the buttons in the top strip. Both stay mounted so each keeps its state.
- **Calendar** (`CalendarPane.tsx`, `lib/calendarView.ts`): **D**, **W**, **M** open it in day, week or month view from either centre view. Day and week are the 24 hour grid (00:00 to 24:00, opens at "My day starts at" or about an hour before now when today is shown, scrolls the whole day) with an **all day row** (tasks with a Day and no time), a **current time line** (accent line and dot, today's column) and overnight tasks continuing on the next day. Month lists each day's tasks (first three and "+N more"); a day opens that day. It shows stored tasks, the days of repeating series, events, and the filter (it has its own Filter button); a block or chip opens the same task menu as the Timebox. Header: previous, title, next, Day/Week/Month, Today, actual / estimate of what the view shows.
- **Timebox** (right pane) also gets the current time line.
- **Show only today** (**Shift+F**, or the button): the board shows just today's column, the Calendar shows today's day view, the Timebox goes to today.
- **Quick capture** (`QuickCapture.tsx`): **Q** into the list shown, **T** onto today; Enter adds and closes, Shift+Enter adds and keeps the box open, Escape closes and returns focus. Works with the left pane hidden.
- **Search** (`SearchPalette.tsx`, `lib/taskSearch.ts`): **Ctrl+K**; title, notes, subtasks, label and list, case and accent insensitive, every word must match, title matches first. Enter shows the task where it lives (the board's week, or its list on the left, expanding the pane) and puts the keyboard on its card; a card that cannot be found (hidden by the filter, or finished) opens its details instead.
- Registry additions: Ctrl+K, T, Shift+F, `[`, `]`, V, D, W, M. Help overlay regenerates from them.

**Verification:** typecheck clean; `npm test` green (new: paneState, calendarView, taskSearch, shortcut phase 3 and reserved key tests); security scan passed. Real check `desktop/test/real/p3.js` (52 checks): panes hidden one at a time and both (the board still works), `[` and `]`, the layout saved in both places and still there after a reload, V and the unchanged Tab, V W D M typed in a box staying text, day, week and month, all day row, 24 hour grid, time line, a block opening the task menu, Next and Today, Shift+F, Q and T, Shift+Enter, capture with a pane hidden, search by a word in the notes, search jumping to a task three weeks away and to a task in a list, no match. Older real checks re-run after the layout change (see the commit message). Screens checked by eye in the real app: default, both panes hidden, day, week, month, details, timer, search.

## Decisions I made on my own (phases 2 and 3)

1. **No version bump at first** (the pinned test and the instruction not to edit it); then bumped to 2.19.0 and 2.20.0 on Jethro's instruction (see the top of this file).
2. **The existing Repeats control on cards and in the block menu is left as it is.** "Leave Repeats out or disabled" was applied to the new surfaces: the details panel has no Repeats field. Removing the working control would have been a regression.
3. **Pane layout lives in user_settings (`ui.panes`) with a local fallback**, as the brief says. This contradicts plan section 2 ("UI state such as collapsed panes stays local"); the brief is newer. Consequence: two desktops with different screens share a layout, last write wins, and the value is read once at start.
4. **One timer at a time.** Starting a second stops the first. Not stated in the plan; chosen so two clocks never count the same hour. If two arrive from two devices, the most recently started is the active one in the widget and the rest are listed as "+N more running".
5. **The Calendar shows and opens; it does not take drops.** Dragging a task into an hour slot stays on the Timebox (right pane), because the drag layer and its drop zones are the Timebox's. The Timebox got the time line but **not** an all day row (the board column already shows a day's untimed tasks).
6. **Shortcuts I chose that are not in the plan's list:** O (open details), Ctrl+Shift+D (duplicate), `[` and `]` (hide panes), Ctrl+Delete opens the More menu at "Delete? Yes / No" rather than deleting at once (there is no Trash view yet, phase 6). **Plan keys not wired:** Ctrl+I (time section), Shift+T, Shift+B, Left and Right between days, Ctrl+Enter, Enter to edit (Enter still expands the card), Esc to deselect (Escape still collapses), Ctrl+Shift+P (phase 5). The help overlay lists only what is wired.
7. **Duplicate drops the repeat, the time slot, progress and the timer** (a copy of a series member would start a second series).
8. **Delete is soft** through the existing `deleteTask` tombstone (`deletedAt`); a Trash view to restore is phase 6.
9. **Estimate presets:** 20m, 3h and 4h left the list (the brief's list); existing values are unaffected.
10. **Emoji:** applied to the card controls, pane headings, the top strip, lists, labels, tasks, help, search, capture and empty states. **Not done:** the Settings, Labels and Progress pages' own rows (not touched in this batch). Ionicons kept only for chevrons, close, check circles, the drag handle, play and pause, and the More (ellipsis) button, which has no natural emoji.
11. **Calendar and Kanban both exist while one is hidden** (mounted, `display: none`), so neither forgets its week or scroll.
12. **A search result for a hidden or finished task opens its details** instead of doing nothing.
13. **The floating timer's stop button uses the pause icon** (allowed by the brief) but stops the timer and adds the time; starting again resumes counting from the stored total.

## Check by hand in the desktop app

See the end of the phase 3 report in the conversation, repeated here so a cold start has it:
1. Start a timer (Ctrl+Shift+Enter on a card), **quit the app completely and open it again**: the floating timer is still there and counting. Stop it from the widget: the actual time on the card grows by whole minutes.
2. With a timer running, press Start on another task: the first stops and its minutes are added.
3. Collapse the left pane, quit and reopen: it is still collapsed. With a second computer signed in, change the layout on one and restart the other.
4. Open the Calendar (V). Try D, W, M, the arrows, Today, a block, a month day. Check the current time line against the clock, and that scrolling reaches 00:00 and 24:00.
5. Look at it at the smallest window size (1024 wide): the top strip buttons, the card controls (they wrap), the Calendar week.
6. Press Win+. in an emoji box (details panel, new list) and pick an emoji from the Windows picker.
7. Drag a task from the left pane onto the Timebox and onto a board day with a pane collapsed on the other side.
8. Check the emoji look right on your screen (Segoe UI Emoji) and none look out of place against the sage palette.
9. Delete a task with Ctrl+Delete, then answer No, then Yes. Duplicate one. Press Shift+/.
10. Sign in on both devices and watch an estimate, an emoji or a timer set on one appear on the other after Sync now.

## Checkpoint: phase 4, Quests (2026-10-16, 2.21.0)

No schema change, no sync change. Decision 029 (Proposed).

**What runs on user data (agreed with Jethro before it was written):**
- **Convert routines** (iPhone Settings, Data, and the desktop as before): only when pressed, after the dry run and a confirmation. Writes one task row `rt_<routineId>` per live routine (daily, dated that day, reminder off) and tombstones the routine row; routine_completions are never touched. Undo ends the series and gives each routine back as a new row with its ticks copied (the old ids stay tombstoned). The iPhone has no backup step.
- **iPhone Brain Dump:** new captures are tasks; an old item is converted only when edited (new task, item tombstoned). Nothing moves in bulk. Not reversible, same as on the desktop.
- **Quest actions** write the same rows as a board card: one tap stores and completes an occurrence (reopenable), Skip writes the existing skip tombstone (not reversible), Today sets an occurrence's Day to today, Timebox also sets its start time.

**Shared logic (`mobile/lib/`, all tested):** `quests.ts` (sections, periods, period state, period streak, due state, the one tap target, wording), `questActions.ts`, Every year in `repeat.ts`, `recurrence.ts` and `series.ts` (`occursAnnually`, `annualDayIn`, the date number in `recurrenceMonthDay`), `series.ownDay` and `Series.anchorKey` (the template and the anchor read an occurrence's own day), longer local keep for monthly and annual skips. `syncCore` knows `annual` (an older client already kept it).

**Desktop:** the Quests page (🎯 Quests in the top strip, Back returns), the Every year choice with its warning and "Every device is updated" tick in the Repeat control, and Repeats in the details panel (the same RepeatBody component in a popover, not a fork).

**iPhone:** a Quests tab (same quests and actions, no Timebox), Brain Dump on tasks (`app/(tabs)/inbox.tsx`), Convert routines (`app/components/RoutineConvertSection.tsx`). Events never offer Every year (`AddEventModal`). The iOS marker gate drops `convertRoutines`, `undoConversion` and `routineConvertActions` on purpose (the desktop's `RoutineConvertRow`, `routine-convert` and its wording stay markers); 16 markers, 0 hits.

**Verification:** typecheck, all tests (streaks across month ends, leap years, every 2026 clock change, five time zones in child processes with their own TZ), security scan, iOS export plus marker gate. Real check `desktop/test/real/p4.js` (29). p2, p3, cp6, cp8c to cp8h and cp9 to cp12 still pass (cp8d's pinned Repeat list now ends with Every year). Not verified: anything on an iPhone.

## Checkpoint: phase 5, Daily Planning, Daily Shutdown, rollover (2026-10-16, 2.22.0)

No schema change. Desktop only.

- `lib/rollover.ts`: rollover (earlier unfinished, not a series row, Day to today, time kept) and carry to tomorrow (Shutdown, chosen tasks of today). `lib/planningDraft.ts`: the draft (edits, added tasks), the preview, what Finish writes (the draft, then the rollover or carry for tasks the draft did not decide). `lib/planningActions.ts`: Finish, worked out from the latest stored rows, completions through `setTaskCompleted`.
- `components/desktop/PlanningFlow.tsx`: Daily Planning (4 steps) and Daily Shutdown (2 steps) as full screen overlays with a step rail (step, title, helper, figures, Next or Finish, back arrow, Cancel). Escape is Cancel everywhere in the flow.
- Keys: Ctrl+Shift+P (Planning), Shift+T, Shift+B, Left, Right (cards), Ctrl+I (time section on a card). Strip buttons 🌅 (Planning) and 🌙 (Shutdown).
- **Verification:** unit tests (rollover idempotent, two devices in either order, inputs never changed, the draft never touches stored rows, what Finish writes), a two device test through the real sync engine and its fake server (both roll, one result, a second run writes nothing), and the real check `desktop/test/real/p5.js` (34): Cancel and Escape leave `belific_tasks.kv` byte for byte as it was after every kind of draft change; Finish; a second Planning writes nothing; Shutdown; the keys and the typing guard. The older real checks pass again.

## Decisions I made on my own (phases 4 and 5)

1. **A finished current period counts** toward the streak (an unfinished one is neutral). "Neutral until it ends" read as: never a reset before the period is over.
2. **"Due this week" / "Due this month" / "Due this year"** for an earlier day of the period not done yet (the three texts in the brief cover the other cases).
3. **Every year stores its date number in `recurrence_month_day`.** Without it the rule drifted to Feb 28 after the first non-leap year (a test caught it).
4. **`series.ownDay`:** the template and anchor read an occurrence's own day. The series model did not allow moving an occurrence; this was the smallest change that lets Today work without moving the rule. Today and Timebox are not offered for the series' root row.
5. **Timebox from the Quests screen** gives the occurrence the next half hour (the brief asked for a drop into the Timebox; the Quests page is a separate page, so no drag).
6. **Monthly and annual skips are kept ten years locally** so a long streak never breaks when a skip ages out.
7. **Other repeats** section for a rule this version does not know.
8. **Quests is a page** (like Progress) reached from the top strip; Progress stays.
9. **The iPhone Convert has no backup step** (no backup folder on the phone).
10. **iPhone Brain Dump shows tasks with no Day and no live list**; a task in a list shows only in Tasks on the phone.
11. **Planning step 4 sets a time from a half hour list**, not by dragging.
12. **Shutdown starts with every unfinished task of today ticked** to go to tomorrow.
13. **Phase 5 has no iPhone UI** (no Planning or Shutdown on the phone yet), so rollover runs only on the desktop.
14. **Ctrl+I** shows or hides a time row (actual, estimated, start or stop) on a card; it does nothing on a repeating task's projected card.
15. **Left from the left list** does nothing; Right goes to the first day on the board.

## Check by hand (phases 4 and 5)

Desktop:
1. Open 🎯 Quests: every repeating task is there, in the right section; streaks look right against what you remember doing.
2. Tick a quest, tick it again (reopens), Skip one, put one on Today and on the Timebox; check the board and the Timebox.
3. Give a task Every year from the Repeat control: the warning, the tick, then Apply.
4. Run Daily Planning on a real morning: tick a missed task, pull tasks in, push some to tomorrow, give times, Finish. Then open it again and Cancel at every step: nothing changes.
5. Run Daily Shutdown in the evening: untick a few in "What you missed", Finish, check tomorrow.
6. Shift+T, Shift+B, Left, Right, Ctrl+I, Ctrl+Shift+P; and type those letters in a box.

iPhone (TestFlight, signed in to the shared project): see the phase 4 and 5 report in the conversation; the list is repeated in `docs/CURRENT_TRUTH.md`, "iPhone checks for 2.22.0".

## Checkpoint: phase 6, Analytics, Trash, data export (2026-10-16, 2.23.0)

No schema change. Desktop only. Commit `85bb6dc`.

- `lib/analytics.ts` (ranges, cards, charts, completed list, CSV), `lib/csv.ts`, `lib/chartColors.ts` (the two chart colours and a label colour darkened to at least 3:1), `lib/trash.ts` and `lib/trashActions.ts` (what the Trash shows, Restore), `lib/dataExport.ts` and `lib/exportActions.ts`. UI: `AnalyticsPage.tsx`, `TrashPage.tsx`, the Data section of `SettingsPage.tsx`, profile menu rows.
- **Trash restore (Jethro's design, two changes).** A delete is a tombstone whose `deletedAt` equals its `updatedAt` and which has no repeat rule. Restore makes a NEW task with the same fields and a deterministic id (`restored_<oldId>`, then `restored2_...`), and touches the old tombstone so the entry leaves the Trash on every device; nothing is ever un-deleted. **Merged tasks:** a merge into another task as a subtask writes the same kind of tombstone as a delete, so the two cannot be told apart by their data. I detect a merge by its effect (a live task has a subtask with the same normalised title, changed no earlier than 10 seconds before the tombstone) and show such an entry as "Merged into another task" with **no Restore button**. This is a guess and can be wrong in either direction (see the choices below). **Two devices restoring the same item** is tested through the real sync engine: exactly one new task, and the entry leaves the Trash on both devices.
- **Verification:** typecheck; all tests; security scan; iOS export and marker gate (16 markers, 0 hits); real check `desktop/test/real/p6.js` (39); every older real check re-run.

## Checkpoint: phase 7, power features (2026-10-16, 2.24.0)

No schema change. Desktop only. Every new piece of state is a `user_settings` row: `feature.<name>` (on or off) and `template.<id>` (JSON, at most 4000 characters). Pomodoro state is local to the computer (kv, never synced).

- `lib/features.ts`, `lib/pomodoro.ts`, `lib/templates.ts`, `lib/templateActions.ts`, `lib/resetCache.ts`, `lib/resetActions.ts`, `deleteUserSetting` in `lib/storage.ts`. UI: `featureStore.ts`, `pomodoroStore.ts`, `LabelsOverlay.tsx`, `TemplatePicker.tsx`, `TemplatesManager.tsx`, `ResetCacheRow.tsx`, and the toggles read in `DesktopHome`, `TaskCard`, `TaskBlockPopover`, `TaskDetailPanel`, `ProfileMenu`, `TimerWidget`, `SettingsPage`.
- **Toggles hide, never delete.** Due dates and reminders: only the reminder bell and the Reminder option (reminders already set keep working; the Day field is the board itself and stays). Priority: the flag, the Priority field and row. Planning: the strip buttons and Ctrl+Shift+P. Analytics: the profile menu row. Pomodoro and templates: their buttons. Attachments: a "Coming later" row, nothing stored.
- **Labels is an overlay** (a new overlay kind), over Settings or the home panes; Escape, its button or a press outside closes it; focus returns to the opener. Labels gain an emoji (the field exists since phase 2).
- **Pomodoro** is a countdown over the single task timer (`lib/pomodoro.ts`): it only calls the ordinary start and stop commands, so one timer at a time, whole-minute rounding and the over-24-hours question are the timer's own.
- **Reset local cache and resync** refuses unless signed in, a full sync finished after the click, the outbox is empty, and (under the storage lock) is still empty; tested for each refusal, plus a real-app refuse when signed out.
- **Verification:** typecheck; all tests (654); security scan; iOS export and marker gate (16 markers, 0 hits); desktop tests; real check `desktop/test/real/p7.js` (54). `cp9` and `cp11` were changed to expect a Labels overlay (their other checks are unchanged); p6, p5, p4, p2, p3, cp6, cp8c to cp8h and cp9 to cp12 all pass.
- **Not verified:** the reset's success path against a real signed in account (only the refuse cases and the mocked engine are tested; the real app check runs signed out); two real devices; anything on an iPhone (phase 7 has no iPhone UI).

## Decisions I made on my own (phases 6 and 7)

Phase 6:
1. **Merge detection is a heuristic** (same normalised title as a subtask of a live task, updated no earlier than 10 seconds before the delete). A real delete that happens to share a subtask's title right after would be hidden from Restore; a merge whose subtask was renamed straight away would show a Restore button.
2. **Restore of a repeating task brings back one plain task** (the repeat rule was cleared when the series was deleted and cannot be recovered). Skipped days are not in the Trash.
3. **Restore drops the timer, a list or label that no longer exists and every repeat field.**
4. **Ranges:** the work week is Monday to Friday; last month and last 3 months are calendar months back from today; a custom range is at most a year.
5. **Time is counted on the day a task was completed**, not spread over the days it was worked on.
6. **The export JSON has the nine tables; the CSV is tasks only.** A key or field that looks secret (token, secret, password, session, credential, api key, auth, private key) is left out and counted in the message.
7. **Charts:** sage for actual, a clay brown for estimated (outline against solid so colour is never the only signal); label colours darkened to at least 3:1 where needed.

Phase 7:
8. **Toggle defaults:** reminders, priority, planning and analytics on (so nothing disappears on update); pomodoro and templates off.
9. **"Due dates and reminders" hides the reminder bell and option only.** The Day field stays because it is the Kanban board and the Calendar.
10. **Pomodoro lengths are fixed at 25 and 5 minutes** (other values are supported in the code and the saved state, with no settings screen for them yet). No long break after four rounds.
11. **The countdown is local to the computer** (kv), not a synced setting, so two computers can never fight over it. After a restart it is found again if its task timer still runs.
12. **A pomodoro never counts minutes itself.** Take a break uses the ordinary stop; a timer over 24 hours asks first and the pomodoro simply ends.
13. **A template** holds the title, emoji, notes, estimate, priority, label and step titles, trimmed to fit one setting (notes first, then the last steps); at most 50. A label that was deleted since is dropped when a task is made. Templates are not offered in Daily Shutdown step 2 (the brief did not ask for it).
14. **A template is deleted by a tombstone** (`deleteUserSetting`), never by removing the row.
15. **Reset counts a sync as done only if it finished idle with a success time newer than the click**; an older "idle" does not count.
16. **Emoji reading of "Settings, Labels and Progress pages":** a system emoji on each Settings section title and on the Progress heading and each repeating task (the task's own emoji), and an emoji picker on every label in the Labels overlay.
17. **"Open Labels page" is now "Open Labels"** in Settings (the page is gone), and `cp9`/`cp11` expect that.

## Check by hand (phases 6 and 7)

1. Analytics: pick each range; compare the cards against what you remember doing; hover or click bars; download the CSV and open it in a spreadsheet (a title that starts with = must show as text).
2. Trash: delete a task, a repeating task, a task with a note; open Trash; Restore each; the new task has the same fields and the entry leaves Trash. Merge one task into another and look for it in Trash (it should say "Merged into another task" with no Restore button). Check that a real delete is not wrongly hidden as a merge.
3. On two computers (once signed in): restore the same item on both before they sync; after a sync there is exactly one new task and the Trash is empty on both.
4. Settings, Data: Export my data (JSON) and my tasks (CSV); check the row counts in the message; search the JSON for anything that looks like a token.
5. Settings, Power features: switch each off and look at a task card, the details panel and the strip; switch it back on and nothing is lost. Do it on one computer and watch the other follow after a sync.
6. Labels: open it from Settings, give a label an emoji, close it with Escape, with its button and by clicking outside.
7. Pomodoro (switch it on): start one on a card; let a focus period finish (25 minutes, or change your clock) and take the break; check the task's Actual time grew by whole minutes; start another task's timer and see the pomodoro end.
8. Templates (switch them on): save a task as a template, make a new task from it, rename and delete it in Settings; check it appears on the other computer after a sync.
9. Settings, Data, Reset local cache and resync: signed in with everything synced, it should reset and bring everything back. Then make a change while offline and press Reset: it must refuse and say how many changes are waiting. Signed out it must refuse.

iPhone: nothing in phases 6 and 7 touches the phone UI. The shared code (`deleteUserSetting` in `storage.ts`, the emoji on `seriesStreak`) is compiled into it and passed the iOS export and marker gate; run the usual TestFlight smoke test when you next build.

## Checkpoint: phase 8, calendar connections (2026-10-17, 2.25.0)

No table or column change. One grant (003) written for review, NOT applied. One Edge Function written and tested locally, NOT deployed. Decision 031 (Proposed). Section 7 steps 1 to 3; step 4 (two way Google and Microsoft sync) is out.

**What existed:** the iPhone Calendar tab showed only Belific's own weekly template events and custom events. It did not read the phone's calendar and showed no tasks. `expo-calendar` was not installed.

**Shared logic (`mobile/lib/`, all tested):** `icsFeed.ts` (the feed document: timed tasks, window, title, floating times, folding, series through `projectOccurrences`), `icsParse.ts` (parser and repeat expansion: an RRULE subset, EXDATE, RDATE, RECURRENCE-ID, cancelled, IANA, Windows and VTIMEZONE zones, caps and a work budget), `externalEvents.ts` (where an outside event shows on a day; the iPhone event mapping), `icsSubscriptions.ts` (link rules, wording, refresh timing, what a fetch does), `calendarFeed.ts` (token and link), `calendarFeedActions.ts` (create, regenerate, turn off, synced or not), `deviceCalendar.ts` (iPhone wiring). `kanban.ts` now imports `./types.ts` with its extension (Deno needs it).

**Edge Function** `mobile/supabase/functions/belific-calendar-feed/`: `core.ts` (rules, rate limiter), `index.ts` (wiring), `vendor/` (eight lib files copied by `scripts/vendor-feed.js`); `config.toml` has `verify_jwt = false` for it only. Grant `003_calendar_feed_grants.sql` and rollback. Deploy steps and checklist: `docs/CALENDAR_FEED_DEPLOY.md`.

**Desktop:** `desktop/src/icsFetch.js` and the `ics:fetch` IPC (main fetches, the page never does), `icsStore.ts`, `CalendarsSection.tsx` (Settings, 📅 Calendars: feed link, imports, iPhone note), `CalendarPane.tsx` (imported events read only in day, week and month), the refresh timer in `DesktopHome`.

**iPhone:** `expo-calendar` 15.0.8 pinned; `NSCalendarsUsageDescription` and `NSCalendarsFullAccessUsageDescription` in `app.json` (no plugin, no Reminders strings); the Calendar tab (question card, denied card, the day sheet lists that day's tasks and phone events, dots); Settings, Calendars (`app/components/CalendarsSection.tsx`: access state and the feed link with Share).

**Verification:**
- Typecheck, 718 mobile tests, 93 desktop tests (new `icsFetch.test.js`), the security scan.
- iOS export and marker gate: 20 markers, 0 hits. `ExpoCalendar` and the feed code are in the phone bundle; `parseIcs` is not.
- The real function under Deno 2.5.6 against a fake PostgREST (`scripts/feed-local-test.js`): 18 checks over HTTP, covering right, wrong, malformed, regenerated and turned off tokens, a user with no tasks, isolation, a database error, HEAD and POST, the rate limit and the log. `deno check` is clean.
- `icsFetch` once against the real internet: a Google public holiday calendar parsed to 244 events; `localtest.me` refused as private; real redirects to http and to 127.0.0.1 refused; a 404 and a web page refused.
- Real check `desktop/test/real/p8.js` (44). Older real checks re-run with phase 8: p2, p3, p4, p5, p6, p7, cp6, cp8c, cp8d, cp8e, cp8h, cp9, cp10, cp11, cp12, run-cp7 all pass. **Three fail exactly as they do on the commit before phase 8 (`eb2e6ab`, checked by stashing phase 8, rebuilding and running them):** run-cp8f 27/31 (it still expects the old duration presets and no Actual row, which phase 2 changed on purpose), run-cp8b 59/60 ("only tasks with the ticked label show"), cp8g 32/33 (the week change while holding a drag at the board's right edge happens just after the check stops waiting; on `eb2e6ab` cp8g failed 25/33 twice). Not regressions; not fixed here.

**Not verified:**
- The deployed function (not deployed) and grant 003 on the live project (not applied).
- Anything on an iPhone (needs the TestFlight build).
- A real Google, Apple or Outlook subscription to the feed.
- Imported calendars from real Google or Outlook secret links inside the app. The fetcher ran against a real Google calendar; the app's p8 check used a swapped transport.

## Decisions I made on my own (phase 8)

1. **Feed link shape:** `?t=<token>` in the query, because calendar apps need a plain URL. Only the https form is shown (every target accepts it), not `webcal://`.
2. **Token:** 32 bytes, base64url, made on the device with `crypto.getRandomValues`, stored in plain text in `user_settings`. Both devices must show it, and owner only row level security protects it; a hash would hide it from the other device.
3. **"Regenerate invalidates at once" means once the new value reaches the server.** The app syncs straight after and shows "Active." or "becomes active once it has synced". Offline, the old link keeps working until then.
4. **Turn off feed** (a tombstone) was added beside Regenerate.
5. **The function's today is UTC** (Supabase runs in UTC). Projected days of a series start from the UTC day, so around midnight in the UK a projected day can appear or vanish an hour early or late. Stored tasks are unaffected.
6. **A task with no estimate lasts 30 minutes** in the feed (the Timebox default). Estimates are capped at 24 hours.
7. **Rate limits:** 30 per token per 10 minutes; 20 bad tokens per caller address per 10 minutes, then 429 with no database read. Kept in memory per instance (a table would be a schema change).
8. **Unknown and wrong tokens and malformed links all answer the same 404 "Not found"**, never 401 or 403, so nothing tells a guesser what was wrong.
9. **Vendoring:** the eight lib files are copied into the function (the bundler only reaches `supabase/`), guarded by a byte for byte test.
10. **An imported subscription is added only if its first fetch works**, so a wrong link is never stored.
11. **No ICS library:** the parser is written here (about 600 lines, tested). A library would be a new dependency in the renderer.
12. **What the parser does not support** shows its first day only: BYHOUR, BYWEEKNO, HOURLY, and an ordinal BYDAY in a yearly rule without BYMONTH. An unknown zone reads as local time, and RDATE periods are ignored. Expansion stops after 1000 occurrences per event in a view and 500,000 repeat days in all, so a huge calendar would lose its last events in a view rather than freeze.
13. **A timed event of 24 hours or more goes in the all day row.** Shorter ones that cross midnight are cut and continue on the next day's grid.
14. **Fetch rules:** port 443 only, 15 seconds, 5 MB, 3 redirects, at most 4 fetches at once. gzip and deflate are accepted, br is refused. Private IPv4 and IPv6, CGNAT, documentation, benchmark, 6to4 and NAT64 ranges are all refused.
15. **Refresh:** every 30 minutes, or 10 after a failure, checked every minute only while the window is visible, and also when it becomes visible. A failure keeps the last good events.
16. **Subscriptions are not in `clearAllData` or the reset.** They are this computer's own setting, like the local pane copy, so a sign out keeps them.
17. **Imported events are drawn with a dashed outline and 📅**, never a label colour, and open nothing.
18. **iPhone: the day sheet now lists that day's tasks** (the tab showed none before). Stored tasks only (the phone has no series projection), as read only rows.
19. **iPhone: "Not now"** on the calendar question is remembered on the phone. Settings, Calendars always shows the state and the button.
20. **iPhone: no config plugin for expo-calendar**, because it would add Reminders permission texts Belific does not need. The two calendar strings are set directly.
21. **The desktop Settings shows the iPhone permission state as an explanation only**, because the computer cannot know the phone's permission.

## Check by hand (phase 8)

Desktop (2.25.0):
1. In Settings, 📅 Calendars, Calendars shown in Belific, add your real Google secret iCal link (Google Calendar, Settings, the calendar, Integrate calendar, Secret address in iCal format) and an Outlook published ICS link. Check the events in day, week and month view: a repeating meeting across the 25 October clock change, an all day event, and a trip over several days.
2. Remove one and Refresh one. Turn the network off and Refresh: the error shows in words and the old events stay. Turn the network back on and Refresh: the error clears.
3. Open `%APPDATA%\belific-desktop\logs\main.log`: only hosts and reasons, never your secret link.
4. Signed in: Create feed link, Copy, Make a new link, Turn off. The link answers only after you deploy the function (`docs/CALENDAR_FEED_DEPLOY.md` has the checklist).

iPhone (only in the 2.25.0 TestFlight build, which you make):
5. Calendar tab: the card "Show your iPhone calendar events here?" shows. Not now hides it, and Settings, Calendars says "Not asked yet". Press Show my calendars: the iOS prompt shows the Belific text. Allow.
6. Open a day with events in your iPhone Calendar app (an iCloud one, a Google one if added to the phone, an all day one, one past midnight). They show under "📅 iPhone calendars" with their calendar's colour and name and the right times. That day's tasks show under "✅ Tasks", and days with events have a dot.
7. Check nothing changed in the iPhone Calendar app: no event created, moved or deleted.
8. In the Settings app, Belific, Calendars, turn access off. Back in Belific, the denied card and Settings, Calendars say how to turn it on, and Open Settings goes there.
9. Settings, Calendars on the phone, signed in: after a sync it shows the same feed link as the desktop. Try Share or copy, then New link; the desktop shows the new link after a sync.
10. The rest of the phone is unchanged: Today, Brain Dump, Quests, Tasks, sign in, and adding and editing a custom event in the Calendar tab.

## Next session

Phase 9, after Jethro's go (read the plan's section 3). Before it: Jethro reviews and applies 003, deploys `belific-calendar-feed` (`docs/CALENDAR_FEED_DEPLOY.md`) and makes the 2.25.0 TestFlight build for the iPhone calendar check. The older notes below still apply. Read the plan's phase 4 and section 0 items 3, 4, 7 and 9, and the open questions above (triweekly section, annual month). The Quests screen is the only other thing that changes the desktop screen (with Profile). Shared pieces to reuse: `lib/series.ts`, `lib/seriesStreak.ts`, `lib/seriesActions.ts`, `lib/taskTotals.ts`, `lib/timerSession.ts`, `uiStore.ts` (overlays, details panel), `usePaneState.ts`, `lib/shortcuts.ts` (add keys there, never elsewhere). Real checks: `desktop/test/real/p2.js` and `p3.js` (build first with `node desktop/scripts/build-web.js`, then `cd desktop && npx electron test/real/p3.js`).
