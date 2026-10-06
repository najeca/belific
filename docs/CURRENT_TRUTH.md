# Belific: current truth

Update this at every session close. It replaces `current-state-audit.md` and `architecture.md` (both historical, July 2026) in the session protocol.

Last verified: 2026-10-06 against branch `v2-redesign`.

## Shipped
- **iOS 2.1.0** (per Jethro, live on the App Store): Today, Brain Dump and Calendar tabs; Tasks and Settings as pushed screens; local notifications; optional Sign in with Apple plus Supabase sync (7 tables).
- **Desktop (app version 2.8.1, checkpoints 0 to 4.1 plus the 2b and 2c corrections)**: an Electron shell in `desktop/` loads the Expo web export over `app://`, stores data as files in the main process with a daily backup (newest 14), and shows three real panes. **Brain Dump**: the thing you capture IS the task (Enter creates a Task); the pane lists incomplete tasks with no Day plus any legacy Brain Dump items (converted on first save), with a collapsed "Done today". **Week board**: forward-only, days only (no Unscheduled column); clicking a row or card opens the editor (name, duration, priority, label, notes, Day, Repeat). **Timebox** day grid (events plus placed tasks, "Schedule at" from cards, faint half hour lines). **Drag and drop** (checkpoint 4, pointer events, decision 019): rows to days or Timebox slots, cards between days, cards and blocks back to the left pane, block move and resize in 30 minute steps, edge dwell week change, Escape cancels. **Label colours** (8 palette colours, tint plus edge on cards and blocks, a dot on rows; `colorKey` local only) and **custom durations** (30m, 1h, 2h, or Custom up to 24h). Signed out, local only. Desktop UI lives in `mobile/components/desktop/` behind `DesktopEntry.web.tsx`; none of it is in the iOS bundle. Run it with `npm run desktop` in `desktop/`. Decisions 010, 011, 015, 016 and 019 are proposed but built against.

## Backend
- Supabase ref `uucycebkpgwbktdytxvr`. Status on 2026-10-05: **paused or gone** (the host did not resolve). Jethro to restore from the dashboard and note the restore deadline.
- Migrations: 2 local files (sync tables, `tasks.notes`). Remote state unverified.
- Sync: never verified end to end. Known data loss paths are listed in `OPUS_PLAN_REVIEW.md` section 2.2 (V7a to V7i). Do not build new synced features on it until checkpoint 5.

## Not built
The Labels page (label colours exist on desktop, local only), sync of `colorKey`, `durationMinutes`, `startTime`, `recurrence` and `recurrenceDays` (local only until migration 2), routine steps, streaks, vacation, XP, Progress, desktop Settings, Google sign in, desktop notifications, tray, installer. The Timebox tab on mobile and the mobile Plan view are not built (deferred).

## Decisions
- 001 superseded. 002, 004, 005, 006, 007 (visuals overridden by 008), 008 and 009 active. 003 partly superseded by 006.
- 010 to 019 are **proposed** (`docs/decisions/`), awaiting Jethro's confirmation. Checkpoints 1 to 4 build on 010, 011, 015, 016 and 019.

## Build plan
`docs/OPUS_PLAN_REVIEW.md` section 5. Checkpoints 0 to 4 are done (session entries in `docs/sessions/2026-10-05-cp0.md` to `cp3.md` and `2026-10-06-cp4.md`). Next is checkpoint 5 (sync hardening), which is blocked on the Supabase restore.

## Still pending
- **Checkpoint 5 to-do (desktop thoughts are Tasks):** desktop thoughts are Tasks, so after sync they appear in the iPhone's Tasks list, while the iPhone keeps its separate Brain Dump (`BrainDumpItem` and its screens, unchanged) until a later mobile release. Legacy Brain Dump items on desktop are converted to Tasks on first save, so the same thought never lives in two places on one device.
- **Checkpoint 5 to-do (recurring tasks):** completion goes through `mobile/lib/taskActions.ts` `setTaskCompleted`, which creates the next occurrence (id `${rootId}:${nextDueDate}`). Only the desktop calls it today. When sync arrives, the iOS app MUST complete tasks through the same function, and the sync mappers must carry `recurrence` and `recurrenceDays`; otherwise a recurring task completed on the phone never creates its next occurrence.
- **Checkpoint 5 to-do (local only fields):** `Project.colorKey` and the Task fields above are not in the sync mappers. A pull that replaces a local row with the server copy (`projectFromRemote`, `taskFromRemote` rebuild the object) would drop them, so checkpoint 5 must add the columns and merge local only fields on pull.
- **`privacy.html` rewrite** is not done. It still says no data leaves the device, which is inaccurate since accounts shipped. Needs Jethro's review, then the App Store privacy answers must match.
- Supabase project restore (blocks checkpoint 5 onwards).
- Jethro's answers to the open questions in the review, section 7 (defaults apply meanwhile).

## Hazards
- The repository is **public**. Never commit `docs/seed-data/`, `.env`, personal schedules or device identifiers.
- react-native-web: `Alert.alert` and `DateTimePicker` do nothing on desktop paths.
- Never run `eas build`, `eas submit` or `eas update` unless Jethro says "ready for EAS build".
- Never touch the Landis project or its Supabase instance (`vlogfwnmaqorhialcqbr`).
