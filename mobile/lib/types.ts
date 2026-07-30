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

export interface CustomEvent {
  id: string;
  title: string;
  category: string;
  icon: string;
  start: string;
  end: string;
  notes: string;
  date: string;
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
