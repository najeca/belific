// Run with `npm test` from mobile/. D6 of PLAN_desktop_parity (3.68.0): the desktop's one screen Plan my day, Wrap up and
// Plan week show the sets the phone's queues ask, from the same functions (planQueue.ts, wrapQueue.ts, weekQueue.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { planEarlierItems, planListItems, planQueue, planTodayItems } from './planQueue.ts';
import { wrapDayItems, wrapQueue } from './wrapQueue.ts';
import { weekEarlierItems, weekListItems, weekQueue } from './weekQueue.ts';
import type { Task, TaskList } from './types.ts';

const TODAY = '2026-11-18';
const STAMP = '2026-11-01T00:00:00.000Z';
const T = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, completed: false, createdAt: STAMP, updatedAt: STAMP, ...extra });
const LISTS: TaskList[] = [{ key: 'work', name: 'Work', sortOrder: 0, createdAt: STAMP, updatedAt: STAMP }];
const RAW = [
  T('dump'),
  T('w', { listKey: 'work' }),
  T('old', { dueDate: '2026-11-16' }),
  T('free', { dueDate: TODAY }),
  T('timed', { dueDate: TODAY, startTime: '09:00', durationMinutes: 30 }),
  T('fin', { dueDate: TODAY, completed: true }),
];
const ids = (xs: { task: Task }[]) => xs.map((x) => x.task.id);

test('Plan my day: the phone asks the open untimed rows of the desktop On today, then its Earlier, then its list rows', () => {
  const q = planQueue(RAW, TODAY, LISTS, 30);
  const onToday = planTodayItems(RAW, TODAY, TODAY, 30);
  assert.deepEqual(ids(q.filter((s) => s.source === 'today').map((s) => s.item)), ids(onToday.filter((i) => !i.done && !i.task.startTime)));
  assert.deepEqual(ids(q.filter((s) => s.source === 'earlier').map((s) => s.item)), ids(planEarlierItems(RAW, TODAY)));
  assert.deepEqual(ids(q.filter((s) => s.source === 'list').map((s) => s.item)), [...ids(planListItems(RAW, undefined, LISTS)), ...ids(planListItems(RAW, 'work', LISTS))]);
});

test('Wrap up: the phone asks the open rows of the desktop screen', () => {
  const all = wrapDayItems(RAW, TODAY, TODAY, 30);
  assert.ok(ids(all).includes('fin'), 'the desktop shows done rows too');
  assert.deepEqual(ids(wrapQueue(RAW, TODAY, 30)), ids(all.filter((i) => !i.done)));
});

test('Plan week: the phone asks last week, then the desktop list rows', () => {
  const q = weekQueue(RAW, TODAY, LISTS);
  assert.deepEqual(ids(q.map((s) => s.item)), [...ids(weekEarlierItems(RAW, TODAY)), ...ids(weekListItems(RAW, undefined, LISTS)), ...ids(weekListItems(RAW, 'work', LISTS))]);
});
