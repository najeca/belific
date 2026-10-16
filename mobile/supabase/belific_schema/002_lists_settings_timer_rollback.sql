-- MANUAL rollback for 002_lists_settings_timer.sql. Never applied automatically.
-- DESTRUCTIVE: drops the lists and user_settings tables and the five columns
-- 002 added, with their data (lists, settings, actual time, running timers,
-- list membership, emoji). Take a backup first. It touches nothing outside the
-- belific schema and leaves everything 001 created as it was.
--
-- Clients keep working afterwards: their probe reports the columns and tables
-- missing and they stop sending them (local values are kept on the device).

begin;
drop table if exists belific.user_settings;
drop table if exists belific.lists;
alter table belific.projects drop column if exists emoji;
alter table belific.tasks
  drop column if exists emoji,
  drop column if exists list_key,
  drop column if exists timer_started_at,
  drop column if exists actual_minutes;
commit;
