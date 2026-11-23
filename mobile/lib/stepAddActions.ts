// What the step by step add flow writes, for both apps (PLAN_desktop_parity D1, 3.66.0). Moved unchanged out of the
// phone's components/phone/StepAdd.tsx (store() and patchNow()) so the desktop's add dialog (D4) stores the same way:
// screen 1 stores the task once (a title, the phrase fields, the list it was added in), every later answer is an ordinary
// edit through taskOps with the shared detailsPatches, and a day, time or length that would leave the task sticking out
// of a break is refused with the details card's note (3.11.0).
import { generateId } from './data';
import { parseQuick, quickFields, type QuickParse } from './quickParse';
import { opsForTask } from './taskOps';
import { addTask, loadTasksRaw } from './storage';
import { breakRefusal } from './hostActions';
import { pushAdded, type PushReport } from './pushAfterActions';
import type { Task } from './types';

// `push`: D7 push after, what the new time pushed later (the Undo bar's words and its Undo, which keeps the task).
export type StepWrite = { refused: string } | { task: Task; push?: PushReport };

// The task screen 1 would store from the words typed (no id stamps yet), or null for an empty box. `phrase` is the parsed
// phrase when the person did not choose "Keep as text".
export function stepDraft(text: string, phrase: QuickParse | null, listKey: string | undefined, now: Date): { task: Task; fields: Partial<Task> } | null {
  const usePhrase = !!(phrase && phrase.found && phrase.title.trim());
  const title = (usePhrase && phrase ? phrase.title : text).trim().replace(/\s+/g, ' ');
  if (!title) return null;
  const fields = usePhrase && phrase ? quickFields(phrase, now) : {};
  const stamp = new Date().toISOString();
  const base: Task = { id: generateId(), title: '', completed: false, createdAt: stamp, updatedAt: stamp, ...(listKey ? { listKey } : {}) };
  return { task: { ...base, title, ...fields }, fields };
}

export function stepPhrase(text: string, plain: boolean, now: Date): QuickParse | null {
  return !plain && text.trim() ? parseQuick(text, now) : null;
}

// Screen 1's Next: stores the draft once. A phrase with a time inside a break it does not fit is refused.
export async function stepStore(next: Task): Promise<StepWrite> {
  if (next.startTime) {
    const refused = await breakRefusal(null, { dueDate: next.dueDate, startTime: next.startTime, durationMinutes: next.durationMinutes }, 'drop');
    if (refused) return { refused };
  }
  const stamp = new Date().toISOString();
  const made = { ...next, createdAt: stamp, updatedAt: stamp };
  await addTask(made);
  const push = await pushAdded(made);
  return { task: made, ...(push ? { push } : {}) };
}

// Every answer after screen 1: an ordinary edit of the stored task, read back as stored.
export async function stepPatch(t: Task, fields: Partial<Task>): Promise<StepWrite> {
  const refused = await breakRefusal(t, fields, 'details');
  if (refused) return { refused };
  await opsForTask(t).patch(fields);
  const stored = (await loadTasksRaw()).find((x) => x.id === t.id && !x.deletedAt);
  const timed = 'startTime' in fields || 'durationMinutes' in fields || 'dueDate' in fields;
  const push = timed ? await pushAdded(stored) : null;
  return { task: stored ?? { ...t, ...fields }, ...(push ? { push } : {}) };
}
