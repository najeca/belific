import { addRoutineCompletion, deleteRoutineCompletion, deleteTask, updateTask, loadTasksRaw } from './storage';
import { setTaskCompleted, setTimeDoneById, toggleSubtaskById } from './taskActions';
import { completeProjected, deleteSeries, materialise, patchSeries, skipOccurrence, tickTimeProjected, toggleProjectedSubtask } from './seriesActions';
import { duplicateTaskById } from './taskCommands';
import type { Task } from './types';

// What the phone's rows do to a task (PLAN_phone P4), one place for Today, Tasks and the Calendar.
// A projected day of a repeating series (shown, not stored) goes through seriesActions.ts, exactly as
// on the desktop: ticking or editing it stores that day first, a list change edits the series. Every
// write goes through storage.ts, so it is queued for sync like any other edit.

// The stored row as it is now (a row on screen may be older than the last sync).
async function fresh(task: Task): Promise<Task> {
  return (await loadTasksRaw()).find((t) => t.id === task.id) ?? task;
}

// Tick or untick a task, or one time of a task with several times a day.
export async function tickTask(task: Task, projected: boolean, done: boolean, time?: string, multi = false): Promise<void> {
  if (multi && time) {
    if (projected) await tickTimeProjected(task, time, done);
    else await setTimeDoneById(task.id, time, done);
    return;
  }
  if (projected) await completeProjected(task, done);
  else await setTaskCompleted(await fresh(task), done);
}

export function tickRoutine(routineId: string, dayKey: string, done: boolean): Promise<void> {
  return done ? addRoutineCompletion(routineId, dayKey) : deleteRoutineCompletion(routineId, dayKey);
}

export async function toggleSubtask(task: Task, projected: boolean, subtaskId: string): Promise<void> {
  if (projected) await toggleProjectedSubtask(task, subtaskId);
  else await toggleSubtaskById(task.id, subtaskId);
}

// The stored row behind a row on screen (a projected day is stored first). Null when that day is gone.
export async function storedTask(task: Task, projected: boolean): Promise<Task | null> {
  return projected ? materialise(task) : fresh(task);
}

// Brain Dump is no list key. A repeating task changes list for the whole series (a template field).
export async function moveToList(task: Task, projected: boolean, listKey: string | undefined): Promise<void> {
  if (task.recurrence) {
    await patchSeries(task, { listKey });
    return;
  }
  const row = await storedTask(task, projected);
  if (!row) return;
  const { listKey: _old, ...rest } = row;
  await updateTask(listKey ? { ...rest, listKey } : (rest as Task));
}

export async function duplicate(task: Task, projected: boolean): Promise<Task | null> {
  const row = await storedTask(task, projected);
  return row ? duplicateTaskById(row.id) : null;
}

// Deleting a plain task (soft, it goes to Trash). A repeating one is either this day skipped or the series deleted.
export function deleteOne(task: Task): Promise<void> {
  return deleteTask(task.id);
}
export const skipDay = (task: Task): Promise<void> => skipOccurrence(task);
export const deleteRepeating = (task: Task): Promise<void> => deleteSeries(task);
