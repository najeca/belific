# Belific schema files: ALREADY APPLIED LIVE, DO NOT RUN

> **`001_belific_schema.sql` has already been applied to the shared project (`vlogfwnmaqorhialcqbr`) by Jethro (2026-10-15: 7 tables, owner only row level security, `belific` exposed under Data API). Do not run it again, and do not run the rollback: it drops the schema and every row in it.** Kept as the record of what was applied and for a rebuild after a restore. Any future change goes in a new numbered file, reviewed first. (State per Jethro; not checked by Claude, who has no live access.)

`001_belific_schema.sql` builds the seven Belific tables, the `server_updated_at`
trigger and indexes, row level security and the grants, all inside the
`belific` schema. `001_belific_schema_rollback.sql` drops the schema.

These live here, not in `../migrations/`, on purpose:

- `../migrations/` holds the old project's history and creates tables in
  `public`. On the shared project `public` belongs to Landis, so those files
  must never be run there. A `supabase db push` would run them.
- Nothing here is applied by a tool. The first file was applied by hand in the
  SQL editor. A future file is applied the same way, after a backup and
  Jethro's go.

`lib/belificSchemaSql.test.ts` checks the file against the tables the sync
code and the delete-account function use.
