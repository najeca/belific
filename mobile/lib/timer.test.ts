// Run with `npm test` from mobile/. Task timer (checkpoint 8.3, decision 022).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LONG_TIMER_SECONDS,
  addActual,
  elapsedSeconds,
  isLongRun,
  liveActualSeconds,
  parseTimer,
  pruneTimer,
  storedForTyped,
} from './timer.ts';
import { createTimerController, type TimerTask } from './timerController.ts';
import { buildNextOccurrence } from './recurrence.ts';
import type { Task } from './types.ts';

const SEC = 1000;
const HOUR = 3600 * SEC;

// ---- the maths ----
test('elapsed time comes from two timestamps, whole seconds', () => {
  assert.equal(elapsedSeconds(1000, 1000), 0);
  assert.equal(elapsedSeconds(0, 999), 0);
  assert.equal(elapsedSeconds(0, 1000), 1);
  assert.equal(elapsedSeconds(0, 61_500), 61);
  assert.equal(elapsedSeconds(5 * HOUR, 7 * HOUR), 7200);
});

test('a clock that goes backwards never gives a negative time', () => {
  assert.equal(elapsedSeconds(10_000, 4_000), 0);
  assert.equal(elapsedSeconds(Date.now() + HOUR, Date.now()), 0);
  assert.equal(elapsedSeconds(Number.NaN, 5), 0);
  assert.equal(elapsedSeconds(5, Number.POSITIVE_INFINITY), 0);
});

test('accumulating: stored seconds plus the run, never negative or fractional', () => {
  assert.equal(addActual(undefined, 90), 90);
  assert.equal(addActual(100, 50), 150);
  assert.equal(addActual(100, -50), 100);
  assert.equal(addActual(-5, 10), 10);
  assert.equal(addActual(10.9, 1.9), 11);
  assert.equal(addActual(100, Number.NaN), 100);
  assert.equal(addActual(366 * 86400, 1000), 366 * 86400);
});

test('live Actual: only the running task gets the running time', () => {
  const timer = { taskId: 'a', startedAt: 0 };
  assert.equal(liveActualSeconds(60, timer, 'a', 30_000), 90);
  assert.equal(liveActualSeconds(60, timer, 'b', 30_000), 60);
  assert.equal(liveActualSeconds(undefined, null, 'a', 30_000), 0);
  assert.equal(liveActualSeconds(60, timer, 'a', -5000), 60, 'clock going backwards');
});

test('a typed correction while running: stored part makes the shown total match', () => {
  assert.equal(storedForTyped(3600, 0), 3600);
  assert.equal(storedForTyped(3600, 600), 3000);
  assert.equal(storedForTyped(300, 600), 0, 'never negative');
  assert.equal(storedForTyped(0, 0), 0);
});

test('the 12 hour threshold: over is long, exactly 12 hours is not', () => {
  assert.equal(LONG_TIMER_SECONDS, 43200);
  assert.equal(isLongRun(43200), false);
  assert.equal(isLongRun(43201), true);
  assert.equal(isLongRun(0), false);
  assert.equal(isLongRun(14 * 3600 + 20 * 60), true);
});

test('a stored timer that is malformed is no timer', () => {
  assert.deepEqual(parseTimer('{"taskId":"a","startedAt":12}'), { taskId: 'a', startedAt: 12 });
  for (const bad of [null, '', 'x', '{}', '[]', 'null', '{"taskId":"","startedAt":1}', '{"taskId":"a"}', '{"taskId":"a","startedAt":"1"}', '{"taskId":3,"startedAt":1}']) {
    assert.equal(parseTimer(bad), null, String(bad));
  }
});

test('startup prune: a timer for a missing, deleted or completed task is dropped', () => {
  const t = { taskId: 'a', startedAt: 1 };
  assert.deepEqual(pruneTimer(t, { completed: false }), t);
  assert.equal(pruneTimer(t, undefined), null);
  assert.equal(pruneTimer(t, { completed: true }), null);
  assert.equal(pruneTimer(t, { completed: false, deletedAt: '2026-10-07T00:00:00Z' }), null);
  assert.equal(pruneTimer(null, { completed: false }), null);
});

// ---- the rules, with a fake clock, store and tasks ----
function harness(tasks: TimerTask[] = [{ id: 'a', completed: false }, { id: 'b', completed: false }]) {
  const h = {
    clock: 1_000_000,
    stored: null as string | null,
    tasks: new Map(tasks.map((t) => [t.id, { ...t }])),
    changes: [] as Array<string | null>,
    writes: 0,
  };
  const timer = createTimerController({
    now: () => h.clock,
    readTimer: async () => h.stored,
    writeTimer: async (v) => {
      h.stored = v;
    },
    readTask: async (id) => h.tasks.get(id),
    writeActual: async (id, s) => {
      h.writes += 1;
      h.tasks.get(id)!.actualSeconds = s;
    },
    onChange: (t) => h.changes.push(t ? t.taskId : null),
  });
  return { h, timer };
}

test('start, stop: the elapsed seconds are added to Actual', async () => {
  const { h, timer } = harness();
  assert.deepEqual(await timer.start('a'), { kind: 'started' });
  h.clock += 90 * SEC;
  assert.deepEqual(await timer.stop('a'), { kind: 'stopped', seconds: 90 });
  assert.equal(h.tasks.get('a')!.actualSeconds, 90);
  assert.equal(h.stored, null);
});

test('stop twice accumulates; a second stop with no timer does nothing', async () => {
  const { h, timer } = harness();
  await timer.start('a');
  h.clock += 60 * SEC;
  await timer.stop('a');
  await timer.start('a');
  h.clock += 30 * SEC;
  await timer.stop('a');
  assert.equal(h.tasks.get('a')!.actualSeconds, 90);
  assert.deepEqual(await timer.stop('a'), { kind: 'none' });
  assert.equal(h.tasks.get('a')!.actualSeconds, 90);
});

test('only one timer runs: starting another stops the first and saves its time', async () => {
  const { h, timer } = harness();
  await timer.start('a');
  h.clock += 120 * SEC;
  assert.deepEqual(await timer.start('b'), { kind: 'started' });
  assert.equal(h.tasks.get('a')!.actualSeconds, 120);
  assert.deepEqual(JSON.parse(h.stored!), { taskId: 'b', startedAt: h.clock });
  h.clock += 10 * SEC;
  assert.deepEqual(await timer.stop('a'), { kind: 'none' }, 'a is no longer running');
  assert.deepEqual(await timer.stop('b'), { kind: 'stopped', seconds: 10 });
  assert.equal(h.tasks.get('a')!.actualSeconds, 120);
  assert.equal(h.tasks.get('b')!.actualSeconds, 10);
});

test('starting the task that is already running changes nothing', async () => {
  const { h, timer } = harness();
  await timer.start('a');
  const stored = h.stored;
  h.clock += 5 * SEC;
  assert.deepEqual(await timer.start('a'), { kind: 'started' });
  assert.equal(h.stored, stored);
});

test('the clock going backwards while running adds nothing, never negative', async () => {
  const { h, timer } = harness();
  h.tasks.get('a')!.actualSeconds = 100;
  await timer.start('a');
  h.clock -= 3 * HOUR;
  assert.deepEqual(await timer.stop('a'), { kind: 'stopped', seconds: 0 });
  assert.equal(h.tasks.get('a')!.actualSeconds, 100);
  assert.equal(h.stored, null);
});

test('two quick presses run one after another', async () => {
  const { h, timer } = harness();
  const results = await Promise.all([timer.start('a'), timer.start('b'), timer.start('a')]);
  assert.deepEqual(results.map((r) => r.kind), ['started', 'started', 'started']);
  assert.equal(JSON.parse(h.stored!).taskId, 'a');
});

test('a completed, deleted or missing task cannot be started', async () => {
  const { h, timer } = harness([
    { id: 'done', completed: true },
    { id: 'gone', completed: false, deletedAt: '2026-10-07T00:00:00Z' },
  ]);
  assert.deepEqual(await timer.start('done'), { kind: 'refused' });
  assert.deepEqual(await timer.start('gone'), { kind: 'refused' });
  assert.deepEqual(await timer.start('nope'), { kind: 'refused' });
  assert.equal(h.stored, null);
});

test('completing stops the timer and hands back the time to add', async () => {
  const { h, timer } = harness();
  await timer.start('a');
  h.clock += 600 * SEC;
  assert.equal(await timer.settleOnComplete('a'), 600);
  assert.equal(h.stored, null);
  assert.equal(await timer.settleOnComplete('a'), 0, 'nothing running now');
  await timer.start('a');
  h.clock += 5 * SEC;
  assert.equal(await timer.settleOnComplete('b'), 0, 'another task completing leaves a running');
  assert.equal(JSON.parse(h.stored!).taskId, 'a');
});

test('completing a task whose timer ran over 12 hours drops that time', async () => {
  const { h, timer } = harness();
  await timer.start('a');
  h.clock += 13 * HOUR;
  assert.equal(await timer.settleOnComplete('a'), 0);
  assert.equal(h.stored, null);
  assert.equal(h.tasks.get('a')!.actualSeconds, undefined);
});

// ---- forgotten timers ----
test('stopping after more than 12 hours does not add the time: it asks', async () => {
  const { h, timer } = harness();
  h.tasks.get('a')!.actualSeconds = 100;
  await timer.start('a');
  h.clock += 14 * HOUR + 20 * 60 * SEC;
  assert.deepEqual(await timer.stop('a'), { kind: 'confirm', taskId: 'a', seconds: 14 * 3600 + 1200 });
  assert.equal(h.tasks.get('a')!.actualSeconds, 100, 'nothing added yet');
  assert.equal(JSON.parse(h.stored!).taskId, 'a', 'still running until answered');
});

test('exactly 12 hours is added without asking', async () => {
  const { h, timer } = harness();
  await timer.start('a');
  h.clock += 12 * HOUR;
  assert.deepEqual(await timer.stop('a'), { kind: 'stopped', seconds: 43200 });
  assert.equal(h.tasks.get('a')!.actualSeconds, 43200);
});

test('answering a forgotten timer: Add keeps the run, a typed time replaces it, zero adds nothing', async () => {
  for (const [typed, expected] of [[14 * 3600 + 1200, 14 * 3600 + 1200], [5400, 5400], [0, undefined]] as const) {
    const { h, timer } = harness();
    await timer.start('a');
    h.clock += 14 * HOUR;
    assert.equal((await timer.stop('a')).kind, 'confirm');
    assert.equal(await timer.resolveLong('a', typed), true);
    assert.equal(h.tasks.get('a')!.actualSeconds, expected);
    assert.equal(h.stored, null);
  }
  const { timer } = harness();
  assert.equal(await timer.resolveLong('a', 60), false, 'no timer, no effect');
});

test('starting another task while one ran over 12 hours asks first and starts nothing', async () => {
  const { h, timer } = harness();
  await timer.start('a');
  h.clock += 20 * HOUR;
  assert.deepEqual(await timer.start('b'), { kind: 'confirm', taskId: 'a', seconds: 20 * 3600 });
  assert.equal(JSON.parse(h.stored!).taskId, 'a');
  assert.equal(h.tasks.get('a')!.actualSeconds, undefined);
  await timer.resolveLong('a', 3600);
  assert.equal(h.tasks.get('a')!.actualSeconds, 3600);
  assert.deepEqual(await timer.start('b'), { kind: 'started' });
});

// ---- deleted, merged, startup ----
test('deleting, tombstoning or merging a task stops its timer with no time added', async () => {
  const { h, timer } = harness();
  await timer.start('a');
  h.clock += 300 * SEC;
  assert.equal(await timer.discard('b'), false, 'another task');
  assert.equal(JSON.parse(h.stored!).taskId, 'a');
  assert.equal(await timer.discard('a'), true);
  assert.equal(h.stored, null);
  assert.equal(h.tasks.get('a')!.actualSeconds, undefined);
  assert.equal(h.writes, 0);
  assert.equal(await timer.discard('a'), false);
});

test('startup keeps a timer for a live task, so it survives closing the app', async () => {
  const { h, timer } = harness();
  h.stored = JSON.stringify({ taskId: 'a', startedAt: h.clock - 5 * 60 * SEC });
  assert.deepEqual(await timer.init(), { taskId: 'a', startedAt: h.clock - 300_000 });
  assert.notEqual(h.stored, null);
  h.clock += 60 * SEC;
  assert.deepEqual(await timer.stop('a'), { kind: 'stopped', seconds: 360 });
});

test('startup drops a stored timer whose task is gone, deleted, completed, or malformed', async () => {
  const cases: Array<[string, TimerTask[]]> = [
    [JSON.stringify({ taskId: 'x', startedAt: 1 }), [{ id: 'a', completed: false }]],
    [JSON.stringify({ taskId: 'a', startedAt: 1 }), [{ id: 'a', completed: true }]],
    [JSON.stringify({ taskId: 'a', startedAt: 1 }), [{ id: 'a', completed: false, deletedAt: '2026-10-07T00:00:00Z' }]],
    ['not json', [{ id: 'a', completed: false }]],
  ];
  for (const [stored, tasks] of cases) {
    const { h, timer } = harness(tasks);
    h.stored = stored;
    assert.equal(await timer.init(), null);
    assert.equal(h.stored, null);
    assert.equal(h.writes, 0, 'no time added');
  }
});

// ---- repeating tasks ----
test('the next occurrence copies the estimate but starts with Actual cleared', () => {
  const task: Task = {
    id: 'r1',
    title: 'Stretch',
    completed: true,
    createdAt: '2026-10-01T08:00:00.000Z',
    updatedAt: '2026-10-01T08:00:00.000Z',
    dueDate: '2026-10-07',
    durationMinutes: 45,
    actualSeconds: 3000,
    recurrence: 'daily',
  };
  const next = buildNextOccurrence(task, '2026-10-07', '2026-10-07T09:00:00.000Z');
  assert.ok(next);
  assert.equal(next.durationMinutes, 45);
  assert.equal(next.actualSeconds, undefined);
  assert.equal('actualSeconds' in next, false);
});
