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
}

export type RecurrenceRule = 'daily' | 'weekly' | 'biweekly' | 'triweekly' | 'monthly';

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
}

export interface TimerSettings {
  focusDuration: number;
  breakDuration: number;
  longBreakDuration: number;
  sessionsUntilLongBreak: number;
}

export type TimerPhase = 'focus' | 'break' | 'longBreak';

export interface TimerStore extends TimerSettings {
  update: (patch: Partial<TimerSettings>) => void;
}
