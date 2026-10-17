// Run with `npm test` from mobile/. Estimate against actual (build plan phase 2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { actualOf, estimateOf, formatTaskTime, formatTotals, isOverEstimate, totalsOf } from './taskTotals.ts';
import { startTimer } from './taskTimer.ts';
import type { Task } from './types.ts';

const T0 = Date.parse('2026-10-16T09:00:00.000Z');
const MIN = 60000;
const task = (extra: Partial<Task> = {}): Task => ({ id: 't', title: 'T', completed: false, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', ...extra });

test('a missing actual reads as 0, a missing estimate as 0', () => {
  assert.equal(actualOf(task(), T0), 0);
  assert.equal(actualOf(task({ actualMinutes: undefined }), T0), 0);
  assert.equal(estimateOf(task()), 0);
  assert.equal(estimateOf(task({ durationMinutes: 45 })), 45);
  assert.equal(estimateOf(task({ durationMinutes: -5 })), 0);
  assert.equal(estimateOf(task({ durationMinutes: Number.NaN })), 0);
});

test('totals sum estimates and actuals; deleted tasks never count; null actual is 0', () => {
  const tasks = [
    task({ id: 'a', durationMinutes: 60, actualMinutes: 25, completed: true }),
    task({ id: 'b', durationMinutes: 30 }),
    task({ id: 'c', actualMinutes: 10 }),
    task({ id: 'd', durationMinutes: 999, actualMinutes: 999, deletedAt: '2026-10-02T00:00:00.000Z' }),
  ];
  assert.deepEqual(totalsOf(tasks, T0), { count: 3, done: 1, estimate: 90, actual: 35 });
  assert.deepEqual(totalsOf([], T0), { count: 0, done: 0, estimate: 0, actual: 0 });
});

test('a running timer counts for the time it has run, rounded down; a future start counts 0', () => {
  const running = startTimer(task({ durationMinutes: 60, actualMinutes: 10 }), T0);
  assert.equal(actualOf(running, T0 + 7 * MIN + 59_000), 17);
  assert.equal(actualOf(running, T0 - 5 * MIN), 10, 'the other clock is ahead: the running part is 0');
  assert.equal(totalsOf([running], T0 + 20 * MIN).actual, 30);
});

test('text: actual / estimate in H:MM, nothing at all for an empty day', () => {
  assert.equal(formatTotals({ estimate: 90, actual: 25 }), '0:25 / 1:30');
  assert.equal(formatTotals({ estimate: 0, actual: 0 }), '');
  assert.equal(formatTotals({ estimate: 0, actual: 5 }), '0:05 / 0:00');
  assert.equal(formatTaskTime(task({ durationMinutes: 60, actualMinutes: 25 }), T0), '0:25 / 1:00');
  assert.equal(formatTaskTime(task(), T0), '0:00 / 0:00');
});

test('over the estimate only when there is an estimate', () => {
  assert.equal(isOverEstimate({ estimate: 60, actual: 61 }), true);
  assert.equal(isOverEstimate({ estimate: 60, actual: 60 }), false);
  assert.equal(isOverEstimate({ estimate: 0, actual: 30 }), false);
});

test('2.26.0 the add task box total: estimated time still to do, "5h planned"', async () => {
  const { plannedText } = await import('./taskTotals.ts');
  const t = (durationMinutes?: number, completed = false, deletedAt?: string) => ({ durationMinutes, completed, deletedAt });
  assert.equal(plannedText([]), '');
  assert.equal(plannedText([t(undefined), t(0)]), '');
  assert.equal(plannedText([t(120), t(180)]), '5h planned');
  assert.equal(plannedText([t(60), t(30)]), '1h 30m planned');
  assert.equal(plannedText([t(45)]), '45m planned');
  assert.equal(plannedText([t(45), t(600, true), t(60, false, '2026-10-01T00:00:00Z')]), '45m planned');
});
