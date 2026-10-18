// Lists beside Brain Dump (build plan phase 2). Pure: NO runtime imports besides
// siblings; see lists.test.ts.
//
// Brain Dump is not a stored list: it is the tasks with no listKey (and no
// Day; once planned they are on the board). A named list is a TaskList row and
// its tasks carry its key. A task whose list was deleted (here or on another
// device) reads as Brain Dump, so a task never disappears with its list.
import type { Task, TaskList } from './types.ts';
import { isDateKey } from './kanban.ts';
import { BRAIN_DUMP_EMOJI, DEFAULT_LIST_EMOJI } from './emoji.ts';

export const BRAIN_DUMP_NAME = 'Brain Dump';
export const MAX_LIST_NAME = 40;

export function normalizeListName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

// null when the name is fine, else the sentence to show.
export function listNameProblem(lists: Array<Pick<TaskList, 'key' | 'name' | 'deletedAt'>>, name: string, exceptKey?: string): string | null {
  const wanted = normalizeListName(name);
  if (!wanted) return 'Enter a name';
  if (name.trim().length > MAX_LIST_NAME) return `Use ${MAX_LIST_NAME} characters or fewer`;
  if (wanted === normalizeListName(BRAIN_DUMP_NAME)) return 'Brain Dump is always there';
  if (lists.some((l) => !l.deletedAt && l.key !== exceptKey && normalizeListName(l.name) === wanted)) return 'Another list has that name';
  return null;
}

export function nextSortOrder(lists: Array<Pick<TaskList, 'sortOrder' | 'deletedAt'>>): number {
  let max = -1;
  for (const l of lists) if (!l.deletedAt && l.sortOrder > max) max = l.sortOrder;
  return max + 1;
}

export function newList(key: string, name: string, emoji: string | undefined, sortOrder: number, nowIso: string): TaskList {
  const list: TaskList = { key, name: name.trim().replace(/\s+/g, ' '), sortOrder, createdAt: nowIso, updatedAt: nowIso };
  if (emoji) list.emoji = emoji;
  return list;
}

export function liveLists(lists: TaskList[]): TaskList[] {
  return lists.filter((l) => !l.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

// The list a task is shown in: its own, if that list is alive; else Brain Dump
// (undefined).
export function effectiveListKey(task: Pick<Task, 'listKey'>, lists: Array<Pick<TaskList, 'key' | 'deletedAt'>>): string | undefined {
  if (!task.listKey) return undefined;
  return lists.some((l) => l.key === task.listKey && !l.deletedAt) ? task.listKey : undefined;
}

export function tasksInList<T extends Pick<Task, 'listKey' | 'deletedAt'>>(tasks: T[], listKey: string | undefined, lists: Array<Pick<TaskList, 'key' | 'deletedAt'>>): T[] {
  return tasks.filter((t) => !t.deletedAt && effectiveListKey(t, lists) === listKey);
}

// How many tasks wait in each list, keyed by list key; Brain Dump under the
// empty string. Shown beside the names in the switcher. Brain Dump counts the
// incomplete tasks with no Day; a named list (2.27.0, item 4) counts every
// incomplete task in it, scheduled ones included, as its list shows them.
export function listCounts(
  tasks: Array<Pick<Task, 'listKey' | 'deletedAt' | 'completed' | 'dueDate'>>,
  lists: Array<Pick<TaskList, 'key' | 'deletedAt'>>,
): Map<string, number> {
  const counts = new Map<string, number>([['', 0]]);
  for (const l of lists) if (!l.deletedAt) counts.set(l.key, 0);
  for (const t of tasks) {
    if (t.deletedAt || t.completed) continue;
    const k = effectiveListKey(t, lists) ?? '';
    if (k === '' && isDateKey(t.dueDate)) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

export function listTitle(list: Pick<TaskList, 'name' | 'emoji'> | undefined): string {
  return list ? `${list.emoji ?? DEFAULT_LIST_EMOJI} ${list.name}` : `${BRAIN_DUMP_EMOJI} ${BRAIN_DUMP_NAME}`;
}

// The remembered selection, if that list still exists; else Brain Dump.
export function resolveSelectedList(selected: string | null | undefined, lists: Array<Pick<TaskList, 'key' | 'deletedAt'>>): string | undefined {
  return selected && lists.some((l) => l.key === selected && !l.deletedAt) ? selected : undefined;
}
