// Run with `npm test` from mobile/. F2 of PLAN_daily_flow: the Clear tools.
import test from 'node:test';
import assert from 'node:assert/strict';
import { clearButton, clearQuestion, labelTrashButton, oneOffRows, planClear, shiftNote, weekOf } from './clear.ts';
import type { Task } from './types.ts';

const TODAY = '2026-11-18'; // a Wednesday
const T = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, completed: false, createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z', ...extra });
const day = (extra: Partial<Task> = {}) => ({ dueDate: TODAY, ...extra });

test('Clear day: the unticked tasks of the day, back to their lists; done tasks and free time stay; a shift is one', () => {
  const tasks = [
    T('shift', day({ startTime: '08:00', durationMinutes: 600, title: 'Shift' })),
    T('brief', day({ startTime: '08:30', durationMinutes: 30 })),
    T('lunch', day({ startTime: '13:00', durationMinutes: 30 })),
    T('done', day({ completed: true })),
    T('gap', day({ startTime: '15:00', durationMinutes: 30, cutsBelow: true })),
    T('plain', day({ listKey: 'home' })),
    T('other', { dueDate: '2026-11-19' }),
  ];
  const plan = planClear(tasks, { kind: 'day', dayKey: TODAY }, TODAY);
  assert.deepEqual(plan.items.map((i) => i.task.id).sort(), ['brief', 'lunch', 'plain', 'shift']);
  assert.equal(plan.count, 2, 'the shift (with its two) and the plain task');
  assert.equal(plan.shifts, 1);
  assert.equal(plan.inside, 2);
  assert.equal(shiftNote(plan), 'A shift counts as one, with the 2 tasks inside it.');
  assert.equal(clearQuestion({ kind: 'day', dayKey: TODAY }, plan, TODAY), 'Clear 2 tasks from today?');
  assert.equal(clearQuestion({ kind: 'day', dayKey: '2026-11-19' }, plan, TODAY), 'Clear 2 tasks from Thursday 19 Nov?');
  const rows = oneOffRows(plan, 'unplan', 'now');
  assert.ok(rows.every((r) => r.dueDate === undefined && r.startTime === undefined && !r.deletedAt));
  assert.equal(rows.find((r) => r.id === 'plain')!.listKey, 'home', 'it goes back to its list');
});

test('Clear day: a night shift takes its after midnight item along; repeating days are counted and asked about', () => {
  const tasks = [
    T('night', day({ startTime: '20:00', durationMinutes: 720 })),
    T('meds', { dueDate: '2026-11-19', startTime: '02:00', durationMinutes: 30 }),
    T('gym', { dueDate: '2026-11-11', startTime: '18:00', durationMinutes: 60, recurrence: 'weekly', recurrenceDays: ['Wed'] }),
  ];
  const plan = planClear(tasks, { kind: 'day', dayKey: TODAY }, TODAY);
  assert.deepEqual(plan.items.map((i) => [i.task.id, i.series, i.projected, i.inside]).sort(), [
    ['gym:2026-11-18', true, true, false],
    ['meds', false, false, true],
    ['night', false, false, false],
  ]);
  assert.equal(plan.count, 2);
  assert.equal(plan.repeating, 1);
});

test('Clear week: Monday to Sunday', () => {
  assert.deepEqual(weekOf(TODAY), ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']);
  const tasks = [T('a', { dueDate: '2026-11-16' }), T('b', { dueDate: '2026-11-22' }), T('c', { dueDate: '2026-11-23' })];
  const plan = planClear(tasks, { kind: 'week', days: weekOf(TODAY) }, TODAY);
  assert.equal(plan.count, 2);
  assert.equal(clearQuestion({ kind: 'week', days: weekOf(TODAY) }, plan, TODAY), 'Clear 2 tasks from 16 Nov to 22 Nov?');
});

test('Clear list: its unticked tasks to the Trash; a series once, with its next day', () => {
  const tasks = [
    T('a', { listKey: 'L' }),
    T('b', { listKey: 'L', completed: true }),
    T('c', { listKey: 'M' }),
    T('r', { listKey: 'L', dueDate: '2026-11-11', recurrence: 'weekly', recurrenceDays: ['Wed', 'Fri'] }),
  ];
  const plan = planClear(tasks, { kind: 'list', listKey: 'L', name: 'Home' }, TODAY);
  assert.deepEqual(plan.items.map((i) => i.task.id).sort(), ['a', 'r']);
  assert.equal(plan.items.find((i) => i.task.id === 'r')!.next!.task.dueDate, TODAY, 'its next day is today');
  assert.equal(clearButton('trash', plan.count), 'Move 2 tasks to the Trash');
  assert.deepEqual(oneOffRows(plan, 'trash', 'now').map((r) => [r.id, r.deletedAt]), [['a', 'now']]);
  assert.equal(clearQuestion({ kind: 'list', listKey: 'L', name: 'Home' }, plan, TODAY), 'Clear 2 tasks from the list Home?');
});

test('Clear label: the label comes off (a shift does not take its items then); the second button moves them to Trash', () => {
  const tasks = [
    T('shift', day({ startTime: '08:00', durationMinutes: 600, projectKey: 'W' })),
    T('in', day({ startTime: '09:00', durationMinutes: 30 })),
    T('x', { projectKey: 'W' }),
    T('y', { projectKey: 'W', completed: true }),
  ];
  const target = { kind: 'label' as const, labelKey: 'W', name: 'Work' };
  const off = planClear(tasks, target, TODAY, 'off');
  assert.equal(off.count, 2);
  assert.deepEqual(oneOffRows(off, 'off', 'now').map((r) => [r.id, r.projectKey]), [['shift', undefined], ['x', undefined]]);
  assert.equal(clearQuestion(target, off, TODAY), 'Clear the label Work from 2 tasks?');
  assert.equal(clearButton('off', 2), 'Take the label off 2 tasks');
  const trash = planClear(tasks, target, TODAY, 'trash');
  assert.deepEqual(trash.items.map((i) => i.task.id).sort(), ['in', 'shift', 'x'], 'to the Trash: the shift takes its item along');
  assert.equal(trash.count, 2);
  assert.equal(labelTrashButton(2), 'Move the 2 tasks to Trash');
});

test('nothing to clear', () => {
  const plan = planClear([T('d', day({ completed: true }))], { kind: 'day', dayKey: TODAY }, TODAY);
  assert.equal(plan.count, 0);
  assert.equal(clearQuestion({ kind: 'day', dayKey: TODAY }, plan, TODAY), 'Nothing to clear from today.');
});
