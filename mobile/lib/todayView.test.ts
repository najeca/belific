// Run with `npm test` from mobile/. The phone's Today (PLAN_phone P4).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildToday, itemTitle, type TodayItem } from './todayView.ts';
import type { Routine, ScheduleEvent, Task } from './types.ts';

const TODAY = '2026-10-22'; // a Thursday
const T = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, completed: false, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', dueDate: TODAY, ...extra });
const keys = (items: TodayItem[]) => items.map((i) => i.key);
const routine = (id: string, timeOfDay: Routine['timeOfDay'], extra: Partial<Routine> = {}): Routine => ({ id, title: `R ${id}`, timeOfDay, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', ...extra });
const event = (id: string, start: string, end: string): ScheduleEvent => ({ id, title: `E ${id}`, category: 'x', icon: '📌', color: '#888888', start, end, notes: '', isCustom: true });

test('only today: timed tasks in time order, untimed in Anytime with top priority first', () => {
  const v = buildToday({
    tasks: [
      T('late', { startTime: '15:00' }),
      T('early', { startTime: '08:30', durationMinutes: 45 }),
      T('free'),
      T('urgent', { priority: 'high', createdAt: '2026-10-05T00:00:00.000Z' }),
      T('tomorrow', { dueDate: '2026-10-23', startTime: '09:00' }),
      T('noday', { dueDate: undefined }),
      T('gone', { deletedAt: '2026-10-20T00:00:00.000Z' }),
    ],
    todayKey: TODAY,
    nowMin: 7 * 60,
  });
  assert.deepEqual(keys(v.timed), ['early', 'late']);
  assert.deepEqual(keys(v.anytime), ['urgent', 'free']);
  assert.equal(v.done.length, 0);
});

test('a ticked task leaves the list for Done today; a repeating series shows today projected, once', () => {
  const v = buildToday({
    tasks: [
      T('done', { completed: true, startTime: '09:00' }),
      T('walk', { dueDate: '2026-10-20', recurrence: 'daily', startTime: '07:00' }),
    ],
    todayKey: TODAY,
    nowMin: 6 * 60,
  });
  assert.deepEqual(keys(v.done), ['done']);
  const walk = v.timed.filter((i) => i.kind === 'task' && i.task.title === 'walk');
  assert.equal(walk.length, 1, 'one projected occurrence for today');
  assert.ok(walk[0].kind === 'task' && walk[0].projected && walk[0].task.dueDate === TODAY);
});

test('a task with several times is one item per time; a done time goes to Done today', () => {
  const v = buildToday({ tasks: [T('brk', { startTime: '11:00', durationMinutes: 20, extraTimes: ['15:00'], timesDone: ['11:00'] })], todayKey: TODAY, nowMin: 12 * 60 });
  assert.deepEqual(keys(v.timed), ['brk@15:00']);
  assert.deepEqual(keys(v.done), ['brk']);
  const later = v.timed[0];
  assert.ok(later.kind === 'task' && later.time === '15:00' && later.multi);
});

test('old events are timed, read only items among the tasks (decision 4)', () => {
  const v = buildToday({ tasks: [T('a', { startTime: '09:00' })], events: [event('e1', '08:00', '08:30'), event('e2', '09:00', '10:00')], todayKey: TODAY, nowMin: 0 });
  assert.deepEqual(keys(v.timed), ['event:e1', 'a', 'event:e2'], 'a task before an event at the same minute');
});

test('routines not converted sit at the top of Anytime, morning first; a converted routine never shows twice', () => {
  const v = buildToday({
    tasks: [T('x'), T('rt_r3:2026-10-22', { title: 'R r3 as a series', recurrence: 'daily', dueDate: '2026-10-22' })],
    routines: [routine('r1', 'evening'), routine('r2', 'morning'), routine('r3', 'morning'), routine('r4', 'afternoon', { deletedAt: '2026-10-02T00:00:00.000Z' })],
    routinesDone: new Set(['r1']),
    todayKey: TODAY,
    nowMin: 0,
  });
  assert.deepEqual(keys(v.anytime), ['routine:r2', 'rt_r3:2026-10-22', 'x'], 'r3 is a series now (same age as x, so by title); r4 is deleted; r1 is done');
  assert.deepEqual(keys(v.done), ['routine:r1']);
});

test('Now is the timed item under way; Next the first one after now; done items never count', () => {
  const tasks = [T('a', { startTime: '09:00', durationMinutes: 60 }), T('b', { startTime: '11:00' }), T('c', { startTime: '09:30', completed: true })];
  const v = buildToday({ tasks, todayKey: TODAY, nowMin: 9 * 60 + 40 });
  assert.equal(v.now?.key, 'a');
  assert.equal(v.next?.key, 'b');
  const later = buildToday({ tasks, todayKey: TODAY, nowMin: 12 * 60 });
  assert.equal(later.now, null);
  assert.equal(later.next, null);
  assert.equal(itemTitle(v.timed[0]), 'a');
});
