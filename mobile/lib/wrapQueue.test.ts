// Run with `npm test` from mobile/. Wrap up on the phone (3.65.0): the queue and the offers use the desktop's rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { wrapOffers, wrapQueue, wrapText, wrapHint } from './wrapQueue.ts';
import type { Task } from './types.ts';

const TODAY = '2026-11-18';
const STAMP = '2026-11-01T00:00:00.000Z';
const T = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, completed: false, createdAt: STAMP, updatedAt: STAMP, ...extra });

test('the queue is today open tasks in time order; done, other days and reminders are not asked', () => {
  const raw = [
    T('late', { dueDate: TODAY, startTime: '17:00', durationMinutes: 30 }),
    T('early', { dueDate: TODAY, startTime: '08:00', durationMinutes: 30 }),
    T('plain', { dueDate: TODAY }),
    T('done', { dueDate: TODAY, completed: true }),
    T('later', { dueDate: '2026-11-19' }),
    T('rem', { dueDate: TODAY, startTime: '10:00', durationMinutes: 0 }),
  ];
  assert.deepEqual(wrapQueue(raw, TODAY, 30).map((i) => i.task.id), ['early', 'late', 'plain']);
});

test('a one off task offers Done, Tomorrow, Back to its list, Let go', () => {
  const [it] = wrapQueue([T('a', { dueDate: TODAY })], TODAY, 30);
  assert.deepEqual(wrapOffers(it).map((o) => o.answer), ['done', 'tomorrow', 'list', 'letGo']);
});

test('a repeating day offers Done and Let go for today only', () => {
  const raw = [T('rep', { recurrence: 'daily', dueDate: '2026-11-10' })];
  const q = wrapQueue(raw, TODAY, 30);
  assert.equal(q.length, 1);
  assert.deepEqual(wrapOffers(q[0]).map((o) => o.answer), ['done', 'letGo']);
  assert.equal(wrapOffers(q[0])[1].label, 'Let go for today');
  assert.match(wrapHint(q[0]), /skips only today/);
});

test('a task with some steps ticked offers only the steps left', () => {
  const raw = [T('s', { dueDate: TODAY, subtasks: [{ id: '1', title: 'a', done: true }, { id: '2', title: 'b', done: false }, { id: '3', title: 'c', done: false }] })];
  const offers = wrapOffers(wrapQueue(raw, TODAY, 30)[0]);
  assert.ok(offers.some((o) => o.answer === 'steps' && /2 steps left/.test(o.label)));
});

test('the words', () => {
  assert.equal(wrapText('tomorrow', 'Gym'), 'Tomorrow: Gym');
  assert.equal(wrapText('letGo', 'Gym'), 'Let go: Gym');
});
