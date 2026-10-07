// Pure sync rules (checkpoint 5, decision 013). NO runtime imports, so
// `node --test` runs it; see syncCore.test.ts and syncEngine.test.ts. The
// engine (syncEngine.ts) moves rows; this file decides what happens to them.
//
// Conflict model, "last to reach the server wins":
//  - A pulled TOMBSTONE always wins. It replaces the local row and cancels a
//    pending local edit of that row (delete beats edit, in either order).
//  - A PENDING local change (still in the outbox) beats a pulled live row: it
//    is about to reach the server and will then be the newest version there.
//  - With nothing pending, the pulled row wins: the server order decides.
//  - A local tombstone the server shows alive is pushed again.
//  - Only the FIRST full pass (no cursor yet: first sign in, upgrade, or a
//    server without server_updated_at) also compares updatedAt, parsed with
//    Date.parse, to decide whether a local row that never went through the
//    outbox is newer than the server's copy.
//  - Live upserts never send deleted_at, so they cannot undelete a row.
import type {
  BrainDumpItem,
  CustomCategory,
  CustomEvent,
  Project,
  RecurrenceRule,
  Routine,
  RoutineCompletion,
  Subtask,
  Task,
  WeekDay,
} from './types.ts';

export type TimestampedTable =
  | 'custom_events'
  | 'brain_dump_items'
  | 'routines'
  | 'tasks'
  | 'projects'
  | 'custom_categories';
export type SyncTable = TimestampedTable | 'routine_completions';

export const TIMESTAMPED_TABLES: TimestampedTable[] = [
  'custom_events',
  'brain_dump_items',
  'routines',
  'tasks',
  'projects',
  'custom_categories',
];

// --- Time ---

// ISO strings from this app end in "Z"; Postgres returns "+00:00". Never
// compare them as strings (V7d). Unparseable means "oldest".
export function parseTime(value: unknown): number {
  if (typeof value !== 'string') return 0;
  const t = Date.parse(value);
  return Number.isNaN(t) ? 0 : t;
}

// Incremental pulls ask for rows changed since the cursor minus this, so a
// row whose transaction committed a moment after a later timestamped one is
// not skipped. Re-applying a row is harmless.
export const CURSOR_OVERLAP_MS = 5000;

export function cursorQueryFrom(cursor: string): string {
  return new Date(parseTime(cursor) - CURSOR_OVERLAP_MS).toISOString();
}

export function maxServerTime(rows: Array<Record<string, unknown>>, current: string | null): string | null {
  let best = current;
  for (const r of rows) {
    const t = r.server_updated_at;
    if (typeof t === 'string' && (best === null || parseTime(t) > parseTime(best))) best = t;
  }
  return best;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// --- Outbox ---

export interface OutboxEntry {
  table: SyncTable;
  key: string;
  op: 'upsert' | 'delete';
  // The local row (camelCase) as it was when queued; mapped at send time.
  row?: Record<string, unknown>;
  version: number;
}

export interface OutboxState {
  entries: OutboxEntry[];
  seq: number;
  attempts: number;
  nextAttemptAt: number;
}

export const EMPTY_OUTBOX: OutboxState = { entries: [], seq: 0, attempts: 0, nextAttemptAt: 0 };

// One entry per (table, key): a newer write replaces the older one and gets a
// new version, so an entry rewritten while its push is in flight survives.
export function enqueue(
  state: OutboxState,
  items: Array<{ table: SyncTable; key: string; op: 'upsert' | 'delete'; row?: Record<string, unknown> }>,
): OutboxState {
  let seq = state.seq;
  const byKey = new Map(state.entries.map((e) => [`${e.table}|${e.key}`, e]));
  for (const item of items) {
    seq += 1;
    byKey.set(`${item.table}|${item.key}`, { ...item, version: seq });
  }
  return { ...state, entries: [...byKey.values()], seq };
}

// Removes the entries that were sent, unless they were rewritten meanwhile.
export function removeSent(state: OutboxState, sent: OutboxEntry[]): OutboxState {
  const done = new Set(sent.map((e) => `${e.table}|${e.key}|${e.version}`));
  return { ...state, entries: state.entries.filter((e) => !done.has(`${e.table}|${e.key}|${e.version}`)) };
}

export function dropKeys(state: OutboxState, table: SyncTable, keys: string[]): OutboxState {
  if (keys.length === 0) return state;
  const drop = new Set(keys);
  return { ...state, entries: state.entries.filter((e) => !(e.table === table && drop.has(e.key))) };
}

export function pendingFor(state: OutboxState, table: SyncTable): Map<string, OutboxEntry> {
  const map = new Map<string, OutboxEntry>();
  for (const e of state.entries) if (e.table === table) map.set(e.key, e);
  return map;
}

// 5s, 15s, 45s, ... capped at 15 minutes.
export function backoffMs(attempts: number): number {
  if (attempts <= 0) return 0;
  return Math.min(15 * 60 * 1000, 5000 * 3 ** (attempts - 1));
}

export function recordFailure(state: OutboxState, now: number): OutboxState {
  const attempts = state.attempts + 1;
  return { ...state, attempts, nextAttemptAt: now + backoffMs(attempts) };
}

export function recordSuccess(state: OutboxState): OutboxState {
  return { ...state, attempts: 0, nextAttemptAt: 0 };
}

// --- Capabilities (what the server's schema has) ---

export interface Caps {
  // Migration 1: server_updated_at on every table (incremental pulls).
  serverUpdatedAt: boolean;
  // Migration 2: the task pipeline columns and projects.color_key.
  taskPipeline: boolean;
  // Migration 3 (20261007120000): tasks.subtasks and tasks.reminder_minutes.
  // Optional so a stored older caps value reads as false.
  taskExtras?: boolean;
  // Migration 4 (20261007130000): tasks.actual_seconds. Optional, like taskExtras.
  taskActual?: boolean;
}

export const NO_CAPS: Caps = { serverUpdatedAt: false, taskPipeline: false };

// Local fields that only reach the server once migration 2 is applied. Until
// then a pull must keep the local values (the server copy lacks them).
export const TASK_PIPELINE_FIELDS = [
  'durationMinutes',
  'startTime',
  'recurrence',
  'recurrenceDays',
  'recurrenceMonthDay',
] as const;
export const PROJECT_PIPELINE_FIELDS = ['colorKey'] as const;
// Local task fields that wait for migration 3.
export const TASK_EXTRA_FIELDS = ['subtasks', 'reminderMinutes'] as const;
// Local task field that waits for migration 4 (checkpoint 8.3).
export const TASK_ACTUAL_FIELDS = ['actualSeconds'] as const;

export function preserveFieldsFor(table: TimestampedTable, caps: Caps): string[] {
  if (table === 'tasks') {
    return [
      ...(caps.taskPipeline ? [] : TASK_PIPELINE_FIELDS),
      ...(caps.taskExtras ? [] : TASK_EXTRA_FIELDS),
      ...(caps.taskActual ? [] : TASK_ACTUAL_FIELDS),
    ];
  }
  if (table === 'projects' && !caps.taskPipeline) return [...PROJECT_PIPELINE_FIELDS];
  return [];
}

// A local row that carries values the server could not store before
// migration 2 (queued again once the columns appear).
export function hasPipelineValues(table: TimestampedTable, row: Record<string, unknown>): boolean {
  const fields: readonly string[] =
    table === 'tasks' ? TASK_PIPELINE_FIELDS : table === 'projects' ? PROJECT_PIPELINE_FIELDS : [];
  return fields.some((f) => row[f] !== undefined && row[f] !== null);
}

// A local task that carries values only migration 3 can store.
export function hasExtrasValues(table: TimestampedTable, row: Record<string, unknown>): boolean {
  if (table !== 'tasks') return false;
  const sub = row.subtasks;
  return (Array.isArray(sub) && sub.length > 0) || (row.reminderMinutes !== undefined && row.reminderMinutes !== null);
}

// A local task that carries a value only migration 4 can store.
export function hasActualValues(table: TimestampedTable, row: Record<string, unknown>): boolean {
  return table === 'tasks' && row.actualSeconds !== undefined && row.actualSeconds !== null;
}

// --- Merge of a pulled page into local rows ---

export interface Syncable {
  updatedAt: string;
  deletedAt?: string;
}

export interface MergeResult<T> {
  rows: T[];
  // Local rows to (re)queue for upload.
  toEnqueue: T[];
  // Pending outbox entries cancelled by a pulled tombstone.
  dropPending: string[];
  changed: boolean;
}

function keepLocalFields<T>(remote: T, local: T | undefined, fields: string[]): T {
  if (!local || fields.length === 0) return remote;
  const out = { ...remote } as Record<string, unknown>;
  const l = local as Record<string, unknown>;
  for (const f of fields) if (out[f] === undefined && l[f] !== undefined) out[f] = l[f];
  return out as T;
}

export function mergeRows<T extends Syncable>(input: {
  local: T[];
  remote: T[];
  keyOf: (row: T) => string;
  pending: Map<string, OutboxEntry>;
  // Fields to keep from the local row when the server copy lacks them.
  preserveFields: string[];
  // 'full': every server row was fetched (first pass, or no cursor column).
  mode: 'full' | 'incremental';
}): MergeResult<T> {
  const { keyOf, pending, preserveFields, mode } = input;
  const localByKey = new Map(input.local.map((r) => [keyOf(r), r]));
  const remoteKeys = new Set<string>();
  const merged = new Map(localByKey);
  const toEnqueue: T[] = [];
  const dropPending: string[] = [];
  let changed = false;

  const put = (key: string, row: T) => {
    const before = merged.get(key);
    if (before === undefined || JSON.stringify(before) !== JSON.stringify(row)) changed = true;
    merged.set(key, row);
  };

  for (const r of input.remote) {
    const key = keyOf(r);
    remoteKeys.add(key);
    const l = localByKey.get(key);
    const p = pending.get(key);
    if (r.deletedAt) {
      // Tombstone wins over any live version, pending or not.
      put(key, keepLocalFields(r, l, preserveFields));
      if (p && !(p.row as Syncable | undefined)?.deletedAt) dropPending.push(key);
      continue;
    }
    if (p) continue; // a pending local change wins; it is about to be pushed
    if (l?.deletedAt) {
      // The server shows a row this device deleted (e.g. an older client
      // re-sent it). Tombstones win: keep it and push the delete again.
      toEnqueue.push(l);
      continue;
    }
    if (mode === 'full' && l && parseTime(l.updatedAt) > parseTime(r.updatedAt)) {
      // First pass only: a local row edited while sync was off is newer.
      toEnqueue.push(l);
      continue;
    }
    put(key, keepLocalFields(r, l, preserveFields));
  }

  if (mode === 'full') {
    // Local rows the server has never seen (created while signed out, or
    // before this version): upload them, tombstones included.
    for (const [key, l] of localByKey) {
      if (!remoteKeys.has(key) && !pending.has(key)) toEnqueue.push(l);
    }
  }

  return { rows: [...merged.values()], toEnqueue, dropPending, changed };
}

// --- Routine completions (hard deletes, no timestamps) ---

export function completionKey(c: { routineId: string; date: string }): string {
  return `${c.routineId}|${c.date}`;
}

// `seen` holds the keys this device has confirmed on the server (pulled, or
// pushed successfully). A local completion missing from a full server list:
//  - pending add          -> keep (it is being uploaded)
//  - seen before          -> it was deleted elsewhere: drop it (V7a)
//  - never seen, no entry -> made while sync was off: upload it
// A server completion missing locally is added, unless a delete is pending.
export function mergeCompletions(input: {
  local: RoutineCompletion[];
  remote: RoutineCompletion[];
  pending: Map<string, OutboxEntry>;
  seen: Set<string>;
}): { rows: RoutineCompletion[]; toEnqueue: RoutineCompletion[]; seen: Set<string>; changed: boolean } {
  const remoteByKey = new Map(input.remote.map((c) => [completionKey(c), c]));
  const rows: RoutineCompletion[] = [];
  const toEnqueue: RoutineCompletion[] = [];
  let changed = false;
  const localKeys = new Set<string>();

  for (const c of input.local) {
    const key = completionKey(c);
    localKeys.add(key);
    if (remoteByKey.has(key)) {
      rows.push(c);
      continue;
    }
    const p = input.pending.get(key);
    if (p?.op === 'upsert') rows.push(c);
    else if (input.seen.has(key)) changed = true; // deleted elsewhere
    else {
      rows.push(c);
      toEnqueue.push(c);
    }
  }
  for (const [key, c] of remoteByKey) {
    if (localKeys.has(key)) continue;
    if (input.pending.get(key)?.op === 'delete') continue;
    rows.push(c);
    changed = true;
  }
  return { rows, toEnqueue, seen: new Set(remoteByKey.keys()), changed };
}

// --- Mappers (local camelCase <-> remote snake_case) ---

const WEEK_DAYS: WeekDay[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const RULES: RecurrenceRule[] = ['daily', 'weekly', 'biweekly', 'triweekly', 'monthly'];

// Bad values become null instead of failing a whole upload batch.
export function sanitizeDuration(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 1440 ? v : null;
}
export function sanitizeTime(v: unknown): string | null {
  return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null;
}
export function sanitizeRule(v: unknown): RecurrenceRule | null {
  return typeof v === 'string' && (RULES as string[]).includes(v) ? (v as RecurrenceRule) : null;
}
export function sanitizeDays(v: unknown): WeekDay[] | null {
  if (!Array.isArray(v)) return null;
  const days = WEEK_DAYS.filter((d) => v.includes(d));
  return days.length > 0 ? days : null;
}
export function sanitizeMonthDay(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 31 ? v : null;
}

export const MAX_SUBTASKS = 50;
export const MAX_SUBTASK_TITLE = 200;
// A clean list for the jsonb column: at most 50 items, ids and titles capped,
// blanks dropped, duplicate ids dropped. Empty or invalid is null.
export function sanitizeSubtasks(v: unknown): Subtask[] | null {
  if (!Array.isArray(v)) return null;
  const out: Subtask[] = [];
  const seen = new Set<string>();
  for (const x of v) {
    if (out.length >= MAX_SUBTASKS) break;
    if (!x || typeof x !== 'object') continue;
    const o = x as { id?: unknown; title?: unknown; done?: unknown };
    if (typeof o.id !== 'string' || o.id.length === 0 || typeof o.title !== 'string') continue;
    const id = o.id.slice(0, 80);
    const title = o.title.trim().slice(0, MAX_SUBTASK_TITLE);
    if (!title || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, title, done: o.done === true });
  }
  return out.length > 0 ? out : null;
}
// -1 (off) or 0 to 1440 minutes before; anything else is no value (default).
// Whole seconds, 0 to a year; anything else is no value.
export function sanitizeActual(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 366 * 24 * 60 * 60 ? v : null;
}
export function sanitizeReminder(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= -1 && v <= 1440 ? v : null;
}

type Remote = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
// A column present with null means "no value"; a column missing from the
// row (old schema) also reads as undefined and is kept from local by merge.
const opt = <V>(r: Remote, col: string): V | undefined => (r[col] === null || r[col] === undefined ? undefined : (r[col] as V));

// Only a tombstone carries deleted_at, so a live upsert never clears one.
function withDeleted(row: Remote, deletedAt: string | undefined): Remote {
  if (deletedAt) row.deleted_at = deletedAt;
  return row;
}

export function eventToRemote(e: CustomEvent): Remote {
  return withDeleted(
    {
      id: e.id,
      title: e.title,
      category: e.category,
      icon: e.icon,
      start: e.start,
      end: e.end,
      notes: e.notes ?? '',
      date: e.date,
      recurrence: e.recurrence ?? null,
      series_id: e.seriesId ?? null,
      recurrence_days: e.recurrenceDays ?? null,
      priority: e.priority ?? null,
      origin: e.origin ?? null,
      updated_at: e.updatedAt,
    },
    e.deletedAt,
  );
}
export function eventFromRemote(r: Remote): CustomEvent {
  return {
    id: String(r.id),
    title: String(r.title),
    category: String(r.category),
    icon: String(r.icon),
    start: String(r.start),
    end: String(r.end),
    notes: str(r.notes) ?? '',
    date: String(r.date),
    recurrence: opt(r, 'recurrence'),
    seriesId: opt(r, 'series_id'),
    recurrenceDays: opt(r, 'recurrence_days'),
    priority: opt(r, 'priority'),
    origin: opt(r, 'origin'),
    updatedAt: String(r.updated_at),
    deletedAt: opt(r, 'deleted_at'),
  };
}

export function dumpToRemote(i: BrainDumpItem): Remote {
  return withDeleted(
    { id: i.id, title: i.title, notes: i.notes ?? '', created_at: i.createdAt, updated_at: i.updatedAt },
    i.deletedAt,
  );
}
export function dumpFromRemote(r: Remote): BrainDumpItem {
  return {
    id: String(r.id),
    title: String(r.title),
    notes: str(r.notes) ?? '',
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    deletedAt: opt(r, 'deleted_at'),
  };
}

export function routineToRemote(x: Routine): Remote {
  return withDeleted(
    { id: x.id, title: x.title, time_of_day: x.timeOfDay, created_at: x.createdAt, updated_at: x.updatedAt },
    x.deletedAt,
  );
}
export function routineFromRemote(r: Remote): Routine {
  return {
    id: String(r.id),
    title: String(r.title),
    timeOfDay: r.time_of_day as Routine['timeOfDay'],
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    deletedAt: opt(r, 'deleted_at'),
  };
}

export function taskToRemote(t: Task, caps: Caps): Remote {
  const row: Remote = {
    id: t.id,
    title: t.title,
    due_date: t.dueDate ?? null,
    priority: t.priority ?? null,
    project_key: t.projectKey ?? null,
    notes: t.notes ?? null,
    completed: t.completed,
    completed_at: t.completedAt ?? null,
    created_at: t.createdAt,
    origin: t.origin ?? null,
    updated_at: t.updatedAt,
  };
  if (caps.taskPipeline) {
    row.duration_minutes = sanitizeDuration(t.durationMinutes);
    row.start_time = sanitizeTime(t.startTime);
    row.recurrence = sanitizeRule(t.recurrence);
    row.recurrence_days = sanitizeDays(t.recurrenceDays);
    row.recurrence_month_day = sanitizeMonthDay(t.recurrenceMonthDay);
  }
  if (caps.taskExtras) {
    row.subtasks = sanitizeSubtasks(t.subtasks);
    row.reminder_minutes = sanitizeReminder(t.reminderMinutes);
  }
  if (caps.taskActual) row.actual_seconds = sanitizeActual(t.actualSeconds);
  return withDeleted(row, t.deletedAt);
}
export function taskFromRemote(r: Remote): Task {
  return {
    id: String(r.id),
    title: String(r.title),
    dueDate: opt(r, 'due_date'),
    priority: opt(r, 'priority'),
    projectKey: opt(r, 'project_key'),
    notes: opt(r, 'notes'),
    completed: r.completed === true,
    completedAt: opt(r, 'completed_at'),
    createdAt: String(r.created_at),
    durationMinutes: opt(r, 'duration_minutes'),
    startTime: opt(r, 'start_time'),
    recurrence: opt(r, 'recurrence'),
    recurrenceDays: opt(r, 'recurrence_days'),
    recurrenceMonthDay: opt(r, 'recurrence_month_day'),
    subtasks: sanitizeSubtasks(r.subtasks) ?? undefined,
    reminderMinutes: sanitizeReminder(r.reminder_minutes) ?? undefined,
    actualSeconds: sanitizeActual(r.actual_seconds) ?? undefined,
    origin: opt(r, 'origin'),
    updatedAt: String(r.updated_at),
    deletedAt: opt(r, 'deleted_at'),
  };
}

export function projectToRemote(p: Project, caps: Caps): Remote {
  const row: Remote = { key: p.key, name: p.name, created_at: p.createdAt, updated_at: p.updatedAt };
  if (caps.taskPipeline) row.color_key = typeof p.colorKey === 'string' ? p.colorKey : null;
  return withDeleted(row, p.deletedAt);
}
export function projectFromRemote(r: Remote): Project {
  return {
    key: String(r.key),
    name: String(r.name),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    colorKey: opt(r, 'color_key'),
    deletedAt: opt(r, 'deleted_at'),
  };
}

export function categoryToRemote(c: CustomCategory): Remote {
  return withDeleted(
    { key: c.key, name: c.name, icon: c.icon, color: c.color, created_at: c.createdAt, updated_at: c.updatedAt },
    c.deletedAt,
  );
}
export function categoryFromRemote(r: Remote): CustomCategory {
  return {
    key: String(r.key),
    name: String(r.name),
    icon: String(r.icon),
    color: String(r.color),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    deletedAt: opt(r, 'deleted_at'),
  };
}

export function completionToRemote(c: RoutineCompletion): Remote {
  return { routine_id: c.routineId, date: c.date, completed_at: c.completedAt };
}
export function completionFromRemote(r: Remote): RoutineCompletion {
  return { routineId: String(r.routine_id), date: String(r.date), completedAt: String(r.completed_at) };
}

// Strips keys whose value is undefined, so a stored row never carries
// `"field": undefined` noise and equality checks stay stable.
export function clean<T>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row as Record<string, unknown>)) if (v !== undefined) out[k] = v;
  return out as T;
}

export interface TableSpec {
  table: TimestampedTable;
  // Primary key columns after user_id, and the local key.
  keyColumn: 'id' | 'key';
  keyOf: (row: Record<string, unknown>) => string;
  toRemote: (row: Record<string, unknown>, caps: Caps) => Remote;
  fromRemote: (row: Remote) => Record<string, unknown>;
}

const byId = (r: Record<string, unknown>) => String(r.id);
const byKey = (r: Record<string, unknown>) => String(r.key);

export const TABLE_SPECS: Record<TimestampedTable, TableSpec> = {
  custom_events: {
    table: 'custom_events',
    keyColumn: 'id',
    keyOf: byId,
    toRemote: (r) => eventToRemote(r as unknown as CustomEvent),
    fromRemote: (r) => clean(eventFromRemote(r)) as unknown as Record<string, unknown>,
  },
  brain_dump_items: {
    table: 'brain_dump_items',
    keyColumn: 'id',
    keyOf: byId,
    toRemote: (r) => dumpToRemote(r as unknown as BrainDumpItem),
    fromRemote: (r) => clean(dumpFromRemote(r)) as unknown as Record<string, unknown>,
  },
  routines: {
    table: 'routines',
    keyColumn: 'id',
    keyOf: byId,
    toRemote: (r) => routineToRemote(r as unknown as Routine),
    fromRemote: (r) => clean(routineFromRemote(r)) as unknown as Record<string, unknown>,
  },
  tasks: {
    table: 'tasks',
    keyColumn: 'id',
    keyOf: byId,
    toRemote: (r, caps) => taskToRemote(r as unknown as Task, caps),
    fromRemote: (r) => clean(taskFromRemote(r)) as unknown as Record<string, unknown>,
  },
  projects: {
    table: 'projects',
    keyColumn: 'key',
    keyOf: byKey,
    toRemote: (r, caps) => projectToRemote(r as unknown as Project, caps),
    fromRemote: (r) => clean(projectFromRemote(r)) as unknown as Record<string, unknown>,
  },
  custom_categories: {
    table: 'custom_categories',
    keyColumn: 'key',
    keyOf: byKey,
    toRemote: (r) => categoryToRemote(r as unknown as CustomCategory),
    fromRemote: (r) => clean(categoryFromRemote(r)) as unknown as Record<string, unknown>,
  },
};

// Splits an upload batch into groups with identical column sets. PostgREST
// sends one column list per request and fills a column a row leaves out with
// NULL, so mixing a live row (no deleted_at) with a tombstone in one request
// would clear deleted_at on the live row's server copy. Order is kept within
// each group.
export function groupByColumns(rows: Record<string, unknown>[]): Record<string, unknown>[][] {
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const sig = Object.keys(row).sort().join(',');
    const list = groups.get(sig);
    if (list) list.push(row);
    else groups.set(sig, [row]);
  }
  return [...groups.values()];
}
