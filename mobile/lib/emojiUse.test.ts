// Run with `npm test` from mobile/. The emoji picker's "Frequently used" row (3.13.0).
import test from 'node:test';
import assert from 'node:assert/strict';
import { FREQUENT_MAX, bumpUse, frequentRow, parseUse, useFromRecent } from './emojiUse.ts';

test('the most chosen first, the latest first among equals, at most eight', () => {
  let use = {};
  for (const [e, at] of [['🎮', 1], ['📚', 2], ['🎮', 3], ['🏠', 4], ['📚', 5], ['🎮', 6]] as const) use = bumpUse(use, e, at);
  assert.deepEqual(frequentRow(use), ['🎮', '📚', '🏠']);
  use = bumpUse(bumpUse(use, '🏠', 7), '🏠', 8);
  assert.deepEqual(frequentRow(use), ['🏠', '🎮', '📚'], '3 each for the game and the house: the later one first; the books have 2');
  for (let i = 0; i < 12; i++) use = bumpUse(use, String.fromCodePoint(0x1f600 + i), 20 + i);
  assert.equal(frequentRow(use).length, FREQUENT_MAX);
});

test('nothing chosen is an empty row, never defaults', () => {
  assert.deepEqual(frequentRow({}), []);
  assert.deepEqual(frequentRow(parseUse(null)), []);
});

test('parseUse keeps good entries and drops anything else', () => {
  assert.deepEqual(parseUse('{"🎮":{"n":2,"at":5},"x":{"n":0,"at":1},"y":3}'), { '🎮': { n: 2, at: 5 } });
  assert.deepEqual(parseUse('[1]'), {});
  assert.deepEqual(parseUse('not json'), {});
});

test('the old recent row becomes counts of one, newest first', () => {
  assert.deepEqual(frequentRow(useFromRecent(['🏠', '📚', '🎮'], 100)), ['🏠', '📚', '🎮']);
});

test('only the 60 most used are kept', () => {
  let use = {};
  for (let i = 0; i < 80; i++) use = bumpUse(use, String.fromCodePoint(0x1f300 + i), i);
  assert.equal(Object.keys(use).length, 60);
});
