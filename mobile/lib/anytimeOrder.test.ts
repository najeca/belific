import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOrder, dropIndex, moveKey, orderKey, parseOrder, staleOrderKeys } from './anytimeOrder.ts';

test('the row key is per day', () => {
  assert.equal(orderKey('2026-11-19'), 'today.order.2026-11-19');
});

test('the stored order comes first; new items after, in their usual order; gone ones dropped', () => {
  assert.deepEqual(applyOrder(['a', 'b', 'c', 'd'], ['c', 'gone', 'a']), ['c', 'a', 'b', 'd']);
  assert.deepEqual(applyOrder(['a', 'b'], []), ['a', 'b']);
  assert.deepEqual(applyOrder(['a', 'b'], ['b', 'b']), ['b', 'a']);
});

test('a damaged value is no order', () => {
  assert.deepEqual(parseOrder('not json'), []);
  assert.deepEqual(parseOrder('{"a":1}'), []);
  assert.deepEqual(parseOrder(null), []);
  assert.deepEqual(parseOrder('["a",2,"b"]'), ['a', 'b']);
});

test('move a key', () => {
  assert.deepEqual(moveKey(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a']);
  assert.deepEqual(moveKey(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']);
  assert.deepEqual(moveKey(['a', 'b', 'c'], 5, 0), ['a', 'b', 'c']);
});

test('where a dragged card lands', () => {
  const tops = [0, 70, 140];
  const heights = [60, 60, 60];
  assert.equal(dropIndex(tops, heights, 0, 0), 0);
  assert.equal(dropIndex(tops, heights, 0, 80), 1);
  assert.equal(dropIndex(tops, heights, 0, 150), 2);
  assert.equal(dropIndex(tops, heights, 2, -150), 0);
  assert.equal(dropIndex(tops, heights, 1, -20), 1);
});

test('order rows older than 14 days are stale; other settings never are', () => {
  const keys = ['today.order.2026-11-01', 'today.order.2026-11-05', 'today.order.2026-11-19', 'planner.cut_min'];
  assert.deepEqual(staleOrderKeys(keys, '2026-11-19'), ['today.order.2026-11-01']);
});
