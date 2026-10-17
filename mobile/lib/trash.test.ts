// Run with `npm test` from mobile/. The Trash and Restore (build plan phase 6).
import test from 'node:test';
import assert from 'node:assert/strict';
import { MERGED_NOTE, agoText, isDeleteEvent, isMergedInto, planRestore, restoredIdCandidates, trashEntries } from './trash.ts';
import { deleteSeriesRows, planSkip } from './series.ts';
import type { Task } from './types.ts';

const NOW_ISO = '2026-10-16T12:00:00.000Z';
const NOW = Date.parse(NOW_ISO);
const DAY = 86400000;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();
const T = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, completed: false, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', ...extra });
// What deleteTask writes.
const deleted = (t: Task, at: string): Task => ({ ...t, deletedAt: at, updatedAt: at });

test('a plain deleted task is an entry for 30 days, then it is not', () => {
  const tasks = [deleted(T('a', { title: 'Alpha' }), ago(2)), deleted(T('b'), ago(29.5)), deleted(T('c'), ago(31)), T('live')];
  const entries = trashEntries(tasks, NOW);
  assert.deepEqual(entries.map((e) => e.row.id), ['a', 'b']);
  assert.ok(entries.every((e) => e.kind === 'task' && e.restorable && e.count === 1));
  assert.equal(agoText(ago(0.2), NOW), 'Deleted today');
  assert.equal(agoText(ago(1.5), NOW), 'Deleted yesterday');
  assert.equal(agoText(ago(5), NOW), 'Deleted 5 days ago');
});

test('a skipped day is not in the Trash (it keeps its repeat rule); nor is a series ended after a skip', () => {
  const rows = [T('s', { dueDate: '2026-10-01', recurrence: 'daily' }), T('s:2026-10-15', { dueDate: '2026-10-15', recurrence: 'daily' })];
  const skip = planSkip(rows, '2026-10-15', ago(1))!;
  assert.equal(isDeleteEvent(skip.tombstone), false);
  assert.deepEqual(trashEntries([rows[0], skip.tombstone], NOW), []);
  // the series is ended later: the rule is cleared and updatedAt moves, deletedAt stays
  const ended = { ...skip.tombstone, recurrence: undefined, updatedAt: ago(0.1) };
  assert.equal(isDeleteEvent(ended), false);
  assert.deepEqual(trashEntries([ended], NOW), []);
});

test('a deleted repeating task is ONE entry, restored from its latest row', () => {
  const rows = [
    T('s', { title: 'Walk', dueDate: '2026-10-01', recurrence: 'daily', emoji: 'E', durationMinutes: 20 }),
    T('s:2026-10-15', { title: 'Walk', dueDate: '2026-10-15', recurrence: 'daily' }),
    T('s:2026-10-16', { title: 'Walk', dueDate: '2026-10-16', recurrence: 'daily' }),
    { ...T('s:2026-10-10', { title: 'Walk', dueDate: '2026-10-10', completed: true, recurrence: 'daily' }) },
  ];
  const after = [...deleteSeriesRows(rows, ago(3)), ...rows.filter((r) => r.completed)].map((r, i, all) => all[i]);
  const entries = trashEntries(after, NOW);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].kind, 'series');
  assert.equal(entries[0].count, 3);
  assert.equal(entries[0].row.id, 's:2026-10-16', 'the latest day');
  assert.match(entries[0].note ?? '', /set Repeat again/);
  assert.equal(entries[0].restorable, true);
  // the completed history row stays as history and is not an entry
  assert.ok(!entries.some((e) => e.row.id === 's:2026-10-10'));
});

test('merged into another task (before 2.26.0): told apart by its effect, shown with a note and NO Restore', () => {
  // The drop that merged a task into another as a subtask was removed in 2.26.0;
  // tombstones it wrote before then are still in people's data. This is the
  // shape it wrote: the host gained the subtask, the dragged task was tombstoned.
  const host = T('host', { title: 'Plan trip', subtasks: [], updatedAt: ago(10) });
  const dragged = T('drag', { title: 'Book flights', projectKey: 'w' });
  const plan = {
    host: { ...host, subtasks: [{ id: 'sub1', title: 'Book flights', done: false }], updatedAt: ago(1) },
    tombstoned: { ...dragged, deletedAt: ago(1), updatedAt: ago(1) },
  };
  const tasks = [plan.host, plan.tombstoned];
  assert.equal(isDeleteEvent(plan.tombstoned), true, 'a merge writes the same shape as a delete');
  assert.equal(isMergedInto(plan.tombstoned, tasks), true);
  const [entry] = trashEntries(tasks, NOW);
  assert.equal(entry.kind, 'merged');
  assert.equal(entry.restorable, false);
  assert.equal(entry.note, MERGED_NOTE);
  // the host edited later still shows the merge
  assert.equal(trashEntries([{ ...plan.host, updatedAt: ago(0.5) }, plan.tombstoned], NOW)[0].kind, 'merged');
  // a task deleted on its own is a plain entry, even if another task has a subtask of that title from BEFORE
  const older = T('other', { subtasks: [{ id: 's', title: 'Book flights', done: false }], updatedAt: ago(20) });
  const plain = deleted(T('x', { title: 'Book flights' }), ago(1));
  assert.equal(trashEntries([older, plain], NOW)[0].kind, 'task');
  assert.equal(trashEntries([older, plain], NOW)[0].restorable, true);
});

test('restore: a NEW task with the same fields and a new id; the old tombstone stays, touched', () => {
  const original = T('a', {
    title: 'Write report',
    notes: 'section 2',
    priority: 'high',
    projectKey: 'w',
    listKey: 'l1',
    emoji: 'E',
    dueDate: '2026-10-20',
    startTime: '09:00',
    durationMinutes: 90,
    actualMinutes: 75,
    reminderMinutes: 10,
    subtasks: [{ id: 's1', title: 'Outline', done: true }],
    completed: true,
    completedAt: ago(5),
    timerStartedAt: ago(0.1),
    origin: 'dump',
  });
  const tombstone = deleted(original, ago(1));
  const labels = [{ key: 'w' }];
  const lists = [{ key: 'l1' }];
  const plan = planRestore(tombstone, [tombstone], labels, lists, NOW_ISO)!;
  assert.equal(plan.restoredId, 'restored_a');
  const c = plan.create!;
  assert.equal(c.id, 'restored_a');
  assert.notEqual(c.id, tombstone.id);
  for (const k of ['title', 'notes', 'priority', 'projectKey', 'listKey', 'emoji', 'dueDate', 'startTime', 'durationMinutes', 'actualMinutes', 'reminderMinutes', 'subtasks', 'completed', 'completedAt', 'createdAt', 'origin'] as const) {
    assert.deepEqual(c[k], original[k], k);
  }
  assert.equal('deletedAt' in c, false);
  assert.equal('timerStartedAt' in c, false, 'a deleted running timer does not resume');
  assert.equal(c.updatedAt, NOW_ISO);
  // the tombstone stays a tombstone, touched so it is no longer a delete event
  assert.equal(plan.touch.id, 'a');
  assert.equal(plan.touch.deletedAt, tombstone.deletedAt);
  assert.notEqual(plan.touch.updatedAt, plan.touch.deletedAt);
  assert.equal(isDeleteEvent(plan.touch), false);
  assert.deepEqual(trashEntries([plan.touch, c], NOW), [], 'it leaves the Trash');
});

test('restore drops a list or label that no longer exists, and never carries a repeat rule', () => {
  const tombstone = deleted(T('a', { projectKey: 'gone', listKey: 'gone2' }), ago(1));
  const plan = planRestore(tombstone, [tombstone], [{ key: 'gone', deletedAt: 'x' }], [], NOW_ISO)!;
  assert.equal('projectKey' in plan.create!, false);
  assert.equal('listKey' in plan.create!, false);
  // a row that somehow still has rule fields is not a delete event at all
  assert.equal(planRestore({ ...tombstone, recurrence: 'daily' }, [{ ...tombstone, recurrence: 'daily' }], [], [], NOW_ISO), null);
});

test('restore of a series brings back one plain task from the latest row', () => {
  const rows = deleteSeriesRows(
    [T('s', { title: 'Walk', dueDate: '2026-10-01', recurrence: 'weekly', recurrenceDays: ['Mon'] }), T('s:2026-10-12', { title: 'Walk', dueDate: '2026-10-12', recurrence: 'weekly', recurrenceDays: ['Mon'] })],
    ago(2),
  );
  const [entry] = trashEntries(rows, NOW);
  const plan = planRestore(entry.row, rows, [], [], NOW_ISO)!;
  assert.equal(plan.restoredId, 'restored_s_2026-10-12', 'a colon becomes an underscore so the copy never joins a series group');
  assert.equal(plan.create!.recurrence, undefined);
  assert.equal(plan.create!.dueDate, '2026-10-12');
});

test('restore twice: the second finds the first and creates nothing; a copy deleted again gets the next id', () => {
  const tombstone = deleted(T('a'), ago(1));
  const first = planRestore(tombstone, [tombstone], [], [], NOW_ISO)!;
  // the copy exists live; the original is still a delete event on a device that has not synced the touch
  const second = planRestore(tombstone, [tombstone, first.create!], [], [], NOW_ISO)!;
  assert.equal(second.create, null);
  assert.equal(second.restoredId, 'restored_a');
  // restored, then the copy deleted, then the original (somehow) restored again
  const copyGone = deleted(first.create!, ago(0.5));
  const third = planRestore(tombstone, [tombstone, copyGone], [], [], NOW_ISO)!;
  assert.equal(third.restoredId, 'restored2_a');
  assert.deepEqual(restoredIdCandidates('x:1').slice(0, 2), ['restored_x_1', 'restored2_x_1']);
  // nothing to restore when the row is gone or already touched
  assert.equal(planRestore(first.touch, [first.touch], [], [], NOW_ISO), null);
  assert.equal(planRestore(tombstone, [], [], [], NOW_ISO), null);
});

test('the input rows are never changed', () => {
  const tombstone = deleted(T('a', { subtasks: [{ id: 's', title: 'x', done: false }] }), ago(1));
  const before = JSON.stringify(tombstone);
  planRestore(tombstone, [tombstone], [], [], NOW_ISO);
  assert.equal(JSON.stringify(tombstone), before);
});
