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
import { rootTaskId } from './recurrence.ts';
import { isMustDo } from './mustDo.ts';

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

// `includeDated` (2.27.0, item 4): a named list keeps showing its tasks once they
// have a Day (they show their day and time); they come after the tasks with no
// Day, earliest day and time first. A repeating task shows once, on its earliest
// open day. Brain Dump (no list) keeps its rule: a Day takes a task off it.
export function splitThoughts(tasks: Task[], dumpItems: BrainDumpItem[], todayKey: string, opts: { includeDated?: boolean } = {}): ThoughtLists {
  const rows: ThoughtRow[] = [];
  const doneToday: Task[] = [];
  const dated: Task[] = [];

  for (const task of tasks) {
    if (task.deletedAt) continue;
    // A Day takes a task off this list (it is on the week board). A malformed
    // Day counts as no Day.
    if (isDateKey(task.dueDate)) {
      if (!opts.includeDated) continue;
      if (!task.completed) dated.push(task);
      else if (task.completedAt && dateKey(new Date(task.completedAt)) === todayKey) doneToday.push(task);
      continue;
    }
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

  // 2.29.0: top priority tasks first (display only), then newest first as before.
  const top = (r: (typeof rows)[number]) => (r.kind === 'task' && isMustDo(r.task) ? 0 : 1);
  rows.sort((a, b) => top(a) - top(b) || b.createdAt.localeCompare(a.createdAt) || rowId(a).localeCompare(rowId(b)));
  if (dated.length > 0) {
    dated.sort((a, b) => (a.dueDate as string).localeCompare(b.dueDate as string) || (a.startTime ?? '').localeCompare(b.startTime ?? '') || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const seenRoot = new Set<string>();
    for (const t of dated) {
      if (t.recurrence || t.id.includes(':')) {
        const root = rootTaskId(t.id);
        if (seenRoot.has(root)) continue;
        seenRoot.add(root);
      }
      rows.push({ kind: 'task', task: t, createdAt: t.createdAt });
    }
  }
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
