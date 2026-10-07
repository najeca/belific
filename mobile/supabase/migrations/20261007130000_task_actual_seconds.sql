-- Checkpoint 8.3, migration 4: time spent on a task, in whole seconds (decision 022).
-- Apply AFTER 20261007120000. Additive only; existing rows read NULL (no time recorded).
-- Rollback (manual): supabase/rollback/20261007130000_task_actual_seconds_rollback.sql
alter table public.tasks add column if not exists actual_seconds integer;
