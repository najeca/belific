# Decision 028 - Desktop timer, keyboard shortcuts and layout

**Date:** 2026-10-16
**Status:** Proposed. Awaiting Jethro's confirmation after he has used phases 2 and 3 on the desktop (the by-hand list is at the end of `docs/build-progress.md`).

Source: the phase 2 and 3 brief (`docs/belific-build-plan.md` section 0, items 8 to 11, and phases 2 and 3). Builds on decisions 013 (sync), 021 (edit on the card), 024 (Timebox) and 027 (no XP; streaks only on recurring tasks). **It brings Actual time back**, which decision 022 removed in 2.14.0, as `actualMinutes` with a timer: whole minutes, NULL means 0, synced (migration 002).

---

**The timer.**
- A task's timer is one field, `timerStartedAt`, synced like any other, so a timer started on one device shows on the other after a sync.
- Stopping adds the elapsed **whole minutes, rounded down**, to `actualMinutes` and clears the start. A start in the future (the other device's clock is ahead) counts as 0.
- **One timer runs at a time.** Starting a second stops the first and adds its minutes. If two arrive from two devices, the most recently started is the active one and the others are listed.
- **A timer that has run for more than 24 hours is never added silently.** Stopping it, or starting another task, asks: add all of it, add none, or type a time. Nothing is written until it is answered.
- The floating timer reads the stored tasks, never memory, so it survives navigation and a restart.
- A running timer counts toward the day and list totals for the time it has run so far. A missing actual is 0 everywhere. Estimate against actual is never a warning: going over only tints the figure.

**Keyboard shortcuts.** One registry (`mobile/lib/shortcuts.ts`); the help overlay (Shift+/) is generated from it and lists only wired keys.
- **Nothing fires while typing** in an input, textarea, select or contenteditable, while a popover or an overlay is open, or on a held key (the arrows excepted).
- **Tab, Space and Alt are never shortcuts**; Tab keeps normal focus order. V (not Tab) switches Kanban and Calendar.
- Card keys act on the card that has the keyboard focus. Home keys work anywhere on the home screen. New keys are added to the registry and nowhere else.

**Layout.**
- The left and right panes collapse to rails and the centre switches between Kanban and Calendar. The centre never hides.
- The layout is remembered in the user_settings row `ui.panes` (so it follows the person when signed in) with a local fallback; the setting is read first, then the local copy, then the default; a damaged value never breaks the screen. It is read once at start and the last write wins between devices.
- **The Calendar shows and opens; it takes no drops.** A task is given a time only by dragging it onto the Timebox (right pane), as before.
- Desktop home still never navigates for adding, editing, labels, the Calendar, search or capture: all of these are inline, popovers or overlays. Only Settings, Labels, Progress, Sign in (and later Quests) change the page.

**Emoji.** The system's native emoji, never bundled artwork, wherever a natural one exists; Ionicons only for chevrons, close, check circles, the drag handle, play and pause, and the More (ellipsis) button.

## Related Notes
- [[docs/decisions/013-sync-model]]
- [[docs/decisions/021-edit-on-the-card]]
- [[docs/decisions/022-estimate-and-actual-time]]
- [[docs/decisions/027-no-xp-streaks-on-recurring-tasks-only]]
- [[docs/belific-build-plan]]
