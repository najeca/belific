# Belific: current truth

Update this at every session close. It replaces `current-state-audit.md` and `architecture.md` (both historical, July 2026) in the session protocol.

Last verified: 2026-10-05 against branch `v2-redesign`.

## Shipped
- **iOS 2.1.0** (per Jethro, live on the App Store): Today, Brain Dump and Calendar tabs; Tasks and Settings as pushed screens; local notifications; optional Sign in with Apple plus Supabase sync (7 tables).
- **Desktop**: Expo web shell with placeholder panes only until the checkpoints in `OPUS_PLAN_REVIEW.md` section 5 land. Electron is decision 010 (proposed).

## Backend
- Supabase ref `uucycebkpgwbktdytxvr`. Status on 2026-10-05: **paused or gone** (the host did not resolve). Jethro to restore from the dashboard and note the restore deadline.
- Migrations: 2 local files (sync tables, `tasks.notes`). Remote state unverified.
- Sync: never verified end to end. Known data loss paths are listed in `OPUS_PLAN_REVIEW.md` section 2.2 (V7a to V7i). Do not build new synced features on it until checkpoint 5.

## Not built
Timebox, kanban, task `durationMinutes` and `startTime`, label colour, routine steps, streaks, vacation, XP, Progress, desktop Settings, Google sign in, desktop notifications. The mobile Plan view is deferred.

## Decisions
- 001 superseded. 002, 004, 005, 006, 007 (visuals overridden by 008), 008 and 009 active. 003 partly superseded by 006.
- 010 to 018 are **proposed** (`docs/decisions/`), awaiting Jethro's confirmation. Checkpoints 1 to 3 build on 010, 011, 015 and 016.

## Build plan
`docs/OPUS_PLAN_REVIEW.md` section 5. Checkpoints 0 to 3 are being done in one run; checkpoint 4 (drag and drop) starts after that.

## Still pending
- **`privacy.html` rewrite** is not done. It still says no data leaves the device, which is inaccurate since accounts shipped. Needs Jethro's review, then the App Store privacy answers must match.
- Supabase project restore (blocks checkpoint 5 onwards).
- Jethro's answers to the open questions in the review, section 7 (defaults apply meanwhile).

## Hazards
- The repository is **public**. Never commit `docs/seed-data/`, `.env`, personal schedules or device identifiers.
- react-native-web: `Alert.alert` and `DateTimePicker` do nothing on desktop paths.
- Never run `eas build`, `eas submit` or `eas update` unless Jethro says "ready for EAS build".
- Never touch the Landis project or its Supabase instance (`vlogfwnmaqorhialcqbr`).
