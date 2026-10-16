# Belific build progress

The running record of `docs/belific-build-plan.md`. A new session can start cold from the plan and this file: read both, then `docs/CURRENT_TRUTH.md` for anything outside the plan. Add a checkpoint at the end of every phase.

Branch: `v2-redesign`. App version: 2.18.1 (phase 1 changed no user visible behaviour, so no bump).

## Where things stand

| Phase | State |
|---|---|
| 1 Data foundations | **Done 2026-10-16.** Migration 002 applied live; sync mapping, storage and timer maths in code with tests. No UI. |
| 2 Task model and timer | Not started. Next. Wait for Jethro's go. |
| 3 to 9 | Not started. |
| iOS adaptation | Not started (see "iOS adaptation" in plan section 3). |

## Decisions in force (from Jethro, 2026-10-16)

These are also written into the plan (section 0, items 1 to 11) and, where they are decisions, into `docs/decisions/`.

1. **Schema:** evolve the live tables with small additive numbered files in `mobile/supabase/belific_schema/`, in the 001 house style (text keys, composite primary keys, no foreign keys between tables, no CHECK constraints, tombstones, `server_updated_at` trigger and index, owner only row level security with `(select auth.uid())`, anon and public revoked). The earlier draft SQL (`docs/belific_schema_draft.sql`) is **withdrawn**; never apply it.
2. **Sync:** keep the outbox, the cursor on `server_updated_at` and "last to reach the server wins" (decision 013). No Realtime.
3. **Quests** are a view over the repeating series (decision 023). Quests Daily is the daily series (desktop routines became `rt_<id>` series in 2.16.0). The quest emoji is `tasks.emoji` on the series root. No third repeat system.
4. **No XP, levels or multiplier** (decision 027, which supersedes 014 and the XP parts of 008). Streaks only on recurring tasks, current and best only, never shaming (007).
5. **Order per phase:** shared logic, then desktop UI, then the iOS adaptation.
6. **Trash** shows the last 30 days. Retention stays as the repo defines it: 90 days for ordinary tombstones, 400 for skipped days of repeating tasks.
7. **Recurrence:** unknown repeat rules are kept, never wiped, on upload (done). **Annual is phase 4**; Jethro updates both devices before creating any annual task.
8. **`actual_minutes`** is nullable, NULL means 0, everywhere (totals, analytics).
9. **Emoji (phase 2 onward):** native system emoji wherever a natural one exists (tabs, lists, labels, quests, section headings, empty states, settings rows). Ionicons only for chevrons, close, check, drag handle, play and pause.
10. **Keyboard:** Tab is for focus. **V** toggles Calendar and Kanban. Checked at phase 1: no existing V shortcut (the desktop panes only handle Escape; the menu has Ctrl+, and Ctrl+Q); check again when the registry is built. Single letter shortcuts never fire while a text field has focus (use `isTextEntryTarget`, `mobile/lib/editable.ts`).
11. **Lists are desktop only** until the iOS adaptation moves the iPhone's Brain Dump from `brain_dump_items` to tasks.

Working rules (from Jethro): one phase at a time; no new libraries without justifying them first; show every migration and wait for approval before it is applied; typecheck and tests after each phase; one commit per phase; ask rather than guess.

## Checkpoint: phase 1, data foundations (2026-10-16)

**Migration 002** (`mobile/supabase/belific_schema/002_lists_settings_timer.sql`, rollback beside it). Applied by Jethro on 2026-10-16 through the Supabase migration tool on the shared "belific landis proload" project (`vlogfwnmaqorhialcqbr`), recorded as `belific_lists_settings_timer`, version `20261016153525`. His checks passed: the five columns present; `lists` and `user_settings` with row level security and one owner policy each; no anon or public grants; row counts unchanged (36 tasks, 10 projects).
- `tasks`: `actual_minutes integer` (NULL = 0), `timer_started_at timestamptz`, `list_key text`, `emoji text`. All nullable, no default.
- `projects` (labels): `emoji text`.
- `lists`: key, name, emoji, sort_order, created_at, updated_at, deleted_at, server_updated_at; primary key (user_id, key).
- `user_settings`: key, value (text), updated_at, deleted_at, server_updated_at; primary key (user_id, key). For settings that follow the person (feature toggles in phase 7). UI state stays local.
- Not added: `created_at` (tasks already had it), emoji on `routines` (series roots carry it), XP tables, time entries, foreign keys, CHECK constraints, uuid ids, Realtime.

**Brain Dump mapping:** a task with no `dueDate` and no `listKey` is in Brain Dump. The legacy `brain_dump_items` table stays as it is: the desktop converts those rows to tasks on first save, and the iPhone still uses it until the iOS adaptation.

**Code** (all in `mobile/lib/` unless noted):
- `types.ts`: `Task.actualMinutes`, `timerStartedAt`, `listKey`, `emoji`; `Project.emoji`; new `TaskList` and `UserSetting`.
- `syncCore.ts`: tables `lists` and `user_settings`; capability `planner`; `tableReady` (the two tables are skipped by pull and push until the server has them, and their rows wait in the outbox); `TASK_PLANNER_FIELDS` and `PROJECT_PLANNER_FIELDS` kept locally on pull until then; `hasPlannerValues`; mappers and sanitisers for every new value (bad values become null or the default, so a batch never fails); `sanitizeRecurrence` keeps an unknown repeat rule (lowercase letters and underscores, up to 32 characters) instead of wiping it.
- `syncEngine.ts`: skips tables that are not ready; when `planner` first appears, queues every local task or label that holds the new values.
- `syncServer.ts`: probes `tasks.actual_minutes`, `projects.emoji`, `lists.sort_order`, `user_settings.value`; a missing table (`42P01`, `PGRST205`) counts as "not migrated", like a missing column.
- `storage.ts`: `loadLists`, `putList`, `deleteList` (tombstone), `loadUserSetting`, `setUserSetting`; both new keys in `clearAllData`, with their cursors. `accountSwitch.ts` counts them as user data. `sync.ts` loads and saves them.
- `taskTimer.ts` (new): `startTimer` (a second start keeps the first), `stopTimer` (adds whole elapsed minutes, rounded down, and clears the timer; more than 24 hours returns `confirm` so the UI asks what to add), `stopTimerWith`, `shownMinutes` (total plus running time), `setActualMinutes` (hand entry), `elapsedMinutes` (a start in the future counts 0). Totals are capped at a year of minutes.
- `mobile/supabase/functions/delete-account/core.ts`: deletes from 9 tables (adds `lists`, `user_settings`). **Not deployed** (see below).

**Tests:** typecheck clean; 494 tests pass. New: `taskTimer.test.ts`; 002 mapper, sanitiser, gating and unknown rule tests in `syncCore.test.ts`; two engine tests in `syncEngine.test.ts` (a server without 002: nothing sent or pulled, values kept locally, uploaded when 002 appears, then seen by a second device; a timer stopped on one device stops on the other; a deleted list is a tombstone everywhere); a probe test for missing tables in `schemaProfile.test.ts`; static checks of the 002 file and its rollback in `belificSchemaSql.test.ts`; the delete-account table list checked against every numbered schema file.

**Not verified:** nothing has run between two real devices against the live project. No UI uses the new fields yet, so the first real check is phase 2 (start a timer on Windows, see it on a second signed in desktop or the phone build). iOS: nothing to adapt in phase 1 (no UI); the shared code is on the iPhone path and is covered by the same tests.

**delete-account:** the repo version now covers 9 tables, but the function has never been deployed to the shared project, and `docs/CURRENT_TRUTH.md` (Still pending) blocks deploying it until Jethro decides Apple's account deletion expectation for a login shared with Landis and Proload. Until it is deployed, the in app "delete account" on the new builds has no function to call on the shared project. The header comment in 002 that says "deploy again" is wrong and left as applied.

**Hazard added:** never run `supabase db push` or `migration repair` against the shared project (its history holds 002 with no file in `mobile/supabase/migrations/`, and that folder holds five old project files that create tables in `public`).

**Open for later phases:**
- Phase 4: whether triweekly series get their own Quests section or join Biweekly (they must be shown either way).
- Phase 4: annual needs a month as well as a day. `recurrence_month_day` exists; a month column (or deriving the month from the series start day) is a phase 4 decision, and a column would be migration 003.
- `docs/belific_schema_draft.sql` is withdrawn and left uncommitted; delete it or keep it out of the repo.

## Next session

Phase 2 (task model and timer), after Jethro's go. Read the plan's phase 2 and section 0 items 8 to 10 first. The timer UI calls `lib/taskTimer.ts`; totals use `shownMinutes` and treat NULL as 0; lists use `loadLists` and `putList`.
