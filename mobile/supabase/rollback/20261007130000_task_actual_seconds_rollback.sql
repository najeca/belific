-- MANUAL rollback for migrations/20261007130000_task_actual_seconds.sql.
-- Never applied automatically. DESTRUCTIVE: recorded Actual times stored in this
-- column are lost on the server. Safe for the app: the probe finds the column
-- missing, the client stops sending it and each device keeps its local values
-- (queued again if the migration is re-applied).

alter table public.tasks drop column if exists actual_seconds;
