// Run with `npm test` from mobile/. The phone's Week and Month views (PLAN_phone P9).
import test from 'node:test';
import assert from 'node:assert/strict';
import { dayItems, shortTitle } from './phoneWeek.ts';
import type { ScheduleEvent, Task } from './types.ts';

const DAY = '2026-10-22';
const T = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, completed: false, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', dueDate: DAY, ...extra });

test('a day lists all day tasks first, then timed items in time order; done ones are kept and marked', () => {
  const ev: ScheduleEvent = { id: 'e', title: 'Gym', category: 'x', icon: '🏋️', color: '#888', start: '13:00', end: '14:00', notes: '', isCustom: true };
  const items = dayItems({
    tasks: [T('late', { startTime: '18:00' }), T('free'), T('top', { priority: 'high' }), T('early', { startTime: '08:00', completed: true }), T('other', { dueDate: '2026-10-23' }), T('walk', { dueDate: '2026-10-20', startTime: '07:00', recurrence: 'daily' })],
    events: [ev],
    dayKey: DAY,
    todayKey: DAY,
  });
  assert.deepEqual(
    items.map((i) => i.key),
    ['task:top', 'task:free', 'task:walk:2026-10-22', 'task:early', 'event:e', 'task:late'],
  );
  assert.equal(items.find((i) => i.key === 'task:early')?.done, true);
});

test('a short title is the first word or two, without emoji, within the width', () => {
  assert.equal(shortTitle('🏃 Morning run in the park'), 'Morning');
  assert.equal(shortTitle('Gym class'), 'Gym class');
  assert.equal(shortTitle('Extraordinarily long word'), 'Extraord…');
  assert.equal(shortTitle(''), '');
});
