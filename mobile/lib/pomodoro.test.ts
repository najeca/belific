// Run with `npm test` from mobile/. Pomodoro on the task timer (build plan phase 7):
// it must not break the one timer rule or the whole minute rounding.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_BREAK_MINUTES,
  DEFAULT_FOCUS_MINUTES,
  beginBreak,
  clock,
  describe,
  isPhaseOver,
  keepGoing,
  nextFocus,
  parsePomodoro,
  remainingSeconds,
  serializePomodoro,
  startPomodoro,
  stillStands,
} from './pomodoro.ts';
import { planStart, stoppedFields } from './timerSession.ts';
import { startTimer, stopTimer, STALE_TIMER_MS } from './taskTimer.ts';
import type { Task } from './types.ts';

const T0 = Date.parse('2026-10-16T09:00:00.000Z');
const SEC = 1000;
const MIN = 60 * SEC;
const task = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, completed: false, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', ...extra });

test('a focus period is 25 minutes counted down in whole seconds, then it is over', () => {
  const p = startPomodoro('a', T0);
  assert.deepEqual([p.focusMinutes, p.breakMinutes, p.phase, p.cycle], [DEFAULT_FOCUS_MINUTES, DEFAULT_BREAK_MINUTES, 'focus', 1]);
  assert.equal(remainingSeconds(p, T0), 1500);
  assert.equal(remainingSeconds(p, T0 + 1499), 1500 - 1, 'a part second does not count');
  assert.equal(remainingSeconds(p, T0 + 24 * MIN + 59 * SEC), 1);
  assert.equal(isPhaseOver(p, T0 + 24 * MIN + 59 * SEC), false);
  assert.equal(isPhaseOver(p, T0 + 25 * MIN), true);
  assert.equal(remainingSeconds(p, T0 + 99 * MIN), 0, 'never negative');
  assert.equal(remainingSeconds(p, T0 - 5 * MIN), 1500, 'a clock set back is the full period');
  assert.equal(clock(1500), '25:00');
  assert.equal(clock(61), '1:01');
  assert.equal(describe(p, T0 + 10 * MIN), '🍅 Focus 15:00 left');
  assert.equal(describe(p, T0 + 30 * MIN), '🍅 Focus time is up');
});

test('lengths are whole minutes from 1 to 180, else the default', () => {
  assert.equal(startPomodoro('a', T0, 50, 10).focusMinutes, 50);
  assert.equal(startPomodoro('a', T0, 0, 10).focusMinutes, 25);
  assert.equal(startPomodoro('a', T0, 2.5, 10).focusMinutes, 25);
  assert.equal(startPomodoro('a', T0, 500, 10).focusMinutes, 25);
  assert.equal(startPomodoro('a', T0, 25, -1).breakMinutes, 5);
});

test('the phases: focus, break, next focus; keep going starts another focus period', () => {
  const p = startPomodoro('a', T0);
  const b = beginBreak(p, T0 + 25 * MIN);
  assert.deepEqual([b.phase, b.startedMs, b.cycle], ['break', T0 + 25 * MIN, 1]);
  assert.equal(remainingSeconds(b, T0 + 25 * MIN), 300);
  assert.equal(describe(b, T0 + 27 * MIN), '☕ Break 3:00 left');
  assert.equal(describe(b, T0 + 31 * MIN), '☕ Break is over');
  const n = nextFocus(b, T0 + 31 * MIN);
  assert.deepEqual([n.phase, n.cycle, n.startedMs], ['focus', 2, T0 + 31 * MIN]);
  const k = keepGoing(p, T0 + 25 * MIN);
  assert.deepEqual([k.phase, k.cycle, k.startedMs], ['focus', 2, T0 + 25 * MIN]);
});

test('one timer at a time: starting a focus period stops the other task\'s timer first', () => {
  const other = startTimer(task('other', { actualMinutes: 10 }), T0 - 20 * MIN);
  const plan = planStart([other, task('a')], 'a', T0);
  assert.equal(plan.kind, 'ok');
  if (plan.kind !== 'ok') return;
  assert.deepEqual(plan.patches, [
    { id: 'other', fields: { actualMinutes: 30, timerStartedAt: undefined } },
    { id: 'a', fields: { timerStartedAt: new Date(T0).toISOString() } },
  ]);
  // a timer over a day on the other task asks first, so a pomodoro cannot start silently
  const stale = startTimer(task('old'), T0 - STALE_TIMER_MS - MIN);
  assert.equal(planStart([stale, task('a')], 'a', T0).kind, 'confirm');
});

test('the pomodoro stands only while its own timer is the only one running', () => {
  const p = startPomodoro('a', T0);
  assert.equal(stillStands(p, [{ id: 'a' }]), true);
  assert.equal(stillStands(p, []), false, 'the timer was stopped');
  assert.equal(stillStands(p, [{ id: 'b' }]), false, 'another task\'s timer won');
  assert.equal(stillStands(p, [{ id: 'a' }, { id: 'b' }]), false);
  const b = beginBreak(p, T0 + 25 * MIN);
  assert.equal(stillStands(b, []), true, 'a break has no task timer');
  assert.equal(stillStands(b, [{ id: 'a' }]), false, 'starting a timer ends the break');
});

test('whole minute rounding is the timer\'s: a full focus period adds 25, a second short adds 24', () => {
  const running = startTimer(task('a', { actualMinutes: 5 }), T0);
  const full = stopTimer(running, T0 + 25 * MIN);
  assert.equal(full.kind === 'stopped' && full.task.actualMinutes, 30);
  const short = stopTimer(running, T0 + 25 * MIN - SEC);
  assert.equal(short.kind === 'stopped' && short.task.actualMinutes, 5 + 24, 'rounded down, never up');
  const over = stoppedFields(running, T0 + 25 * MIN + 59 * SEC);
  assert.deepEqual(over, { kind: 'stopped', fields: { actualMinutes: 30, timerStartedAt: undefined } }, 'the part minute after a period is dropped');
  // a break is never added to any task
  const afterBreak = stopTimer({ ...task('a', { actualMinutes: 30 }) }, T0 + 31 * MIN);
  assert.equal(afterBreak.kind, 'notRunning');
});

test('a forgotten pomodoro over a day still asks before anything is added', () => {
  const running = startTimer(task('a'), T0);
  assert.equal(stopTimer(running, T0 + STALE_TIMER_MS + MIN).kind, 'confirm');
});

test('remembered locally: round trip, damaged text is nothing', () => {
  const p = beginBreak(startPomodoro('a', T0, 30, 10), T0 + 30 * MIN);
  assert.deepEqual(parsePomodoro(serializePomodoro(p)), p);
  assert.equal(serializePomodoro(null), '');
  for (const bad of [null, undefined, '', 'nope', '{}', '{"taskId":"a","phase":"x","startedMs":1}', '{"taskId":"","phase":"focus","startedMs":1}', '{"taskId":"a","phase":"focus","startedMs":"1"}']) {
    assert.equal(parsePomodoro(bad as string), null, String(bad));
  }
  const odd = parsePomodoro('{"taskId":"a","phase":"focus","startedMs":5,"focusMinutes":9999,"breakMinutes":0,"cycle":-3}')!;
  assert.deepEqual([odd.focusMinutes, odd.breakMinutes, odd.cycle], [25, 5, 1]);
});
