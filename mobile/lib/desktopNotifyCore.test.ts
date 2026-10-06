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
