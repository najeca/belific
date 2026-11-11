import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allDaysOf, bladeCheck, bladeSpan, bladeTask, hostAt, snap5, type BladeHost } from './blade.ts';
import type { Task } from './types.ts';

const m = (h: number, mm = 0) => h * 60 + mm;
const camp: BladeHost = { id: 'task:camp', startMin: m(9, 30), endMin: m(16, 30), title: 'Boot Camp', task: { id: 'camp', title: 'Boot Camp' } as Task, repeats: true };

test('snap5: the nearest 5 minutes, kept on the day', () => {
  assert.equal(snap5(m(11, 2)), m(11));
  assert.equal(snap5(m(11, 3)), m(11, 5));
  assert.equal(snap5(-12), 0);
  assert.equal(snap5(m(24, 10)), m(24));
});

test('bladeSpan: either order, at least 5 minutes, clamped to the day and to the task under it', () => {
  assert.deepEqual(bladeSpan(m(11), m(11, 20)), [m(11), m(11, 20)]);
  assert.deepEqual(bladeSpan(m(11, 20), m(11)), [m(11), m(11, 20)], 'end first');
  assert.deepEqual(bladeSpan(m(11), m(11)), [m(11), m(11, 5)], 'a click and the same click: 5 minutes');
  assert.deepEqual(bladeSpan(m(9), m(10), camp), [m(9, 30), m(10)], 'not before the task');
  assert.deepEqual(bladeSpan(m(16, 30), m(16, 30), camp), [m(16, 25), m(16, 30)], 'at the very end it keeps 5 minutes inside');
  assert.deepEqual(bladeSpan(m(23, 58), m(24)), [m(23, 55), m(24)]);
  assert.equal(bladeSpan(m(10), m(10), { startMin: m(10), endMin: m(10, 3) }), null, 'no 5 minutes of room');
});

test('hostAt: the timed task under the point, the shortest of two', () => {
  const call: BladeHost = { ...camp, id: 'task:call', startMin: m(14), endMin: m(14, 30), title: 'Call' };
  assert.equal(hostAt([camp, call], m(11))?.id, 'task:camp');
  assert.equal(hostAt([camp, call], m(14, 10))?.id, 'task:call');
  assert.equal(hostAt([camp, call], m(16, 30)), null, 'the end is not inside');
});

test('bladeCheck (D3): a cut that leaves a piece under the minimum is refused, with the reason', () => {
  assert.equal(bladeCheck([m(11), m(11, 20)], camp, [], 30), null);
  assert.equal(bladeCheck([m(9, 40), m(10)], camp, [], 30), 'A piece would be 10 min (min 30)');
  assert.equal(bladeCheck([m(9, 30), m(16, 30)], camp, [], 30), 'It would cover all of the task');
  assert.equal(bladeCheck([m(9, 40), m(10)], null, [], 30), null, 'on empty grid there is nothing to refuse');
  // The day's other breaks count: with 11:00 to 11:20 already a gap, 11:30 to 12:00 would leave 10 minutes between.
  const short1 = { id: 'task:short1', startMin: m(11), endMin: m(11, 20), breaks: true };
  assert.equal(bladeCheck([m(11, 30), m(12)], camp, [short1], 30), 'A piece would be 10 min (min 30)');
  assert.equal(bladeCheck([m(12, 30), m(13, 30)], camp, [short1], 30), null);
  assert.equal(bladeCheck([m(9, 40), m(10)], camp, [], 15), 'A piece would be 10 min (min 15)', 'the setting is used');
});

test('bladeTask: this day only, or the task\'s repeat rule for all days', () => {
  const rule = { recurrence: 'weekly', recurrenceDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] } as Pick<Task, 'recurrence' | 'recurrenceDays'>;
  assert.deepEqual(bladeTask([m(11), m(11, 20)], '2026-11-10', 'day', rule), { title: 'Break', cutsBelow: true, dueDate: '2026-11-10', startTime: '11:00', durationMinutes: 20 });
  assert.deepEqual(bladeTask([m(11), m(11, 20)], '2026-11-10', 'all', rule), { title: 'Break', cutsBelow: true, dueDate: '2026-11-10', startTime: '11:00', durationMinutes: 20, recurrence: 'weekly', recurrenceDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] });
  assert.deepEqual(bladeTask([m(15), m(15, 20)], '2026-11-10', 'all', { recurrence: 'monthly', recurrenceMonthDay: 10 } as Task), { title: 'Break', cutsBelow: true, dueDate: '2026-11-10', startTime: '15:00', durationMinutes: 20, recurrence: 'monthly', recurrenceMonthDay: 10 });
  assert.equal(bladeTask([m(11), m(11, 20)], '2026-11-10', 'all', null).recurrence, undefined, 'no task under it: a one off');
  assert.equal(allDaysOf('Boot Camp'), 'All days of Boot Camp');
});
