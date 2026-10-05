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
now exist under `mobile/app/components/desktop/`.

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

- **Task add/edit** — a centered modal overlay on Desktop Home, whether the
  task is new or existing. Never a separate screen. **Tasks are created only
  in the Brain Dump pane** (pipeline: Brain Dump, task details, Plan,
  Timebox): "Make task" on a row opens the form pre-filled and removes the
  item on save; the "New task" button in the pane header opens it blank. The
  centre kanban never creates tasks; clicking a card edits an existing one.
  The form has name, duration chips, priority, label, notes, Day (a web date
  input, min today, empty means Unscheduled) and Repeat (Does not repeat, Daily,
  Weekly with weekday chips, Every 2 weeks, Monthly). Repeat is set here only;
  the board never creates occurrences. Only the next occurrence exists: completing
  a recurring task (kanban checkbox or the form's Done toggle, both through
  `setTaskCompleted`) creates the next one. A small repeat icon marks recurring
  cards. No past date can be chosen.
- **Week board (the Plan)** — forward only (2.5.0). A pinned Unscheduled
  column plus the days of the displayed week. Weeks start on Monday. The
  current week shows today to Sunday (past days are hidden); future weeks
  show Monday to Sunday. The header has a previous arrow (disabled on the
  current week), a label such as "Wed 7 Oct to Sun 11 Oct" (the year is added
  when it is not the current year), a next arrow, and a "This week" button
  (disabled on this week). Clicking the label opens "Jump to week containing"
  with a date input (min today). The past cannot be browsed. An unfinished
  task from a past day shows first in the Today column with a muted "from
  <date>" tag, only while the current week is displayed; finished past tasks
  are not shown. "Move to day" offers Unscheduled, Today, Tomorrow and a date
  input (min today); if the date is outside the displayed week a quiet line
  ("Moved to Mon 2 Nov") confirms it.
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
