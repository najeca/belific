# Belific — Ubiquitous Language

Use these exact terms in all code, docs, and conversations.
Never invent synonyms.

---

## Core Terms

| Term | Definition |
|------|-----------|
| **Schedule** | The full day plan loaded from `data.js` |
| **Block** | One time slot in the schedule (time + label + category) |
| **Category** | The type of a block (work, fitness, cyber, etc.) |
| **Reminder** | A custom user-created local notification |
| **Streak** | Consecutive days with logged activity |
| **Pomodoro** | A 25-minute focused work session |
| **Session** | One completed Pomodoro block |
| **Weekly Summary** | The Sunday 6 PM recurring digest notification |
| **Streak at Risk** | The daily 8 PM unconditional nudge notification |
| **WEEKLY_SCHEDULE** | The source-of-truth schedule object in `data.js`, keyed Mon–Sun |
| **SPECIFIC_SCHEDULES** | Date-keyed overrides; empty for general use |

---

## App Name

**Belific** — always capitalised exactly this way. Never "belific" or "BELIFIC" in user-facing text.

---

## Category Colours (exact hex values from `data.js`)

| Category | Hex |
|----------|-----|
| `work` | `#888780` |
| `routine` | `#B4B2A9` |
| `hygiene` | `#7F77DD` |
| `fitness` | `#639922` |
| `jobs` | `#378ADD` |
| `project` | `#534AB7` |
| `cyber` | `#1D9E75` |
| `game` | `#BA7517` |
| `school` | `#D85A30` |
| `church` | `#D4537E` |
| `chore` | `#C47C2B` |
| `winddown` | `#D3D1C7` |
| `sleep` | `#D3D1C7` |
| `free` | `#B4B2A9` |

---

## What Not To Call Things

| Wrong | Right |
|-------|-------|
| "timer" (for the technique) | Pomodoro |
| "push notification" | Notification (all notifications are local) |
| "task" | Block |
| "plan" | Schedule |
| "alert" | Reminder |

---

## Related Notes
- [[architecture]]
- [[current-state-audit]]
