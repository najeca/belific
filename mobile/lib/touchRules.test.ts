// Run with `npm test` from mobile/. The phone's touch rules (PLAN_phone P2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { HOLD_MS, TAP_MAX_MOVE, TAP_MAX_MS, classifyTouch, pageTurn } from './touchRules.ts';

test('a quick, still touch is a tap', () => {
  assert.equal(classifyTouch(0, 80), 'tap');
  assert.equal(classifyTouch(TAP_MAX_MOVE, TAP_MAX_MS), 'tap');
});

test('a finger that moves (a scroll or a swipe) never counts as a tap or a hold', () => {
  assert.equal(classifyTouch(20, 120), 'none', 'a 20 point drag is a scroll');
  assert.equal(classifyTouch(30, 200), 'none');
  assert.equal(classifyTouch(40, 600), 'none', 'a slow drag is not a hold');
});

test('a still touch held about 400 ms is a hold; a slow lift in between is nothing', () => {
  assert.equal(HOLD_MS, 400);
  assert.equal(classifyTouch(2, 450), 'hold');
  assert.equal(classifyTouch(0, 300), 'none', 'too slow for a tap, too short for a hold');
});

test('a sideways page change needs a real share of the width or a fling; direction follows the finger', () => {
  assert.equal(pageTurn(-120, 0, 390), 1, 'finger to the left: forward');
  assert.equal(pageTurn(120, 0, 390), -1, 'finger to the right: back');
  assert.equal(pageTurn(-40, 0, 390), 0, 'a small nudge stays');
  assert.equal(pageTurn(-40, -900, 390), 1, 'a quick flick turns the page');
  assert.equal(pageTurn(-10, -900, 390), 0, 'a twitch is not a flick');
});
