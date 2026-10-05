// Pure helpers for the desktop kanban (checkpoint 2). Deliberately has NO
// react-native or other runtime imports so `node --test` can run it; see
// kanban.test.ts. Dates are local calendar days as 'YYYY-MM-DD' keys, the
// same format as Task.dueDate and CustomEvent.date.
import type { Task } from './types';

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The duration chips in the task modal. 2h+ stores 120.
export const DURATION_CHOICES = [
  { label: '15m', minutes: 15 },
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '2h+', minutes: 120 },
];

export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isDateKey(key: unknown): key is string {
  if (typeof key !== 'string' || !KEY_PATTERN.test(key)) return false;
  const d = parseDateKey(key);
  return dateKey(d) === key;
}

// Local midnight of the given day.
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Calendar arithmetic, not millisecond arithmetic, so a 23 or 25 hour day
// (clocks changing) never skips or repeats a date.
export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export interface ColumnDay {
  key: string;
  date: Date;
}

// `count` consecutive local days starting at `start`'s day.
export function buildColumnDays(start: Date, count = 14): ColumnDay[] {
  const first = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const days: ColumnDay[] = [];
  for (let i = 0; i < count; i++) {
    const date = addDays(first, i);
    days.push({ key: dateKey(date), date });
  }
  return days;
}

// "Mon 6 Oct"
export function formatDayLabel(key: string): string {
  const d = parseDateKey(key);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

// Column title: Today and Tomorrow by name, otherwise "Mon 6 Oct".
export function formatDayTitle(key: string, todayKey: string): string {
  if (key === todayKey) return 'Today';
  if (key === dateKey(addDays(parseDateKey(todayKey), 1))) return 'Tomorrow';
  return formatDayLabel(key);
}

// "6 Oct"
export function formatShortDate(key: string): string {
  const d = parseDateKey(key);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

// 15 -> "15m", 60 -> "1h", 90 -> "1h 30m", 120 -> "2h"
export function formatDuration(minutes?: number): string | undefined {
  if (!minutes || minutes <= 0) return undefined;
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export interface ColumnItem {
  task: Task;
  // Set when an unfinished task from a past day is surfaced in Today. The
  // stored dueDate is left alone until the user moves it.
  overdueFrom?: string;
}

export interface KanbanColumns {
  unscheduled: ColumnItem[];
  days: Record<string, ColumnItem[]>;
  // Planned beyond the last visible day. Shown only when non-empty so a
  // far-future task never disappears from the board.
  later: ColumnItem[];
}

// Order inside a column: unfinished first (carried-over tasks, then High
// priority, then oldest created), finished last (most recently completed
// first).
function compareItems(a: ColumnItem, b: ColumnItem): number {
  const aDone = a.task.completed;
  const bDone = b.task.completed;
  if (aDone !== bDone) return aDone ? 1 : -1;
  if (aDone && bDone) return (b.task.completedAt ?? '').localeCompare(a.task.completedAt ?? '');
  if (!!a.overdueFrom !== !!b.overdueFrom) return a.overdueFrom ? -1 : 1;
  if (a.overdueFrom && b.overdueFrom && a.overdueFrom !== b.overdueFrom) {
    return a.overdueFrom.localeCompare(b.overdueFrom);
  }
  const aHigh = a.task.priority === 'high';
  const bHigh = b.task.priority === 'high';
  if (aHigh !== bHigh) return aHigh ? -1 : 1;
  return a.task.createdAt.localeCompare(b.task.createdAt);
}

// Puts tasks into kanban columns.
//  - no (or malformed) dueDate: Unscheduled
//  - dueDate inside the visible days: that day's column
//  - past dueDate, unfinished: Today, tagged overdueFrom, sorted first
//  - past dueDate, finished: not shown (columns start today)
//  - dueDate after the last visible day: Later
// Deleted (tombstoned) tasks are never shown. `days` must be consecutive
// and start at today (see buildColumnDays).
export function bucketTasks(tasks: Task[], days: ColumnDay[], todayKey: string): KanbanColumns {
  const result: KanbanColumns = { unscheduled: [], days: {}, later: [] };
  for (const day of days) result.days[day.key] = [];
  const lastKey = days.length > 0 ? days[days.length - 1].key : todayKey;

  for (const task of tasks) {
    if (task.deletedAt) continue;
    const due = task.dueDate;
    if (!isDateKey(due)) {
      result.unscheduled.push({ task });
    } else if (due < todayKey) {
      if (task.completed) continue;
      if (todayKey in result.days) result.days[todayKey].push({ task, overdueFrom: due });
    } else if (due > lastKey) {
      result.later.push({ task });
    } else if (due in result.days) {
      result.days[due].push({ task });
    }
  }

  result.unscheduled.sort(compareItems);
  result.later.sort((a, b) => (a.task.dueDate ?? '').localeCompare(b.task.dueDate ?? '') || compareItems(a, b));
  for (const key of Object.keys(result.days)) result.days[key].sort(compareItems);
  return result;
}
