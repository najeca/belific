// Run with `npm test` from mobile/. Shifts S1: a block inside a longer block counts once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { nestDay, nestedMinutes, nestedMinutesBy, type NestEntry } from './nesting.ts';
import { plannedText, totalsOf } from './taskTotals.ts';
import { timeCard } from './analytics.ts';
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
const E = (id: string, s: number, e: number): NestEntry => ({ id, startMin: s * 60, endMin: e * 60 });

// The nurse: a 10 hour shift with five things inside it (PLAN_shifts section 9).
const nurse = () => [
  T('shift', '08:00', 600),
  T('briefing', '08:30', 30),
  T('teams', '10:00', 60),
  T('patients', '11:00', 120),
  T('lunch', '13:00', 30),
  T('depts', '14:00', 60),
];

test('nestDay: inside a longer block, one level, the edges count', () => {
  const r = nestDay([E('shift', 8, 18), E('a', 8, 9), E('b', 17, 18), E('c', 10, 12), E('d', 10.5, 11)]);
  assert.equal(r.shellOf.get('a'), 'shift', 'starts with the shift');
  assert.equal(r.shellOf.get('b'), 'shift', 'ends with the shift');
  assert.equal(r.shellOf.get('d'), 'shift', 'inside an inside block: one level, the outermost');
  assert.deepEqual(r.inside.get('shift'), ['a', 'c', 'd', 'b'], 'earliest first');
  assert.equal(r.shellOf.has('shift'), false);
});

test('nestDay: the same span, a partial overlap and two shells', () => {
  const same = nestDay([E('x', 9, 10), E('y', 9, 10)]);
  assert.equal(same.shellOf.size, 0, 'the same start and end: side by side, neither inside');
  const part = nestDay([E('shift', 8, 12), E('late', 11, 13)]);
  assert.equal(part.shellOf.size, 0, 'starts inside, ends after: not inside');
  const two = nestDay([E('long', 8, 18), E('other', 12, 20), E('m', 13, 14)]);
  assert.equal(two.shellOf.get('m'), 'other', 'held by two shells: the shorter one');
});

test('the nurse example counts 10h, not 15h, in every total', () => {
  const day = nurse();
  assert.equal(nestedMinutes(day), 300, 'the five things inside add 5h on top');
  assert.equal(totalsOf(day, 0).estimate, 600, 'Kanban, Calendar and Daily Planning');
  assert.equal(plannedText(day), '10h planned', 'Brain Dump planned');
  const done = day.map((t) => ({ ...t, completed: true, completedAt: `${DAY}T19:00:00.000Z` }));
  assert.equal(timeCard(done, { start: DAY, end: DAY }).estimated, 600, 'Analytics');
});

test('lunch is planned (D1): it counts as part of the shift, never on top', () => {
  const day = nurse();
  assert.equal(totalsOf(day.filter((t) => t.id !== 'lunch'), 0).estimate, 600);
  assert.equal(totalsOf(day, 0).estimate, 600);
});

test('free time cut out of a shift lowers it (D3); what is inside is still not added', () => {
  const day = [...nurse(), T('gap', '15:00', 30, { cutsBelow: true })];
  assert.equal(totalsOf(day, 0).estimate, 570, '10h less 30 minutes of free time');
  const inGap = [...day, T('tea', '15:00', 15)];
  assert.equal(totalsOf(inGap, 0).estimate, 585, 'a task inside the free time belongs to it and counts in full');
});

test('a block inside counts on its own when the shift does not count', () => {
  const day = nurse();
  const shiftDone = day.map((t) => (t.id === 'shift' ? { ...t, completed: true } : t));
  assert.equal(plannedText(shiftDone), '5h planned', 'the shift is done: what is still to do inside it counts');
  const doneItems = day.map((t) => (t.id === 'shift' ? t : { ...t, completed: true, completedAt: `${DAY}T19:00:00.000Z` }));
  assert.equal(timeCard(doneItems, { start: DAY, end: DAY }).estimated, 300, 'Analytics: the items are done, the shift is not');
  assert.equal(totalsOf(day.filter((t) => t.id !== 'shift'), 0).estimate, 300, 'without the shift in the list');
});

test('partial overlaps and the same span both count; another day and deleted blocks are left alone', () => {
  assert.equal(totalsOf([T('a', '08:00', 240), T('b', '11:00', 120)], 0).estimate, 360, 'partly overlapping: both count');
  assert.equal(totalsOf([T('a', '09:00', 60), T('b', '09:00', 60)], 0).estimate, 120, 'the same span: both count');
  assert.equal(totalsOf([T('a', '08:00', 240), T('b', '09:00', 60, { dueDate: '2026-11-13' })], 0).estimate, 300);
  assert.equal(totalsOf([T('a', '08:00', 240), T('b', '09:00', 60, { deletedAt: '2026-11-12T00:00:00.000Z' })], 0).estimate, 240);
  assert.equal(totalsOf([T('a', '08:00', 240), T('b', undefined, 60)], 0).estimate, 300, 'no time: not inside anything');
});

test('a task with several times: only the time inside the shift is taken off', () => {
  const pill = T('pill', '09:00', 15, { extraTimes: ['20:00'] });
  const by = nestedMinutesBy([T('shift', '08:00', 600), pill]);
  assert.equal(by.get(pill), 15);
  assert.equal(totalsOf([T('shift', '08:00', 600), pill], 0).estimate, 615);
});
