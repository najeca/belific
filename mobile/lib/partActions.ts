// What Parts write (R4 of PLAN_repeat_end_and_parts); the rules are in parts.ts. Each gesture is ONE batch save
// (storage.updateTasks) under a new undo mark, so one Ctrl+Z puts it all back. Desktop only.
import type { Task } from './types';
import { addTask, loadTasksRaw, updateTasks } from './storage';
import { generateId } from './data';
import { stack } from './undoStack';
import { deleteWrites, indexById, newPart, parentOf, partsOf, stepsToParts, takeOutRow, type DeleteChoice } from './parts';

const now = () => new Date().toISOString();

// Adds one part to `parent` (quick entry: the caller keeps the box open for the next). Returns the new part, or null
// for a blank name.
export async function addPart(parent: Task, title: string): Promise<Task | null> {
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

// Takes a part out: it becomes an ordinary task on the parent's Day and in its list.
export async function takeOut(part: Task): Promise<void> {
  const raw = await loadTasksRaw();
  const byId = indexById(raw);
  const stored = byId.get(part.id) ?? part;
  const parent = parentOf(stored, byId);
  stack.markGesture();
  await updateTasks([parent ? takeOutRow(stored, parent) : { ...stored, parentId: undefined }]);
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
