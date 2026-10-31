import test from 'node:test';
import assert from 'node:assert/strict';
import { missedItems, missedOneOffs, ownDayCompletedAt } from './missed.ts';
import type { Task } from './types.ts';

const TODAY = '2026-10-18';
const T = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, completed: false, createdAt: 't', updatedAt: 'u', ...extra });

test('a one off task before today, not done, not deleted, is missed; today, done, deleted and undated are not', () => {
  const rows = [
    T('old', { dueDate: '2026-10-15' }),
    T('today', { dueDate: TODAY }),
    T('done', { dueDate: '2026-10-15', completed: true }),
    T('gone', { dueDate: '2026-10-15', deletedAt: 'x' }),
    T('nodate'),
    T('bad', { dueDate: 'soon' }),
  ];
  assert.deepEqual(missedOneOffs(rows, TODAY).map((t) => t.id), ['old']);
});

test('Must do first, then the oldest day, then the title', () => {
  const rows = [T('b', { dueDate: '2026-10-16' }), T('a', { dueDate: '2026-10-16' }), T('z', { dueDate: '2026-10-10' }), T('m', { dueDate: '2026-10-17', priority: 'high' })];
  assert.deepEqual(missedItems(rows, TODAY).map((m) => m.task.id), ['m', 'z', 'a', 'b']);
});

// 3.25.0 (changed on purpose; the 2.27.0 tests listed the past days of repeating tasks): they are never listed.
test('3.25.0: the past days of a repeating task are never listed, stored open ones and never stored ones alike', () => {
  const rows = [
    T('gym', { dueDate: '2026-10-12', recurrence: 'daily' }), // stored, open, 6 days ago
    T('gym:2026-10-14', { dueDate: '2026-10-14', recurrence: 'daily', completed: true }),
    T('gym:2026-10-15', { dueDate: '2026-10-15', recurrence: 'daily', deletedAt: 'x' }), // skipped
    T('w', { dueDate: '2026-10-12', recurrence: 'weekly', recurrenceDays: ['Mon', 'Thu'] }),
    T('old', { dueDate: '2026-10-15' }),
  ];
  assert.deepEqual(missedItems(rows, TODAY).map((m) => m.task.id), ['old']);
  assert.ok(missedItems(rows, TODAY).every((m) => m.kind === 'task'));
  assert.equal(missedOneOffs(rows, TODAY).length, 1);
});

test("3.25.0: nothing is written for a repeating task's past days (the rows are returned untouched)", () => {
  const rows = [T('gym', { dueDate: '2026-10-01', recurrence: 'daily' })];
  const before = JSON.stringify(rows);
  assert.deepEqual(missedItems(rows, TODAY), []);
  assert.equal(JSON.stringify(rows), before);
});

test("3.25.0: Done and Skip all record the completion on the task's own day (local noon), so it never counts as done today", () => {
  const at = ownDayCompletedAt('2026-10-15');
  const d = new Date(at);
  assert.equal(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, '2026-10-15');
  assert.equal(d.getHours(), 12);
  // a day near a clock change still lands on its own date
  for (const day of ['2026-03-29', '2026-10-25', '2026-01-01', '2026-12-31']) {
    const x = new Date(ownDayCompletedAt(day));
    assert.equal(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`, day);
  }
});

test('listing never changes the rows', () => {
  const rows = [T('old', { dueDate: '2026-10-15' }), T('gym', { dueDate: '2026-10-12', recurrence: 'daily' })];
  const before = JSON.stringify(rows);
  missedItems(rows, TODAY);
  assert.equal(JSON.stringify(rows), before);
});
