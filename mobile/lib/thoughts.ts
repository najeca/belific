// Pure logic for the desktop Brain Dump list (checkpoint 2c). NO runtime
// react-native or storage imports so `node --test` can run it; see
// thoughts.test.ts.
//
// On desktop the thing you capture IS the task: the left pane is simply every
// incomplete Task with no Day, plus any legacy BrainDumpItems (created on the
// phone, which keeps its separate Brain Dump). Setting a Day moves a task onto
// the week board; clearing it brings it back here. Nothing is stored for the
// list itself: it is derived.
import type { BrainDumpItem, Task } from './types.ts';
import { dateKey, isDateKey } from './kanban.ts';

export type ThoughtRow =
  | { kind: 'task'; task: Task; createdAt: string }
  | { kind: 'dump'; item: BrainDumpItem; createdAt: string };

export interface ThoughtLists {
  // Incomplete tasks with no Day and legacy dump items, newest first.
  rows: ThoughtRow[];
  // Day-less tasks completed today (local day), most recent first, so a
  // mistaken tick can be undone.
  doneToday: Task[];
}

export function rowId(row: ThoughtRow): string {
  return row.kind === 'task' ? row.task.id : row.item.id;
}

export function rowTitle(row: ThoughtRow): string {
  return row.kind === 'task' ? row.task.title : row.item.title;
}

export function splitThoughts(tasks: Task[], dumpItems: BrainDumpItem[], todayKey: string): ThoughtLists {
  const rows: ThoughtRow[] = [];
  const doneToday: Task[] = [];

  for (const task of tasks) {
    if (task.deletedAt) continue;
    // A Day takes a task off this list (it is on the week board). A malformed
    // Day counts as no Day.
    if (isDateKey(task.dueDate)) continue;
    if (!task.completed) {
      rows.push({ kind: 'task', task, createdAt: task.createdAt });
    } else if (task.completedAt && dateKey(new Date(task.completedAt)) === todayKey) {
      doneToday.push(task);
    }
  }
  for (const item of dumpItems) {
    if (item.deletedAt) continue;
    rows.push({ kind: 'dump', item, createdAt: item.createdAt });
  }

  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || rowId(a).localeCompare(rowId(b)));
  doneToday.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  return { rows, doneToday };
}

// A thought typed into the capture input: a Task right away, title only.
export function newThought(id: string, title: string, nowIso: string): Task | null {
  const trimmed = title.trim();
  if (!trimmed) return null;
  return { id, title: trimmed, completed: false, createdAt: nowIso, updatedAt: nowIso, origin: 'dump' };
}

// A legacy BrainDumpItem as a Task (the existing promote path: the Task is
// the item's final form and the item is then deleted). Nothing is lost: the
// title, the notes and the original creation time carry over.
export function dumpItemToTask(item: BrainDumpItem, id: string, nowIso: string): Task {
  return {
    id,
    title: item.title,
    notes: item.notes && item.notes.trim().length > 0 ? item.notes : undefined,
    completed: false,
    createdAt: item.createdAt,
    updatedAt: nowIso,
    origin: 'dump',
  };
}
