// The edits the phone's task details make (PLAN_phone P6), as plain field patches. Pure: NO runtime
// imports besides siblings; see detailsPatches.test.ts. Each patch names only the fields it changes;
// it is written with the shared taskOps (patchTask spreads the stored task, then the patch), so every
// field the phone does not edit (cutsBelow, reminders, extraTimes, timesDone, subtasks, listKey,
// emoji, the timer) travels unchanged, and the sync only sends the columns the server has.
import type { Task } from './types.ts';
import { firstEmoji } from './emoji.ts';
import { isMultiTime, moveTimeFields, removeTimeFields } from './times.ts';
import { mustDoPatch } from './mustDo.ts';

// What patchTask does with a patch (taskActions.ts): the stored task, then the fields; a task with no
// Day has no time of day. Used by the tests to prove the phone's edits keep everything else.
export function applyPatch(task: Task, fields: Partial<Task>): Task {
  const next: Task = { ...task, ...fields };
  if (!next.dueDate) next.startTime = undefined;
  return next;
}

export function titlePatch(task: Task, text: string): Partial<Task> | null {
  const title = text.trim().replace(/\s+/g, ' ');
  return title && title !== task.title ? { title } : null;
}

export function emojiPatch(task: Task, text: string): Partial<Task> | null {
  const emoji = firstEmoji(text);
  return emoji === task.emoji ? null : { emoji };
}

export function priorityPatch(on: boolean): Partial<Task> {
  return mustDoPatch(on);
}

// A Day, or none (the time goes with it, patchTask clears it).
export function datePatch(key: string | undefined): Partial<Task> {
  return { dueDate: key };
}

// The task's (first) time: moved with the times rules when the task has several, so its other times
// stay coherent; cleared the same way. Null when the times rules refuse (an overlap): `note` says why.
export function timePatch(task: Task, time: string | undefined): { fields: Partial<Task> } | { note: string } {
  if (!task.startTime) return { fields: { startTime: time } };
  if (time === task.startTime) return { fields: {} };
  if (!isMultiTime(task)) return { fields: { startTime: time } };
  const res = time ? moveTimeFields(task, task.startTime, time) : removeTimeFields(task, task.startTime);
  return res.ok ? { fields: res.fields } : { note: res.note };
}

export function durationPatch(minutes: number | undefined): Partial<Task> {
  return { durationMinutes: minutes };
}

export function labelPatch(key: string | undefined): Partial<Task> {
  return { projectKey: key };
}

export function listPatch(key: string | undefined): Partial<Task> {
  return { listKey: key };
}

export function notesPatch(task: Task, text: string): Partial<Task> | null {
  const notes = text.trim() ? text : undefined;
  return (notes ?? '') === (task.notes ?? '') ? null : { notes };
}
