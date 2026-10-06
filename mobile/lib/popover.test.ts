import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_POPOVER_HEIGHT, placePopover } from './popover.ts';

const win = { width: 1200, height: 800 };
const size = { width: 240, height: 200 };
const box = (x: number, y: number, width = 24, height = 24) => ({ x, y, width, height });

test('opens below the trigger when there is room', () => {
  const p = placePopover(box(300, 100), size, win);
  assert.equal(p.side, 'below');
  assert.equal(p.top, 100 + 24 + 6);
  assert.equal(p.left, 300);
});

test('flips above when there is no room below', () => {
  const p = placePopover(box(300, 700), size, win);
  assert.equal(p.side, 'above');
  assert.ok(p.top + size.height <= 700);
});

test('clamps horizontally so it never leaves the window', () => {
  const p = placePopover(box(1150, 100), size, win);
  assert.ok(p.left + size.width <= win.width - 8);
  assert.equal(placePopover(box(-20, 100), size, win).left, 8);
});

test('goes beside the trigger when neither above nor below fits', () => {
  const tall = { width: 200, height: 320 };
  const short = { width: 1200, height: 420 };
  const p = placePopover(box(100, 200), tall, short);
  assert.equal(p.side, 'right');
  assert.ok(p.top >= 8 && p.top + 320 <= short.height - 8);
  const q = placePopover(box(1000, 200), tall, short);
  assert.equal(q.side, 'left');
  assert.ok(q.left + 200 <= 1000);
});

test('the height is capped at about 320 and squeezed in a tiny window', () => {
  assert.equal(placePopover(box(10, 10), { width: 200, height: 900 }, win).maxHeight, MAX_POPOVER_HEIGHT);
  const tiny = placePopover(box(10, 60), { width: 200, height: 300 }, { width: 220, height: 200 });
  assert.ok(tiny.maxHeight <= 200 - 16);
  assert.ok(tiny.top >= 0);
});
