# Belific Mobile — Changelog

Every completed feature, fix, or change bumps `mobile/app.json`'s
`expo.version` (patch for fixes, minor for features) and gets an entry
here, dated, as part of the same scoped commit — not added
retroactively at session end. Read this file before starting new work
to know the current version and recent history.

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
