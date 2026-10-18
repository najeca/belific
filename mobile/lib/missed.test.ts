import test from 'node:test';
import assert from 'node:assert/strict';
import { doTodayCopy, missedItems, missedOneOffs } from './missed.ts';
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

test('a daily series: the stored open past day and the never stored days of the last 7 are missed; done and skipped days are not', () => {
  const rows = [
    T('gym', { dueDate: '2026-10-12', recurrence: 'daily' }), // stored, open, 6 days ago
    T('gym:2026-10-14', { dueDate: '2026-10-14', recurrence: 'daily', completed: true }),
    T('gym:2026-10-15', { dueDate: '2026-10-15', recurrence: 'daily', deletedAt: 'x' }), // skipped
  ];
  const occ = missedItems(rows, TODAY).filter((m) => m.kind === 'occurrence');
  assert.deepEqual(
    occ.map((m) => [m.day, m.stored]),
    [
      ['2026-10-12', true],
      ['2026-10-13', false],
      ['2026-10-16', false],
      ['2026-10-17', false],
    ],
  );
  // Today is not missed, and the series rows are never one offs.
  assert.equal(missedOneOffs(rows, TODAY).length, 0);
  assert.ok(occ.every((m) => m.task.id === 'gym' || m.task.id.startsWith('gym:')));
});

test('a weekly series only misses its own days, and nothing before it started', () => {
  // Weekly on Monday and Thursday from Thu 15 Oct.
  const rows = [T('w', { dueDate: '2026-10-15', recurrence: 'weekly', recurrenceDays: ['Mon', 'Thu'], completed: true })];
  assert.deepEqual(missedItems(rows, TODAY).map((m) => m.day), []);
  const rows2 = [T('w', { dueDate: '2026-10-12', recurrence: 'weekly', recurrenceDays: ['Mon', 'Thu'], completed: true })];
  assert.deepEqual(missedItems(rows2, TODAY).map((m) => m.day), ['2026-10-15']);
});

test('listing never changes the rows', () => {
  const rows = [T('old', { dueDate: '2026-10-15' }), T('gym', { dueDate: '2026-10-12', recurrence: 'daily' })];
  const before = JSON.stringify(rows);
  missedItems(rows, TODAY);
  assert.equal(JSON.stringify(rows), before);
});

test('Do it today makes a plain task for today with no repeat, steps unticked', () => {
  let n = 0;
  const occ = T('gym:2026-10-16', { title: 'Gym', dueDate: '2026-10-16', recurrence: 'daily', emoji: '🏋️', projectKey: 'p', durationMinutes: 60, startTime: '07:00', subtasks: [{ id: 's', title: 'Warm up', done: true }] });
  const c = doTodayCopy(occ, 'new1', TODAY, 'now', () => `sub${++n}`);
  assert.equal(c.id, 'new1');
  assert.equal(c.dueDate, TODAY);
  assert.equal(c.recurrence, undefined);
  assert.equal(c.startTime, undefined);
  assert.deepEqual(c.subtasks, [{ id: 'sub1', title: 'Warm up', done: false }]);
  assert.equal(c.emoji, '🏋️');
  assert.equal(c.projectKey, 'p');
});
