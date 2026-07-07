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
} from './types';

export const CATEGORIES: Record<CategoryKey, CategoryMeta> = {
  work:     { name: 'Work',        color: '#888780', icon: '💼' },
  routine:  { name: 'Routine',     color: '#B4B2A9', icon: '🔄' },
  hygiene:  { name: 'Hygiene',     color: '#7F77DD', icon: '🪥' },
  fitness:  { name: 'Fitness',     color: '#639922', icon: '🏃' },
  jobs:     { name: 'Jobs',        color: '#378ADD', icon: '🔍' },
  project:  { name: 'Project',     color: '#534AB7', icon: '💻' },
  cyber:    { name: 'Cyber',       color: '#1D9E75', icon: '🔐' },
  game:     { name: 'Game',        color: '#BA7517', icon: '🎮' },
  school:   { name: 'School run',  color: '#D85A30', icon: '🏫' },
  church:   { name: 'Church',      color: '#D4537E', icon: '⛪' },
  chore:    { name: 'Chore',       color: '#C47C2B', icon: '🧹' },
  winddown: { name: 'Wind down',   color: '#D3D1C7', icon: '🌙' },
  sleep:    { name: 'Sleep',       color: '#D3D1C7', icon: '😴' },
  free:     { name: 'Free',        color: '#B4B2A9', icon: '☕' },
};

export const DAY_TYPES: Record<DayTypeKey, DayTypeMeta> = {
  workDay:     { name: 'Work Day',  color: '#888780' },
  nonWorkDay:  { name: 'Off Work',  color: '#6B9B76' },
  examDay:     { name: 'Exam Day',  color: '#E74C3C' },
  birthdayDay: { name: 'Birthday',  color: '#FF69B4' },
};

export const WEEKLY_SCHEDULE: WeeklySchedule = {};

const STARTER_EVENTS: WeeklyTemplateEvent[] = [
  { title: 'Morning routine', category: 'routine', start: '07:00', end: '08:00', notes: '' },
  { title: 'Deep work block', category: 'work', start: '09:00', end: '12:00', notes: '' },
  { title: 'Lunch break', category: 'free', start: '12:00', end: '13:00', notes: '' },
  { title: 'Afternoon focus', category: 'work', start: '13:00', end: '17:00', notes: '' },
  { title: 'Evening wind down', category: 'winddown', start: '20:00', end: '21:00', notes: '' },
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

export function customToScheduleEvent(e: CustomEvent): ScheduleEvent {
  const meta = CATEGORIES[e.category as CategoryKey];
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

export function computeCategoryStats(events: ScheduleEvent[]): CategoryStat[] {
  const map = new Map<string, CategoryStat>();

  for (const e of events) {
    const mins = durationMinutes(e.start, e.end);
    if (mins <= 0) continue;

    const existing = map.get(e.category);
    if (existing) {
      existing.totalMinutes += mins;
    } else {
      const meta = CATEGORIES[e.category as CategoryKey];
      if (meta) {
        map.set(e.category, {
          category: e.category as CategoryKey,
          name: meta.name,
          color: meta.color,
          icon: meta.icon,
          totalMinutes: mins,
        });
      }
    }
  }

  return Array.from(map.values())
    .filter((s) => s.totalMinutes >= 30)
    .sort((a, b) => b.totalMinutes - a.totalMinutes);
}

export function createCustomEvent(fields: Omit<CustomEvent, 'id'>): CustomEvent {
  return { ...fields, id: generateId() };
}
