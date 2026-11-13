// Run with `npm test` from mobile/. Shifts S3: the shift's card and details, and Add inside.
import test from 'node:test';
import assert from 'node:assert/strict';
import { doneText, flipTodo, formCheck, insideItemsOf, insideTask, insideTodo, rowMeta, shiftOnly, shiftSpan, shiftText, shiftsOfDay, shiftsOfDays, withItems, type InsideForm } from './shifts.ts';
import { plannedText, totalsOf } from './taskTotals.ts';
import type { Task } from './types.ts';

const DAY = '2026-11-12';
const T = (id: string, startTime: string | undefined, durationMinutes: number | undefined, extra: Partial<Task> = {}): Task => ({
  id,
  title: id,
  completed: false,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  dueDate: DAY,
  ...(startTime ? { startTime } : {}),
  ...(durationMinutes ? { durationMinutes } : {}),
  ...extra,
});
const nurse = (extra: Partial<Task> = {}): Task[] => [
  T('shift', '08:00', 600, { title: 'Shift', ...extra }),
  T('briefing', '08:30', 30, { title: 'Briefing', completed: true }),
  T('teams', '10:00', 60, { title: 'Teams press meeting', completed: true }),
  T('patients', '11:00', 120, { title: 'Ring patients' }),
  T('lunch', '13:00', 30, { title: 'Lunch' }),
  T('depts', '14:00', 60, { title: 'Ring other departments' }),
];
const todos = [
  { id: 's1', title: 'Check emails', done: false },
  { id: 's2', title: 'Order supplies', done: false },
];

test('the nurse day: the shift card has a summary, a progress count and rows; the five are not cards (D2)', () => {
  const r = shiftsOfDay(nurse({ subtasks: todos }), DAY, DAY, 30);
  const info = r.byTask.get('shift')!;
  assert.ok(info);
  assert.equal(shiftText(info), '5h of 10h planned, 5h free');
  assert.equal(info.count, 7, 'five timed blocks and two to dos');
  assert.equal(info.done, 2);
  assert.equal(doneText(info.done, info.count), '2 of 7 done');
  assert.deepEqual(info.rows.map((x) => x.title), ['Briefing', 'Teams press meeting', 'Ring patients', 'Lunch', 'Ring other departments', 'Check emails', 'Order supplies']);
  assert.deepEqual([...r.hidden].sort(), ['briefing', 'depts', 'lunch', 'patients', 'teams']);
  assert.equal(r.hidden.has('shift'), false, 'the shift keeps its card');
  assert.equal(rowMeta(info.rows[0]), '8:30am 30m');
  assert.equal(rowMeta(info.rows[5]), '', 'a to do has no time');
});

test('only to dos: rows and a count but no summary; a plain task with nothing inside has no shift', () => {
  const r = shiftsOfDay([T('shift', '08:00', 600, { subtasks: todos })], DAY, DAY, 30);
  const info = r.byTask.get('shift')!;
  assert.equal(info.summary, undefined);
  assert.equal(doneText(info.done, info.count), '0 of 2 done');
  assert.equal(r.hidden.size, 0);
  assert.equal(shiftsOfDay([T('a', '08:00', 60)], DAY, DAY, 30).byTask.size, 0);
  assert.equal(shiftsOfDay([T('a', undefined, 60, { subtasks: todos })], DAY, DAY, 30).byTask.size, 0, 'an untimed task keeps its steps ring');
});

test('a block that only partly overlaps is not a row; free time and its guests are not rows either', () => {
  const day = [T('shift', '08:00', 600), T('late', '17:30', 60), T('gap', '15:00', 30, { cutsBelow: true }), T('tea', '15:00', 15)];
  const r = shiftsOfDay(day, DAY, DAY, 30);
  assert.equal(r.byTask.has('shift'), false, 'nothing is inside: no shift');
  assert.equal(r.hidden.size, 0);
  const more = shiftsOfDay([...day, T('in', '09:00', 60)], DAY, DAY, 30);
  assert.deepEqual(more.byTask.get('shift')!.rows.map((x) => x.key), ['task:in'], 'only the one that fits inside');
  assert.deepEqual([...more.hidden], ['in']);
});

test('shifts shown only: the blocks inside one that is not shown keep their cards', () => {
  const r = shiftsOfDay(nurse(), DAY, DAY, 30, new Set<string>());
  assert.equal(r.byTask.size, 0);
  assert.equal(r.hidden.size, 0);
});

test('Add inside: the form needs a name; a timed item has to fit in the shift, with a "Fit inside"', () => {
  const shift = T('shift', '08:00', 600, { title: 'Shift' });
  const F = (extra: Partial<InsideForm>): InsideForm => ({ title: 'Lunch', timed: true, start: '13:00', length: 30, scope: 'all', ...extra });
  assert.deepEqual(formCheck(shift, F({})), { ok: true });
  assert.deepEqual(formCheck(shift, F({ title: '  ' })), { ok: false });
  assert.deepEqual(formCheck(shift, F({ timed: false, title: 'Call' })), { ok: true }, 'a to do needs no time');
  assert.deepEqual(formCheck(shift, F({ start: '17:45' })), { ok: false, note: 'This would end after Shift (6:00pm)', fit: { start: '17:30', length: 30 } });
  assert.deepEqual(formCheck(shift, F({ start: '07:00' })), { ok: false, note: 'This would start before Shift (8:00am)', fit: { start: '08:00', length: 30 } });
  assert.deepEqual(formCheck(shift, F({ length: 720 })), { ok: false, note: 'Longer than Shift (10h)', fit: { start: '08:00', length: 600 } });
  assert.deepEqual(formCheck(shift, F({ start: '08:00', length: 600 })), { ok: true }, 'the edges count');
  assert.equal(formCheck(T('x', undefined, undefined, { title: 'Walk' }), F({})).ok, false, 'no time on the shift: only a to do');
  assert.deepEqual(shiftSpan(shift), [480, 1080]);
});

test('Add inside: a timed item is a plain task on the shift\'s day; All days copies the repeat rule; a to do joins the checklist', () => {
  const rule = { recurrence: 'weekly' as const, recurrenceDays: ['Mon', 'Tue', 'Thu', 'Fri'] as Task['recurrenceDays'] };
  const f: InsideForm = { title: ' Lunch ', timed: true, start: '13:00', length: 30, scope: 'day' };
  assert.deepEqual(insideTask(rule, DAY, f), { title: 'Lunch', dueDate: DAY, startTime: '13:00', durationMinutes: 30 });
  assert.deepEqual(insideTask(rule, DAY, { ...f, scope: 'all' }), { title: 'Lunch', dueDate: DAY, startTime: '13:00', durationMinutes: 30, recurrence: 'weekly', recurrenceDays: ['Mon', 'Tue', 'Thu', 'Fri'] });
  assert.deepEqual(insideTask({}, DAY, { ...f, scope: 'all' }), { title: 'Lunch', dueDate: DAY, startTime: '13:00', durationMinutes: 30 }, 'no rule to copy');
  assert.deepEqual(insideTodo(todos, 'Call other departments', 's3').map((s) => s.title), ['Check emails', 'Order supplies', 'Call other departments']);
  assert.deepEqual(insideTodo(undefined, '  ', 's1'), []);
});

test('a to do tick flips one item and never completes the shift', () => {
  const next = flipTodo(todos, 's1');
  assert.deepEqual(next.map((s) => s.done), [true, false]);
  assert.deepEqual(flipTodo(next.map((s) => ({ ...s, done: true })), 's2').map((s) => s.done), [true, false]);
});

// ---- S4 ----

test('S4 fix: rows only on a block of 2 hours or more; a shorter one keeps its steps ring and its inside cards', () => {
  const steps = [{ id: 's1', title: 'One', done: false }];
  assert.equal(shiftsOfDay([T('call', '19:00', 60, { subtasks: steps })], DAY, DAY, 30).byTask.size, 0, '1 h with steps: the ring');
  assert.equal(shiftsOfDay([T('call', '19:00', 119, { subtasks: steps })], DAY, DAY, 30).byTask.size, 0, 'just under 2 h');
  assert.equal(shiftsOfDay([T('study', '18:00', 120, { subtasks: steps })], DAY, DAY, 30).byTask.get('study')!.rows.length, 1, '2 h with to dos only: rows');
  const short = shiftsOfDay([T('meet', '09:00', 90), T('note', '09:15', 15)], DAY, DAY, 30);
  assert.equal(short.byTask.size, 0, 'a 90 minute block with one inside is not a shift on the card');
  assert.equal(short.hidden.size, 0, 'and what is inside it keeps its card');
});

test('S4: a night shift that crosses midnight lists what is after midnight; that item is a row, not a card, the next day', () => {
  const NEXT = '2026-11-13';
  const tasks = [T('night', '20:00', 720, { title: 'Night' }), T('handover', '20:30', 30, { title: 'Handover' }), T('meds', '02:00', 30, { title: 'Meds', dueDate: NEXT }), T('late', '07:30', 60, { dueDate: NEXT })];
  const info = shiftsOfDay(tasks, DAY, DAY, 30).byTask.get('night')!;
  assert.deepEqual(info.rows.map((r) => [r.title, rowMeta(r)]), [
    ['Handover', '8:30pm 30m'],
    ['Meds', '2:00am (next day) 30m'],
  ]);
  assert.equal(shiftText(info), '1h of 12h planned, 11h free');
  const next = shiftsOfDay(tasks, NEXT, DAY, 30);
  assert.deepEqual([...next.hidden], ['meds'], 'Late ends after the shift: it keeps its card');
  assert.deepEqual([...next.carried], ['meds'], 'and the next day\'s total leaves Meds out');
});

test('S4: insideItemsOf lists the separate tasks a skip or a delete may take along (both days for a night shift)', () => {
  const NEXT = '2026-11-13';
  const tasks = [T('night', '20:00', 720), T('handover', '20:30', 30), T('meds', '02:00', 30, { dueDate: NEXT }), T('pill', '21:00', 15, { extraTimes: ['09:00'] })];
  assert.deepEqual(insideItemsOf(tasks, tasks[0], DAY).map((e) => e.full.id), ['handover', 'meds'], 'a task with several times is left out');
  assert.equal(withItems('Delete', 7), 'Delete the shift and its 7 items');
  assert.equal(withItems('Skip', 1), 'Skip the shift and its 1 item');
  assert.equal(shiftOnly('Skip'), 'Skip the shift only');
  const shift = nurse();
  assert.deepEqual(insideItemsOf(shift, shift[0], DAY).map((e) => e.full.id).sort(), ['briefing', 'depts', 'lunch', 'patients', 'teams']);
});

test('S5 the phone: several days at once (the Tasks list), and the phone total reads the shift once (10h, not 15h)', () => {
  const other = '2026-11-13';
  const tasks = [...nurse({ subtasks: todos }), T('shift2', '09:00', 180, { title: 'Clinic', dueDate: other }), T('notes', '10:00', 60, { title: 'Notes', dueDate: other })];
  const r = shiftsOfDays(tasks, [DAY, other, DAY], DAY, 30);
  assert.deepEqual([...r.byTask.keys()].sort(), ['shift', 'shift2']);
  assert.equal(shiftText(r.byTask.get('shift2')!), '1h of 3h planned, 2h free');
  assert.ok(r.hidden.has('notes') && r.hidden.has('lunch'));
  // only the shifts shown hide their blocks
  const some = shiftsOfDays(tasks, [DAY, other], DAY, 30, new Set(['shift2']));
  assert.deepEqual([...some.byTask.keys()], ['shift2']);
  assert.equal(some.hidden.has('lunch'), false);
  // the day's total on the phone is the desktop's rule
  const day = tasks.filter((t) => t.dueDate === DAY);
  assert.equal(totalsOf(day, Date.now(), 30).estimate, 600);
  assert.equal(plannedText(day), '10h planned');
});
