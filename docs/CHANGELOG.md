# Belific Mobile — Changelog

Every completed feature, fix, or change bumps `mobile/app.json`'s
`expo.version` (patch for fixes, minor for features) and gets an entry
here, dated, as part of the same scoped commit — not added
retroactively at session end. Read this file before starting new work
to know the current version and recent history.

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
