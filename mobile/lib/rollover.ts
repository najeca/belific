// Rollover (build plan phase 5): unfinished tasks from earlier days come to
// today, and in Daily Shutdown today's unfinished tasks go to tomorrow. Pure: NO
// runtime imports besides siblings; see rollover.test.ts.
//
// Jethro's rules (2026-10-16):
//  - It runs only when Finish is pressed in Daily Planning or Daily Shutdown,
//    never on launch.
//  - A task moves only if its Day is before today (Shutdown: is today) and it is
//    not complete. Nothing else is touched: a placed task keeps its start time.
//  - Never a row of a repeating series: a past occurrence stays where it is, so
//    its day stays an honest miss and its streak is not changed.
//
// It is idempotent: a moved task no longer matches, so running it twice, or on
// two devices, writes the same Day once. Two devices that both roll the same task
// write the same value (today's date key), so whichever reaches the server last,
// the result is the same. The writer checks the rule again against the latest
// stored row just before writing (rolloverActions.ts), so a task completed or
// moved since the preview is left alone.
import type { Task } from './types.ts';
import { addDays, dateKey, isDateKey, parseDateKey } from './kanban.ts';
import { idDate } from './series.ts';

export interface DayPatch {
  id: string;
  fields: Pick<Task, 'dueDate'>;
}

// A row of a repeating series: it has a rule, or its id is an occurrence id.
export function isSeriesRow(t: Pick<Task, 'id' | 'recurrence'>): boolean {
  return !!t.recurrence || !!idDate(t.id);
}

export function canRollToToday(t: Task, todayKey: string): boolean {
  return !t.deletedAt && !t.completed && isDateKey(t.dueDate) && t.dueDate < todayKey && !isSeriesRow(t);
}

export function planRollover(tasks: Task[], todayKey: string): DayPatch[] {
  return tasks.filter((t) => canRollToToday(t, todayKey)).map((t) => ({ id: t.id, fields: { dueDate: todayKey } }));
}

export function tomorrowOf(todayKey: string): string {
  return dateKey(addDays(parseDateKey(todayKey), 1));
}

export function canCarryToTomorrow(t: Task, todayKey: string): boolean {
  return !t.deletedAt && !t.completed && t.dueDate === todayKey && !isSeriesRow(t);
}

// Daily Shutdown: today's unfinished tasks to tomorrow (only the ids chosen).
export function planCarryToTomorrow(tasks: Task[], todayKey: string, chosen: ReadonlySet<string>): DayPatch[] {
  const tomorrow = tomorrowOf(todayKey);
  return tasks.filter((t) => chosen.has(t.id) && canCarryToTomorrow(t, todayKey)).map((t) => ({ id: t.id, fields: { dueDate: tomorrow } }));
}

// The rows after the patches (for previews and tests). Never changes `tasks`.
export function applyPatches(tasks: Task[], patches: Array<{ id: string; fields: Partial<Task> }>): Task[] {
  const by = new Map<string, Partial<Task>>();
  for (const p of patches) by.set(p.id, { ...(by.get(p.id) ?? {}), ...p.fields });
  return tasks.map((t) => (by.has(t.id) ? { ...t, ...by.get(t.id) } : t));
}
