# Desktop Home — Navigation, Dropdown & Page Spec

**Status:** Decided — confirmed directly by Jethro in session, 2026-09-30.
Refines decision 009's top-bar sketch ("profile top-right, opening a hub")
into the exact dropdown/panel/page structure below.

Companion clickable prototype (Claude Design canvas):
https://claude.ai/artifact/5JLoeWRwkGL9Qkpmq2f5Hj — artboards
`Desktop-Home.dc.html`, `Labels.dc.html`, `Settings.dc.html`,
`Progress.dc.html`, `Dropdown-States-Spec.dc.html`. As with
`DESIGN_VISION.md`: prototype and this doc should never disagree — if they
do, fix this doc, not the prototype.

**Build status (2026-10-05):** the desktop shell is being built under
`docs/OPUS_PLAN_REVIEW.md` section 5 (Electron, decision 010). The build order
there governs what gets built first: Brain Dump, kanban and Timebox come
before the dropdowns and the three pages described below. Real file paths
now exist under `mobile/components/desktop/` (moved out of `mobile/app/` in
2.8.0 so they are no longer router routes and never reach the iOS bundle).

---

## The standing rule

Desktop Home (the three-pane workspace from decision 009: Brain Dump /
weekly kanban / Timebox) is the single screen. Nothing on it ever
navigates away to a new screen, with exactly three named exceptions:
**Labels, Settings, and Progress.** Every other action — adding or editing
a task, switching Timebox between day and week view, opening the quest
list, viewing or editing account info, logging out — happens without
leaving Desktop Home: as an inline overlay, an inline panel, or content
swapped in place.

This is a hard rule, not a style preference. It was corrected twice in
session after early prototype drafts turned task editing, Labels, and
Timebox-week into separate screens by mistake.

---

## Top bar

Two icon buttons, top-right. (This is two menus, not decision 009's single
"hub" sketch — routine/quest status and account/profile turned out to be
different concerns with different destinations once specced in detail.)

### Quests icon
Click opens a small dropdown anchored under the icon (~220px wide — the
same interaction as the account menu on amazon.com or ebay.com: compact,
closes on outside click, never pushes page content). Three rows:

- **Today's routines** — opens the existing inline Quest panel (a
  right-side overlay on Desktop Home), showing the Morning, Afternoon and
  Evening routine checklists (the stored `TimeOfDay` values; the prototype
  said "Night", the data model says Evening) with streak tags. Unchanged from `ROUTINE_GAMIFICATION_SPEC.md`.
- **Recurring quests** — a quest is a Routine (decision G11 in the
  review). This row opens the same inline Quest panel switched to the
  routines that have a recurrence (Routine `recurrence` and
  `recurrenceDays`, `ROUTINE_GAMIFICATION_SPEC.md` §4). The "+ New quest"
  form is the existing `RoutineForm` fields (name, time of day,
  recurrence), not a separate type. The XP stepper is deferred to decision
  014. Irregular chores stay recurring **Tasks**, not quests.
- **Progress** — navigates to a real standalone page (below). The only
  Quests-menu row that leaves Desktop Home.

### Profile icon
Same dropdown pattern, ~240px wide. Four rows:

- **Account** — does not navigate. Expands inline inside the dropdown
  itself (name + email appear directly under the row; chevron rotates).
- **Labels** — navigates to a real standalone page (below).
- **Settings** — navigates to a real standalone page (below). **New
  content** — prior docs only described a mobile gear-icon Settings screen
  (`DESIGN_VISION.md` §1); no desktop Settings screen existed before this
  round.
- **Log out** — fires directly from the row. No confirmation dialog, no
  navigation.

See `Dropdown-States-Spec.dc.html` in the prototype for the closed / open
/ mid-transition states of both menus.

---

## The three real pages

Reached only through the dropdowns above, never any other way. Each opens
with a small breadcrumb + "← Back" link to Desktop Home.

**Labels** — a Label is a Project plus a colour (decision 016). A task has
**one** label. Full CRUD: list with per-label task counts, add (name +
6-swatch picker; the swatches are palette keys defined once in
`mobile/lib/theme.ts` as `LABEL_SWATCHES`), edit colour, delete (a
tombstone; tasks keep the key and readers treat an unknown key as "no
label"; the delete confirmation warns when tasks are still attached).
Colour is decorative, except that a placed task's Timebox block uses its
label colour. It never drives priority or scheduling.

**Built so far (2.8.1, desktop, local only):** the eight palette colours
(`mobile/lib/labelColors.ts`; this replaces the six `LABEL_SWATCHES` idea), a
new label taking the next unused colour, and recolouring from the task
editor's swatches. Kanban cards and Timebox blocks with a label have a soft
tint and a 4px left edge in its colour; Brain Dump rows show a dot. The
Labels page itself is not built yet.

**Settings** — Account (avatar, name, email — editable), Notifications
(event starts / task starts, independent toggles, plus an opt-in "start
with Windows"; decision 017. **The weekly summary email is removed**: it
contradicts the earlier removal of the weekly summary and no email
infrastructure exists), Account actions (Log out). Built fresh this round;
there was no prior desktop Settings screen to reuse.

**Built so far (2.10.0, checkpoint 6): a small Settings modal, not this page.** The Brain Dump pane's footer line ("Local only · not signed in", or the sync status once signed in) is a clickable account line that opens a centred modal with three sections: **Account** (Sign in with Apple, signed in as the email or "Apple account", Sign out, Delete account with an inline confirm), **Sync** (status, last success, last error, Sync now) and **Data** (Export data, Open backups folder). No profile dropdown, avatar or editable name exists yet. **Checkpoint 7 (2.11.0) added two sections to the same modal:** **Notifications** (Event starts, Tasks placed on the Timebox, Daily reminder with a time input; decisions 017 and 020) and **Window** (Close to the system tray, on by default; Start with Windows, off by default). The order is Account, Sync, Notifications, Window, Data. All values live in the main process store.

**Progress** — level ring with weekly / longest-streak / lifetime XP
stats (the XP parts wait for decision 014), an XP history feed (source, amount, when), and a streak calendar
(month grid — full / partial / missed days). This is the fuller form of
the "streak-milestone log" decision 009 sketched as living inside the
profile hub — it's now its own page, reached from the Quests dropdown
rather than Profile, since it's routine/quest data, not account data.

---

## Everything else stays inline

- **2.14.0 (checkpoint 8.4, decision 024): the Timebox is 24 hours.** The grid runs 00:00 to 24:00 with an hourly label on each hour (the 00:00 label has a little room above it) and half hour lines. The Settings modal has a **Planning** section with **My day starts at** (a select of 48 times in 30 minute steps, default 05:00; main process settings, not synced). Any day other than today opens with that time at the top (the grid has spare room below 24:00 so even 23:30 can reach the top); today opens about an hour before now, but not before the day start once it has begun. A task belongs to the Day it starts on: if start plus estimate passes 24:00 its block runs to 24:00 with a "continues" marker, and the next day's Timebox shows the rest from 00:00 as a lighter dashed block, "Continues from yesterday" (derived, never stored; clicking it opens the same popover; move and resize only from the original block; a resize may pass midnight up to 24 hours; a drop near the bottom may run past midnight). The chip keeps the full estimate. **Day column order:** tasks without a start time first, then timed tasks by start time, then completed ones. Cards in a week column are 12px apart and left list rows 10px apart (the hover icon space is unchanged). The Actual time row was removed (decision 022 is superseded).
- **(2.14.0) Actual time removed.** The expanded card has no play button, no "Actual" and no "Estimated" row, no timer and no forgotten-timer prompt (decision 022 is superseded); the chip and its dropdown below are unchanged. Cards in a week column are 12px apart and left list rows 10px apart (the hover icon space is unchanged).
- **2.13.0 (checkpoint 8.3, decision 022): the duration chip (its Estimated and Actual row was removed in 2.14.0).** The chip at the top right of every card and row shows the duration as `H:MM` in tabular figures (`0:00` when none is set, `0:15`, `1:30`, `24:00`); a placed task shows its start time as separate small muted text just left of the chip (`09:30  0:15`), never inside it. Clicking the chip opens a small popover (no modal) with a focused field (placeholder "45m, 1h 30m, 130...") and a scrollable preset list (5, 10, 15, 20, 30, 45 min, 1h, 1h 30m, 2h, 3h, 4h) with a tick on the current one, a "No duration" row and, for a placed task, "Remove time". Typing accepts `45m`, `45`, `1h`, `1h 30m`, `1h30`, `1.5h`, `130` and `1:30` (any whole minute from 1 to 1440); Enter applies, invalid text shows a quiet hint and applies nothing, Escape closes. The old Custom hours and minutes fields are removed. The Timebox block popover's Duration row reads `0:15, starts 09:30`. The icons' reserved hover space from 2.12.3 is unchanged.
- **2.12.0 (checkpoint 8.2, decision 021): tasks are edited ON the card, not in a modal. This replaces the "task editor, a centred modal overlay" wording below and every "opens the editor" line.** A card (board) and a row (left list) show the title, a duration chip at the top right (`1h 30m`, `None`, or `09:30 · 1h` for a placed task, read only) and a row of small quiet icons: complete tick, repeat, subtasks with a counter, priority flag, reminder bell, and at the right the label (colour dot and name, or "Select label"). Click the title to rename it in place (Enter saves, Escape cancels). Each icon opens one shared small popover anchored to it (opens below, flips above or sideways, at most about 320px high with its own scroll, no backdrop and no dimming, only one open at a time, closes on Escape, an outside press or a choice, focus moves inside and returns, arrows and Enter work, and starting a drag closes it). Clicking the card body expands it in place: notes (a small text area saved on blur) and the subtasks list (tick, click to rename, a handle to reorder, a hover delete, "Add subtask" where Enter adds and keeps the input open). Move to day is a calendar icon on hover with Today, Tomorrow, a date and Remove day; Delete is in a small overflow menu with the inline "Delete? Yes / No". A placed Timebox block opens the same controls in a small popover (no modal); events keep their editor. There is no time input anywhere: a task is placed only by dragging onto the Timebox, and Remove time takes it off. A Filter button sits beside the week label (labels, "No label", "Show complete"; tasks only, remembered across restarts). The text below is kept as history.
- **Brain Dump and the task editor (flow of 2026-10-05, 2.7.0)** — the
  thing you capture IS the task. Typing in the Brain Dump pane's input and
  pressing Enter creates a Task straight away (title only, no Day). The left
  pane lists every incomplete task with no Day, newest first, plus any legacy
  Brain Dump items from the phone shown the same way. Clicking anywhere on a row
  (a small pencil appears on hover) opens the editor, a centred modal overlay,
  never a separate screen: name, duration (optional, 2.8.4: None, the default,
  stores nothing; quick chips 15m, 30m, 1h, 2h; Custom with hours 0 to 24 and
  minutes in 5 minute steps, 5 minutes to 24 hours, 24h only with 0 minutes;
  any older stored value shows as is until changed. On the Timebox a block
  under 30 minutes is drawn compact with its true duration, e.g. "10m"; a task
  with no duration takes 30 minutes when dropped there),
  priority, label (ten one-tap suggestions such as Work or Health until a label
  with that name exists, "+ Label" for a custom name, names unique ignoring
  case; the selected label shows its eight colour swatches plus Rename and
  Delete label, which tombstones it and moves its tasks to a same-named label
  or clears them), notes, Day (a
  web date input, min today, empty means no Day) and Repeat (2.8.3: Does not
  repeat, Weekly, Every 2 weeks, Monthly. Weekly and Every 2 weeks show seven
  day chips, 1 to 7 of them, plus Weekdays and Weekends; Weekly with all seven
  reads Daily, Every 2 weeks never does. Monthly has one "Day of the month"
  field, 1 to 31. A summary line underneath always says exactly what will
  happen, for example "Repeats every Wed, Fri and Sun, starts Wed 14 Oct" or
  "Repeats on the 31st of every month. In shorter months it falls on the last
  day."), plus a Done toggle
  and delete with an inline confirm. Everything is editable at any time, before
  or after scheduling. Opening and saving a legacy item converts it into a Task
  in one step (nothing is lost). Giving a task a Day moves it off the left list
  onto the board; clearing the Day (in the editor, or "Remove day" on the card)
  brings it back. There is no "Make task" and no "New task" button. A collapsed
  "Done today" line at the bottom of the left pane lists tasks completed today
  (no Day), each with a checkbox so a mistaken tick can be undone. No past date
  can be chosen. The board never creates tasks.
  Only the next occurrence of a recurring task exists: completing one (a
  checkbox or the Done toggle, both through `setTaskCompleted`) creates the
  next on the next chosen day strictly after the later of its Day and today
  (Every 2 weeks: in the weeks counted from the week of its Day). Cards and
  Timebox blocks show a small repeat mark; Brain Dump rows show a short form
  such as "Wed Fri Sun"; only the editor lists the days in full.
  **A task gets a time only by being dragged onto the Timebox** (2.8.2): there
  is no time input on cards or in the editor. Dragging a block off the
  Timebox (to a day or the left list) removes the time.
- **Week board (the Plan)** — forward only. The days of the displayed week;
  there is no Unscheduled column (the left pane is the list of tasks with no
  Day). Weeks start on Monday. The current week shows today to Sunday (past
  days are hidden); future weeks show Monday to Sunday. The header has a
  previous arrow (disabled on the current week), a label such as "Wed 7 Oct to
  Sun 11 Oct" (the year is added when it is not the current year), a next
  arrow, and a "This week" button (disabled on this week). Clicking the label
  opens "Jump to week containing" with a date input (min today). The past
  cannot be browsed. An unfinished task from a past day shows first in the
  Today column with a muted "from <date>" tag, only while the current week is
  displayed; finished past tasks are not shown. Clicking anywhere on a card
  opens the same editor; the complete checkbox and the hover buttons (remove
  day, move to day) do not. "Move to day" offers Remove day,
  Today, Tomorrow and a date input (min today); if the date is outside the
  displayed week a quiet line ("Moved to Mon 2 Nov") confirms it.
- **Drag and drop (2.8.0, checkpoint 4, decision 019)** — pointer based, mouse
  only. A left row dropped on a day column gets that Day (no modal); dropped on
  the Timebox it gets the Timebox's day and the 30 minute slot under the
  pointer (no duration means 30 minutes; an existing duration is kept). A card
  dropped on another day changes its Day and keeps its time; dropped on the
  left pane it loses its Day and time. A Timebox block moves up or down and
  resizes from its bottom edge, both in 30 minute steps across the whole day,
  00:00 to 24:00 (minimum 30 minutes; the latest start is 23:30 and it may
  run past midnight, see 2.14.0); dropped on a day column it keeps that Day and loses its
  time; dropped on the left pane it loses both. A past day rejects a drop with
  a muted "Past day" note on the lifted card. While dragging: the lifted card
  has a soft shadow, the target column or the left pane is highlighted, the
  Timebox shows a dashed slot with "10:30 to 11:00". At the left or right edge
  of the board the board first scrolls sideways; at the end of its scroll a
  quiet strip appears and, after about 600 ms, the week changes (repeating
  while held; never before this week). The wheel scrolls panes during a drag,
  and holding near a pane's top or bottom edge scrolls it. Escape, or a drop
  outside any target, leaves the item where it was. A press only becomes a
  drag after 5 px, so a click still opens the editor; the checkbox and the
  hover buttons never start a drag. Events (CustomEvents) are not draggable.
  A block that runs past 24:00 is drawn to the grid end with a quiet
  "continues" marker; its rest shows on the next day (2.14.0).
- **Timebox day/week** — a segmented toggle inside the Timebox pane's own
  header. Week mode mounts the same grid component day mode uses; it is
  not a separate screen.
- **Quest panel** (Today's routines / Recurring quests) — a right-side
  overlay on Desktop Home, per above. The Level/XP module at
  the top is **hidden until decision 014 (XP) ships**; once it does it
  shows regardless of which view is active inside the panel.

---

## Related docs
- `docs/decisions/009-desktop-platform-and-auth.md` — the three-pane
  layout and top-bar placement this spec refines
- `docs/DESIGN_VISION.md` — capture → plan → place pipeline; mobile nav
- `docs/ROUTINE_GAMIFICATION_SPEC.md` — the quest/routine checklist model
  the Quest panel and Progress page both draw from
- Prototype: https://claude.ai/artifact/5JLoeWRwkGL9Qkpmq2f5Hj
