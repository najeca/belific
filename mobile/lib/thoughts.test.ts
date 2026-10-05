// Run with `npm test` from mobile/ (explicit .ts imports are required by Node).
import test from 'node:test';
import assert from 'node:assert/strict';
import { dumpItemToTask, newThought, rowId, rowTitle, splitThoughts } from './thoughts.ts';
import { buildColumnDays, bucketTasks, parseDateKey } from './kanban.ts';
import type { BrainDumpItem, Task } from './types.ts';

const TODAY = '2026-10-05';

function task(id: string, extra: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    completed: false,
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-01T09:00:00.000Z',
    ...extra,
  };
}

function dump(id: string, extra: Partial<BrainDumpItem> = {}): BrainDumpItem {
  return {
    id,
    title: `Thought ${id}`,
    notes: '',
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-01T09:00:00.000Z',
    ...extra,
  };
}

test('the list is incomplete tasks with no Day; tasks with a Day are not on it', () => {
  const { rows } = splitThoughts(
    [task('a'), task('b', { dueDate: '2026-10-07' }), task('c', { dueDate: '2026-09-01' }), task('d')],
    [],
    TODAY,
  );
  assert.deepEqual(rows.map(rowId).sort(), ['a', 'd']);
});

test('clearing the Day brings a task back; setting a Day takes it off', () => {
  const onBoard = task('a', { dueDate: '2026-10-07' });
  assert.equal(splitThoughts([onBoard], [], TODAY).rows.length, 0);
  const cleared: Task = { ...onBoard, dueDate: undefined, startTime: undefined };
  assert.deepEqual(splitThoughts([cleared], [], TODAY).rows.map(rowId), ['a']);
  assert.equal(splitThoughts([{ ...cleared, dueDate: '2026-11-01' }], [], TODAY).rows.length, 0);
});

test('a malformed Day counts as no Day', () => {
  const { rows } = splitThoughts([task('a', { dueDate: 'next week' }), task('b', { dueDate: '2026-02-30' })], [], TODAY);
  assert.deepEqual(rows.map(rowId).sort(), ['a', 'b']);
});

test('completed tasks are hidden from the main list', () => {
  const { rows } = splitThoughts(
    [task('a'), task('b', { completed: true, completedAt: '2026-10-05T08:00:00.000Z' })],
    [],
    TODAY,
  );
  assert.deepEqual(rows.map(rowId), ['a']);
});

test('tombstoned tasks and dump items are never shown', () => {
  const { rows, doneToday } = splitThoughts(
    [task('a', { deletedAt: '2026-10-02T00:00:00.000Z' }), task('b', { completed: true, completedAt: '2026-10-05T08:00:00.000Z', deletedAt: '2026-10-05T09:00:00.000Z' })],
    [dump('d1', { deletedAt: '2026-10-02T00:00:00.000Z' })],
    TODAY,
  );
  assert.equal(rows.length, 0);
  assert.equal(doneToday.length, 0);
});

test('legacy dump items are listed like tasks, mixed newest first', () => {
  const { rows } = splitThoughts(
    [task('t1', { createdAt: '2026-10-03T09:00:00.000Z' }), task('t2', { createdAt: '2026-10-01T09:00:00.000Z' })],
    [dump('d1', { createdAt: '2026-10-04T09:00:00.000Z' }), dump('d2', { createdAt: '2026-10-02T09:00:00.000Z' })],
    TODAY,
  );
  assert.deepEqual(rows.map(rowId), ['d1', 't1', 'd2', 't2']);
  assert.deepEqual(rows.map((r) => r.kind), ['dump', 'task', 'dump', 'task']);
  assert.equal(rowTitle(rows[0]), 'Thought d1');
  assert.equal(rowTitle(rows[1]), 'Task t1');
});

test('a recurring Day-less task stays on the list', () => {
  const { rows } = splitThoughts([task('a', { recurrence: 'weekly' })], [], TODAY);
  assert.deepEqual(rows.map(rowId), ['a']);
});

test('Done today: Day-less tasks completed today, most recent first', () => {
  const { rows, doneToday } = splitThoughts(
    [
      task('a', { completed: true, completedAt: '2026-10-05T08:00:00.000Z' }),
      task('b', { completed: true, completedAt: '2026-10-05T10:00:00.000Z' }),
      task('c', { completed: true, completedAt: '2026-10-04T10:00:00.000Z' }), // yesterday
      task('d', { completed: true, completedAt: '2026-10-05T09:00:00.000Z', dueDate: '2026-10-05' }), // has a Day: on the board
      task('e', { completed: true }), // no completion time
    ],
    [],
    TODAY,
  );
  assert.equal(rows.length, 0);
  assert.deepEqual(doneToday.map((t) => t.id), ['b', 'a']);
});

test('Done today uses the local day, in several time zones', () => {
  const previous = process.env.TZ;
  try {
    const t = task('a', { completed: true, completedAt: '2026-10-05T23:30:00.000Z' });
    process.env.TZ = 'Pacific/Auckland'; // UTC+13 in October: already the 6th
    assert.equal(splitThoughts([t], [], '2026-10-06').doneToday.length, 1);
    assert.equal(splitThoughts([t], [], '2026-10-05').doneToday.length, 0);
    const u = task('b', { completed: true, completedAt: '2026-10-06T02:00:00.000Z' });
    process.env.TZ = 'America/New_York'; // UTC-4: still the 5th
    assert.equal(splitThoughts([u], [], '2026-10-05').doneToday.length, 1);
    assert.equal(splitThoughts([u], [], '2026-10-06').doneToday.length, 0);
    process.env.TZ = 'Europe/London';
    const w = task('c', { completed: true, completedAt: '2026-10-25T00:30:00.000Z' }); // day clocks go back
    assert.equal(splitThoughts([w], [], '2026-10-25').doneToday.length, 1);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('un-ticking a Done today task (completed false) puts it back on the list', () => {
  const done = task('a', { completed: true, completedAt: '2026-10-05T08:00:00.000Z' });
  assert.equal(splitThoughts([done], [], TODAY).rows.length, 0);
  const undone: Task = { ...done, completed: false, completedAt: undefined };
  const lists = splitThoughts([undone], [], TODAY);
  assert.deepEqual(lists.rows.map(rowId), ['a']);
  assert.equal(lists.doneToday.length, 0);
});

test('newThought: a title-only Task marked origin dump; blank input makes nothing', () => {
  const t = newThought('id1', '  Call the dentist  ', '2026-10-05T09:00:00.000Z')!;
  assert.equal(t.title, 'Call the dentist');
  assert.equal(t.completed, false);
  assert.equal(t.origin, 'dump');
  assert.equal(t.dueDate, undefined);
  assert.equal(t.durationMinutes, undefined);
  assert.equal(t.createdAt, '2026-10-05T09:00:00.000Z');
  assert.equal(newThought('id2', '   ', 'x'), null);
  assert.equal(newThought('id3', '', 'x'), null);
  // and it lands on the list straight away
  assert.deepEqual(splitThoughts([t], [], TODAY).rows.map(rowId), ['id1']);
});

test('dumpItemToTask keeps the title, notes and creation time (nothing is lost)', () => {
  const item = dump('d1', { title: 'Plan the trip', notes: 'flights, hotel', createdAt: '2026-09-20T08:00:00.000Z' });
  const t = dumpItemToTask(item, 'new-id', '2026-10-05T09:00:00.000Z');
  assert.equal(t.id, 'new-id');
  assert.equal(t.title, 'Plan the trip');
  assert.equal(t.notes, 'flights, hotel');
  assert.equal(t.createdAt, '2026-09-20T08:00:00.000Z');
  assert.equal(t.updatedAt, '2026-10-05T09:00:00.000Z');
  assert.equal(t.origin, 'dump');
  assert.equal(t.completed, false);
  assert.equal(t.dueDate, undefined);
  assert.equal(dumpItemToTask(dump('d2', { notes: '   ' }), 'x', 'y').notes, undefined);
});

test('after conversion the item is gone and the task is on the list in the same place', () => {
  const item = dump('d1', { createdAt: '2026-10-02T09:00:00.000Z' });
  const other = task('t1', { createdAt: '2026-10-03T09:00:00.000Z' });
  const before = splitThoughts([other], [item], TODAY).rows.map(rowId);
  assert.deepEqual(before, ['t1', 'd1']);
  const converted = dumpItemToTask(item, 'c1', '2026-10-05T09:00:00.000Z');
  const after = splitThoughts([other, converted], [], TODAY).rows.map(rowId);
  assert.deepEqual(after, ['t1', 'c1']); // same position, no duplicate
});

test('the week board has no Unscheduled column: Day-less tasks are not on it', () => {
  const days = buildColumnDays(parseDateKey(TODAY), 7);
  const cols = bucketTasks([task('a'), task('b', { dueDate: '2026-10-06' })], days, TODAY);
  assert.equal('unscheduled' in cols, false);
  assert.deepEqual(cols.days['2026-10-06'].map((i) => i.task.id), ['b']);
  assert.equal(Object.values(cols.days).flat().length, 1);
});
