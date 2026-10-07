// Run with `npm test` from mobile/ (Node 26 runs .ts natively; the explicit
// .ts imports below are required by Node).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTINUATION_PREFIX,
  DEFAULT_TASK_MINUTES,
  GRID_END_HOUR,
  GRID_HEIGHT_PX,
  GRID_START_HOUR,
  MIN_BLOCK_PX,
  PX_PER_HOUR,
  continuationOf,
  formatMinutes,
  hourLabel,
  layoutItems,
  minutesPastMidnight,
  normalizeRange,
  scrollOffsetFor,
  taskToItem,
  toMinutes,
  toTime,
  totalScheduledMinutes,
  type TimeboxItem,
} from './timebox.ts';
import type { Task } from './types.ts';

const at = (h: number, m = 0) => h * 60 + m;
const item = (id: string, start: number, end: number): TimeboxItem => ({ id, startMin: start, endMin: end });

test('toMinutes and toTime', () => {
  assert.equal(toMinutes('06:00'), 360);
  assert.equal(toMinutes('23:59'), 1439);
  assert.equal(toMinutes('00:00'), 0);
  for (const bad of ['24:00', '9:00', '09:60', '', 'noon', null, undefined, 900]) {
    assert.equal(toMinutes(bad), null, `should reject ${String(bad)}`);
  }
  assert.equal(toTime(0), '00:00');
  assert.equal(toTime(555), '09:15');
  assert.equal(toTime(1440), '23:59');
  assert.equal(toTime(-5), '00:00');
});

test('the Timebox is the whole day: 00:00 to 24:00, hourly labels', () => {
  assert.equal(GRID_START_HOUR, 0);
  assert.equal(GRID_END_HOUR, 24);
  assert.equal(GRID_HEIGHT_PX, 24 * PX_PER_HOUR);
  assert.equal(hourLabel(0), '00:00');
  assert.equal(hourLabel(9), '09:00');
  assert.equal(hourLabel(24), '24:00');
  const labels = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR + 1 }, (_, i) => hourLabel(GRID_START_HOUR + i));
  assert.equal(labels.length, 25);
  assert.equal(labels[0], '00:00');
  assert.equal(labels[24], '24:00');
});

test('layout: top and height from times, one px per minute constant', () => {
  const { blocks } = layoutItems([item('a', at(9), at(10, 30))]);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].top, 9 * PX_PER_HOUR); // 09:00 is 9h after 00:00
  assert.equal(blocks[0].height, 1.5 * PX_PER_HOUR);
  assert.equal(blocks[0].col, 0);
  assert.equal(blocks[0].cols, 1);
});

test('layout: very short items get a minimum height', () => {
  const { blocks } = layoutItems([item('a', at(9), at(9, 5))]);
  assert.equal(blocks[0].height, MIN_BLOCK_PX);
});

test('layout: overlapping items sit side by side', () => {
  const { blocks } = layoutItems([item('a', at(9), at(11)), item('b', at(10), at(12))]);
  const a = blocks.find((b) => b.id === 'a')!;
  const b = blocks.find((x) => x.id === 'b')!;
  assert.equal(a.cols, 2);
  assert.equal(b.cols, 2);
  assert.notEqual(a.col, b.col);
});

test('layout: back to back items do not overlap', () => {
  const { blocks } = layoutItems([item('a', at(9), at(10)), item('b', at(10), at(11))]);
  assert.deepEqual(blocks.map((b) => [b.col, b.cols]), [[0, 1], [0, 1]]);
});

test('layout: a chain reuses the free column and the cluster shares one width', () => {
  const { blocks } = layoutItems([
    item('a', at(9), at(11)),
    item('b', at(10), at(12)),
    item('c', at(11), at(13)),
  ]);
  const byId = Object.fromEntries(blocks.map((b) => [b.id, b]));
  assert.equal(byId.a.col, 0);
  assert.equal(byId.b.col, 1);
  assert.equal(byId.c.col, 0); // a has ended by 11:00
  assert.deepEqual([byId.a.cols, byId.b.cols, byId.c.cols], [2, 2, 2]);
});

test('layout: separate clusters keep their own widths', () => {
  const { blocks } = layoutItems([
    item('a', at(8), at(9)),
    item('b', at(8, 30), at(9, 30)),
    item('c', at(14), at(15)),
  ]);
  const byId = Object.fromEntries(blocks.map((b) => [b.id, b]));
  assert.equal(byId.a.cols, 2);
  assert.equal(byId.c.cols, 1);
});

test('layout: three way overlap uses three columns', () => {
  const { blocks } = layoutItems([item('a', at(9), at(12)), item('b', at(9, 30), at(11)), item('c', at(10), at(10, 30))]);
  assert.deepEqual(blocks.map((b) => b.cols), [3, 3, 3]);
  assert.deepEqual(new Set(blocks.map((b) => b.col)).size, 3);
});

test('layout: input order does not matter', () => {
  const one = layoutItems([item('a', at(9), at(11)), item('b', at(10), at(12))]);
  const two = layoutItems([item('b', at(10), at(12)), item('a', at(9), at(11))]);
  assert.deepEqual(one.blocks, two.blocks);
});

test('early morning and late night items are drawn where they are (no hidden hours)', () => {
  const { blocks } = layoutItems([item('early', at(5, 15), at(6, 30)), item('late', at(23, 30), at(23, 59)), item('midnight', at(0), at(0, 30))]);
  assert.equal(blocks.length, 3);
  const byId = Object.fromEntries(blocks.map((b) => [b.id, b]));
  assert.equal(byId.early.top, (5.25) * PX_PER_HOUR);
  assert.equal(byId.midnight.top, 0);
  assert.equal(byId.late.top, 23.5 * PX_PER_HOUR);
  assert.equal(byId.early.continues, false);
});

test('an item running past 24:00 is drawn to the bottom and marked as continuing', () => {
  const { blocks } = layoutItems([item('a', at(22), at(22) + 8 * 60)]);
  assert.equal(blocks[0].startMin, at(22));
  assert.equal(blocks[0].endMin, at(24));
  assert.equal(blocks[0].top + blocks[0].height, GRID_HEIGHT_PX);
  assert.equal(blocks[0].continues, true);
});

test('an item ending exactly at 24:00 does not continue', () => {
  const { blocks } = layoutItems([item('a', at(22), at(24))]);
  assert.equal(blocks[0].continues, false);
  assert.equal(blocks[0].top + blocks[0].height, GRID_HEIGHT_PX);
});

test('crossing midnight (end before start) runs to 24:00 and continues', () => {
  const { blocks } = layoutItems([item('a', at(22), at(0, 30))]);
  assert.equal(blocks[0].endMin, at(24));
  assert.equal(blocks[0].continues, true);
  assert.equal(normalizeRange(at(22), at(0, 30)).endMin, 24 * 60);
});

test('an end equal to the start is treated as running to midnight, not a zero height block', () => {
  const { blocks } = layoutItems([item('a', at(20), at(20))]);
  assert.equal(blocks[0].endMin, at(24));
});

test('minutesPastMidnight: how much of a task is left for the next day', () => {
  assert.equal(minutesPastMidnight(at(22), 8 * 60), 6 * 60);
  assert.equal(minutesPastMidnight(at(22), 2 * 60), 0);
  assert.equal(minutesPastMidnight(at(22), 2 * 60 + 1), 1);
  assert.equal(minutesPastMidnight(at(23, 30), 24 * 60), at(23, 30));
  assert.equal(minutesPastMidnight(at(0), 24 * 60), 0);
  assert.equal(minutesPastMidnight(at(9), 30), 0);
});

test('continuationOf: a task at 22:00 for 8 hours leaves 06:00 for the next day', () => {
  const t: Task = { id: 'night', title: 'Night', completed: false, createdAt: '', updatedAt: '', dueDate: '2026-10-07', startTime: '22:00', durationMinutes: 480 };
  assert.deepEqual(continuationOf(t), { id: `${CONTINUATION_PREFIX}night`, startMin: 0, endMin: 360 });
  // The day's own block still shows the full item, ending after midnight
  assert.deepEqual(taskToItem(t), { id: 'night', startMin: at(22), endMin: at(22) + 480 });
});

test('continuationOf: nothing when the task ends by 24:00, has no time, or has no duration past midnight', () => {
  const base: Task = { id: 'a', title: 'A', completed: false, createdAt: '', updatedAt: '', dueDate: '2026-10-07' };
  assert.equal(continuationOf(base), null);
  assert.equal(continuationOf({ ...base, startTime: '22:00', durationMinutes: 120 }), null);
  assert.equal(continuationOf({ ...base, startTime: '23:30' }), null); // the 30 minute default ends at 24:00
  assert.equal(continuationOf({ ...base, startTime: '23:45' })!.endMin, 15); // default 30 minutes: 15 past midnight
  assert.equal(continuationOf({ ...base, startTime: '23:30', durationMinutes: 1440 })!.endMin, at(23, 30));
  assert.equal(continuationOf({ ...base, startTime: '00:00', durationMinutes: 1440 }), null);
});

test('a continuation is counted in the scheduled total of the next day and shares width with what is there', () => {
  const rest = { id: 'cont:night', startMin: 0, endMin: 360 };
  assert.equal(totalScheduledMinutes([rest, item('b', at(5), at(7))]), 420);
  const { blocks } = layoutItems([rest, item('b', at(5), at(7))]);
  assert.deepEqual(blocks.map((b) => b.cols), [2, 2]);
  assert.equal(blocks.find((b) => b.id === 'cont:night')!.top, 0);
});

test('taskToItem: needs a valid startTime, defaults to 30 minutes, caps at midnight', () => {
  const base: Task = { id: 't', title: 'x', completed: false, createdAt: '', updatedAt: '' };
  assert.equal(taskToItem(base), null);
  assert.equal(taskToItem({ ...base, startTime: 'later' }), null);
  assert.deepEqual(taskToItem({ ...base, startTime: '09:00' }), {
    id: 't', startMin: at(9), endMin: at(9) + DEFAULT_TASK_MINUTES,
  });
  assert.deepEqual(taskToItem({ ...base, startTime: '09:00', durationMinutes: 120 }), {
    id: 't', startMin: at(9), endMin: at(11),
  });
  // The end is not capped at midnight: the next day shows the rest.
  assert.equal(taskToItem({ ...base, startTime: '23:30', durationMinutes: 120 })!.endMin, at(23, 30) + 120);
  assert.equal(taskToItem({ ...base, startTime: '09:00', durationMinutes: 0 })!.endMin, at(9, 30));
});

test('totalScheduledMinutes counts the union of ranges', () => {
  assert.equal(totalScheduledMinutes([]), 0);
  assert.equal(totalScheduledMinutes([item('a', at(9), at(10))]), 60);
  assert.equal(totalScheduledMinutes([item('a', at(9), at(11)), item('b', at(10), at(12))]), 180);
  assert.equal(totalScheduledMinutes([item('a', at(9), at(10)), item('b', at(10), at(11))]), 120);
  assert.equal(totalScheduledMinutes([item('a', at(9), at(13)), item('b', at(10), at(11))]), 240);
  assert.equal(totalScheduledMinutes([item('a', at(9), at(10)), item('b', at(14), at(15, 30))]), 150);
  // Early morning counts like any other time.
  assert.equal(totalScheduledMinutes([item('a', at(5), at(6))]), 60);
  // Only the part of the day itself counts: an overnight item counts to 24:00.
  assert.equal(totalScheduledMinutes([item('a', at(22), at(22) + 480)]), 120);
});

test('formatMinutes', () => {
  assert.equal(formatMinutes(0), '0m');
  assert.equal(formatMinutes(45), '45m');
  assert.equal(formatMinutes(120), '2h');
  assert.equal(formatMinutes(390), '6h 30m');
});

test('scrollOffsetFor puts a time at the top and never goes negative', () => {
  assert.equal(scrollOffsetFor(0), 0);
  assert.equal(scrollOffsetFor(-60), 0);
  assert.equal(scrollOffsetFor(at(5)), 5 * PX_PER_HOUR);
  assert.equal(scrollOffsetFor(at(20)), 20 * PX_PER_HOUR);
  assert.equal(scrollOffsetFor(at(14, 30)), 14.5 * PX_PER_HOUR);
});
