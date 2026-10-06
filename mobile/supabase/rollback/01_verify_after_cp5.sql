-- Read-only checks to run BEFORE (counts) and AFTER applying the checkpoint 5
-- migrations (manual; never applied automatically). Nothing here writes.

-- 1. Row counts per table (run before and after; they must be identical).
select 'custom_events' as t, count(*) from public.custom_events
union all select 'brain_dump_items', count(*) from public.brain_dump_items
union all select 'routines', count(*) from public.routines
union all select 'routine_completions', count(*) from public.routine_completions
union all select 'tasks', count(*) from public.tasks
union all select 'projects', count(*) from public.projects
union all select 'custom_categories', count(*) from public.custom_categories;

-- 2. RLS still enabled on all 7 (expect 7 rows, all true).
select c.relname, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('custom_events','brain_dump_items','routines','routine_completions','tasks','projects','custom_categories')
order by c.relname;

-- 3. The owner policy is still there on all 7 (expect 7 rows).
select tablename, policyname, cmd from pg_policies
where schemaname = 'public' and policyname = 'owner_full_access'
order by tablename;

-- 4. Triggers exist and are enabled (expect 7 rows, tgenabled = 'O').
select tgrelid::regclass as table_name, tgname, tgenabled
from pg_trigger where tgname = 'set_server_updated_at' and not tgisinternal
order by 1;

-- 5. server_updated_at present, NOT NULL, on all 7 (expect 7 rows).
select table_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and column_name = 'server_updated_at'
order by table_name;

-- 6. Cursor indexes exist (expect 7 rows).
select tablename, indexname from pg_indexes
where schemaname = 'public' and indexname like '%_user_server_updated_at_idx'
order by tablename;

-- 7. New columns present with the right types (expect 6 rows).
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'tasks' and column_name in ('duration_minutes','start_time','recurrence','recurrence_days','recurrence_month_day'))
    or (table_name = 'projects' and column_name = 'color_key'))
order by table_name, column_name;

-- 8. New columns are NULL on every existing row (expect all zeros right
--    after applying; they fill in only as clients sync).
select
  count(*) filter (where duration_minutes is not null) as duration_set,
  count(*) filter (where start_time is not null) as start_set,
  count(*) filter (where recurrence is not null) as recurrence_set,
  count(*) filter (where recurrence_days is not null) as days_set,
  count(*) filter (where recurrence_month_day is not null) as month_day_set
from public.tasks;
select count(*) filter (where color_key is not null) as color_set from public.projects;

-- 9. The trigger works (inside a transaction that is rolled back: nothing is
--    kept). Pick any existing task id of the user.
-- begin;
--   select server_updated_at from public.tasks where id = '<task id>';
--   update public.tasks set title = title where id = '<task id>';
--   select server_updated_at from public.tasks where id = '<task id>';  -- now later
-- rollback;

-- 10. Function search_path is pinned (expect search_path="").
select proname, proconfig from pg_proc where proname = 'set_server_updated_at';
