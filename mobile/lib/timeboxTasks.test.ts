// Run with `npm test` from mobile/. Which tasks a Timebox day draws (checkpoint 8.4).
import test from 'node:test';
import assert from 'node:assert/strict';
import { tasksForTimebox } from './timeboxTasks.ts';
import { continuationOf } from './timebox.ts';
import type { Task } from './types.ts';

const TODAY = '2026-10-07';
function row(id: string, extra: Partial<Task> = {}): Task {
  return { id, title: id, completed: false, createdAt: '2026-10-01T08:00:00.000Z', updatedAt: '2026-10-06T08:00:00.000Z', ...extra };
}
const ids = (list: Array<{ task: Task }>) => list.map((d) => d.task.id);

test('a stored task belongs to the day it starts on; an overnight one spills into the next day', () => {
  const night = row('night', { dueDate: TODAY, startTime: '22:00', durationMinutes: 480 });
  const day = tasksForTimebox([night], TODAY, TODAY);
  assert.deepEqual(ids(day.own), ['night']);
  assert.deepEqual(day.spill, []);
  const next = tasksForTimebox([night], '2026-10-08', TODAY);
  assert.deepEqual(next.own, []);
  assert.deepEqual(ids(next.spill), ['night']);
  assert.deepEqual(continuationOf(next.spill[0].task), { id: 'cont:night', startMin: 0, endMin: 360 });
  // and not on the day after that
  assert.deepEqual(tasksForTimebox([night], '2026-10-09', TODAY).spill, []);
});

test('a task that ends by midnight does not spill', () => {
  const t = row('late', { dueDate: TODAY, startTime: '22:00', durationMinutes: 120 });
  assert.deepEqual(tasksForTimebox([t], '2026-10-08', TODAY).spill, []);
});

test('tombstones are never drawn', () => {
  const t = row('gone', { dueDate: TODAY, startTime: '22:00', durationMinutes: 480, deletedAt: '2026-10-06T00:00:00.000Z' });
  const day = tasksForTimebox([t], TODAY, TODAY);
  assert.deepEqual(day.own, []);
  assert.deepEqual(tasksForTimebox([t], '2026-10-08', TODAY).spill, []);
});

test('a repeating routine is drawn on every coming day as a projected occurrence', () => {
  const series = row('r', { dueDate: '2026-10-05', completed: true, recurrence: 'daily', startTime: '05:00', durationMinutes: 45 });
  for (const day of ['2026-10-07', '2026-10-08', '2026-10-20']) {
    const d = tasksForTimebox([series], day, TODAY);
    assert.deepEqual(ids(d.own), [`r:${day}`]);
    assert.equal(d.own[0].projected, true);
    assert.equal(d.own[0].task.startTime, '05:00');
  }
});

test('nothing is projected on a day before today', () => {
  const series = row('r', { dueDate: '2026-10-01', completed: true, recurrence: 'daily', startTime: '05:00' });
  assert.deepEqual(tasksForTimebox([series], '2026-10-05', TODAY).own, []);
  assert.deepEqual(tasksForTimebox([series], '2026-10-06', TODAY).own, []);
});

test('a stored occurrence replaces the projection for its day (no duplicate)', () => {
  const rows = [
    row('r', { dueDate: '2026-10-05', completed: true, recurrence: 'daily', startTime: '05:00' }),
    row('r:2026-10-08', { dueDate: '2026-10-08', recurrence: 'daily', startTime: '05:00' }),
  ];
  const d = tasksForTimebox(rows, '2026-10-08', TODAY);
  assert.deepEqual(ids(d.own), ['r:2026-10-08']);
  assert.equal(d.own[0].projected, false);
});

test('a skipped day draws nothing', () => {
  const rows = [
    row('r', { dueDate: '2026-10-05', completed: true, recurrence: 'daily', startTime: '05:00' }),
    row('r:2026-10-09', { dueDate: '2026-10-09', recurrence: 'daily', deletedAt: '2026-10-07T00:00:00.000Z' }),
  ];
  assert.deepEqual(tasksForTimebox(rows, '2026-10-09', TODAY).own, []);
  assert.deepEqual(ids(tasksForTimebox(rows, '2026-10-10', TODAY).own), ['r:2026-10-10']);
});

test('a projected overnight routine shows its continuation the next day too', () => {
  const series = row('night', { dueDate: '2026-10-05', completed: true, recurrence: 'daily', startTime: '22:00', durationMinutes: 480 });
  // the day after today: today's projected occurrence (or the stored one) spills over
  const tomorrow = tasksForTimebox([series], '2026-10-08', TODAY);
  assert.deepEqual(ids(tomorrow.own), ['night:2026-10-08']);
  assert.deepEqual(ids(tomorrow.spill), ['night:2026-10-07']);
  assert.equal(tomorrow.spill[0].projected, true);
  assert.deepEqual(continuationOf(tomorrow.spill[0].task), { id: 'cont:night:2026-10-07', startMin: 0, endMin: 360 });
});

test('today shows the rest of yesterday even when yesterday was only ever projected (display only)', () => {
  const series = row('night', { dueDate: '2026-10-05', completed: true, recurrence: 'daily', startTime: '22:00', durationMinutes: 480 });
  // 6 Oct has no stored row: it is a projected occurrence in the past
  const today = tasksForTimebox([series], TODAY, TODAY);
  assert.deepEqual(ids(today.own), ['night:2026-10-07']);
  assert.deepEqual(ids(today.spill), ['night:2026-10-06']);
});

test('a past day never shows a projected spill', () => {
  const series = row('night', { dueDate: '2026-10-01', completed: true, recurrence: 'daily', startTime: '22:00', durationMinutes: 480 });
  const past = tasksForTimebox([series], '2026-10-06', TODAY);
  assert.deepEqual(past.own, []);
  assert.deepEqual(past.spill, []);
});

test('a skipped day does not spill into the next', () => {
  const rows = [
    row('night', { dueDate: '2026-10-05', completed: true, recurrence: 'daily', startTime: '22:00', durationMinutes: 480 }),
    row('night:2026-10-08', { dueDate: '2026-10-08', recurrence: 'daily', deletedAt: '2026-10-07T00:00:00.000Z' }),
  ];
  assert.deepEqual(tasksForTimebox(rows, '2026-10-09', TODAY).spill, []);
});

test('an ended series draws nothing beyond its stored rows', () => {
  const rows = [row('night', { dueDate: '2026-10-05', completed: true, startTime: '22:00', durationMinutes: 480 })];
  assert.deepEqual(tasksForTimebox(rows, '2026-10-08', TODAY).own, []);
  assert.deepEqual(tasksForTimebox(rows, '2026-10-08', TODAY).spill, []);
});
