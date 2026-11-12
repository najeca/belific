// Parts (R4 of PLAN_repeat_end_and_parts): a full task inside another task, with no time needed. Pure: NO runtime
// imports besides siblings; see parts.test.ts. What is written lives in partActions.ts (one gesture, one batch).
//
// A part is its own task row with `parentId` (migration 005's parent_id). It has its own title, notes, estimate and
// tick; no Day, time, label, list or repeat of its own (those are the parent's). One level only.
//  - Shown as rows in the parent's card with in place ticks and a bar ("2 of 5 done"), never as a card of its own.
//  - ORPHAN RULE: a part whose parent is missing, in the Trash or itself a part shows as an ordinary task in its list;
//    restoring the parent puts it back under it (parentId never changed). It covers older builds, another device
//    deleting the parent and sync arriving out of order.
//  - Totals count once (E2): the parent's own estimate wins; with none, its estimate is the sum of its parts' (done or
//    not); a part never counts on its own (it has no Day, so day totals never see it).
//  - Ticking the last open part completes the parent; unticking a part of a done parent reopens it; completing the
//    parent ticks every part (the same rules as steps).
//  - R4 covers ordinary parents; a repeating parent's parts come in R5, so "Add part" is not offered on a repeating task.
import type { Subtask, Task } from './types.ts';

export const ADD_PART = 'Add part';
export const PARTS = 'Parts';

type Row = Pick<Task, 'id' | 'deletedAt'> & Partial<Pick<Task, 'parentId'>>;

// The live parent of `t`, when `t` is shown as one of its parts (the orphan rule decides).
export function parentOf<T extends Row>(t: Row, byId: Map<string, T>): T | undefined {
  if (!t.parentId || t.deletedAt || t.parentId === t.id) return undefined;
  const parent = byId.get(t.parentId);
  if (!parent || parent.deletedAt || parent.parentId) return undefined;
  return parent;
}

export function indexById<T extends Row>(tasks: T[]): Map<string, T> {
  return new Map(tasks.map((t) => [t.id, t]));
}

// Is `t` shown as a part (under its parent), not as a task of its own?
export function isShownPart<T extends Row>(t: Row, byId: Map<string, T>): boolean {
  return !!parentOf(t, byId);
}

// The live parts of each parent, in the order they were made.
export function partIndex<T extends Row & Pick<Task, 'createdAt'>>(tasks: T[]): Map<string, T[]> {
  const byId = indexById(tasks);
  const out = new Map<string, T[]>();
  for (const t of tasks) {
    const p = parentOf(t, byId);
    if (!p) continue;
    const list = out.get(p.id);
    if (list) list.push(t);
    else out.set(p.id, [t]);
  }
  for (const list of out.values()) list.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1));
  return out;
}

export function partsOf(tasks: Task[], parentId: string): Task[] {
  return partIndex(tasks).get(parentId) ?? [];
}

// The parts' estimates added up (done or not, as a planned total is). A part with no estimate adds nothing.
export function partMinutes(parts: Array<Pick<Task, 'durationMinutes'>>): number {
  let m = 0;
  for (const p of parts) if (typeof p.durationMinutes === 'number' && Number.isFinite(p.durationMinutes) && p.durationMinutes > 0) m += Math.round(p.durationMinutes);
  return m;
}

const hasOwnEstimate = (t: Pick<Task, 'durationMinutes'>): boolean => typeof t.durationMinutes === 'number' && t.durationMinutes > 0;

// What the screens show (E2): every task that is not shown as a part; a parent with no estimate of its own takes the
// sum of its parts' estimates as `partsMinutes` (display only, never stored: storage strips it). Parts are left out.
export function withParts(tasks: Task[]): Task[] {
  const parts = partIndex(tasks);
  if (parts.size === 0) return tasks;
  const byId = indexById(tasks);
  const out: Task[] = [];
  for (const t of tasks) {
    if (isShownPart(t, byId)) continue;
    const list = parts.get(t.id);
    if (list && !hasOwnEstimate(t)) {
      const m = partMinutes(list);
      out.push(m > 0 ? { ...t, partsMinutes: m } : t);
    } else out.push(t);
  }
  return out;
}

export interface PartsProgress {
  done: number;
  total: number;
  // "2 of 5 done"
  text: string;
}
export function partsProgress(parts: Array<Pick<Task, 'completed'>>): PartsProgress {
  const done = parts.filter((p) => p.completed).length;
  return { done, total: parts.length, text: `${done} of ${parts.length} done` };
}

// "Parts add up to 1h 15m." (only when the parent has its own estimate and the parts have some).
export function partsAddUp(parent: Pick<Task, 'durationMinutes'>, parts: Array<Pick<Task, 'durationMinutes'>>, format: (m: number) => string): string | null {
  const m = partMinutes(parts);
  return m > 0 && hasOwnEstimate(parent) ? `Parts add up to ${format(m)}.` : null;
}

// Can `t` hold parts? An ordinary task (R4: not repeating), not itself a part, not free time.
export function canHaveParts(t: Pick<Task, 'recurrence' | 'cutsBelow'> & Partial<Pick<Task, 'parentId'>>): boolean {
  return !t.recurrence && !t.parentId && !t.cutsBelow;
}

// A new part: its own title, no Day, time, label or repeat; the parent's list (so an older build shows it beside its
// parent, the orphan view).
export function newPart(parent: Pick<Task, 'id' | 'listKey'>, title: string, id: string, nowIso: string): Task | null {
  const name = title.trim().replace(/\s+/g, ' ');
  if (!name) return null;
  return { id, title: name, parentId: parent.id, ...(parent.listKey ? { listKey: parent.listKey } : {}), completed: false, createdAt: nowIso, updatedAt: nowIso };
}

// The rows a part's tick writes: the part, and the parent when it follows (the last open part done completes it; a part
// unticked reopens a done parent). `parts` are the parent's parts as stored before the tick.
export function partTickWrites(parent: Task, parts: Task[], partId: string, done: boolean, nowIso: string): Task[] {
  const part = parts.find((p) => p.id === partId);
  if (!part) return [];
  const writes: Task[] = [{ ...part, completed: done, completedAt: done ? nowIso : undefined }];
  const allDone = parts.every((p) => (p.id === partId ? done : p.completed));
  if (done && allDone && !parent.completed) writes.push({ ...parent, completed: true, completedAt: nowIso });
  if (!done && parent.completed) writes.push({ ...parent, completed: false, completedAt: undefined });
  return writes;
}

// Completing the parent ticks every open part (reopening leaves them as they are, as steps do).
export function parentDoneWrites(parts: Task[], nowIso: string): Task[] {
  return parts.filter((p) => !p.completed).map((p) => ({ ...p, completed: true, completedAt: nowIso }));
}

export type DeleteChoice = 'only' | 'all';
// "Delete the task only" (its parts become ordinary tasks on the parent's Day and list) or "Delete the task and its 3
// parts" (all to the Trash together; Restore brings each back).
export function deleteWrites(parent: Task, parts: Task[], choice: DeleteChoice, nowIso: string): Task[] {
  const gone: Task = { ...parent, deletedAt: nowIso };
  if (choice === 'all') return [gone, ...parts.map((p) => ({ ...p, deletedAt: nowIso }))];
  return [gone, ...parts.map((p) => takeOutRow(p, parent))];
}
export const deleteOnlyText = 'Delete the task only';
export const deleteAllText = (n: number): string => `Delete the task and its ${n === 1 ? 'part' : `${n} parts`}`;

// Taking a part out: it becomes an ordinary task, on the parent's Day and in the parent's list.
export function takeOutRow(part: Task, parent: Pick<Task, 'dueDate' | 'listKey'>): Task {
  return { ...part, parentId: undefined, ...(parent.dueDate ? { dueDate: parent.dueDate } : {}), ...(parent.listKey ? { listKey: parent.listKey } : {}) };
}
export const takeOutText = (parentTitle: string): string => `Take out of ${parentTitle}`;

// Steps into parts (never automatic: an older build would lose the list): each step becomes a part with the same title
// and tick, in the same order, and the checklist is emptied. `ids` gives each new part its id; `nowIso` is the moment,
// each part one millisecond apart so the order holds.
export function stepsToParts(parent: Task, ids: (i: number) => string, nowIso: string): { parent: Task; parts: Task[] } {
  const steps: Subtask[] = parent.subtasks ?? [];
  const base = Date.parse(nowIso);
  const parts = steps.map((s, i) => {
    const at = new Date(base + i).toISOString();
    return { ...(newPart(parent, s.title, ids(i), at) as Task), completed: !!s.done, ...(s.done ? { completedAt: nowIso } : {}) };
  });
  return { parent: { ...parent, subtasks: undefined }, parts };
}
export const TURN_INTO_PARTS = 'Turn into parts';
export const CHECKLIST = 'Checklist';
export const partOfText = (parentTitle: string): string => `Part of ${parentTitle}`;

// The same index, kept per tasks array (a screen asks once per card).
const indexCache = new WeakMap<object, Map<string, Task[]>>();
export function partIndexOf(tasks: Task[]): Map<string, Task[]> {
  let idx = indexCache.get(tasks);
  if (!idx) {
    idx = partIndex(tasks);
    indexCache.set(tasks, idx);
  }
  return idx;
}

// A day's tasks with their parents' parts totals (E2), for a total: the parts of `raw` are looked up, but only the
// tasks of `dayTasks` come back (a part has no Day, so it never counts on its own).
export function withPartsOf(dayTasks: Task[], raw: Task[]): Task[] {
  const parts = raw.filter((t) => !!t.parentId);
  if (parts.length === 0) return dayTasks;
  const keep = new Set(dayTasks);
  return withParts([...dayTasks, ...parts]).filter((t) => keep.has(t) || (!t.parentId && dayTasks.some((d) => d.id === t.id)));
}
