// Run with `npm test` from mobile/. Durations (checkpoint 4.1).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DURATION_PRESETS,
  MAX_DURATION,
  formatClock,
  formatDuration,
  parseDuration,
  presetLabel,
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

test('chip text is H:MM, 0:00 when no duration is set', () => {
  assert.equal(formatClock(undefined), '0:00');
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(15), '0:15');
  assert.equal(formatClock(5), '0:05');
  assert.equal(formatClock(60), '1:00');
  assert.equal(formatClock(90), '1:30');
  assert.equal(formatClock(1440), '24:00');
  assert.equal(formatClock(Number.NaN), '0:00');
});

test('preset list: 5 min to 4h, labelled as in the dropdown', () => {
  assert.deepEqual(DURATION_PRESETS, [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240]);
  assert.deepEqual(DURATION_PRESETS.map(presetLabel), ['5 min', '10 min', '15 min', '20 min', '30 min', '45 min', '1h', '1h 30m', '2h', '3h', '4h']);
});

test('parsing: every form the dropdown accepts', () => {
  const cases: Array<[string, number]> = [
    ['45m', 45],
    ['45', 45],
    ['1h', 60],
    ['1h 30m', 90],
    ['1h30', 90],
    ['1h30m', 90],
    ['1.5h', 90],
    ['0.5h', 30],
    ['2.25h', 135],
    ['130', 130],
    ['1:30', 90],
    ['0:45', 45],
    ['24:00', 1440],
    ['1440', 1440],
    ['1', 1],
    ['  1h   30m  ', 90],
    ['1H 30M', 90],
    ['45 min', 45],
    ['2 hours', 120],
    ['2 hrs 5 mins', 125],
    ['24h', 1440],
  ];
  for (const [text, minutes] of cases) assert.equal(parseDuration(text), minutes, text);
});

test('parsing rejects: zero, negative, over 1440, fractions of a minute, text', () => {
  const bad = ['', '   ', '0', '0m', '0h', '0:00', '-5', '-1h', '1441', '25h', '24h 1m', '99999', '1.5', '45.5', 'soon', 'abc', '1h abc', 'h', 'm', '1h 30x', '1:60', '1:5', '1::30', '30 m 1h', '1,5h', '--', 'NaN'];
  for (const text of bad) assert.equal(parseDuration(text), null, JSON.stringify(text));
});

test('round trips: every whole minute formats and parses back', () => {
  for (let m = 1; m <= MAX_DURATION; m++) {
    assert.equal(parseDuration(formatDuration(m)!), m, `formatDuration ${m}`);
    assert.equal(parseDuration(formatClock(m)), m, `formatClock ${m}`);
  }
  for (const m of DURATION_PRESETS) assert.equal(parseDuration(presetLabel(m)), m);
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
