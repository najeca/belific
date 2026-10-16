// Pure date maths for the Calendar views (build plan phase 3). NO runtime
// imports besides siblings; see calendarView.test.ts. Days are 'YYYY-MM-DD'
// keys in the local calendar, weeks start on Monday (kanban.WEEK_STARTS_ON).
import type { CalendarView } from './paneState.ts';
import { addDays, dateKey, isDateKey, parseDateKey, weekStartOf, MONTHS, WEEKDAYS } from './kanban.ts';
import { PX_PER_HOUR } from './timebox.ts';
import type { Task } from './types.ts';

export interface MonthCell {
  key: string;
  inMonth: boolean;
  isToday: boolean;
}

// The weeks of the month containing `anchorKey`, Monday first, padded with the
// neighbouring months' days to whole weeks (4 to 6 rows of 7).
export function monthGrid(anchorKey: string, todayKey: string): MonthCell[][] {
  const anchor = parseDateKey(anchorKey);
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const start = weekStartOf(first);
  const rows: MonthCell[][] = [];
  for (let d = start; d.getTime() <= last.getTime(); d = addDays(d, 7)) {
    const row: MonthCell[] = [];
    for (let i = 0; i < 7; i++) {
      const day = addDays(d, i);
      const key = dateKey(day);
      row.push({ key, inMonth: day.getMonth() === anchor.getMonth(), isToday: key === todayKey });
    }
    rows.push(row);
  }
  return rows;
}

// The day keys a view shows, in order.
export function visibleDayKeys(view: CalendarView, anchorKey: string): string[] {
  if (view === 'day') return [anchorKey];
  if (view === 'week') {
    const start = weekStartOf(parseDateKey(anchorKey));
    return Array.from({ length: 7 }, (_, i) => dateKey(addDays(start, i)));
  }
  return monthGrid(anchorKey, '').flat().map((c) => c.key);
}

// Previous or next day, week or month. A month step keeps the day number where
// the month has it and otherwise lands on the last day (31 Jan -> 28 Feb).
export function stepAnchor(view: CalendarView, anchorKey: string, delta: number): string {
  const d = parseDateKey(anchorKey);
  if (view === 'day') return dateKey(addDays(d, delta));
  if (view === 'week') return dateKey(addDays(d, 7 * delta));
  const target = new Date(d.getFullYear(), d.getMonth() + delta, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return dateKey(new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), lastDay)));
}

export function isDateInVisible(view: CalendarView, anchorKey: string, key: string): boolean {
  return visibleDayKeys(view, anchorKey).includes(key);
}

// "Mon 12 Oct" for a day, "12 to 18 Oct 2026" for a week, "October 2026" for a month.
export function calendarTitle(view: CalendarView, anchorKey: string): string {
  const d = parseDateKey(anchorKey);
  if (view === 'day') return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  if (view === 'month') return `${new Date(d.getFullYear(), d.getMonth(), 1).toLocaleString('en-GB', { month: 'long' })} ${d.getFullYear()}`;
  const keys = visibleDayKeys('week', anchorKey);
  const a = parseDateKey(keys[0]);
  const b = parseDateKey(keys[6]);
  if (a.getMonth() === b.getMonth()) return `${a.getDate()} to ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
  if (a.getFullYear() === b.getFullYear()) return `${a.getDate()} ${MONTHS[a.getMonth()]} to ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
  return `${a.getDate()} ${MONTHS[a.getMonth()]} ${a.getFullYear()} to ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
}

// Minutes since midnight in the local day.
export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

// Where the current time line sits in the 24 hour grid, in pixels from 00:00.
export function nowLineTop(nowMin: number): number {
  return (Math.max(0, Math.min(1440, nowMin)) * PX_PER_HOUR) / 60;
}

// A day's tasks split for the all day row and the hour grid. A task with a Day
// and no start time is all day; one with a start time sits on the grid.
export function splitAllDay<T extends { task: Pick<Task, 'startTime' | 'dueDate'> }>(items: T[]): { allDay: T[]; timed: T[] } {
  const allDay: T[] = [];
  const timed: T[] = [];
  for (const it of items) (it.task.startTime ? timed : allDay).push(it);
  return { allDay, timed };
}

// Tasks to draw in a calendar day, only valid Days; used by the month view for
// counts and the first few chips.
export function dayOfTask(task: Pick<Task, 'dueDate'>): string | null {
  return isDateKey(task.dueDate) ? task.dueDate : null;
}
