-- Run FIRST, before applying the checkpoint 5 migrations (manual; this folder
-- is never applied automatically). Copies every synced table into a dated
-- schema in the same database. Copies keep all rows; they do not keep RLS,
-- indexes or triggers, and are not exposed through the API (the backup
-- schema is not in the exposed schemas list).
--
-- Restore one table later if needed (inside a transaction, after checking):
--   begin;
--   delete from public.tasks;
--   insert into public.tasks (select * from backup_20261006.tasks);  -- only valid BEFORE migration 2 adds columns;
--   -- after migration 2 list the original columns explicitly.
--   commit;

create schema if not exists backup_20261006;

create table backup_20261006.custom_events       as table public.custom_events;
create table backup_20261006.brain_dump_items    as table public.brain_dump_items;
create table backup_20261006.routines            as table public.routines;
create table backup_20261006.routine_completions as table public.routine_completions;
create table backup_20261006.tasks               as table public.tasks;
create table backup_20261006.projects            as table public.projects;
create table backup_20261006.custom_categories   as table public.custom_categories;

-- Nobody but the database owner should read the copies.
revoke all on schema backup_20261006 from public, anon, authenticated;
revoke all on all tables in schema backup_20261006 from public, anon, authenticated;

-- Check: the copy counts must equal the live counts.
select 'custom_events' as t, (select count(*) from public.custom_events) as live, (select count(*) from backup_20261006.custom_events) as copy
union all select 'brain_dump_items', (select count(*) from public.brain_dump_items), (select count(*) from backup_20261006.brain_dump_items)
union all select 'routines', (select count(*) from public.routines), (select count(*) from backup_20261006.routines)
union all select 'routine_completions', (select count(*) from public.routine_completions), (select count(*) from backup_20261006.routine_completions)
union all select 'tasks', (select count(*) from public.tasks), (select count(*) from backup_20261006.tasks)
union all select 'projects', (select count(*) from public.projects), (select count(*) from backup_20261006.projects)
union all select 'custom_categories', (select count(*) from public.custom_categories), (select count(*) from backup_20261006.custom_categories);
