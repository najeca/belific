# Belific Mobile — Changelog

Every completed feature, fix, or change bumps `mobile/app.json`'s
`expo.version` (patch for fixes, minor for features) and gets an entry
here, dated, as part of the same scoped commit — not added
retroactively at session end. Read this file before starting new work
to know the current version and recent history.

---

## 2.27.0 — 2026-10-18 (fix batch for the desktop redesign)

**Ten fixes asked for by Jethro after using 2.26.0, one commit each; the version in `mobile/app.json` moves to 2.27.0 in the last commit (as asked). No schema change, no new table, no sync change. The Ellie screenshots were used for behaviour and layout only. This entry grows with each item.**

### 1. The card, the Add a task box and the details modal
- **A click anywhere on a card opens the task details modal**, the same in every view: Tasks, the left list and every list, the Timebox, the Calendar (blocks, the all day row, month chips, "continues from yesterday" blocks). Only the tick box and the steps ring do something else. Enter on a focused card opens it too. A day of a repeating series that is only shown (not stored) opens as well: the modal edits the series and opening it writes nothing. A legacy phone Brain Dump item is converted to a task when opened (its first edit, as before).
- **The inline expand and collapse and the inline row of controls are gone** (and the Timebox block menu, `TaskBlockPopover.tsx`, is removed). The card face shows only the tick box, the emoji and title, the time (a placed task's start time, else the estimate), the label's colour and emoji, the steps ring with "1/2" when there are steps (no counter without steps), a small "Must do" marker, and, on today's card of a repeating task, the quiet run line of decision 007.
- **On hover at most three small icons**, top right, in the card's colour: 🏷️ Label first, ☀️ Move to today (not on today's tasks or a repeating day) and the ⋮ menu (Open details, Start or stop the timer, Start a pomodoro when on, Duplicate, Skip this day or Delete). The card never changes size on hover.
- **The steps ring** ticks the next open step; with all done it opens the details at the steps.
- **The details modal** now holds what left the card: the time of day beside the date (and Remove time), a Reminder row, and the steps (add with Enter, rename by clicking, delete). The card keys open it where they used to act: S, O and Ctrl+I open it, Ctrl+S at a new step, Ctrl+E at the estimate, Ctrl+B at the actual time. Ctrl+L still opens the card's label menu, Ctrl+Delete the ⋮ menu at "Delete?".
- **The Add a task box** (one component, `AddTaskBox.tsx`, on every day and in the left list) has the title, a time (on a day; it shows once you type) and the 🏷️ Label button, which is always there and sits inside the box. Enter adds the task with them.
- **Fix found on the way:** the Tasks strip sometimes opened five years back (October 2021) because the jump to today ran before the strip was laid out; it now tries again until it lands.
- Real checks: new `desktop/test/real/p10.js` (one section per item); p2, p3, p5, p7, p9, cp8b, cp8c, cp8d, cp8e, cp8f, cp8g, cp8h and cp11 moved from the inline controls to the modal (same typing and editing checks, now in the details).

### 2. Label colours
- **Twenty swatches: the original eight, unchanged (names, keys, colours), then twelve vibrant, well separated ones of our own:** Red `#E23B3B`, Orange `#F07A1A`, Yellow `#BF9100`, Lime `#6FA80F`, Green `#1F9E4E`, Teal `#0F9E8E`, Cyan `#0B97CF`, Blue `#2F6FEB`, Indigo `#4F46C8`, Purple `#A44BE0`, Magenta `#CC36B4`, Pink `#E8508E`, each with a light tint. Tested: both text colours stay AA on every tint, every edge is at least 2.5:1 on the surface, the twelve are at least 20 apart in CIE Lab (red, orange, yellow and pink at least 30).
- **The twelve muted 2.26 colours are no longer offered**; a label that has one keeps it and is drawn exactly as before (`LEGACY_COLORS`).
- **A labelled card now has a 3 px left edge in the label's strong colour** (the tints have to stay light for readable text, so the edge carries the colour on the board, as blocks already did on the Calendar and Timebox).
- **The colour wheel:** the last swatch opens a picker for any colour (hue, shade and a hex field, `ColorWheel.tsx`), stored as `#RRGGBB` in the existing label colour field (no schema change). Its card tint is worked out from it so text stays AA.
- **The tick is now "Every computer runs Belific 2.27 or later"** (a new local key, so a 2.26 tick does not count), and it unlocks the twelve and the wheel. An older Belific never breaks on a custom colour: 2.26 keeps a key it does not know and draws it neutral, the iPhone shows no label colours and passes the value through, and a desktop before 2.26 would change it back to one of the eight (the tick is there for that).
- A new label takes the first free colour; the vibrant ones only once the tick is on.
- Real checks: p9 step 5 and cp9 (the 20 swatches, the lock, the teal tint and edge, the new local key) and p10 section 2 (the order of the swatches, the tick, a wheel colour stored as hex and drawn on the card).

### 3. No two labels with the same colour
- **A colour another label already has is dimmed, carries a small white marker and says which label has it** ("Sage colour for the new label, used by Work"); it cannot be picked, in the label menu's New label form, on the Labels page or anywhere else the picker shows. Locked colours (no 2.27 tick yet) and taken colours are told apart.
- **The colour wheel refuses a colour too close to another label's** (CIE Lab distance under 12) and names it: "Too close to the colour of “Work”".
- **The storage rule refuses it too** (`setLabelColor` returns the message; creating a label with a taken colour takes the next free one), so no path can write a clash. A rule of this app only: the server does not check it.
- **Labels that already share a colour are left alone.** The Labels page shows a notice naming them ("Work and Home share a colour. Change one of them to tell them apart"), until one is changed.
- Real check: p10 section 3.

### 4. Lists never look empty
- **A named list keeps every task in it.** A task given a day (or a time) stays in its list and shows its day ("Tomorrow", "Wed 21 Oct") and, when placed, its time; it is on its day on the board as well. Unscheduled tasks come first, then the scheduled ones, earliest first; a repeating task shows once. The count beside the list's name counts them too.
- **Brain Dump keeps its rule**: a task with a day leaves it (it is the inbox of tasks with no day).
- Decision written in `docs/build-progress.md` (fix batch decision 13). Real check: p10 section 4.

### 5. The weekday on 18 October 2026
- **Checked: the maths is right.** The day header, the Today button and the strip all work in local time; Sunday 18 October 2026 (Europe/London, BST) shows as Sunday at every hour, and so does the day of the clock change a week later. New unit test `lib/weekday.test.ts` with fixed dates (it runs a child process with `TZ=Europe/London`).
- **Bug found and fixed:** the Timebox and the Calendar kept the day they were opened on. Belific lives in the tray for days, so after midnight they still showed yesterday instead of today. Now a view that was on today moves on to the new today at midnight, and a view moved to another day stays put; the Calendar week also keeps its first day (the strip is counted from today, so before this it slid by a day). The Tasks board already followed (it redraws every 30 seconds and jumps to today when the date changes).
- The October 2021 startup fix is in item 1.

## 2.26.0 — 2026-10-17 (desktop redesign)

**Desktop redesign after Jethro's review, with the Ellie planner as the reference for layout, behaviour and feel only (no copied icons, text or visuals). No schema change, no sync change: every stored value (priority included) is untouched and still syncs. Built and committed step by step; this entry grows with each step.**

### Layout (step 1)
- **Three full height columns, nothing across the top of the window.** Left pane: the Belific mark and name with its hide button, then the list switcher, the "Add a task" box with the time still planned in the list ("5h planned", estimates of unfinished tasks), then the tasks. Centre pane: its own top row with only ✅ Tasks | 📆 Calendar, 📅 Only today, 🎯 Quests and the profile button, then the board or the Calendar. Right pane: only the Timebox, with its hide button beside its header.
- **Hiding:** the left pane's hide button (or `[`) hides it and a small show button appears at the left of the centre's top row; the Timebox's hide button (or `]`) hides it and its show button appears at the right of the centre's top row. Remembered as before (`ui.panes`).
- **Window widths** (page width): the list docks from 900 px, the Timebox from 1180 px; narrower, they fold away by themselves and their show buttons open them over the centre (Escape or a press outside closes them) without changing the remembered choice. The Calendar takes the whole centre and never shows the Timebox panel. **The phone layout is only for a page under 640 px** (`DESKTOP_BREAKPOINT` in `mobile/lib/useIsDesktop.ts`; it was 1024, the same as the window's minimum outer width, so the smallest window always fell to the phone's Today page). The window's minimum width is now 760.
- **Profile menu:** Plan my day, Shut down my day, Quick capture, Search and Keyboard shortcuts join the account items. The top strip, the pane rails and the ⌨️ button are gone; every shortcut still works (Shift+/ still shows the overlay). Settings has a Keyboard shortcuts section generated from the same registry.
- **Kanban is now called Tasks** in the desktop interface.
- **Logo:** the mark from the app icon (`mobile/assets/belific-mark.png`, cut by `desktop/scripts/make-icons.js`); the window, taskbar, tray and installer icons were already the Belific mark and are unchanged.
- Real check p3 now covers the widths and the folding; p5 and p7 open Planning and Shutdown from the profile menu.

### Continuous days, Today, Add a task per day, no carry over, no drop to subtask (step 2)
- **The Tasks board is one continuous strip of days** (`lib/dayStrip.ts`): it opens with today at the left edge and scrolls sideways (mouse wheel, scroll bar, or ‹ › one screen at a time) to any day five years back or ahead, with no week boundaries: on a Sunday, Monday is simply the next column. Only the columns on screen and three either side are drawn. **Today** ("Show today in Tasks") jumps back; **Jump to date** now takes any date, past included. Holding a drag at either edge scrolls the strip (the old week change is gone).
- **Columns** read "Sat Oct 17" (weekday 20 px bold, date muted) with a sage "Today" tag; past days are dimmed and refuse drops (unchanged rule).
- **Add a task on each day** from today on: a box at the top of the column (Enter adds a task on that Day) with the day's actual against estimated time.
- **No carry over:** unfinished tasks of earlier days no longer appear in Today; they stay on their own day (scroll back to find them). No stored date changes. Daily Planning and Shutdown still move tasks only when the person chooses.
- **Dropping a task on another card no longer makes it a subtask**: the code is removed (`planDropAsSubtask`, the hover dwell, the "Added to... Undo" bar, the card highlight). A drop is only ever a move to a day, a time or the list. Subtasks are added on the card or in the details window. The Trash still recognises merges made by older versions.
- **Drag feedback:** the day a dragged task would land in shows a dashed placeholder with its name.
- The left list's header no longer repeats the actual / estimate figure (its box shows "… planned").
- New real check `desktop/test/real/p9.js` (strip, Today, arrows, wheel, add per day, no carry over, placeholder, past day refusal, never a merge). cp8b, cp8g, cp8h and p3 updated for the strip (cp8h keeps its weeks by naming seven days and jumping to them).

### Cards and text (step 3)
- **Inter for the whole interface and Roboto Mono for timer and clock figures**, shipped inside the app (`mobile/assets/fonts`, with their licences: Inter under the SIL Open Font License, Roboto Mono under the Apache License 2.0), so it works offline. `components/desktop/desktopFonts.ts` registers them (the same Inter files also stand in for "Segoe UI", the first family of react-native-web's text stack on Windows, so every text is Inter without touching the icon font or emoji); `mobile/metro.config.js` adds `.woff2` as an asset type. Desktop only.
- **Cards** (measured from the reference): a soft solid fill in the label's colour (white with no label), no hairline, 12 px corners, a light shadow that deepens on hover (120 ms; nothing moves), padding 11 × 12, 10 px between cards. Two lines: a rounded tick box, the emoji and title (14 px, 600) and the estimate (mono); then what the task carries as quiet text (label, time, steps ring, repeat, reminder, time spent). The controls lie over that second line on hover or keyboard focus (so the card never changes height) and sit in the flow when the card is expanded.
- **Steps ring:** the grey ☑️ is now a ring that fills in sage as steps are ticked and turns solid sage with a tick when every step is done.
- p9 checks the fonts, the card's measured style and the ring.

### The Calendar does what the Timebox does (step 4)
- **Drag, resize and drop on the Calendar**, with the Timebox's own code: a task block is now one shared component (`TimeBlock.tsx`) used by the Timebox and the Calendar's day and week views, on the same `DragProvider` and `lib/drag.ts` rules. Drag a block to another time or day (30 minute steps, the Timebox's snap; never onto a past day; a projected day of a repeating series changes the series' time, never its day), drag its bottom edge to change the estimate, drop a task from the list or the board onto a time, drag an all day task onto the grid, and drop a block on the all day row to take its time away. Imported events stay fixed. Phase 3 had left the Calendar read only because the drag layer and its drop zones belonged to the Timebox; zones now accept any number of day columns (clipped below the sticky headers).
- **Keyboard moves** on a focused block (Timebox and Calendar): Up and Down 30 minutes earlier or later, Left and Right the day before or after, Shift+Up and Shift+Down 30 minutes shorter or longer (`lib/drag.ts` `nudgeBlock`, listed in the shortcuts). Plain arrows rather than Alt: Alt is never a shortcut in Belific.
- **The week view is a rolling strip of days**: seven columns fill the width, it opens on today and scrolls sideways to any day (‹ › move a week, Today jumps back); its title names the seven days ("17 to 23 Oct 2026"). Day headers, the all day row and the hours stay put while the grid scrolls.
- **Drag feedback, the same everywhere:** the lifted card is drawn like a task card (emoji, title, snapped time); a day column shows a dashed placeholder, a time grid a dashed slot with its time.
- p9 checks the Calendar drag to another day and time, the slot preview, the resize, the drop from the list, the arrow keys (and that Left stops at today), the drop on the all day row, and Next and Today on the rolling week. p3 updated for the rolling week.

### The labels menu: 20 colours and emoji (step 5)
- **Twelve new label colours** beside the original eight (Teal, Forest, Olive, Mustard, Amber, Coral, Berry, Lavender, Indigo, Ocean, Stone, Charcoal), each readable with Belific's text on its tint (AA, tested). **The original eight keep their keys, names and colours exactly**, and no existing label changes colour.
- **Safe on older versions.** A desktop before 2.26.0 treats a colour it does not know as missing, gives the label one of the original eight and syncs that, so it would change the colour back everywhere. So the new colours are locked in the picker until "Every computer runs Belific 2.26 or later" is ticked (kept on this computer only, never synced), and a new label is only ever given one of the original eight automatically. From 2.26.0 a colour the app does not know is left alone and drawn neutral, so a later palette cannot be overwritten. The iPhone app does not show label colours, so nothing changes there.
- **The label menu** (Ctrl+L on a card, the card's label button, a Timebox block): New label opens a small form with the name, an emoji and the 20 colours; Edit labels opens the Labels page; Remove label (was "No label") takes the label off the task. Search, create by typing, rename, recolour, emoji and delete on each row and the Suggested list are unchanged. The Labels page's colour popover uses the same 20 colour picker.
- No sync or schema change: the colour is the existing `color_key` text.
- p9 checks the New label form, the lock and its tick, creating a label with an emoji and a new colour, the card's tint, Remove label and Edit labels. cp9 updated for the 20 colour picker.

### Tasks, not Kanban (step 6)
- The board is called **Tasks** everywhere on the desktop (the centre switch "✅ Tasks | 📆 Calendar", the shortcut list "Switch between Tasks and Calendar", the Today button "Show today in Tasks", done in step 1) and now in the living docs: the glossary (`UBIQUITOUS_LANGUAGE.md`), the build plan, build progress, CURRENT_TRUTH and the home spec. Session notes, decisions and older CHANGELOG entries keep the old name as history.

### The task details modal (step 7)
- **Task details is a centred modal** (600 px wide, a 23 px title with the done box and the task's emoji beside it) instead of the panel over the right side. Rows in order: Task date, Estimated time, Actual time, Label, Repeats, then List, then Notes and Subtasks. **Emoji, Duplicate, Save as template, Start a pomodoro and Delete are in the ⋮ menu** at the top right. It opens the same way (O on a card, More, Open details), closes with ×, a press outside or Escape, and puts the keyboard back on the card. Every edit still saves as it is made, through the same task commands as the card.
- Escape now closes it from a text field too (the title has the keyboard when it opens), saving the field first; an open popover inside it still takes Escape first.
- p9 checks the size and position, the 23 px title, the row order, the ⋮ menu, an emoji and a rename from the modal, and a press outside. p2 and p7 open the ⋮ menu for the emoji and Save as template.

### Today and Add a task on each day (step 8)
- Done in step 2 and checked by p9 there: the Today button jumps the scrolling days back to today in Tasks ("Show today in Tasks") and in the Calendar ("Calendar go to today"); each day from today on has its own "Add a task" box with that day's planned time; the left list's box shows "N planned".

### Priority removed from the interface (step 9)
- **Priority is gone everywhere you can see it, on the desktop and the iPhone:** the flag and the muted Low title on cards (desktop cards, the iPhone's Today, Tasks and Calendar screens, events included), the Priority option on a card and on a Timebox block, the Priority row in the task details, the Priority picker in the iPhone's task and event forms, the Priority power feature toggle and its Settings text. Priority no longer sorts anything: a day column and the iPhone's task list order by time, then oldest first.
- **Stored priorities are untouched and still sync**: the `priority` column, the task and event fields, the sync, templates, Duplicate, Restore and the data export all keep it. Editing a task or an event on the iPhone writes its stored priority back unchanged. A stored `feature.priority` setting row is left as it is and no longer read.
- **The iPhone part needs the next TestFlight build**: until then the iPhone keeps showing priority.
- p9 checks no priority control on a card or in the details; p7 checks there is no Priority toggle and that editing keeps a stored High; p2 and cp8b updated (no priority control).

### Quests show and tick their steps (step 10)
- **A quest with steps shows how many are done** beside its name ("Morning Routine 0/3", in Roboto Mono) and the steps ring, and **expands** (the ring and chevron button, "Show the steps of …") to list them for the day that is due ("Today"). Ticking a step there is the same tick as on the board: a day that is only projected is stored on the first tick (decision 023), the series template is never changed, a second tap unticks, and ticking the last step completes the day as everywhere else. When this period is already done, the card shows the done day's steps. Quest cards are 340 px wide so the name and count share a line.
- p9 seeds a daily "Morning Routine" with three steps and checks the 0/3 count, that the list is hidden until expanded, ticking a step (today's occurrence stored with that step done, the template untouched), the 1/3 count, and unticking.

## 2.25.0 — 2026-10-17 (build plan phase 8, calendar connections)

**Desktop and iPhone. No table or column change. One grant written for review (003, not applied). One Edge Function written and tested locally, NOT deployed. The iPhone part needs a new TestFlight build (a new native module).** Section 7 steps 1 to 3 of the build plan; two way Google and Microsoft sync (step 4) is out.

- **iPhone calendars, read only** (`lib/deviceCalendar.ts`, Calendar tab, Settings, Calendars): the Calendar tab did not read the phone's calendar before (only Belific's own events). Now, after the person presses "Show my calendars" (asked in context, with the reason; iOS asks once), the events of every calendar on the phone (iCloud, Google, Outlook accounts) show in the day sheet beside that day's tasks, with a dot on days that have any. Read for the month on screen, kept in memory only, never stored, synced or written back. Denied: a plain explanation and Open Settings. `expo-calendar` 15.0.8 (the SDK 54 version, pinned) with `NSCalendarsUsageDescription` and `NSCalendarsFullAccessUsageDescription`; no Reminders strings (the package's config plugin is not used for that reason). Writing tasks to the phone calendar is not built (Jethro's decision).
- **Outbound feed** (`lib/icsFeed.ts`, `lib/calendarFeed.ts`, `lib/calendarFeedActions.ts`, Edge Function `belific-calendar-feed`): a secret link Google, Apple and Outlook can subscribe to. Timed tasks only, 30 days back to 365 ahead, the title with its emoji and a ✓ when done, nothing else; floating times; repeating series expanded with the app's own series code. The token (32 random bytes) is the `user_settings` row `calendar.feed_token`, so it follows the person; Make a new link replaces it (the old link is dead as soon as the change reaches the server; the app syncs at once and says whether it has), Turn off writes a tombstone. Settings, Calendars on both devices: the link with Copy (desktop) or Share (iPhone), Make a new link and Turn off, each confirmed. The data export already leaves the row out.
- **The function** reads, with the service role, only the owner of the token and then that owner's task rows (12 columns); writes nothing; one fixed sentence per failure; logs the status only; per token and per caller rate limits; no CORS. Deploy with `--no-verify-jwt` (also in `config.toml`). `003_calendar_feed_grants.sql`: `grant select on belific.user_settings to service_role` (Jethro's check: the other privileges were already there). Steps and checklist: `docs/CALENDAR_FEED_DEPLOY.md`.
- **Windows: imported calendars** (`lib/icsParse.ts`, `lib/externalEvents.ts`, `lib/icsSubscriptions.ts`, `desktop/src/icsFetch.js`, `icsStore.ts`, `CalendarsSection.tsx`, `CalendarPane.tsx`): paste an ICS or webcal link in Settings, Calendars; it is added only if its first fetch works. Its events show in the Calendar (day, week, month) beside the tasks, read only (a dashed outline and 📅; nothing opens or moves them): all day events and anything of 24 hours or more in the all day row, shorter ones on the grid, cut at midnight so the rest shows on the next day. Repeats (daily, weekly, monthly, yearly with INTERVAL, COUNT, UNTIL, BYDAY with 1MO or -1FR, BYMONTHDAY, BYMONTH, BYSETPOS, WKST), EXDATE, RDATE, moved and cancelled instances, time zones by IANA name, Windows name or the calendar's own VTIMEZONE, counted in the event's own wall clock so a clock change keeps 09:00 at 09:00. Refreshed every 30 minutes while the window is visible (10 after a failure), when it becomes visible, and with Refresh; last refreshed and the error in words; a failed refresh keeps the last events. Local to the computer, never synced, never in the export. Up to 10.
- **Fetching is the main process's**, never the page's: https on 443 only, no user name or password, every address the name resolves to must be public (checked at connect time, so a name cannot switch to a private address in between), at most 3 redirects each checked the same way, 15 seconds, 5 MB (also after gzip), must be a calendar. Only the host and a reason code are logged, never the link.
- Tests: `icsFeed`, `icsParse`, `externalEvents`, `icsSubscriptions`, `calendarFeed`, `calendarFeedFunction` (718 in all), `desktop/test/icsFetch.test.js`; the real function under Deno against a fake PostgREST (`scripts/feed-local-test.js`); real check `desktop/test/real/p8.js` (44 checks). iOS marker gate: `parseIcs`, `expandCalendar`, `addSubscription`, `Calendars shown in Belific` added (20 markers, 0 hits).

## 2.24.0 — 2026-10-16 (build plan phase 7, power features)

**Desktop only. No schema change, no sync change.** Every new piece of state is a `user_settings` row, which already existed and already syncs.

- **Power feature toggles** (Settings, ⚡ Power features): due dates and reminders, priority, daily planning, pomodoro, task templates, analytics, attachments. One `feature.<name>` row each (`on` or `off`), so a choice follows you to your other computer. Off means hidden, never deleted: turn it on again and everything is there (a reminder already set keeps working). Reminders, priority, planning and analytics start on (today's screens are unchanged); pomodoro and templates start off. Attachments are a "Coming later" row with no switch: nothing is stored or uploaded.
- **Labels is an overlay**, not a page: it opens over Settings (or anything else), closes with Escape, its button or a press outside, and focus returns to the button that opened it. Each label has an emoji.
- **Pomodoro** (🍅, on a card and in the details panel): a countdown laid over the one task timer, never a second timer. Starting it starts the task's timer the ordinary way (so starting it stops any other timer); when the 25 minutes are up the floating timer offers a break or keep going; a break stops the task timer exactly like any stop (whole minutes, rounded down, a timer over 24 hours asks first) and counts 5 minutes with no task timer running; skipping or finishing the break starts the next focus period. Starting another task's timer, or stopping this one, ends the pomodoro. The countdown is this computer's own state (never synced) and is found again after a restart.
- **Task templates**: "Save as template" in the details panel stores the title, estimate, notes, priority, label and steps (no Day, no progress) as one `template.<id>` row; 📑 beside the Brain Dump capture makes a new task from one in the list showing; Settings renames and deletes them. A template is trimmed to fit one setting (the notes first, then the last steps, never the title); 50 at most.
- **Reset local cache and resync** (Settings, Data): asks first, then does a full sync, then clears this computer's copy and downloads it again. It REFUSES, and clears nothing, if you are signed out (this computer would hold the only copy), the sync did not finish, anything is left in the outbox, or a write slipped in while resetting (checked again under the storage lock). Every refusal says so in words.
- Emoji on the Settings sections, the Progress heading and each repeating task there, and the Labels overlay.
- Real check `desktop/test/real/p7.js` (54 checks); unit tests for the toggles, pomodoro, templates and every refuse case of the reset. The Labels checks in cp9 and cp11 now expect an overlay.

## 2.23.0 — 2026-10-16 (build plan phase 6, Analytics, Trash, data export)

**Desktop only. No schema change, no sync change.**

- **Analytics** (📊 in the profile menu, a page): ranges work week (Mon to Fri), last 7 days, last 14 days, last month, last 3 months, custom (a year at most). Cards: tasks completed against the period before (neutral words: more, fewer, the same), actual against estimated (over finished tasks with an estimate; a missing actual is 0), the average age of Brain Dump thoughts. Charts: time per day (by tasks or by time, grouped into weeks for long ranges), estimated against actual per task (outline against solid, so colour is never the only signal), tasks by label (percentages that add to 100). The completed list, grouped by day or label, with a CSV download (formula looking titles are written as text). Every bar shows its number, has a name for assistive technology, and hover or press shows it in a readout. Chart colours are at least 3:1 on the surface (tested). Empty states say what is missing and nothing more.
- **Trash** (🗑️ in the profile menu): tasks deleted in the last 30 days. **Restore makes a NEW task with the same fields and a new id** (`restored_<oldId>`, deterministic, so two devices restoring at once make one task); the old tombstone stays and is touched so the entry leaves the Trash on every device. A deleted repeating task is one entry that restores as one plain task (its repeat was cleared when it was deleted). Skipped days are not in the Trash. A task merged into another one is told apart by its effect and shown with "Merged into another task" and no Restore button. There is no delete forever: tombstones stay for sync (90 days; 400 for repeating days).
- **Data export** (Settings, Data): "My data (JSON)" has every table, "My tasks (CSV)" one row per task. Only data on this computer; deleted rows left out; anything secret looking (a token, session, password) is left out and counted; the message says how many rows were exported.
- Real check `desktop/test/real/p6.js` (39 checks); unit tests for the CSV, analytics, Trash, export and chart colours, and a two device restore through the real sync engine.

## 2.22.0 — 2026-10-16 (build plan phase 5, Daily Planning, Daily Shutdown, rollover)

**Desktop only (the iPhone gets the flows in a later step). No schema change, no sync change.**

- **Daily Planning** (Ctrl+Shift+P, or the sunrise button in the top strip), 4 steps: review yesterday's work and what was missed (tick any that were actually done), choose today's tasks from a list or add new ones, move what can wait to tomorrow or next week, give tasks a time against a small Timebox with an all day row and the current time line. **Daily Shutdown** (the moon button), 2 steps: what was done today (corrections allowed) and what is left over (ticked ones go to tomorrow), then tomorrow's list with "N already planned tasks, M tasks from Today".
- Both are full screen overlays with a step rail. **Everything is a draft until Finish; Cancel or Escape changes nothing** (checked byte for byte in the real app).
- **Rollover** runs only on Finish: Planning moves unfinished tasks of earlier days to today, Shutdown moves the chosen unfinished tasks of today to tomorrow. Never a repeating task, a placed task keeps its time, and it is worked out from the latest stored rows at Finish. Idempotent: twice, or from two devices through the sync engine, it gives one result and a second run writes nothing.
- **Keys:** Ctrl+Shift+P Daily Planning, Shift+T today's first task, Shift+B the first Brain Dump task, Left and Right the first task of the day before or after, Ctrl+I the time section on a card. None fires while typing.
- Real check `desktop/test/real/p5.js` (34 checks).

## 2.21.0 — 2026-10-16 (build plan phase 4, Quests)

**Desktop and iPhone. No schema change, no sync change.**

- **Quests** on the desktop (🎯 Quests in the top strip, a page like Progress) and the iPhone (a new Quests tab): every repeating series, in Daily, Weekly, Every 2 weeks, Every few weeks (every 3 weeks), Monthly, Every year and Other repeats (a rule from a newer device), so no repeating task is hidden. One card each: emoji, name, how it repeats, what is due this period ("Due today", "Due this week", "Done this week", "Next: Fri"), current and best streak (never a zero, never a warning), one tap to complete (a second tap reopens), a planned skip, Today, and Timebox (desktop).
- **Streaks counted in periods** (`lib/quests.ts`): days, weeks, fortnights, stretches of 3 weeks, months, years. A period counts when every scheduled day in it is done or skipped; all skipped is neutral; the current period never ends a run. Derived from the stored rows and a converted routine's old ticks, never stored. Tested across month ends, leap years, daylight saving changes and five time zones.
- **Every year** repeat: stored as `annual` in the existing rule text with its date number in `recurrence_month_day`, so a Feb 29 repeat falls on Feb 28 and comes back on the 29th. Choosing it shows a warning and needs "Every device is updated" ticked before Apply. An older Belific keeps the rule.
- **Putting a quest on today** stores its occurrence with today as its Day; the occurrence still stands for its own day, so the rule and the streak do not move (`series.ownDay`, the series template and anchor now read it).
- **Repeats in the details panel**: the card's own Repeat control, opened from the panel.
- **iPhone:** Brain Dump captures tasks (old Brain Dump items stay until edited, then become tasks, as on the desktop); **Convert routines** in Settings, Data with the desktop's dry run, confirmation and Undo (no backup step: the phone has none). The iOS marker gate drops `convertRoutines`, `undoConversion` and `routineConvertActions` on purpose.
- Skips of monthly and annual series are kept locally for ten years (their streaks look back that far); others 400 days as before.
- Real check `desktop/test/real/p4.js` (29 checks).

## 2.20.0 — 2026-10-16 (build plan phase 3, desktop layout)

**Desktop only. No schema change. `mobile/app.json` is now 2.20.0 (a feature, so a minor bump); the iPhone code is unchanged, the version is shared. Phases 2 and 3 were committed before the bump, so it was made afterwards in its own commit (the CHANGELOG rule says to bump in the same commit as the feature; from here on it is).**

- **Panes:** the left and right panes collapse to rails (`[`, `]`, or the buttons in the top strip) and the centre works with either, or both, hidden. The layout is remembered in the user_settings row `ui.panes` with a local fallback.
- **Calendar** in the centre, switched with **V** (Tab keeps normal focus): **D** day, **W** week, **M** month; the 24 hour grid with an all day row, a current time line and overnight tasks; its own Filter. The Timebox on the right gets the current time line too.
- **Search** (Ctrl+K), **quick capture** (Q into the list shown, T onto today, Shift+Enter keeps the box open) and **show only today** (Shift+F).
- Real check `desktop/test/real/p3.js` (52 checks); new tests for the pane state, the calendar maths and search.

## 2.19.0 — 2026-10-16 (build plan phase 2, task model and timer)

**Desktop only. No schema change. A feature, so a minor bump; 2.20.0 followed the same day with phase 3.**

- **Task details panel** (every field, an overlay), the **timer** (start and stop on the card, in the panel or with Ctrl+Shift+Enter; one at a time; a timer over 24 hours asks first) with a **floating timer** that survives navigation and a restart, **actual time** (whole minutes), estimate presets 5 min to 2 h plus custom, **lists** beside Brain Dump, **emoji** on tasks, labels and lists, **duplicate**, estimate against actual per day and list.
- **Keyboard shortcuts** from one registry, with the help overlay on Shift+/; nothing fires while typing.
- Real check `desktop/test/real/p2.js` (42 checks); the older real checks still pass; new tests for the totals, the timer session, duplicate, lists, emoji and the shortcut rules.
- Decision 028 (Proposed). Decision 022's removal of Actual time is superseded by it.

## Build plan phase 1 (data foundations) — 2026-10-16, no version bump

**No user visible change, so `expo.version` stays 2.18.1. Migration 002 applied by Jethro through the Supabase migration tool (`20261016153525 belific_lists_settings_timer`). Nothing deployed.**

- **Schema 002** (`mobile/supabase/belific_schema/002_lists_settings_timer.sql`): `tasks.actual_minutes` (NULL = 0), `tasks.timer_started_at`, `tasks.list_key`, `tasks.emoji`, `projects.emoji`, and the tables `lists` and `user_settings`, in the 001 house style.
- **Sync:** 9 tables; a `planner` capability gates the new tables and fields (kept locally and queued until the server has them); sanitisers for every new value; an unknown repeat rule is sent back unchanged instead of wiped.
- **Storage:** lists and user settings (local, synced). **Timer maths:** `mobile/lib/taskTimer.ts`. No UI yet.
- **delete-account (code only):** also deletes from `lists` and `user_settings`. Still never deployed to the shared project.
- **Decision 027:** no XP, levels or multiplier; streaks on recurring tasks only. Supersedes 014 and the XP parts of 008.
- Docs: `docs/belific-build-plan.md` updated with Jethro's phase 1 decisions; `docs/build-progress.md` added.

## 2.18.1 — 2026-10-15

**The iPhone gets Google sign in, signs out locally, and the build is ready for a TestFlight only run against the shared project. Nothing deployed, no EAS command run, no dashboard or database contact. (Phone move checkpoint.)**

- **Settings, Account (iPhone):** a "Sign in with Google" row under "Sign in with Apple" (a Cancel row and a short fixed message while the browser is open). Google opens the system browser (Linking, no new native module), PKCE, and comes back through `belific://auth-callback`. Apple is unchanged.
- **Phone callback rules** (`lib/phoneAuthCore.ts`, `phoneGoogleFlow.ts`, `phoneGoogleAuth.ts`): the exact Belific authorize URL only, Google only, redirect exactly `belific://auth-callback`; a link is accepted only for a sign in started in this run, within 10 minutes, once, three failures end it; quiet, fixed sentences. The flow id is in the link only if auth-js is told to add it (it is off, and stays off: the redirect allow list compares the query string); the exchange is bound to this flow's stored verifier instead.
- **Real PKCE on the phone.** Hermes has no `crypto.subtle`, and auth-js then silently falls back to a **plain** challenge (the verifier itself in the browser address). The phone installs `@noble/hashes` (audited, pinned at 1.8.0) as `crypto.subtle.digest` when missing, and the gate **refuses** to open the browser unless the challenge is S256 **and** the PKCE verifier (read back from the session store) came from secure randomness: it has the shape of auth-js's `crypto.getRandomValues` branch, hashes to exactly the challenge in the URL (hash of bytes the app builds itself, no TextEncoder), and `crypto.getRandomValues` itself passes a run time check that it never touches `Math.random`. `flowType` is now `pkce` on both platforms (Apple's `signInWithIdToken` is unaffected).
- **expo-router** no longer sees the callback as a screen: `app/+native-intent.ts` sends `belific://auth-callback` to Settings.
- **Phone sign out is local scope** (Sign Out and Delete account): the default global scope would have signed out the desktop and the other apps that share the login.
- **iOS marker gate:** `startGoogleSignIn` and `Continue with Google` removed on purpose; five desktop only auth names added (19 markers, 0 hits). Decisions 018 and 026 updated.
- **`eas.json`:** the production profile reads the `production` EAS environment (`"environment": "production"`); no values in the repo. The build number stays in `app.json` and is raised by hand (`docs/BELIFIC_EAS_TESTFLIGHT.md` section 3); no `appVersionSource`, no `autoIncrement`.
- **Docs:** `docs/BELIFIC_EAS_TESTFLIGHT.md` (variables, build, TestFlight only, the one-time waiver, rollback), stale banners on the Landis `eas-build` skill and `docs/publishing-reference.md`, the waiver in `TESTING_PROTOCOL.md`.
- Tests: `phoneAuthCore.test.ts` (callback, URL check, gate, real supabase-js PKCE with and without WebCrypto, SHA-256 against Node, the verifier randomness proof, native intent, sign out scope), `phoneGoogleFlow.test.ts` (fakes), `easConfig.test.ts`, `iosMarkers.test.ts`. Not testable without a device: end of `phoneAuthCore.test.ts` and `docs/sessions/2026-10-15-project-move.md` section 8.
- **Not changed (user visible wording):** the delete texts, `privacy.html` and `terms.html` (they still say Google is Windows only: update before anyone but Jethro installs the phone build).

---

## 2.18.0 — 2026-10-08

**A Sign in page with Apple and Google on the desktop. Desktop only; the iPhone app is unchanged. No migration, no database or dashboard contact, nothing deployed. (Checkpoint 12, part 1 of 2; email and password is 2.19.0, not started.)**

- **Sign in page** (`SignInPage.tsx`, decision 026): a page inside the app like Settings and Progress, with Back, Escape and focus return. Continue with Apple, Continue with Google, Not now (it also ends a sign in that is waiting in the browser) and the line "You can use Belific without an account." The profile popover and Settings, Account now each have one **Sign in** button that opens it; the old "Sign in with Apple" buttons are gone. There is no "Use email" button yet.
- **Google sign in** through the system browser, PKCE, the same `belific://auth-callback` callback and the same validation as Apple. Google gets an account chooser (`prompt=select_account`). `checkAuthorizeUrl` now allows exactly one provider from apple and google (a second `provider` parameter, other spellings and other providers are refused); `externalLinks.js` is unchanged in effect.
- **Code layout:** `mobile/lib/authCore.ts` is new and pure (providers, the signInWithOAuth options, every sentence of the page and of a failure, the account label). `desktopAuth.ts` is the desktop wiring (`startAppleSignIn`, `startGoogleSignIn`, `cancelSignIn`). The phone wiring (`auth.ts`) is untouched. Failure sentences are provider agnostic, so Apple and Google fail with identical words, and an error from the client or the network is never shown.
- **Account line:** the email, else "Apple account" or "Google account" (was always "Apple account").
- **iOS marker gate:** `SignInPage`, `startGoogleSignIn` and `Continue with Google` added (16 markers; export checked, 0 hits).
- **delete-account function (code only, NOT deployed):** it no longer logs the user id or any error text, and no longer returns raw error text; callers get "Unauthorized" or "The account could not be deleted". The deployed version still has the old behaviour until Jethro deploys this one.
- **Docs:** `docs/GOOGLE_SIGNIN_SETUP.md`, `docs/ACCOUNT_LINKING_TEST.md`, decision 026 (Proposed), decision 012 updated, privacy and terms updated for Google (effective 8 October 2026; also fixed `%APPDATA%elific-desktop`, which had lost its backslash on the privacy page).
- **Not built:** "Add a sign in method" in Settings, Account (needs manual linking switched on in the Supabase dashboard; left for 2.19.0), Apple token revocation on delete (findings only, in the session note).
- Tests: `authCore.test.ts` (12), `authLink.test.js` (Google, refusals), `iosMarkers.test.ts`, real check `npm run test:real:cp12` (58 checks, fake Apple and Google pages inside the in process fake Supabase). cp6, cp9, cp10 and cp11 now start sign in through the Sign in page.

---

## 2.17.0 — 2026-10-07

**Streaks and a Progress page, derived from repeating series. Desktop only; the iPhone app is unchanged. No migration, no sync change, no database contact, no stored counters. (Checkpoint 11.)**

- **Streaks are derived** (`mobile/lib/seriesStreak.ts`, pure): from the stored occurrences `root:date`, the skip tombstones and, for a converted routine (`rt_<id>`), its old routine completions. A day is done when its occurrence is completed (ticking the last subtask completes it, so there is one rule). A skipped day is neutral, a day not done ends the run silently, today before it is done is neutral, days that are not scheduled are neutral. Weekly, every 2 weeks and monthly series count scheduled occurrences. Dates are stepped by the calendar, never by milliseconds, so clock changes cannot skip or repeat a day; "My day starts at" is not an input.
- **The line.** "N days in a row" for a daily series and "N in a row" for other rules, from 2 only, on TODAY's card and in the block popover. Never a zero, never a warning, no icon or colour change. Settings, Planning has **Show streaks** (default on, desktop setting, not synced; it hides the lines, not the Progress page).
- **Progress page.** A page inside the app (decision 025), reached from a new Progress row in the profile menu or File, Progress. Per live series: the run, the best run (each from 2), "Last 7 days: 5 of 6" and "Last 30 days" (hidden when none were done) and a 7 day strip. Every square has a text name ("Monday, done", "Tuesday, not done", "Wednesday, skipped", "Thursday, not scheduled", "Today, open") and its shape differs by state (tick, empty outline, dash, dot, dashed outline), so colour is never the only signal. No totals across series, no chart.
- **Keyboard.** The pages (Settings, Labels, Progress) now close with Escape (unless a popover or a text field has it), and Back or Escape returns focus to the control that opened the page (the profile icon when it came from the profile menu, the button that opened Labels, the card that had focus for File, Progress). A focused switch or button does not block Escape.
- **Skip tombstones are kept 400 days locally** (`series.keepsOccurrenceTombstone`, was: while the day is today or later), longer than the 366 day streak lookback, so a skip never ages into a miss. Local only; the server never prunes and sync is unchanged.
- **iOS marker gate:** `npm run check:ios-markers -- <export folder>` (`mobile/scripts/ios-markers.js`). Exits 1 on any marker (now including `ProgressPage`, `seriesStreak`, `Show streaks`), 2 on a missing folder or bundle; `copyRoutineCompletions` is the one allowed name, checked in source with `git grep`. `seriesStreak` stays a marker until the iOS catch-up release reuses it (decision 018, CURRENT_TRUTH).
- Tests: `seriesStreak.test.ts` (37, including the banned wording check over every string and the walk across the Europe, US and Auckland clock changes in real time zones), `iosMarkers.test.ts` (9), editable and settings tests, real check `npm run test:real:cp11` (52 checks). cp9 no longer presses Escape on the Settings page body (Escape now leaves the page; cp11 checks that).

---

## 2.16.0 — 2026-10-07

**Routines from the iPhone can become repeating tasks, by a button the person presses later. Desktop only; the iPhone app is unchanged. No migration, no database contact. (Checkpoint 10.)**

- **Settings, Data** shows a quiet line "N routines from your iPhone" whenever routine rows exist, with a "Convert routines from your iPhone…" button. There is no other routine UI on the desktop.
- **The confirmation step** (inline, not a modal) lists each routine's title and time of day, says "Nothing has changed yet.", shows the warning "Your iPhone will stop showing these routines until the next iPhone update. Only convert when you are ready. You can undo this." and keeps **Convert disabled until the safety backup of this step exists** (a `routine-convert` backup folder, checked on disk by the main process).
- **Convert** writes through normal storage and the outbox: one daily, untimed series per routine (id `rt_<routineId>`, reminder off, no label, no priority, no steps, starting the local day Convert is pressed), then a tombstone on each routine written directly (never `deleteRoutine`). `routine_completions` are not touched. Converting again never makes a second series (deterministic ids; a routine whose series row exists only gets its tombstone).
- **Undo** ends the series (open days deleted, finished days kept but no longer repeating) and gives each routine back as a NEW routine row (same title and time of day) with its completions copied to the new id. A tombstone can never be cleared by sync (a pulled tombstone always wins and a live upsert never sends `deleted_at`), so the old row cannot be revived; the old rows and completions stay as they were.
- **Account switch fix:** `hasLocalData` (which decides whether a different account must choose between uploading and starting empty) now includes `belific_routine_completions` (`USER_DATA_KEYS` in `accountSwitch.ts`, with a test that it covers every key `clearAllData` removes). `clearAllData` already removed the completions.
- **Backups:** the page may now ask for a `routine-convert` labelled backup as well as `account-switch`; the main process returns the backup folder's name after checking it exists.
- Tests: `routineConvert.test.ts` (18), account switch key tests, real check `npm run test:real:cp10` (50 checks, in memory fake server only). The fake server in `desktop/test/real/common.js` gained an opt in in memory table store.

---

## 2.15.1 — 2026-10-07

**Small fixes after checkpoint 9. Desktop and the two public pages only; the iPhone app is unchanged. (Checkpoint 9.1.)**

- **Switches use the palette.** One shared desktop `PaletteSwitch` (off white thumb, sage track when on, neutral track when off) replaces the Settings and Filter switches. react-native-web painted a teal thumb while a switch was on; the active thumb colour is now set too. The iPhone settings screen is untouched.
- **`terms.html` is accurate again.** Section 3 no longer says all data stays on the device: it now describes optional sign in with Apple and sync to Supabase (EU West, Ireland), that settings are not synced, and how to delete the account in each app, using the same facts as the privacy page. No dashes. Contact stays the GitHub issues link for now.
- **Privacy page** unchanged (contact is still the GitHub issues link; no new statements).
- **Docs:** Import is not built and needs its own checkpoint; settings do not sync; a "Before publishing" checklist for the two public pages.

---

## 2.15.0 — 2026-10-07

**One profile icon, a Settings page, a Labels page, a keyboard route for cards, a corrected security scan and a rewritten privacy policy. Desktop only; the iPhone app is unchanged. (Checkpoint 9.)**

- **Profile icon.** A slim strip above the three panes holds one profile icon at the top right, always visible. Signed out it is a neutral person glyph and its small popover says "Local only, not signed in", "Sign in to keep your tasks on all your devices", a Sign in with Apple button (the existing flow) and a Settings row. Signed in it shows your initial; the popover shows the account, sync status with the last synced time and any error in plain words, Sync now, Settings and Sign out. It is the shared Popover, never a modal. The old account line at the bottom left of the Brain Dump pane is gone. The account choice modal, the pre sign in backup and the revoke handling are untouched. Decision 025.
- **Settings page.** The Settings modal is replaced by a page inside the app with a Back button (not an overlay), opened from the popover and from File, Settings (Ctrl+,). Sections: Account (sign in or out, Delete account with its inline confirm, and a plain message if the server function is unavailable), Sync, Planning (My day starts at), Notifications (the toggles, the daily reminder time, close to tray, start with Windows), Data (backups folder, export), Labels and About (version, privacy policy, issue tracker, the Chromium and Electron licences when that file ships in the app folder). Every setting behaves as before.
- **Labels page.** Every label with its colour swatch, name and the number of open tasks using it. Rename inline, recolour from the eight colour palette, delete with an inline confirm (tasks move to a same-named label, otherwise lose the label), add from the suggestions or by typing. Duplicate names are refused. No reordering.
- **Hidden panes are inert.** While Settings or Labels shows, the three panes are hidden and inert (no focus, no drag, no keys), and the notification payload keeps updating.
- **Keyboard route for cards.** A card is reached with Tab, Enter expands or collapses it, Escape collapses it, with a visible focus ring in the accent colour. Typing in any field is unaffected (the 2.12.1 space key fix stays).
- **Security scan.** `security-scan.sh` no longer fails on the environment variable name in `delete-account/index.ts`, and is stricter in other ways: secret values are now searched in every tracked file (docs, markdown and env files too). Tested with fixture repositories (`securityScan.test.ts`).
- **Privacy policy** rewritten for both apps (device storage, optional Apple sign in and sync to Supabase EU West (Ireland), what is and is not collected, how to delete data and the account). Linked from About.
- **Installer.** Publisher and copyright metadata, and a note in both READMEs that the installer is not code signed so Windows may show a SmartScreen warning ("More info", then "Run anyway"). No signing or auto update code.
- **Not built:** Import of data (needs its own checkpoint). No database change and no migration.

---

## 2.14.0 — 2026-10-07

**Repeating tasks are series that show on every matching day, a 24 hour Timebox for any lifestyle, overnight tasks, ordered columns, Actual time removed and more space between cards. Desktop only; the iPhone is unchanged. (Checkpoint 8.4.)**

- **Repeating tasks show on every matching day.** A Daily task now appears in every day column from today forward (and in the Timebox on each day), a weekly one on its weekdays, "Every 2 weeks" on its weeks, monthly on its date (the 31st falls on the last day of shorter months). These are *projected* occurrences: computed when drawn, never stored, never synced, never in the left list, never in the past. A projected card looks like a normal card, a little lighter. Decision 023.
  - Ticking a projected card or one of its subtasks stores **that day** as a real task (`rootId:date`) and changes nothing else. A day that has a stored occurrence shows it, never a duplicate. Completing a repeating task no longer creates the next copy on the desktop (the days are already shown); the iPhone still does.
  - Editing a projected card (title, label, priority, estimate, repeat, reminder, notes, subtasks, start time) edits the series: the template row and every open stored row from today. The card says "Repeating: changes apply to every day". Dragging it onto the Timebox sets the start time of the whole series (a daily 05:00 routine shows at 05:00 every day); it cannot go to another Day column or the left list.
  - **Skip this day** (card overflow menu) hides one day with a tombstoned occurrence (the existing tombstone mechanism; no new column). **Delete repeating task** (inline "Delete this repeating task? Yes / No") tombstones the open days and stops the series; **Does not repeat** clears the rule on every row of the series, so an ended series can never come back.
  - Reminders: the next 48 hours include projected occurrences (timed ones with their own lead; untimed ones in the grouped daily reminder). The label filter and Show complete apply to them. An unfinished past occurrence of a repeating task is no longer shown as overdue.
  - No database change and no migration; existing stored repeating tasks keep working.

- **The Timebox is the whole day.** 00:00 to 24:00 with an hourly label on every hour, the faint half hour lines and the 30 minute snapping as before. A block can start as late as 23:30 and run past midnight.
- **"My day starts at".** New setting in the Settings modal (Planning), a time in 30 minutes steps, default 05:00, stored in the main process settings (not synced). Any day other than today opens with that time at the top; today opens about an hour before now (never before the day start once it has begun). No other part of the app assumes a daytime schedule.
- **Overnight tasks.** A task belongs to the Day it starts on. If it runs past 24:00 its block goes to 24:00 and the rest shows at the top of the next day as a lighter block, "Continues from yesterday" (derived, never stored; clicking it opens the same task popover). Move and resize from the original block only; resize may go past midnight up to 24 hours. The chip keeps showing the full estimate.
- **Day column order.** Tasks without a start time first, then timed tasks earliest first, then completed ones.
- **Fix:** the Daily reminder time in Settings could not be changed (a mistyped pattern rejected every value); it can now.

- **Actual time is gone.** Jethro only wants the estimate, so the timer, the play button, the "Actual" and "Estimated" row, the forgotten-timer prompt, `lib/timer.ts` (and its controller, binding and tests), the `belific_timer` key, `Task.actualSeconds`, the `actual_seconds` sync column and its capability flag are removed. The two unapplied migration files (`20261007130000_task_actual_seconds.sql` and its rollback) are deleted: it was never applied to any database. A stored task that still carries `actualSeconds` is cleaned when it is loaded. The H:MM chip and the typed dropdown are unchanged. Decision 022 is marked superseded.
- **More space.** Cards in the week columns are 12px apart (was a hairline) and rows in the left list 10px apart, keeping the hairline. The reserved space for the hover icons from 2.12.3 is unchanged.

---

## 2.13.0 — 2026-10-07

**Duration chip and dropdown like the Ellie planner, plus Estimated and Actual time with a simple timer. Desktop only; the iPhone is unchanged.**

- **Chip.** Every card and left-list row shows the duration as H:MM in the app's tabular figures: `0:00` when none is set (it used to say "None"), `0:15`, `1:30`, `24:00`. A placed task shows its start time as separate small muted text beside the chip (`09:30  0:15`), so the two numbers are never read as one value. Time is still set only by dragging onto the Timebox.
- **Dropdown.** Clicking the chip opens a small popover with a focused field ("45m, 1h 30m, 130...") and a scrollable preset list (5, 10, 15, 20, 30, 45 min, 1h, 1h 30m, 2h, 3h, 4h) with a tick on the current one and a "No duration" row. Typing accepts `45m`, `45`, `1h`, `1h 30m`, `1h30`, `1.5h`, `130` (minutes) and `1:30`; any whole minute from 1 to 1440 is valid. Enter applies; invalid text shows a quiet hint and applies nothing; Escape closes. The old Custom hours and minutes fields are gone.
- **Estimated and Actual.** An expanded card has one quiet row under its controls: a play/pause button, then "Actual 0h 0m" and "Estimated 0h 0m". Estimated is the duration (click it for the same dropdown). The timer stores its start timestamp in the main process store (not synced), so it survives closing the app; elapsed time is always computed from timestamps. Only one timer runs: starting another stops the first and saves its time. A running card shows a small dot and a live Actual (refreshed every 30 seconds). Completing a task stops its timer. Click Actual to type a corrected value. No colours, comparisons, streaks or notifications.
- **Forgotten timers.** Stopping a timer that ran over 12 hours does not add the time: the card asks inline, "That's 14h 20m. Add it, or enter a different time?" with an Add button and a field.
- **Deleted or merged tasks.** Deleting a task, or dropping it onto another as a subtask, stops its timer without adding time; at startup a stored timer whose task is gone or completed is dropped.
- **Repeating tasks.** The next occurrence copies the estimate and starts with Actual cleared.
- **Sync.** New nullable column `tasks.actual_seconds` (migration `20261007130000_task_actual_seconds.sql`, written, NOT applied). Until it exists the client does not send it and a pull keeps each device's local value; when it appears the local values are queued and uploaded.

---

## 2.12.3 — 2026-10-07

**Fix: task cards no longer shift when the pointer arrives or leaves. Desktop only.**

- The calendar and overflow icons on a card used to appear on hover and pushed the title and controls by a few pixels, so a quick click could land on the wrong thing. They now keep their space and only fade in; nothing in the card moves.

---

## 2.12.2 — 2026-10-07

**"Daily" is now an explicit choice in the Repeat dropdown. Desktop only.**

- Options in order: Does not repeat, Daily, Weekly, Every 2 weeks, Monthly. Daily stores a daily repeat with no day chips and the summary "Repeats every day."; the next occurrence is the day after the later of the task's Day and today, as before. Ticking all seven days on Weekly switches the selection to Daily. A stored daily task opens the dropdown on Daily.

---

## 2.12.1 — 2026-10-07

**Fix: typing a space in the Notes field of an expanded task card collapsed the card. Desktop only.**

- Space (and Enter in the rename box) typed in any field on a card, or in a popover, no longer reaches the card. Notes accept spaces, Enter (a new line), Backspace and arrows normally and the card stays open. Escape in Notes leaves the field (which saves it) without collapsing the card; a second Escape collapses it.

---

## 2.12.0 — 2026-10-07

**Edit tasks on the card, not in a pop up (checkpoint 8.2, decision 021). Desktop only; the iPhone is unchanged.**

- The big task editor is gone. A task card (board and left list) now carries its own controls: click the title to rename it in place; a duration chip at the top right; and a row of small icons for complete, repeat, subtasks (with a counter such as 0/4), priority, reminder and the label. Each icon opens a small dropdown beside it, never a full screen, so many tasks can be edited in a row.
- Clicking the card body expands it in place to show notes and the subtasks list. Subtasks can be added (Enter adds the next), renamed, ticked, reordered with a handle and deleted. Ticking the last subtask completes the task, ticking the task ticks them all, and unticking one reopens a completed task. A repeating task's next occurrence carries its subtasks, unticked.
- The label dropdown has a search field, create from the typed text, suggestions, and rename, colour and delete (with the same rules as before). Priority, duration (None, quick chips, Custom hours and minutes), repeat (with its plain summary line) and the new reminder (None, at start, 5, 10, 30 minutes or 1 hour before) are small dropdowns too. Move to day is a calendar icon with its own dropdown. Delete is in a small overflow menu with the inline confirm.
- Clicking a placed task on the Timebox opens a small popover with the same controls, plus Remove time. Events keep their editor.
- Dragging a task onto another task's card and holding it there for about 300 ms shows "Add as subtask"; releasing then adds it as a subtask (with "Added to X. Undo" for 6 seconds). Releasing earlier, or on a column or between cards, is the normal Day drop.
- New Filter button beside the week label: pick labels, "No label" and "Show complete" (completed tasks are hidden by default). It filters the board, the left list and the Timebox tasks (not events), and is remembered across restarts.
- Per task reminders: the desktop notifies a placed task the chosen number of minutes before it starts, or not at all when set to None. The grouped daily reminder skips tasks set to None.
- New sync columns `tasks.subtasks` and `tasks.reminder_minutes` (migration written, not applied). Until it is applied the app keeps both locally and syncs everything else as before.

---

## 2.11.2 — 2026-10-06

**Desktop sign out only ends this computer's session (checkpoint 6.1 follow-up). The iPhone is unchanged.**

- The desktop sign out, and the retry of a sign out that could not reach the server, now use scope `local`. Before, they used Supabase's default (global), which also signed the iPhone out.

---

## 2.11.1 — 2026-10-06

**Desktop sign in hardening (checkpoint 6.1, fixes from the security review of checkpoint 6). The iPhone and the sync rules are unchanged.**

- A stray `belific://auth-callback` link can no longer destroy a sign in in progress. A failed code exchange keeps the pending sign in alive (the PKCE verifier is restored from a private copy); it closes after 3 failed attempts, a successful sign in, cancel, sign out or the 10 minute expiry.
- Signing in as a different account (or after deleting the account) on a computer that has local data now asks first: upload this computer's data to the account, or start empty (a backup is kept). Nothing is uploaded until you choose, even after a restart.
- Session files are never included in backups or in Export data. If sign out cannot reach the server, the revoke is retried when the network is back and at launch; Settings shows a quiet note meanwhile.
- PKCE verifiers are kept in memory only and wiped when a sign in ends. If encrypting the session fails, Settings shows the warning instead of claiming it is saved.
- Links open in the browser only for Belific's Supabase sign in, the privacy and terms pages (najeca.github.io/belific) and the support page (github.com/najeca/belific/issues).
- The page can no longer read or write session files or the first sign in backup flag; labelled backup folders are never replaced; a second sign in cannot start while one is running; the content security policy gained object-src, base-uri, form-action and frame-ancestors.

---

## 2.11.0 — 2026-10-06

**Desktop notifications, tray and a Windows installer (checkpoint 7, decisions 017 and 020). The iPhone is unchanged.**

- Event starts and tasks placed on the Timebox now notify at their start time, from the desktop's main process, so they arrive with the window closed.
- New daily reminder (decision 020, proposed): one grouped notification at 09:00 (adjustable, can be turned off) such as "3 tasks planned for today", for tasks with a Day but no time. Completed tasks are excluded, and nothing is sent when there are none.
- Closing the window keeps Belific in the system tray (Open Belific, Quit Belific). A one time note explains it. Close to tray can be turned off; Start with Windows is optional and off by default.
- Settings gained Notifications and Window sections.
- `npm run dist` in `desktop/` builds an unsigned per user Windows installer (NSIS) into `desktop/dist`. See `desktop/README.md` for install, the SmartScreen warning, data location and uninstall.

---

## 2.10.0 — 2026-10-06

**Desktop sign in with Apple (checkpoint 6, decision 012). The iPhone is unchanged. The live Apple round trip is not verified until the setup guide is done.**

- The desktop can sign in through the system browser (PKCE, `belific://auth-callback`). Only a callback for a sign in started in this run, within 10 minutes, used once, is accepted; anything else is ignored.
- The session is stored encrypted (Electron safeStorage). If the computer cannot encrypt it, the sign in lasts for that run only.
- Before the first ever sign in the app takes a backup named `YYYY-MM-DD-pre-signin`. Sign out keeps all local data.
- The "Local only · not signed in" line is now clickable and opens a small Settings modal: Account (sign in, sign out, delete account), Sync (status, last success, last error, Sync now) and Data (export, open backups folder).
- `docs/APPLE_SIGNIN_SETUP.md`: the Apple and Supabase steps for Jethro.

---

## 2.9.0 — 2026-10-06

**Sync hardening (checkpoint 5, decision 013). Shared by the iPhone and the desktop; the desktop stays signed out.**

- Every local write is queued in a persisted outbox (survives restarts,
  one entry per row, retried with backoff, never blocks the UI) and pushed
  in batches of up to 500 with every server error checked and recorded.
- A storage lock stops a sync from overwriting a write made while it was
  waiting on the network.
- Pulls are paginated (no more 1,000 row cap) and, once migration 1 is
  applied, incremental by a server-set `server_updated_at` cursor.
- Conflicts: the last change to reach the server wins; deletes always win
  over edits; timestamps are compared as times, not strings.
- Un-completing a routine on one device is no longer undone by another, and
  routine completions are no longer pruned after 90 days.
- Durations, Timebox times, repeat settings and label colours now sync (after
  migration 2). Until then a pull never erases them.
- The iPhone completes tasks through the same function as the desktop, so a
  repeating task made on the desktop creates its next occurrence on the phone.
- Sync status (idle, syncing, offline, error with the last error) is recorded;
  the desktop shows one quiet line in the Brain Dump pane.
- New migrations (not applied yet): `20261006120000_sync_hardening.sql`,
  `20261006120100_task_pipeline.sql`, with manual rollback, backup and
  verification scripts in `mobile/supabase/rollback/`.
- The delete-account function answers CORS for the desktop app's origin only
  (not deployed).

## 2.8.4 — 2026-10-06

**Desktop Home: optional and short durations (checkpoint 4.4, web/Electron only; the iPhone app is unchanged).**

- Duration is optional: a None chip (the default for a new task) stores no
  duration. Quick chips are None, 15m, 30m, 1h, 2h; Custom has hours 0 to 24
  and minutes 0 to 55 in 5 minute steps (5 minutes to 24 hours, 24h only with
  0 minutes). Durations read "10m", "1h 5m" and so on; stored values load
  unchanged.
- Timebox: a block under 30 minutes is drawn at true scale down to a compact
  20px minimum, so it no longer looks like a full 30 minute slot, and shows one
  line with its title and true duration ("Call back 10m"). Moves and drops still
  snap to 30 minutes, resize still has a 30 minute minimum, and a task with no
  duration dropped on the Timebox still gets 30.

## 2.8.3 — 2026-10-06

**Desktop Home: simpler Repeat, ready made labels, label rename and delete (checkpoint 4.3, web/Electron only; the iPhone app is unchanged).**

- Repeat is now Does not repeat, Weekly, Every 2 weeks, Monthly. Weekly and
  Every 2 weeks take 1 to 7 day chips (Weekdays and Weekends shortcuts kept).
  Weekly with all seven days reads Daily ("Repeats every day") and is stored
  as the existing daily kind; untick a day and it is Weekly again. Every 2
  weeks always stays Every 2 weeks.
- Monthly has one "Day of the month" field (1 to 31, default the Day's date,
  else 1): "Repeats on the 1st of every month", with "In shorter months it
  falls on the last day." for 29 to 31. A Day on another date moves to the next
  matching date ("starts Sun 1 Nov").
- Ten suggested labels (Work, Study, Health, Fitness, Home, Errands, Money,
  Social, Admin, Personal) can be added with one tap; each disappears once a
  label with that name exists.
- Label names are unique (trimmed, case insensitive): creating an existing
  name selects that label. The selected label can be renamed (Enter saves;
  duplicates are rejected) or deleted with an inline confirm that says how
  many tasks use it. Deleting is a tombstone; its tasks move to another label
  with the same name, or lose their label.

## 2.8.2 — 2026-10-06

**Desktop Home: time by drag only, clearer Repeat, matching numbers (checkpoint 4.2, web/Electron only; the iPhone app is unchanged).**

- The kanban card's "Schedule at" clock and its time popover are gone. A task
  gets a time only by being dragged onto the Timebox, and loses it by being
  dragged off. Move to day (Remove day, Today, Tomorrow, a date) is unchanged.
- Repeat in the task editor: Does not repeat, Every day, Specific days, Every 2
  weeks, Monthly. Specific days and Every 2 weeks take any mix of the seven day
  chips (at least one), with Weekdays and Weekends shortcuts. A summary line
  always says exactly what will happen ("Repeats every Wed, Fri and Sun",
  "Repeats every other week on Mon and Thu", "Repeats on the 14th of every
  month"), including "starts Wed 14 Oct" when the Day moves to the first
  chosen weekday. "Weekly" is never shown.
- Completing a repeating task creates the next one on the next chosen day
  strictly after the later of its Day and today. Every 2 weeks counts from the
  week of the task's Day. Monthly keeps its date number (a new local only
  `recurrenceMonthDay`), so a 31st stays the 31st after a short month and a
  late completion no longer shifts the date. Older weekly tasks with no days
  repeat on their Day's weekday.
- Brain Dump rows show a short repeat form ("Wed Fri Sun"); Timebox blocks now
  show the repeat mark cards already had.
- Numbers: the Day, jump-to-week, move-to-date and duration fields used Times
  New Roman (they inherited the page's default font); they now use the app's
  font. Timebox hour labels, column counts and duration chips are slightly
  larger and heavier so figures match the letters beside them; hour labels and
  counts use tabular figures.

## 2.8.1 — 2026-10-06

**Desktop Home: label colours and custom durations (checkpoint 4.1, web/Electron only; the iPhone app is unchanged).**

- A label now has a colour from one palette of eight muted tones (sage, clay,
  sky, sand, plum, moss, rose, slate; `lib/labelColors.ts`). Kanban cards and
  Timebox blocks with a label get a soft tint and a 4px left edge in its
  colour; Brain Dump rows get a small dot next to the label name. A task with
  no label stays neutral.
- A new label takes the next unused colour; the selected label's swatches in
  the task editor change it. Labels created before this get a colour the
  first time the desktop reads them (a silent local fill: `updatedAt` is not
  changed). `colorKey` is local only until checkpoint 5.
- Duration in the editor: quick chips 30m, 1h, 2h plus Custom (hours 0 to 24,
  minutes 0 or 30, 30 minutes minimum, 24h only with 0 minutes). Older stored
  values (15, 120 and so on) load and show as they are ("15m", "2h") and are
  only rounded when a new duration is picked.
- A Timebox block that runs past 23:00 is drawn to the grid end with a quiet
  "continues" marker; one longer than the whole grid is placed at 06:00 and
  shown clamped. Resizing still stops at 23:00.

## 2.8.0 — 2026-10-06

**Desktop Home: drag and drop (checkpoint 4, web/Electron only; the iPhone app is unchanged).**

- Drag a Brain Dump row onto a day column to give it that Day, or onto a
  Timebox slot to give it the Timebox's day and that 30 minute slot (a task
  with no duration gets 30 minutes; an existing duration is kept). Legacy
  Brain Dump items convert into Tasks on drop.
- Drag a card to another day (it keeps its time), or onto the Brain Dump pane
  to clear its Day and time.
- Drag a Timebox block up or down to change its time, or its bottom edge to
  change its duration, in 30 minute steps kept inside 06:00 to 23:00 (minimum
  30 minutes). Drag a block onto a day column (sets the Day, clears the time)
  or onto the Brain Dump pane (clears both).
- Past days reject a drop with a quiet "Past day" note. Escape or a drop
  outside any target leaves the item where it was. A click still opens the
  editor; the checkbox, keyboard focus and the hover actions are unchanged.
- Holding a drag at the left or right edge of the week board scrolls the
  board sideways, then changes the week after a short dwell (never before this
  week). The wheel and edge auto scroll work during a drag.
- Faint half hour lines on the Timebox grid.
- Under the hood: pointer events, not HTML5 drag and drop (decision 019);
  pure maths in `lib/drag.ts`; the desktop panes moved from
  `app/components/desktop` to `components/desktop` behind
  `DesktopEntry.web.tsx`, so the iOS bundle no longer contains any desktop
  code.

## 2.7.0 — 2026-10-05

**Desktop Home: the thing you capture IS the task (web/Electron only; the iPhone app is unchanged).**

- Typing in the Brain Dump pane and pressing Enter creates a Task straight
  away (title only, no Day, `origin: 'dump'`). There is no form and no
  "Make task" or "New task" button any more.
- The left pane lists every incomplete task with no Day (newest first) plus any
  legacy `BrainDumpItem`s, shown identically. Opening and saving a legacy item
  converts it into a Task in one step (title, notes and creation time kept) and
  removes the item.
- Clicking anywhere on a row or on a kanban card (not only the title) opens
  the editor (name, duration, priority, label, notes, Day, Repeat, Done, delete
  with an inline confirm). Setting a Day moves a task off the left list onto
  the board; clearing it ("Remove day" on the card, or in the editor) brings it
  back.
- The Unscheduled column is removed from the week board. "Move to day" now
  offers Remove day, Today, Tomorrow and a date.
- A collapsed "Done today" line at the bottom of the left pane lists tasks
  completed today (no Day) with a checkbox to undo a mistaken tick.
- Recurring tasks: the next occurrence now counts from the later of the task's
  Day and today, so completing an overdue recurring task never produces a
  past-dated next occurrence.
- Fixed: hover-only buttons on rows and cards disappeared under the pointer
  (react-native-web ends a parent's hover when the pointer enters a nested
  pressable), so the click landed on the row instead. New `HoverPressable`
  uses DOM `mouseenter`/`mouseleave`.
- Fixed: Escape did not close the task or event editor while a text field had
  focus (react-native-web's `TextInput` stops key events bubbling); the
  listener is now in the capture phase.
- New pure `lib/thoughts.ts` (list split, Done today, new thought, dump item
  conversion) with 15 tests; the board tests no longer include Unscheduled. 79
  mobile tests and 19 desktop tests pass.
- `taskActions.ts` gains `createThought` and `convertDumpItem`. `sync.ts` and
  the iPhone screens are untouched; new Task fields stay local only until
  checkpoint 5.

---

## 2.6.0 — 2026-10-05

**Recurring tasks, set in the Brain Dump task form (web/Electron only; iOS unchanged).**

- `Task` gains optional `recurrence` and `recurrenceDays` (the same types
  `CustomEvent` uses). **Local only** until the sync migration (checkpoint
  5).
- The task form has a Repeat control: Does not repeat (default), Daily,
  Weekly (with weekday chips; none selected means every 7 days), Every 2
  weeks, Monthly. The form fields are now in the order name, duration,
  priority, label, notes, Day, Repeat. Edit mode has a Done toggle.
- Only the next occurrence exists. New `lib/taskActions.ts`
  `setTaskCompleted` is the single place a task is completed: when a
  recurring task is completed it creates the next one with the id
  `${rootId}:${nextDueDate}` (same name, duration, priority, label, notes and
  repeat settings, not completed), and does nothing if a task with that id
  already exists, live or deleted. Creation is serialised so a double click
  cannot duplicate it. Un-completing never removes an occurrence already
  created. The kanban checkbox and the form's Done toggle both call it; the
  board never creates occurrences.
- New pure `lib/recurrence.ts` `nextOccurrence`: daily +1 day; weekly with
  weekdays the next selected weekday; weekly with none +7; every 2 weeks +14;
  monthly the same day next month, clamped to the month end. A recurring
  task with no Day counts from today. The result depends only on the task's
  own Day. 15 tests (month-end clamping, leap years, year boundaries, weekday
  sets, clock changes in five time zones); 64 mobile tests pass.
- Recurring cards show a small repeat icon.
- Checkpoint 5 to-do: the iOS app must complete tasks through
  `setTaskCompleted` once sync lands, or a recurring task completed on the
  phone will never create its next occurrence.

---

## 2.5.0 — 2026-10-05

**Desktop Home: forward-only week board (web/Electron only; iOS unchanged).**

- Replaced the rolling 14 day board with a week board: a pinned Unscheduled
  column plus the days of the displayed week (Monday based, one constant).
  The current week shows today to Sunday; future weeks show Monday to Sunday.
  No past days or weeks can be shown or chosen.
- Week header: previous arrow (disabled on the current week), a label such
  as "Wed 7 Oct to Sun 11 Oct" (year added when not the current year; weeks
  across a month or year read correctly), next arrow, a "This week" button,
  and a "Jump to week containing" date input (min today). Arrows have 44px
  hit areas and are keyboard focusable.
- Removed the "Later" column.
- Overdue stays as decided: an unfinished task with a past Day shows first
  in Today with a "from <date>" tag, only while the current week is shown.
- "Move to day": Unscheduled, Today, Tomorrow and a date input (min today),
  with a quiet "Moved to Mon 2 Nov" line when the target is outside the
  displayed week.
- Pure helpers (`weekStartOf`, `addWeeks`, `weekDays`, `formatWeekLabel`,
  `clampToToday`, `isDayInView`) with tests, including month, year and leap
  boundaries and clock changes in five time zones. 49 mobile tests pass.
- Timebox day navigation is unchanged.

---

## 2.4.1 — 2026-10-05

**Desktop Home: tasks are created only from the Brain Dump pane (web/Electron only; iOS unchanged).**

- Removed the "+" from every kanban column header. The kanban no longer
  creates tasks; clicking a card still edits an existing one.
- Brain Dump pane header gets a "New task" button that opens the task form
  blank. "Make task" on a row still opens it pre-filled and removes the item
  on save.
- The task form's Day field (create and edit) is a web date input with
  `min` set to today: past dates cannot be chosen. A task that already has a
  past Day keeps it until the user changes it.
- Verified: `tsc --noEmit` clean, iOS JS bundle export succeeds, tests pass.

---

## 2.4.0 — 2026-10-05

**Desktop Home: Timebox day pane (web/Electron only; iOS UI unchanged).**

- New `TimeboxPane.tsx` replaces the last placeholder: an hourly grid from
  06:00 to 23:00, scrolled to the current hour on open, with previous and
  next day buttons, a "Today" button and a date dropdown (web date input) to
  jump to any day.
- It draws the day's events (same sources as the Calendar tab: the weekly
  template plus custom events, with category colours) and **placed tasks**
  (a Task whose Day is this day and that has a `startTime`; height from
  `durationMinutes`, default 30). One row per task, never copied.
- Overlapping items sit side by side; items crossing midnight or outside
  the visible hours are clamped, and items entirely outside are listed in a
  line above the grid instead of disappearing. A quiet line shows the day's
  scheduled time (the union of all blocks, so overlaps are not double
  counted).
- Kanban cards get a hover "Schedule at" action (time input; "Choose a day
  first" when the task has no Day; "Unschedule" clears `startTime`) and show
  their time. Clicking a placed task opens the task modal. Clicking a custom
  event opens an inline editor (title, start and end time inputs, delete with
  an inline confirm; edits that one occurrence only).
- New pure helpers `lib/timebox.ts` with 18 tests (layout maths, overlap
  columns, clamping, midnight crossing, scheduled-time union, task items).
- `startTime` and `durationMinutes` remain local only until migration 2.
- Verified: `tsc --noEmit` clean, iOS JS bundle export succeeds, 37 mobile
  and 19 desktop tests pass, and the built desktop app was driven headless
  and checked against the data files and screenshots. Not device tested on
  iOS.

---

## 2.3.0 — 2026-10-05

**Desktop Home: weekly kanban and task modal (web/Electron only; iOS UI unchanged).**

- `Task` gains optional `durationMinutes` and `startTime` (decision 015), and
  `dueDate` is now documented as the planned Day. **Local only**: `sync.ts`
  is untouched, so these fields are not uploaded until migration 2
  (checkpoint 5). Desktop stays signed out until then. iOS ignores them.
- New `KanbanPane.tsx`: an Unscheduled column plus 14 days from today,
  horizontal board scroll, each column scrolling on its own. Cards show
  title, High priority flag, label name and duration; finished tasks stay in
  their column, struck through, sorted last. Unfinished past tasks appear in
  Today first with a muted "from <date>" tag, and their stored date is left
  alone. A "Later" column appears only when a task is dated beyond day 14.
- New `TaskModal.tsx`: centred overlay for create and edit (title, Day via a
  web date input, priority, label, duration chips, notes, inline delete
  confirm). A "+ Label" link creates a label inline. Brain Dump rows get a
  hover "Make task" action that opens it pre-filled; saving moves the item
  (the Brain Dump item is deleted, the Task is marked `origin: 'dump'`).
- New pure helpers `lib/kanban.ts` with 19 tests (`npm test` in `mobile/`),
  including month, year and leap boundaries and clock changes in six time
  zones.
- `tsconfig.json`: `allowImportingTsExtensions` so the test file can import
  with an explicit `.ts` extension, as Node requires. No source file uses it.
- Verified: `tsc --noEmit` clean, iOS JS bundle export succeeds, 19 mobile
  and 19 desktop tests pass, and the built desktop app was driven headless
  (create, Make task, move, complete, delete, with the results checked in
  the data files). Not device tested on iOS.

---

## 2.2.0 — 2026-10-05

**Desktop Home: real Brain Dump pane (web/Electron only; iOS unchanged).**

- New `app/components/desktop/BrainDumpPane.tsx` replaces the left
  placeholder: pinned capture input (Enter adds), flat list with hairline
  dividers, click a title to edit inline (Enter saves, Escape cancels),
  hover shows a delete icon with an inline "Delete? Yes / No" confirm. Uses
  the existing `storage.ts` Brain Dump functions, so deletes are tombstones
  exactly as on iOS.
- `DesktopHome.tsx` holds one refresh counter shared by the panes so a
  change in one shows up in the others.
- New top-level `desktop/` folder (Electron shell, file store, daily
  backups, export) with its own tests; see `desktop/README.md`.
- Verified: `tsc --noEmit` clean, iOS JS bundle export succeeds, 19
  `node --test` tests pass, and the built desktop app was launched headless
  and screenshotted (see `docs/sessions/2026-10-05-cp1.md`). Not device
  tested on iOS (no iOS code path changed).

---

## 2.1.1 — 2026-10-05

**Storage goes through one `kv` entry point (groundwork for the Windows
desktop app, decision 011). No behaviour change on iOS.**

- New `mobile/lib/kv.ts`: `getItem` / `setItem` / `removeItem` /
  `multiRemove`. On the desktop app the Electron preload provides a
  file-backed store (`globalThis.belificDesktop.kv`); everywhere else,
  including iOS, it is plain AsyncStorage as before.
- `storage.ts`, `ownerSeed.ts`, `devSeed.ts` and the Supabase client's
  session storage now call `kv` instead of AsyncStorage directly. Same
  keys, same values.
- `_layout.tsx` skips `requestPermissions()` on web (expo-notifications has
  no scheduler there; desktop notifications are decision 017).
- Verified: `tsc --noEmit` clean and an iOS JS bundle export succeeds. Not
  device tested on iOS.

---

## 2.1.0 — 2026-09-04

**P-NAV, part 1: Focus/Pomodoro removed entirely.** Jethro found the
4-session Pomodoro flow confusing and didn't think it'd land with other
users either — see `docs/TIMEBOX_AND_NAV_SPEC.md`. Verified beforehand
that `focus.tsx` and its timer state were isolated (only referenced by
`focus.tsx` itself and `settings.tsx`'s Pomodoro config section, not any
of the 7 synced types), so this has no Supabase/sync involvement.

- Deleted `app/(tabs)/focus.tsx` and `lib/store.ts` (the Pomodoro
  `TimerStore`/zustand store — nothing else used the `useTimerStore`
  pattern, so the whole file went, not just its timer-specific exports).
- Removed `TimerSettings`, `TimerPhase`, `TimerStore` from `lib/types.ts`
  and `loadTimerSettings`/`saveTimerSettings` from `lib/storage.ts`.
- Removed the Pomodoro config section from `settings.tsx` (the
  `SettingRow`/`POMODORO_SETTINGS`/`SettingKey` machinery and its edit
  modal) and the `store.update(...)` timer reset from `handleClearAll` —
  "Clear All Data" no longer mentions resetting timer settings.
- Removed the `useTimerStore` hydrate call from `app/_layout.tsx` (no
  longer anything to hydrate on launch).
- Removed the now-route-less `focus` `Tabs.Screen` entry from
  `app/(tabs)/_layout.tsx` — required for the tab bar to still resolve
  correctly with the screen file gone; the `settings` tab is untouched,
  its relocation is P-NAV part 2, not part of this change.
- **Old `belific_pomodoro` AsyncStorage key deliberately left alone** —
  no migration to purge it, not worth the risk for a few orphaned bytes
  on existing installs. `clearAllData()` still removes it as part of an
  explicit user-initiated full wipe, which is unrelated to a migration
  and stayed as-is.
- Verified via `npx tsc --noEmit` (clean) and a grep pass confirming no
  remaining `TimerSettings`/`TimerStore`/`useTimerStore`/`lib/store`
  references anywhere in `app/` or `lib/`.

---

## 2.0.1 — 2026-08-01

**Retroactive entry** — this shipped in commit `99852f3` ("Add optional
notes field to Tasks") without a version bump or changelog entry at the
time; added now for process integrity (see `docs/decisions/` process
notes and `docs/NEXT_PLAN.md` P0.1).

- **Feature:** Task gains an optional `notes` string. Editable via a
  multiline field in `TaskForm` ("Notes (optional)", shown for both
  new and existing tasks), stored alongside the task's other fields.
  The Tasks list shows it as a smaller, secondary-colored line under
  the title (`taskNotes` style, `numberOfLines={1}`) so it reads as a
  note, not a second task title.
- Synced like every other `Task` field — `sync.ts`'s `RemoteTask`
  interface, `taskToRemote`/`taskFromRemote` mappers, and a new
  Supabase migration (`20260801004209_add_task_notes.sql`, adds a
  nullable `notes` column to the `tasks` table) all updated together.
  Whether this migration has actually been applied to the live
  Belific Supabase project is tracked separately — see
  `docs/NEXT_PLAN.md` P0.3.

---

## 2.0.0 — 2026-07-31

**Major, not minor — this reverses decision 003 ("No Supabase for v1"),
a named architectural decision reconfirmed multiple times throughout
this project's history.** A version bump that size deserves to say so
plainly rather than blend into the usual 1.x.x feature/fix rhythm.
Optional accounts + cloud backup, Phases C and D of the accounts plan,
shipped together — auth without a sync layer, or sync without auth, is
an unshippable half-feature, so both land in the same release. (Phase
A — local data-shape migration — and Phase B — Supabase project/schema
— already shipped standalone in 1.7.0 and its own infra-only commit;
neither changed the app's actual behavior by itself.)

Accounts remain fully **optional** — every screen, every feature, works
identically signed out, exactly as before. Nothing here changes
behavior for anyone who never signs in.

### Phase C — Sign in with Apple
- Settings gained an **Account** section: "Sign in with Apple" when
  signed out; signed-in email (or Apple's private-relay address if the
  user chose Hide My Email) + Sign Out + Delete Account when signed in.
- `com.apple.developer.applesignin` entitlement added the correct,
  Expo-managed way — `usesAppleSignIn: true` + the `expo-apple-authentication`
  plugin in `app.json`, regenerated automatically on every `prebuild`,
  not a hand-edit of the gitignored entitlements file.
- **Delete Account** is a real, server-verified deletion (guideline
  5.1.1(v)): a Supabase Edge Function (`delete-account`) — the only
  safe place for this, since the client can never call the service-role
  admin API needed to delete its own auth user — removes every row
  across all 7 synced tables for that user, then the auth user itself.
  Double-confirmation on-device before it runs; verified directly
  against the Supabase API afterward (not just trusting the UI) that
  `auth.users` and all 7 tables were genuinely empty for the test
  account, no orphaned rows.
- One real bug caught during verification: the first delete attempt
  showed local success (session cleared, Settings reverted) while the
  account was still present in `auth.users` server-side — a silent
  failure. Redeployed the Edge Function with explicit error handling
  and step-by-step logging so a failure can't complete silently again;
  confirmed clean on retry.
- Apple's Sign In with Apple key is team-scoped, not per-App-ID —
  reusing Landis's existing key was technically valid, but a dedicated
  key was generated for Belific instead to avoid coupling the two
  apps' credential blast radius/revocation lifecycle together, matching
  the same separate-Supabase-project decision already made in Phase B.

### Phase D — Sync layer
- Local-first, optimistic: every local write in `storage.ts` already
  completes and updates the UI before any network call happens; a
  fire-and-forget push to Supabase follows via `sync.ts`, via a dynamic
  `import('./sync')` inside `storage.ts` specifically to avoid a
  circular static import (`sync.ts` needs `storage.ts`'s raw loaders to
  reconcile). Signed-out (the default) or offline is a fast, silent
  no-op — nothing ever blocks on network, same feel as before for every
  user regardless of account status.
- No polling timer — sync triggers only after a local write and on app
  foreground (`AppState` transition to `active`), which is what a
  personal, human-paced app actually needs.
- One `runFullSync()` reconcile handles both cases from the plan
  uniformly: a brand-new account's one-time bulk upload (remote is
  empty, so everything local just uploads) and merging onto an
  existing account's data on a second device (union by id, newest
  `updatedAt` wins on a genuine conflict, local wins ties since
  re-uploading an identical row is harmless).
- `RoutineCompletion` syncs differently from the other six types, on
  purpose (see Phase A's own reasoning) — no `updatedAt`, no tombstone;
  a delete is pushed as a real row delete immediately, and the
  reconcile pass is a plain union by `(routineId, date)`, not a
  timestamp comparison.

Sources: Apple guideline 5.1.1(v) (account deletion), guideline 4.8
(login services — doesn't trigger here, Apple is the only login
method offered).

---

## 1.7.0 — 2026-07-31

- **Phase A of optional accounts + cloud backup: local data-shape
  restructuring, no backend yet.** Reverses no part of decision 003
  ("No Supabase for v1") by itself — this ships standalone, works
  identically offline-only, and is a prerequisite for the sync work in
  003's own "Do Not Change Unless" clause, not the sync itself.
  - **`updatedAt`** added to `CustomEvent`, `BrainDumpItem`, `Routine`,
    `Task`, `Project`, `CustomCategory` — needed for last-write-wins
    conflict resolution once sync exists. `Project`/`CustomCategory` had
    no timestamps at all before this; both also gained `createdAt`.
    Every `addX`/`updateX` in `storage.ts` now stamps it server-side
    (the single source of truth — call sites don't need to remember to
    set it correctly on every edit).
  - **One-time migration** (`migrateToSyncableSchema`, gated by a new
    `belific_schema_migrated_v2` flag, same pattern as
    `belific_owner_seeded`) backfills `updatedAt` on every already-saved
    row from `createdAt` where it exists, or a single shared migration
    timestamp for `CustomEvent`/`Project`/`CustomCategory` (which had no
    earlier timestamp to recover). Runs once on app launch, before
    anything else touches storage; every write it does is
    backfill-if-missing, so it's safe to no-op or retry indefinitely.
    Never rewrites an id, never removes a row.
  - **Ids switched to real random UUIDs** (RFC4122 v4, generated from
    `crypto.getRandomValues`, already polyfilled via
    `react-native-get-random-values` per decision 003's own
    "Consequences" note) for all *newly created* rows — needed once ids
    may need to be unique across devices, not just within one device's
    own AsyncStorage. Deliberately **not** a new npm dependency (a
    ~10-line local generator instead) given this repo's build history of
    dependency-change pain documented in `IOS_BUILD_NOTES.md`. Existing
    `Date.now()`-based ids are never touched or regenerated — both
    formats coexist permanently as opaque strings.
  - **Soft-delete tombstones** (`deletedAt?`) added to `CustomEvent`,
    `BrainDumpItem`, `Routine`, `Task`, `Project`, `CustomCategory`.
    Delete functions in `storage.ts` now set this instead of removing
    the row outright; every loader filters tombstoned rows out (never
    visible to any screen) and prunes them for real after 90 days once
    old enough that a slow-to-sync device would have had a chance to see
    the delete. `shouldShowStarterRoutine` updated to use the
    tombstone-filtered loaders instead of raw `AsyncStorage` reads — it
    would otherwise have permanently miscounted a store containing only
    soft-deleted rows as "has data."
  - **`RoutineCompletion` deliberately excluded** from all of the above —
    no `updatedAt`, no tombstone. Un-completing a routine is frequent,
    intentional, everyday behavior (per its own existing code comment),
    not an occasional cleanup action; tombstoning it would mean
    permanently retaining a complete/uncomplete pair for every day of
    every routine's life. Its sync story (Phase D, not yet built) is a
    real row delete on its `(routineId, date)` composite key, with
    conflicts resolved by whichever device's sync reaches the server
    last — deliberately the simple version, not a rigorous per-row
    timestamp queue, since this is one person's own data across their
    own devices and a same-day toggle collision is rare, low-stakes, and
    self-correcting.

---

## 1.6.1 — 2026-07-31

- **Starter Routines now show a one-emoji icon per item** (💧 drink
  water, 🪥 brush teeth, 🚿 shower, 🥗 lunch away from desk, 🍃 fresh
  air, 📵 phone away before bed) — on-device feedback was that the
  plain-text starter rows read as less expressive than the rest of the
  app. Starter Top 3 Tasks deliberately stay icon-free: real Task rows
  never show one either, and keeping it that way is what visually
  tells Routines and Tasks apart despite sharing the same row styling.

---

## 1.6.0 — 2026-07-31

- **Expanded the new-user starter template** to cover Routines, Top 3
  Tasks, and Brain Dump — previously only the Full Schedule had example
  content; the other three sections just showed a bare empty state.
  All four now show casual, relatable examples (Morning: "Drink water
  on waking up", "Brush teeth", "Shower"; Afternoon: "Eat lunch away
  from your desk", "Get some fresh air"; Evening: "Put your phone away
  before bed", "Brush teeth"; Top 3 Tasks: "Do laundry", "Grocery
  shopping", "Walk the dog"; Brain Dump: "Clean room", "Schedule
  meeting with a friend", "Cook rice", "Take chicken out of the
  freezer"; Full Schedule reworded to Work block / Gym / Downtime
  alongside Lunch break / Cook dinner). All starter rows are
  non-interactive display-only, same treatment as the existing
  Full Schedule template — never written to storage.
- **Fix:** `shouldShowStarterRoutine` was a one-time flag — it flipped
  to "seen" on its very first call ever and never showed starter
  content again after that, even with zero real data, even on a
  different tab that hadn't loaded yet. That's incompatible with
  showing starter content consistently across Today, Tasks, and Brain
  Dump regardless of which tab loads first. Now purely computed from
  whether any of custom events / Brain Dump / Routines / Tasks have
  real data — starter content shows for as long as none of the four
  do, and disappears the moment any one of them gets its first real
  entry. `belific_first_launch` is no longer read for this; `Clear All
  Data` still clears the now-unused key.

---

## 1.5.5 — 2026-07-31

- **Fix:** Settings' "Version" row was a hardcoded literal `"1.0.0"`
  string — never wired to `app.json`'s actual `expo.version` at all,
  in any version of this file. Every version bump this session (and
  presumably before it) was genuinely correct in `app.json`/
  `CHANGELOG.md`; the Settings UI simply never displayed it. This was
  not a stale-build or caching issue — confirmed by reading the source
  directly before assuming anything. Now reads
  `Constants.expoConfig?.version` from `expo-constants` (promoted from
  an already-present transitive dependency to an explicit one via
  `npx expo install expo-constants`; no prebuild needed, since its
  native module was already linked as part of the `expo` package —
  every build log this session shows the `[CP-User] Generate
  app.config for prebuilt Constants.manifest` step that populates this
  at build time). Version now genuinely reflects the installed build.

---

## 1.5.4 — 2026-07-31

- **Fix:** Top 3 Tasks checkbox on Today didn't show a checked state
  and completing a task there was effectively irreversible from that
  view. Two compounding bugs: the checkbox icon was hardcoded to
  `ellipse-outline` unconditionally, never checking `task.completed`
  at all (unlike the Routine checkbox, which already switched icons
  correctly); and `toggleTopTask` called `loadTopTasks()` right after
  toggling, which re-derives the list via `getTopTasks()` —
  deliberately filters out completed tasks — so the row would vanish/
  get replaced the instant it was tapped, before any checked state
  could be seen and with no way to tap again to undo from the same
  spot. Fixed both: the icon now reflects `task.completed`, and
  toggling updates the row in place (optimistic local state update)
  instead of immediately re-fetching/re-filtering, so it stays visible
  and genuinely reversible — tap again to un-complete — until the next
  natural refresh (refocus/pull-to-refresh), which is when a completed
  task should actually vacate its Top 3 slot. Confirmed the Tasks
  screen's own checkbox was unaffected — it already conditioned the
  icon on `item.completed` and its full list keeps completed tasks
  visible (dimmed, moved to the bottom) rather than filtering them out.

---

## 1.5.3 — 2026-07-31

- **Simplified Brain Dump back to fast-capture only.** Removed the
  2-option sheet (Schedule / Make Task) entirely — tapping a card now
  opens a simple edit view with just title and notes, nothing else.
  No date/time fields, no scheduling, no promotion to Task anywhere
  in this flow. Swipe-left-to-delete unchanged. Tasks and Events are
  now fully independent of Dump again — both are created via their
  own existing quick-add flows (Tasks screen, Today/Calendar), not
  through Dump. `BrainDumpItem.notes` (from the original Phase 3 data
  model) already existed and the card-preview-of-notes was already
  implemented — neither needed rebuilding, just re-exposed via the
  new edit view. New `updateBrainDumpItem` in `lib/storage.ts` (didn't
  exist before; only add/delete did).
- Note: `EventForm`/`TaskForm`'s `origin`/`initialTitle` props (added
  for the now-removed Dump promotion paths) are left in place —
  they're harmless, optional, and still used by their own components'
  types; only Dump's actual usage of them was removed. This does mean
  the 🧠 origin indicator on Tasks/Events is now vestigial for new
  items (nothing creates one anymore) but still correctly reflects
  historical data from items promoted before this change.

---

## 1.5.2 — 2026-07-31

- **Fix:** `splash.image` and the `expo-notifications` plugin's `icon`
  in `app.json` now also point to `./assets/belificappicon.png`,
  matching the app icon fixed in 1.5.1 — both previously still
  referenced the old default `icon.png`.
- Deleted the stale alpha-containing source file at the repo root
  (`assets/belificappicon.png`, the legacy web app's assets folder,
  untracked in git) now that the flattened version lives in
  `mobile/assets/` and nothing references the old one.
- Required another `expo prebuild --platform ios` to regenerate the
  native splash asset catalog (confirmed: `SplashScreenLegacy.imageset`
  was still the old 512×512 asset before this). As documented in
  `IOS_BUILD_NOTES.md` #9, this re-added the `aps-environment`
  entitlement and broke the build again — stripped it again, exactly
  as expected since `mobile/ios/` is gitignored and this recurs on
  every prebuild, not just the first time.
- Verified directly from the regenerated native source of truth
  rather than trying to screenshot a fast-dismissing splash frame:
  `SplashScreen.storyboard`'s embedded `SplashScreenBackground` color
  resource decodes to exactly `#F0EEE8`, and its image view references
  `SplashScreenLegacy`, confirmed regenerated from the new icon
  (1024×1024, was 512×512). Home screen icon re-confirmed unaffected
  (still correct) by this second prebuild/rebuild via simulator
  screenshot.

---

## 1.5.1 — 2026-07-31

- **Fix:** real app icon installed, replacing the Expo default. Source
  file was found at the repo root (`assets/belificappicon.png`, the
  legacy web app's assets folder) rather than `mobile/assets/` as
  initially expected — moved into the correct location. It had an
  RGBA alpha channel (`sips` reports `hasAlpha: yes`); flattened to
  solid `#F0EEE8` (matching the app background) and re-encoded as
  RGB with no alpha channel, since iOS/App Store icon validation
  rejects on the alpha channel's mere presence regardless of whether
  any pixel is actually transparent — manually decoding the pixel
  data confirmed this specific image was already 100% opaque
  everywhere, so the flatten step changed nothing visually, only
  stripped the channel. `app.json`'s `expo.icon` now points to
  `./assets/belificappicon.png` (`splash.image` and the notifications
  plugin's `icon` still reference the old `icon.png` — left alone,
  out of scope for this fix).
- **Fix:** `npx expo prebuild --platform ios` (required to regenerate
  the native icon asset catalog) also regenerated
  `Belific.entitlements` with an `aps-environment` key that automatic/
  free-tier signing doesn't support, breaking the build. Removed it —
  Belific never uses remote push (decision 002, local notifications
  only). Since `mobile/ios/` is gitignored, this isn't a one-time fix;
  documented in `IOS_BUILD_NOTES.md` #9 as a step required after every
  future prebuild, the same way the fmt patch already is.
- Verified via simulator screenshot (physical-device screenshots have
  no CLI tooling available) — new icon renders correctly, no
  transparency artifacts, no leftover default icon. A duplicate
  "Belific" icon under the old `com.belific.app` bundle ID also
  appeared during verification; confirmed as pre-existing simulator
  cruft from before the bundle ID was corrected to `com.najeca.belific`
  (unrelated to this fix) and removed from the test simulator.

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
