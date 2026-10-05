import { addTask, loadTasksRaw, updateTask } from './storage';
import { buildNextOccurrence, nextOccurrenceId, nextOccurrence } from './recurrence';
import { dateKey } from './kanban';
import type { Task } from './types';

// The ONE place a task is completed or un-completed (checkpoint 2b). Every
// completion point must call setTaskCompleted rather than writing
// `completed` itself, so a recurring task always gets its next occurrence.
// Desktop calls it today (kanban checkbox, task form). When sync arrives
// (checkpoint 5) the iOS app must call it too, otherwise a recurring task
// completed on the phone would never create its next occurrence.
//
// Un-completing never removes an occurrence that was already created.

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
