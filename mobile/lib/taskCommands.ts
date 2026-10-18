import { addTask, deleteList, loadListsRaw, loadTasksRaw, putList, updateTask } from './storage';
import { generateId } from './data';
import { duplicateTask } from './taskCopy';
import { newThought } from './thoughts';
import { listNameProblem, liveLists, newList, nextSortOrder } from './lists';
import { firstEmoji } from './emoji';
import type { Task, TaskList } from './types';

// Desktop commands of build plan phase 2 that are not an edit of one field:
// duplicate, quick capture into a list or a day, and the lists themselves. The
// rules are pure (taskCopy.ts, lists.ts, thoughts.ts); every write goes
// through storage.ts so it is queued for sync like any other.

export async function duplicateTaskById(id: string): Promise<Task | null> {
  const original = (await loadTasksRaw()).find((t) => t.id === id && !t.deletedAt);
  if (!original) return null;
  const copy = duplicateTask(original, generateId(), new Date().toISOString(), () => generateId());
  await addTask(copy);
  return copy;
}

// A task typed into a capture box: a title, in a list or on a Day, and (2.27.0)
// optionally a label and, on a Day, a time. Returns null for blank text.
export async function createTaskIn(
  title: string,
  where: { listKey?: string; dueDate?: string; startTime?: string; projectKey?: string; durationMinutes?: number } = {},
): Promise<Task | null> {
  const base = newThought(generateId(), title, new Date().toISOString());
  if (!base) return null;
  const task: Task = { ...base };
  if (where.listKey) task.listKey = where.listKey;
  if (where.dueDate) task.dueDate = where.dueDate;
  if (where.dueDate && where.startTime && /^\d\d:\d\d$/.test(where.startTime)) task.startTime = where.startTime;
  if (where.projectKey) task.projectKey = where.projectKey;
  if (where.durationMinutes && where.durationMinutes > 0) task.durationMinutes = Math.round(where.durationMinutes);
  await addTask(task);
  return task;
}

// ---- lists ----

export async function createList(name: string, emojiText?: string): Promise<{ list: TaskList } | { problem: string }> {
  const all = await loadListsRaw();
  const problem = listNameProblem(all, name);
  if (problem) return { problem };
  const list = newList(generateId(), name, firstEmoji(emojiText), nextSortOrder(all), new Date().toISOString());
  await putList(list);
  return { list };
}

export async function renameList(key: string, name: string): Promise<string | null> {
  const all = await loadListsRaw();
  const problem = listNameProblem(all, name, key);
  if (problem) return problem;
  const list = liveLists(all).find((l) => l.key === key);
  if (!list) return 'That list no longer exists';
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (list.name !== trimmed) await putList({ ...list, name: trimmed });
  return null;
}

export async function setListEmoji(key: string, emojiText: string | undefined): Promise<void> {
  const list = liveLists(await loadListsRaw()).find((l) => l.key === key);
  if (!list) return;
  const emoji = firstEmoji(emojiText);
  const next: TaskList = { ...list };
  if (emoji) next.emoji = emoji;
  else delete next.emoji;
  await putList(next);
}

// Deletes a list. Its tasks go back to Brain Dump (they lose the list key), each
// a real edit; then the list is tombstoned. Returns how many tasks moved. A task
// is never deleted with its list.
export async function removeList(key: string): Promise<number> {
  const tasks = (await loadTasksRaw()).filter((t) => !t.deletedAt && t.listKey === key);
  for (const task of tasks) {
    const { listKey: _gone, ...rest } = task;
    await updateTask(rest as Task);
  }
  await deleteList(key);
  return tasks.length;
}
