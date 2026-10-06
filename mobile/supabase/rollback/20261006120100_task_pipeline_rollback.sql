-- MANUAL rollback for migrations/20261006120100_task_pipeline.sql. Never
-- applied automatically. DESTRUCTIVE: the durations, times, repeat settings
-- and label colours stored in these columns are lost on the server.
--
-- Safe for the app: the schema probe finds the columns missing, the client
-- stops sending them, and a pull keeps each device's local values (they are
-- uploaded again if the migration is re-applied, because the probe sees the
-- columns appear and queues every local row that has them).

alter table public.tasks drop column if exists duration_minutes;
alter table public.tasks drop column if exists start_time;
alter table public.tasks drop column if exists recurrence;
alter table public.tasks drop column if exists recurrence_days;
alter table public.tasks drop column if exists recurrence_month_day;
alter table public.projects drop column if exists color_key;
