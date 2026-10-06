// Pure helpers for the task editor's Repeat control and how a repeat is shown
// (checkpoints 4.2 and 4.3). NO runtime imports so `node --test` can run it;
// see repeat.test.ts. The next-occurrence maths is in recurrence.ts.
//
// The editor offers four choices; what is stored is unchanged from
// checkpoint 2b plus recurrenceMonthDay:
//   Weekly, 1 to 6 days   -> 'weekly' with recurrenceDays
//   Weekly, all 7 days    -> 'daily' (the control's label then reads Daily)
//   Every 2 weeks, 1 to 7 -> 'biweekly' with recurrenceDays (never Daily)
//   Monthly               -> 'monthly' with recurrenceMonthDay (1 to 31)
// A stored 'weekly' or 'biweekly' with no days means the weekday of its Day;
// a stored 'daily' opens as Weekly with all seven days (shown as Daily).
import type { RecurrenceRule, Task, WeekDay } from './types.ts';
import { WEEKDAYS, addDays, dateKey, formatDayLabel, isDateKey, parseDateKey } from './kanban.ts';

export type RepeatKind = 'none' | 'weekly' | 'biweekly' | 'monthly';

export const REPEAT_CHOICES: Array<{ kind: RepeatKind; label: string }> = [
  { kind: 'none', label: 'Does not repeat' },
  { kind: 'weekly', label: 'Weekly' },
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

export function allSeven(days: WeekDay[]): boolean {
  return sameDays(sortDays(days), WEEK_ORDER);
}

// The editor kind for a stored rule. 'daily' is Weekly with all seven days.
// triweekly was never offered by any editor; if one ever loads it shows as
// Every 2 weeks.
export function repeatKindOf(rule: RecurrenceRule | undefined): RepeatKind {
  if (!rule) return 'none';
  if (rule === 'daily' || rule === 'weekly') return 'weekly';
  if (rule === 'monthly') return 'monthly';
  return 'biweekly';
}

// The label on the chip for a kind: Weekly reads Daily with all seven days.
export function repeatLabel(kind: RepeatKind, days: WeekDay[]): string {
  if (kind === 'weekly' && allSeven(days)) return 'Daily';
  return REPEAT_CHOICES.find((c) => c.kind === kind)?.label ?? '';
}

// The rule stored for a choice.
export function ruleFor(kind: RepeatKind, days: WeekDay[]): RecurrenceRule | undefined {
  if (kind === 'none') return undefined;
  if (kind === 'weekly') return allSeven(days) ? 'daily' : 'weekly';
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

// The chips shown when the editor opens on a stored task.
export function initialDays(
  task: { recurrence?: RecurrenceRule; recurrenceDays?: WeekDay[]; dueDate?: string } | undefined,
  todayKey: string,
): WeekDay[] {
  if (!task?.recurrence) return [];
  if (task.recurrence === 'daily') return [...WEEK_ORDER];
  if (task.recurrence === 'monthly') return [];
  return effectiveDays(task, todayKey);
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

function clampedMonthDay(year: number, month: number, monthDay: number): Date {
  const last = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(monthDay, last));
}

// The first date on or after `key` that falls on `monthDay` (clamped to the
// month's last day).
export function alignToMonthDay(key: string, monthDay: number): string {
  const d = parseDateKey(key);
  const same = clampedMonthDay(d.getFullYear(), d.getMonth(), monthDay);
  if (same.getTime() >= d.getTime()) return dateKey(same);
  return dateKey(clampedMonthDay(d.getFullYear(), d.getMonth() + 1, monthDay));
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

// The "Day of the month" field: a whole number from 1 to 31, or null.
export function parseMonthDay(text: string): number | null {
  if (!/^\s*\d{1,2}\s*$/.test(text)) return null;
  const n = Number(text);
  return n >= 1 && n <= 31 ? n : null;
}

// What the field shows when the editor opens: the stored number, else the
// Day's date number, else 1.
export function defaultMonthDay(task: { recurrenceMonthDay?: number; dueDate?: string } | undefined): number {
  const md = task?.recurrenceMonthDay;
  if (md !== undefined && md >= 1 && md <= 31) return Math.floor(md);
  if (task && isDateKey(task.dueDate)) return parseDateKey(task.dueDate).getDate();
  return 1;
}

// The date number a monthly repeat uses: the stored recurrenceMonthDay
// (explicit since 4.3), else the Day's date number (older tasks), else today's.
export function monthDayOf(task: { recurrenceMonthDay?: number; dueDate?: string }, todayKey: string): number {
  const md = task.recurrenceMonthDay;
  if (md !== undefined && md >= 1 && md <= 31) return Math.floor(md);
  return parseDateKey(isDateKey(task.dueDate) ? task.dueDate : todayKey).getDate();
}

export interface ResolvedRepeat {
  dueDate: string | undefined;
  movedFrom?: string;
  recurrence: RecurrenceRule | undefined;
  recurrenceDays: WeekDay[] | undefined;
  recurrenceMonthDay: number | undefined;
}

// What saving the editor will store: the Day (moved to the first chosen
// weekday, or the first date with the chosen month day, on or after it) and
// the repeat fields. null when the choice is incomplete: no day chosen for
// Weekly or Every 2 weeks, or no valid month day for Monthly.
export function resolveRepeat(
  kind: RepeatKind,
  days: WeekDay[],
  dayKey: string | undefined,
  monthDay: number | null,
): ResolvedRepeat | null {
  const day = isDateKey(dayKey) ? dayKey : undefined;
  if (kind === 'weekly' || kind === 'biweekly') {
    if (days.length === 0) return null;
    const rule = ruleFor(kind, days);
    if (rule === 'daily') {
      return { dueDate: day, recurrence: 'daily', recurrenceDays: undefined, recurrenceMonthDay: undefined };
    }
    const aligned = day ? alignToDays(day, days) : undefined;
    return {
      dueDate: aligned,
      movedFrom: aligned !== day ? day : undefined,
      recurrence: rule,
      recurrenceDays: sortDays(days),
      recurrenceMonthDay: undefined,
    };
  }
  if (kind === 'monthly') {
    if (monthDay === null) return null;
    const aligned = day ? alignToMonthDay(day, monthDay) : undefined;
    return {
      dueDate: aligned,
      movedFrom: aligned !== day ? day : undefined,
      recurrence: 'monthly',
      recurrenceDays: undefined,
      recurrenceMonthDay: monthDay,
    };
  }
  return { dueDate: day, recurrence: undefined, recurrenceDays: undefined, recurrenceMonthDay: undefined };
}

function daysPhrase(days: WeekDay[]): string {
  if (sameDays(days, WEEKDAY_SET)) return 'every weekday (Mon to Fri)';
  if (sameDays(days, WEEKEND_SET)) return 'every weekend (Sat and Sun)';
  return `every ${formatDayList(days)}`;
}

export const SHORT_MONTH_NOTE = 'In shorter months it falls on the last day.';

// The plain line under the Repeat control: exactly what will happen.
export function repeatSummary(
  kind: RepeatKind,
  days: WeekDay[],
  dayKey: string | undefined,
  monthDay: number | null,
): string {
  if (kind === 'none') return 'Does not repeat';
  const resolved = resolveRepeat(kind, days, dayKey, monthDay);
  if (!resolved) return kind === 'monthly' ? 'Enter a day from 1 to 31' : 'Choose at least one day';
  const starts = resolved.movedFrom && resolved.dueDate ? `, starts ${formatDayLabel(resolved.dueDate)}` : '';
  if (kind === 'monthly') {
    const md = resolved.recurrenceMonthDay ?? 1;
    const base = `Repeats on the ${ordinal(md)} of every month${starts}`;
    return md >= 29 ? `${base}. ${SHORT_MONTH_NOTE}` : base;
  }
  if (resolved.recurrence === 'daily') return 'Repeats every day';
  if (kind === 'biweekly') {
    if (allSeven(days)) return `Repeats every day of every other week${starts}`;
    return `Repeats every other week on ${formatDayList(days)}${starts}`;
  }
  return `Repeats ${daysPhrase(days)}${starts}`;
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
