// Run with `npm test` from mobile/. Timer maths (build plan phase 1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { STALE_TIMER_MS, elapsedMinutes, isTimerRunning, setActualMinutes, shownMinutes, startTimer, stopTimer, stopTimerWith } from './taskTimer.ts';
import { MAX_ACTUAL_MINUTES } from './syncCore.ts';
import type { Task } from './types.ts';

// The timer fields only, typed, so a literal like {} is a task without a timer.
const tf = (x: Pick<Task, 'actualMinutes' | 'timerStartedAt'>) => x;

const T0 = Date.parse('2026-10-16T09:00:00.000Z');
const MIN = 60000;

test('elapsed time is whole minutes, rounded down, never negative', () => {
  const start = new Date(T0).toISOString();
  assert.equal(elapsedMinutes(start, T0), 0);
  assert.equal(elapsedMinutes(start, T0 + 59_999), 0);
  assert.equal(elapsedMinutes(start, T0 + MIN), 1);
  assert.equal(elapsedMinutes(start, T0 + 90 * MIN + 59_000), 90);
  assert.equal(elapsedMinutes(start, T0 - 5 * MIN), 0, 'other clock ahead');
  assert.equal(elapsedMinutes('nonsense', T0), 0);
  // Postgres format parses the same
  assert.equal(elapsedMinutes('2026-10-16T09:00:00+00:00', T0 + 3 * MIN), 3);
});

test('start sets the start time once; a second start keeps the first', () => {
  const a = startTimer(tf({ actualMinutes: 5 }), T0);
  assert.equal(a.timerStartedAt, '2026-10-16T09:00:00.000Z');
  assert.ok(isTimerRunning(a));
  assert.equal(startTimer(a, T0 + 10 * MIN), a);
  assert.equal(isTimerRunning(tf({})), false);
  assert.equal(isTimerRunning(tf({ timerStartedAt: 'bad' })), false);
});

test('stop adds the elapsed whole minutes to the total and clears the timer', () => {
  const running = startTimer(tf({ actualMinutes: 10 }), T0);
  const r = stopTimer(running, T0 + 25 * MIN + 30_000);
  assert.equal(r.kind, 'stopped');
  if (r.kind !== 'stopped') return;
  assert.equal(r.task.actualMinutes, 35);
  assert.equal('timerStartedAt' in r.task, false);
  // no total yet counts from 0; under a minute adds 0
  const r2 = stopTimer(startTimer(tf({}), T0), T0 + 40_000);
  assert.equal(r2.kind === 'stopped' && r2.task.actualMinutes, 0);
  assert.deepEqual(stopTimer(tf({ actualMinutes: 3 }), T0), { kind: 'notRunning' });
});

test('a timer running for more than 24 hours asks first and adds what the person chose', () => {
  const running = startTimer(tf({ actualMinutes: 10 }), T0);
  assert.equal(stopTimer(running, T0 + STALE_TIMER_MS).kind, 'stopped', 'exactly 24h is still added');
  const r = stopTimer(running, T0 + STALE_TIMER_MS + MIN);
  assert.deepEqual(r, { kind: 'confirm', elapsedMinutes: 24 * 60 + 1 });
  assert.equal(stopTimerWith(running, 45).actualMinutes, 55);
  assert.equal(stopTimerWith(running, 0).actualMinutes, 10);
  assert.equal(stopTimerWith(running, -5).actualMinutes, 10);
  assert.equal(stopTimerWith(running, Number.NaN).actualMinutes, 10);
  assert.equal('timerStartedAt' in stopTimerWith(running, 0), false);
});

test('the card total includes the running time; totals are capped', () => {
  const running = startTimer(tf({ actualMinutes: 10 }), T0);
  assert.equal(shownMinutes(running, T0 + 7 * MIN), 17);
  assert.equal(shownMinutes(tf({ actualMinutes: 4 }), T0), 4);
  assert.equal(shownMinutes(tf({}), T0), 0);
  assert.equal(stopTimerWith(tf({ actualMinutes: MAX_ACTUAL_MINUTES - 1 }), 100).actualMinutes, MAX_ACTUAL_MINUTES);
});

test('actual time typed by hand: whole minutes from 0, anything else changes nothing', () => {
  assert.equal(setActualMinutes(tf({ actualMinutes: 3 }), 90)?.actualMinutes, 90);
  assert.equal(setActualMinutes(tf({}), 0)?.actualMinutes, 0);
  assert.equal(setActualMinutes(tf({}), -1), null);
  assert.equal(setActualMinutes(tf({}), 1.5), null);
  assert.equal(setActualMinutes(tf({}), MAX_ACTUAL_MINUTES + 1), null);
  // a running timer keeps running
  assert.ok(setActualMinutes(startTimer(tf({}), T0), 5)?.timerStartedAt);
});
