// Run with `npm test` from mobile/. Sync engine against an in-memory fake
// server (checkpoint 5): the P1.1 scenarios from the review, first sign in
// with data on both sides, pagination, completions, labels, and a server
// without the new columns. No network, no Supabase.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSyncEngine, type LocalAdapter, type OutboxStore, type ServerAdapter, type PageQuery } from './syncEngine.ts';
import { EMPTY_OUTBOX, completionKey, enqueue, parseTime, type Caps, type OutboxState, type TimestampedTable } from './syncCore.ts';
import { createMutex } from './lock.ts';
import type { RoutineCompletion } from './types.ts';

type Row = Record<string, unknown>;
type AnyTable = TimestampedTable | 'routine_completions';
const PIPELINE_COLUMNS = ['duration_minutes', 'start_time', 'recurrence', 'recurrence_days', 'recurrence_month_day', 'color_key'];

// --- Fake Supabase: composite keys, merge-duplicates upserts (only supplied
// columns change), a server clock for server_updated_at, a row cap, and
// failure injection. ---
class FakeServer {
  rows = new Map<AnyTable, Map<string, Row>>();
  clock = Date.parse('2026-10-06T10:00:00Z');
  caps: Caps = { serverUpdatedAt: true, taskPipeline: true };
  maxRows = 1000;
  online = true;
  upsertsBeforeFailure: number | null = null;
  gate: Promise<void> | null = null;
  calls = 0;

  private table(t: AnyTable) {
    if (!this.rows.has(t)) this.rows.set(t, new Map());
    return this.rows.get(t)!;
  }
  private pk(t: AnyTable, r: Row) {
    if (t === 'routine_completions') return `${r.user_id}|${r.routine_id}|${r.date}`;
    return `${r.user_id}|${r.id ?? r.key}`;
  }
  private stamp(r: Row) {
    this.clock += 1000;
    if (this.caps.serverUpdatedAt) r.server_updated_at = new Date(this.clock).toISOString().replace('Z', '+00:00');
  }
  private check() {
    this.calls += 1;
    if (!this.online) throw new TypeError('Network request failed');
  }

  // What a 2.1.0 iPhone does: a full row with deleted_at null, no new columns.
  legacyUpsert(t: AnyTable, row: Row) {
    const key = this.pk(t, row);
    const merged = { ...(this.table(t).get(key) ?? {}), ...row };
    this.stamp(merged);
    this.table(t).set(key, merged);
  }
  all(t: AnyTable): Row[] {
    return [...this.table(t).values()];
  }
  get(t: AnyTable, id: string): Row | undefined {
    return this.all(t).find((r) => (r.id ?? r.key) === id);
  }

  adapter(userId: string | null): ServerAdapter {
    return {
      userId: async () => userId,
      probe: async () => {
        this.check();
        return { ...this.caps };
      },
      selectPage: async (t: AnyTable, q: PageQuery) => {
        this.check();
        if (q.since && !this.caps.serverUpdatedAt) throw new Error('column server_updated_at does not exist');
        let list = this.all(t).filter((r) => r.user_id === userId);
        if (q.since) list = list.filter((r) => parseTime(r.server_updated_at) >= parseTime(q.since));
        const k = (r: Row) => String(r.id ?? r.key ?? `${r.routine_id}|${r.date}`);
        list.sort((a, b) =>
          q.since ? parseTime(a.server_updated_at) - parseTime(b.server_updated_at) || k(a).localeCompare(k(b)) : k(a).localeCompare(k(b)),
        );
        const end = Math.min(q.to + 1, q.from + this.maxRows);
        return list.slice(q.from, end).map((r) => ({ ...r }));
      },
      upsert: async (t: AnyTable, rows: Row[]) => {
        this.check();
        if (this.gate) await this.gate;
        if (this.upsertsBeforeFailure !== null) {
          if (this.upsertsBeforeFailure === 0) throw new Error('upsert failed: 500 internal');
          this.upsertsBeforeFailure -= 1;
        }
        if (!this.caps.taskPipeline) {
          for (const r of rows) for (const c of PIPELINE_COLUMNS) if (c in r) throw new Error(`Could not find the '${c}' column`);
        }
        for (const r of rows) {
          const key = this.pk(t, r);
          const merged = { ...(this.table(t).get(key) ?? {}), ...r };
          this.stamp(merged);
          this.table(t).set(key, merged);
        }
      },
      deleteCompletion: async (routineId: string, date: string) => {
        this.check();
        this.table('routine_completions').delete(`${userId}|${routineId}|${date}`);
      },
    };
  }
}

// --- A device: in-memory local data, persisted outbox and meta, the same
// lock discipline as storage.ts, and write helpers that mirror it. ---
function makeDevice(server: FakeServer, opts: { userId?: string | null; clockOffsetMs?: number; batchSize?: number } = {}) {
  const userId = opts.userId === undefined ? 'u1' : opts.userId;
  const data = {
    tables: new Map<TimestampedTable, Row[]>(),
    completions: [] as RoutineCompletion[],
    meta: new Map<string, string>(),
    outbox: EMPTY_OUTBOX as OutboxState,
  };
  const lock = createMutex();
  const outboxLock = createMutex();
  const clock = () => Date.now() + (opts.clockOffsetMs ?? 0);
  const local: LocalAdapter = {
    withLock: (fn) => lock.run(fn),
    load: async (t) => (data.tables.get(t) ?? []).map((r) => ({ ...r })),
    save: async (t, rows) => {
      data.tables.set(t, rows.map((r) => ({ ...r })));
    },
    loadCompletions: async () => data.completions.map((c) => ({ ...c })),
    saveCompletions: async (rows) => {
      data.completions = rows.map((c) => ({ ...c }));
    },
    getMeta: async (k) => data.meta.get(k) ?? null,
    setMeta: async (k, v) => {
      if (v === null) data.meta.delete(k);
      else data.meta.set(k, v);
    },
  };
  const outbox: OutboxStore = {
    read: async () => data.outbox,
    update: (fn) =>
      outboxLock.run(async () => {
        data.outbox = fn(data.outbox);
        return data.outbox;
      }),
  };
  const make = () =>
    createSyncEngine({ server: server.adapter(userId), local, outbox, now: clock, pageSize: 1000, batchSize: opts.batchSize ?? 500 });
  let engine = make();
  const keyOf = (t: TimestampedTable, r: Row) => String(t === 'projects' || t === 'custom_categories' ? r.key : r.id);

  return {
    data,
    get engine() {
      return engine;
    },
    restart() {
      engine = make();
    },
    rows: (t: TimestampedTable) => data.tables.get(t) ?? [],
    row: (t: TimestampedTable, id: string) => (data.tables.get(t) ?? []).find((r) => keyOf(t, r) === id),
    // Like storage.ts: stamp, save and queue inside the storage lock.
    async put(t: TimestampedTable, row: Row, queue = true) {
      await lock.run(async () => {
        const stamped = { ...row, updatedAt: new Date(clock()).toISOString() };
        const list = (data.tables.get(t) ?? []).filter((r) => keyOf(t, r) !== keyOf(t, stamped));
        data.tables.set(t, [...list, stamped]);
        if (queue) await outbox.update((s) => enqueue(s, [{ table: t, key: keyOf(t, stamped), op: 'upsert', row: stamped }]));
      });
    },
    async remove(t: TimestampedTable, id: string) {
      const existing = (data.tables.get(t) ?? []).find((r) => keyOf(t, r) === id)!;
      const now = new Date(clock()).toISOString();
      await this.put(t, { ...existing, deletedAt: now });
    },
    async complete(routineId: string, date: string) {
      await lock.run(async () => {
        const c = { routineId, date, completedAt: new Date(clock()).toISOString() };
        data.completions = [...data.completions, c];
        await outbox.update((s) => enqueue(s, [{ table: 'routine_completions', key: completionKey(c), op: 'upsert', row: c }]));
      });
    },
    async uncomplete(routineId: string, date: string) {
      await lock.run(async () => {
        data.completions = data.completions.filter((c) => !(c.routineId === routineId && c.date === date));
        await outbox.update((s) => enqueue(s, [{ table: 'routine_completions', key: `${routineId}|${date}`, op: 'delete' }]));
      });
    },
  };
}

const task = (id: string, title: string, extra: Row = {}): Row => ({
  id,
  title,
  completed: false,
  createdAt: '2026-10-01T09:00:00.000Z',
  updatedAt: '2026-10-01T09:00:00.000Z',
  ...extra,
});
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('signed out: no server calls, nothing queued is pushed', async () => {
  const server = new FakeServer();
  const d = makeDevice(server, { userId: null });
  await d.engine.sync();
  await d.engine.drain(true);
  assert.equal(server.calls, 0);
  assert.equal(d.engine.getStatus().state, 'signed-out');
});

test('P1.1 two devices edit the same item: the last to reach the server wins, both converge', async () => {
  const server = new FakeServer();
  const a = makeDevice(server);
  const b = makeDevice(server);
  await a.put('tasks', task('t1', 'Original'));
  await a.engine.sync();
  await b.engine.sync();
  await a.put('tasks', { ...a.row('tasks', 't1'), title: 'From A' });
  await wait(5);
  await b.put('tasks', { ...b.row('tasks', 't1'), title: 'From B' });
  await a.engine.sync(); // A reaches the server first
  await b.engine.sync(); // B's pending edit beats A's pulled row, then B pushes
  await a.engine.sync();
  assert.equal(server.get('tasks', 't1')?.title, 'From B');
  assert.equal(a.row('tasks', 't1')?.title, 'From B');
  assert.equal(b.row('tasks', 't1')?.title, 'From B');
  assert.equal(server.all('tasks').length, 1);
});

test('P1.1 delete versus edit: the tombstone wins in either order', async () => {
  for (const order of ['delete-first', 'edit-first'] as const) {
    const server = new FakeServer();
    const a = makeDevice(server);
    const b = makeDevice(server);
    await a.put('tasks', task('t1', 'Original'));
    await a.engine.sync();
    await b.engine.sync();
    await a.remove('tasks', 't1');
    await b.put('tasks', { ...b.row('tasks', 't1'), title: 'Edited' });
    if (order === 'delete-first') {
      await a.engine.sync();
      await b.engine.sync();
    } else {
      await b.engine.sync();
      await a.engine.sync();
      await b.engine.sync();
    }
    assert.ok(server.get('tasks', 't1')?.deleted_at, `${order}: server tombstoned`);
    assert.ok(a.row('tasks', 't1')?.deletedAt, `${order}: A tombstoned`);
    assert.ok(b.row('tasks', 't1')?.deletedAt, `${order}: B tombstoned`);
    assert.equal(b.data.outbox.entries.length, 0, `${order}: B's edit was dropped`);
  }
});

test('a live edit pushed without pulling first can never undelete a row', async () => {
  const server = new FakeServer();
  const a = makeDevice(server);
  const b = makeDevice(server);
  await a.put('tasks', task('t1', 'Original'));
  await a.engine.sync();
  await b.engine.sync();
  await a.remove('tasks', 't1');
  await a.engine.sync();
  await b.put('tasks', { ...b.row('tasks', 't1'), title: 'Late edit' });
  await b.engine.drain(true); // push only, no pull
  assert.ok(server.get('tasks', 't1')?.deleted_at, 'still deleted on the server');
  await b.engine.sync();
  assert.ok(b.row('tasks', 't1')?.deletedAt);
});

test('a tombstone resurrected by an older iPhone build is pushed again', async () => {
  const server = new FakeServer();
  const a = makeDevice(server);
  await a.put('tasks', task('t1', 'Original'));
  await a.remove('tasks', 't1');
  await a.engine.sync();
  server.legacyUpsert('tasks', { user_id: 'u1', id: 't1', title: 'Original', completed: false, created_at: 'x', updated_at: '2026-10-01T09:00:00Z', deleted_at: null });
  await a.engine.sync();
  assert.ok(a.row('tasks', 't1')?.deletedAt);
  assert.ok(server.get('tasks', 't1')?.deleted_at);
});

test('P1.1 offline then reconnect: the write waits in the outbox, status says offline', async () => {
  const server = new FakeServer();
  const a = makeDevice(server);
  server.online = false;
  await a.put('tasks', task('t1', 'Offline write'));
  await a.engine.drain();
  assert.equal(a.engine.getStatus().state, 'offline');
  assert.equal(a.engine.getStatus().pending, 1);
  assert.match(a.engine.getStatus().lastError ?? '', /Network/);
  server.online = true;
  await a.engine.sync();
  assert.equal(server.get('tasks', 't1')?.title, 'Offline write');
  assert.equal(a.engine.getStatus().state, 'idle');
  assert.equal(a.engine.getStatus().pending, 0);
});

test('P1.1 clock skew: a device clock an hour fast does not win by its timestamps', async () => {
  const server = new FakeServer();
  const a = makeDevice(server);
  const fast = makeDevice(server, { clockOffsetMs: 60 * 60 * 1000 });
  await a.put('tasks', task('t1', 'Original'));
  await a.engine.sync();
  await fast.engine.sync();
  await fast.put('tasks', { ...fast.row('tasks', 't1'), title: 'Fast clock, earlier edit' });
  await fast.engine.sync();
  await a.engine.sync();
  await a.put('tasks', { ...a.row('tasks', 't1'), title: 'Correct clock, later edit' });
  await a.engine.sync();
  await fast.engine.sync();
  assert.ok(parseTime(fast.row('tasks', 't1')?.updatedAt) < parseTime(new Date(Date.now() + 3600e3).toISOString()));
  assert.equal(server.get('tasks', 't1')?.title, 'Correct clock, later edit');
  assert.equal(fast.row('tasks', 't1')?.title, 'Correct clock, later edit');
});

test('P1.1 a push that fails midway keeps the rest and retries without duplicates', async () => {
  const server = new FakeServer();
  const a = makeDevice(server);
  for (let i = 0; i < 600; i++) await a.put('custom_events', { id: `e${String(i).padStart(3, '0')}`, title: `E${i}`, category: 'work', icon: '', start: '09:00', end: '10:00', notes: '', date: '2026-10-07' });
  server.upsertsBeforeFailure = 1; // the first batch of 500 succeeds, the second fails
  await a.engine.drain(true);
  assert.equal(server.all('custom_events').length, 500);
  assert.equal(a.data.outbox.entries.length, 100);
  assert.equal(a.engine.getStatus().state, 'error');
  assert.match(a.engine.getStatus().lastError ?? '', /500/);
  assert.ok(a.data.outbox.nextAttemptAt > Date.now(), 'backs off');
  await a.engine.drain(); // within the backoff: nothing sent
  assert.equal(server.all('custom_events').length, 500);
  server.upsertsBeforeFailure = null;
  await a.engine.sync();
  assert.equal(server.all('custom_events').length, 600);
  assert.equal(a.data.outbox.entries.length, 0);
  assert.equal(a.data.outbox.attempts, 0);
});

test('P1.1 restart with a non-empty outbox: the queued write still reaches the server', async () => {
  const server = new FakeServer();
  const a = makeDevice(server);
  server.online = false;
  await a.put('tasks', task('t1', 'Before restart'));
  await a.engine.drain();
  a.restart();
  server.online = true;
  await a.engine.sync();
  assert.equal(server.get('tasks', 't1')?.title, 'Before restart');
  assert.equal(a.data.outbox.entries.length, 0);
});

test('P1.1 a pull during a push keeps the local write; a write during a push is not lost', async () => {
  const server = new FakeServer();
  const a = makeDevice(server);
  await a.put('tasks', task('t1', 'v1'));
  await a.engine.sync();
  await a.put('tasks', { ...a.row('tasks', 't1'), title: 'v2' });
  let release!: () => void;
  server.gate = new Promise((r) => (release = r));
  const pushing = a.engine.drain(true);
  await wait(5);
  server.gate = null;
  await a.engine.pullOnly(); // the server still has v1
  assert.equal(a.row('tasks', 't1')?.title, 'v2', 'pull did not overwrite the in-flight write');
  await a.put('tasks', { ...a.row('tasks', 't1'), title: 'v3' }); // written while v2 is in flight
  release();
  await pushing;
  assert.equal(a.data.outbox.entries.length, 1, 'v3 is still queued');
  await a.engine.sync();
  assert.equal(server.get('tasks', 't1')?.title, 'v3');
  assert.equal(a.row('tasks', 't1')?.title, 'v3');
});

test('P1.1 a server without the new columns: pulls keep local values, pushes leave them out', async () => {
  const server = new FakeServer();
  server.caps = { serverUpdatedAt: false, taskPipeline: false };
  const desk = makeDevice(server);
  await desk.put('tasks', task('t1', 'Plan', { durationMinutes: 45, startTime: '10:30', recurrence: 'weekly', recurrenceDays: ['Mon', 'Thu'], recurrenceMonthDay: undefined, dueDate: '2026-10-08' }));
  await desk.put('projects', { key: 'p1', name: 'Work', createdAt: 'c', colorKey: 'sage' });
  await desk.engine.sync();
  assert.equal(desk.engine.getStatus().state, 'idle', desk.engine.getStatus().lastError ?? '');
  assert.equal(server.get('tasks', 't1')?.duration_minutes, undefined, 'not sent');
  // An older iPhone renames it (no new columns, no deleted_at)
  server.legacyUpsert('tasks', { ...server.get('tasks', 't1'), title: 'Plan (renamed on phone)', updated_at: new Date(Date.now() + 1000).toISOString() });
  await desk.engine.sync();
  const t = desk.row('tasks', 't1')!;
  assert.equal(t.title, 'Plan (renamed on phone)');
  assert.equal(t.durationMinutes, 45);
  assert.equal(t.startTime, '10:30');
  assert.deepEqual(t.recurrenceDays, ['Mon', 'Thu']);
  assert.equal(desk.row('projects', 'p1')?.colorKey, 'sage');
  // The migrations are applied: the next sync uploads the local values
  server.caps = { serverUpdatedAt: true, taskPipeline: true };
  await desk.engine.sync();
  assert.equal(server.get('tasks', 't1')?.duration_minutes, 45);
  assert.equal(server.get('tasks', 't1')?.start_time, '10:30');
  assert.equal(server.get('projects', 'p1')?.color_key, 'sage');
  const phone = makeDevice(server);
  await phone.engine.sync();
  assert.equal(phone.row('tasks', 't1')?.durationMinutes, 45);
  assert.equal(phone.row('projects', 'p1')?.colorKey, 'sage');
});

test('first sign in with data on both sides: upload local-only, download server-only, conflicts by the rules, no duplicates', async () => {
  const server = new FakeServer();
  const phone = makeDevice(server);
  await phone.put('tasks', task('phone-only', 'From the phone'));
  await phone.put('tasks', task('both-newer-server', 'Server version'));
  await phone.put('tasks', task('both-newer-desk', 'Server version, older'));
  await phone.engine.sync();
  // Desktop: rows made while signed out (nothing queued), then sign in
  const desk = makeDevice(server);
  await desk.put('tasks', task('desk-only', 'From the desktop'), false);
  await desk.put('tasks', { ...task('desk-deleted', 'Deleted on desktop'), deletedAt: '2026-10-05T12:00:00.000Z' }, false);
  desk.data.tables.set('tasks', [
    ...desk.rows('tasks'),
    task('both-newer-server', 'Desktop version, older', { updatedAt: '2000-01-01T00:00:00.000Z' }),
    task('both-newer-desk', 'Desktop version, newer', { updatedAt: '2099-01-01T00:00:00.000Z' }),
  ]);
  assert.equal(desk.data.outbox.entries.length, 0);
  await desk.engine.sync();
  const ids = (rows: Row[]) => rows.map((r) => r.id).sort();
  assert.deepEqual(ids(server.all('tasks')), ['both-newer-desk', 'both-newer-server', 'desk-deleted', 'desk-only', 'phone-only']);
  assert.deepEqual(ids(desk.rows('tasks')), ids(server.all('tasks')), 'no duplicates, nothing missing');
  assert.equal(desk.row('tasks', 'phone-only')?.title, 'From the phone');
  assert.equal(server.get('tasks', 'desk-only')?.title, 'From the desktop');
  assert.ok(server.get('tasks', 'desk-deleted')?.deleted_at, 'local tombstone uploaded, not lost');
  assert.equal(server.get('tasks', 'both-newer-server')?.title, 'Server version');
  assert.equal(desk.row('tasks', 'both-newer-server')?.title, 'Server version');
  assert.equal(server.get('tasks', 'both-newer-desk')?.title, 'Desktop version, newer');
  await phone.engine.sync();
  assert.deepEqual(ids(phone.rows('tasks')), ids(server.all('tasks')));
  assert.ok(phone.row('tasks', 'desk-deleted')?.deletedAt);
});

test('pagination: 2,500 rows arrive through a 1,000 row cap; incremental pulls fetch only changes', async () => {
  const server = new FakeServer();
  const a = makeDevice(server);
  for (let i = 0; i < 2500; i++) {
    server.legacyUpsert('custom_events', { user_id: 'u1', id: `e${String(i).padStart(4, '0')}`, title: `E${i}`, category: 'work', icon: '', start: '09:00', end: '10:00', notes: '', date: '2026-10-07', updated_at: '2026-10-01T09:00:00Z', deleted_at: null });
  }
  await a.engine.sync();
  assert.equal(a.rows('custom_events').length, 2500);
  server.maxRows = 300; // a lower cap must not truncate either
  const b = makeDevice(server);
  await b.engine.sync();
  assert.equal(b.rows('custom_events').length, 2500);
  server.legacyUpsert('custom_events', { ...server.get('custom_events', 'e0007'), title: 'Changed' });
  const before = server.calls;
  await a.engine.sync();
  assert.equal(a.row('custom_events', 'e0007')?.title, 'Changed');
  assert.ok(server.calls - before < 20, 'incremental, not a full re-download');
});

test('routine completions: un-completing elsewhere is not undone (V7a); unsent ones are kept', async () => {
  const server = new FakeServer();
  const a = makeDevice(server);
  const b = makeDevice(server);
  await a.complete('r1', '2026-10-06');
  await a.engine.sync();
  await b.engine.sync();
  assert.equal(b.data.completions.length, 1);
  await a.uncomplete('r1', '2026-10-06');
  await a.engine.sync();
  await b.engine.sync();
  assert.equal(b.data.completions.length, 0, 'B dropped it instead of uploading it again');
  assert.equal(server.all('routine_completions').length, 0);
  // Completed on B while offline: kept and uploaded later
  server.online = false;
  await b.complete('r1', '2026-10-07');
  await b.engine.sync();
  server.online = true;
  await b.engine.sync();
  assert.equal(server.all('routine_completions').length, 1);
  // Old completions are never pruned by sync
  const old = { routineId: 'r2', date: '2025-01-01', completedAt: '2025-01-01T08:00:00.000Z' };
  b.data.completions.push(old);
  await b.engine.sync();
  assert.ok(server.all('routine_completions').some((c) => c.date === '2025-01-01'));
});

test('label deleted on one device: the other sees the tombstone and the moved tasks', async () => {
  const server = new FakeServer();
  const desk = makeDevice(server);
  const phone = makeDevice(server);
  await desk.put('projects', { key: 'w1', name: 'Work', createdAt: 'c', colorKey: 'sage' });
  await desk.put('projects', { key: 'w2', name: 'work', createdAt: 'c', colorKey: 'sky' });
  await desk.put('tasks', task('t1', 'Report', { projectKey: 'w1' }));
  await desk.engine.sync();
  await phone.engine.sync();
  // Delete w1 on the desktop: move its task to w2, then tombstone w1
  await desk.put('tasks', { ...desk.row('tasks', 't1'), projectKey: 'w2' });
  await desk.remove('projects', 'w1');
  await desk.engine.sync();
  await phone.engine.sync();
  assert.ok(phone.row('projects', 'w1')?.deletedAt);
  assert.equal(phone.row('tasks', 't1')?.projectKey, 'w2');
  assert.equal(phone.row('projects', 'w2')?.colorKey, 'sky');
});

test('recurring task fields and colours round trip between devices', async () => {
  const server = new FakeServer();
  const a = makeDevice(server);
  const b = makeDevice(server);
  await a.put('tasks', task('t1', 'Bins', { dueDate: '2026-10-31', recurrence: 'monthly', recurrenceMonthDay: 31, durationMinutes: 10, startTime: '07:30' }));
  await a.engine.sync();
  await b.engine.sync();
  const t = b.row('tasks', 't1')!;
  assert.equal(t.recurrence, 'monthly');
  assert.equal(t.recurrenceMonthDay, 31);
  assert.equal(t.durationMinutes, 10);
  assert.equal(t.startTime, '07:30');
  // Clearing a duration (None) propagates as null -> undefined
  await b.put('tasks', { ...t, durationMinutes: undefined });
  await b.engine.sync();
  await a.engine.sync();
  assert.equal(a.row('tasks', 't1')?.durationMinutes, undefined);
});

test('status: errors are recorded, success clears the state', async () => {
  const server = new FakeServer();
  const a = makeDevice(server);
  const seen: string[] = [];
  a.engine.subscribe((s) => seen.push(s.state));
  server.upsertsBeforeFailure = 0;
  await a.put('tasks', task('t1', 'x'));
  await a.engine.sync();
  assert.equal(a.engine.getStatus().state, 'error');
  assert.ok(a.engine.getStatus().lastErrorAt);
  server.upsertsBeforeFailure = null;
  await a.engine.sync();
  assert.equal(a.engine.getStatus().state, 'idle');
  assert.ok(a.engine.getStatus().lastSuccessAt);
  assert.ok(seen.includes('syncing'));
});
