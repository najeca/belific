import { supabase } from './supabase';
import {
  loadCustomEventsRaw,
  saveCustomEvents,
  loadBrainDumpItemsRaw,
  saveBrainDumpItems,
  loadRoutinesRaw,
  saveRoutines,
  loadTasksRaw,
  saveTasks,
  loadProjectsRaw,
  saveProjects,
  loadCustomCategoriesRaw,
  saveCustomCategories,
  loadRoutineCompletions,
  saveRoutineCompletions,
} from './storage';
import type {
  BrainDumpItem,
  CustomCategory,
  CustomEvent,
  EventPriority,
  Project,
  RecurrenceRule,
  Routine,
  RoutineCompletion,
  Task,
  TimeOfDay,
  WeekDay,
} from './types';

// Sync layer for optional-account cloud backup (Phase D). Every
// function here fails silently and never blocks a local write —
// signed-out (the default, most common state) is a fast no-op via the
// session check up front; a network failure while signed in is caught
// and swallowed, same convention as every storage.ts function
// (`catch { // noop }`). Local-first: the local write has already
// completed and is authoritative for the UI by the time any of this
// runs.

async function getUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

// Remote row shapes — snake_case, mirroring the migration SQL exactly.
// Kept separate from the local camelCase types (types.ts) rather than
// reused, since the two are deliberately different naming conventions.
interface RemoteCustomEvent {
  id: string; title: string; category: string; icon: string; start: string; end: string;
  notes: string; date: string; recurrence: RecurrenceRule | null; series_id: string | null;
  recurrence_days: WeekDay[] | null; priority: EventPriority | null; origin: 'dump' | null;
  updated_at: string; deleted_at: string | null;
}
interface RemoteBrainDumpItem {
  id: string; title: string; notes: string; created_at: string; updated_at: string; deleted_at: string | null;
}
interface RemoteRoutine {
  id: string; title: string; time_of_day: TimeOfDay; created_at: string; updated_at: string; deleted_at: string | null;
}
interface RemoteTask {
  id: string; title: string; due_date: string | null; priority: EventPriority | null; project_key: string | null;
  completed: boolean; completed_at: string | null; created_at: string; origin: 'dump' | null;
  updated_at: string; deleted_at: string | null;
}
interface RemoteProject {
  key: string; name: string; created_at: string; updated_at: string; deleted_at: string | null;
}
interface RemoteCustomCategory {
  key: string; name: string; icon: string; color: string; created_at: string; updated_at: string; deleted_at: string | null;
}
interface RemoteRoutineCompletion {
  routine_id: string; date: string; completed_at: string;
}

// --- Generic per-row push, for the six timestamped types ---
// Fire-and-forget upsert of a single row after a local add/update/
// delete(tombstone) — called from storage.ts without awaiting, so it
// never adds latency to a local write. The periodic full sync (below)
// is what catches anything this misses (offline at the time, etc.).

async function pushRow(table: string, row: Record<string, unknown>): Promise<void> {
  try {
    const userId = await getUserId();
    if (!userId) return;
    await supabase.from(table).upsert({ ...row, user_id: userId });
  } catch {
    // noop — the next full sync (sign-in or app foreground) retries.
  }
}

// --- Per-type remote/local row mappers — shared between the
// fire-and-forget single-row push functions above and the full-table
// reconcile below, so the column mapping only ever lives in one place
// per type. Remote columns are snake_case (see the migration SQL);
// local shapes are the camelCase types from types.ts.

const eventToRemote = (e: CustomEvent) => ({
  id: e.id,
  title: e.title,
  category: e.category,
  icon: e.icon,
  start: e.start,
  end: e.end,
  notes: e.notes,
  date: e.date,
  recurrence: e.recurrence ?? null,
  series_id: e.seriesId ?? null,
  recurrence_days: e.recurrenceDays ?? null,
  priority: e.priority ?? null,
  origin: e.origin ?? null,
  updated_at: e.updatedAt,
  deleted_at: e.deletedAt ?? null,
});
const eventFromRemote = (r: RemoteCustomEvent): CustomEvent => ({
  id: r.id,
  title: r.title,
  category: r.category,
  icon: r.icon,
  start: r.start,
  end: r.end,
  notes: r.notes,
  date: r.date,
  recurrence: r.recurrence ?? undefined,
  seriesId: r.series_id ?? undefined,
  recurrenceDays: r.recurrence_days ?? undefined,
  priority: r.priority ?? undefined,
  origin: r.origin ?? undefined,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at ?? undefined,
});

const dumpToRemote = (i: BrainDumpItem) => ({
  id: i.id,
  title: i.title,
  notes: i.notes,
  created_at: i.createdAt,
  updated_at: i.updatedAt,
  deleted_at: i.deletedAt ?? null,
});
const dumpFromRemote = (r: RemoteBrainDumpItem): BrainDumpItem => ({
  id: r.id,
  title: r.title,
  notes: r.notes,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at ?? undefined,
});

const routineToRemote = (r: Routine) => ({
  id: r.id,
  title: r.title,
  time_of_day: r.timeOfDay,
  created_at: r.createdAt,
  updated_at: r.updatedAt,
  deleted_at: r.deletedAt ?? null,
});
const routineFromRemote = (r: RemoteRoutine): Routine => ({
  id: r.id,
  title: r.title,
  timeOfDay: r.time_of_day,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at ?? undefined,
});

const taskToRemote = (t: Task) => ({
  id: t.id,
  title: t.title,
  due_date: t.dueDate ?? null,
  priority: t.priority ?? null,
  project_key: t.projectKey ?? null,
  completed: t.completed,
  completed_at: t.completedAt ?? null,
  created_at: t.createdAt,
  origin: t.origin ?? null,
  updated_at: t.updatedAt,
  deleted_at: t.deletedAt ?? null,
});
const taskFromRemote = (r: RemoteTask): Task => ({
  id: r.id,
  title: r.title,
  dueDate: r.due_date ?? undefined,
  priority: r.priority ?? undefined,
  projectKey: r.project_key ?? undefined,
  completed: r.completed,
  completedAt: r.completed_at ?? undefined,
  createdAt: r.created_at,
  origin: r.origin ?? undefined,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at ?? undefined,
});

const projectToRemote = (p: Project) => ({
  key: p.key,
  name: p.name,
  created_at: p.createdAt,
  updated_at: p.updatedAt,
  deleted_at: p.deletedAt ?? null,
});
const projectFromRemote = (r: RemoteProject): Project => ({
  key: r.key,
  name: r.name,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at ?? undefined,
});

const categoryToRemote = (c: CustomCategory) => ({
  key: c.key,
  name: c.name,
  icon: c.icon,
  color: c.color,
  created_at: c.createdAt,
  updated_at: c.updatedAt,
  deleted_at: c.deletedAt ?? null,
});
const categoryFromRemote = (r: RemoteCustomCategory): CustomCategory => ({
  key: r.key,
  name: r.name,
  icon: r.icon,
  color: r.color,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at ?? undefined,
});

export function pushCustomEvent(e: CustomEvent): void {
  pushRow('custom_events', eventToRemote(e));
}

export function pushBrainDumpItem(i: BrainDumpItem): void {
  pushRow('brain_dump_items', dumpToRemote(i));
}

export function pushRoutine(r: Routine): void {
  pushRow('routines', routineToRemote(r));
}

export function pushTask(t: Task): void {
  pushRow('tasks', taskToRemote(t));
}

export function pushProject(p: Project): void {
  pushRow('projects', projectToRemote(p));
}

export function pushCustomCategory(c: CustomCategory): void {
  pushRow('custom_categories', categoryToRemote(c));
}

// RoutineCompletion has no updatedAt to conflict-resolve with, and no
// tombstone — a delete is a real row delete, pushed immediately, same
// as everything above is pushed immediately. See the migration SQL's
// comment on this table for why.
export function pushRoutineCompletionAdd(routineId: string, date: string, completedAt: string): void {
  (async () => {
    try {
      const userId = await getUserId();
      if (!userId) return;
      await supabase
        .from('routine_completions')
        .upsert(
          { user_id: userId, routine_id: routineId, date, completed_at: completedAt },
          { onConflict: 'user_id,routine_id,date' },
        );
    } catch {
      // noop
    }
  })();
}

export function pushRoutineCompletionDelete(routineId: string, date: string): void {
  (async () => {
    try {
      const userId = await getUserId();
      if (!userId) return;
      await supabase
        .from('routine_completions')
        .delete()
        .eq('user_id', userId)
        .eq('routine_id', routineId)
        .eq('date', date);
    } catch {
      // noop
    }
  })();
}

// --- Full reconcile — one table at a time, called on sign-in (this
// doubles as the one-time bulk upload for a brand-new account, since
// an empty remote just means everything local uploads and nothing
// downloads) and on app foreground. Union by key across local and
// remote; for the six timestamped types, newer `updatedAt` wins on a
// genuine conflict — local wins ties, since it's already authoritative
// for the UI and re-uploading an identical row is harmless (upsert).
async function syncTable<TLocal extends { updatedAt: string; deletedAt?: string }, TRemote>(opts: {
  table: string;
  remoteKeyField: keyof TRemote;
  loadLocalRaw: () => Promise<TLocal[]>;
  saveLocal: (rows: TLocal[]) => Promise<void>;
  getLocalKey: (row: TLocal) => string;
  toRemote: (row: TLocal, userId: string) => Record<string, unknown>;
  fromRemote: (row: TRemote) => TLocal;
}): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;
  try {
    const [local, remoteResult] = await Promise.all([
      opts.loadLocalRaw(),
      supabase.from(opts.table).select('*').eq('user_id', userId),
    ]);
    if (remoteResult.error) return;
    const remoteRows = (remoteResult.data ?? []) as TRemote[];

    const remoteByKey = new Map<string, TRemote>(
      remoteRows.map((r) => [String(r[opts.remoteKeyField]), r]),
    );
    const merged: TLocal[] = [];
    const toUpload: TLocal[] = [];

    for (const localRow of local) {
      const key = opts.getLocalKey(localRow);
      const remoteRow = remoteByKey.get(key);
      if (!remoteRow) {
        merged.push(localRow);
        toUpload.push(localRow);
      } else {
        const remoteAsLocal = opts.fromRemote(remoteRow);
        if (localRow.updatedAt >= remoteAsLocal.updatedAt) {
          merged.push(localRow);
          if (localRow.updatedAt > remoteAsLocal.updatedAt) toUpload.push(localRow);
        } else {
          merged.push(remoteAsLocal);
        }
        remoteByKey.delete(key);
      }
    }
    // Whatever's left has no local counterpart at all — pure download.
    for (const remoteRow of remoteByKey.values()) {
      merged.push(opts.fromRemote(remoteRow));
    }

    await opts.saveLocal(merged);
    if (toUpload.length > 0) {
      await supabase.from(opts.table).upsert(toUpload.map((r) => ({ ...opts.toRemote(r, userId), user_id: userId })));
    }
  } catch {
    // noop — offline or transient failure; next foreground/sign-in retries.
  }
}

// RoutineCompletion: no updatedAt, no tombstone — plain union by
// composite key. Deletes already propagate immediately via
// pushRoutineCompletionDelete above, so there's no delete-conflict
// case to resolve here at all, just "does either side have a
// completion the other doesn't yet know about."
async function syncRoutineCompletions(): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;
  try {
    const [local, remoteResult] = await Promise.all([
      loadRoutineCompletions(),
      supabase.from('routine_completions').select('routine_id,date,completed_at').eq('user_id', userId),
    ]);
    if (remoteResult.error) return;
    const remoteRows = (remoteResult.data ?? []) as RemoteRoutineCompletion[];

    const key = (routineId: string, date: string) => `${routineId}|${date}`;
    const localKeys = new Set(local.map((c) => key(c.routineId, c.date)));
    const remoteKeys = new Set(remoteRows.map((r) => key(r.routine_id, r.date)));

    const toUpload = local.filter((c) => !remoteKeys.has(key(c.routineId, c.date)));
    const toDownload = remoteRows.filter((r) => !localKeys.has(key(r.routine_id, r.date)));

    if (toUpload.length > 0) {
      await supabase.from('routine_completions').upsert(
        toUpload.map((c) => ({ user_id: userId, routine_id: c.routineId, date: c.date, completed_at: c.completedAt })),
        { onConflict: 'user_id,routine_id,date' },
      );
    }
    if (toDownload.length > 0) {
      const downloaded: RoutineCompletion[] = toDownload.map((r) => ({
        routineId: r.routine_id,
        date: r.date,
        completedAt: r.completed_at,
      }));
      await saveRoutineCompletions([...local, ...downloaded]);
    }
  } catch {
    // noop
  }
}

// Called from auth.ts right after a successful sign-in (handles both
// a brand-new account's bulk upload and merging onto an existing
// account's data), and from a foreground listener while a session is
// active. Every table syncs independently — one failing doesn't block
// the rest.
export async function runFullSync(): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  await Promise.all([
    syncTable<CustomEvent, RemoteCustomEvent>({
      table: 'custom_events',
      remoteKeyField: 'id',
      loadLocalRaw: loadCustomEventsRaw,
      saveLocal: saveCustomEvents,
      getLocalKey: (e) => e.id,
      toRemote: eventToRemote,
      fromRemote: eventFromRemote,
    }),
    syncTable<BrainDumpItem, RemoteBrainDumpItem>({
      table: 'brain_dump_items',
      remoteKeyField: 'id',
      loadLocalRaw: loadBrainDumpItemsRaw,
      saveLocal: saveBrainDumpItems,
      getLocalKey: (i) => i.id,
      toRemote: dumpToRemote,
      fromRemote: dumpFromRemote,
    }),
    syncTable<Routine, RemoteRoutine>({
      table: 'routines',
      remoteKeyField: 'id',
      loadLocalRaw: loadRoutinesRaw,
      saveLocal: saveRoutines,
      getLocalKey: (r) => r.id,
      toRemote: routineToRemote,
      fromRemote: routineFromRemote,
    }),
    syncTable<Task, RemoteTask>({
      table: 'tasks',
      remoteKeyField: 'id',
      loadLocalRaw: loadTasksRaw,
      saveLocal: saveTasks,
      getLocalKey: (t) => t.id,
      toRemote: taskToRemote,
      fromRemote: taskFromRemote,
    }),
    syncTable<Project, RemoteProject>({
      table: 'projects',
      remoteKeyField: 'key',
      loadLocalRaw: loadProjectsRaw,
      saveLocal: saveProjects,
      getLocalKey: (p) => p.key,
      toRemote: projectToRemote,
      fromRemote: projectFromRemote,
    }),
    syncTable<CustomCategory, RemoteCustomCategory>({
      table: 'custom_categories',
      remoteKeyField: 'key',
      loadLocalRaw: loadCustomCategoriesRaw,
      saveLocal: saveCustomCategories,
      getLocalKey: (c) => c.key,
      toRemote: categoryToRemote,
      fromRemote: categoryFromRemote,
    }),
    syncRoutineCompletions(),
  ]);
}
