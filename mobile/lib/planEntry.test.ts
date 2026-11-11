// Run with `npm test` from mobile/. F1 of PLAN_daily_flow: the Plan button.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAN_LABEL, analyticsInMenu, otherFlow, parseFreeTimeLine, planFlowFor } from './planEntry.ts';

test('the button opens Plan my day in the morning and Wrap up from the afternoon, through the night', () => {
  assert.equal(planFlowFor(4), 'planning');
  assert.equal(planFlowFor(9), 'planning');
  assert.equal(planFlowFor(13), 'planning');
  assert.equal(planFlowFor(14), 'shutdown');
  assert.equal(planFlowFor(23), 'shutdown');
  assert.equal(planFlowFor(0), 'shutdown');
  assert.equal(planFlowFor(3), 'shutdown');
});

test('the words, and the other flow the menu offers', () => {
  assert.equal(PLAN_LABEL.planning, 'Plan my day');
  assert.equal(PLAN_LABEL.shutdown, 'Wrap up');
  assert.equal(otherFlow('planning'), 'shutdown');
  assert.equal(otherFlow('shutdown'), 'planning');
});

test('Analytics moves into the Plan menu below 1100 px', () => {
  assert.equal(analyticsInMenu(1099), true);
  assert.equal(analyticsInMenu(1100), false);
  assert.equal(analyticsInMenu(1440), false);
  assert.equal(analyticsInMenu(1440, 770), true, 'a wide window whose centre pane is squeezed by the other two');
  assert.equal(analyticsInMenu(1920, 1200), false);
  assert.equal(analyticsInMenu(1920, 0), false, 'row width not known yet'); 
});

test('the Free time line setting is off unless it says true', () => {
  assert.equal(parseFreeTimeLine(undefined), false);
  assert.equal(parseFreeTimeLine('false'), false);
  assert.equal(parseFreeTimeLine('garbage'), false);
  assert.equal(parseFreeTimeLine('true'), true);
});
