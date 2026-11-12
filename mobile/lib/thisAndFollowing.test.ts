// Run with `npm test` from mobile/. R3 of PLAN_repeat_end_and_parts: This and following. A change from one day on
// splits the series: the old one ends the day before (nothing deleted, done and past days stay), a new one starts on
// that day with the change and the old end date. Also: All days for free time and items inside starts on the first
// day the block shows from today; This and following on the chosen day.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Task, WeekDay } from './types.ts';
import { firstShownFrom, isGone, planSplit, projectOccurrences, seriesOf } from './series.ts';
import { bladeTask } from './blade.ts';
import { insideTask } from './shifts.ts';

const MON_THU: WeekDay[] = ['Mon', 'Tue', 'Wed', 'Thu'];
const camp = (extra: Partial<Task> = {}): Task => ({
  id: 'camp',
  title: 'Boot camp',
  dueDate: '2026-11-02',
  startTime: '18:00',
  durationMinutes: 60,
  recurrence: 'weekly',
  recurrenceDays: MON_THU,
  completed: false,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  ...extra,
});
const NOW = '2026-11-12T10:00:00.000Z';
const rows = (): Task[] => [
  camp({ completed: true }),
  camp({ id: 'camp:2026-11-11', dueDate: '2026-11-11', completed: true }),
  camp({ id: 'camp:2026-11-17', dueDate: '2026-11-17', notes: 'bring water' }),
];

test('planSplit: the old series ends the day before, the new one starts that day with the change; nothing deleted from the past', () => {
  const plan = planSplit(rows(), '2026-11-16', { startTime: '07:00', title: 'Morning camp' }, NOW, 'camp2')!;
  assert.ok(plan);
  const byId = new Map(plan.writes.map((r) => [r.id, r]));
  assert.equal(byId.get('camp')?.repeatUntil, '2026-11-15');
  assert.equal(byId.get('camp:2026-11-11')?.repeatUntil, '2026-11-15');
  assert.equal(byId.get('camp:2026-11-11')?.completed, true, 'a done day stays with the old series');
  assert.equal(plan.newRoot.id, 'camp2');
  assert.equal(plan.newRoot.dueDate, '2026-11-16');
  assert.equal(plan.newRoot.title, 'Morning camp');
  assert.equal(plan.newRoot.startTime, '07:00');
  assert.equal(plan.newRoot.recurrence, 'weekly');
  assert.deepEqual(plan.newRoot.recurrenceDays, MON_THU);
  assert.equal(plan.newRoot.completed, false);
  // the open stored 17th moves to the new series with its own notes and the change
  const carried = byId.get('camp2:2026-11-17')!;
  assert.equal(carried.notes, 'bring water');
  assert.equal(carried.title, 'Morning camp');
  assert.ok(byId.get('camp:2026-11-17')?.deletedAt, 'the old 17th is replaced, never shown twice');
});

test('after a split: the old days up to the day before, the new days from that day, each day once', () => {
  const plan = planSplit(rows(), '2026-11-16', { title: 'Morning camp' }, NOW, 'camp2')!;
  const byId = new Map(rows().map((r) => [r.id, r]));
  for (const w of plan.writes) byId.set(w.id, w);
  const all = [...byId.values()];
  const days = ['2026-11-12', '2026-11-16', '2026-11-17', '2026-11-18'];
  const shown = [...all.filter((t) => !isGone(t) && days.includes(t.dueDate ?? '')), ...projectOccurrences(all, days, '2026-11-12')];
  const titleOn = (d: string) => shown.filter((t) => t.dueDate === d).map((t) => t.title);
  assert.deepEqual(titleOn('2026-11-12'), ['Boot camp']);
  assert.deepEqual(titleOn('2026-11-16'), ['Morning camp']);
  assert.deepEqual(titleOn('2026-11-17'), ['Morning camp']);
  assert.deepEqual(titleOn('2026-11-18'), ['Morning camp']);
  assert.equal(seriesOf(all, 'camp2')?.startKey, '2026-11-16');
});

test('planSplit keeps the old end date on the new series', () => {
  const ended = rows().map((r) => ({ ...r, repeatUntil: '2026-12-17' }));
  const plan = planSplit(ended, '2026-11-16', { title: 'X' }, NOW, 'camp2')!;
  assert.equal(plan.newRoot.repeatUntil, '2026-12-17');
  assert.equal(plan.writes.find((r) => r.id === 'camp')?.repeatUntil, '2026-11-15');
});

test('planSplit: nothing to split on the first day, a done day, after the end, or with no series', () => {
  assert.equal(planSplit(rows(), '2026-11-02', { title: 'X' }, NOW, 'n'), null, 'the first day: All days instead');
  assert.equal(planSplit(rows(), '2026-11-11', { title: 'X' }, NOW, 'n'), null, 'a done day');
  assert.equal(planSplit(rows().map((r) => ({ ...r, repeatUntil: '2026-11-12' })), '2026-11-16', { title: 'X' }, NOW, 'n'), null);
  assert.equal(planSplit([{ ...camp(), recurrence: undefined }], '2026-11-16', { title: 'X' }, NOW, 'n'), null);
});

test('firstShownFrom: All days starts on the first day the block shows from today up to the chosen day', () => {
  // today Thu 12 Nov; cutting on Wed 18 Nov: All days starts on today (it shows today)
  assert.equal(firstShownFrom(rows(), '2026-11-12', '2026-11-18'), '2026-11-12');
  // today Fri 13 Nov: the next day it shows is Mon 16
  assert.equal(firstShownFrom(rows(), '2026-11-13', '2026-11-18'), '2026-11-16');
  // the chosen day is today: itself
  assert.equal(firstShownFrom(rows(), '2026-11-12', '2026-11-12'), '2026-11-12');
});

test('bladeTask and insideTask: This and following and All days repeat with the block and end with it; This day only does not', () => {
  const host = camp({ repeatUntil: '2026-12-17' });
  for (const scope of ['following', 'all'] as const) {
    const b = bladeTask([1110, 1125], '2026-11-18', scope, host);
    assert.equal(b.recurrence, 'weekly');
    assert.equal(b.repeatUntil, '2026-12-17');
    assert.equal(b.dueDate, '2026-11-18');
    const i = insideTask(host, '2026-11-18', { title: 'Warm up', timed: true, start: '18:00', length: 15, scope });
    assert.equal(i.recurrence, 'weekly');
    assert.equal(i.repeatUntil, '2026-12-17');
  }
  assert.equal(bladeTask([1110, 1125], '2026-11-18', 'day', host).recurrence, undefined);
  assert.equal(insideTask(host, '2026-11-18', { title: 'Warm up', timed: true, start: '18:00', length: 15, scope: 'day' }).recurrence, undefined);
});
