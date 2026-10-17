// Pure subtask rules (checkpoint 8.2, decision 021). No runtime imports besides
// types, so `node --test` runs it; see subtasks.test.ts.
import type { Subtask, Task } from './types.ts';

export const MAX_SUBTASKS = 50;
export const MAX_TITLE = 200;

export function counter(list: Subtask[] | undefined): { done: number; total: number } {
  const l = list ?? [];
  return { done: l.filter((s) => s.done).length, total: l.length };
}

export function counterLabel(list: Subtask[] | undefined): string {
  const { done, total } = counter(list);
  return `${done}/${total}`;
}

const clean = (title: string) => title.trim().slice(0, MAX_TITLE);

// Appends a subtask. A blank title or a full list changes nothing.
export function addSubtask(list: Subtask[] | undefined, title: string, id: string): Subtask[] {
  const l = list ?? [];
  const t = clean(title);
  if (!t || l.length >= MAX_SUBTASKS) return l;
  return [...l, { id, title: t, done: false }];
}

// A blank rename keeps the old title (the edit is cancelled).
export function renameSubtask(list: Subtask[] | undefined, id: string, title: string): Subtask[] {
  const t = clean(title);
  return (list ?? []).map((s) => (s.id === id && t ? { ...s, title: t } : s));
}

export function deleteSubtask(list: Subtask[] | undefined, id: string): Subtask[] {
  return (list ?? []).filter((s) => s.id !== id);
}

// Moves the item at `from` so it ends up at index `to` (both inside the list).
export function moveSubtask(list: Subtask[] | undefined, from: number, to: number): Subtask[] {
  const l = [...(list ?? [])];
  if (from === to || from < 0 || from >= l.length || to < 0 || to >= l.length) return l;
  const [item] = l.splice(from, 1);
  l.splice(to, 0, item);
  return l;
}

export interface ToggleResult {
  subtasks: Subtask[];
  // The task's completion must change to this (through setTaskCompleted), or
  // null when it stays as it is.
  completeTask: boolean | null;
}

// Ticking the last open subtask completes the task; unticking a subtask of a
// completed task reopens it.
export function toggleSubtask(task: Pick<Task, 'subtasks' | 'completed'>, id: string): ToggleResult {
  const before = task.subtasks ?? [];
  const subtasks = before.map((s) => (s.id === id ? { ...s, done: !s.done } : s));
  const target = subtasks.find((s) => s.id === id);
  if (!target) return { subtasks: before, completeTask: null };
  if (target.done && !task.completed && subtasks.every((s) => s.done)) return { subtasks, completeTask: true };
  if (!target.done && task.completed) return { subtasks, completeTask: false };
  return { subtasks, completeTask: null };
}

// Completing the task ticks every subtask. Reopening it leaves them as they are.
export function withAllDone(list: Subtask[] | undefined): Subtask[] | undefined {
  if (!list || list.length === 0) return list;
  return list.map((s) => (s.done ? s : { ...s, done: true }));
}

// The next occurrence of a repeating task gets the same subtasks, all unticked,
// with new ids. The ids are derived from the new task's id so two devices that
// create the same occurrence agree.
export function copyForNextOccurrence(list: Subtask[] | undefined, nextTaskId: string): Subtask[] | undefined {
  if (!list || list.length === 0) return undefined;
  return list.map((s, i) => ({ id: `${nextTaskId}:s${i + 1}`, title: s.title, done: false }));
}
