// Run with `npm test` from mobile/. F1 of PLAN_daily_flow: the Plan button.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAN_LABEL, analyticsInMenu, menuFlows, parseFreeTimeLine, planFlowAt, planFlowFor, weekToPlan } from './planEntry.ts';

test('the button opens Plan my day in the morning and Wrap up from the afternoon, through the night', () => {
  assert.equal(planFlowFor(4), 'planning');
  assert.equal(planFlowFor(9), 'planning');
  assert.equal(planFlowFor(13), 'planning');
  assert.equal(planFlowFor(14), 'shutdown');
  assert.equal(planFlowFor(23), 'shutdown');
  assert.equal(planFlowFor(0), 'shutdown');
  assert.equal(planFlowFor(3), 'shutdown');
});

test('the words, and the menu always lists all three, the one the button opens first', () => {
  assert.equal(PLAN_LABEL.planning, 'Plan my day');
  assert.equal(PLAN_LABEL.shutdown, 'Wrap up');
  assert.equal(PLAN_LABEL.week, 'Plan week');
  assert.deepEqual(menuFlows('planning'), ['planning', 'shutdown', 'week']);
  assert.deepEqual(menuFlows('shutdown'), ['shutdown', 'planning', 'week']);
  assert.deepEqual(menuFlows('week'), ['week', 'planning', 'shutdown']);
});

// F5 of PLAN_daily_flow: Plan week first on Sunday evening and Monday morning (2026-11-15 is a Sunday).
test('F5: the button opens Plan week on Sunday from 16:00 and on Monday until 13:59, and the usual flow otherwise', () => {
  const at = (d: string, h: number) => planFlowAt(new Date(`${d}T${String(h).padStart(2, '0')}:30:00`));
  assert.equal(at('2026-11-15', 15), 'shutdown', 'Sunday afternoon');
  assert.equal(at('2026-11-15', 16), 'week');
  assert.equal(at('2026-11-15', 23), 'week');
  assert.equal(at('2026-11-16', 3), 'shutdown', 'Monday small hours: Wrap up of Sunday');
  assert.equal(at('2026-11-16', 4), 'week');
  assert.equal(at('2026-11-16', 13), 'week');
  assert.equal(at('2026-11-16', 14), 'shutdown', 'Monday afternoon goes back to Wrap up');
  assert.equal(at('2026-11-17', 9), 'planning', 'Tuesday morning');
  assert.equal(at('2026-11-14', 18), 'shutdown', 'Saturday evening');
});

test('F5: the week planned is this week, and next week from Sunday 16:00', () => {
  const week = (d: string, h: number) => weekToPlan(new Date(`${d}T${String(h).padStart(2, '0')}:00:00`));
  assert.deepEqual(week('2026-11-18', 10)[0], '2026-11-16');
  assert.equal(week('2026-11-18', 10)[6], '2026-11-22');
  assert.equal(week('2026-11-15', 15)[0], '2026-11-09', 'Sunday afternoon: still this week');
  assert.equal(week('2026-11-15', 16)[0], '2026-11-16', 'Sunday evening: next week');
  assert.equal(week('2026-11-16', 9)[0], '2026-11-16');
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
