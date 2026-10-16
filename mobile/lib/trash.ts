// The Trash (build plan phase 6). Pure: NO runtime imports besides siblings; see
// trash.test.ts.
//
// Deleting a task writes a TOMBSTONE: the row stays, marked deletedAt. A
// tombstone always wins a sync merge and nothing can clear it, so a task can
// never be brought back under its own id. RESTORE therefore makes a NEW task
// with the same fields and a new id, and the old tombstone stays (decided with
// Jethro, 2026-10-16; the same way Undo of a drop-as-subtask works).
//
// What is in the Trash: tasks deleted in the last 30 days (TRASH_DAYS). The
// tombstones themselves are kept longer for sync and streak history under the
// existing retention (90 days; 400 for the days of a repeating task, ten years
// for monthly and annual ones). There is no "delete forever": a tombstone has to
// stay so every device learns of the delete.
//
// Which tombstones are deletions. Every row carries only deletedAt and
// updatedAt, so a deletion is told by its shape:
//   - A DELETE EVENT: deletedAt equals updatedAt (nothing has touched the row
//     since) and the row carries no repeat rule. A plain delete, "Delete
//     repeating task" (it clears the rule on every row), and a merge into
//     another task all write this.
//   - A SKIPPED DAY keeps its repeat rule, so it is not one. Skips are planned,
//     cannot be undone, and are not in the Trash.
//   - A tombstone touched afterwards (a series ended, or it was RESTORED: the
//     restore touches the old tombstone) no longer has deletedAt equal to
//     updatedAt, so it leaves the Trash on every device once synced.
// A repeating task deleted as a series has one tombstone per open day: they are
// ONE entry, restored as ONE plain task from the latest row. Its repeat rule was
// cleared when it was deleted and cannot be recovered; set Repeat again.
import type { Project, Task, TaskList } from './types.ts';
import { rootTaskId } from './recurrence.ts';
import { ownDay } from './series.ts';

export const TRASH_DAYS = 30;
const DAY_MS = 86400000;
// A task merged into another one (dragged onto it as a subtask) is tombstoned
// like a delete. It is told apart only by its effect: a live task has a subtask
// with the same title and was written at or after the merge (within this slack
// before it, for clocks). That is a guess, so a match is shown as "Merged into
// another task" with no Restore button.
export const MERGE_SLACK_MS = 10000;

function ms(iso: string | undefined): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? NaN : t;
}

export function hasRule(t: Pick<Task, 'recurrence' | 'recurrenceDays' | 'recurrenceMonthDay'>): boolean {
  return !!t.recurrence || !!t.recurrenceDays || t.recurrenceMonthDay !== undefined;
}

export function isDeleteEvent(t: Task): boolean {
  if (!t.deletedAt || hasRule(t)) return false;
  const d = ms(t.deletedAt);
  return !Number.isNaN(d) && d === ms(t.updatedAt);
}

function norm(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function isMergedInto(row: Task, tasks: Task[]): boolean {
  if (rootTaskId(row.id) !== row.id) return false;
  const want = norm(row.title);
  if (!want) return false;
  const at = ms(row.deletedAt);
  return tasks.some(
    (t) =>
      !t.deletedAt &&
      t.id !== row.id &&
      ms(t.updatedAt) >= at - MERGE_SLACK_MS &&
      (t.subtasks ?? []).some((s) => norm(s.title) === want),
  );
}

export type TrashKind = 'task' | 'series' | 'merged';

export interface TrashEntry {
  kind: TrashKind;
  // The row Restore brings back (the latest of a series).
  row: Task;
  title: string;
  deletedAt: string;
  // Tombstones behind the entry (a series has one per open day).
  count: number;
  restorable: boolean;
  note?: string;
}

export const MERGED_NOTE = 'Merged into another task';
export const SERIES_NOTE = 'Repeating task. Its repeat was cleared when it was deleted, so Restore brings back one plain task: set Repeat again.';

function latest(rows: Task[]): Task {
  return [...rows].sort(
    (a, b) =>
      (ownDay(b) ?? '').localeCompare(ownDay(a) ?? '') || (b.deletedAt as string).localeCompare(a.deletedAt as string) || b.id.localeCompare(a.id),
  )[0];
}

export function trashEntries(tasks: Task[], nowMs: number): TrashEntry[] {
  const cutoff = nowMs - TRASH_DAYS * DAY_MS;
  const groups = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!isDeleteEvent(t)) continue;
    const at = ms(t.deletedAt);
    if (at < cutoff || at > nowMs + DAY_MS) continue;
    const root = rootTaskId(t.id);
    const list = groups.get(root);
    if (list) list.push(t);
    else groups.set(root, [t]);
  }
  const out: TrashEntry[] = [];
  for (const rows of groups.values()) {
    const row = latest(rows);
    const series = rows.length > 1 || rootTaskId(row.id) !== row.id;
    if (!series && isMergedInto(row, tasks)) {
      out.push({ kind: 'merged', row, title: row.title, deletedAt: row.deletedAt as string, count: 1, restorable: false, note: MERGED_NOTE });
    } else {
      out.push({ kind: series ? 'series' : 'task', row, title: row.title, deletedAt: row.deletedAt as string, count: rows.length, restorable: true, ...(series ? { note: SERIES_NOTE } : {}) });
    }
  }
  return out.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt) || a.row.id.localeCompare(b.row.id));
}

export function agoText(deletedAt: string, nowMs: number): string {
  const days = Math.floor((nowMs - Date.parse(deletedAt)) / DAY_MS);
  if (days <= 0) return 'Deleted today';
  return days === 1 ? 'Deleted yesterday' : `Deleted ${days} days ago`;
}

// ---- restore ----

// The id the restored copy gets: deterministic, so two devices restoring the
// same item at the same time write the SAME row (one new task, not two), and a
// second press does nothing. A colon becomes an underscore so the copy never
// joins a series group (rootTaskId splits at the first colon). If an earlier
// copy was deleted again, the next id is used.
export function restoredIdCandidates(oldId: string): string[] {
  const base = oldId.replace(/:/g, '_');
  return [`restored_${base}`, ...Array.from({ length: 50 }, (_, i) => `restored${i + 2}_${base}`)];
}

export interface RestorePlan {
  // The new task to write, or null when it already exists live (nothing to add).
  create: Task | null;
  // The id the restored task has (new or already there).
  restoredId: string;
  // The old tombstone, touched so it leaves the Trash on every device.
  touch: Task;
}

export function planRestore(
  entryRow: Task,
  tasks: Task[],
  labels: Array<Pick<Project, 'key' | 'deletedAt'>>,
  lists: Array<Pick<TaskList, 'key' | 'deletedAt'>>,
  nowIso: string,
): RestorePlan | null {
  const row = tasks.find((t) => t.id === entryRow.id);
  // Gone, or no longer a delete event (already restored on another device, or
  // ended): nothing to do.
  if (!row || !isDeleteEvent(row)) return null;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  let id = '';
  let existing: Task | undefined;
  for (const candidate of restoredIdCandidates(row.id)) {
    const found = byId.get(candidate);
    if (!found) {
      id = candidate;
      break;
    }
    if (!found.deletedAt) {
      id = candidate;
      existing = found;
      break;
    }
  }
  if (!id) return null;
  // Touching the tombstone: updatedAt moves, deletedAt stays. At least a
  // millisecond later, so the two can never be equal again.
  const touchedAt = ms(nowIso) > ms(row.deletedAt) ? nowIso : new Date(ms(row.deletedAt) + 1).toISOString();
  const touch: Task = { ...row, updatedAt: touchedAt };
  if (existing) return { create: null, restoredId: id, touch };
  const { deletedAt: _d, timerStartedAt: _t, recurrence: _r, recurrenceDays: _rd, recurrenceMonthDay: _rm, ...rest } = row;
  const copy: Task = { ...rest, id, updatedAt: nowIso };
  if (copy.listKey && !lists.some((l) => l.key === copy.listKey && !l.deletedAt)) delete copy.listKey;
  if (copy.projectKey && !labels.some((l) => l.key === copy.projectKey && !l.deletedAt)) delete copy.projectKey;
  return { create: copy, restoredId: id, touch };
}
