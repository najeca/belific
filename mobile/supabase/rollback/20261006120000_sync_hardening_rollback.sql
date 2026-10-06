-- MANUAL rollback for migrations/20261006120000_sync_hardening.sql. Never
-- applied automatically. Roll back migration 2 first if it was applied.
--
-- Safe for the app: without server_updated_at the client's schema probe
-- finds the column missing and falls back to full paginated pulls (see
-- docs/sessions/2026-10-06-cp5.md). Clients keep their stored cursors but
-- ignore them while the column is missing.

drop trigger if exists set_server_updated_at on public.custom_events;
drop trigger if exists set_server_updated_at on public.brain_dump_items;
drop trigger if exists set_server_updated_at on public.routines;
drop trigger if exists set_server_updated_at on public.routine_completions;
drop trigger if exists set_server_updated_at on public.tasks;
drop trigger if exists set_server_updated_at on public.projects;
drop trigger if exists set_server_updated_at on public.custom_categories;

drop function if exists public.set_server_updated_at();

drop index if exists public.custom_events_user_server_updated_at_idx;
drop index if exists public.brain_dump_items_user_server_updated_at_idx;
drop index if exists public.routines_user_server_updated_at_idx;
drop index if exists public.routine_completions_user_server_updated_at_idx;
drop index if exists public.tasks_user_server_updated_at_idx;
drop index if exists public.projects_user_server_updated_at_idx;
drop index if exists public.custom_categories_user_server_updated_at_idx;

alter table public.custom_events drop column if exists server_updated_at;
alter table public.brain_dump_items drop column if exists server_updated_at;
alter table public.routines drop column if exists server_updated_at;
alter table public.routine_completions drop column if exists server_updated_at;
alter table public.tasks drop column if exists server_updated_at;
alter table public.projects drop column if exists server_updated_at;
alter table public.custom_categories drop column if exists server_updated_at;
