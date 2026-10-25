import { addTask, loadTasksRaw, updateTask } from './storage';
import { completeTaskById, patchTask, setTimeDoneById, toggleSubtaskById } from './taskActions';
import { rootTaskId } from './recurrence';
import {
  deleteSeriesRows,
  endSeriesRows,
  occurrenceFromTemplate,
  ownDay,
  planMoveDay,
  planSkip,
  planThisDayEdit,
  seriesEditTargets,
  seriesOfRows,
  templatePatch,
} from './series';
import { dateKey } from './kanban';
import { askScope } from './scopeAsk';
import type { Task } from './types';

// What a card does to a repeating series (checkpoint 8.4, decision 023). Pure
// rules live in series.ts; this file only reads the stored rows, asks it what to
// change and writes the result through the normal storage calls (so every
// write is queued for sync like any other edit). Desktop only.
//
// Everything runs one after another, so a double click or two quick edits can
// never read "not there yet" twice and write the same occurrence twice.
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn);
  chain = run.catch(() => {});
  return run;
}

async function rowsOfRoot(id: string): Promise<{ root: string; rows: Task[] }> {
  const root = rootTaskId(id);
  const rows = (await loadTasksRaw()).filter((t) => rootTaskId(t.id) === root);
  return { root, rows };
}

const nowIso = () => new Date().toISOString();

// Stores the occurrence a projected card stands for (it is built from the
// CURRENT template, so a later edit wins over the card on screen). Returns the
// stored row, or null when the series is gone or that day was skipped.
export function materialise(projected: Task): Promise<Task | null> {
  return serial(async () => {
    const { root, rows } = await rowsOfRoot(projected.id);
    const existing = rows.find((r) => r.id === projected.id);
    if (existing) return existing.deletedAt ? null : existing;
    const series = seriesOfRows(root, rows);
    if (!series || !projected.dueDate) return null;
    const occurrence = occurrenceFromTemplate(series.template, projected.dueDate, nowIso());
    await addTask(occurrence);
    return occurrence;
  });
}

// Ticking a projected card: that day's occurrence is stored, then completed
// like any task. Nothing else changes.
export async function completeProjected(projected: Task, done: boolean): Promise<void> {
  const stored = await materialise(projected);
  if (stored) await completeTaskById(stored.id, done);
}

// Ticking one time of a projected card that happens several times a day: that day is stored first.
export async function tickTimeProjected(projected: Task, time: string, done: boolean): Promise<void> {
  const stored = await materialise(projected);
  if (stored) await setTimeDoneById(stored.id, time, done);
}

// Ticking one of a projected card's subtasks (their ids are the same on the
// stored occurrence, see series.occurrenceFromTemplate).
export async function toggleProjectedSubtask(projected: Task, subtaskId: string): Promise<void> {
  const stored = await materialise(projected);
  if (stored) await toggleSubtaskById(stored.id, subtaskId);
}

// Writes `fields` onto one stored row, a tombstone included.
async function writeRow(id: string, fields: Partial<Task>): Promise<void> {
  const raw = await loadTasksRaw();
  const row = raw.find((t) => t.id === id);
  if (row) await updateTask({ ...row, ...fields });
}

// Editing a projected card edits the series template (the latest stored row),
// never any other row, never a Day or the completed state. A change to
// "Does not repeat" ends the whole series instead.
export function patchSeries(task: Task, fields: Partial<Task>): Promise<void> {
  return serial(async () => {
    const { rows } = await rowsOfRoot(task.id);
    if ('recurrence' in fields && fields.recurrence === undefined) {
      for (const changed of endSeriesRows(rows, nowIso())) await updateTask(changed);
      return;
    }
    const series = seriesOfRows(rootTaskId(task.id), rows);
    if (!series) return;
    // The template row and every open stored row from today on read the same.
    for (const row of seriesEditTargets(rows, dateKey(new Date()))) await writeRow(row.id, templatePatch(row, fields));
  });
}

// "Does not repeat" on a stored repeating card: the whole series ends (every row
// of the root, tombstones included, loses its rule), then the card's own other
// edits apply to its row.
export function endSeries(task: Task, fields: Partial<Task> = {}): Promise<void> {
  return serial(async () => {
    const { rows } = await rowsOfRoot(task.id);
    for (const changed of endSeriesRows(rows, nowIso())) await updateTask(changed);
  }).then(() => (Object.keys(fields).length > 0 ? patchTask(task.id, fields) : undefined));
}

// "Delete repeating task": open rows are tombstoned, completed history stays but
// stops repeating, on every device once synced.
export function deleteSeries(task: Task): Promise<void> {
  return serial(async () => {
    const { rows } = await rowsOfRoot(task.id);
    for (const changed of deleteSeriesRows(rows, nowIso())) await updateTask(changed);
  });
}

// "Skip this day": a tombstoned stored occurrence with that day's id (the
// existing tombstone mechanism, so sync needs nothing new and a tombstone wins).
// A moved day is skipped by its own row (its id), on its own day.
export function skipOccurrence(task: Task): Promise<void> {
  return serial(async () => {
    const day = ownDay(task);
    if (!day) return;
    const { rows } = await rowsOfRoot(task.id);
    const plan = planSkip(rows, day, nowIso(), task.id);
    if (!plan) return;
    if (rows.some((r) => r.id === plan.tombstone.id)) await updateTask(plan.tombstone);
    else await addTask(plan.tombstone);
    if (plan.templatePatch) await writeRow(plan.templatePatch.id, plan.templatePatch.fields);
    if (plan.templateRow) await addTask(plan.templateRow);
  });
}

// "This day only" (3.4.0): `fields` (a time, a length) on that day alone (series.planThisDayEdit:
// the day is stored if it was only shown, and the next day carries the series when needed).
export function editThisDay(task: Task, fields: Partial<Task>): Promise<Task | null> {
  return serial(async () => {
    const day = ownDay(task);
    if (!day) return null;
    const { rows } = await rowsOfRoot(task.id);
    const stored = rows.some((r) => r.id === task.id && !r.deletedAt);
    const plan = planThisDayEdit(rows, day, fields, nowIso(), stored ? task.id : undefined);
    if (!plan) return null;
    for (const w of plan.writes) await (w.isNew ? addTask(w.row) : updateTask(w.row));
    return plan.moved;
  });
}

// A new time or length for a day of a repeating task asks "This day only / All days" (scopeAsk.ts).
// Dismissed, it does what it did before the question: a projected day changes the series, a stored
// day changes only itself (now without reaching the later days).
export async function editRepeatingTime(task: Task, projected: boolean, fields: Partial<Task>): Promise<void> {
  const answer = await askScope({ title: 'Change the time of a repeating task', fallback: projected ? 'all' : 'day' });
  const scope = answer ?? (projected ? 'all' : 'day');
  if (scope === 'all') await patchSeries(task, fields);
  else await editThisDay(task, fields);
}

// "Move this day" (3.1.0): that day alone goes to `toDay`, with `fields` (a time,
// a length) for that day alone; the rule and every other day stay (series.planMoveDay).
// Returns the row that now stands for the day (the first row's day gets a new
// id), or null when nothing moved.
export function moveDay(task: Task, toDay: string, fields: Partial<Task> = {}): Promise<Task | null> {
  return serial(async () => {
    const day = ownDay(task);
    if (!day) return null;
    const { rows } = await rowsOfRoot(task.id);
    const stored = rows.some((r) => r.id === task.id && !r.deletedAt);
    const plan = planMoveDay(rows, day, toDay, nowIso(), { id: stored ? task.id : undefined, fields });
    if (!plan) return null;
    for (const w of plan.writes) await (w.isNew ? addTask(w.row) : updateTask(w.row));
    return plan.moved;
  });
}
