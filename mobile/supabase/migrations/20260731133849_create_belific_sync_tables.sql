-- Phase B: Supabase schema for optional-account cloud backup/sync.
-- One table per synced local type (mobile/lib/types.ts). Deliberately
-- NOT synced (per the accounts grounding brief §2): TimerSettings (a
-- device preference, not "data"), notifications_enabled (per-device by
-- nature), first_launch/seed flags (device bookkeeping).
--
-- `id`/`key` columns are `text`, not the native Postgres `uuid` type —
-- existing local rows use Date.now()-based ids (see Phase A / decision
-- 003 follow-up), and a native uuid column would reject every one of
-- them on first upload. Both old-format and new-format (real UUID v4)
-- ids are just opaque strings here, forever.
--
-- Primary keys are composite (user_id, id) rather than id alone — an id
-- was only ever guaranteed unique within one device's own AsyncStorage,
-- never globally, so scoping uniqueness to the owning user avoids any
-- theoretical cross-user collision regardless of id format.
--
-- RLS: one combined policy per table (`FOR ALL`) scoping every
-- operation to the owning user — simplest form that's still fully
-- correct, no separate select/insert/update/delete policies needed.

create table public.custom_events (
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
  primary key (user_id, id)
);

create table public.brain_dump_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  title text not null,
  notes text not null default '',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  primary key (user_id, id)
);

create table public.routines (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  title text not null,
  time_of_day text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  primary key (user_id, id)
);

-- No updatedAt/deletedAt — deliberately excluded (see Phase A
-- CHANGELOG entry and the accounts plan's RoutineCompletion section).
-- Presence of a row IS the "done today" state; un-completing is a real
-- row delete, not a tombstone. Conflict resolution is "whichever
-- device's sync reaches the server last wins" — no per-row timestamp
-- needed here, so there's deliberately no updated_at column.
create table public.routine_completions (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  routine_id text not null,
  date text not null,
  completed_at timestamptz not null,
  primary key (user_id, routine_id, date)
);

create table public.tasks (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  title text not null,
  due_date text,
  priority text,
  project_key text,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null,
  origin text,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  primary key (user_id, id)
);

create table public.projects (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  name text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  primary key (user_id, key)
);

create table public.custom_categories (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  name text not null,
  icon text not null,
  color text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  primary key (user_id, key)
);

alter table public.custom_events enable row level security;
alter table public.brain_dump_items enable row level security;
alter table public.routines enable row level security;
alter table public.routine_completions enable row level security;
alter table public.tasks enable row level security;
alter table public.projects enable row level security;
alter table public.custom_categories enable row level security;

create policy "owner_full_access" on public.custom_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "owner_full_access" on public.brain_dump_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "owner_full_access" on public.routines
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "owner_full_access" on public.routine_completions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "owner_full_access" on public.tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "owner_full_access" on public.projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "owner_full_access" on public.custom_categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
