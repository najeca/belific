-- Checkpoint 8.2, migration 3: subtasks and per task reminders (decisions 020
-- and 021). Apply AFTER 20261006120100. ADDITIVE ONLY: two nullable columns, no
-- defaults, no constraints, no drops, no data changes. Existing rows read NULL,
-- which the app loads as "no subtasks" and "default reminder".
-- Rollback (manual, never auto applied): supabase/rollback/20261007120000_task_subtasks_reminders_rollback.sql
--
-- No CHECK constraints on purpose (a batch of up to 500 rows must never fail
-- on one bad value); the client sanitises (lib/syncCore.ts sanitizeSubtasks,
-- sanitizeReminder).

-- A JSON array of { id, title, done }, at most 50 items; NULL = none.
alter table public.tasks add column if not exists subtasks jsonb;
-- NULL = default (at the start time of a placed task, or the grouped daily
-- reminder), -1 = off, 0 or more = minutes before the start time.
alter table public.tasks add column if not exists reminder_minutes integer;
