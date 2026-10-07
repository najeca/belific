import { AppState, type AppStateStatus } from 'react-native';
import { supabase } from './supabase';
import { kv } from './kv';
import { storageLock } from './lock';
import { onQueued, outboxStore, setSyncEnabled } from './outbox';
import {
  loadBrainDumpItemsRaw,
  loadCustomCategoriesRaw,
  loadCustomEventsRaw,
  loadProjectsRaw,
  loadRoutineCompletions,
  loadRoutinesRaw,
  loadTasksRaw,
  saveBrainDumpItems,
  saveCustomCategories,
  saveCustomEvents,
  saveProjects,
  saveRoutineCompletions,
  saveRoutines,
  saveTasks,
} from './storage';
import { groupByColumns, TIMESTAMPED_TABLES, type Caps, type TimestampedTable } from './syncCore';
import {
  META,
  createSyncEngine,
  type LocalAdapter,
  type PageQuery,
  type ServerAdapter,
  type SyncStatus,
} from './syncEngine';

// Sync for optional accounts (decision 013, checkpoint 5). Shared by the
// iPhone and the desktop. The rules live in syncCore.ts and syncEngine.ts
// (pure, tested against a fake server); this file only connects them to
// Supabase, storage.ts and the persisted outbox.
//
// Signed out (the default, and the desktop until checkpoint 6) costs one
// local session check per trigger and never touches the network.

type AnyTable = TimestampedTable | 'routine_completions';

const ON_CONFLICT: Record<AnyTable, string> = {
  custom_events: 'user_id,id',
  brain_dump_items: 'user_id,id',
  routines: 'user_id,id',
  tasks: 'user_id,id',
  projects: 'user_id,key',
  custom_categories: 'user_id,key',
  routine_completions: 'user_id,routine_id,date',
};

const ORDER: Record<AnyTable, string[]> = {
  custom_events: ['id'],
  brain_dump_items: ['id'],
  routines: ['id'],
  tasks: ['id'],
  projects: ['key'],
  custom_categories: ['key'],
  routine_completions: ['routine_id', 'date'],
};

async function getUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

interface PgError {
  code?: string;
  message?: string;
}

function isMissingColumn(error: PgError): boolean {
  return (
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    /column .* does not exist|could not find the .* column/i.test(error.message ?? '')
  );
}

async function columnExists(table: AnyTable, column: string): Promise<boolean> {
  const { error } = await supabase.from(table).select(column).limit(1);
  if (!error) return true;
  if (isMissingColumn(error)) return false;
  throw new Error(error.message);
}

const server: ServerAdapter = {
  userId: getUserId,
  // Which migrations the server has: both work before and after (see
  // docs/sessions/2026-10-06-cp5.md, "before and after the migrations").
  async probe(): Promise<Caps> {
    const [serverUpdatedAt, taskCols, projectCols, subtasksCol, reminderCol, actualCol] = await Promise.all([
      columnExists('tasks', 'server_updated_at'),
      columnExists('tasks', 'duration_minutes'),
      columnExists('projects', 'color_key'),
      columnExists('tasks', 'subtasks'),
      columnExists('tasks', 'reminder_minutes'),
      columnExists('tasks', 'actual_seconds'),
    ]);
    return { serverUpdatedAt, taskPipeline: taskCols && projectCols, taskExtras: subtasksCol && reminderCol, taskActual: actualCol };
  },
  async selectPage(table: AnyTable, q: PageQuery): Promise<Record<string, unknown>[]> {
    const userId = await getUserId();
    if (!userId) return [];
    let query = supabase.from(table).select('*').eq('user_id', userId);
    if (q.since) query = query.gte('server_updated_at', q.since).order('server_updated_at', { ascending: true });
    for (const col of ORDER[table]) query = query.order(col, { ascending: true });
    const { data, error } = await query.range(q.from, q.to);
    if (error) throw new Error(error.message);
    return (data ?? []) as Record<string, unknown>[];
  },
  async upsert(table: AnyTable, rows: Record<string, unknown>[]): Promise<void> {
    // One request per set of columns: in a mixed batch PostgREST would write
    // NULL into a column a row left out, so a live row next to a tombstone
    // would clear deleted_at on the server.
    for (const group of groupByColumns(rows)) {
      const { error } = await supabase.from(table).upsert(group, { onConflict: ON_CONFLICT[table] });
      if (error) throw new Error(error.message);
    }
  },
  async deleteCompletion(routineId: string, date: string): Promise<void> {
    const userId = await getUserId();
    if (!userId) return;
    const { error } = await supabase
      .from('routine_completions')
      .delete()
      .eq('user_id', userId)
      .eq('routine_id', routineId)
      .eq('date', date);
    if (error) throw new Error(error.message);
  },
};

const LOADERS: Record<TimestampedTable, () => Promise<object[]>> = {
  custom_events: loadCustomEventsRaw,
  brain_dump_items: loadBrainDumpItemsRaw,
  routines: loadRoutinesRaw,
  tasks: loadTasksRaw,
  projects: loadProjectsRaw,
  custom_categories: loadCustomCategoriesRaw,
};
const SAVERS: Record<TimestampedTable, (rows: never[]) => Promise<void>> = {
  custom_events: saveCustomEvents,
  brain_dump_items: saveBrainDumpItems,
  routines: saveRoutines,
  tasks: saveTasks,
  projects: saveProjects,
  custom_categories: saveCustomCategories,
};

const local: LocalAdapter = {
  withLock: (fn) => storageLock.run(fn),
  load: async (table) => (await LOADERS[table]()) as Record<string, unknown>[],
  save: (table, rows) => SAVERS[table](rows as never[]),
  loadCompletions: loadRoutineCompletions,
  saveCompletions: saveRoutineCompletions,
  getMeta: (key) => kv.getItem(key),
  setMeta: async (key, value) => {
    if (value === null) await kv.removeItem(key);
    else await kv.setItem(key, value);
  },
};

const engine = createSyncEngine({ server, local, outbox: outboxStore });

let signedIn = false;

export type PublicSyncStatus = SyncStatus & { signedIn: boolean };

export function getSyncStatus(): PublicSyncStatus {
  return { ...engine.getStatus(), signedIn };
}

export function subscribeSyncStatus(listener: (s: PublicSyncStatus) => void): () => void {
  return engine.subscribe((s) => listener({ ...s, signedIn }));
}

// A full sync: pull every table, merge, push the outbox. Safe to call any
// time; signed out it returns at once. Existing signed in iPhones turn the
// outbox on here on their first launch of this version.
// Desktop only: after a sign in as a different account the person must choose
// what happens to this computer's data first (cp6.1). Nothing syncs until then.
// The key is read as a literal so this file stays free of desktop code; on
// iOS belificDesktop is absent and this never reads anything.
async function accountChoiceHeld(): Promise<boolean> {
  if (!globalThis.belificDesktop) return false;
  try {
    return (await kv.getItem('belific_account_choice_pending')) !== null;
  } catch {
    return true;
  }
}

export async function runFullSync(): Promise<void> {
  if (await accountChoiceHeld()) return;
  const userId = await getUserId();
  signedIn = userId !== null;
  if (signedIn) await setSyncEnabled(true);
  await engine.sync();
}

// After a successful sign in: the first full pass uploads local rows,
// downloads the account's rows and resolves same-id rows by the rules.
export async function onSignedIn(): Promise<void> {
  if (await accountChoiceHeld()) return;
  signedIn = true;
  await setSyncEnabled(true);
  await engine.sync();
}

// After sign out or account deletion: stop queueing, forget the queue and
// every cursor, so a different account starts from a full pass.
export async function onSignedOut(): Promise<void> {
  signedIn = false;
  await setSyncEnabled(false);
  const keys = [META.caps, META.seenCompletions, ...TIMESTAMPED_TABLES.map((t) => META.cursor(t))];
  await kv.multiRemove(keys);
  await engine.refreshPending();
}

export const SYNC_POLL_MS = 120 * 1000;
const DRAIN_DELAY_MS = 1500;

// Triggers (decision 013 item 5): foreground, every 120 s while the app is
// active (on the desktop that means while the window is visible), and a
// short debounce after each local write. Returns a stop function.
export function startSyncLoop(): () => void {
  let state: AppStateStatus = AppState.currentState;
  let drainTimer: ReturnType<typeof setTimeout> | null = null;

  const poll = setInterval(() => {
    if (state === 'active') runFullSync().catch(() => {});
  }, SYNC_POLL_MS);

  const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
    if (state.match(/inactive|background/) && next === 'active') runFullSync().catch(() => {});
    state = next;
  });

  const stopQueued = onQueued(() => {
    if (drainTimer) clearTimeout(drainTimer);
    drainTimer = setTimeout(() => {
      drainTimer = null;
      engine.drain().catch(() => {});
    }, DRAIN_DELAY_MS);
  });

  return () => {
    clearInterval(poll);
    sub.remove();
    stopQueued();
    if (drainTimer) clearTimeout(drainTimer);
  };
}
