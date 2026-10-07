// Run with `npm test` from mobile/. Pure sync rules (checkpoint 5).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_OUTBOX,
  backoffMs,
  cursorQueryFrom,
  enqueue,
  groupByColumns,
  maxServerTime,
  mergeCompletions,
  mergeRows,
  parseTime,
  pendingFor,
  projectFromRemote,
  projectToRemote,
  recordFailure,
  removeSent,
  hasActualValues,
  preserveFieldsFor,
  sanitizeActual,
  sanitizeDays,
  sanitizeReminder,
  sanitizeSubtasks,
  sanitizeDuration,
  sanitizeTime,
  taskFromRemote,
  taskToRemote,
  type OutboxEntry,
} from './syncCore.ts';
import type { Task } from './types.ts';

test('times are parsed, never compared as strings (V7d)', () => {
  const z = '2026-10-06T10:00:00.123Z';
  const pg = '2026-10-06T10:00:00.123+00:00';
  assert.ok(z > pg, 'as strings they differ');
  assert.equal(parseTime(z), parseTime(pg), 'as times they are equal');
  assert.equal(parseTime('nonsense'), 0);
  assert.equal(parseTime(undefined), 0);
  assert.equal(maxServerTime([{ server_updated_at: pg }, { server_updated_at: '2026-10-06T09:00:00+00:00' }], null), pg);
  assert.equal(parseTime(cursorQueryFrom(pg)), parseTime(pg) - 5000);
});

test('outbox: one entry per row, newest wins, a rewrite during a push survives', () => {
  let s = enqueue(EMPTY_OUTBOX, [{ table: 'tasks', key: 't1', op: 'upsert', row: { title: 'a' } }]);
  s = enqueue(s, [{ table: 'tasks', key: 't1', op: 'upsert', row: { title: 'b' } }]);
  s = enqueue(s, [{ table: 'projects', key: 't1', op: 'upsert', row: { name: 'p' } }]);
  assert.equal(s.entries.length, 2);
  const sent = s.entries.filter((e) => e.table === 'tasks');
  assert.equal(sent[0].row?.title, 'b');
  const rewritten = enqueue(s, [{ table: 'tasks', key: 't1', op: 'upsert', row: { title: 'c' } }]);
  const after = removeSent(rewritten, sent);
  assert.equal(after.entries.filter((e) => e.table === 'tasks').length, 1, 'kept: rewritten meanwhile');
  assert.equal(removeSent(s, sent).entries.length, 1);
});

test('backoff grows and caps at 15 minutes', () => {
  assert.equal(backoffMs(0), 0);
  assert.equal(backoffMs(1), 5000);
  assert.equal(backoffMs(2), 15000);
  assert.equal(backoffMs(20), 15 * 60 * 1000);
  assert.equal(recordFailure(EMPTY_OUTBOX, 1000).nextAttemptAt, 6000);
});

type R = { id: string; title: string; updatedAt: string; deletedAt?: string; durationMinutes?: number };
const merge = (local: R[], remote: R[], opts: { pending?: string[]; mode?: 'full' | 'incremental'; preserve?: string[] } = {}) => {
  const pending = new Map<string, OutboxEntry>();
  for (const k of opts.pending ?? []) pending.set(k, { table: 'tasks', key: k, op: 'upsert', row: local.find((l) => l.id === k), version: 1 });
  return mergeRows<R>({ local, remote, keyOf: (r) => r.id, pending, preserveFields: opts.preserve ?? [], mode: opts.mode ?? 'incremental' });
};
const T1 = '2026-10-06T10:00:00.000Z';
const T2 = '2026-10-06T11:00:00.000Z';

test('merge: with nothing pending the server copy wins, even with an older updatedAt', () => {
  const r = merge([{ id: 'a', title: 'local', updatedAt: T2 }], [{ id: 'a', title: 'server', updatedAt: T1 }]);
  assert.equal(r.rows[0].title, 'server');
});

test('merge: a pending local change beats a pulled live row', () => {
  const r = merge([{ id: 'a', title: 'local', updatedAt: T1 }], [{ id: 'a', title: 'server', updatedAt: T2 }], { pending: ['a'] });
  assert.equal(r.rows[0].title, 'local');
  assert.equal(r.changed, false);
});

test('merge: a pulled tombstone wins and cancels the pending edit', () => {
  const r = merge([{ id: 'a', title: 'edit', updatedAt: T2 }], [{ id: 'a', title: 'x', updatedAt: T1, deletedAt: T1 }], { pending: ['a'] });
  assert.ok(r.rows[0].deletedAt);
  assert.deepEqual(r.dropPending, ['a']);
});

test('merge: a local tombstone the server shows alive is queued again', () => {
  const r = merge([{ id: 'a', title: 'x', updatedAt: T1, deletedAt: T1 }], [{ id: 'a', title: 'x', updatedAt: T2 }]);
  assert.ok(r.rows[0].deletedAt);
  assert.equal(r.toEnqueue.length, 1);
});

test('merge, first full pass: Date.parse decides for rows that never went through the outbox', () => {
  const local = [
    { id: 'newer', title: 'local newer', updatedAt: T2 },
    { id: 'older', title: 'local older', updatedAt: T1 },
    { id: 'only-local', title: 'mine', updatedAt: T1 },
  ];
  const remote = [
    { id: 'newer', title: 'server', updatedAt: T1.replace('Z', '+00:00') },
    { id: 'older', title: 'server', updatedAt: T2.replace('Z', '+00:00') },
    { id: 'only-server', title: 'theirs', updatedAt: T1 },
  ];
  const r = merge(local, remote, { mode: 'full' });
  const by = (id: string) => r.rows.find((x) => x.id === id)!;
  assert.equal(by('newer').title, 'local newer');
  assert.equal(by('older').title, 'server');
  assert.equal(by('only-server').title, 'theirs');
  assert.deepEqual(r.toEnqueue.map((x) => x.id).sort(), ['newer', 'only-local']);
  // Equal instants in different formats are NOT "newer" (no endless re-upload)
  const same = merge([{ id: 'a', title: 'l', updatedAt: T1 }], [{ id: 'a', title: 's', updatedAt: T1.replace('Z', '+00:00') }], { mode: 'full' });
  assert.equal(same.toEnqueue.length, 0);
});

test('merge: local-only fields survive a server copy that lacks the columns', () => {
  const r = merge(
    [{ id: 'a', title: 'local', updatedAt: T1, durationMinutes: 45 }],
    [{ id: 'a', title: 'renamed on phone', updatedAt: T2 }],
    { preserve: ['durationMinutes'] },
  );
  assert.equal(r.rows[0].title, 'renamed on phone');
  assert.equal(r.rows[0].durationMinutes, 45);
  // Without preserve (columns exist), the server's "none" wins
  const r2 = merge([{ id: 'a', title: 'l', updatedAt: T1, durationMinutes: 45 }], [{ id: 'a', title: 's', updatedAt: T2 }]);
  assert.equal(r2.rows[0].durationMinutes, undefined);
});

test('completions: seen and missing means deleted elsewhere; pending is kept; unsent is uploaded', () => {
  const c = (routineId: string, date: string) => ({ routineId, date, completedAt: T1 });
  const pending = pendingFor(enqueue(EMPTY_OUTBOX, [{ table: 'routine_completions', key: 'r|2', op: 'upsert', row: c('r', '2') }, { table: 'routine_completions', key: 'r|9', op: 'delete' }]), 'routine_completions');
  const r = mergeCompletions({
    local: [c('r', '1'), c('r', '2'), c('r', '3'), c('r', '4')],
    remote: [c('r', '4'), c('r', '5'), c('r', '9')],
    pending,
    seen: new Set(['r|1', 'r|4']),
  });
  const keys = r.rows.map((x) => x.date).sort();
  assert.deepEqual(keys, ['2', '3', '4', '5']); // 1 dropped (seen), 9 skipped (delete pending)
  assert.deepEqual(r.toEnqueue.map((x) => x.date), ['3']);
  assert.deepEqual([...r.seen].sort(), ['r|4', 'r|5', 'r|9']);
});

const base: Task = { id: 't', title: 'T', completed: false, createdAt: T1, updatedAt: T1 };

test('task mapper: new columns only once the server has them; bad values become null', () => {
  const t = { ...base, durationMinutes: 45, startTime: '10:30', recurrence: 'weekly' as const, recurrenceDays: ['Thu' as const, 'Mon' as const], recurrenceMonthDay: 31 };
  const without = taskToRemote(t, { serverUpdatedAt: true, taskPipeline: false });
  assert.equal('duration_minutes' in without, false);
  assert.equal('deleted_at' in without, false, 'a live row never sends deleted_at');
  const withCols = taskToRemote(t, { serverUpdatedAt: true, taskPipeline: true });
  assert.equal(withCols.duration_minutes, 45);
  assert.equal(withCols.start_time, '10:30');
  assert.deepEqual(withCols.recurrence_days, ['Mon', 'Thu']);
  assert.equal(withCols.recurrence_month_day, 31);
  assert.equal(taskToRemote({ ...base, deletedAt: T2 }, { serverUpdatedAt: true, taskPipeline: true }).deleted_at, T2);
  assert.equal(sanitizeDuration(0), null);
  assert.equal(sanitizeDuration(2000), null);
  assert.equal(sanitizeDuration(7.5), null);
  assert.equal(sanitizeTime('24:00'), null);
  assert.equal(sanitizeTime('9:00'), null);
  assert.equal(sanitizeDays([]), null);
  assert.deepEqual(sanitizeDays(['Sun', 'nope', 'Mon']), ['Mon', 'Sun']);
});

test('task mapper: nulls and missing columns load exactly as before', () => {
  const oldRow = { id: 't', title: 'T', due_date: null, priority: null, project_key: null, notes: null, completed: false, completed_at: null, created_at: T1, origin: null, updated_at: T1, deleted_at: null };
  const t = taskFromRemote(oldRow);
  assert.equal(t.dueDate, undefined);
  assert.equal(t.durationMinutes, undefined);
  assert.equal(t.deletedAt, undefined);
  const newRow = { ...oldRow, duration_minutes: null, start_time: '07:30', recurrence: 'monthly', recurrence_days: null, recurrence_month_day: 31 };
  const n = taskFromRemote(newRow);
  assert.equal(n.durationMinutes, undefined);
  assert.equal(n.startTime, '07:30');
  assert.equal(n.recurrenceMonthDay, 31);
});

test('project mapper: colour key both ways', () => {
  const p = { key: 'p', name: 'Work', createdAt: T1, updatedAt: T1, colorKey: 'sage' };
  assert.equal(projectToRemote(p, { serverUpdatedAt: true, taskPipeline: true }).color_key, 'sage');
  assert.equal('color_key' in projectToRemote(p, { serverUpdatedAt: true, taskPipeline: false }), false);
  assert.equal(projectFromRemote({ key: 'p', name: 'W', created_at: T1, updated_at: T1, deleted_at: null, color_key: 'sky' }).colorKey, 'sky');
  assert.equal(projectFromRemote({ key: 'p', name: 'W', created_at: T1, updated_at: T1, deleted_at: null }).colorKey, undefined);
});

test('an upload batch is split by column set, so a live row never sits next to a tombstone', () => {
  const live = { id: 'a', title: 'x', updated_at: T1 };
  const dead = { id: 'b', title: 'y', updated_at: T1, deleted_at: T2 };
  const live2 = { id: 'c', title: 'z', updated_at: T1 };
  const groups = groupByColumns([live, dead, live2]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].map((r) => r.id), ['a', 'c']);
  assert.deepEqual(groups[1].map((r) => r.id), ['b']);
});

test('8.2 mapper: subtasks and reminder only with migration 3, sanitised', () => {
  const subtasks = [{ id: 'a', title: '  Pack  ', done: true }, { id: 'a', title: 'dup id', done: false }, { id: 'b', title: '   ', done: false }, { id: 'c', title: 'x'.repeat(500), done: false }, { id: 'd', title: 'Ok', done: 'yes' as unknown as boolean }];
  const t = { ...base, subtasks, reminderMinutes: 30 };
  const without = taskToRemote(t, { serverUpdatedAt: true, taskPipeline: true });
  assert.equal('subtasks' in without, false);
  assert.equal('reminder_minutes' in without, false);
  const withCols = taskToRemote(t, { serverUpdatedAt: true, taskPipeline: true, taskExtras: true });
  const sent = withCols.subtasks as Array<{ id: string; title: string; done: boolean }>;
  assert.deepEqual(sent.map((s) => s.id), ['a', 'c', 'd']);
  assert.equal(sent[0].title, 'Pack');
  assert.equal(sent[1].title.length, 200);
  assert.equal(sent[2].done, false);
  assert.equal(withCols.reminder_minutes, 30);
  assert.equal(taskToRemote({ ...base, subtasks: [] }, { serverUpdatedAt: true, taskPipeline: true, taskExtras: true }).subtasks, null);
  assert.equal(taskToRemote({ ...base, reminderMinutes: -1 }, { serverUpdatedAt: true, taskPipeline: true, taskExtras: true }).reminder_minutes, -1);
  assert.equal(taskToRemote({ ...base, reminderMinutes: undefined }, { serverUpdatedAt: true, taskPipeline: true, taskExtras: true }).reminder_minutes, null);
});

test('8.2 mapper: at most 50 subtasks, junk reminder values become null, pulls read them back', () => {
  const many = Array.from({ length: 70 }, (_, i) => ({ id: 's' + i, title: 't' + i, done: false }));
  assert.equal(sanitizeSubtasks(many)!.length, 50);
  assert.equal(sanitizeSubtasks('nope'), null);
  assert.equal(sanitizeSubtasks([null, 3, { id: 1, title: 'x' }]), null);
  assert.equal(sanitizeReminder(-1), -1);
  assert.equal(sanitizeReminder(0), 0);
  assert.equal(sanitizeReminder(-2), null);
  assert.equal(sanitizeReminder(1.5), null);
  assert.equal(sanitizeReminder(99999), null);
  const back = taskFromRemote({ id: 't', title: 'T', completed: false, created_at: T1, updated_at: T1, subtasks: [{ id: 'a', title: 'A', done: true }], reminder_minutes: 5 });
  assert.deepEqual(back.subtasks, [{ id: 'a', title: 'A', done: true }]);
  assert.equal(back.reminderMinutes, 5);
  const old = taskFromRemote({ id: 't', title: 'T', completed: false, created_at: T1, updated_at: T1 });
  assert.equal(old.subtasks, undefined);
  assert.equal(old.reminderMinutes, undefined);
});

test('8.3 mapper: actual_seconds only with migration 4, sanitised, read back', () => {
  const caps = { serverUpdatedAt: true, taskPipeline: true, taskExtras: true };
  assert.equal('actual_seconds' in taskToRemote({ ...base, actualSeconds: 90 }, caps), false);
  assert.equal(taskToRemote({ ...base, actualSeconds: 90 }, { ...caps, taskActual: true }).actual_seconds, 90);
  assert.equal(taskToRemote({ ...base, actualSeconds: 0 }, { ...caps, taskActual: true }).actual_seconds, 0);
  assert.equal(taskToRemote({ ...base, actualSeconds: undefined }, { ...caps, taskActual: true }).actual_seconds, null);
  for (const junk of [-1, 1.5, Number.NaN, Infinity, '60', null, 366 * 86400 + 1]) {
    assert.equal(sanitizeActual(junk), null, String(junk));
  }
  assert.equal(sanitizeActual(366 * 86400), 366 * 86400);
  const back = taskFromRemote({ id: 't', title: 'T', completed: false, created_at: T1, updated_at: T1, actual_seconds: 3600 });
  assert.equal(back.actualSeconds, 3600);
  assert.equal(taskFromRemote({ id: 't', title: 'T', completed: false, created_at: T1, updated_at: T1, actual_seconds: 'x' }).actualSeconds, undefined);
  assert.equal(taskFromRemote({ id: 't', title: 'T', completed: false, created_at: T1, updated_at: T1 }).actualSeconds, undefined, 'a missing column reads as no value');
});

test('8.3 a missing actual_seconds column keeps the local value on pull and queues when it appears', () => {
  const none = { serverUpdatedAt: true, taskPipeline: true, taskExtras: true };
  assert.ok(preserveFieldsFor('tasks', none).includes('actualSeconds'));
  assert.ok(!preserveFieldsFor('tasks', { ...none, taskActual: true }).includes('actualSeconds'));
  assert.equal(hasActualValues('tasks', { actualSeconds: 10 }), true);
  assert.equal(hasActualValues('tasks', { actualSeconds: 0 }), true);
  assert.equal(hasActualValues('tasks', {}), false);
  assert.equal(hasActualValues('projects', { actualSeconds: 10 }), false);
});
