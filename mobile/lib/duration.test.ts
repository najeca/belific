// Run with `npm test` from mobile/. Durations (checkpoint 4.1).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_DURATION,
  MINUTE_OPTIONS,
  QUICK_DURATIONS,
  clampDuration,
  formatDuration,
  isQuickDuration,
  isValidPick,
  joinDuration,
  parseDuration,
  splitDuration,
} from './duration.ts';
import { formatDuration as fromKanban } from './kanban.ts';
import { COMPACT_BLOCK_PX, MIN_BLOCK_PX, PX_PER_HOUR, blockHeightPx, isCompactBlock, layoutItems, taskToItem } from './timebox.ts';
import { clampStart, dropPatch, resizedDuration, taskDuration } from './drag.ts';
import type { Task } from './types.ts';

test('formatting: "1h 30m" and "45m" style, stored legacy values too', () => {
  assert.equal(formatDuration(15), '15m');
  assert.equal(formatDuration(45), '45m');
  assert.equal(formatDuration(90), '1h 30m');
  assert.equal(formatDuration(120), '2h');
  assert.equal(formatDuration(1440), '24h');
  assert.equal(formatDuration(1410), '23h 30m');
  assert.equal(formatDuration(10), '10m');
  assert.equal(formatDuration(65), '1h 5m');
  assert.equal(formatDuration(5), '5m');
  assert.equal(formatDuration(undefined), undefined);
  assert.equal(formatDuration(0), undefined);
  assert.equal(fromKanban, formatDuration);
});

test('parsing', () => {
  assert.equal(parseDuration('1h 30m'), 90);
  assert.equal(parseDuration('45m'), 45);
  assert.equal(parseDuration('2h'), 120);
  assert.equal(parseDuration('1h30m'), 90);
  assert.equal(parseDuration(''), null);
  assert.equal(parseDuration('soon'), null);
  assert.equal(parseDuration('0m'), null);
  for (const m of [15, 30, 45, 90, 120, 1440]) assert.equal(parseDuration(formatDuration(m)!), m);
});

test('clamping to 5 minute steps between 5 minutes and 24h', () => {
  assert.equal(clampDuration(15), 15);
  assert.equal(clampDuration(0), 5);
  assert.equal(clampDuration(7), 5);
  assert.equal(clampDuration(8), 10);
  assert.equal(clampDuration(2000), MAX_DURATION);
  assert.equal(clampDuration(Number.NaN), 5);
});

test('the Custom picker: 5 minute options and the 24h rule', () => {
  assert.deepEqual(MINUTE_OPTIONS, [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
  assert.equal(joinDuration(0, 10), 10);
  assert.equal(joinDuration(1, 5), 65);
  assert.equal(joinDuration(0, 0), 5);
  assert.equal(joinDuration(0, 3), 5);
  assert.equal(joinDuration(23, 55), 1435);
  assert.equal(joinDuration(24, 0), 1440);
  assert.equal(joinDuration(24, 30), 1440);
  assert.equal(joinDuration(30, 0), 1440);
  assert.equal(isValidPick(0, 5), true);
  assert.equal(isValidPick(0, 0), false);
  assert.equal(isValidPick(2, 15), true);
  assert.equal(isValidPick(2, 7), false);
  assert.equal(isValidPick(24, 0), true);
  assert.equal(isValidPick(24, 5), false);
  assert.deepEqual(splitDuration(65), { hours: 1, minutes: 5 });
  assert.deepEqual(splitDuration(1440), { hours: 24, minutes: 0 });
  // None shows 0h 30m in the picker but stores nothing until a select changes
  assert.deepEqual(splitDuration(undefined), { hours: 0, minutes: 30 });
});

test('quick chips are 15m, 30m, 1h, 2h after None', () => {
  assert.deepEqual(QUICK_DURATIONS.map((d) => d.minutes), [15, 30, 60, 120]);
  assert.equal(isQuickDuration(undefined), true);
  assert.equal(isQuickDuration(15), true);
  assert.equal(isQuickDuration(120), true);
  assert.equal(isQuickDuration(10), false);
  assert.equal(isQuickDuration(90), false);
});

test('None: no duration stored, nothing shown, Timebox uses 30', () => {
  assert.equal(formatDuration(undefined), undefined);
  assert.equal(taskDuration({ durationMinutes: undefined }), 30);
  const patch = dropPatch({ dueDate: undefined, startTime: undefined, durationMinutes: undefined }, 'row', { kind: 'slot', dayKey: '2026-10-07', startMin: 600 }, '2026-10-06');
  assert.equal(patch?.durationMinutes, 30);
  // A short duration is kept when dropped
  assert.equal(dropPatch({ durationMinutes: 10 }, 'row', { kind: 'slot', dayKey: '2026-10-07', startMin: 600 }, '2026-10-06')?.durationMinutes, 10);
});

test('compact blocks: under 30 minutes is shorter than a 30 minute slot', () => {
  const slot30 = (30 / 60) * PX_PER_HOUR;
  assert.equal(blockHeightPx(30), slot30);
  assert.equal(blockHeightPx(10), MIN_BLOCK_PX);
  assert.equal(blockHeightPx(5), MIN_BLOCK_PX);
  assert.ok(blockHeightPx(10) < slot30);
  assert.ok(blockHeightPx(25) < slot30);
  assert.equal(blockHeightPx(60), PX_PER_HOUR);
  assert.equal(isCompactBlock(blockHeightPx(10)), true);
  assert.equal(isCompactBlock(blockHeightPx(30)), true);
  assert.equal(isCompactBlock(blockHeightPx(60)), false);
  assert.equal(COMPACT_BLOCK_PX, 36);
  // Layout uses the same height
  const b = layoutItems([{ id: 'a', startMin: 600, endMin: 610 }]).blocks[0];
  assert.equal(b.height, MIN_BLOCK_PX);
  // Resizing a 10 minute block gives at least 30
  assert.equal(resizedDuration(600, 612), 30);
});

const placed = (start: string, mins: number): Task =>
  ({
    id: 'x',
    title: 'x',
    completed: false,
    createdAt: '',
    updatedAt: '',
    dueDate: '2026-10-07',
    startTime: start,
    durationMinutes: mins,
  }) as Task;

test('Timebox: a block past 23:00 is drawn to the grid end and marked continues', () => {
  const { blocks } = layoutItems([taskToItem(placed('21:00', 240))!]);
  assert.equal(blocks[0].endMin, 23 * 60);
  assert.equal(blocks[0].continues, true);
  const inside = layoutItems([taskToItem(placed('21:00', 120))!]).blocks[0];
  assert.equal(inside.continues, false);
});

test('Timebox: longer than the whole grid is placed at 06:00 and drawn clamped', () => {
  assert.equal(clampStart(14 * 60, 20 * 60), 6 * 60);
  const b = layoutItems([taskToItem(placed('06:00', 20 * 60))!]).blocks[0];
  assert.equal(b.startMin, 6 * 60);
  assert.equal(b.endMin, 23 * 60);
  assert.equal(b.continues, true);
});

test('resize never passes the grid end', () => {
  assert.equal(resizedDuration(21 * 60, 26 * 60), 120);
});
