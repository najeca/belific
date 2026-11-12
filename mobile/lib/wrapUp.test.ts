// Run with `npm test` from mobile/. F3 of PLAN_daily_flow: Wrap up and the Earlier panel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { allOpen, buttonsFor, dayItems, doneOnOwnDay, earlierItems, showToday, splitSteps, stepsButton, tickedAllText, tomorrowText } from './wrapUp.ts';
import type { Task } from './types.ts';

const TODAY = '2026-11-18'; // a Wednesday
const TOMORROW = '2026-11-19';
const T = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, completed: false, createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z', ...extra });
const day = (extra: Partial<Task> = {}) => ({ dueDate: TODAY, ...extra });

test('Wrap up lists the day: a shift is one row with its rows; a repeating day has only Let go; done tasks have no buttons', () => {
  const tasks = [
    T('shift', day({ startTime: '08:00', durationMinutes: 600, title: 'Shift', subtasks: [{ id: 'o', title: 'Order supplies', done: false }] })),
    T('brief', day({ startTime: '08:30', durationMinutes: 30, completed: true })),
    T('ring', day({ startTime: '14:00', durationMinutes: 60 })),
    T('boiler', day()),
    T('gym', { dueDate: '2026-11-11', recurrence: 'weekly', recurrenceDays: ['Wed'], startTime: '19:00', durationMinutes: 60 }),
    T('gap', day({ startTime: '12:00', durationMinutes: 30, cutsBelow: true })),
    T('gone', day({ deletedAt: 'x' })),
  ];
  const items = dayItems(tasks, TODAY, TODAY, 30);
  assert.deepEqual(items.map((i) => i.key), ['shift', 'gym:2026-11-18', 'boiler'], 'by time, untimed last; free time and the deleted one left out');
  const shift = items[0];
  assert.deepEqual(shift.inside!.map((i) => [i.task.title, i.done, i.series]), [['brief', true, false], ['ring', false, false], ['Order supplies', false, true]]);
  assert.deepEqual(buttonsFor(shift.inside![1]), { tomorrow: true, list: true, letGo: true, stepsLeft: 0, partsLeft: 0 });
  assert.deepEqual(buttonsFor(shift.inside![2]), { tomorrow: false, list: false, letGo: false, stepsLeft: 0, partsLeft: 0 }, 'a to do: its tick only');
  assert.deepEqual(buttonsFor(items[1]), { tomorrow: false, list: false, letGo: true, stepsLeft: 0, partsLeft: 0 }, 'a repeating day never moves');
  assert.deepEqual(buttonsFor(shift.inside![0]), { tomorrow: false, list: false, letGo: false, stepsLeft: 0, partsLeft: 0 }, 'done');
});

test('steps: only the steps left go to tomorrow, today keeps the ticked ones and is done', () => {
  const t = T('shed', day({ title: 'Tidy the shed', durationMinutes: 60, listKey: 'home', subtasks: [
    { id: 'a', title: 'Sweep', done: true },
    { id: 'b', title: 'Sort', done: true },
    { id: 'c', title: 'Paint', done: false },
  ] }));
  const [item] = dayItems([t], TODAY, TODAY, 30);
  assert.equal(buttonsFor(item).stepsLeft, 1);
  assert.equal(stepsButton(1), 'Only the 1 step left to tomorrow');
  assert.equal(stepsButton(3), 'Only the 3 steps left to tomorrow');
  const [today, copy] = splitSteps(t, TOMORROW, 'new', '2026-11-18T20:00:00.000Z');
  assert.equal(today.completed, true);
  assert.deepEqual(today.subtasks!.map((s) => s.id), ['a', 'b']);
  assert.equal(today.dueDate, TODAY);
  assert.equal(copy.id, 'new');
  assert.equal(copy.dueDate, TOMORROW);
  assert.equal(copy.completed, false);
  assert.deepEqual(copy.subtasks!.map((s) => [s.id, s.done]), [['c', false]]);
  assert.equal(copy.listKey, 'home');
  assert.equal(copy.durationMinutes, 60);
  assert.equal(buttonsFor({ ...item, task: { ...t, subtasks: [{ id: 'a', title: 'x', done: false }] } }).stepsLeft, 0, 'none ticked: not offered');
});

test('Earlier: one off tasks of earlier days; a shift is one row with its inside rows; Tick all ticks them on their own days', () => {
  const tasks = [
    T('old', { dueDate: '2026-11-10', title: 'Book the boiler' }),
    T('night', { dueDate: '2026-11-11', startTime: '08:00', durationMinutes: 600 }),
    T('in1', { dueDate: '2026-11-11', startTime: '09:00', durationMinutes: 30 }),
    T('in2', { dueDate: '2026-11-11', startTime: '10:00', durationMinutes: 30, completed: true }),
    T('rep', { dueDate: '2026-11-12', recurrence: 'daily' }),
    T('today', day()),
  ];
  const items = earlierItems(tasks, TODAY);
  assert.deepEqual(items.map((i) => [i.key, (i.inside ?? []).map((x) => x.key)]), [['old', []], ['night', ['in1']]]);
  assert.deepEqual(allOpen(items).map((t) => t.id), ['old', 'night', 'in1']);
  const done = doneOnOwnDay(tasks[0]);
  assert.equal(done.completed, true);
  assert.equal(done.dueDate, '2026-11-10');
  assert.equal(new Date(done.completedAt!).getDate(), 10, 'done on its own day');
  assert.equal(tickedAllText(3), 'Ticked 3, done on their own days');
  assert.equal(showToday(9), true);
  assert.equal(showToday(18), false);
});

test('the figure: a shift counts once', () => {
  const tasks = [
    T('s', { dueDate: TOMORROW, startTime: '08:00', durationMinutes: 600 }),
    T('i', { dueDate: TOMORROW, startTime: '09:00', durationMinutes: 60 }),
    T('p', { dueDate: TOMORROW, durationMinutes: 30 }),
  ];
  assert.equal(tomorrowText(tasks, TOMORROW, TODAY, 30, Date.parse('2026-11-18T20:00:00Z')), 'Tomorrow so far: 2 tasks, 10h 30m');
  assert.equal(tomorrowText([], TOMORROW, TODAY, 30, 0), 'Tomorrow so far: nothing planned yet.');
});
