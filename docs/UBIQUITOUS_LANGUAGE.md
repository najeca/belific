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
| **Brain Dump** / **Inbox** | The quick-capture space for spontaneous, title-only tasks with no date/time required upfront (`BrainDumpItem`) |
| **Promote** | Converting a Brain Dump item into a real Custom Event via the schedule form, then deleting the dump item |
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
| "block" / "task" (for a scheduled item) | Custom Event (if user-created) or Template Event (if from the weekly schedule) |
| "note" / "scratch item" | Brain Dump item |
| "alert" | Reminder (only for the custom-message type; event-start notifications are just "event notifications") |
| "streak" | Does not exist in this app — do not introduce streak tracking without discussing the design-identity skill's no-loss-framing rule first |

---

## Related Notes
- [[architecture]]
- [[current-state-audit]]
