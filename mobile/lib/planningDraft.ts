// The draft behind Daily Planning and Daily Shutdown (build plan phase 5,
// section 4). Pure: NO runtime imports besides siblings; see
// planningDraft.test.ts.
//
// Everything done inside a flow is a DRAFT held in memory: ticking a missed task
// as done, pulling a task onto today, adding one, moving one to tomorrow or next
// week, giving one a time. Nothing is written until Finish. Cancel (or closing
// the flow) throws the draft away, so every task is exactly as it was: there is
// no write to undo. Finish turns the draft into writes (finishWrites), and in
// Planning it also rolls the unfinished tasks of earlier days onto today
// (rollover.ts), except those the draft already decided about.
import type { Task } from './types.ts';
import { addDays, dateKey, parseDateKey, weekStartOf } from './kanban.ts';
import { canRollToToday, planCarryToTomorrow, planRollover } from './rollover.ts';

export interface Draft {
  // Edits of stored tasks, by id (merged).
  edits: Record<string, Partial<Task>>;
  // Tasks typed in the flow.
  added: Task[];
  // Missed days of repeating series to skip on Finish (2.27.0, the Missed list).
  skips?: Task[];
}

export const EMPTY_DRAFT: Draft = { edits: {}, added: [] };

export function draftSkip(d: Draft, occ: Task): Draft {
  if ((d.skips ?? []).some((s) => s.id === occ.id && s.dueDate === occ.dueDate)) return d;
  return { ...d, skips: [...(d.skips ?? []), occ] };
}

export function isSkipDrafted(d: Draft, occ: Pick<Task, 'id' | 'dueDate'>): boolean {
  return (d.skips ?? []).some((s) => s.id === occ.id && s.dueDate === occ.dueDate);
}

export function draftEdit(d: Draft, id: string, fields: Partial<Task>): Draft {
  const added = d.added.find((t) => t.id === id);
  if (added) return { ...d, added: d.added.map((t) => (t.id === id ? { ...t, ...fields } : t)) };
  return { ...d, edits: { ...d.edits, [id]: { ...(d.edits[id] ?? {}), ...fields } } };
}

export function draftAdd(d: Draft, task: Task): Draft {
  return { ...d, added: [...d.added, task] };
}

export function isEmptyDraft(d: Draft): boolean {
  return Object.keys(d.edits).length === 0 && d.added.length === 0 && (d.skips ?? []).length === 0;
}

// The tasks as the flow shows them: stored rows with the draft's edits, plus
// the added ones. Never changes `tasks`.
export function draftView(tasks: Task[], d: Draft): Task[] {
  return [...tasks.map((t) => (d.edits[t.id] ? { ...t, ...d.edits[t.id] } : t)), ...d.added];
}

// Days the flow moves tasks to.
export function nextWeekStart(todayKey: string): string {
  return dateKey(addDays(weekStartOf(parseDateKey(todayKey)), 7));
}

export interface Writes {
  patches: Array<{ id: string; fields: Partial<Task> }>;
  adds: Task[];
}

function changedFields(stored: Task, fields: Partial<Task>): Partial<Task> | null {
  const out: Partial<Task> = {};
  let any = false;
  for (const [k, v] of Object.entries(fields) as Array<[keyof Task, unknown]>) {
    if (stored[k] !== v) {
      (out as Record<string, unknown>)[k] = v;
      any = true;
    }
  }
  return any ? out : null;
}

// What Finish writes. Planning: the draft, then the rollover of every remaining
// unfinished task of an earlier day (one the draft did not move or complete).
// Shutdown: the draft, then today's unfinished tasks chosen to go to tomorrow.
export function finishWrites(
  tasks: Task[],
  d: Draft,
  todayKey: string,
  mode: 'planning' | 'shutdown',
  carry: ReadonlySet<string> = new Set(),
): Writes {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const patches: Writes['patches'] = [];
  for (const [id, fields] of Object.entries(d.edits)) {
    const stored = byId.get(id);
    if (!stored || stored.deletedAt) continue;
    const changed = changedFields(stored, fields);
    if (changed) patches.push({ id, fields: changed });
  }
  const decided = new Set(Object.keys(d.edits).filter((id) => 'dueDate' in d.edits[id] || 'completed' in d.edits[id]));
  if (mode === 'planning') {
    for (const p of planRollover(tasks, todayKey)) if (!decided.has(p.id)) patches.push(p);
  } else {
    for (const p of planCarryToTomorrow(tasks, todayKey, carry)) if (!decided.has(p.id)) patches.push(p);
  }
  return { patches, adds: d.added.map((t) => ({ ...t })) };
}

// ---- what the steps show ----

export function missedTasks(tasks: Task[], todayKey: string): Task[] {
  return tasks.filter((t) => canRollToToday(t, todayKey)).sort((a, b) => (a.dueDate as string).localeCompare(b.dueDate as string) || a.title.localeCompare(b.title));
}

export function doneOn(tasks: Task[], dayKey: string): Task[] {
  return tasks.filter((t) => !t.deletedAt && t.completed && t.completedAt && dateKey(new Date(t.completedAt)) === dayKey);
}

export function onDay(tasks: Task[], dayKey: string): Task[] {
  return tasks.filter((t) => !t.deletedAt && t.dueDate === dayKey);
}
