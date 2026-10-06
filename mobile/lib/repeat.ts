// Pure helpers for the task editor's Repeat control and how a repeat is shown
// (checkpoint 4.2). NO runtime imports so `node --test` can run it; see
// repeat.test.ts. The next-occurrence maths is in recurrence.ts.
//
// Stored values are unchanged from checkpoint 2b (RecurrenceRule plus
// recurrenceDays), plus recurrenceMonthDay for Monthly:
//   Every day      -> 'daily'
//   Specific days  -> 'weekly' with recurrenceDays (at least one)
//   Every 2 weeks  -> 'biweekly' with recurrenceDays (at least one)
//   Monthly        -> 'monthly' with recurrenceMonthDay (1 to 31)
// A stored 'weekly' or 'biweekly' with no days means the weekday of its Day.
// The UI never says a bare "Weekly".
import type { RecurrenceRule, Task, WeekDay } from './types.ts';
import { WEEKDAYS, addDays, dateKey, formatDayLabel, isDateKey, parseDateKey } from './kanban.ts';

export type RepeatKind = 'none' | 'daily' | 'days' | 'biweekly' | 'monthly';

export const REPEAT_CHOICES: Array<{ kind: RepeatKind; label: string }> = [
  { kind: 'none', label: 'Does not repeat' },
  { kind: 'daily', label: 'Every day' },
  { kind: 'days', label: 'Specific days' },
  { kind: 'biweekly', label: 'Every 2 weeks' },
  { kind: 'monthly', label: 'Monthly' },
];

// Monday first, for chips and every list of days.
export const WEEK_ORDER: WeekDay[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAY_SET: WeekDay[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
export const WEEKEND_SET: WeekDay[] = ['Sat', 'Sun'];

export function weekdayOf(key: string): WeekDay {
  return WEEKDAYS[parseDateKey(key).getDay()] as WeekDay;
}

export function sortDays(days: WeekDay[]): WeekDay[] {
  return WEEK_ORDER.filter((d) => days.includes(d));
}

export function toggleDay(days: WeekDay[], day: WeekDay): WeekDay[] {
  return days.includes(day) ? days.filter((d) => d !== day) : sortDays([...days, day]);
}

export function sameDays(a: WeekDay[], b: WeekDay[]): boolean {
  return a.length === b.length && a.every((d) => b.includes(d));
}

// The editor kind for a stored task. triweekly was never offered in any
// editor; if one ever loads it shows as Every 2 weeks.
export function repeatKindOf(rule: RecurrenceRule | undefined): RepeatKind {
  if (!rule) return 'none';
  if (rule === 'daily') return 'daily';
  if (rule === 'weekly') return 'days';
  if (rule === 'monthly') return 'monthly';
  return 'biweekly';
}

export function ruleOf(kind: RepeatKind): RecurrenceRule | undefined {
  if (kind === 'none') return undefined;
  if (kind === 'days') return 'weekly';
  return kind;
}

// The weekdays a repeat runs on. Stored days win; with none (legacy), the
// weekday of the task's Day, or of today when it has no Day.
export function effectiveDays(
  task: { recurrenceDays?: WeekDay[]; dueDate?: string },
  todayKey: string,
): WeekDay[] {
  if (task.recurrenceDays && task.recurrenceDays.length > 0) return sortDays(task.recurrenceDays);
  return [weekdayOf(isDateKey(task.dueDate) ? task.dueDate : todayKey)];
}

// The first chosen weekday on or after `key`.
export function alignToDays(key: string, days: WeekDay[]): string {
  if (days.length === 0) return key;
  const start = parseDateKey(key);
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    if (days.includes(WEEKDAYS[d.getDay()] as WeekDay)) return dateKey(d);
  }
  return key;
}

// "Wed", "Mon and Thu", "Wed, Fri and Sun"
export function formatDayList(days: WeekDay[]): string {
  const list = sortDays(days);
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const last = n % 10;
  if (last === 1) return `${n}st`;
  if (last === 2) return `${n}nd`;
  if (last === 3) return `${n}rd`;
  return `${n}th`;
}

// The date number a monthly repeat uses. A stored recurrenceMonthDay wins
// while the Day still matches it (the 31st shown as 28 Feb keeps 31); a Day
// moved to another date, or a legacy task without one, uses the Day's
// number; with no Day, today's.
export function monthDayOf(task: { recurrenceMonthDay?: number; dueDate?: string }, todayKey: string): number {
  const md = task.recurrenceMonthDay;
  const key = isDateKey(task.dueDate) ? task.dueDate : undefined;
  const valid = md !== undefined && md >= 1 && md <= 31 ? Math.floor(md) : undefined;
  if (valid && !key) return valid;
  const d = parseDateKey(key ?? todayKey);
  if (valid) {
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    if (Math.min(valid, last) === d.getDate()) return valid;
  }
  return d.getDate();
}

// What saving the editor will store: the Day (moved to the first chosen
// weekday on or after it, for day based repeats) and the repeat fields.
// Returns null when the choice is incomplete (day based with no day chosen).
export function resolveRepeat(
  kind: RepeatKind,
  days: WeekDay[],
  dayKey: string | undefined,
  todayKey: string,
  storedMonthDay?: number,
): {
  dueDate: string | undefined;
  movedFrom?: string;
  recurrence: RecurrenceRule | undefined;
  recurrenceDays: WeekDay[] | undefined;
  recurrenceMonthDay: number | undefined;
} | null {
  const day = isDateKey(dayKey) ? dayKey : undefined;
  if (kind === 'days' || kind === 'biweekly') {
    if (days.length === 0) return null;
    const aligned = day ? alignToDays(day, days) : undefined;
    return {
      dueDate: aligned,
      movedFrom: aligned !== day ? day : undefined,
      recurrence: ruleOf(kind),
      recurrenceDays: sortDays(days),
      recurrenceMonthDay: undefined,
    };
  }
  if (kind === 'monthly') {
    return {
      dueDate: day,
      recurrence: 'monthly',
      recurrenceDays: undefined,
      recurrenceMonthDay: monthDayOf({ dueDate: day, recurrenceMonthDay: storedMonthDay }, todayKey),
    };
  }
  return { dueDate: day, recurrence: ruleOf(kind), recurrenceDays: undefined, recurrenceMonthDay: undefined };
}

function daysPhrase(days: WeekDay[]): string {
  if (sameDays(days, WEEK_ORDER)) return 'every day of the week';
  if (sameDays(days, WEEKDAY_SET)) return 'every weekday (Mon to Fri)';
  if (sameDays(days, WEEKEND_SET)) return 'every weekend (Sat and Sun)';
  return `every ${formatDayList(days)}`;
}

// The plain line under the Repeat control: exactly what will happen.
export function repeatSummary(
  kind: RepeatKind,
  days: WeekDay[],
  dayKey: string | undefined,
  todayKey: string,
  storedMonthDay?: number,
): string {
  if (kind === 'none') return 'Does not repeat';
  if (kind === 'daily') return 'Repeats every day';
  if (kind === 'monthly') {
    const md = monthDayOf({ dueDate: dayKey, recurrenceMonthDay: storedMonthDay }, todayKey);
    const tail = md > 28 ? ' (the last day in shorter months)' : '';
    const from = isDateKey(dayKey) ? '' : ', counted from today (no Day set)';
    return `Repeats on the ${ordinal(md)} of every month${tail}${from}`;
  }
  const resolved = resolveRepeat(kind, days, dayKey, todayKey);
  if (!resolved) return 'Choose at least one day';
  const base = kind === 'days' ? `Repeats ${daysPhrase(days)}` : `Repeats every other week on ${formatDayList(days)}`;
  const starts = resolved.movedFrom && resolved.dueDate ? `, starts ${formatDayLabel(resolved.dueDate)}` : '';
  return base + starts;
}

// Short form for a Brain Dump row: "Every day", "Wed Fri Sun",
// "Every 2 wks Mon Thu", "Monthly 14th".
export function shortRepeat(
  task: Pick<Task, 'recurrence' | 'recurrenceDays' | 'recurrenceMonthDay' | 'dueDate'>,
  todayKey: string,
): string | undefined {
  switch (task.recurrence) {
    case 'daily':
      return 'Every day';
    case 'weekly':
      return effectiveDays(task, todayKey).join(' ');
    case 'biweekly':
      return `Every 2 wks ${effectiveDays(task, todayKey).join(' ')}`;
    case 'triweekly':
      return `Every 3 wks ${effectiveDays(task, todayKey).join(' ')}`;
    case 'monthly':
      return `Monthly ${ordinal(monthDayOf(task, todayKey))}`;
    default:
      return undefined;
  }
}
