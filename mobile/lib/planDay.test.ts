// Run with `npm test` from mobile/. F4 of PLAN_daily_flow: Plan my day on one screen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { addRows, dayOpen, dayTotalText, earlierLine, insideText, lastWeekCount, lastWeekLine, plannedText, repeatingNotToday } from './planDay.ts';
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

// F5 of PLAN_daily_flow: Plan week.
test('F5: the total of a day counts a shift once at its own length; a dash when nothing has a length; past days are closed', () => {
  const tasks = [
    T('shift', { dueDate: TODAY, startTime: '08:00', durationMinutes: 600 }),
    T('brief', { dueDate: TODAY, startTime: '08:30', durationMinutes: 30 }),
    T('read', { dueDate: TODAY, durationMinutes: 60 }),
    T('bare', { dueDate: '2026-11-19' }),
  ];
  const now = Date.parse('2026-11-18T07:00:00Z');
  assert.equal(dayTotalText(tasks, TODAY, TODAY, 30, now), '11h');
  assert.equal(dayTotalText(tasks, '2026-11-20', TODAY, 30, now), '—');
  assert.equal(dayOpen('2026-11-17', TODAY), false);
  assert.equal(dayOpen(TODAY, TODAY), true);
  assert.equal(dayOpen('2026-11-19', TODAY), true);
});

test('F5: "N from last week" counts what waits in Earlier, a shift once, and says it plainly', () => {
  const tasks = [
    T('a', { dueDate: '2026-11-10' }),
    T('s', { dueDate: '2026-11-11', startTime: '08:00', durationMinutes: 600 }),
    T('i', { dueDate: '2026-11-11', startTime: '09:00', durationMinutes: 30 }),
    T('done', { dueDate: '2026-11-12', completed: true }),
  ];
  assert.equal(lastWeekCount(tasks, TODAY), 2);
  assert.equal(lastWeekLine(2), '2 from last week');
});
