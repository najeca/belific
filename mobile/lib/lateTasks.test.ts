import test from 'node:test';
import assert from 'node:assert/strict';
import { busyFromEvents, busyFromTasks, isLate, lateMove, nextFreeSlot } from './lateTasks.ts';
import type { Task } from './types.ts';

const T = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, completed: false, createdAt: 't', updatedAt: 'u', ...extra });
const at = (h: number, m = 0) => new Date(2026, 9, 18, h, m);

test('late: placed, not done, its end passed (30 minutes without an estimate)', () => {
  const t = T('a', { dueDate: '2026-10-18', startTime: '09:00', durationMinutes: 60 });
  assert.equal(isLate(t, at(9, 59)), false);
  assert.equal(isLate(t, at(10, 0)), true);
  assert.equal(isLate(T('b', { dueDate: '2026-10-18', startTime: '09:00' }), at(9, 30)), true);
  assert.equal(isLate({ ...t, completed: true }, at(12)), false);
  assert.equal(isLate(T('c', { dueDate: '2026-10-18' }), at(23)), false, 'no time');
  assert.equal(isLate(t, at(12), true), false, 'a projected day of a series');
  assert.equal(isLate(T('d', { dueDate: '2026-10-17', startTime: '23:00', durationMinutes: 120 }), at(0, 30)), false, 'runs past midnight');
  assert.equal(isLate(T('d', { dueDate: '2026-10-17', startTime: '23:00', durationMinutes: 120 }), at(1, 0)), true);
});

test('the next free slot is on a half hour from now and fits between busy blocks', () => {
  const busy = [{ start: 600, end: 660 }, { start: 690, end: 720 }];
  assert.equal(nextFreeSlot(busy, 30, 595), 660); // 10:00 busy, 11:00 free for 30
  assert.equal(nextFreeSlot(busy, 60, 595), 720); // 11:00-12:00 would touch 11:30
  assert.equal(nextFreeSlot([], 30, 23 * 60 + 40), null); // 24:00 reached
  assert.equal(nextFreeSlot([], 30, 23 * 60 + 20), 23 * 60 + 30);
});

test('the move: today at the free slot, or tomorrow at the same time', () => {
  const t = T('a', { dueDate: '2026-10-18', startTime: '09:00', durationMinutes: 60 });
  const busy = busyFromTasks([t, T('b', { dueDate: '2026-10-18', startTime: '11:00', durationMinutes: 60 })], '2026-10-18', 'a');
  assert.deepEqual(lateMove(t, busy, at(10, 10)).patch, { dueDate: '2026-10-18', startTime: '12:00' });
  assert.deepEqual(lateMove(t, [], at(23, 10)).patch, { dueDate: '2026-10-19', startTime: '09:00' });
  assert.match(lateMove(t, [], at(23, 10)).label, /tomorrow/);
});

test('events of the day are busy too; one past midnight is busy to 24:00', () => {
  const ev = [
    { date: '2026-10-18', start: '13:00', end: '14:00' },
    { date: '2026-10-18', start: '23:00', end: '01:00' },
    { date: '2026-10-19', start: '09:00', end: '10:00' },
  ];
  assert.deepEqual(busyFromEvents(ev, '2026-10-18'), [{ start: 780, end: 840 }, { start: 1380, end: 1440 }]);
  assert.equal(nextFreeSlot(busyFromEvents(ev, '2026-10-18'), 60, 12 * 60 + 10), 14 * 60);
});

test('a day of a repeating series is never late (stored or shown): it is never moved', () => {
  assert.equal(isLate(T('gym:2026-10-18', { dueDate: '2026-10-18', startTime: '07:00' }), at(12)), false);
  assert.equal(isLate(T('gym', { dueDate: '2026-10-18', startTime: '07:00', recurrence: 'daily' }), at(12)), false);
  assert.equal(isLate(T('one', { dueDate: '2026-10-18', startTime: '07:00' }), at(12)), true);
});
