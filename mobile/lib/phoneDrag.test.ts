// Run with `npm test` from mobile/. Dragging a block on the phone's Day timeline (PLAN_phone P10).
import test from 'node:test';
import assert from 'node:assert/strict';
import { draggedStart, phoneDropPatch } from './phoneDrag.ts';
import { PX_PER_HOUR } from './timebox.ts';
import type { Task } from './types.ts';

const TODAY = '2026-10-22';
const T = (extra: Partial<Task> = {}): Task => ({ id: 't', title: 't', completed: false, createdAt: 'x', updatedAt: 'x', dueDate: TODAY, startTime: '09:00', durationMinutes: 60, ...extra });

test('a drag moves in 15 minute steps, inside the day', () => {
  assert.equal(draggedStart(540, PX_PER_HOUR, PX_PER_HOUR, 60), 600, 'an hour down');
  assert.equal(draggedStart(540, 6, PX_PER_HOUR, 60), 540, 'about 6 minutes: still 9:00 (to the nearest quarter)');
  assert.equal(draggedStart(540, 10, PX_PER_HOUR, 60), 555, 'about 11 minutes: 9:15');
  assert.equal(draggedStart(30, -3 * PX_PER_HOUR, PX_PER_HOUR, 60), 0, 'never before midnight');
  assert.equal(draggedStart(1300, 5 * PX_PER_HOUR, PX_PER_HOUR, 60), 1380, 'an hour long task ends by 24:00');
});

test('a task of one time moves to the new start on its day', () => {
  assert.deepEqual(phoneDropPatch({ task: T(), multi: false, projected: false, dayKey: TODAY, startMin: 615, todayKey: TODAY }), { fields: { dueDate: TODAY, startTime: '10:15', durationMinutes: 60 }, series: false });
  assert.equal(phoneDropPatch({ task: T(), multi: false, projected: false, dayKey: TODAY, startMin: 540, todayKey: TODAY }), null, 'dropped where it was');
});

test('a projected repeating day moves the series time, never its day', () => {
  const walk = T({ id: 'walk:2026-10-23', dueDate: '2026-10-23', recurrence: 'daily', startTime: '07:00', durationMinutes: undefined });
  assert.deepEqual(phoneDropPatch({ task: walk, multi: false, projected: true, dayKey: '2026-10-23', startMin: 450, todayKey: TODAY }), { fields: { startTime: '07:30', durationMinutes: 30 }, series: true });
});

test('one time of a task with several times moves alone; an overlap is refused with a note', () => {
  const brk = T({ startTime: '11:00', durationMinutes: 20, extraTimes: ['15:00'] });
  const moved = phoneDropPatch({ task: brk, time: '15:00', multi: true, projected: false, dayKey: TODAY, startMin: 16 * 60, todayKey: TODAY });
  assert.ok(moved && 'fields' in moved && moved.fields.startTime === '11:00' && JSON.stringify(moved.fields.extraTimes) === '["16:00"]', JSON.stringify(moved));
  const clash = phoneDropPatch({ task: brk, time: '15:00', multi: true, projected: false, dayKey: TODAY, startMin: 11 * 60 + 15, todayKey: TODAY });
  assert.ok(clash && 'note' in clash, JSON.stringify(clash));
});

test('never onto a past day', () => {
  const past = T({ dueDate: '2026-10-21' });
  assert.equal(phoneDropPatch({ task: past, multi: false, projected: false, dayKey: '2026-10-21', startMin: 600, todayKey: TODAY }), null);
});
