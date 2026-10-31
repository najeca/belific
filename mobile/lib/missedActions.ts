import { loadTasksRaw, updateTask } from './storage';
import { completeTaskById, patchTask } from './taskActions';
import { missedOneOffs, ownDayCompletedAt } from './missed';
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

// 3.25.0: what a Done or a Skip all changed, to take it back: the rows as they were and as they were left.
export interface MissedDoneResult {
  before: Task[];
  after: Task[];
}

// Done (one task) and Skip all (every missed one off task): each is marked done ON ITS OWN DAY (its Day stays and the
// completion is recorded on that day), through the one completion path, so steps tick and nothing is deleted. A task
// done on the other device in the meantime, or no longer missed, is left alone. `ids`: only these; absent: all missed.
export async function markMissedDone(todayKey: string, ids?: string[]): Promise<MissedDoneResult> {
  const stored = await loadTasksRaw();
  const targets = missedOneOffs(stored, todayKey).filter((t) => !ids || ids.includes(t.id));
  const before: Task[] = [];
  const after: Task[] = [];
  for (const t of targets) {
    await completeTaskById(t.id, true, ownDayCompletedAt(t.dueDate as string));
    before.push(t);
  }
  const now = await loadTasksRaw();
  for (const t of before) {
    const row = now.find((x) => x.id === t.id);
    if (row) after.push(row);
  }
  return { before, after };
}

// Undo: each task goes back to the row it was, but only if it is still exactly as the Done left it (completed, with
// that completion time): a task changed since is never overwritten.
export async function undoMissedDone(result: MissedDoneResult): Promise<number> {
  const now = await loadTasksRaw();
  let n = 0;
  for (const before of result.before) {
    const mine = result.after.find((a) => a.id === before.id);
    const row = now.find((x) => x.id === before.id);
    if (!mine || !row || row.deletedAt || !row.completed || row.completedAt !== mine.completedAt) continue;
    await updateTask({ ...before });
    n += 1;
  }
  return n;
}
