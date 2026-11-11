// Run with `npm test` from mobile/. F4 of PLAN_daily_flow: Plan my day on one screen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { addRows, earlierLine, insideText, plannedText, repeatingNotToday } from './planDay.ts';
import { dayItems } from './wrapUp.ts';
import type { Task } from './types.ts';

const TODAY = '2026-11-18'; // a Wednesday
const T = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, completed: false, createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z', ...extra });

test('Add to today: a list shows its tasks with no Day and not done; Brain Dump is the tasks with no list', () => {
  const lists = [{ key: 'home' }];
  const tasks = [T('a', { listKey: 'home' }), T('b', { listKey: 'home', dueDate: TODAY }), T('c', { listKey: 'home', completed: true }), T('d'), T('e', { deletedAt: 'x' })];
  assert.deepEqual(addRows(tasks, 'home', lists).map((i) => i.key), ['a']);
  assert.deepEqual(addRows(tasks, undefined, lists).map((i) => i.key), ['d']);
});

test('Repeating, not on today: each series once, at its next day; a series on today is not listed', () => {
  const tasks = [
    T('fri', { dueDate: '2026-11-13', recurrence: 'weekly', recurrenceDays: ['Fri'] }),
    T('wed', { dueDate: '2026-11-11', recurrence: 'weekly', recurrenceDays: ['Wed'] }),
    T('mon', { dueDate: '2026-11-16', recurrence: 'weekly', recurrenceDays: ['Mon', 'Thu'] }),
  ];
  const r = repeatingNotToday(tasks, TODAY);
  assert.deepEqual(r.map((i) => [i.task.id, i.task.dueDate, i.projected]), [
    ['mon:2026-11-19', '2026-11-19', true],
    ['fri:2026-11-20', '2026-11-20', true],
  ]);
});

test('On today: a shift is one item with what is inside it folded under it; the figure counts it once', () => {
  const tasks = [
    T('shift', { dueDate: TODAY, startTime: '08:00', durationMinutes: 600, subtasks: [{ id: 's', title: 'Order', done: false }] }),
    T('brief', { dueDate: TODAY, startTime: '08:30', durationMinutes: 30 }),
    T('read', { dueDate: TODAY, durationMinutes: 30 }),
  ];
  const items = dayItems(tasks, TODAY, TODAY, 30);
  assert.deepEqual(items.map((i) => i.key), ['shift', 'read']);
  assert.equal(insideText(items[0]), '1 inside · 1 to do');
  assert.equal(plannedText(tasks, TODAY, 30, Date.parse('2026-11-18T07:00:00Z')), 'Planned 10h 30m');
  assert.equal(earlierLine(3), '3 from earlier days');
});
