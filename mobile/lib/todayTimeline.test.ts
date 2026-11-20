import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bubbleHeight, nowMarker, type TimelineSpan } from './todayTimeline.ts';

test('bubble height: 1 pt a minute, 44 at least, 160 at most; a reminder is 44', () => {
  assert.equal(bubbleHeight(5), 44);
  assert.equal(bubbleHeight(90), 90);
  assert.equal(bubbleHeight(120), 120);
  assert.equal(bubbleHeight(480), 160);
  assert.equal(bubbleHeight(0, true), 44);
  assert.equal(bubbleHeight(Number.NaN), 44);
});

const sp = (key: string, startMin: number, endMin: number, extra: Partial<TimelineSpan> = {}): TimelineSpan => ({ key, startMin, endMin, ...extra });

test('the marker sits inside the item running now, at the share gone', () => {
  const m = nowMarker([sp('a', 540, 600), sp('b', 840, 900)], 570);
  assert.deepEqual(m, { inside: true, key: 'a', share: 0.5 });
});

test('between items, the marker is a line before the next one; after the last, at the end', () => {
  assert.deepEqual(nowMarker([sp('a', 540, 600), sp('b', 840, 900)], 700), { inside: false, index: 1 });
  assert.deepEqual(nowMarker([sp('a', 540, 600)], 1000), { inside: false, index: 1 });
  assert.deepEqual(nowMarker([sp('a', 540, 600)], 100), { inside: false, index: 0 });
});

test('a block inside a shift holds the marker, not the shift; a break, a reminder or a done item never does', () => {
  assert.equal((nowMarker([sp('shift', 540, 1020), sp('in', 600, 660)], 610) as { key: string }).key, 'in');
  assert.deepEqual(nowMarker([sp('lunch', 720, 780, { free: true })], 730), { inside: false, index: 1 });
  assert.deepEqual(nowMarker([sp('r', 720, 750, { reminder: true })], 730), { inside: false, index: 1 });
  assert.deepEqual(nowMarker([sp('d', 720, 780, { done: true })], 730), { inside: false, index: 1 });
});
