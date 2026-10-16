// Run with `npm test` from mobile/. Rollover (build plan phase 5).
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPatches, canRollToToday, isSeriesRow, planCarryToTomorrow, planRollover, tomorrowOf } from './rollover.ts';
import type { Task } from './types.ts';

const STAMP = '2026-10-01T00:00:00.000Z';
const T = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, completed: false, createdAt: STAMP, updatedAt: STAMP, ...extra });
const TODAY = '2026-10-16';

const tasks = [
  T('old', { dueDate: '2026-10-14' }),
  T('placed', { dueDate: '2026-10-15', startTime: '09:30', durationMinutes: 30 }),
  T('done', { dueDate: '2026-10-14', completed: true, completedAt: STAMP }),
  T('today', { dueDate: TODAY }),
  T('future', { dueDate: '2026-10-20' }),
  T('nodate'),
  T('gone', { dueDate: '2026-10-10', deletedAt: STAMP }),
  T('series', { dueDate: '2026-10-12', recurrence: 'daily' }),
  T('series:2026-10-13', { dueDate: '2026-10-13' }),
  T('bad', { dueDate: 'yesterday' }),
];

test('only unfinished tasks of earlier days move, never a repeating series row', () => {
  assert.deepEqual(planRollover(tasks, TODAY).map((p) => p.id), ['old', 'placed']);
  for (const p of planRollover(tasks, TODAY)) assert.deepEqual(p.fields, { dueDate: TODAY });
  assert.equal(isSeriesRow({ id: 'series:2026-10-13' }), true, 'an occurrence id is a series row even without a rule');
  assert.equal(isSeriesRow({ id: 'x', recurrence: 'weekly' }), true);
  assert.equal(isSeriesRow({ id: 'x' }), false);
  assert.equal(canRollToToday(T('x', { dueDate: '2026-10-16' }), TODAY), false, 'today stays');
});

test('a placed task keeps its start time; nothing but the Day changes', () => {
  const after = applyPatches(tasks, planRollover(tasks, TODAY));
  const placed = after.find((t) => t.id === 'placed')!;
  assert.deepEqual(placed, { ...tasks[1], dueDate: TODAY });
  // every other row is exactly the same object
  for (const t of after) if (t.id !== 'old' && t.id !== 'placed') assert.equal(t, tasks.find((x) => x.id === t.id));
});

test('idempotent: running it again after it ran changes nothing', () => {
  const once = applyPatches(tasks, planRollover(tasks, TODAY));
  assert.deepEqual(planRollover(once, TODAY), []);
  const twice = applyPatches(once, planRollover(once, TODAY));
  assert.deepEqual(twice, once);
});

test('two devices: each runs it on its own copy; both write the same values, in either order the result is one', () => {
  const deviceA = structuredClone(tasks);
  const deviceB = structuredClone(tasks);
  const a = planRollover(deviceA, TODAY);
  const b = planRollover(deviceB, TODAY);
  assert.deepEqual(a, b, 'the same plan from the same rows');
  // the server keeps whichever write of a row arrives last: A then B, or B then A
  const aThenB = applyPatches(applyPatches(structuredClone(tasks), a), b);
  const bThenA = applyPatches(applyPatches(structuredClone(tasks), b), a);
  assert.deepEqual(aThenB, bThenA);
  // and a device that already received the other's result plans nothing
  assert.deepEqual(planRollover(aThenB, TODAY), []);
});

test('the input is never changed', () => {
  const before = JSON.stringify(tasks);
  planRollover(tasks, TODAY);
  applyPatches(tasks, planRollover(tasks, TODAY));
  assert.equal(JSON.stringify(tasks), before);
});

test('Shutdown: only the chosen unfinished tasks of today go to tomorrow, never a series row', () => {
  const rows = [T('a', { dueDate: TODAY }), T('b', { dueDate: TODAY }), T('c', { dueDate: TODAY, completed: true }), T('s', { dueDate: TODAY, recurrence: 'daily' }), T('y', { dueDate: '2026-10-15' })];
  const plan = planCarryToTomorrow(rows, TODAY, new Set(['a', 'c', 's', 'y']));
  assert.deepEqual(plan, [{ id: 'a', fields: { dueDate: '2026-10-17' } }]);
  const once = applyPatches(rows, plan);
  assert.deepEqual(planCarryToTomorrow(once, TODAY, new Set(['a', 'b'])), [{ id: 'b', fields: { dueDate: '2026-10-17' } }], 'a moved, so only b');
  assert.equal(tomorrowOf('2026-12-31'), '2027-01-01');
  assert.equal(tomorrowOf('2028-02-28'), '2028-02-29');
});
