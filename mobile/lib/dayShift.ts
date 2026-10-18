// Moving a day's tasks (2.27.0): the day header menu's "Shift unfinished to next
// day" and "Push rest of week by a week" (item 10), and the choices when a day
// with tasks is marked away (item 8). Pure: NO runtime imports besides siblings;
// see dayShift.test.ts.
//
// Only unfinished one off tasks move: done tasks and every row of a repeating
// series stay where they are. Each keeps its time of day (startTime) and its
// place among the others, because the board orders a day by its fields (untimed
// first, then by time) and none of those change. The undo is the list of the old
// values, written back as they were.
import type { Task } from './types.ts';
import { addDays, dateKey, isDateKey, parseDateKey, weekStartOf } from './kanban.ts';
import { isSeriesRow } from './rollover.ts';

export interface DayMove {
  id: string;
  from: string;
  to: string;
}

export function canShift(t: Task): boolean {
  return !t.deletedAt && !t.completed && isDateKey(t.dueDate) && !isSeriesRow(t);
}

const next = (key: string, n = 1) => dateKey(addDays(parseDateKey(key), n));

// The Sunday that ends the week of `day` (weeks start on Monday, kanban.ts).
export function weekEndOf(day: string): string {
  return dateKey(addDays(weekStartOf(parseDateKey(day)), 6));
}

// "Shift unfinished to next day": the day's unfinished one off tasks to the day after.
export function planShiftDay(tasks: Task[], day: string): DayMove[] {
  return tasks.filter((t) => canShift(t) && t.dueDate === day).map((t) => ({ id: t.id, from: day, to: next(day) }));
}

// "Push rest of week by a week": from `day` to the end of its week, each
// unfinished one off task seven days on.
export function planPushWeek(tasks: Task[], day: string): DayMove[] {
  const end = weekEndOf(day);
  return tasks
    .filter((t) => canShift(t) && (t.dueDate as string) >= day && (t.dueDate as string) <= end)
    .map((t) => ({ id: t.id, from: t.dueDate as string, to: next(t.dueDate as string, 7) }));
}

// The next days after `day` that are not away, as many as asked for.
export function freeDaysAfter(day: string, away: ReadonlySet<string>, count: number): string[] {
  const out: string[] = [];
  let d = day;
  // An away stretch longer than a year is not a real case; stop there.
  for (let i = 0; i < 400 && out.length < count; i++) {
    d = next(d);
    if (!away.has(d)) out.push(d);
  }
  return out;
}

// Marking a day away with tasks on it: 'next' moves them all to the next day that
// is not away; 'spread' gives them one each to the next free days, in board order.
export function planAwayMoves(tasks: Task[], day: string, mode: 'next' | 'spread', away: ReadonlySet<string>): DayMove[] {
  const mine = boardOrder(tasks.filter((t) => canShift(t) && t.dueDate === day));
  const away2 = new Set(away);
  away2.add(day);
  const days = freeDaysAfter(day, away2, mode === 'next' ? 1 : mine.length);
  return mine.map((t, i) => ({ id: t.id, from: day, to: mode === 'next' ? days[0] : days[i] }));
}

// The order a day column shows its tasks in: untimed first, then by time, then
// by when they were made (kanban.ts uses the same rule).
export function boardOrder(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const at = a.startTime ?? '';
    const bt = b.startTime ?? '';
    if (!at !== !bt) return at ? 1 : -1;
    return at.localeCompare(bt) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
  });
}

// "3 tasks", "1 task".
export function tasksWord(n: number): string {
  return n === 1 ? '1 task' : `${n} tasks`;
}
