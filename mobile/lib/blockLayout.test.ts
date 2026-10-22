// Run with `npm test` from mobile/. What a block shows at its height, and the order parts drop in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCK_DROP_ORDER, FULL_BLOCK_PX, blockPlan, blockTier } from './blockLayout.ts';
import { blockHeightPx } from './timebox.ts';

test('the tier follows the block height: 15, 20 and 30 minutes are one line, 45 two, 60 and 90 full', () => {
  const tiers = [15, 20, 30, 45, 60, 90, 240].map((m) => blockTier(blockHeightPx(m)));
  assert.deepEqual(tiers, [1, 1, 1, 2, 3, 3, 3]);
  assert.equal(blockTier(35.9), 1);
  assert.equal(blockTier(36), 2);
  assert.equal(blockTier(FULL_BLOCK_PX - 0.1), 2);
  assert.equal(blockTier(FULL_BLOCK_PX), 3);
});

test('tier 1 has no icons but the priority mark; tier 2 and 3 can show them all', () => {
  const one = blockPlan(20);
  assert.deepEqual([one.showListEmoji, one.showRepeat, one.showLeft, one.showTime, one.showPriority], [false, false, false, true, true]);
  const two = blockPlan(42);
  assert.deepEqual([two.showListEmoji, two.showRepeat, two.showLeft, two.showTime, two.showPriority], [true, true, true, true, true]);
});

test('width takes parts away in the order list emoji, repeat, left, time, priority', () => {
  assert.deepEqual(BLOCK_DROP_ORDER, ['listEmoji', 'repeat', 'left', 'time', 'priority']);
  const shown = (d: number) => {
    const p = blockPlan(42, d);
    return [p.showListEmoji, p.showRepeat, p.showLeft, p.showTime, p.showPriority];
  };
  assert.deepEqual(shown(0), [true, true, true, true, true]);
  assert.deepEqual(shown(1), [false, true, true, true, true]);
  assert.deepEqual(shown(2), [false, false, true, true, true]);
  assert.deepEqual(shown(3), [false, false, false, true, true]);
  assert.deepEqual(shown(4), [false, false, false, false, true]);
  assert.deepEqual(shown(5), [false, false, false, false, false]);
  assert.deepEqual(shown(99), [false, false, false, false, false]);
});

test('in tier 1 the time goes before the priority mark', () => {
  const p = blockPlan(20, 4);
  assert.equal(p.showTime, false);
  assert.equal(p.showPriority, true);
  assert.equal(blockPlan(20, 5).showPriority, false);
});
