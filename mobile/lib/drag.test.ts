// Run with `npm test` from mobile/. Pure drag maths (checkpoint 4).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EDGE_DWELL_MS,
  EDGE_ZONE_PX,
  autoScrollSpeed,
  canDayAcceptDrop,
  clampStart,
  clearDayPatch,
  dropPatch,
  dwellDone,
  edgeAction,
  edgeDirection,
  movedBlockStart,
  passedThreshold,
  resizedDuration,
  resolveDrop,
  slotLabel,
  slotUnderPointer,
  stepWeekStart,
  yToMinutes,
  type Zone,
} from './drag.ts';
import { PX_PER_HOUR } from './timebox.ts';
import { weekStartOf } from './kanban.ts';

const at = (h: number, m = 0) => h * 60 + m;
const TODAY = '2026-10-07';

test('the movement threshold separates a click from a drag', () => {
  assert.equal(passedThreshold(0, 0), false);
  assert.equal(passedThreshold(3, 3), false);
  assert.equal(passedThreshold(5, 0), true);
  assert.equal(passedThreshold(0, -6), true);
});

test('y on the grid converts to minutes from 00:00', () => {
  assert.equal(yToMinutes(100, 100), 0);
  assert.equal(yToMinutes(100 + PX_PER_HOUR * 10.5, 100), at(10, 30));
  assert.equal(yToMinutes(100 + PX_PER_HOUR * 24, 100), at(24));
});

test('slot under the pointer snaps down to 30 minutes', () => {
  assert.equal(slotUnderPointer(at(10, 47), 30), at(10, 30));
  assert.equal(slotUnderPointer(at(10, 29), 30), at(10));
  assert.equal(slotUnderPointer(at(10, 30), 60), at(10, 30));
});

test('clamping keeps the start on the day, 00:00 to 23:30', () => {
  // Top
  assert.equal(slotUnderPointer(at(5, 10), 30), at(5));
  assert.equal(slotUnderPointer(-500, 30), 0);
  // Bottom: the latest start is 23:30, whatever the length, so a block dropped
  // near the bottom may run past midnight
  assert.equal(slotUnderPointer(at(22, 50), 30), at(22, 30));
  assert.equal(slotUnderPointer(at(23, 40), 30), at(23, 30));
  assert.equal(slotUnderPointer(at(23, 10), 8 * 60), at(23));
  assert.equal(slotUnderPointer(at(23, 59), 8 * 60), at(23, 30));
  assert.equal(slotUnderPointer(at(30), 60), at(23, 30));
  // An odd duration still lands on a 30 minute boundary
  assert.equal(clampStart(at(22, 30), 45), at(22, 30));
  // Even a 24 hour block can start at 23:30 (its rest is on the next day)
  assert.equal(clampStart(at(23, 30), 24 * 60), at(23, 30));
});

test('a moved block keeps its grab offset and rounds to the nearest 30', () => {
  // Grabbed 20 minutes into the block, pointer now at 11:35 -> raw start 11:15 -> 11:30
  assert.equal(movedBlockStart(at(11, 35), 20, 60), at(11, 30));
  assert.equal(movedBlockStart(at(11, 30), 20, 60), at(11));
  assert.equal(movedBlockStart(at(5), 0, 60), at(5));
  assert.equal(movedBlockStart(-30, 0, 60), 0);
  // Near the bottom the block may run past midnight
  assert.equal(movedBlockStart(at(23, 30), 0, 60), at(23, 30));
  assert.equal(movedBlockStart(at(23, 40), 0, 8 * 60), at(23, 30));
});

test('resize changes duration in 30 minute steps with a 30 minute minimum', () => {
  assert.equal(resizedDuration(at(10), at(11, 20)), 90);
  assert.equal(resizedDuration(at(10), at(11, 10)), 60);
  assert.equal(resizedDuration(at(10), at(10, 5)), 30);
  assert.equal(resizedDuration(at(10), at(9)), 30);
  // Past midnight is allowed, up to the 24 hour limit
  assert.equal(resizedDuration(at(22), at(30)), 8 * 60);
  assert.equal(resizedDuration(at(22), at(23, 50)), 120);
  assert.equal(resizedDuration(at(9), at(9) + 30 * 60), 24 * 60);
  assert.equal(resizedDuration(at(0), at(40)), 24 * 60);
  // A block at 23:30 keeps at least 30
  assert.equal(resizedDuration(at(23, 30), at(23, 40)), 30);
});

const zones: Zone[] = [
  { kind: 'left', rect: { left: 0, top: 0, right: 300, bottom: 800 } },
  { kind: 'day', dayKey: '2026-10-07', rect: { left: 320, top: 100, right: 540, bottom: 800 }, clip: { left: 320, top: 0, right: 1000, bottom: 800 } },
  { kind: 'day', dayKey: '2026-10-08', rect: { left: 556, top: 100, right: 776, bottom: 800 }, clip: { left: 320, top: 0, right: 1000, bottom: 800 } },
  // Scrolled off the board: outside its clip
  { kind: 'day', dayKey: '2026-10-12', rect: { left: 1100, top: 100, right: 1320, bottom: 800 }, clip: { left: 320, top: 0, right: 1000, bottom: 800 } },
  { kind: 'timebox', dayKey: '2026-10-07', rect: { left: 1020, top: 100, right: 1400, bottom: 800 }, gridTop: -100 },
];

test('drop resolution: left row to a day column', () => {
  assert.deepEqual(resolveDrop(400, 300, zones, { kind: 'row', duration: 30 }), { kind: 'day', dayKey: '2026-10-07' });
  assert.deepEqual(resolveDrop(600, 300, zones, { kind: 'row', duration: 30 }), { kind: 'day', dayKey: '2026-10-08' });
});

test('drop resolution: a column scrolled out of view is not a target', () => {
  // x 1200 is inside the hidden column's rect but outside the board clip;
  // the Timebox is the zone actually under the pointer there.
  const t = resolveDrop(1200, 300, zones, { kind: 'card', duration: 30 });
  assert.equal(t?.kind, 'slot');
});

test('drop resolution: left row to a Timebox slot', () => {
  // gridTop -100: y 300 is 400px below 00:00 = 7h8m -> 07:08 -> 07:00 slot
  const t = resolveDrop(1200, 300, zones, { kind: 'row', duration: 30 });
  assert.deepEqual(t, { kind: 'slot', dayKey: '2026-10-07', startMin: at(7) });
});

test('drop resolution: block keeps its grab offset', () => {
  const t = resolveDrop(1200, 300, zones, { kind: 'block', duration: 60, grabOffsetMin: 45 });
  // raw 07:08 - 45 = 06:23 -> 06:30
  assert.deepEqual(t, { kind: 'slot', dayKey: '2026-10-07', startMin: at(6, 30) });
});

test('drop resolution: card or block to the left pane, and nowhere', () => {
  assert.deepEqual(resolveDrop(100, 100, zones, { kind: 'card', duration: 30 }), { kind: 'left' });
  assert.deepEqual(resolveDrop(100, 100, zones, { kind: 'block', duration: 30 }), { kind: 'left' });
  assert.equal(resolveDrop(310, 50, zones, { kind: 'card', duration: 30 }), null);
});

test('past days reject a drop', () => {
  assert.equal(canDayAcceptDrop('2026-10-06', TODAY), false);
  assert.equal(canDayAcceptDrop(TODAY, TODAY), true);
  assert.equal(canDayAcceptDrop('2026-10-09', TODAY), true);
  assert.equal(canDayAcceptDrop('nope', TODAY), false);
  const row = { dueDate: undefined, startTime: undefined, durationMinutes: undefined };
  assert.equal(dropPatch(row, 'row', { kind: 'day', dayKey: '2026-10-06' }, TODAY), null);
  assert.equal(dropPatch(row, 'row', { kind: 'slot', dayKey: '2026-10-06', startMin: at(9) }, TODAY), null);
});

test('left row dropped on a day sets the Day only', () => {
  const row = { dueDate: undefined, startTime: undefined, durationMinutes: undefined };
  assert.deepEqual(dropPatch(row, 'row', { kind: 'day', dayKey: '2026-10-09' }, TODAY), {
    dueDate: '2026-10-09',
    startTime: undefined,
  });
});

test('left row dropped on a slot sets Day, time and a default 30 minutes', () => {
  const row = { dueDate: undefined, startTime: undefined, durationMinutes: undefined };
  assert.deepEqual(dropPatch(row, 'row', { kind: 'slot', dayKey: TODAY, startMin: at(10, 30) }, TODAY), {
    dueDate: TODAY,
    startTime: '10:30',
    durationMinutes: 30,
  });
  // An existing duration is kept
  const withDur = { ...row, durationMinutes: 120 };
  assert.equal(dropPatch(withDur, 'row', { kind: 'slot', dayKey: TODAY, startMin: at(10) }, TODAY)?.durationMinutes, 120);
});

test('card to another day changes the Day and keeps its time; same day is a no-op', () => {
  const card = { dueDate: TODAY, startTime: '09:00', durationMinutes: 60 };
  assert.deepEqual(dropPatch(card, 'card', { kind: 'day', dayKey: '2026-10-08' }, TODAY), {
    dueDate: '2026-10-08',
    startTime: '09:00',
  });
  assert.equal(dropPatch(card, 'card', { kind: 'day', dayKey: TODAY }, TODAY), null);
});

test('block to a day sets the Day and clears its time', () => {
  const block = { dueDate: TODAY, startTime: '09:00', durationMinutes: 60 };
  assert.deepEqual(dropPatch(block, 'block', { kind: 'day', dayKey: TODAY }, TODAY), {
    dueDate: TODAY,
    startTime: undefined,
  });
  assert.deepEqual(dropPatch(block, 'block', { kind: 'day', dayKey: '2026-10-10' }, TODAY), {
    dueDate: '2026-10-10',
    startTime: undefined,
  });
});

test('card or block to the left pane clears Day and startTime', () => {
  assert.deepEqual(clearDayPatch(), { dueDate: undefined, startTime: undefined });
  const block = { dueDate: TODAY, startTime: '09:00', durationMinutes: 60 };
  const patch = dropPatch(block, 'block', { kind: 'left' }, TODAY);
  assert.deepEqual(patch, { dueDate: undefined, startTime: undefined });
  assert.ok(patch && 'startTime' in patch);
  // A row dropped back on the left changes nothing
  assert.equal(dropPatch({ dueDate: undefined, startTime: undefined }, 'row', { kind: 'left' }, TODAY), null);
});

test('block moved to the same slot is a no-op', () => {
  const block = { dueDate: TODAY, startTime: '09:00', durationMinutes: 60 };
  assert.equal(dropPatch(block, 'block', { kind: 'slot', dayKey: TODAY, startMin: at(9) }, TODAY), null);
  assert.equal(dropPatch(block, 'block', { kind: 'slot', dayKey: TODAY, startMin: at(9, 30) }, TODAY)?.startTime, '09:30');
});

test('slot label', () => {
  assert.equal(slotLabel(at(10, 30), 30), '10:30 to 11:00');
  assert.equal(slotLabel(at(22, 30), 90), '22:30 to 24:00');
  assert.equal(slotLabel(at(22, 30), 120), '22:30 to 00:30 next day');
  assert.equal(slotLabel(at(22), 8 * 60), '22:00 to 06:00 next day');
  assert.equal(slotLabel(at(0), 30), '00:00 to 00:30');
});

const board = { left: 300, top: 100, right: 1000, bottom: 800 };

test('edge direction is forward only at the current week', () => {
  assert.equal(edgeDirection(310, 300, board, true), 0);
  assert.equal(edgeDirection(310, 300, board, false), -1);
  assert.equal(edgeDirection(1000 - EDGE_ZONE_PX + 1, 300, board, true), 1);
  assert.equal(edgeDirection(600, 300, board, false), 0);
  assert.equal(edgeDirection(310, 50, board, false), 0);
});

test('week stepping never goes before the current week', () => {
  const current = weekStartOf(new Date(2026, 9, 7)); // Mon 5 Oct
  assert.equal(stepWeekStart(current, -1, current), null);
  const next = stepWeekStart(current, 1, current);
  assert.equal(next?.getDate(), 12);
  assert.equal(stepWeekStart(next!, -1, current)?.getTime(), current.getTime());
  // Across a month end
  const late = new Date(2026, 9, 26);
  assert.equal(stepWeekStart(late, 1, current)?.getMonth(), 10);
});

test('dwell needs the full delay', () => {
  assert.equal(dwellDone(1000, 1000 + EDGE_DWELL_MS - 1), false);
  assert.equal(dwellDone(1000, 1000 + EDGE_DWELL_MS), true);
});

test('auto scroll near the top and bottom of a pane only', () => {
  const pane = { left: 0, top: 100, right: 300, bottom: 700 };
  assert.ok(autoScrollSpeed(150, 101, pane) < 0);
  assert.ok(autoScrollSpeed(150, 699, pane) > 0);
  assert.equal(autoScrollSpeed(150, 400, pane), 0);
  assert.equal(autoScrollSpeed(400, 699, pane), 0);
  // Faster nearer the edge
  assert.ok(autoScrollSpeed(150, 699, pane) > autoScrollSpeed(150, 670, pane));
});

test('a board edge scrolls sideways first, then arms the week change', () => {
  assert.equal(edgeAction(0, 0, 500), 'none');
  assert.equal(edgeAction(1, 0, 500), 'scroll');
  assert.equal(edgeAction(1, 500, 500), 'dwell');
  assert.equal(edgeAction(-1, 200, 500), 'scroll');
  assert.equal(edgeAction(-1, 0, 500), 'dwell');
  // Nothing to scroll: dwell straight away
  assert.equal(edgeAction(1, 0, 0), 'dwell');
});
