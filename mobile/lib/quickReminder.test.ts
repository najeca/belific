import test from 'node:test';
import assert from 'node:assert/strict';
import { isQuickReminder, labelFits, reminderDay, reminderText, reminderWhen, splitReminders } from './quickReminder.ts';
import { totalsOf, plannedText } from './taskTotals.ts';
import { dayHostEntries } from './hosting.ts';
import { shiftsOfDay } from './shifts.ts';
import { missedItems } from './missed.ts';
import { completedCard } from './analytics.ts';
import { buildNotifyPayload } from './desktopNotifyCore.ts';
import type { Task } from './types.ts';

const DAY = '2026-11-12';
const T = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, completed: false, createdAt: 't', updatedAt: 'u', ...extra });
const R = (id: string, time: string, extra: Partial<Task> = {}): Task => T(id, { dueDate: DAY, startTime: time, durationMinutes: 0, ...extra });

test('isQuickReminder: 0 minutes with a Day and a time; no length, no time or no Day is not one', () => {
  assert.equal(isQuickReminder(R('r', '11:15')), true);
  assert.equal(isQuickReminder(T('a', { dueDate: DAY, startTime: '11:15' })), false, 'no length is an ordinary 30 minute block');
  assert.equal(isQuickReminder(T('b', { dueDate: DAY, durationMinutes: 0 })), false, 'no time');
  assert.equal(isQuickReminder(T('c', { startTime: '11:15', durationMinutes: 0 })), false, 'no Day');
  assert.equal(isQuickReminder(T('d', { dueDate: DAY, startTime: '11:15', durationMinutes: 30 })), false);
});

test('splitReminders: the reminders apart, earliest first; the rest keep their order', () => {
  const list = [{ task: T('x', { dueDate: DAY, startTime: '09:00', durationMinutes: 60 }) }, { task: R('late', '20:00') }, { task: R('early', '07:30') }];
  const { reminders, rest } = splitReminders(list);
  assert.deepEqual(reminders.map((r) => r.task.id), ['early', 'late']);
  assert.deepEqual(rest.map((r) => r.task.id), ['x']);
});

test('the words: the row text, the day and the line under the time', () => {
  assert.equal(reminderText({ title: 'Ring the pharmacy', startTime: '11:15' }), '11:15am Ring the pharmacy');
  const now = new Date(2026, 10, 12, 10, 0);
  assert.equal(reminderDay('11:15', now, '2026-11-12', '2026-11-13'), '2026-11-12');
  assert.equal(reminderDay('09:00', now, '2026-11-12', '2026-11-13'), '2026-11-13', 'a time that has passed is tomorrow');
  assert.equal(reminderDay('10:00', now, '2026-11-12', '2026-11-13'), '2026-11-13', 'now itself is tomorrow');
  assert.equal(reminderWhen('11:15', '2026-11-12', '2026-11-12'), 'Reminds you today at 11:15am');
  assert.equal(reminderWhen('07:00', '2026-11-13', '2026-11-12'), 'Reminds you tomorrow at 7:00am');
  assert.equal(reminderWhen('', '2026-11-12', '2026-11-12'), 'Choose a time');
});

test('labelFits: the label shows only when no block is near the time', () => {
  assert.equal(labelFits(600, []), true);
  assert.equal(labelFits(600, [[540, 660]]), false, 'inside a block');
  assert.equal(labelFits(600, [[605, 660]]), false, 'a block starting just after');
  assert.equal(labelFits(600, [[480, 570]]), true, 'a block that ended half an hour before');
});

test('a reminder never changes a total: count, estimate, planned', () => {
  const work = [T('w', { dueDate: DAY, startTime: '09:00', durationMinutes: 90 })];
  const withR = [...work, R('r', '09:30'), R('r2', '20:00', { completed: true })];
  assert.deepEqual(totalsOf(withR, 0), totalsOf(work, 0));
  assert.equal(plannedText(withR), plannedText(work));
});

test('a reminder inside a long block is not nested, not a row of the shift, and does not host or cut', () => {
  const shift = T('shift', { dueDate: DAY, startTime: '08:00', durationMinutes: 480 });
  const inner = T('inner', { dueDate: DAY, startTime: '10:00', durationMinutes: 60 });
  const r = R('r', '11:00');
  const all = [shift, inner, r];
  assert.deepEqual(dayHostEntries(all, DAY, DAY).map((e) => e.full.id).sort(), ['inner', 'shift']);
  const shifts = shiftsOfDay(all, DAY, DAY, 15);
  assert.deepEqual(shifts.byTask.get('shift')?.rows.map((x) => x.full?.id), ['inner']);
  assert.equal(shifts.hidden.has('r'), false);
  assert.deepEqual(totalsOf(all, 0).estimate, totalsOf([shift, inner], 0).estimate);
});

test('a reminder of an earlier day is not waiting in Earlier; a ticked one is not a completed task in Analytics', () => {
  assert.deepEqual(missedItems([R('r', '11:00', { dueDate: '2026-11-10' }), T('t', { dueDate: '2026-11-10' })], DAY).map((m) => m.task.id), ['t']);
  const done = { completed: true, completedAt: new Date(2026, 10, 12, 11, 0).toISOString() };
  const card = completedCard([R('r', '11:00', done), T('t', { dueDate: DAY, ...done })], { start: DAY, end: DAY });
  assert.equal(card.current, 1);
});

test('the notification: a reminder is one "quick" entry at its time, without leads', () => {
  const now = new Date(2026, 10, 12, 8, 0).getTime();
  const p = buildNotifyPayload([], [R('r', '11:15', { reminders: [5, 10] }), R('done', '12:00', { completed: true })], now);
  assert.deepEqual(p.placed, [{ id: 'r', title: 'r', start: new Date(2026, 10, 12, 11, 15).getTime(), completed: false, quick: true }]);
  assert.deepEqual(p.planned, []);
});
