import { addTask, deleteBrainDumpItem, loadTasksRaw, updateTask } from './storage';
import { generateId } from './data';
import { buildNextOccurrence, nextOccurrenceId, nextOccurrence } from './recurrence';
import { dateKey } from './kanban';
import { dumpItemToTask, newThought } from './thoughts';
import type { BrainDumpItem, Task } from './types';

// The ONE place a task is completed or un-completed (checkpoint 2b). Every
// completion point must call setTaskCompleted rather than writing
// `completed` itself, so a recurring task always gets its next occurrence.
// Desktop calls it today (kanban checkbox, task form). When sync arrives
// (checkpoint 5) the iOS app must call it too, otherwise a recurring task
// completed on the phone would never create its next occurrence.
//
// Un-completing never removes an occurrence that was already created. The next
// occurrence counts from the later of the task's Day and today, so it is never
// dated in the past (see recurrence.ts).

// Creation is serialised so a double click can never read "not there yet"
// twice and write the same id twice.
let chain: Promise<unknown> = Promise.resolve();

export function setTaskCompleted(task: Task, completed: boolean): Promise<void> {
  const run = chain.then(async () => {
    await updateTask({
      ...task,
      completed,
      completedAt: completed ? new Date().toISOString() : undefined,
    });
    if (completed && task.recurrence) await createNextOccurrence(task);
  });
  chain = run.catch(() => {});
  return run;
}

// Creates the next occurrence unless a task with that id already exists,
// live or deleted (so two devices, or a repeat completion, never duplicate).
async function createNextOccurrence(task: Task): Promise<void> {
  const todayKey = dateKey(new Date());
  const nextDue = nextOccurrence(task, todayKey);
  if (!nextDue) return;
  const id = nextOccurrenceId(task.id, nextDue);
  const existing = await loadTasksRaw();
  if (existing.some((t) => t.id === id)) return;
  const next = buildNextOccurrence(task, todayKey, new Date().toISOString());
  if (next) await addTask(next);
}

// Desktop capture: a thought typed into the Brain Dump input is a Task right
// away (title only, no Day, origin 'dump'). Returns null for blank input.
export async function createThought(title: string): Promise<Task | null> {
  const task = newThought(generateId(), title, new Date().toISOString());
  if (!task) return null;
  await addTask(task);
  return task;
}

// Converts a legacy BrainDumpItem (from the phone) into a Task in one step,
// applying whatever the user edited, then removes the item. This is the
// existing promote path (the Task is the item's final form). The Task is
// written first, so a crash between the two writes leaves a duplicate rather
// than a loss.
export async function convertDumpItem(item: BrainDumpItem, fields: Partial<Task> = {}): Promise<Task> {
  const task: Task = { ...dumpItemToTask(item, generateId(), new Date().toISOString()), ...fields };
  await addTask(task);
  await deleteBrainDumpItem(item.id);
  return task;
}
