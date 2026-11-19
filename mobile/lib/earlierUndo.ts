// 3.59.1: Earlier on the phone. The writes are the desktop's (lib/wrapActions.ts); the desktop's per row Undo comes from
// its undo stack, which never records on the phone (undoStack.enabled stays false there). So the phone takes the rows
// before and after one answer and its Undo writes back what changed: a changed row as it was, a row the answer added
// (the copy "Only the steps left to tomorrow" makes) to the Trash. Pure: NO runtime imports besides siblings; see
// earlierUndo.test.ts.
import type { Task } from './types.ts';
import { isMissedTask } from './missed.ts';

// The rows an Undo writes to put `before` back, given the stored rows `after` one answer.
export function undoRows(before: Task[], after: Task[]): Task[] {
  const was = new Map(before.map((t) => [t.id, t]));
  const out: Task[] = [];
  for (const t of after) {
    const old = was.get(t.id);
    if (!old) {
      if (!t.deletedAt) out.push({ ...t, deletedAt: t.updatedAt || new Date(0).toISOString() });
      continue;
    }
    if (old.updatedAt !== t.updatedAt || !!old.deletedAt !== !!t.deletedAt) out.push(old);
  }
  return out;
}

// What the phone's lists show: a one off task planned for a day before today and not ticked waits in Earlier instead
// (the desktop's rule, lib/missed.ts).
export function withoutEarlier<T extends Task>(tasks: T[], todayKey: string): T[] {
  return tasks.filter((t) => !isMissedTask(t, todayKey));
}

// The words of the pill: "Earlier, 3 to look at" for VoiceOver; the pill shows "Earlier 3".
export const earlierA11y = (n: number): string => (n === 1 ? 'Earlier: 1 task from an earlier day' : `Earlier: ${n} tasks from earlier days`);
