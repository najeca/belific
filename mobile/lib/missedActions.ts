import { addTask, loadTasksRaw } from './storage';
import { patchTask } from './taskActions';
import { skipOccurrence } from './seriesActions';
import { generateId } from './data';
import { doTodayCopy, missedOneOffs } from './missed';
import { isSeriesRow } from './rollover';
import type { Task } from './types';

// The Missed panel's actions (2.27.0, item 6). Desktop only. Each reads the
// latest stored rows first (a task done on the other device in the meantime is
// left alone) and writes ordinary task edits, queued for sync like any other.

// Today, Tomorrow or a picked day: the Day changes, the time of day stays.
export async function moveTaskTo(id: string, day: string): Promise<void> {
  const t = (await loadTasksRaw()).find((x) => x.id === id);
  if (t && !t.deletedAt && !t.completed && !isSeriesRow(t)) await patchTask(id, { dueDate: day });
}

// Drop: the Day is cleared (patchTask clears the time with it); the task stays
// in its list.
export async function dropDay(id: string): Promise<void> {
  await patchTask(id, { dueDate: undefined });
}

export async function moveMissedAllToday(todayKey: string): Promise<number> {
  const all = missedOneOffs(await loadTasksRaw(), todayKey);
  for (const t of all) await patchTask(t.id, { dueDate: todayKey });
  return all.length;
}

// Skip a missed day of a series: the existing skip tombstone, so the streak
// treats the day as skipped (neutral), exactly like "Skip this day".
export function skipMissed(occ: Task): Promise<void> {
  return skipOccurrence(occ);
}

// Do it today: a new one off task for today, and the missed day of the series
// is skipped (so it leaves the list, and the streak treats it as a skipped day:
// neutral). The copy has no repeat, so ticking it never counts for the series.
export async function doMissedToday(occ: Task, todayKey: string): Promise<Task> {
  const copy = doTodayCopy(occ, generateId(), todayKey, new Date().toISOString(), generateId);
  await addTask(copy);
  await skipOccurrence(occ);
  return copy;
}
