// Run with `npm test` from mobile/ (Node 26 runs .ts natively; the explicit
// .ts imports below are required by Node).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TASK_MINUTES,
  GRID_HEIGHT_PX,
  MIN_BLOCK_PX,
  PX_PER_HOUR,
  formatMinutes,
  layoutItems,
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

test('layout: top and height from times, one px per minute constant', () => {
  const { blocks, outside } = layoutItems([item('a', at(9), at(10, 30))]);
  assert.deepEqual(outside, []);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].top, (3 / 1) * PX_PER_HOUR); // 09:00 is 3h after 06:00
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

test('clamp: an item starting before 06:00 is clipped to the top', () => {
  const { blocks, outside } = layoutItems([item('a', at(5, 15), at(6, 30))]);
  assert.deepEqual(outside, []);
  assert.equal(blocks[0].startMin, at(6));
  assert.equal(blocks[0].top, 0);
  assert.equal(blocks[0].height, 0.5 * PX_PER_HOUR);
});

test('clamp: an item ending after 23:00 is clipped to the bottom', () => {
  const { blocks } = layoutItems([item('a', at(22, 30), at(23, 45))]);
  assert.equal(blocks[0].endMin, at(23));
  assert.equal(blocks[0].top + blocks[0].height, GRID_HEIGHT_PX);
});

test('clamp: crossing midnight (end before start) runs to the bottom of the grid', () => {
  const { blocks } = layoutItems([item('a', at(22), at(0, 30))]);
  assert.equal(blocks[0].startMin, at(22));
  assert.equal(blocks[0].endMin, at(23));
  assert.equal(normalizeRange(at(22), at(0, 30)).endMin, 24 * 60);
});

test('items completely outside the visible hours are reported, not dropped', () => {
  const { blocks, outside } = layoutItems([
    item('late', at(23, 30), at(23, 59)),
    item('early', at(5, 15), at(6)),
    item('exactly-23', at(23), at(23, 30)),
    item('ok', at(8), at(9)),
  ]);
  assert.deepEqual(blocks.map((b) => b.id), ['ok']);
  assert.deepEqual(outside, ['early', 'exactly-23', 'late']);
});

test('an end equal to the start is treated as running to midnight, not a zero height block', () => {
  const { blocks } = layoutItems([item('a', at(20), at(20))]);
  assert.equal(blocks[0].endMin, at(23));
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
  assert.equal(taskToItem({ ...base, startTime: '23:30', durationMinutes: 120 })!.endMin, 24 * 60);
  assert.equal(taskToItem({ ...base, startTime: '09:00', durationMinutes: 0 })!.endMin, at(9, 30));
});

test('totalScheduledMinutes counts the union of ranges', () => {
  assert.equal(totalScheduledMinutes([]), 0);
  assert.equal(totalScheduledMinutes([item('a', at(9), at(10))]), 60);
  assert.equal(totalScheduledMinutes([item('a', at(9), at(11)), item('b', at(10), at(12))]), 180);
  assert.equal(totalScheduledMinutes([item('a', at(9), at(10)), item('b', at(10), at(11))]), 120);
  assert.equal(totalScheduledMinutes([item('a', at(9), at(13)), item('b', at(10), at(11))]), 240);
  assert.equal(totalScheduledMinutes([item('a', at(9), at(10)), item('b', at(14), at(15, 30))]), 150);
  // Time outside the visible hours still counts.
  assert.equal(totalScheduledMinutes([item('a', at(5), at(6))]), 60);
});

test('formatMinutes', () => {
  assert.equal(formatMinutes(0), '0m');
  assert.equal(formatMinutes(45), '45m');
  assert.equal(formatMinutes(120), '2h');
  assert.equal(formatMinutes(390), '6h 30m');
});

test('scrollOffsetFor keeps the current hour near the top and never goes negative', () => {
  assert.equal(scrollOffsetFor(at(3)), 0);
  assert.equal(scrollOffsetFor(at(6)), 0);
  assert.equal(scrollOffsetFor(at(7)), 0);
  assert.equal(scrollOffsetFor(at(10)), 3 * PX_PER_HOUR);
  assert.equal(scrollOffsetFor(at(14, 30)), 7.5 * PX_PER_HOUR);
});
