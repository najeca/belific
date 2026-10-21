# Belific schema files: ALREADY APPLIED LIVE, DO NOT RUN

> **001 and 002 are applied to the shared project (`vlogfwnmaqorhialcqbr`, "belific landis proload"). Do not run either again, and do not run a rollback: they delete data.** 003 is written and waits for Jethro's review and apply. Kept as the record of what was applied and for a rebuild after a restore. Any future change goes in a new numbered file (003, ...), reviewed first. (State per Jethro; not checked by Claude, who has no live access.)

| File | Applied | How | What it does |
|---|---|---|---|
| `001_belific_schema.sql` | 2026-10-15 | By hand in the SQL editor | The seven tables, `server_updated_at` trigger and indexes, row level security, grants. `belific` exposed under Data API. |
| `002_lists_settings_timer.sql` | 2026-10-16 | Through the Supabase migration tool, recorded in the project's migration history as `belific_lists_settings_timer`, version `20261016153525` | Adds `tasks.actual_minutes`, `tasks.timer_started_at`, `tasks.list_key`, `tasks.emoji`, `projects.emoji`, and the tables `lists` and `user_settings` (owner only row level security, authenticated only). |
| `003_calendar_feed_grants.sql` | **NOT APPLIED** (written 2026-10-17, for Jethro's review) | To be applied by Jethro like 002 (migration tool or SQL editor), never `db push` | One grant: `select on belific.user_settings to service_role`, so the Edge Function `belific-calendar-feed` can find the owner of a feed token. Jethro's check on 2026-10-17: service_role already had schema usage and select on `tasks`, not on `user_settings`. Steps: `docs/CALENDAR_FEED_DEPLOY.md`. |
| `004_part_b.sql` | **NOT APPLIED. DO NOT RUN.** (written 2026-10-20, for Jethro's review) | To be applied by Jethro only, after a backup and his go, like 002 (migration tool or SQL editor), never `db push` | Additive: `tasks.cuts_below boolean`, `tasks.reminders jsonb` (Part B) and `tasks.extra_times jsonb`, `tasks.times_done jsonb` (Part C, amended 2026-10-21 while still unapplied), all nullable, no default. Rollback is a commented section at the end of the file (it drops all four columns and their data). Until it is applied the app keeps the values on the device and sends none of them (`Caps.partB` and `Caps.partC`, probed separately). |

Post apply checks for 002 (Jethro, 2026-10-16): the five columns are present; `lists` and `user_settings` have row level security on with one owner policy each; no anon or public grants; row counts unchanged (36 tasks, 10 projects).

The header comment of `002_lists_settings_timer.sql` says to deploy delete-account "again" after applying. That is wrong: the function has never been deployed to the shared project. See "delete-account" in `docs/CURRENT_TRUTH.md`. The file is left as it was applied.

Rollbacks: `001_belific_schema_rollback.sql` drops the whole schema and every Belific row. `002_lists_settings_timer_rollback.sql` drops the two 002 tables and the five 002 columns with their data. Neither is ever run without a backup and Jethro's go.

These live here, not in `../migrations/`, on purpose:

- `../migrations/` holds the old project's history and creates tables in
  `public`. On the shared project `public` belongs to Landis, so those files
  must never be run there.
- **Never run `supabase db push` (or `migration repair`) against the shared
  project.** Its migration history now holds `20261016153525
  belific_lists_settings_timer`, which has no file in `../migrations/`, and
  `../migrations/` holds five old project files the shared history has never
  seen. A push would try to run those five against `public`.
- A future file is applied the same way as 002 or 001, after a backup and
  Jethro's go, and recorded in the table above.

`lib/belificSchemaSql.test.ts` checks both files against the tables and
columns the sync code and the delete-account function use, and checks the
house rules (belific only, row level security, no CHECK constraints, no foreign
keys between tables, no uuid ids, no Realtime).
