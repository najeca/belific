// Duplicate a task (build plan phase 2). Pure: NO runtime imports besides
// siblings; see taskCopy.test.ts.
//
// A copy is a new task with the same description of the work: title, notes,
// priority, label, list, emoji, estimate, reminder, subtasks (new ids, all
// unticked) and its Day. It is not the same piece of work done again, so
// nothing about progress carries over: not completed, no actual time, no
// running timer, no time slot (two blocks would overlap in the Timebox), and no
// repeat rule or series id (a copy of a series member would start a second
// series; repeating is phase 4).
import type { Subtask, Task } from './types.ts';

export function duplicateTask(task: Task, newId: string, nowIso: string, newSubtaskId: (index: number) => string): Task {
  const subtasks: Subtask[] | undefined =
    task.subtasks && task.subtasks.length > 0
      ? task.subtasks.map((s, i) => ({ id: newSubtaskId(i), title: s.title, done: false }))
      : undefined;
  const copy: Task = {
    id: newId,
    title: task.title,
    completed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  if (task.notes) copy.notes = task.notes;
  if (task.priority) copy.priority = task.priority;
  if (task.projectKey) copy.projectKey = task.projectKey;
  if (task.listKey) copy.listKey = task.listKey;
  if (task.emoji) copy.emoji = task.emoji;
  if (task.dueDate) copy.dueDate = task.dueDate;
  if (task.durationMinutes) copy.durationMinutes = task.durationMinutes;
  if (task.reminderMinutes !== undefined && task.reminderMinutes !== null) copy.reminderMinutes = task.reminderMinutes;
  if (task.cutsBelow) copy.cutsBelow = true;
  if (task.reminders) copy.reminders = [...task.reminders];
  if (subtasks) copy.subtasks = subtasks;
  return copy;
}
