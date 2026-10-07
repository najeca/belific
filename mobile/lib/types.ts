export type CategoryKey =
  | 'work'
  | 'routine'
  | 'hygiene'
  | 'fitness'
  | 'jobs'
  | 'project'
  | 'cyber'
  | 'game'
  | 'school'
  | 'church'
  | 'chore'
  | 'winddown'
  | 'sleep'
  | 'free';

export interface CategoryMeta {
  name: string;
  color: string;
  icon: string;
}

// A user-created category, distinct from the built-in CATEGORIES table.
// key is a generated id, not a CategoryKey union member — CustomEvent's
// category field is already a plain string, so this needs no widening
// there.
export interface CustomCategory {
  key: string;
  name: string;
  icon: string;
  color: string;
  // Same as Project above — no timestamps existed before this; existing
  // rows get both backfilled to a shared migration timestamp.
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export type DayTypeKey = 'workDay' | 'nonWorkDay' | 'examDay' | 'birthdayDay';

export interface DayTypeMeta {
  name: string;
  color: string;
}

export type WeekDay = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

export interface WeeklyTemplateEvent {
  title: string;
  category: CategoryKey;
  start: string;
  end: string;
  notes: string;
}

export interface WeeklyDayTemplate {
  dayType: DayTypeKey;
  label: string;
  events: WeeklyTemplateEvent[];
}

export type WeeklySchedule = Partial<Record<WeekDay, WeeklyDayTemplate>>;

export interface ScheduleEvent {
  id: string;
  title: string;
  category: string;
  icon: string;
  color: string;
  start: string;
  end: string;
  notes: string;
  isCustom: boolean;
  priority?: EventPriority;
}

export type RecurrenceRule = 'daily' | 'weekly' | 'biweekly' | 'triweekly' | 'monthly';

// Absent means 'normal' — only 'low'/'high' are ever stored explicitly,
// so every already-saved event needs no migration.
export type EventPriority = 'low' | 'high';

export interface CustomEvent {
  id: string;
  title: string;
  category: string;
  icon: string;
  start: string;
  end: string;
  notes: string;
  date: string;
  // Recurring events are materialized as separate rows sharing one
  // seriesId (see generateRecurringEvents in data.ts) rather than a
  // live rule evaluated at render time — every other CustomEvent
  // consumer (today.tsx's merge, calendar dots, notification
  // scheduling) already assumes one row = one concrete date, so this
  // keeps recurring events working everywhere with no other code
  // changes. Both fields are absent on a one-off event.
  recurrence?: RecurrenceRule;
  seriesId?: string;
  // Which weekdays a weekly/biweekly/triweekly series applies to — stored
  // for provenance/display only, since the series is already materialized
  // (see generateRecurringEvents in data.ts). Absent for daily/monthly.
  recurrenceDays?: WeekDay[];
  // Absent means normal priority — see the EventPriority comment above.
  priority?: EventPriority;
  // Set once, at creation, when an event was promoted from a Brain Dump
  // item — forces the 🧠 icon regardless of category, including on later
  // edits, so a scheduled Dump item stays visually identifiable as having
  // come from there. Never set any other way.
  origin?: 'dump';
  // Sync bookkeeping (added for optional-account cloud backup) — stamped
  // by storage.ts on every add/update, never set by callers directly.
  // Drives last-write-wins conflict resolution when the same row exists
  // on two devices.
  updatedAt: string;
  // Soft-delete marker — absent means alive, same "absence = default"
  // convention as priority/recurrence/origin above. Deletes set this
  // instead of removing the row so a delete can propagate to other
  // devices during sync; storage.ts prunes tombstones for real after a
  // retention window once they're old enough that every device has had
  // a chance to see them.
  deletedAt?: string;
}

// A brain-dump item is deliberately not a CustomEvent with optional
// date/start/end — every CustomEvent consumer (today.tsx's merge/sort,
// notifications scheduling, calendar dots) assumes a real date and time
// exist. Keeping this as its own shape means those consumers never need
// undefined-guards, and "promoting" an item is one explicit conversion
// step (see createCustomEvent) rather than a field ever being optional.
export interface BrainDumpItem {
  id: string;
  title: string;
  notes: string;
  createdAt: string;
  // See CustomEvent.updatedAt / deletedAt above — same sync bookkeeping.
  updatedAt: string;
  deletedAt?: string;
}

// Time-of-day grouping for Routines (habit-tracker feature) — a
// separate sense of "routine" from the `routine` CategoryKey used by
// scheduled events; see UBIQUITOUS_LANGUAGE.md for both definitions.
export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

export interface Routine {
  id: string;
  title: string;
  timeOfDay: TimeOfDay;
  createdAt: string;
  // See CustomEvent.updatedAt / deletedAt above — same sync bookkeeping.
  updatedAt: string;
  deletedAt?: string;
}

// One row per completed day, per routine — not append-only despite the
// name suggesting a log: un-completing removes the row for that date
// (see deleteRoutineCompletion). Reversibility is a hard requirement
// here (design-identity skill's vacation-mode principle), so "toggle
// off" must be a real, working operation, not just theoretically
// possible. No streak count is ever derived from this — "done today"
// is a lookup, nothing more.
export interface RoutineCompletion {
  routineId: string;
  date: string;
  completedAt: string;
}

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface Task {
  id: string;
  title: string;
  // The day the task is PLANNED for ("Day" in the UI, decision 015), not a
  // hard deadline. Absent means Unscheduled. The desktop kanban moves tasks
  // between days by changing this; iOS still reads it as before.
  dueDate?: string;
  priority?: EventPriority;
  projectKey?: string;
  notes?: string;
  completed: boolean;
  completedAt?: string;
  createdAt: string;
  // Desktop planning fields (decision 015). LOCAL ONLY until migration 2
  // lands (checkpoint 5): sync.ts does not map them yet, so they are not
  // uploaded and a newer remote row would overwrite them. Desktop stays
  // signed out until then.
  // Estimated size in minutes (chips write 15, 30, 60, 120). Also the
  // Timebox block height; absent means 30 when placed.
  durationMinutes?: number;
  // 'HH:mm'. A task with a dueDate AND a startTime is "placed" and shows as
  // a block on Timebox for that day. One row, never copied into an event.
  startTime?: string;
  // Repeat settings (checkpoint 2b). Same types CustomEvent uses. On the iPhone
  // only the NEXT occurrence exists: completing the task creates the next one
  // (lib/taskActions.ts setTaskCompleted, id `${rootId}:${nextDueDate}`). On
  // the desktop the series' coming days are shown, not stored (lib/series.ts,
  // decision 023). Synced (migration 2).
  recurrence?: RecurrenceRule;
  recurrenceDays?: WeekDay[];
  // Monthly only (checkpoint 4.2): the date number it repeats on (1 to 31),
  // clamped to shorter months, so a 31st stays the 31st after February.
  // LOCAL ONLY until checkpoint 5 (migration 2), like the fields above.
  recurrenceMonthDay?: number;
  // Checkpoint 8.2 (decision 021): a checklist stored on the task, at most 50.
  // Synced in a nullable jsonb column; kept locally while the server lacks it.
  subtasks?: Subtask[];
  // Desktop reminder (decision 017/020, checkpoint 8.2). undefined or null =
  // the default behaviour (notify at the start time of a placed task, and the
  // grouped daily reminder for a planned task with no time), -1 = off, 0 or
  // more = minutes before the start time. Synced as reminder_minutes.
  reminderMinutes?: number | null;
  // Set once, at creation, when promoted from a Brain Dump item — same
  // pattern as CustomEvent.origin, rendered as a small 🧠 indicator.
  origin?: 'dump';
  // See CustomEvent.updatedAt / deletedAt above — same sync bookkeeping.
  updatedAt: string;
  deletedAt?: string;
}

// Lightweight tag only — no color/icon, just a filter label. Deliberately
// not a full "project" concept with its own screen/progress view; add
// one later only if actually needed once Tasks/Routines are in daily use.
export interface Project {
  key: string;
  name: string;
  // Added for optional-account cloud backup — see CustomEvent.updatedAt
  // above. Project had no timestamps at all before this; existing rows
  // get both backfilled to a shared migration timestamp (see
  // migrateToSyncableSchema in storage.ts), since there's no earlier
  // "real" creation time to recover.
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  // A label palette key (lib/labelColors.ts, decision 016). LOCAL ONLY until
  // checkpoint 5 adds projects.color: the sync mappers do not carry it, and a
  // pull that replaces this row with the server copy would drop it, so
  // checkpoint 5 must merge local only fields on pull. Desktop only; the
  // iPhone never reads it.
  colorKey?: string;
}
