import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNotifyPayload, localMs } from './desktopNotifyCore.ts';

const now = new Date(2026, 9, 6, 8, 0, 0).getTime();
const ev = (id: string, date: string, start: string) => ({ id, title: id, icon: '📅', date, start });
const task = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: id, completed: false, ...extra });

test('localMs reads a Day and a time as local wall time', () => {
  assert.equal(localMs('2026-10-06', '08:00'), now);
  assert.equal(localMs('2026-10-06', '8:00'), null);
  assert.equal(localMs('nope', '08:00'), null);
});

test('events: only future starts inside the window, as epoch ms', () => {
  const p = buildNotifyPayload(
    [ev('past', '2026-10-06', '07:00'), ev('soon', '2026-10-06', '09:30'), ev('far', '2026-10-20', '09:00'), ev('bad', '2026-10-06', 'xx')],
    [],
    now,
  );
  assert.deepEqual(p.events.map((e) => e.id), ['soon']);
  assert.equal(p.events[0].start, new Date(2026, 9, 6, 9, 30).getTime());
});

test('tasks: placed ones carry their start, planned ones only count, completed and Day-less are skipped', () => {
  const p = buildNotifyPayload(
    [],
    [
      task('placed', { dueDate: '2026-10-06', startTime: '10:00' }),
      task('planned', { dueDate: '2026-10-06' }),
      task('tomorrow', { dueDate: '2026-10-07' }),
      task('later', { dueDate: '2026-12-01' }),
      task('done', { dueDate: '2026-10-06', completed: true }),
      task('doneplaced', { dueDate: '2026-10-06', startTime: '11:00', completed: true }),
      task('nodate'),
      task('pastplaced', { dueDate: '2026-10-06', startTime: '07:00' }),
    ],
    now,
  );
  assert.deepEqual(p.placed.map((t) => t.id), ['placed']);
  assert.deepEqual(p.planned.map((t) => t.dueDate), ['2026-10-06', '2026-10-07']);
});

test('the day window rolls over month ends', () => {
  const late = new Date(2026, 9, 31, 22, 0).getTime();
  const p = buildNotifyPayload([], [task('a', { dueDate: '2026-11-01' })], late);
  assert.equal(p.planned.length, 1);
});

test('8.2 the payload carries a per task reminder only when one is set', () => {
  const p = buildNotifyPayload(
    [],
    [
      task('a', { dueDate: '2026-10-06', startTime: '10:00', reminderMinutes: 10 }),
      task('b', { dueDate: '2026-10-06', startTime: '11:00' }),
      task('c', { dueDate: '2026-10-06', reminderMinutes: -1 }),
      task('d', { dueDate: '2026-10-06', reminderMinutes: null }),
    ],
    now,
  );
  assert.equal(p.placed.find((x) => x.id === 'a')!.reminderMinutes, 10);
  assert.equal('reminderMinutes' in p.placed.find((x) => x.id === 'b')!, false);
  assert.deepEqual(p.planned.map((x) => x.reminderMinutes), [-1, undefined]);
});

// ---- Repeating series (checkpoint 8.4, decision 023) ----

const series = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: 'Routine',
  completed: false,
  dueDate: '2026-10-05',
  recurrence: 'daily',
  createdAt: '2026-10-01T08:00:00.000Z',
  updatedAt: '2026-10-05T08:00:00.000Z',
  ...extra,
});

test('a timed daily routine sends every coming occurrence as a placed task with its own reminder lead', () => {
  const p = buildNotifyPayload([], [series('d', { completed: true, startTime: '09:30', reminderMinutes: 10 })], now);
  // 6, 7 and 8 Oct 09:30 are inside the 72 hour window; 9 Oct 09:30 is past 9 Oct 08:00
  assert.deepEqual(p.placed.map((t) => t.id), ['d:2026-10-06', 'd:2026-10-07', 'd:2026-10-08']);
  assert.equal(p.placed[0].start, new Date(2026, 9, 6, 9, 30).getTime());
  assert.ok(p.placed.every((t) => t.reminderMinutes === 10 && t.completed === false));
  assert.deepEqual(p.planned, []);
});

test('an untimed daily routine counts for the daily reminder on every day of the window', () => {
  const p = buildNotifyPayload([], [series('d', { completed: true })], now);
  assert.deepEqual(p.planned.map((t) => t.dueDate), ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']);
  assert.ok(p.planned.every((t) => t.completed === false));
  assert.deepEqual(p.placed, []);
});

test('a stored occurrence replaces its projection: today completed is not counted twice or at all', () => {
  const rows = [series('d', { completed: true }), series('d:2026-10-06', { dueDate: '2026-10-06', completed: true })];
  const p = buildNotifyPayload([], rows, now);
  assert.deepEqual(p.planned.map((t) => t.dueDate), ['2026-10-07', '2026-10-08', '2026-10-09']);
});

test('an unfinished stored occurrence for today counts once, not as a stored task plus a projection', () => {
  const rows = [series('d', { completed: true }), series('d:2026-10-06', { dueDate: '2026-10-06' })];
  const p = buildNotifyPayload([], rows, now);
  assert.equal(p.planned.filter((t) => t.dueDate === '2026-10-06').length, 1);
});

test('a skipped day (a tombstone) sends nothing, and the tombstone itself is never sent', () => {
  const rows = [series('d', { completed: true, startTime: '09:30' }), series('d:2026-10-07', { dueDate: '2026-10-07', startTime: '09:30', deletedAt: '2026-10-06T07:00:00.000Z' })];
  const p = buildNotifyPayload([], rows, now);
  assert.deepEqual(p.placed.map((t) => t.id), ['d:2026-10-06', 'd:2026-10-08']);
});

test('a series that no longer repeats sends nothing beyond its own rows', () => {
  const rows = [series('d', { completed: true, recurrence: undefined })];
  const p = buildNotifyPayload([], rows, now);
  assert.deepEqual(p.planned, []);
  assert.deepEqual(p.placed, []);
});

test('a projected occurrence whose reminder is off carries -1 so the daily count leaves it out', () => {
  const p = buildNotifyPayload([], [series('d', { completed: true, reminderMinutes: -1 })], now);
  assert.ok(p.planned.length > 0 && p.planned.every((t) => t.reminderMinutes === -1));
});
