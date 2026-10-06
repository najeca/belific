-- Checkpoint 5, migration 1 of 2: sync hardening (decision 013 item 3).
-- ADDITIVE ONLY: one new column, one trigger function, one trigger and one
-- index per synced table. No drops, no type changes, no data rewrites.
-- Rollback (manual, never auto applied): supabase/rollback/20261006120000_sync_hardening_rollback.sql
--
-- server_updated_at is set by the database on every insert and update, so
-- clients pull "what changed since my cursor" by the server's clock, never a
-- device clock. Clients that predate it (iOS 2.1.0) ignore the extra column
-- in select('*') and never send it; the trigger stamps their writes too.
--
-- Adding a column with a constant-per-statement default (now()) is a
-- metadata change on Postgres 11 and later: existing rows read the
-- migration time without a table rewrite. `create or replace trigger` needs
-- Postgres 14 or later (Supabase runs 15+) and keeps the file free of drops.

create or replace function public.set_server_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.server_updated_at := now();
  return new;
end;
$$;

-- custom_events
alter table public.custom_events add column if not exists server_updated_at timestamptz not null default now();
create or replace trigger set_server_updated_at before insert or update on public.custom_events
  for each row execute function public.set_server_updated_at();
create index if not exists custom_events_user_server_updated_at_idx
  on public.custom_events (user_id, server_updated_at);

-- brain_dump_items
alter table public.brain_dump_items add column if not exists server_updated_at timestamptz not null default now();
create or replace trigger set_server_updated_at before insert or update on public.brain_dump_items
  for each row execute function public.set_server_updated_at();
create index if not exists brain_dump_items_user_server_updated_at_idx
  on public.brain_dump_items (user_id, server_updated_at);

-- routines
alter table public.routines add column if not exists server_updated_at timestamptz not null default now();
create or replace trigger set_server_updated_at before insert or update on public.routines
  for each row execute function public.set_server_updated_at();
create index if not exists routines_user_server_updated_at_idx
  on public.routines (user_id, server_updated_at);

-- routine_completions (still hard deleted; the column is for diagnostics and
-- future use, the client pulls this small table in full)
alter table public.routine_completions add column if not exists server_updated_at timestamptz not null default now();
create or replace trigger set_server_updated_at before insert or update on public.routine_completions
  for each row execute function public.set_server_updated_at();
create index if not exists routine_completions_user_server_updated_at_idx
  on public.routine_completions (user_id, server_updated_at);

-- tasks
alter table public.tasks add column if not exists server_updated_at timestamptz not null default now();
create or replace trigger set_server_updated_at before insert or update on public.tasks
  for each row execute function public.set_server_updated_at();
create index if not exists tasks_user_server_updated_at_idx
  on public.tasks (user_id, server_updated_at);

-- projects
alter table public.projects add column if not exists server_updated_at timestamptz not null default now();
create or replace trigger set_server_updated_at before insert or update on public.projects
  for each row execute function public.set_server_updated_at();
create index if not exists projects_user_server_updated_at_idx
  on public.projects (user_id, server_updated_at);

-- custom_categories
alter table public.custom_categories add column if not exists server_updated_at timestamptz not null default now();
create or replace trigger set_server_updated_at before insert or update on public.custom_categories
  for each row execute function public.set_server_updated_at();
create index if not exists custom_categories_user_server_updated_at_idx
  on public.custom_categories (user_id, server_updated_at);
