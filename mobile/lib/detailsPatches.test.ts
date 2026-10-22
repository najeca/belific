// Run with `npm test` from mobile/. The phone's task details (PLAN_phone P6): every edit names only
// its own fields, so a task edited on the phone keeps cutsBelow, reminders, extraTimes, timesDone,
// subtasks, list, emoji and the timer; and the sync still sends those columns when the server has them.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPatch,
  datePatch,
  durationPatch,
  emojiPatch,
  labelPatch,
  listPatch,
  notesPatch,
  priorityPatch,
  timePatch,
  titlePatch,
} from './detailsPatches.ts';
import { assignMissingColors } from './labelColors.ts';
import { taskToRemote } from './syncCore.ts';
import type { Project, Task } from './types.ts';

const full: Task = {
  id: 't1',
  title: 'Boot camp',
  completed: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  dueDate: '2026-10-22',
  startTime: '09:30',
  durationMinutes: 60,
  extraTimes: ['14:00'],
  timesDone: ['09:30'],
  cutsBelow: true,
  reminders: [0, 10],
  reminderMinutes: 0,
  subtasks: [{ id: 's1', title: 'Bring water', done: true }],
  listKey: 'L1',
  emoji: '🏃',
  projectKey: 'work',
  actualMinutes: 25,
  timerStartedAt: '2026-10-22T09:00:00.000Z',
  recurrence: 'daily',
  notes: 'Gate B',
};
const KEPT = ['cutsBelow', 'reminders', 'reminderMinutes', 'subtasks', 'actualMinutes', 'timerStartedAt', 'recurrence'] as const;

test('every phone edit keeps the fields it does not name (Part B and C included)', () => {
  const patches: Array<[string, Partial<Task>]> = [
    ['title', titlePatch(full, ' Boot  camp 2 ')!],
    ['emoji', emojiPatch(full, '🚴')!],
    ['priority', priorityPatch(true)],
    ['date', datePatch('2026-10-23')],
    ['duration', durationPatch(45)],
    ['label', labelPatch(undefined)],
    ['list', listPatch('L2')],
    ['notes', notesPatch(full, 'Gate C')!],
  ];
  for (const [name, patch] of patches) {
    const after = applyPatch(full, patch);
    for (const k of KEPT) assert.deepEqual(after[k], full[k], `${name} keeps ${k}`);
    assert.deepEqual(after.extraTimes, full.extraTimes, `${name} keeps extraTimes`);
    assert.deepEqual(after.timesDone, full.timesDone, `${name} keeps timesDone`);
    if (name !== 'list') assert.equal(after.listKey, 'L1', `${name} keeps the list`);
    if (name !== 'emoji') assert.equal(after.emoji, '🏃', `${name} keeps the emoji`);
  }
  assert.equal(titlePatch(full, ' Boot  camp 2 ')!.title, 'Boot camp 2');
  assert.equal(titlePatch(full, 'Boot camp'), null, 'no change, no write');
  assert.equal(notesPatch(full, 'Gate B'), null);
});

test('clearing the date also clears the time (as patchTask does); the other times stay for a new date', () => {
  const after = applyPatch(full, datePatch(undefined));
  assert.equal(after.startTime, undefined);
  assert.deepEqual(after.cutsBelow, true);
});

test('changing the first time of a task with several times keeps them coherent; an overlap is refused', () => {
  const moved = timePatch(full, '10:00');
  assert.ok('fields' in moved);
  if ('fields' in moved) {
    const after = applyPatch(full, moved.fields);
    assert.equal(after.startTime, '10:00');
    assert.deepEqual(after.extraTimes, ['14:00']);
    assert.equal(after.cutsBelow, true);
  }
  const clash = timePatch(full, '13:30');
  assert.ok('note' in clash, 'an hour long task at 13:30 overlaps 14:00');
  const single = timePatch({ ...full, extraTimes: undefined, timesDone: undefined }, '11:00');
  assert.deepEqual(single, { fields: { startTime: '11:00' } });
  const cleared = timePatch(full, undefined);
  assert.ok('fields' in cleared && cleared.fields.startTime === '14:00', 'clearing the first time promotes the next one');
});

test('the sync sends every kept field when the server has the columns (probes partB and partC)', () => {
  const caps = { serverUpdatedAt: true, taskPipeline: true, taskExtras: true, planner: true, partB: true, partC: true };
  const remote = taskToRemote(applyPatch(full, titlePatch(full, 'Renamed')!), caps);
  assert.equal(remote.cuts_below, true);
  assert.deepEqual(remote.reminders, [0, 10]);
  assert.deepEqual(remote.extra_times, ['14:00']);
  assert.deepEqual(remote.times_done, ['09:30']);
  assert.equal(remote.list_key, 'L1');
  const old = taskToRemote(full, { serverUpdatedAt: true, taskPipeline: true, taskExtras: true, planner: true });
  assert.ok(!('cuts_below' in old) && !('extra_times' in old), 'never sent to a server without the columns');
});

test('a label colour fill is idempotent: a second read changes nothing (labels.ts on the phone)', () => {
  const labels: Project[] = [
    { key: 'a', name: 'A', createdAt: 'x', updatedAt: 'x' },
    { key: 'b', name: 'B', createdAt: 'x', updatedAt: 'x', colorKey: 'sage' },
    { key: 'c', name: 'C', createdAt: 'x', updatedAt: 'x' },
  ];
  const once = assignMissingColors(labels);
  assert.equal(once.changed, true);
  assert.ok(once.projects.every((p) => p.colorKey));
  const twice = assignMissingColors(once.projects);
  assert.equal(twice.changed, false);
  assert.deepEqual(twice.projects, once.projects);
});
