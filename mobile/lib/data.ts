import type {
  CategoryKey,
  CategoryMeta,
  DayTypeKey,
  DayTypeMeta,
  WeekDay,
  WeeklySchedule,
  WeeklyTemplateEvent,
  ScheduleEvent,
  CustomEvent,
  BrainDumpItem,
  RecurrenceRule,
  CustomCategory,
  EventPriority,
  Task,
  TimeOfDay,
} from './types';

// Colors below are the light (sage/cream) theme's decorative fill palette,
// used only for event bars/icons — never as text, so they only need to be
// visually distinct from the cream background, not AA text-contrast.
export const CATEGORIES: Record<CategoryKey, CategoryMeta> = {
  work:     { name: 'Work',        color: '#6B6558', icon: '💼' },
  routine:  { name: 'Routine',     color: '#8C8977', icon: '🔄' },
  hygiene:  { name: 'Hygiene',     color: '#6B5FB0', icon: '🪥' },
  fitness:  { name: 'Fitness',     color: '#4F7A1E', icon: '🏃' },
  jobs:     { name: 'Jobs',        color: '#2E6FA8', icon: '🔍' },
  project:  { name: 'Project',     color: '#453D8F', icon: '💻' },
  cyber:    { name: 'Cyber',       color: '#157A5A', icon: '🔐' },
  game:     { name: 'Game',        color: '#8F5C10', icon: '🎮' },
  school:   { name: 'School run',  color: '#B14322', icon: '🏫' },
  church:   { name: 'Church',      color: '#A8395F', icon: '⛪' },
  chore:    { name: 'Chore',       color: '#93601E', icon: '🧹' },
  winddown: { name: 'Wind down',   color: '#8A8672', icon: '🌙' },
  sleep:    { name: 'Sleep',       color: '#5C6470', icon: '😴' },
  free:     { name: 'Free',        color: '#9A9686', icon: '☕' },
};

// The category picker (EventForm) only shows these 5 by default — the
// other 9 keys above still fully exist for rendering (template events,
// already-saved custom events) and are surfaced back into the picker
// automatically for anyone who already has events using them, via
// getLegacyCategoriesInUse below. No migration step needed: nothing
// stored ever changes, only what the picker chooses to show.
export const DEFAULT_CATEGORY_KEYS: CategoryKey[] = ['work', 'routine', 'fitness', 'chore', 'free'];

// Auto-assigned in rotation to user-created custom categories — same
// decorative-fill contrast bar as CATEGORIES (>=2.5:1 on cream), no color
// picker in this pass.
export const CUSTOM_CATEGORY_COLOR_POOL = [
  '#6B5FB0', '#2E6FA8', '#A8395F', '#8F5C10', '#157A5A', '#93601E',
];

// Looks up display metadata for any category key — default, legacy
// (in CATEGORIES but not in the current default set), or user-created
// custom. Returns undefined only if the key is truly unknown anywhere.
export function resolveCategoryMeta(
  categoryKey: string,
  customCategories: CustomCategory[] = [],
): CategoryMeta | undefined {
  const builtin = CATEGORIES[categoryKey as CategoryKey];
  if (builtin) return builtin;
  return customCategories.find((c) => c.key === categoryKey);
}

// Distinct categories actually used by saved events that aren't in the
// current default set — these are what let removed defaults keep working
// for existing data without any explicit migration.
export function getLegacyCategoriesInUse(events: CustomEvent[]): CustomCategory[] {
  const seen = new Set<string>();
  const result: CustomCategory[] = [];
  for (const e of events) {
    if (DEFAULT_CATEGORY_KEYS.includes(e.category as CategoryKey)) continue;
    if (seen.has(e.category)) continue;
    const legacy = CATEGORIES[e.category as CategoryKey];
    if (!legacy) continue;
    seen.add(e.category);
    result.push({ key: e.category, name: legacy.name, icon: legacy.icon, color: legacy.color });
  }
  return result;
}

// DAY_TYPES colors render as actual text (status pill label), so these are
// darkened to clear WCAG AA (4.5:1) on the cream background — verified,
// not guessed. examDay/birthdayDay were pure semantic red/hot-pink in the
// dark theme; muted per the Quiet Function "no clashing semantic colors" rule.
export const DAY_TYPES: Record<DayTypeKey, DayTypeMeta> = {
  workDay:     { name: 'Work Day',  color: '#5A5648' },
  nonWorkDay:  { name: 'Off Work',  color: '#3F5A46' },
  examDay:     { name: 'Exam Day',  color: '#A8402F' },
  birthdayDay: { name: 'Birthday',  color: '#A24D74' },
};

export const WEEKLY_SCHEDULE: WeeklySchedule = {};

const STARTER_EVENTS: WeeklyTemplateEvent[] = [
  { title: 'Morning routine', category: 'routine', start: '07:00', end: '08:00', notes: '' },
  { title: 'Work block', category: 'work', start: '09:00', end: '12:00', notes: '' },
  { title: 'Lunch break', category: 'free', start: '12:00', end: '13:00', notes: '' },
  { title: 'Work block', category: 'work', start: '13:00', end: '17:00', notes: '' },
  { title: 'Gym', category: 'fitness', start: '17:30', end: '18:30', notes: '' },
  { title: 'Cook dinner', category: 'chore', start: '18:30', end: '19:00', notes: '' },
  { title: 'Downtime', category: 'free', start: '19:30', end: '20:30', notes: '' },
  { title: 'Evening wind down', category: 'winddown', start: '20:30', end: '21:00', notes: '' },
];

// Example content for new users with no real data yet — Routines,
// Top 3 Tasks, and Brain Dump each show these (non-interactive,
// never persisted) in place of their normal empty state. Same
// no-account-required, on-device-only starter concept as
// STARTER_EVENTS above, just for the other three sections.
export interface StarterRoutineItem {
  title: string;
  icon: string;
  timeOfDay: TimeOfDay;
}

export const STARTER_ROUTINES: StarterRoutineItem[] = [
  { title: 'Drink water on waking up', icon: '💧', timeOfDay: 'morning' },
  { title: 'Brush teeth', icon: '🪥', timeOfDay: 'morning' },
  { title: 'Shower', icon: '🚿', timeOfDay: 'morning' },
  { title: 'Eat lunch away from your desk', icon: '🥗', timeOfDay: 'afternoon' },
  { title: 'Get some fresh air', icon: '🍃', timeOfDay: 'afternoon' },
  { title: 'Put your phone away before bed', icon: '📵', timeOfDay: 'evening' },
  { title: 'Brush teeth', icon: '🪥', timeOfDay: 'evening' },
];

export const STARTER_TOP_TASKS: string[] = ['Do laundry', 'Grocery shopping', 'Walk the dog'];

export const STARTER_BRAIN_DUMP: string[] = [
  'Clean room',
  'Schedule meeting with a friend',
  'Cook rice',
  'Take chicken out of the freezer',
];

const WEEK_DAYS: WeekDay[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function getDayOfWeek(date: Date): WeekDay {
  return WEEK_DAYS[date.getDay()];
}

export function timeToMinutes(t: string): number {
  const parts = t.split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatTime(t: string): string {
  const parts = t.split(':');
  const h = parseInt(parts[0], 10);
  const m = parts[1];
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return `${h12}:${m}${ampm}`;
}

export function durationMinutes(start: string, end: string): number {
  return timeToMinutes(end) - timeToMinutes(start);
}

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function resolveTemplateEvent(e: WeeklyTemplateEvent, index: number): ScheduleEvent {
  const meta = CATEGORIES[e.category];
  return {
    id: `template-${e.category}-${index}`,
    title: e.title,
    category: e.category,
    icon: meta.icon,
    color: meta.color,
    start: e.start,
    end: e.end,
    notes: e.notes,
    isCustom: false,
  };
}

export function customToScheduleEvent(e: CustomEvent, customCategories: CustomCategory[] = []): ScheduleEvent {
  const meta = resolveCategoryMeta(e.category, customCategories);
  return {
    id: e.id,
    title: e.title,
    category: e.category,
    icon: e.icon || (meta?.icon ?? '📌'),
    color: meta?.color ?? '#888888',
    start: e.start,
    end: e.end,
    notes: e.notes,
    isCustom: true,
    priority: e.priority,
  };
}

export function getWeeklyEventsForDate(date: Date): ScheduleEvent[] {
  const dow = getDayOfWeek(date);
  const template = WEEKLY_SCHEDULE[dow];
  if (!template) return [];
  return template.events.map(resolveTemplateEvent);
}

export function getStarterEventsForDate(_date: Date): ScheduleEvent[] {
  return STARTER_EVENTS.map(resolveTemplateEvent);
}

export function getDayTypeForDate(date: Date): { key: string; name: string; color: string } {
  const dow = getDayOfWeek(date);
  const template = WEEKLY_SCHEDULE[dow];
  if (!template) return { key: 'nonWorkDay', name: DAY_TYPES.nonWorkDay.name, color: DAY_TYPES.nonWorkDay.color };
  const meta = DAY_TYPES[template.dayType];
  return { key: template.dayType, name: meta.name, color: meta.color };
}

export interface CategoryStat {
  category: CategoryKey;
  name: string;
  color: string;
  icon: string;
  totalMinutes: number;
}

export function computeCategoryStats(events: ScheduleEvent[], customCategories: CustomCategory[] = []): CategoryStat[] {
  const map = new Map<string, CategoryStat>();

  for (const e of events) {
    const mins = durationMinutes(e.start, e.end);
    if (mins <= 0) continue;

    const existing = map.get(e.category);
    if (existing) {
      existing.totalMinutes += mins;
    } else {
      // Falls back to a generic pin/grey rather than dropping the stat
      // entirely — a user-created custom category not passed in here
      // (e.g. this call site hasn't loaded custom categories) would
      // otherwise silently vanish from the breakdown instead of just
      // looking generic.
      const meta = resolveCategoryMeta(e.category, customCategories) ?? {
        name: e.category,
        color: '#888888',
        icon: '📌',
      };
      map.set(e.category, {
        category: e.category as CategoryKey,
        name: meta.name,
        color: meta.color,
        icon: meta.icon,
        totalMinutes: mins,
      });
    }
  }

  return Array.from(map.values())
    .filter((s) => s.totalMinutes >= 30)
    .sort((a, b) => b.totalMinutes - a.totalMinutes);
}

export function createCustomEvent(fields: Omit<CustomEvent, 'id'>): CustomEvent {
  return { ...fields, id: generateId() };
}

export function createBrainDumpItem(title: string): BrainDumpItem {
  return { id: generateId(), title, notes: '', createdAt: new Date().toISOString() };
}

// Recurring events are materialized as concrete rows up front rather than
// evaluated as a live rule at render time — see the comment on
// CustomEvent.recurrence in types.ts for why. This bounds how far ahead a
// series is generated; past this horizon nothing more exists until the
// series is regenerated (not yet implemented — a known v1 limitation).
export const RECURRENCE_HORIZON_DAYS = 365;

export const RECURRENCE_LABELS: Record<RecurrenceRule, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  triweekly: 'Every 3 weeks',
  monthly: 'Monthly',
};

// Shared between EventForm and TaskForm — 'normal' is UI-only, never
// actually stored (see EventPriority in types.ts); it's just what the
// middle chip represents.
export type PriorityChoice = EventPriority | 'normal';
export const PRIORITY_CHOICES: PriorityChoice[] = ['low', 'normal', 'high'];
export const PRIORITY_LABELS: Record<PriorityChoice, string> = { low: 'Low', normal: 'Normal', high: 'High' };
export const PRIORITY_DESCRIPTIONS: Record<PriorityChoice, string> = {
  low: 'Nice to do, flexible timing',
  normal: 'Standard importance',
  high: 'Time-sensitive or non-negotiable',
};

// daily/monthly step forward by a fixed unit — no day-of-week concept
// applies to either (daily is every day; monthly follows the anchor's
// calendar day-of-month).
function nextOccurrence(current: Date, rule: 'daily' | 'monthly'): Date {
  const next = new Date(current);
  if (rule === 'daily') next.setDate(next.getDate() + 1);
  else next.setMonth(next.getMonth() + 1);
  return next;
}

const WEEK_DAY_INDEX: Record<WeekDay, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

function startOfWeek(d: Date): Date {
  const result = new Date(d);
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() - result.getDay());
  return result;
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

export function generateRecurringEvents(
  fields: Omit<CustomEvent, 'id' | 'date' | 'recurrence' | 'seriesId' | 'recurrenceDays'>,
  rule: RecurrenceRule,
  anchorDate: Date,
  days?: WeekDay[],
): CustomEvent[] {
  const seriesId = generateId();
  const horizon = new Date(anchorDate);
  horizon.setDate(horizon.getDate() + RECURRENCE_HORIZON_DAYS);
  const events: CustomEvent[] = [];

  if (rule === 'daily' || rule === 'monthly') {
    let current = new Date(anchorDate);
    while (current <= horizon) {
      events.push({ ...fields, id: generateId(), date: formatDateKey(current), recurrence: rule, seriesId });
      current = nextOccurrence(current, rule);
    }
    return events;
  }

  // weekly / biweekly / triweekly: walk day-by-day, including any day whose
  // weekday is selected AND whose week falls on the right interval from the
  // anchor's week. The anchor's own week always qualifies (weeksSince = 0);
  // days before the anchor date itself are excluded even if their weekday
  // matches, same as most calendar apps' "starts partway through the week"
  // behavior.
  const interval = rule === 'weekly' ? 1 : rule === 'biweekly' ? 2 : 3;
  const selectedDays = days && days.length > 0 ? days : [getDayOfWeek(anchorDate)];
  const selectedIndices = new Set(selectedDays.map((d) => WEEK_DAY_INDEX[d]));
  const anchorWeekStart = startOfWeek(anchorDate);

  const cursor = new Date(anchorDate);
  while (cursor <= horizon) {
    if (cursor >= anchorDate && selectedIndices.has(cursor.getDay())) {
      const weeksSince = Math.round(
        (startOfWeek(cursor).getTime() - anchorWeekStart.getTime()) / MS_PER_WEEK,
      );
      if (weeksSince % interval === 0) {
        events.push({
          ...fields,
          id: generateId(),
          date: formatDateKey(cursor),
          recurrence: rule,
          seriesId,
          recurrenceDays: selectedDays,
        });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return events;
}

// Shared ordering for both the Tasks screen (full list) and Today's
// Top 3 section (slices the incomplete portion) — keeping this in one
// place means both always agree on what counts as "most pressing".
// Incomplete tasks: due-today-or-overdue first, then High priority,
// then oldest created. Completed tasks: most recently completed first,
// always after every incomplete one.
export function sortTasksForDisplay(tasks: Task[]): Task[] {
  const todayKey = formatDateKey(new Date());
  const incomplete = tasks.filter((t) => !t.completed);
  const completed = tasks.filter((t) => t.completed);

  incomplete.sort((a, b) => {
    const aOverdue = !!a.dueDate && a.dueDate <= todayKey;
    const bOverdue = !!b.dueDate && b.dueDate <= todayKey;
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
    const aHigh = a.priority === 'high';
    const bHigh = b.priority === 'high';
    if (aHigh !== bHigh) return aHigh ? -1 : 1;
    return a.createdAt.localeCompare(b.createdAt);
  });
  completed.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));

  return [...incomplete, ...completed];
}

export function getTopTasks(tasks: Task[], count = 3): Task[] {
  return sortTasksForDisplay(tasks)
    .filter((t) => !t.completed)
    .slice(0, count);
}
