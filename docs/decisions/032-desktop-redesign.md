# Decision 032 - The desktop redesign (2.26.0)

**Date:** 2026-10-17
**Status:** Proposed. Jethro decided the layout, the card look (an approved override of the shared design skill), the fonts and their measurements, the Tasks name, Today, the per day Add a task boxes, keyboard moves, that past days refuse drops, removing priority from the interface, removing drop to subtask, the labels menu with new colours that never change an existing label, the task details modal and the Quests steps. The rest are choices made while building (`docs/build-progress.md`, "Desktop redesign"). Confirm after using it for a while.

Source: Jethro's redesign request and answers of 2026-10-17, with reference screenshots kept outside the repo (layout, behaviour and feel only; no icons, text or visuals copied). Builds on decisions 021 (cards), 023 (series), 028 (desktop layout and shortcuts) and 029 (Quests).

---

**Layout.** Three full height columns and nothing across the top: the left pane (the logo, which is never a button, with its hide button; the list switcher; "Add a task" with its planned time; the tasks), the centre (its own top row: Tasks | Calendar, Only today, Quests, the profile button; a show button for each hidden pane), the right pane (only the Timebox, with its hide button). Plan my day, Shut down my day, Quick capture, Search, Settings and Keyboard shortcuts moved into the profile menu; their shortcuts still work. Panes dock from 900 px (left) and 1180 px (right) and become overlays below that; the desktop layout starts at 640 px (it was 1024, which put a narrow window into the phone layout).

**Days.** Tasks and the Calendar's week view are one continuous sideways strip of days (5 years each way, virtualised), opening with today at the left edge; Today jumps back. Each day from today on has its own Add a task box. **No carry over:** an unfinished task stays on its own day and no stored date changes on the board; only Daily Planning's Finish (which says so on screen) and Shutdown move tasks. The iPhone still lists unfinished earlier tasks first on Today (no date changes); changing that is offered, not done.

**Cards and type.** Inter for the interface and Roboto Mono for times, shipped inside the app (OFL and Apache 2.0, licences beside the files; Inter is used through a "Segoe UI" alias so every existing font stack picks it up). Cards: white or the label's tint, 12 px corners, a soft shadow, padding 11 × 12, a 10 px gap; the controls overlay the second line on hover so the card never changes height; a steps ring for subtasks. Day headers 20 px with a muted date.

**Drag.** One drag feedback everywhere (the card under the pointer, a dashed placeholder or slot where it lands). The Calendar's day and week views drag, resize and accept drops like the Timebox through one shared `TimeBlock`. Arrow keys move a focused block (Shift+Up and Down resize); plain arrows, because Alt is never a shortcut in Belific. Past days refuse drops. Dropping a card on another card only moves it (drop to subtask was removed, code and tests).

**Priority.** Removed from the interface on the desktop and the iPhone (flags, muted Low titles, the options, the details row, the iPhone pickers, the power feature toggle, the sort). Stored values, the column and the sync are untouched; editing writes a stored priority back unchanged. The iPhone part needs a TestFlight build.

**Label colours.** Twelve colours added after the original eight, whose keys, names and colours never change. A desktop before 2.26.0 replaces a colour key it does not know with one of the eight and syncs it, so the new colours are locked until "Every computer runs Belific 2.26 or later" is ticked (per computer), and automatic colours only ever come from the eight. From 2.26.0 an unknown key is kept and drawn neutral, so a later palette degrades safely. The iPhone shows no label colours.

**Task details** are a centred 600 px modal: a 23 px title; Task date, Estimated time, Actual time, Label, Repeats, then List, Notes and Subtasks; Emoji, Duplicate, Save as template, Pomodoro and Delete in a ⋮ menu. Escape closes it from a field too.

**Quests** show their steps ("Morning Routine 0/3") and expand to tick them for the day that is due, storing a projected day on the first tick (decision 023).

## Related Notes
- [[docs/decisions/021-edit-on-the-card]]
- [[docs/decisions/023-repeating-tasks-as-series]]
- [[docs/decisions/028-desktop-timer-shortcuts-and-layout]]
- [[docs/decisions/029-quests-period-streaks-and-daily-flows]]
- [[docs/build-progress]]
