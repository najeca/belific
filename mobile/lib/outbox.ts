import { kv } from './kv';
import { createMutex } from './lock';
import { EMPTY_OUTBOX, TABLE_SPECS, completionKey, enqueue, type OutboxState, type TimestampedTable } from './syncCore';
import type { RoutineCompletion } from './types';

// The persisted sync outbox (checkpoint 5, decision 013 item 1). storage.ts
// queues every local write here, inside the storage lock; lib/sync.ts drains
// it. One kv key, so it survives restarts. No network code lives here, so
// storage.ts never imports Supabase.
//
// Only active while sync is enabled (a signed in session). A signed out
// device (the default, and the desktop until checkpoint 6) queues nothing;
// its local rows are uploaded by the first full pass after it signs in.
const OUTBOX_KEY = 'belific_sync_outbox';
const ENABLED_KEY = 'belific_sync_enabled';

const lock = createMutex();
let cache: OutboxState | null = null;
let enabled: boolean | null = null;
const listeners = new Set<() => void>();

async function loadState(): Promise<OutboxState> {
  if (cache) return cache;
  try {
    const raw = await kv.getItem(OUTBOX_KEY);
    cache = raw ? ({ ...EMPTY_OUTBOX, ...(JSON.parse(raw) as OutboxState) }) : EMPTY_OUTBOX;
  } catch {
    cache = EMPTY_OUTBOX;
  }
  return cache;
}

export const outboxStore = {
  read(): Promise<OutboxState> {
    return lock.run(loadState);
  },
  update(fn: (state: OutboxState) => OutboxState): Promise<OutboxState> {
    return lock.run(async () => {
      const next = fn(await loadState());
      cache = next;
      await kv.setItem(OUTBOX_KEY, JSON.stringify(next));
      return next;
    });
  },
};

export async function isSyncEnabled(): Promise<boolean> {
  if (enabled !== null) return enabled;
  try {
    enabled = (await kv.getItem(ENABLED_KEY)) === 'true';
  } catch {
    enabled = false;
  }
  return enabled;
}

// Turned on at sign in (and at launch when a session already exists), off at
// sign out, which also empties the outbox: nothing queued under one account
// may be sent under another.
export async function setSyncEnabled(on: boolean): Promise<void> {
  enabled = on;
  await kv.setItem(ENABLED_KEY, on ? 'true' : 'false');
  if (!on) await outboxStore.update(() => EMPTY_OUTBOX);
}

export function onQueued(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  for (const l of listeners) l();
}

// Queues local rows for upload (the newest write of a row replaces any older
// queued one). Call inside the storage lock, after the local save.
export async function queueRows(table: TimestampedTable, rows: object[]): Promise<void> {
  if (rows.length === 0 || !(await isSyncEnabled())) return;
  const spec = TABLE_SPECS[table];
  await outboxStore.update((s) =>
    enqueue(
      s,
      rows.map((row) => {
        const r = row as Record<string, unknown>;
        return { table, key: spec.keyOf(r), op: 'upsert' as const, row: r };
      }),
    ),
  );
  notify();
}

export async function queueCompletionAdd(c: RoutineCompletion): Promise<void> {
  if (!(await isSyncEnabled())) return;
  await outboxStore.update((s) =>
    enqueue(s, [{ table: 'routine_completions', key: completionKey(c), op: 'upsert', row: c as unknown as Record<string, unknown> }]),
  );
  notify();
}

export async function queueCompletionDelete(routineId: string, date: string): Promise<void> {
  if (!(await isSyncEnabled())) return;
  await outboxStore.update((s) =>
    enqueue(s, [{ table: 'routine_completions', key: completionKey({ routineId, date }), op: 'delete' }]),
  );
  notify();
}
