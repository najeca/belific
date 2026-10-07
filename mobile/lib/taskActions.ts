import { addTask, deleteBrainDumpItem, loadTasksRaw, updateTask } from './storage';
import { createDumpConverter } from './dumpConvert';
import { planDropAsSubtask, toggleSubtask, undoDropAsSubtask, withAllDone, type SubtaskDropPlan } from './subtasks';
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
    // Completing ticks every subtask; reopening leaves them as they are.
    const subtasks = completed ? withAllDone(task.subtasks) : task.subtasks;
    const done: Task = {
      ...task,
      completed,
      completedAt: completed ? new Date().toISOString() : undefined,
      ...(subtasks ? { subtasks } : {}),
    };
    await updateTask(done);
    // The next occurrence copies the subtasks, all unticked (from the ticked or
    // unticked list alike).
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

// Ticks or unticks one subtask. The last tick completes the task and
// unticking a subtask of a completed task reopens it, both through
// setTaskCompleted so a repeating task still gets its next occurrence.
export async function toggleSubtaskOn(task: Task, subtaskId: string): Promise<void> {
  const { subtasks, completeTask } = toggleSubtask(task, subtaskId);
  const updated: Task = { ...task, subtasks };
  if (completeTask === null) {
    await updateTask(updated);
    return;
  }
  await updateTask(updated);
  await setTaskCompleted(updated, completeTask);
}

// A legacy phone Brain Dump item becomes a Task in place on its first edit
// (any number of edits, one Task). See lib/dumpConvert.ts.
const dumpConverter = createDumpConverter({
  newId: generateId,
  nowIso: () => new Date().toISOString(),
  addTask,
  updateTask,
  deleteDumpItem: deleteBrainDumpItem,
});
export const editDumpItem = dumpConverter.edit;

// Drop a task onto another card: it becomes a subtask and the dragged task is
// tombstoned. Returns the plan (for Undo) or null when not allowed.
export async function dropAsSubtask(host: Task, dragged: Task): Promise<SubtaskDropPlan | null> {
  const plan = planDropAsSubtask(host, dragged, generateId(), new Date().toISOString());
  if (!plan) return null;
  await updateTask(plan.host);
  await updateTask(plan.tombstoned);
  return plan;
}

export async function undoDropAsSubtaskPlan(plan: SubtaskDropPlan): Promise<void> {
  const { host, dragged } = undoDropAsSubtask(plan, new Date().toISOString(), generateId());
  await updateTask(host);
  await addTask(dragged);
}

// ---- Edits from the card controls (checkpoint 8.2) ----
// Each reads the LATEST stored task first, so two quick edits (a label, then a
// duration) never overwrite each other with a stale copy from the screen.
async function latest(id: string): Promise<Task | undefined> {
  return (await loadTasksRaw()).find((t) => t.id === id && !t.deletedAt);
}

export async function patchTask(id: string, fields: Partial<Task>): Promise<void> {
  const t = await latest(id);
  if (!t) return;
  const next: Task = { ...t, ...fields };
  // A time slot belongs to a Day: clearing the Day also unplaces the task.
  if (!next.dueDate) next.startTime = undefined;
  await updateTask(next);
}

export async function completeTaskById(id: string, done: boolean): Promise<void> {
  const t = await latest(id);
  if (t && t.completed !== done) await setTaskCompleted(t, done);
}

export async function toggleSubtaskById(id: string, subtaskId: string): Promise<void> {
  const t = await latest(id);
  if (t) await toggleSubtaskOn(t, subtaskId);
}
