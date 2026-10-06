-- Checkpoint 5, migration 2 of 2: the desktop task pipeline fields and the
-- label colour (decisions 015 and 016). Apply AFTER 20261006120000.
-- ADDITIVE ONLY: nullable columns, no defaults, no constraints, no drops, no
-- data changes. Every existing row reads NULL, which the app loads exactly as
-- "not set" (the same as before the columns existed).
-- Rollback (manual, never auto applied): supabase/rollback/20261006120100_task_pipeline_rollback.sql
--
-- No CHECK constraints on purpose: the client uploads in batches of up to 500
-- rows, and one out-of-range value would fail the whole batch and stall sync
-- for every row behind it. The client sanitises instead (lib/syncCore.ts
-- sanitize*: an invalid value is sent as NULL).
--
-- Older iPhone builds (2.1.0) never send these columns; supabase-js upserts
-- only update the columns they send, so their edits leave these values alone.

-- Minutes, 1 to 1440 when set; NULL means "no duration" (a normal choice).
alter table public.tasks add column if not exists duration_minutes integer;
-- 'HH:mm' when the task is placed on the Timebox; NULL when it is not.
alter table public.tasks add column if not exists start_time text;
-- 'daily' | 'weekly' | 'biweekly' | 'triweekly' | 'monthly'; NULL = no repeat.
alter table public.tasks add column if not exists recurrence text;
-- Weekday names ('Mon' ... 'Sun') for weekly and every 2 weeks.
alter table public.tasks add column if not exists recurrence_days text[];
-- 1 to 31, monthly only.
alter table public.tasks add column if not exists recurrence_month_day integer;

-- A label palette key (mobile/lib/labelColors.ts), not a hex colour. Named
-- color_key rather than color so it is not confused with
-- custom_categories.color, which does hold a hex value.
alter table public.projects add column if not exists color_key text;
