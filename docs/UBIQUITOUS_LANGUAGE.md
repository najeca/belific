# Belific — Ubiquitous Language

Use these exact terms in all code, docs, and conversations.
Never invent synonyms.

> [!WARNING] This file previously used "Block", "Streak", "Weekly
> Summary", and "Streak at Risk" — terms from the pre-v2 WebView-era
> web app (`js/data.js`'s `WEEKLY_SCHEDULE`). None of those concepts
> exist in the current mobile codebase: there is no streak tracking
> anywhere, and both notifications were removed during the v2
> restructuring's psychology-rule audit. The terms below reflect the
> mobile app (`mobile/lib/types.ts`) as it actually is.

---

## Core Terms

| Term | Definition |
|------|-----------|
| **Custom Event** | A user-created scheduled item (`CustomEvent` — title, category, start/end time, date, notes) |
| **Template Event** | A recurring weekly-schedule or starter-routine event, not user-created — never generates a notification |
| **Category** | The type of an event (work, fitness, cyber, etc.) — see `CATEGORIES` in `lib/data.ts` |
| **Brain Dump** / **Dump** | The quick-capture space for spontaneous, title-only thoughts with no date/time required upfront (`BrainDumpItem`). Tab/header say "Brain Dump"; internal type name stays `BrainDumpItem`. |
| **Promote** (to a Custom Event) | Scheduling a Brain Dump item via the event form — this **copies** it onto the calendar as a real `CustomEvent`; the dump item is left untouched in Dump (reversed from an earlier copy-vs-move design; see decision history in `docs/CHANGELOG.md` 1.1.0) |
| **Promote** (to a Task) | Converting a Brain Dump item into a `Task` — this **moves** it: the Task is the item's final form, the dump item is deleted. Opposite behavior from promoting to a Custom Event — deliberate, not an inconsistency (a Task has no calendar slot to "also" occupy in Dump). |
| **Task** | A to-do with an optional due date (no fixed time) and priority, distinct from both `CustomEvent` (always has a concrete date/start/end) and `BrainDumpItem` (no due date at all) — see `lib/types.ts` |
| **Routine** *(habit sense)* | A repeating daily habit tracked via a simple done/not-done toggle per day (`Routine` + `RoutineCompletion`) — grouped Morning/Afternoon/Evening on Today. No streaks, no history view; missing a day is invisible, never flagged. |
| **Routine** *(category sense)* | Also the name of one of the 5 default event Categories (`routine` `CategoryKey`, 🔄 icon) — an unrelated, pre-existing sense of the word. Context (a Today section vs. an event's category chip) disambiguates; not worth renaming either one for a naming overlap this minor. |
| **Project** | A lightweight tag/filter label only (`{ key, name }`) that a Task can optionally carry — no dedicated screen, no color/icon, no progress view. Not to be confused with the `project` `CategoryKey` (unrelated, pre-existing). |
| **Reminder** | A custom user-created local notification with its own time and message (`scheduleCustomReminder`) — distinct from an event-start notification |
| **Pomodoro** | The focused work-session technique; duration is user-configurable in Settings (default 25 min focus / 5 min break / 15 min long break / 4 sessions) |
| **Session** | One completed Pomodoro focus phase |

---

## App Name

**Belific** — always capitalised exactly this way. Never "belific" or "BELIFIC" in user-facing text.

---

## Category Colours

Current values (light/sage-cream theme, v2) live in `mobile/lib/data.ts` — do not hardcode them here, as they've already drifted from a stale copy once. Check `CATEGORIES` and `DAY_TYPES` in that file directly for the source of truth.

---

## What Not To Call Things

| Wrong | Right |
|-------|-------|
| "timer" (for the technique) | Pomodoro |
| "push notification" | Notification (all notifications are local) |
| "block" (for a scheduled item) | Custom Event (if user-created) or Template Event (if from the weekly schedule) |
| "task" (for a scheduled/timed item) | Custom Event or Template Event — "Task" is a real, distinct type now (undated to-do), don't use it loosely for anything with a fixed time |
| "note" / "scratch item" | Brain Dump item |
| "alert" | Reminder (only for the custom-message type; event-start notifications are just "event notifications") |
| "streak" | Does not exist in this app — do not introduce streak tracking without discussing the design-identity skill's no-loss-framing rule first |

---

## Related Notes
- [[architecture]]
- [[current-state-audit]]
