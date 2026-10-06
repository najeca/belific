// Sync engine (checkpoint 5, decision 013). Pure apart from the three small
// interfaces it is given, so `node --test` drives it against an in-memory fake
// server (syncEngine.test.ts). lib/sync.ts wires it to Supabase, storage.ts and
// the persisted outbox (outbox.ts).
//
// One sync = probe the server's schema, pull every table (paginated), merge
// under the storage lock, then push the outbox. Pull comes before push so a
// tombstone from another device cancels a stale pending edit before it is
// sent. Writes between syncs are pushed by `drain` shortly after they happen.
import {
  TABLE_SPECS,
  TIMESTAMPED_TABLES,
  chunk,
  completionFromRemote,
  completionKey,
  completionToRemote,
  cursorQueryFrom,
  dropKeys,
  enqueue,
  hasPipelineValues,
  maxServerTime,
  mergeCompletions,
  mergeRows,
  pendingFor,
  preserveFieldsFor,
  recordFailure,
  recordSuccess,
  removeSent,
  type Caps,
  type OutboxEntry,
  type OutboxState,
  type Syncable,
  type TimestampedTable,
} from './syncCore.ts';
import type { RoutineCompletion } from './types.ts';

export const PAGE_SIZE = 1000;
export const BATCH_SIZE = 500;

export interface PageQuery {
  // Incremental: rows with server_updated_at >= this ISO time.
  since?: string;
  from: number;
  to: number;
}

// The server, as the engine needs it. Every method throws on failure (a
// network error, or an error the server returned).
export interface ServerAdapter {
  userId(): Promise<string | null>;
  probe(): Promise<Caps>;
  selectPage(table: TimestampedTable | 'routine_completions', query: PageQuery, caps: Caps): Promise<Record<string, unknown>[]>;
  upsert(table: TimestampedTable | 'routine_completions', rows: Record<string, unknown>[]): Promise<void>;
  deleteCompletion(routineId: string, date: string): Promise<void>;
}

// Local app data. `withLock` is the same lock storage.ts takes for every
// write, so a merge never overwrites a write made during the network wait.
export interface LocalAdapter {
  withLock<T>(fn: () => Promise<T>): Promise<T>;
  load(table: TimestampedTable): Promise<Record<string, unknown>[]>;
  save(table: TimestampedTable, rows: Record<string, unknown>[]): Promise<void>;
  loadCompletions(): Promise<RoutineCompletion[]>;
  saveCompletions(rows: RoutineCompletion[]): Promise<void>;
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string | null): Promise<void>;
}

// The persisted outbox. `update` applies a pure change atomically.
export interface OutboxStore {
  read(): Promise<OutboxState>;
  update(fn: (state: OutboxState) => OutboxState): Promise<OutboxState>;
}

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error' | 'signed-out';

export interface SyncStatus {
  state: SyncState;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  pending: number;
}

export const META = {
  caps: 'belific_sync_caps',
  cursor: (t: string) => `belific_sync_cursor_${t}`,
  seenCompletions: 'belific_sync_seen_completions',
};

export function isNetworkError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /network request failed|failed to fetch|fetch failed|networkerror|load failed|offline|timed out|ECONN|ENOTFOUND/i.test(msg);
}

function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

export function createSyncEngine(deps: {
  server: ServerAdapter;
  local: LocalAdapter;
  outbox: OutboxStore;
  now?: () => number;
  pageSize?: number;
  batchSize?: number;
}) {
  const { server, local, outbox } = deps;
  const now = deps.now ?? (() => Date.now());
  const pageSize = deps.pageSize ?? PAGE_SIZE;
  const batchSize = deps.batchSize ?? BATCH_SIZE;

  let status: SyncStatus = { state: 'idle', lastSuccessAt: null, lastError: null, lastErrorAt: null, pending: 0 };
  const listeners = new Set<(s: SyncStatus) => void>();
  let caps: Caps | null = null;
  let running: Promise<void> | null = null;
  let draining: Promise<void> | null = null;

  function setStatus(patch: Partial<SyncStatus>) {
    status = { ...status, ...patch };
    for (const l of listeners) l(status);
  }

  async function refreshPending() {
    const s = await outbox.read();
    setStatus({ pending: s.entries.length });
  }

  function fail(e: unknown) {
    const offline = isNetworkError(e);
    setStatus({
      state: offline ? 'offline' : 'error',
      lastError: errorText(e),
      lastErrorAt: new Date(now()).toISOString(),
    });
  }

  async function readSeen(): Promise<Set<string>> {
    try {
      const raw = await local.getMeta(META.seenCompletions);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  }
  async function writeSeen(seen: Set<string>) {
    await local.setMeta(META.seenCompletions, JSON.stringify([...seen]));
  }

  // Detects the schema; when migration 2 first appears, queues every local
  // row that holds values the server could not store until now.
  async function loadCaps(): Promise<Caps> {
    const next = await server.probe();
    const prevRaw = await local.getMeta(META.caps);
    const prev: Caps | null = prevRaw ? (JSON.parse(prevRaw) as Caps) : null;
    if (next.taskPipeline && prev && !prev.taskPipeline) {
      await local.withLock(async () => {
        const items: Array<{ table: TimestampedTable; key: string; op: 'upsert'; row: Record<string, unknown> }> = [];
        for (const table of ['tasks', 'projects'] as const) {
          const spec = TABLE_SPECS[table];
          for (const row of await local.load(table)) {
            if (hasPipelineValues(table, row)) items.push({ table, key: spec.keyOf(row), op: 'upsert', row });
          }
        }
        if (items.length > 0) await outbox.update((s) => enqueue(s, items));
      });
    }
    await local.setMeta(META.caps, JSON.stringify(next));
    caps = next;
    return next;
  }

  async function pullTable(table: TimestampedTable, c: Caps): Promise<void> {
    const spec = TABLE_SPECS[table];
    const cursor = c.serverUpdatedAt ? await local.getMeta(META.cursor(table)) : null;
    const mode: 'full' | 'incremental' = cursor ? 'incremental' : 'full';
    const since = cursor ? cursorQueryFrom(cursor) : undefined;
    const remoteRaw: Record<string, unknown>[] = [];
    // Page until an empty page, advancing by what actually came back, so a
    // server row cap lower than pageSize can never truncate the pull (V7c).
    for (let from = 0; ; ) {
      const page = await server.selectPage(table, { since, from, to: from + pageSize - 1 }, c);
      if (page.length === 0) break;
      remoteRaw.push(...page);
      from += page.length;
    }
    const remote = remoteRaw.map((r) => spec.fromRemote(r)) as unknown as Syncable[];

    await local.withLock(async () => {
      const localRows = (await local.load(table)) as unknown as Syncable[];
      const state = await outbox.read();
      const result = mergeRows({
        local: localRows,
        remote,
        keyOf: (r) => spec.keyOf(r as unknown as Record<string, unknown>),
        pending: pendingFor(state, table),
        preserveFields: preserveFieldsFor(table, c),
        mode,
      });
      if (result.changed) await local.save(table, result.rows as unknown as Record<string, unknown>[]);
      if (result.toEnqueue.length > 0 || result.dropPending.length > 0) {
        await outbox.update((s) =>
          enqueue(
            dropKeys(s, table, result.dropPending),
            result.toEnqueue.map((row) => {
              const r = row as unknown as Record<string, unknown>;
              return { table, key: spec.keyOf(r), op: 'upsert' as const, row: r };
            }),
          ),
        );
      }
    });
    // The cursor moves only after the page is safely merged and saved.
    if (c.serverUpdatedAt) {
      const next = maxServerTime(remoteRaw, cursor);
      if (next && next !== cursor) await local.setMeta(META.cursor(table), next);
    }
  }

  async function pullCompletions(c: Caps): Promise<void> {
    const remoteRaw: Record<string, unknown>[] = [];
    for (let from = 0; ; ) {
      const page = await server.selectPage('routine_completions', { from, to: from + pageSize - 1 }, c);
      if (page.length === 0) break;
      remoteRaw.push(...page);
      from += page.length;
    }
    const remote = remoteRaw.map(completionFromRemote);
    await local.withLock(async () => {
      const localRows = await local.loadCompletions();
      const state = await outbox.read();
      const result = mergeCompletions({
        local: localRows,
        remote,
        pending: pendingFor(state, 'routine_completions'),
        seen: await readSeen(),
      });
      if (result.changed) await local.saveCompletions(result.rows);
      await writeSeen(result.seen);
      if (result.toEnqueue.length > 0) {
        await outbox.update((s) =>
          enqueue(
            s,
            result.toEnqueue.map((c2) => ({
              table: 'routine_completions' as const,
              key: completionKey(c2),
              op: 'upsert' as const,
              row: c2 as unknown as Record<string, unknown>,
            })),
          ),
        );
      }
    });
  }

  // Pushes the outbox. Removes an entry only after the server accepted it and
  // only if it was not rewritten meanwhile. Stops at the first failure and
  // backs off; `force` ignores the backoff (a full sync, or a reconnect).
  async function drainOnce(force: boolean): Promise<void> {
    const userId = await server.userId();
    if (!userId) return;
    let state = await outbox.read();
    if (state.entries.length === 0) return;
    if (!force && state.nextAttemptAt > now()) return;
    const seen = await readSeen();
    let seenChanged = false;
    try {
      const c = caps ?? (await loadCaps());
      for (const table of TIMESTAMPED_TABLES) {
        const spec = TABLE_SPECS[table];
        const entries = state.entries.filter((e) => e.table === table && e.op === 'upsert' && e.row);
        for (const batch of chunk(entries, batchSize)) {
          await server.upsert(
            table,
            batch.map((e) => ({ ...spec.toRemote(e.row as Record<string, unknown>, c), user_id: userId })),
          );
          state = await outbox.update((s) => removeSent(s, batch));
        }
      }
      const adds = state.entries.filter((e) => e.table === 'routine_completions' && e.op === 'upsert' && e.row);
      for (const batch of chunk(adds, batchSize)) {
        await server.upsert(
          'routine_completions',
          batch.map((e) => ({ ...completionToRemote(e.row as unknown as RoutineCompletion), user_id: userId })),
        );
        for (const e of batch) seen.add(e.key);
        seenChanged = true;
        state = await outbox.update((s) => removeSent(s, batch));
      }
      const deletes = state.entries.filter((e) => e.table === 'routine_completions' && e.op === 'delete');
      for (const e of deletes) {
        const [routineId, date] = e.key.split('|');
        await server.deleteCompletion(routineId, date);
        seen.delete(e.key);
        seenChanged = true;
        state = await outbox.update((s) => removeSent(s, [e]));
      }
      await outbox.update((s) => recordSuccess(s));
    } catch (e) {
      await outbox.update((s) => recordFailure(s, now()));
      throw e;
    } finally {
      if (seenChanged) await writeSeen(seen);
      await refreshPending();
    }
  }

  async function drain(force = false): Promise<void> {
    if (draining) return draining;
    draining = (async () => {
      try {
        await drainOnce(force);
      } catch (e) {
        fail(e);
      } finally {
        draining = null;
      }
    })();
    return draining;
  }

  async function syncOnce(): Promise<void> {
    const userId = await server.userId();
    if (!userId) {
      setStatus({ state: 'signed-out' });
      return;
    }
    setStatus({ state: 'syncing' });
    try {
      const c = await loadCaps();
      for (const table of TIMESTAMPED_TABLES) await pullTable(table, c);
      await pullCompletions(c);
      if (draining) await draining;
      await drainOnce(true);
      setStatus({ state: 'idle', lastSuccessAt: new Date(now()).toISOString() });
    } catch (e) {
      fail(e);
    }
  }

  // Never two syncs at once; a second call while one runs waits for it.
  function sync(): Promise<void> {
    if (running) return running;
    running = syncOnce().finally(() => {
      running = null;
    });
    return running;
  }

  return {
    sync,
    drain,
    getStatus: () => status,
    subscribe(listener: (s: SyncStatus) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    // Exposed for tests of the pull path on its own.
    async pullOnly(): Promise<void> {
      const c = await loadCaps();
      for (const table of TIMESTAMPED_TABLES) await pullTable(table, c);
      await pullCompletions(c);
    },
    refreshPending,
  };
}

export type SyncEngine = ReturnType<typeof createSyncEngine>;
export type { OutboxEntry };
