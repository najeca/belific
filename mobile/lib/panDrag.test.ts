import test from 'node:test';
import assert from 'node:assert/strict';
import { middleHeld, panPosition, startsPan } from './panDrag.ts';

const start = { x: 500, y: 400, left: 300, top: 200 };
const limits = { maxLeft: 1000, maxTop: 900 };

test('3.24.0: a drag grabs the content like a hand (left drag scrolls right, up drag scrolls down)', () => {
  assert.deepEqual(panPosition(start, 450, 400, limits), { left: 350, top: 200 });
  assert.deepEqual(panPosition(start, 560, 400, limits), { left: 240, top: 200 });
  assert.deepEqual(panPosition(start, 500, 350, limits), { left: 300, top: 250 });
  assert.deepEqual(panPosition(start, 520, 430, limits), { left: 280, top: 170 });
});

test('3.24.0: the position stays inside the scroller, never past either end', () => {
  assert.deepEqual(panPosition(start, 5000, 5000, limits), { left: 0, top: 0 });
  assert.deepEqual(panPosition(start, -5000, -5000, limits), { left: 1000, top: 900 });
});

test('3.24.0: a direction that cannot scroll (Day view has no sideways strip) stays where it was', () => {
  assert.deepEqual(panPosition(start, 100, 100, { maxLeft: 0, maxTop: 900 }), { left: 300, top: 500 });
  assert.deepEqual(panPosition(start, 100, 100, { maxLeft: 1000, maxTop: 0 }), { left: 700, top: 200 });
  assert.deepEqual(panPosition(start, 100, 100, { maxLeft: 0, maxTop: 0 }), { left: 300, top: 200 });
});

test('3.24.0: no movement is no change, and bad numbers never produce NaN', () => {
  assert.deepEqual(panPosition(start, 500, 400, limits), { left: 300, top: 200 });
  const r = panPosition(start, Number.NaN, Number.POSITIVE_INFINITY, { maxLeft: Number.NaN, maxTop: 900 });
  assert.ok(Number.isFinite(r.left) && Number.isFinite(r.top));
});

test('3.24.0: only the middle button, over a pan area, away from fields and popovers, starts a pan', () => {
  assert.equal(startsPan(1, true, false), true);
  assert.equal(startsPan(0, true, false), false, 'the left button is the task drag');
  assert.equal(startsPan(2, true, false), false, 'the right button is the menu');
  assert.equal(startsPan(1, false, false), false);
  assert.equal(startsPan(1, true, true), false);
});

test('3.24.0: the wheel button is bit 4 of `buttons`', () => {
  assert.equal(middleHeld(4), true);
  assert.equal(middleHeld(5), true);
  assert.equal(middleHeld(1), false);
  assert.equal(middleHeld(0), false);
});
