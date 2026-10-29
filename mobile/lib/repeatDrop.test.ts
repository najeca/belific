import test from 'node:test';
import assert from 'node:assert/strict';
import { isUndatedRepeating, repeatDropHint, repeatDropRefusal, startedOn } from './repeatDrop.ts';
import { resolveRepeat } from './repeat.ts';
import type { Task } from './types.ts';

// 2026-10-29 is a Thursday.
const zone: Pick<Task, 'recurrence' | 'recurrenceDays' | 'recurrenceMonthDay' | 'dueDate'> = { recurrence: 'weekly', recurrenceDays: ['Mon', 'Thu'] };

test('3.18.1: only a repeating task with no Day is dropped as a series start', () => {
  assert.equal(isUndatedRepeating({ recurrence: 'weekly' }), true);
  assert.equal(isUndatedRepeating({ recurrence: 'weekly', dueDate: '2026-10-29' }), false);
  assert.equal(isUndatedRepeating({}), false);
});

test('3.18.1: a drop on a repeat day is allowed, on any other day it is refused with the hint', () => {
  assert.equal(repeatDropRefusal(zone, '2026-10-29', '2026-10-29'), null, 'Thursday');
  assert.equal(repeatDropRefusal(zone, '2026-11-02', '2026-10-29'), null, 'Monday');
  assert.equal(repeatDropRefusal(zone, '2026-10-30', '2026-10-29'), 'Drop on a repeat day (Mon, Thu) or change the repeat', 'Friday');
  assert.equal(repeatDropHint(zone, '2026-10-29'), 'Drop on a repeat day (Mon, Thu) or change the repeat');
});

test('3.18.1: every N weeks counts from the day it starts on, so any of its weekdays may start it', () => {
  const every2: typeof zone = { recurrence: 'biweekly', recurrenceDays: ['Tue'] };
  assert.equal(repeatDropRefusal(every2, '2026-11-03', '2026-10-29'), null);
  assert.equal(repeatDropRefusal(every2, '2026-11-04', '2026-10-29'), 'Drop on a repeat day (Tue) or change the repeat');
});

test('3.18.1: daily and yearly start anywhere; monthly only on its month day', () => {
  assert.equal(repeatDropRefusal({ recurrence: 'daily' }, '2026-11-05', '2026-10-29'), null);
  assert.equal(repeatDropRefusal({ recurrence: 'annual' }, '2026-11-05', '2026-10-29'), null);
  const monthly: typeof zone = { recurrence: 'monthly', recurrenceMonthDay: 15 };
  assert.equal(repeatDropRefusal(monthly, '2026-11-15', '2026-10-29'), null);
  assert.equal(repeatDropRefusal(monthly, '2026-11-16', '2026-10-29'), 'Drop on a repeat day (the 15th) or change the repeat');
  assert.equal(repeatDropRefusal({}, '2026-11-16', '2026-10-29'), null, 'not repeating: nothing to refuse');
});

test('3.18.1: the drop gives the task its Day, nothing else', () => {
  const t: Task = { id: 'z', title: 'Zone 2', completed: false, createdAt: 'a', updatedAt: 'a', recurrence: 'weekly', recurrenceDays: ['Mon', 'Thu'] };
  const s = startedOn(t, '2026-10-29', '2026-10-29T10:00:00.000Z');
  assert.equal(s.dueDate, '2026-10-29');
  assert.equal(s.updatedAt, '2026-10-29T10:00:00.000Z');
  assert.equal(s.startTime, undefined);
  assert.equal(s.recurrence, 'weekly');
});

test('3.18.1: a repeat set on a task with no Day defaults the Day to the first matching repeat day (or today)', () => {
  // Thursday 2026-10-29 today: Mon and Thu -> today; Tue and Fri -> Fri 30; Mon only -> Mon Nov 2.
  assert.equal(resolveRepeat('weekly', ['Mon', 'Thu'], undefined, null, '2026-10-29')?.dueDate, '2026-10-29');
  assert.equal(resolveRepeat('weekly', ['Tue', 'Fri'], undefined, null, '2026-10-29')?.dueDate, '2026-10-30');
  assert.equal(resolveRepeat('weekly', ['Mon'], undefined, null, '2026-10-29')?.dueDate, '2026-11-02');
  assert.equal(resolveRepeat('weekly', ['Mon'], undefined, null, '2026-10-29')?.movedFrom, undefined, 'no "moved" note for a Day nobody chose');
  assert.equal(resolveRepeat('daily', [], undefined, null, '2026-10-29')?.dueDate, '2026-10-29');
  assert.equal(resolveRepeat('monthly', [], undefined, 15, '2026-10-29')?.dueDate, '2026-11-15');
  assert.equal(resolveRepeat('annual', [], undefined, null, '2026-10-29')?.dueDate, '2026-10-29');
  // Not repeating: the Day stays empty. A Day that was chosen is still moved to the first matching day, with the note.
  assert.equal(resolveRepeat('none', [], undefined, null, '2026-10-29')?.dueDate, undefined);
  const moved = resolveRepeat('weekly', ['Mon'], '2026-10-29', null, '2026-10-29');
  assert.equal(moved?.dueDate, '2026-11-02');
  assert.equal(moved?.movedFrom, '2026-10-29');
  // Without a todayKey (the older callers) nothing changes.
  assert.equal(resolveRepeat('weekly', ['Mon'], undefined, null)?.dueDate, undefined);
});
