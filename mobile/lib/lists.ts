// Lists beside Brain Dump (build plan phase 2). Pure: NO runtime imports besides
// siblings; see lists.test.ts.
//
// Brain Dump is not a stored list: it is the tasks with no listKey (and no
// Day; once planned they are on the board). A named list is a TaskList row and
// its tasks carry its key. A task whose list was deleted (here or on another
// device) reads as Brain Dump, so a task never disappears with its list.
import type { Task, TaskList } from './types.ts';
import { isDateKey } from './kanban.ts';
import { BRAIN_DUMP_EMOJI, DEFAULT_LIST_EMOJI, firstEmoji } from './emoji.ts';

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

// 3.12.0: the Create list button. Disabled (with the sentence that says why) while the name is empty, too long,
// Brain Dump's or another list's; an empty name asks for one in a calmer sentence than the command's.
export const CREATE_NEEDS_NAME = 'Type a name to create the list';
export function createListState(lists: Array<Pick<TaskList, 'key' | 'name' | 'deletedAt'>>, name: string): { enabled: boolean; why: string | null } {
  if (!normalizeListName(name)) return { enabled: false, why: CREATE_NEEDS_NAME };
  const problem = listNameProblem(lists, name);
  return { enabled: !problem, why: problem };
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

// The list after the edit box's Save (2.48.0): a new name and emoji on the same row. The key, the sort
// order and createdAt stay, so its tasks (which carry the key) and their history follow it; the caller writes
// the row (storage stamps updatedAt and queues it). No emoji text clears the emoji. The name follows the same
// rule as a new list, except the list's own current name is fine.
export function editedList(
  lists: TaskList[],
  key: string,
  name: string,
  emojiText: string | undefined,
): { list: TaskList } | { problem: string } {
  const problem = listNameProblem(lists, name, key);
  if (problem) return { problem };
  const current = lists.find((l) => l.key === key && !l.deletedAt);
  if (!current) return { problem: 'That list no longer exists' };
  const next: TaskList = { ...current, name: name.trim().replace(/\s+/g, ' ') };
  const emoji = firstEmoji(emojiText);
  if (emoji) next.emoji = emoji;
  else delete next.emoji;
  return { list: next };
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

// The emoji of the list a task is in (2.27.1, shown at the start of a card's
// meta line): only a live named list that has one; Brain Dump, a deleted list or
// a list with no emoji give nothing (never the default list emoji).
export function listEmojiOf(task: Pick<Task, 'listKey'>, lists: Array<Pick<TaskList, 'key' | 'emoji' | 'deletedAt'>>): string | undefined {
  if (!task.listKey) return undefined;
  const list = lists.find((l) => l.key === task.listKey && !l.deletedAt);
  return list?.emoji || undefined;
}

// The name of the live list a task is in (the tooltip of a block's list emoji); Brain Dump, a
// deleted list or a missing one give nothing.
export function listNameOf(task: Pick<Task, 'listKey'>, lists: Array<Pick<TaskList, 'key' | 'name' | 'deletedAt'>>): string | undefined {
  if (!task.listKey) return undefined;
  return lists.find((l) => l.key === task.listKey && !l.deletedAt)?.name || undefined;
}

// A list's name with its emoji when it has one (the details' List row).
export function listOptionText(list: Pick<TaskList, 'name' | 'emoji'>): string {
  return list.emoji ? `${list.emoji} ${list.name}` : list.name;
}

export function listTitle(list: Pick<TaskList, 'name' | 'emoji'> | undefined): string {
  return list ? `${list.emoji ?? DEFAULT_LIST_EMOJI} ${list.name}` : `${BRAIN_DUMP_EMOJI} ${BRAIN_DUMP_NAME}`;
}

// The remembered selection, if that list still exists; else Brain Dump.
export function resolveSelectedList(selected: string | null | undefined, lists: Array<Pick<TaskList, 'key' | 'deletedAt'>>): string | undefined {
  return selected && lists.some((l) => l.key === selected && !l.deletedAt) ? selected : undefined;
}
