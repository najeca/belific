// What Parts write (R4 of PLAN_repeat_end_and_parts); the rules are in parts.ts. Each gesture is ONE batch save
// (storage.updateTasks) under a new undo mark, so one Ctrl+Z puts it all back. Desktop only.
import type { Task } from './types';
import { addTask, loadTasksRaw, updateTasks } from './storage';
import { generateId } from './data';
import { stack } from './undoStack';
import { dayRowFor, deleteWrites, newPart, parentTaskOf, partsFor, partsOf, stepsToParts, takeOutRow, type DeleteChoice } from './parts';
import { deleteSeriesRows } from './series';
import { rootTaskId } from './recurrence';
import { opsForProjected, opsForTask } from './taskOps';
import { isDateKey } from './kanban';

const now = () => new Date().toISOString();

// Adds one part to `parent` (quick entry: the caller keeps the box open for the next). Returns the new part, or null
// for a blank name.
export async function addPart(parent: Task, title: string): Promise<Task | null> {
  // (a repeating parent's part points at the series root, parts.newPart)
  const part = newPart(parent, title, generateId(), now());
  if (!part) return null;
  stack.markGesture();
  await addTask(part);
  return part;
}

// Delete with the choice: the task only (its parts become ordinary tasks on its Day and list), or the task and its parts.
export async function deleteWithParts(parent: Task, choice: DeleteChoice): Promise<void> {
  const raw = await loadTasksRaw();
  const stored = raw.find((t) => t.id === parent.id) ?? parent;
  stack.markGesture();
  await updateTasks(deleteWrites(stored, partsOf(raw, parent.id), choice, now()));
}

// Takes a part out: it becomes an ordinary task on the parent's Day and in its list (a part of a repeating parent has no
// Day to go to: it goes to the list).
export async function takeOut(part: Task): Promise<void> {
  const raw = await loadTasksRaw();
  const stored = raw.find((t) => t.id === part.id) ?? part;
  const parent = parentTaskOf(stored, raw);
  const series = !!parent && (!!parent.recurrence || parent.id.includes(':'));
  stack.markGesture();
  await updateTasks([parent ? takeOutRow(stored, series ? { listKey: parent.listKey } : parent) : { ...stored, parentId: undefined }]);
}

// R5: ticks a part (the one place, for the details and the card). An ordinary parent's part is an ordinary tick (it
// follows the parent through setTaskCompleted). A repeating parent's part is that day's row (`part:day`), and the parent's
// day follows the same rules as steps: the last open part done completes that day; unticking one reopens a done day.
export async function setPartDone(parent: Task, part: Task, done: boolean): Promise<void> {
  if (!part.partDay) {
    await opsForTask(part).setCompleted(done);
    return;
  }
  const day = part.partDay;
  stack.markGesture();
  const raw = await loadTasksRaw();
  const template = raw.find((t) => t.id === part.id && !t.deletedAt) ?? part;
  await updateTasks([dayRowFor(template, day, done, now())]);
  const after = await loadTasksRaw();
  const parts = partsFor(after, parent);
  const stored = after.find((t) => t.id === parent.id && !t.deletedAt);
  const ops = stored ? opsForTask(stored) : opsForProjected(parent);
  const parentDone = stored ? !!stored.completed : false;
  if (done && parts.length > 0 && parts.every((p) => p.completed) && !parentDone) await ops.setCompleted(true);
  if (!done && parentDone) await ops.setCompleted(false);
}

// R5: "Delete repeating task" on a series with parts asks too. 'all': the parts' templates go to the Trash with the series
// and the open day rows with them (done day rows stay as history); 'only': the parts become ordinary tasks in the
// parent's list, no Day. One batch, one Ctrl+Z.
export async function deleteSeriesWithParts(task: Task, choice: DeleteChoice): Promise<void> {
  const raw = await loadTasksRaw();
  const root = rootTaskId(task.id);
  const rows = raw.filter((t) => rootTaskId(t.id) === root);
  const at = now();
  const templates = partsOf(raw, root);
  const ids = new Set(templates.map((t) => t.id));
  const writes: Task[] = [...deleteSeriesRows(rows, at)];
  for (const t of templates) {
    writes.push(choice === 'all' ? { ...t, deletedAt: at } : { ...t, parentId: undefined, dueDate: undefined });
  }
  for (const r of raw) {
    // The part's open day rows: with 'all' they go; with 'only' the ticks of days still open mean nothing without the series.
    const base = r.id.slice(0, r.id.indexOf(':'));
    if (r.parentId === root && r.id.includes(':') && !r.deletedAt && !r.completed && ids.has(base) && isDateKey(r.dueDate)) writes.push({ ...r, deletedAt: at });
  }
  stack.markGesture();
  await updateTasks(writes);
}

// Turns the checklist steps into parts (same titles, ticks and order) and empties the checklist. Never automatic.
export async function convertSteps(parent: Task): Promise<number> {
  const raw = await loadTasksRaw();
  const stored = raw.find((t) => t.id === parent.id) ?? parent;
  if (!stored.subtasks || stored.subtasks.length === 0) return 0;
  const ids = stored.subtasks.map(() => generateId());
  const plan = stepsToParts(stored, (i) => ids[i], now());
  stack.markGesture();
  await updateTasks([plan.parent, ...plan.parts]);
  return plan.parts.length;
}
