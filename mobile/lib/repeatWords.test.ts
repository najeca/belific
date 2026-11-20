// Run with `npm test` from mobile/. The phone's Tasks tab words (3.61.0): every rule, the day sets, until, an unknown rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fullDayList, repeatWords } from './repeatWords.ts';
import { parseFolds, toggleFold } from './repeatFolds.ts';
import type { RecurrenceRule, WeekDay } from './types.ts';

const TODAY = '2026-11-12'; // a Thursday
const r = (recurrence: RecurrenceRule | string, extra: { recurrenceDays?: WeekDay[]; recurrenceMonthDay?: number; dueDate?: string; repeatUntil?: string } = {}) =>
  repeatWords({ recurrence: recurrence as RecurrenceRule, ...extra }, TODAY);

test('daily and weekly with all seven days', () => {
  assert.equal(r('daily'), 'Every day');
  assert.equal(r('weekly', { recurrenceDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] }), 'Every day');
});
test('weekly day sets are said in full', () => {
  assert.equal(r('weekly', { recurrenceDays: ['Mon'] }), 'Every Monday');
  assert.equal(r('weekly', { recurrenceDays: ['Wed', 'Mon'] }), 'Every Monday and Wednesday');
  assert.equal(r('weekly', { recurrenceDays: ['Mon', 'Wed', 'Fri'] }), 'Every Monday, Wednesday and Friday');
});
test('weekly with no stored days uses the weekday of the Day, else today', () => {
  assert.equal(r('weekly', { dueDate: '2026-11-13' }), 'Every Friday');
  assert.equal(r('weekly'), 'Every Thursday');
});
test('every 2 and 3 weeks', () => {
  assert.equal(r('biweekly', { recurrenceDays: ['Fri'] }), 'Every 2 weeks on Friday');
  assert.equal(r('triweekly', { recurrenceDays: ['Mon', 'Thu'] }), 'Every 3 weeks on Monday and Thursday');
  assert.equal(r('biweekly', { recurrenceDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] }), 'Every day of every other week');
});
test('monthly and yearly', () => {
  assert.equal(r('monthly', { recurrenceMonthDay: 3 }), 'Monthly on the 3rd');
  assert.equal(r('monthly', { recurrenceMonthDay: 22 }), 'Monthly on the 22nd');
  assert.equal(r('monthly', { recurrenceMonthDay: 11 }), 'Monthly on the 11th');
  assert.equal(r('annual', { dueDate: '2026-12-25' }), 'Every year on 25 Dec');
  assert.equal(r('annual'), 'Every year');
});
test('until follows the pattern', () => {
  assert.equal(r('daily', { repeatUntil: '2026-12-17' }), 'Every day · Until 17 Dec');
  assert.equal(r('weekly', { recurrenceDays: ['Mon'], repeatUntil: 'nonsense' }), 'Every Monday');
});
test('a rule this version does not know is still said', () => {
  assert.equal(r('fortnightly-ish'), 'Repeats');
});
test('no rule says nothing', () => {
  assert.equal(repeatWords({}, TODAY), undefined);
  assert.equal(fullDayList([]), '');
});
test('folds: parse and toggle', () => {
  assert.deepEqual(parseFolds(null), []);
  assert.deepEqual(parseFolds('not json'), []);
  assert.deepEqual(parseFolds('{"a":1}'), []);
  assert.deepEqual(parseFolds('["daily",3,"weekly"]'), ['daily', 'weekly']);
  assert.deepEqual(toggleFold([], 'daily'), ['daily']);
  assert.deepEqual(toggleFold(['daily', 'weekly'], 'daily'), ['weekly']);
});
