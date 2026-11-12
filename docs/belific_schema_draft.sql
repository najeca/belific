/*
  Belific schema, DRAFT v2 (adds recurring Quests). Not applied to any project.
  Designed from Belific's own flow: Brain Dump -> Task detail -> Plan (day) -> Timebox (hour).
  One schema per app, so everything lives in "belific".
  Before running: check it against the tables Belific already has, and add "belific"
  to Exposed schemas in the Supabase API settings.
*/

create schema if not exists belific;

grant usage on schema belific to authenticated;
alter default privileges in schema belific
  grant select, insert, update, delete on tables to authenticated;

create or replace function belific.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

/* Profile */
create table belific.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  timezone     text not null default 'Europe/London',
  created_at   timestamptz not null default now()
);

/* Labels */
create table belific.labels (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  colour     text not null default '#5C7A6B',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

/*
  Tasks. One table covers the whole pipeline, no separate timebox table:
    Brain Dump : plan_date is null and completed_at is null
    Planned    : plan_date set, scheduled_start null
    Timeboxed  : plan_date set and scheduled_start set
    Done       : completed_at set
  Trash and archive are soft states (deleted_at, archived_at), so nothing is lost.
*/
create table belific.tasks (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  title            text not null,
  notes            text,
  priority         smallint not null default 0 check (priority between 0 and 3),
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  label_id         uuid references belific.labels (id) on delete set null,
  plan_date        date,
  scheduled_start  timestamptz,
  column_order     double precision not null default 0,
  completed_at     timestamptz,
  archived_at      timestamptz,
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (scheduled_start is null or plan_date is not null)
);

create trigger tasks_set_updated_at
  before update on belific.tasks
  for each row execute function belific.set_updated_at();

create index tasks_inbox_idx on belific.tasks (user_id, created_at)
  where plan_date is null and completed_at is null and deleted_at is null;
create index tasks_day_idx on belific.tasks (user_id, plan_date, column_order)
  where deleted_at is null;
create index tasks_timebox_idx on belific.tasks (user_id, scheduled_start)
  where scheduled_start is not null and deleted_at is null;

/* Per task timer */
create table belific.time_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  task_id    uuid not null references belific.tasks (id) on delete cascade,
  started_at timestamptz not null,
  ended_at   timestamptz,
  check (ended_at is null or ended_at > started_at)
);
create index time_entries_task_idx on belific.time_entries (task_id);

/* Gamification: XP, levels, streaks */
create table belific.user_stats (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  xp               bigint not null default 0,
  level            integer not null default 1,
  current_streak   integer not null default 0,
  longest_streak   integer not null default 0,
  last_active_date date,
  updated_at       timestamptz not null default now()
);

create trigger user_stats_set_updated_at
  before update on belific.user_stats
  for each row execute function belific.set_updated_at();

/* multiplier = 1 + 0.01 * streak at the moment of the award, stored so history stays correct */
create table belific.xp_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  task_id     uuid references belific.tasks (id) on delete set null,
  base_xp     integer not null check (base_xp >= 0),
  multiplier  numeric(4, 2) not null default 1.00,
  awarded_xp  integer not null,
  reason      text not null,
  created_at  timestamptz not null default now()
);
create index xp_events_user_idx on belific.xp_events (user_id, created_at desc);

/*
  Quests = recurring tasks (routines). Shown in the Quests tab, grouped by cadence.
  The rule lives on the quest; due dates are worked out by the app from the rule,
  so nothing has to generate rows in advance.
    daily     : every day from start_date
    weekly    : days_of_week (0 = Sunday ... 6 = Saturday), every week
    biweekly  : days_of_week, every second week counting from start_date's week
    monthly   : day_of_month (31 means the last day in shorter months)
    annual    : month_of_year and day_of_month
*/
create table belific.quests (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  title            text not null,
  notes            text,
  cadence          text not null check (cadence in ('daily', 'weekly', 'biweekly', 'monthly', 'annual')),
  days_of_week     smallint[],
  day_of_month     smallint check (day_of_month between 1 and 31),
  month_of_year    smallint check (month_of_year between 1 and 12),
  start_date       date not null default current_date,
  end_date         date,
  priority         smallint not null default 0 check (priority between 0 and 3),
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  label_id         uuid references belific.labels (id) on delete set null,
  preferred_start  time,
  xp               integer not null default 10 check (xp >= 0),
  active           boolean not null default true,
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (cadence not in ('weekly', 'biweekly') or coalesce(array_length(days_of_week, 1), 0) > 0),
  check (cadence <> 'monthly' or day_of_month is not null),
  check (cadence <> 'annual' or (day_of_month is not null and month_of_year is not null))
);

create trigger quests_set_updated_at
  before update on belific.quests
  for each row execute function belific.set_updated_at();

/* One row per completed occurrence. This is the source of truth for per quest streaks. */
create table belific.quest_completions (
  quest_id        uuid not null references belific.quests (id) on delete cascade,
  occurrence_date date not null,
  user_id         uuid not null references auth.users (id) on delete cascade,
  completed_at    timestamptz not null default now(),
  primary key (quest_id, occurrence_date)
);
create index quest_completions_user_idx on belific.quest_completions (user_id, occurrence_date desc);

/* A quest can be dropped into the day plan or Timebox as a normal task */
alter table belific.tasks
  add column quest_id uuid references belific.quests (id) on delete set null,
  add column occurrence_date date;
create unique index tasks_quest_occurrence_idx
  on belific.tasks (quest_id, occurrence_date) where quest_id is not null;

alter table belific.xp_events
  add column quest_id uuid references belific.quests (id) on delete set null;

/* Row level security: every row belongs to one user */
alter table belific.profiles     enable row level security;
alter table belific.labels       enable row level security;
alter table belific.tasks        enable row level security;
alter table belific.time_entries enable row level security;
alter table belific.user_stats   enable row level security;
alter table belific.xp_events    enable row level security;
alter table belific.quests       enable row level security;
alter table belific.quest_completions enable row level security;

create policy own_rows on belific.profiles
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on belific.labels
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on belific.tasks
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on belific.time_entries
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on belific.user_stats
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on belific.xp_events
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on belific.quests
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_rows on belific.quest_completions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

/* Live sync between iOS and Windows */
alter publication supabase_realtime add table
  belific.tasks, belific.labels, belific.quests, belific.quest_completions;
