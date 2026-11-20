// Plan my day guard (3.64.1), pure.
import type { Task } from './types.ts';
import { rootTaskId } from './recurrence.ts';
import { ownDay } from './series.ts';

// 3.64.1: a repeating series that has never started is one stored row (its template) and today is that row's own day.
// The shared skip would tombstone that row and the whole series with it, so Plan my day (only) refuses to skip it.
export function isUnstartedSeriesDay(rows: Task[], task: Task): boolean {
  const root = rootTaskId(task.id);
  const live = rows.filter((r) => !r.deletedAt && rootTaskId(r.id) === root);
  if (live.length !== 1) return false;
  const only = live[0];
  return only.id === root && !!ownDay(only) && ownDay(only) === ownDay(task);
}
export const UNSTARTED_NOTE = "This repeat hasn't started yet, so it can't be skipped here. Pick Today or A time, or skip it from its card.";
