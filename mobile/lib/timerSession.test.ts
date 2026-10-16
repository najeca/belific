// Run with `npm test` from mobile/. Which timer runs, and starting another (phase 2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { activeTimerTask, planStart, runningTasks, stoppedFields } from './timerSession.ts';
import { STALE_TIMER_MS } from './taskTimer.ts';
import type { Task } from './types.ts';

const T0 = Date.parse('2026-10-16T09:00:00.000Z');
const MIN = 60000;
const iso = (ms: number) => new Date(ms).toISOString();
const task = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, completed: false, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', ...extra });

test('the active timer is the most recently started live one', () => {
  const tasks = [
    task('old', { timerStartedAt: iso(T0 - 30 * MIN) }),
    task('new', { timerStartedAt: iso(T0 - 5 * MIN) }),
    task('idle'),
    task('gone', { timerStartedAt: iso(T0 - MIN), deletedAt: iso(T0) }),
  ];
  assert.deepEqual(runningTasks(tasks).map((t) => t.id), ['new', 'old']);
  assert.equal(activeTimerTask(tasks)?.id, 'new');
  assert.equal(activeTimerTask([task('idle')]), null);
});

test('after a restart the timer is found from stored data alone', () => {
  // Nothing but the task rows: this is all a freshly started app has.
  const stored: Task[] = JSON.parse(JSON.stringify([task('a', { timerStartedAt: iso(T0 - 12 * MIN), actualMinutes: 3 })]));
  assert.equal(activeTimerTask(stored)?.id, 'a');
});

test('starting a timer sets its start time and touches nothing else', () => {
  const plan = planStart([task('a'), task('b')], 'a', T0);
  assert.deepEqual(plan, { kind: 'ok', patches: [{ id: 'a', fields: { timerStartedAt: iso(T0) } }] });
});

test('starting a second timer stops the first, adding whole minutes', () => {
  const tasks = [task('a', { timerStartedAt: iso(T0 - 25 * MIN - 30_000), actualMinutes: 10 }), task('b')];
  const plan = planStart(tasks, 'b', T0);
  assert.equal(plan.kind, 'ok');
  if (plan.kind !== 'ok') return;
  assert.deepEqual(plan.patches, [
    { id: 'a', fields: { actualMinutes: 35, timerStartedAt: undefined } },
    { id: 'b', fields: { timerStartedAt: iso(T0) } },
  ]);
});

test('starting a timer that already runs changes nothing', () => {
  assert.deepEqual(planStart([task('a', { timerStartedAt: iso(T0 - MIN) })], 'a', T0), { kind: 'ok', patches: [] });
});

test('another timer running over 24 hours asks first and changes nothing', () => {
  const tasks = [task('a', { timerStartedAt: iso(T0 - STALE_TIMER_MS - 5 * MIN) }), task('b')];
  assert.deepEqual(planStart(tasks, 'b', T0), { kind: 'confirm', taskId: 'a', elapsedMinutes: 24 * 60 + 5 });
});

test('a task that does not exist or was deleted cannot be started', () => {
  assert.deepEqual(planStart([task('a')], 'nope', T0), { kind: 'missing' });
  assert.deepEqual(planStart([task('a', { deletedAt: iso(T0) })], 'a', T0), { kind: 'missing' });
});

test('stopped fields: total added, start cleared; stale asks; idle is not running', () => {
  const r = stoppedFields(task('a', { timerStartedAt: iso(T0 - 90 * MIN), actualMinutes: 5 }), T0);
  assert.deepEqual(r, { kind: 'stopped', fields: { actualMinutes: 95, timerStartedAt: undefined } });
  assert.equal(stoppedFields(task('a', { timerStartedAt: iso(T0 - 2 * STALE_TIMER_MS) }), T0).kind, 'confirm');
  assert.equal(stoppedFields(task('a'), T0).kind, 'notRunning');
});
