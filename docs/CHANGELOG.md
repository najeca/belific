# Belific Mobile — Changelog

Every completed feature, fix, or change bumps `mobile/app.json`'s
`expo.version` (patch for fixes, minor for features) and gets an entry
here, dated, as part of the same scoped commit — not added
retroactively at session end. Read this file before starting new work
to know the current version and recent history.

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
