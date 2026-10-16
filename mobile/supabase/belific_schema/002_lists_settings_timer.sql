-- Belific migration 002 (build plan phase 1): task lists, user settings, the
-- task timer and emoji. WRITTEN, NOT APPLIED. Apply by hand in the SQL editor
-- of the shared project after a backup and Jethro's go, AFTER 001 (already
-- live). Additive only: it adds four nullable columns to tasks, one to
-- projects, and two new tables. It touches nothing outside the belific schema.
--
-- Rollback: 002_lists_settings_timer_rollback.sql (drops the two tables and the
-- five columns with their data, so take a backup first).
--
-- Clients from before this migration keep working: they never send the new
-- columns (an upsert only changes the columns it names) and never ask for the
-- new tables. Clients from after it probe for the columns and tables and wait
-- until they exist (syncServer.ts probe, Caps.planner).
--
-- After applying: deploy the delete-account function again (it now also
-- deletes from lists and user_settings, and fails on a table that is missing).
--
-- Same conventions as 001:
--  * text keys, primary key (user_id, key), no foreign keys between tables;
--  * no CHECK constraints and no NOT NULL on the new task columns (a 500 row
--    batch must never fail on one bad value; the client sanitises);
--  * deleted_at tombstones, the server_updated_at trigger and pull index;
--  * owner only row level security as (select auth.uid()), authenticated only.

begin;

-- Tasks: time actually spent, a running timer, the list it belongs to, an emoji.
alter table belific.tasks
  add column actual_minutes integer,           -- whole minutes, 0 or more; NULL = 0
  add column timer_started_at timestamptz,     -- set while the timer runs, NULL when stopped
  add column list_key text,                    -- a belific.lists key; NULL with due_date NULL = Brain Dump
  add column emoji text;                       -- one emoji (a series root carries it for Quests)

-- Labels: an emoji beside the colour.
alter table belific.projects
  add column emoji text;

create table belific.lists (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  name text not null,
  emoji text,
  sort_order integer not null default 0,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- Settings that follow the person across devices (feature toggles). The value
-- is text; the client parses and sanitises it. UI state stays local.
create table belific.user_settings (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  value text not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create trigger set_server_updated_at before insert or update on belific.lists
  for each row execute function belific.set_server_updated_at();
create index lists_user_server_updated_at_idx on belific.lists (user_id, server_updated_at);

create trigger set_server_updated_at before insert or update on belific.user_settings
  for each row execute function belific.set_server_updated_at();
create index user_settings_user_server_updated_at_idx on belific.user_settings (user_id, server_updated_at);

alter table belific.lists enable row level security;
alter table belific.user_settings enable row level security;

create policy "owner_full_access" on belific.lists
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner_full_access" on belific.user_settings
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Table privileges: authenticated only. The default privileges from 001
-- already keep anon out; the revokes make it explicit for these two tables.
revoke all on belific.lists, belific.user_settings from public;
revoke all on belific.lists, belific.user_settings from anon;
grant select, insert, update, delete on belific.lists, belific.user_settings to authenticated;

commit;
