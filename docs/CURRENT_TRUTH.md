# Belific: current truth

Update this at every session close. It replaces `current-state-audit.md` and `architecture.md` (both historical, July 2026) in the session protocol.

Last verified: 2026-10-05 against branch `v2-redesign`.

## Shipped
- **iOS 2.1.0** (per Jethro, live on the App Store): Today, Brain Dump and Calendar tabs; Tasks and Settings as pushed screens; local notifications; optional Sign in with Apple plus Supabase sync (7 tables).
- **Desktop (app version 2.7.0, checkpoints 0 to 3 plus the 2b and 2c corrections)**: an Electron shell in `desktop/` loads the Expo web export over `app://`, stores data as files in the main process with a daily backup (newest 14), and shows three real panes. **Brain Dump**: the thing you capture IS the task (Enter creates a Task); the pane lists incomplete tasks with no Day plus any legacy Brain Dump items (converted on first save), with a collapsed "Done today". **Week board**: forward-only, days only (no Unscheduled column); clicking a row or card opens the editor (name, duration, priority, label, notes, Day, Repeat). **Timebox** day grid (events plus placed tasks, "Schedule at" from cards). Signed out, local only. No drag and drop yet (checkpoint 4). Run it with `npm run desktop` in `desktop/`. Decisions 010, 011, 015 and 016 are proposed but built against.

## Backend
- Supabase ref `uucycebkpgwbktdytxvr`. Status on 2026-10-05: **paused or gone** (the host did not resolve). Jethro to restore from the dashboard and note the restore deadline.
- Migrations: 2 local files (sync tables, `tasks.notes`). Remote state unverified.
- Sync: never verified end to end. Known data loss paths are listed in `OPUS_PLAN_REVIEW.md` section 2.2 (V7a to V7i). Do not build new synced features on it until checkpoint 5.

## Not built
Drag and drop on desktop, label colour and the Labels page, sync of `durationMinutes`, `startTime`, `recurrence` and `recurrenceDays` (local only until migration 2), routine steps, streaks, vacation, XP, Progress, desktop Settings, Google sign in, desktop notifications, tray, installer. The Timebox tab on mobile and the mobile Plan view are not built (deferred).

## Decisions
- 001 superseded. 002, 004, 005, 006, 007 (visuals overridden by 008), 008 and 009 active. 003 partly superseded by 006.
- 010 to 018 are **proposed** (`docs/decisions/`), awaiting Jethro's confirmation. Checkpoints 1 to 3 build on 010, 011, 015 and 016.

## Build plan
`docs/OPUS_PLAN_REVIEW.md` section 5. Checkpoints 0 to 3 are done (session entries in `docs/sessions/2026-10-05-cp0.md` to `cp3.md`). Next is checkpoint 4 (drag and drop), which starts with a short spike on the drag mechanism.

## Still pending
- **Checkpoint 5 to-do (desktop thoughts are Tasks):** desktop thoughts are Tasks, so after sync they appear in the iPhone's Tasks list, while the iPhone keeps its separate Brain Dump (`BrainDumpItem` and its screens, unchanged) until a later mobile release. Legacy Brain Dump items on desktop are converted to Tasks on first save, so the same thought never lives in two places on one device.
- **Checkpoint 5 to-do (recurring tasks):** completion goes through `mobile/lib/taskActions.ts` `setTaskCompleted`, which creates the next occurrence (id `${rootId}:${nextDueDate}`). Only the desktop calls it today. When sync arrives, the iOS app MUST complete tasks through the same function, and the sync mappers must carry `recurrence` and `recurrenceDays`; otherwise a recurring task completed on the phone never creates its next occurrence.
- **`privacy.html` rewrite** is not done. It still says no data leaves the device, which is inaccurate since accounts shipped. Needs Jethro's review, then the App Store privacy answers must match.
- Supabase project restore (blocks checkpoint 5 onwards).
- Jethro's answers to the open questions in the review, section 7 (defaults apply meanwhile).

## Hazards
- The repository is **public**. Never commit `docs/seed-data/`, `.env`, personal schedules or device identifiers.
- react-native-web: `Alert.alert` and `DateTimePicker` do nothing on desktop paths.
- Never run `eas build`, `eas submit` or `eas update` unless Jethro says "ready for EAS build".
- Never touch the Landis project or its Supabase instance (`vlogfwnmaqorhialcqbr`).
