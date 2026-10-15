-- Belific tables in the "belific" schema of the shared Belific Landis Proload
-- project. WRITTEN, NOT APPLIED. Apply by hand after a backup and Jethro's go.
--
-- This file consolidates, for the belific schema only, everything the five
-- files in ../migrations/ built in the old project's public schema:
--   20260731133849 create tables + RLS     20260801004209 tasks.notes
--   20261006120000 server_updated_at       20261006120100 task pipeline, color_key
--   20261007120000 subtasks, reminder_minutes
-- Those old files stay as history and MUST NOT be run on the shared project:
-- they create tables in public, which belongs to Landis. This file touches
-- nothing outside the belific schema (it does not create, alter or grant
-- anything in public, auth or storage).
--
-- Rollback: 001_belific_schema_rollback.sql (drops the schema and all Belific
-- data in it, so take a backup first).
--
-- After applying, in the dashboard: Data API > Exposed schemas, add "belific".
-- Without that every request fails with PGRST106 (invalid schema).
--
-- Notes
--  * id / key columns are text on purpose (old local ids are Date.now() based).
--  * Primary keys are (user_id, id) or (user_id, key), see the old file.
--  * deleted_at is the tombstone: a deleted row is kept, marked, and synced.
--  * No CHECK constraints on purpose (a 500 row batch must never fail on one
--    bad value; the client sanitises).
--  * Row level security on every table: user_id = auth.uid(). It is written as
--    (select auth.uid()), which is the same test evaluated once per statement.
--  * Grants: usage on the schema and table privileges to authenticated only.
--    Nothing to anon. service_role and the postgres role are not granted here
--    (the delete-account function uses the caller's own JWT and RLS).

begin;

create schema if not exists belific;

-- Nobody but authenticated gets in. (public is the pseudo role "everyone".)
revoke all on schema belific from public;
revoke all on schema belific from anon;
grant usage on schema belific to authenticated;

-- Anything created here later must not silently reach anon either.
alter default privileges in schema belific revoke all on tables from anon;
alter default privileges in schema belific revoke all on functions from anon;

-- Stamps every insert and update with the database clock, so clients pull
-- "what changed since my cursor" by the server's time, never a device clock.
create or replace function belific.set_server_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.server_updated_at := now();
  return new;
end;
$$;
revoke all on function belific.set_server_updated_at() from public;

create table belific.custom_events (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  title text not null,
  category text not null,
  icon text not null,
  start text not null,
  "end" text not null,
  notes text not null default '',
  date text not null,
  recurrence text,
  series_id text,
  recurrence_days text[],
  priority text,
  origin text,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table belific.brain_dump_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  title text not null,
  notes text not null default '',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table belific.routines (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  title text not null,
  time_of_day text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- No updated_at / deleted_at on purpose: the row IS the "done today" state and
-- un-completing is a real delete. The client pulls this small table in full.
create table belific.routine_completions (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  routine_id text not null,
  date text not null,
  completed_at timestamptz not null,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, routine_id, date)
);

create table belific.tasks (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  title text not null,
  due_date text,
  priority text,
  project_key text,
  notes text,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null,
  origin text,
  -- task pipeline (decisions 015, 016)
  duration_minutes integer,        -- 1 to 1440 when set
  start_time text,                 -- 'HH:mm' when placed on the Timebox
  recurrence text,                 -- daily | weekly | biweekly | triweekly | monthly
  recurrence_days text[],          -- 'Mon' ... 'Sun'
  recurrence_month_day integer,    -- 1 to 31, monthly only
  -- subtasks and reminders (decisions 020, 021)
  subtasks jsonb,                  -- [{ id, title, done }], at most 50; NULL = none
  reminder_minutes integer,        -- NULL default, -1 off, 0+ minutes before start
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table belific.projects (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  name text not null,
  color_key text,                  -- a label palette key, not a hex colour
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create table belific.custom_categories (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  name text not null,
  icon text not null,
  color text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- server_updated_at trigger and the incremental pull index, per table.
create trigger set_server_updated_at before insert or update on belific.custom_events
  for each row execute function belific.set_server_updated_at();
create index custom_events_user_server_updated_at_idx on belific.custom_events (user_id, server_updated_at);

create trigger set_server_updated_at before insert or update on belific.brain_dump_items
  for each row execute function belific.set_server_updated_at();
create index brain_dump_items_user_server_updated_at_idx on belific.brain_dump_items (user_id, server_updated_at);

create trigger set_server_updated_at before insert or update on belific.routines
  for each row execute function belific.set_server_updated_at();
create index routines_user_server_updated_at_idx on belific.routines (user_id, server_updated_at);

create trigger set_server_updated_at before insert or update on belific.routine_completions
  for each row execute function belific.set_server_updated_at();
create index routine_completions_user_server_updated_at_idx on belific.routine_completions (user_id, server_updated_at);

create trigger set_server_updated_at before insert or update on belific.tasks
  for each row execute function belific.set_server_updated_at();
create index tasks_user_server_updated_at_idx on belific.tasks (user_id, server_updated_at);

create trigger set_server_updated_at before insert or update on belific.projects
  for each row execute function belific.set_server_updated_at();
create index projects_user_server_updated_at_idx on belific.projects (user_id, server_updated_at);

create trigger set_server_updated_at before insert or update on belific.custom_categories
  for each row execute function belific.set_server_updated_at();
create index custom_categories_user_server_updated_at_idx on belific.custom_categories (user_id, server_updated_at);

-- Row level security: every table, one policy, authenticated only.
alter table belific.custom_events enable row level security;
alter table belific.brain_dump_items enable row level security;
alter table belific.routines enable row level security;
alter table belific.routine_completions enable row level security;
alter table belific.tasks enable row level security;
alter table belific.projects enable row level security;
alter table belific.custom_categories enable row level security;

create policy "owner_full_access" on belific.custom_events
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner_full_access" on belific.brain_dump_items
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner_full_access" on belific.routines
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner_full_access" on belific.routine_completions
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner_full_access" on belific.tasks
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner_full_access" on belific.projects
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner_full_access" on belific.custom_categories
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Table privileges: authenticated only. Explicit revoke from anon and public
-- first, so nothing inherited survives.
revoke all on all tables in schema belific from public;
revoke all on all tables in schema belific from anon;
grant select, insert, update, delete on all tables in schema belific to authenticated;

commit;
