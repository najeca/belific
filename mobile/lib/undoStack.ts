// Undo and redo for task changes on the desktop (3.21.0). Pure (no React Native, no storage): see undoStack.test.ts.
//
// Every task write (storage.addTask / updateTask / deleteTask) is recorded as the row before and after it. The
// writes of one gesture (a drag that stores a day and a carrier, a tick that also creates the next day) are ONE
// entry. Undo writes the rows back as ordinary edits (a new updatedAt, queued for sync like any edit), redo
// writes them forward again. A row that has changed since (another device, another edit that is not in the
// stack) is never overwritten: it is skipped, and an entry with nothing left to do is dropped.
//
// Deleted tasks are tombstones (Task.deletedAt): undoing a delete writes the live row back over its tombstone
// with a newer updatedAt, so it wins on every device by the existing merge rules; undoing a create writes a
// tombstone. The stack lives in memory for the session (50 entries), nothing is stored.
import type { Project, Task, TaskList } from './types.ts';
import { idDate, occurrenceFromTemplate, ownDay, seriesOfRows } from './series.ts';
import { rootTaskId } from './recurrence.ts';
import { hasRule, isDeleteEvent, restoredIdCandidates } from './trash.ts';

export const UNDO_LIMIT = 50;
// Writes of the same gesture closer together than this belong to one entry.
export const GROUP_GAP_MS = 1500;

export interface RowChange {
  id: string;
  // Absent: the row did not exist before (a create).
  before?: Task;
  after: Task;
}

export interface UndoEntry {
  changes: RowChange[];
  // "moved Zone 2": the verb and the title, for "Undone: moved Zone 2".
  label: string;
  gesture: number;
  lastAt: number;
  // The row each change stands for after the last undo or redo (a day put back as the series shows it, a
  // tombstone, a stand-in copy): the next step expects to find exactly that.
  written?: Map<string, Task>;
}

// ---- comparing rows ----

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

// The same row, ignoring when it was last written.
export function sameRow(a: Task | undefined, b: Task | undefined): boolean {
  if (!a || !b) return a === b;
  const { updatedAt: _a, ...ra } = a;
  const { updatedAt: _b, ...rb } = b;
  return stable(ra) === stable(rb);
}

// ---- the label ----

// What a change was, in one or two words, from the first write of the gesture.
export function verbOf(change: RowChange): string {
  const { before, after } = change;
  if (!before) {
    if (after.deletedAt) return after.recurrence ? 'skipped' : 'deleted';
    // A day stored by a drag, a tick or a skip (id root:date) is the work of that action, not a new task.
    if (idDate(after.id)) return after.completed ? 'ticked' : 'moved';
    return 'created';
  }
  if (after.deletedAt && !before.deletedAt) return after.recurrence ? 'skipped' : 'deleted';
  if (before.deletedAt && !after.deletedAt) return 'restored';
  if (before.completed !== after.completed) return after.completed ? 'ticked' : 'unticked';
  if (stable(before.timesDone ?? []) !== stable(after.timesDone ?? []) && stable(before.startTime) === stable(after.startTime)) return 'ticked a time of';
  const placed =
    before.dueDate !== after.dueDate || before.startTime !== after.startTime || stable(before.extraTimes ?? []) !== stable(after.extraTimes ?? []);
  if (placed) return 'moved';
  if (before.durationMinutes !== after.durationMinutes) return 'resized';
  return 'edited';
}

export function labelOf(changes: RowChange[]): string {
  if (changes.length === 0) return 'a change';
  const roots = new Set(changes.map((c) => (c.after.id.includes(':') ? c.after.id.slice(0, c.after.id.indexOf(':')) : c.after.id)));
  const first = changes[0];
  if (roots.size > 1) return `${verbOf(first)} ${roots.size} tasks`;
  return `${verbOf(first)} ${first.after.title}`;
}

// ---- the stack ----

export class UndoStack {
  private undoList: UndoEntry[] = [];
  private redoList: UndoEntry[] = [];
  private gestureNo = 0;
  // Off until the desktop home screen turns it on (the phone never records).
  enabled = false;

  markGesture(): void {
    this.gestureNo += 1;
  }

  clear(): void {
    this.undoList = [];
    this.redoList = [];
  }

  get canUndo(): boolean {
    return this.undoList.length > 0;
  }
  get canRedo(): boolean {
    return this.redoList.length > 0;
  }
  get depth(): number {
    return this.undoList.length;
  }
  peekUndo(): UndoEntry | undefined {
    return this.undoList[this.undoList.length - 1];
  }
  peekRedo(): UndoEntry | undefined {
    return this.redoList[this.redoList.length - 1];
  }

  // A task write: the row before (none for a new one) and after.
  record(before: Task | undefined, after: Task, nowMs: number): void {
    if (!this.enabled) return;
    // The same content is not a change (a save that wrote nothing new).
    if (before && sameRow(before, after)) return;
    this.redoList = [];
    const top = this.undoList[this.undoList.length - 1];
    if (top && top.gesture === this.gestureNo && nowMs - top.lastAt <= GROUP_GAP_MS) {
      const at = top.changes.findIndex((c) => c.id === after.id);
      if (at >= 0) top.changes[at] = { id: after.id, before: top.changes[at].before, after };
      else top.changes.push({ id: after.id, before, after });
      // A row that ends where it began is no change at all.
      top.changes = top.changes.filter((c) => !(c.before && sameRow(c.before, c.after)));
      top.lastAt = nowMs;
      if (top.changes.length === 0) this.undoList.pop();
      else top.label = labelOf(top.changes);
      return;
    }
    const changes: RowChange[] = [{ id: after.id, before, after }];
    this.undoList.push({ changes, label: labelOf(changes), gesture: this.gestureNo, lastAt: nowMs });
    if (this.undoList.length > UNDO_LIMIT) this.undoList.shift();
  }

  // Takes the top undo entry off (to be undone) and puts it on the redo stack, or the other way.
  moveToRedo(): void {
    const e = this.undoList.pop();
    if (e) this.redoList.push(e);
  }
  moveToUndo(): void {
    const e = this.redoList.pop();
    if (e) this.undoList.push(e);
  }
  // An entry that can no longer be applied (its rows changed since) is dropped.
  dropUndo(): void {
    this.undoList.pop();
  }
  dropRedo(): void {
    this.redoList.pop();
  }
}

// ---- planning ----

export interface UndoPlan {
  // The rows to store, in order (the storage layer stamps a new updatedAt on each).
  writes: Task[];
  // Rows that were left alone because they changed since.
  skipped: number;
}

// Is `cur` the state this step expects to find? `state` undefined stands for "the row did not exist": a missing
// row or a tombstone of it.
function atState(cur: Task | undefined, state: Task | undefined): boolean {
  if (!state) return !cur || !!cur.deletedAt;
  return !!cur && sameRow(cur, state);
}

// Undo of a row the entry CREATED. A day of a repeating task (id root:date) that a drag, a tick or a skip stored
// goes back to what the series shows there; any other row is deleted (a tombstone).
function uncreate(cur: Task, rows: Task[], created: Set<string>, nowIso: string): Task {
  const day = idDate(cur.id);
  if (day) {
    // The series as it was before the entry: without any of the rows the entry created (a changed day and the
    // day stored to carry the series would otherwise read as each other's template).
    const root = rootTaskId(cur.id);
    const series = seriesOfRows(root, rows.filter((r) => rootTaskId(r.id) === root && !created.has(r.id)));
    if (series) return occurrenceFromTemplate(series.template, day, nowIso);
  }
  return { ...cur, deletedAt: cur.deletedAt ?? nowIso, updatedAt: nowIso };
}

export interface PlanContext {
  labels: Array<Pick<Project, 'key' | 'deletedAt'>>;
  lists: Array<Pick<TaskList, 'key' | 'deletedAt'>>;
}
const NO_CONTEXT: PlanContext = { labels: [], lists: [] };

// A tombstone is never cleared (it wins every sync merge), so a deleted or skipped row cannot come back under its
// own id. What comes back is a LIVE ROW THAT STANDS IN for it, by the rules of the Trash (lib/trash.ts):
//  - the first row of a series, skipped: the day is stored as root:day, with the repeat rule, so the series goes on;
//  - anything else: a copy under the Trash's restored id, with no repeat rule and no running timer.
// A deleted task's old tombstone is touched, as Restore does, so it leaves the Trash.
function reviveRows(tomb: Task, content: Task, rows: Map<string, Task>, ctx: PlanContext, nowIso: string): Task[] {
  const { deletedAt: _d, timerStartedAt: _t, ...rest } = content;
  const day = ownDay(content);
  if (content.recurrence && day && !idDate(content.id)) {
    const id = `${rootTaskId(content.id)}:${day}`;
    if (!rows.has(id)) return [{ ...rest, id, updatedAt: nowIso }];
  }
  const { recurrence: _r, recurrenceDays: _rd, recurrenceMonthDay: _rm, ...plain } = rest;
  let id = '';
  for (const candidate of restoredIdCandidates(content.id)) {
    const found = rows.get(candidate);
    if (!found) {
      id = candidate;
      break;
    }
    if (!found.deletedAt) return [found];
  }
  if (!id) return [];
  const copy: Task = { ...plain, id, updatedAt: nowIso };
  if (copy.listKey && !ctx.lists.some((l) => l.key === copy.listKey && !l.deletedAt)) delete copy.listKey;
  if (copy.projectKey && !ctx.labels.some((l) => l.key === copy.projectKey && !l.deletedAt)) delete copy.projectKey;
  const out: Task[] = [copy];
  if (isDeleteEvent(tomb)) out.push({ ...tomb, updatedAt: new Date(Math.max(Date.parse(nowIso), Date.parse(tomb.deletedAt as string) + 1)).toISOString() });
  return out;
}

// Undo (dir 'undo': after -> before) or redo (dir 'redo': before -> after) of one entry against the stored rows
// `current` (tombstones included). Each row is checked against the state this step expects, so a row that changed
// since is skipped, never overwritten. `written` is what each change stands for afterwards (kept on the entry).
export function planStep(entry: UndoEntry, current: Task[], nowIso: string, dir: 'undo' | 'redo', ctx: PlanContext = NO_CONTEXT): UndoPlan & { written: Map<string, Task> } {
  const rows = new Map(current.map((t) => [t.id, t]));
  // Undo goes backwards, and the rows the entry CREATED are taken back last: a day given back as the series shows it
  // reads the series as the other rows of the entry have just been put back.
  const list = dir === 'undo' ? [...entry.changes].reverse().sort((x, y) => Number(!x.before) - Number(!y.before)) : entry.changes;
  const writes: Task[] = [];
  const written = new Map<string, Task>();
  let skipped = 0;
  const put = (row: Task) => {
    writes.push(row);
    rows.set(row.id, row);
  };
  const expected = (c: RowChange): Task | undefined => entry.written?.get(c.id) ?? (dir === 'undo' ? c.after : c.before);
  const target = (c: RowChange): Task | undefined => (dir === 'undo' ? c.before : c.after);
  // A deleted series is one entry: only its latest row comes back (as the Trash does), not one copy per day.
  const winner = new Map<string, string>();
  const reviving = (c: RowChange) => {
    const to = target(c);
    const cur = rows.get((expected(c) ?? c.after).id);
    return !!to && !to.deletedAt && !!cur?.deletedAt && isDeleteEvent(cur);
  };
  for (const c of list) {
    if (!reviving(c)) continue;
    const root = rootTaskId(c.id);
    const best = winner.get(root);
    const mine = ownDay(target(c) as Task) ?? '';
    const bestChange = best ? list.find((x) => x.id === best) : undefined;
    if (!bestChange || mine >= (ownDay(target(bestChange) as Task) ?? '')) winner.set(root, c.id);
  }
  const createdIds = new Set(dir === 'undo' ? entry.changes.filter((c) => !c.before).map((c) => c.id) : []);
  // The days an undone create gives back: the skipped first row of the same day needs no stand-in then.
  const covered = new Set<string>();
  if (dir === 'undo') for (const c of entry.changes) if (!c.before && !c.after.deletedAt && idDate(c.after.id)) covered.add(`${rootTaskId(c.after.id)}|${idDate(c.after.id)}`);

  for (const c of list) {
    const from = expected(c);
    const cur = rows.get(from ? from.id : c.id);
    if (!atState(cur, from)) {
      skipped += 1;
      continue;
    }
    const to = target(c);
    let row: Task[] = [];
    if (!to) {
      if (!cur) continue;
      row = cur.deletedAt ? reviveRows(cur, c.after, rows, ctx, nowIso) : [uncreate(cur, [...rows.values()], createdIds, nowIso)];
    } else if (cur?.deletedAt && !to.deletedAt) {
      if (isDeleteEvent(cur) && winner.get(rootTaskId(c.id)) !== c.id) continue;
      if (hasRule(cur) && covered.has(`${rootTaskId(c.id)}|${ownDay(to)}`)) continue;
      row = reviveRows(cur, to, rows, ctx, nowIso);
    } else if (to.deletedAt && cur && !cur.deletedAt && cur.id !== to.id) {
      row = [{ ...cur, deletedAt: nowIso, updatedAt: nowIso }];
    } else {
      row = [{ ...to, updatedAt: nowIso }];
    }
    for (const r of row) put(r);
    if (row[0]) written.set(c.id, row[0]);
  }
  return { writes, skipped, written };
}

export type StepOutcome = { ok: true; dir: 'undo' | 'redo'; label: string } | { ok: false; text: string };

// One whole undo or redo against the stored rows: plans the top entry, and moves it between the stacks when
// something was written (dropping it when everything it touched has changed since). The caller stores `writes`.
export function stepStack(s: UndoStack, dir: 'undo' | 'redo', rows: Task[], nowIso: string, ctx: PlanContext = NO_CONTEXT): UndoPlan & { outcome: StepOutcome } {
  const entry = dir === 'undo' ? s.peekUndo() : s.peekRedo();
  if (!entry) return { writes: [], skipped: 0, outcome: { ok: false, text: dir === 'undo' ? 'Nothing to undo' : 'Nothing to redo' } };
  const plan = planStep(entry, rows, nowIso, dir, ctx);
  if (plan.writes.length === 0) {
    if (dir === 'undo') s.dropUndo();
    else s.dropRedo();
    return { writes: [], skipped: plan.skipped, outcome: { ok: false, text: `Can't ${dir} "${entry.label}": it changed since` } };
  }
  entry.written = plan.written;
  if (dir === 'undo') s.moveToRedo();
  else s.moveToUndo();
  return { writes: plan.writes, skipped: plan.skipped, outcome: { ok: true, dir, label: entry.label } };
}

export const stack = new UndoStack();
