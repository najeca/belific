# Belific build plan

Built from three inputs: screenshots of a competing planner's own UI taken during a free trial, Claude Code's Step 0 report on the Belific repo, and Jethro's decisions. It replaces the earlier schema draft and addendum, which were written without seeing the repo and conflict with the live schema. Do not apply those files.

Belific facts below come from the Step 0 report. Check anything that matters against the repo before relying on it.

Progress, phase by phase, is in `docs/build-progress.md`. A new session starts from this file and that one.

## 0. Decisions (final)

1. Schema path: evolve the live tables with small additive migrations. Keep text ids, composite keys (user_id, id) or (user_id, key), no foreign keys, no CHECK constraints, deleted_at tombstones, server_updated_at trigger, owner only row level security written as (select auth.uid()), anon and public revoked. Follow the conventions in the existing 001 migration exactly.
2. Sync: keep the outbox, the pull cursor on server_updated_at and the server clock conflict model (decision 013). No Realtime for now. Revisit only if lag between iPhone and Windows becomes annoying, and then only as a nudge that triggers the existing pull.
3. Quests: build on the existing repeating series (decision 023) and routine_completions. Do not add a third repeat system. The Quests tab is a view over what exists, grouped by cadence. On the desktop, routines were already converted to daily repeating series in 2.16.0 (series root id `rt_<routineId>`), so **Quests Daily is the daily series**, not the `routines` table. The emoji for a quest lives on the series root task (`tasks.emoji`).
4. No gamification. No XP, no levels, no multiplier. Supersede the XP parts of decisions 008 and 014 (done: decision 027). Streaks exist only for recurring tasks, on the Quests tab. Keep the spirit of decision 007: a miss must never shame. Show current streak and best streak, never a red broken streak message.
5. Platforms: shared logic first (data, sync, recurrence, timer), then desktop UI, then an iOS adaptation of each phase. The iOS adaptation steps are listed under section 3, "iOS adaptation".
6. Trash: the Trash view shows items deleted in the last 30 days. Retention is as the repo defines it: **90 days for ordinary tombstones, 400 days for skipped days of repeating tasks** (`series.OCCURRENCE_TOMBSTONE_KEEP_DAYS`), so the 30 day Trash always fits inside it.
7. Recurrence values: the sync mapping keeps a repeat rule it does not recognise and sends it back unchanged, so an older client never destroys a newer value (done in phase 1, `sanitizeRecurrence`). **Annual repeat is phase 4.** Before the first annual task is created, update every device (desktop and iPhone) to a build that knows `annual`: an older build shows an annual task as repeating with no days and makes no next copy.
8. actual_minutes is nullable and NULL means 0. Every total, day sum, list sum and analytics figure treats NULL as 0.
9. Emoji and icons (phase 2 onward; phase 1 replaced nothing): use the system's native emoji wherever a natural one exists: tabs, lists, labels, quests, section headings, empty states and settings rows. Keep Ionicons only for controls with no good emoji: chevrons, close, check, drag handle, play and pause.
10. Keyboard: Tab stays for keyboard focus and is never a shortcut. **V toggles Calendar and Kanban** (check it does not clash with an existing shortcut when the registry is built). Single letter shortcuts never fire while a text field has focus (the app already has `isTextEntryTarget` in `mobile/lib/editable.ts`).
11. Lists are desktop only until the iOS adaptation moves the iPhone's Brain Dump onto tasks.

Out of scope: archive (the reference product has Trash only), XP, levels, quests as a reward system, Realtime, uuid ids.

## 1. Gap analysis

Status is from the Step 0 report. "Check" means the report could not confirm it.

| Feature in the reference planner | Belific now | Action | Phase |
|---|---|---|---|
| Brain Dump list, plus extra lists with emoji and a switcher showing counts | Brain Dump only | Add lists | 1, 2 |
| Estimate with preset picker (5, 10, 15, 20, 30, 45 min, 1h, 1h30 and up, editable text) | duration_minutes exists | Add preset picker | 2 |
| Actual time, editable by hand, plus Start timer | Missing (actual removed in 2.14.0) | Add actual_minutes and timer | 1, 2 |
| Floating timer widget (time, task name, pause) and "Timer active" strip on the card | Missing | Build | 2 |
| Day and list totals shown as actual / estimated (0:00 / 1:00) | Check | Build | 2 |
| Label popover: search or create, New label, Edit labels | Labels exist (projects) | Build popover, add emoji | 2 |
| Repeats field | Series exist: daily, weekly, biweekly, triweekly, monthly. Annual missing (checked in phase 1) | Add annual (needs no migration: the column is text) | 4 |
| Notes, subtasks with drag handle and menu, Ctrl+S new subtask | Notes and subtasks exist | Check UX | 2 |
| Task menu: Duplicate task, Delete | Check | Build | 2 |
| Task detail fields: List, Estimated, Actual, Label, Repeats, Notes, Subtasks | Partly | Match field set | 2 |
| Calendar view: day, week, month, all day row, current time line, 24 hour scroll | Timebox day view exists, rest unconfirmed, no month | Build | 3 |
| Calendar and Kanban toggle in the main area (V) | Missing | Build | 3 |
| Collapsible left and right sidebars | Missing | Build | 3 |
| Search (Ctrl+K), filter, show only today | Label filter and Show complete only | Extend | 3 |
| Quick capture (Q) and create task today (T) | Missing | Build in app first | 3 |
| Keyboard shortcuts with a help overlay | Missing | Build registry | 2, 3 |
| Daily Planning, 4 steps | Missing | Build | 5 |
| Daily Shutdown, 2 steps | Missing | Build | 5 |
| Rollover of unfinished tasks | Check | Build idempotent | 5 |
| Analytics page | Progress page of streaks only | Build | 6 |
| Trash with restore | Soft delete, no UI | Build view | 6 |
| Account data export | Missing | Build JSON and CSV export | 6 |
| Power feature toggles (due dates and reminders, priority, daily planning, pomodoro, attachments, templates, analytics, email forwarding, API access, assistant) | Missing | Build toggles | 7 |
| Settings sections: Account, General, Keyboard shortcuts, Calendar accounts, Labels, Integrations | Settings, Labels, Progress pages | Consolidate, Labels as overlay | 7 |
| Reset local data, Force task rollover (support tools) | Missing | Add "Reset local cache and resync" | 7 |
| Pomodoro, templates | Missing | Build, simple | 7 |
| Calendar connections | Check | See section 7 | 8 |
| Quests tab with streaks | Series and Progress page exist | Build the view | 4 |
| Attachments, Todoist, Notion, Slack, email forwarding, assistant, API or MCP | Missing | Later, see section 7 | 9 |

## 2. Data requirements

**Done in phase 1** as `mobile/supabase/belific_schema/002_lists_settings_timer.sql`, applied 2026-10-16. What was built differs from the list below in four places: `actual_minutes` is nullable with no default (NULL means 0); `created_at` already existed on tasks, so it was not added; the emoji for the recurring task source is on `tasks` (series roots), not `routines`; Brain Dump is the tasks with no `due_date` and no `list_key`.

Write these as migrations in the style of 001. Do not paste SQL from anywhere else.

tasks, add:
- actual_minutes, integer, default 0.
- timer_started_at, timestamp, nullable. A running timer syncs, so the widget shows on both devices. Stopping the timer adds the elapsed whole minutes to actual_minutes and clears timer_started_at. If timer_started_at is older than 24 hours when stopped, ask the user what to add instead of adding it silently.
- list_key, text, nullable. Decide how Brain Dump maps (tasks with no due_date and no list_key is the likely answer). Look at how the legacy brain_dump_items table is used first.
- created_at, only if it does not already exist. Analytics needs the age of Brain Dump tasks.

New table lists: key, name, emoji, sort_order, plus the standard columns (deleted_at, server_updated_at, owner and RLS in the house style).

emoji column on: projects (labels), the recurring task source (series or routines, whichever backs Quests), lists.

New table user_settings with key (user_id, key) and a value. It holds the power feature toggles and any other setting that should follow the user across devices. UI state stays local, EXCEPT the pane layout (panes open or collapsed, Kanban or Calendar, the Calendar view, show only today), which Jethro asked to keep in user_settings under the key `ui.panes` with a local fallback (phase 3, 2026-10-16). The shown list and the filter stay local.

Recurrence: confirm daily, weekly, biweekly, monthly and annual exist. Add annual only if missing. Streaks are derived from completions, with no stored counters.

Every new field must go through syncCore and sync.ts mapping, with tests, in the same change.

Not to add: XP or level tables, time_entries, foreign keys, CHECK constraints, uuid ids, Realtime publications.

## 3. Phases

Each phase ends with typecheck and tests passing, one commit, and iOS checked or explicitly deferred.

Phase 1, data foundations. Migrations from section 2, sync mapping, tests for timer maths and for the new fields round tripping through the outbox. Done when a field written on one device appears on the other. **Done 2026-10-16** (see `docs/build-progress.md`; proven against the fake server, the first real two device check happens when phase 2 gives the fields a UI).

Phase 2, task model and timer. Task detail panel and inline expanded card, estimate preset picker, actual time and timer with floating widget, label popover with emoji, lists switcher, duplicate and delete, day and list totals (actual / estimated, NULL actual counts as 0), shortcut registry with help overlay (Shift+/). Emoji where a natural one exists, Ionicons only for chevrons, close, check, drag handle, play and pause (section 0, item 9). Single letter shortcuts never fire in a text field. Done when a task can be created, estimated, timed, labelled, repeated and completed from the keyboard.

**Done 2026-10-16**, desktop only, no schema change (`docs/build-progress.md`, decision 028). As built: the existing Repeats control on cards stays (the new details panel has none); one timer at a time; the actual time is whole minutes rounded down; a timer over 24 hours asks before anything is added; the estimate presets are 5, 10, 15, 30, 45 min, 1h, 1h 30m, 2h plus custom; Ctrl+Delete opens the delete question rather than deleting; emoji are not yet in the Settings, Labels and Progress pages.

Phase 3, desktop layout. Collapsible panes with remembered state, centre toggle between Kanban and Calendar (V; Tab stays for focus), calendar day, week and month views (D, W, M) with all day row, current time line and 24 hour scroll, search, filter, show only today, quick capture. Done when the layout works with either sidebar hidden.

**Done 2026-10-16**, desktop only, no schema change (`docs/build-progress.md`). As built: the Calendar shows and opens tasks but takes no drops (dragging stays on the Timebox); the Timebox got the current time line but no all day row; panes are remembered in `ui.panes`; Q and T open a quick capture overlay; search (Ctrl+K) shows a result where it lives or opens its details.

Phase 4 **done 2026-10-16 (2.21.0)**, see `docs/build-progress.md` and decision 029. Phase 4, Quests. Tab or icon that opens the Quests screen. Sections: Daily (the daily series, which on the desktop include the converted routines), Weekly, Biweekly, Monthly, Annual. Triweekly series exist too: show them, so no recurring task is hidden (decide with Jethro whether they get their own section or join Biweekly). Add annual repeat here, with the caution in section 0, item 7. Each recurring task is one card with its emoji, due state for the current period, one tap complete, current streak and best streak. A weekly streak counts consecutive weeks, a biweekly one consecutive fortnights, and so on. Allow a planned skip that does not break the streak. Option to drop a quest into today's plan or the Timebox. Done when no recurring task is hidden from the screen and streaks match the completion history.

Phase 5 **done 2026-10-16 (2.22.0)**, desktop only, see `docs/build-progress.md`. Phase 5, Daily Planning, Daily Shutdown and rollover. See section 4. Rollover must be idempotent so that two devices running it cannot conflict: move a task to today only if its date is before today and it is not complete. Done when planning and shutdown can be cancelled without changing anything.

Phase 6, Analytics, Trash, data export. Analytics is derived from existing data plus actual_minutes. Date ranges: current work week, last 7 days, last 14 days, last month, last 3 months, custom. Cards: tasks completed against the previous period, actual against estimated, average age of Brain Dump tasks. Charts: time per day (by task count or by time), estimated against actual per task, tasks by label (percentage). A completed task list with grouping and CSV download. Trash view with restore. Account data export as JSON and CSV.

Phase 7, settings and power features. Power feature toggles (off means the field or screen is hidden, which keeps the default UI minimal): due dates with reminders, priority, daily planning, pomodoro, templates, analytics, attachments. Labels becomes an overlay. "Reset local cache and resync" for debugging the outbox. Pomodoro on the task timer. Task templates.

Phase 8, calendar connections. See section 7.

Phase 9, later: attachments, imports and integrations, assistant, API or MCP.

iOS adaptation. Each phase gets its own iOS step after its desktop UI. Steps that must happen first, in this order, before the iPhone gets the matching feature:
1. Brain Dump moves from `brain_dump_items` to tasks (no `due_date`, no `list_key`), as the desktop already does. Until then lists stay desktop only.
2. Routines are converted to daily series on the iPhone (the desktop's Convert, `lib/routineConvert.ts`) before iOS gets Quests. The 2 routines on the iPhone are not converted yet.
3. The iPhone completes tasks through `setTaskCompleted` and must keep doing so.
4. Every device is updated to a build that knows `annual` before the first annual task exists.

Model guidance: use the strongest model for phases 1, 4, 5 and 8, where mistakes touch sync, recurrence or data. Use a cheaper model for the UI heavy phases 2, 3, 6 and 7.

## 4. Planning and shutdown flows

All changes inside a flow are a draft that is applied only when the user presses Finish. Closing the flow discards them. Each flow is a full screen overlay on the home screen, which respects the rule that desktop home does not navigate. Layout: a narrow left rail with a step badge, a title, helper text, summary figures and the primary button pinned at the bottom (back arrow beside it after step 1). The content area to the right holds one to three columns.

Daily Planning (4 steps, opens with Ctrl+Shift+P):
1. Review your work. Left summary: tasks completed and total time, split by label. Columns: "Here's what you finished" and "Here's what you missed" (unfinished tasks from earlier days, including rolled over ones, with a tick to mark any that were actually done). Empty state: "No missed tasks to review. Add anything you want to work on in the next step."
2. What do you want to get done today? Left: a list picker with that list's tasks. Right: Today, with an add task bar and today's tasks. Pull tasks across, or add new ones. Helper text says everything is a draft until you finish.
3. Can anything wait? Left summary: task count, total time, a bar and a per label time split. Three columns: Today, Tomorrow ("Add tasks that can wait") and Next week ("Add tasks that can wait").
4. Finalise your day. Left: Today's tasks. Right: the Timebox with all day row, hours and current time line, so tasks can be dragged into time slots. Button reads Finish.

Daily Shutdown (2 steps):
1. Review today's work. Same summary rail. Columns: "Here's what you did today" (with a note that corrections are fine) and "What you missed" (review what is eligible to roll into tomorrow).
2. What do you want to get done tomorrow? Left: list picker and task templates. Right: Tomorrow, with a line such as "2 already planned tasks, 0 tasks from Today", which is the rollover preview. Finish applies it.

## 5. Keyboard shortcut reference

Treat this as a starting set. Belific can change any key. Put them in one registry so the help overlay is generated from it.

General: Shift+/ help, Ctrl+K task search, Shift+F show only today, Q quick capture, T create task today.
Task actions: Enter edit or save description, Ctrl+Enter create task from modal, Ctrl+Delete delete task, Ctrl+L select label, Ctrl+I toggle time section, Ctrl+E set estimate, Ctrl+B set actual time, Ctrl+Shift+Enter start or stop timer, Esc deselect, C complete, S show or hide subtasks, Ctrl+S new subtask.
Navigation: D day view, W week view, M month view, Shift+T go to today and select the first task, Shift+B select first Brain Dump task, V switch Calendar and Kanban (not Tab: Tab moves keyboard focus), Up and Down previous and next task, Left and Right first task on the previous or next day, Ctrl+Shift+P Daily Planning.

**Wired as of phase 3 (the registry `mobile/lib/shortcuts.ts` is the truth, and the Shift+/ overlay is generated from it):** Shift+/, Ctrl+K, Q, T, Shift+F, `[`, `]` (hide the panes), V, D, W, M, Up, Down, C, S, Ctrl+S, O (details), Ctrl+E, Ctrl+B, Ctrl+L, Ctrl+Shift+Enter, Ctrl+Shift+D (duplicate), Ctrl+Delete. **Not wired:** Enter to edit, Ctrl+Enter, Ctrl+I, Esc to deselect, Shift+T, Shift+B, Left and Right between days, Ctrl+Shift+P (phase 5).

## 6. Design guidance

Keep Belific's identity: its own palette (sage green accent), its own type, emoji where a natural one exists. **Decided (2026-10-16): use the system's native emoji** (rendered by the OS, nothing bundled, no emoji artwork in the repo). Emoji for tabs, lists, labels, quests, section headings, empty states and settings rows; Ionicons only for chevrons, close, check, drag handle, play and pause. iOS and Windows draw emoji differently; that is accepted.

Principles worth adopting from the reference, none of which are anyone's property:
1. Depth through tone, not lines. Three surface levels: the narrow rail, the main area, and cards, separated by background tone with only hairline borders.
2. One radius and one row shape. Tasks, inputs and popovers share a rounded row. Fewer shapes reads as calm.
3. Progressive disclosure. A task row shows only its title, one quiet label link and a time chip. Press the row for an inline card with actual, estimated and a play button. Open the detail panel for the full field set.
4. Optional fields are hidden until their feature is switched on. This is the Toyota Yaris idea applied to UI, so keep it.
5. Empty states say what to do next, in one plain sentence.
6. Wizard screens share one skeleton: left rail with step badge and primary button, right content in columns.
7. Time is the main piece of metadata. Chips on the right edge, totals as actual / estimated, timebox blocks coloured by label.
8. Sidebars are always collapsible so the calendar or kanban can have the full width.

Belific specific: the primary button and active states use the sage green, not a saturated accent. Daily Planning and Shutdown are overlays. Quests and Profile are the only things that change the screen on desktop home.

## 7. Integrations, in a sensible order

Calendars, cheapest first:
1. iOS: read and write the phone's own calendar database through the Expo calendar module. It already contains any Google, iCloud or Outlook account on the phone, so no server and no OAuth is needed. Check first whether the iOS Calendar tab already does this.
2. Outbound feed: a read only ICS link served by a Supabase Edge Function from a secret URL, so Google, Apple and Outlook can subscribe to Belific tasks. The token is regeneratable.
3. Inbound on Windows: import ICS subscription URLs, read only.
4. Last: two way sync with Google Calendar and Microsoft Graph. This needs your own OAuth apps, token storage in a table the client can never read (service role only) and rate limit handling. Treat it as optional.

Imports and integrations:
- Todoist is the only one worth doing early, as a one way import using the user's own personal token, held server side.
- Notion, Slack and email forwarding each need an app registration or an inbound email service and have low return for a personal open source app. Leave them until you actually miss them.
- Assistant and API or MCP: a small personal MCP server on top of Supabase is cheap and fits how you work. Do it last.

## 8. Open source checklist

- Licence file, README, .env.example.
- No keys in history (scan before the first public push). The Supabase anon key is meant to be public, the service role key never is.
- Row level security on every table, including new ones.
- No other product's name, screenshots, code, text or assets anywhere in the repo.
- Emoji set with an open licence.
- Document the schema and the sync model, since the sync design is the most distinctive part.

## 9. Still unknown

Capture these from the reference trial if you want closer parity: the Repeats dropdown options, the Filter dropdown, the Labels page, the Month view, the quick capture window (Q), the Pomodoro timer once enabled, the Task Templates page, and the due date field with reminders once enabled. None of these block phases 1 to 3.
