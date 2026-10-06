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

**Progress** — level ring with weekly / longest-streak / lifetime XP
stats (the XP parts wait for decision 014), an XP history feed (source, amount, when), and a streak calendar
(month grid — full / partial / missed days). This is the fuller form of
the "streak-milestone log" decision 009 sketched as living inside the
profile hub — it's now its own page, reached from the Quests dropdown
rather than Profile, since it's routine/quest data, not account data.

---

## Everything else stays inline

- **Brain Dump and the task editor (flow of 2026-10-05, 2.7.0)** — the
  thing you capture IS the task. Typing in the Brain Dump pane's input and
  pressing Enter creates a Task straight away (title only, no Day). The left
  pane lists every incomplete task with no Day, newest first, plus any legacy
  Brain Dump items from the phone shown the same way. Clicking anywhere on a row
  (a small pencil appears on hover) opens the editor, a centred modal overlay,
  never a separate screen: name, duration (quick chips 30m, 1h, 2h plus Custom:
  hours 0 to 24 and minutes 0 or 30, minimum 30 minutes, 24h only with 0
  minutes; an older stored value such as 15m shows as is until changed),
  priority, label (with the selected label's eight colour swatches), notes, Day (a
  web date input, min today, empty means no Day) and Repeat (Does not repeat,
  Every day, Specific days, Every 2 weeks, Monthly; Specific days and Every 2
  weeks show seven day chips, any combination, at least one, plus Weekdays and
  Weekends; a summary line underneath always says exactly what will happen,
  for example "Repeats every Wed, Fri and Sun, starts Wed 14 Oct" when the Day
  moves to the first chosen weekday on or after it; "Weekly" is never shown;
  Monthly repeats on the Day's date number, the last day in shorter months),
  plus a Done toggle
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
  resizes from its bottom edge, both in 30 minute steps inside 06:00 to 23:00
  (minimum 30 minutes); dropped on a day column it keeps that Day and loses its
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
  A block that runs past 23:00 is drawn to the grid end with a quiet
  "continues" marker (resize still stops at 23:00; a longer duration set in
  the editor is kept).
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
