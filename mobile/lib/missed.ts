// The Missed list (2.27.0, item 6): what was planned for a day before today and
// is not done. Computed from the stored rows every time; nothing is stored for it
// and nothing here moves a date. Pure: NO runtime imports besides siblings; see
// missed.test.ts.
//
// 3.25.0: ONE OFF TASKS ONLY. A Day before today, not completed, not deleted, not
// a row of a repeating series. It can go to today, tomorrow, a picked day, have its
// Day dropped (it stays in its list) or be marked done on its own day. The past
// days of a repeating task are never listed: they were the long, overwhelming part
// of the list, and nothing is written for them, they are simply not nagged about
// (a day not done still reads as not done in the streak, quietly, as before).
// Must do first, then the oldest day first, then by title.
import type { Task } from './types.ts';
import { isDateKey, parseDateKey } from './kanban.ts';
import { isSeriesRow } from './rollover.ts';
import { isMustDo } from './mustDo.ts';

export interface MissedItem {
  kind: 'task';
  task: Task;
  day: string;
  stored: true;
}

export function isMissedTask(t: Task, todayKey: string): boolean {
  // A Break is a free gap, not a task to do: it is never missed (PLAN_breaks_as_gaps, P1).
  return !t.deletedAt && !t.completed && !t.cutsBelow && isDateKey(t.dueDate) && t.dueDate < todayKey && !isSeriesRow(t);
}

export function missedItems(tasks: Task[], todayKey: string): MissedItem[] {
  const out: MissedItem[] = [];
  for (const t of tasks) if (isMissedTask(t, todayKey)) out.push({ kind: 'task', task: t, day: t.dueDate as string, stored: true });
  return out.sort(
    (a, b) => Number(isMustDo(b.task)) - Number(isMustDo(a.task)) || a.day.localeCompare(b.day) || a.task.title.localeCompare(b.task.title) || a.task.id.localeCompare(b.task.id),
  );
}

// The one off tasks only (what "Move all to today" and "Skip all" act on).
export function missedOneOffs(tasks: Task[], todayKey: string): Task[] {
  return missedItems(tasks, todayKey).map((m) => m.task);
}

// "Done" and "Skip all" mark a missed task done ON ITS OWN DAY: the time of completion is noon of the day it was planned
// for (local time), so history, analytics and "finished yesterday" count it on that day and not on today. Its Day stays.
export function ownDayCompletedAt(day: string): string {
  const d = parseDateKey(day);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0).toISOString();
}
