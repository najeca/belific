-- MANUAL rollback for migrations/20261007120000_task_subtasks_reminders.sql.
-- Never applied automatically. DESTRUCTIVE: subtasks and per task reminder
-- settings stored in these columns are lost on the server.
--
-- Safe for the app: the schema probe finds the columns missing, the client
-- stops sending them, and a pull keeps each device's local values (they are
-- uploaded again if the migration is re-applied, because the probe sees the
-- columns appear and queues every local row that has them).

alter table public.tasks drop column if exists subtasks;
alter table public.tasks drop column if exists reminder_minutes;
