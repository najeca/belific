// Run with `npm test` from mobile/. Durations (checkpoint 4.1).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_DURATION,
  QUICK_DURATIONS,
  clampDuration,
  formatDuration,
  isValidPick,
  joinDuration,
  parseDuration,
  splitDuration,
} from './duration.ts';
import { formatDuration as fromKanban } from './kanban.ts';
import { layoutItems, taskToItem } from './timebox.ts';
import { clampStart, resizedDuration } from './drag.ts';
import type { Task } from './types.ts';

test('formatting: "1h 30m" and "45m" style, stored legacy values too', () => {
  assert.equal(formatDuration(15), '15m');
  assert.equal(formatDuration(45), '45m');
  assert.equal(formatDuration(90), '1h 30m');
  assert.equal(formatDuration(120), '2h');
  assert.equal(formatDuration(1440), '24h');
  assert.equal(formatDuration(1410), '23h 30m');
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

test('clamping to 30 minute steps between 30 and 24h', () => {
  assert.equal(clampDuration(15), 30);
  assert.equal(clampDuration(0), 30);
  assert.equal(clampDuration(44), 30);
  assert.equal(clampDuration(46), 60);
  assert.equal(clampDuration(2000), MAX_DURATION);
  assert.equal(clampDuration(Number.NaN), 30);
});

test('the Custom picker and the 24h rule', () => {
  assert.equal(joinDuration(1, 30), 90);
  assert.equal(joinDuration(0, 30), 30);
  assert.equal(joinDuration(0, 0), 30);
  assert.equal(joinDuration(24, 0), 1440);
  assert.equal(joinDuration(24, 30), 1440);
  assert.equal(joinDuration(30, 0), 1440);
  assert.equal(isValidPick(24, 30), false);
  assert.equal(isValidPick(24, 0), true);
  assert.equal(isValidPick(0, 0), false);
  assert.equal(isValidPick(0, 30), true);
  assert.equal(isValidPick(2, 15), false);
  assert.deepEqual(splitDuration(90), { hours: 1, minutes: 30 });
  assert.deepEqual(splitDuration(1440), { hours: 24, minutes: 0 });
  assert.deepEqual(splitDuration(undefined), { hours: 0, minutes: 30 });
  assert.deepEqual(splitDuration(15), { hours: 0, minutes: 30 });
});

test('quick chips are 30m, 1h, 2h', () => {
  assert.deepEqual(QUICK_DURATIONS.map((d) => d.minutes), [30, 60, 120]);
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
