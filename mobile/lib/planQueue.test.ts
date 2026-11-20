// Run with `npm test` from mobile/. Plan my day on the phone (3.62.0): the order, nothing asked twice, a repeating day.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ANSWER_LABEL, answerText, answersFor, planQueue, progressText, readTime } from './planQueue.ts';
import type { Task, TaskList } from './types.ts';

const TODAY = '2026-11-18'; // a Wednesday
const STAMP = '2026-11-01T00:00:00.000Z';
const T = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, completed: false, createdAt: STAMP, updatedAt: STAMP, ...extra });
const LISTS: TaskList[] = [{ key: 'work', name: 'Work', sortOrder: 0, createdAt: STAMP, updatedAt: STAMP }];

test('the order: today with no time, Earlier, Brain Dump, then each list', () => {
  const raw = [
    T('dump1'),
    T('work1', { listKey: 'work' }),
    T('old', { dueDate: '2026-11-16' }),
    T('today1', { dueDate: TODAY }),
    T('timed', { dueDate: TODAY, startTime: '09:00', durationMinutes: 30 }),
  ];
  const q = planQueue(raw, TODAY, LISTS, 30);
  assert.deepEqual(q.map((s) => [s.item.task.id, s.source]), [['today1', 'today'], ['old', 'earlier'], ['dump1', 'list'], ['work1', 'list']]);
});

test('a timed task on today, a done task and a task of a later day are not asked about', () => {
  const raw = [T('timed', { dueDate: TODAY, startTime: '09:00', durationMinutes: 30 }), T('done', { dueDate: TODAY, completed: true }), T('later', { dueDate: '2026-11-25' }), T('gone', { deletedAt: STAMP })];
  assert.deepEqual(planQueue(raw, TODAY, LISTS, 30), []);
});

test('nothing is asked twice', () => {
  const raw = [T('a'), T('b', { listKey: 'work' }), T('c', { dueDate: TODAY })];
  const ids = planQueue(raw, TODAY, LISTS, 30).map((s) => s.item.task.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('a repeating day today is asked, offers no Tomorrow, and is marked as a series', () => {
  const raw = [T('gym', { recurrence: 'weekly', recurrenceDays: ['Wed'], dueDate: TODAY })];
  const q = planQueue(raw, TODAY, LISTS, 30);
  assert.equal(q.length, 1);
  assert.equal(q[0].item.series, true);
  assert.deepEqual(answersFor(q[0]), ['today', 'time', 'notToday']);
});

test('a one off task offers all four answers', () => {
  const q = planQueue([T('a')], TODAY, LISTS, 30);
  assert.deepEqual(answersFor(q[0]), ['today', 'tomorrow', 'time', 'notToday']);
});

test('the words', () => {
  assert.equal(ANSWER_LABEL.time, 'A time');
  assert.equal(answerText('tomorrow', 'Buy milk'), 'Tomorrow: Buy milk');
  assert.equal(answerText('time', 'Buy milk', '14:30'), 'At 14:30: Buy milk');
  assert.equal(answerText('notToday', 'Buy milk'), 'Not today: Buy milk');
  assert.equal(progressText(2, 9), '3 of 9');
  assert.equal(progressText(9, 9), '9 of 9');
});

test('readTime reads a 24 hour time', () => {
  assert.equal(readTime('9:05'), '09:05');
  assert.equal(readTime('1430'), '14:30');
  assert.equal(readTime('24:00'), null);
  assert.equal(readTime('ab'), null);
});
