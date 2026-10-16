// Run with `npm test` from mobile/. Calendar date maths (phase 3).
import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarTitle, dayOfTask, isDateInVisible, minutesOfDay, monthGrid, nowLineTop, splitAllDay, stepAnchor, visibleDayKeys } from './calendarView.ts';
import { PX_PER_HOUR } from './timebox.ts';

test('a week is Monday to Sunday and contains the day asked for', () => {
  // 2026-10-16 is a Friday.
  const keys = visibleDayKeys('week', '2026-10-16');
  assert.deepEqual(keys, ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']);
  assert.deepEqual(visibleDayKeys('week', '2026-10-12'), keys, 'Monday');
  assert.deepEqual(visibleDayKeys('week', '2026-10-18'), keys, 'Sunday');
  assert.deepEqual(visibleDayKeys('day', '2026-10-16'), ['2026-10-16']);
});

test('the month grid is whole weeks, Monday first, with the month marked', () => {
  const grid = monthGrid('2026-10-16', '2026-10-16');
  assert.equal(grid.length, 5, 'October 2026 spans 5 Monday weeks (28 Sep to 1 Nov)');
  for (const row of grid) assert.equal(row.length, 7);
  assert.equal(grid[0][0].key, '2026-09-28');
  assert.equal(grid[0][0].inMonth, false);
  assert.equal(grid[0][3].key, '2026-10-01');
  assert.equal(grid[0][3].inMonth, true);
  assert.equal(grid[4][6].key, '2026-11-01');
  assert.equal(grid[4][6].inMonth, false);
  assert.equal(grid.flat().filter((c) => c.isToday).length, 1);
  assert.equal(grid.flat().find((c) => c.isToday)?.key, '2026-10-16');
  assert.equal(grid.flat().filter((c) => c.inMonth).length, 31);
  // a month that starts on a Monday has no leading days, one that ends on a Sunday no trailing
  const june = monthGrid('2026-06-10', '');
  assert.equal(june[0][0].key, '2026-06-01');
  assert.equal(june[0][0].inMonth, true);
  // February 2027 starts on a Monday: exactly 4 weeks
  assert.equal(monthGrid('2027-02-10', '').length, 4);
  // a 6 row month
  assert.equal(monthGrid('2026-08-10', '').length, 6);
  assert.equal(visibleDayKeys('month', '2026-10-16').length, 35);
});

test('stepping: day, week and month, clamping the day number', () => {
  assert.equal(stepAnchor('day', '2026-10-31', 1), '2026-11-01');
  assert.equal(stepAnchor('day', '2026-01-01', -1), '2025-12-31');
  assert.equal(stepAnchor('week', '2026-10-16', 1), '2026-10-23');
  assert.equal(stepAnchor('week', '2026-10-16', -2), '2026-10-02');
  assert.equal(stepAnchor('month', '2026-01-31', 1), '2026-02-28');
  assert.equal(stepAnchor('month', '2028-01-31', 1), '2028-02-29');
  assert.equal(stepAnchor('month', '2026-03-31', -1), '2026-02-28');
  assert.equal(stepAnchor('month', '2026-12-15', 1), '2027-01-15');
  assert.equal(stepAnchor('month', '2026-01-15', -1), '2025-12-15');
});

test('visibility check', () => {
  assert.equal(isDateInVisible('week', '2026-10-16', '2026-10-12'), true);
  assert.equal(isDateInVisible('week', '2026-10-16', '2026-10-19'), false);
  assert.equal(isDateInVisible('month', '2026-10-16', '2026-09-30'), true, 'a padding day of the grid');
  assert.equal(isDateInVisible('day', '2026-10-16', '2026-10-17'), false);
});

test('titles', () => {
  assert.equal(calendarTitle('day', '2026-10-16'), 'Fri 16 Oct 2026');
  assert.equal(calendarTitle('week', '2026-10-16'), '12 to 18 Oct 2026');
  assert.equal(calendarTitle('week', '2026-10-29'), '26 Oct to 1 Nov 2026');
  assert.equal(calendarTitle('week', '2026-12-30'), '28 Dec 2026 to 3 Jan 2027');
  assert.equal(calendarTitle('month', '2026-10-16'), 'October 2026');
});

test('the current time line sits at minutes x pixels per hour, clamped to the grid', () => {
  assert.equal(nowLineTop(0), 0);
  assert.equal(nowLineTop(60), PX_PER_HOUR);
  assert.equal(nowLineTop(90), PX_PER_HOUR * 1.5);
  assert.equal(nowLineTop(1440), PX_PER_HOUR * 24);
  assert.equal(nowLineTop(-5), 0);
  assert.equal(nowLineTop(5000), PX_PER_HOUR * 24);
  assert.equal(minutesOfDay(new Date(2026, 9, 16, 14, 35, 59)), 14 * 60 + 35);
  assert.equal(minutesOfDay(new Date(2026, 9, 16, 0, 0)), 0);
  assert.equal(minutesOfDay(new Date(2026, 9, 16, 23, 59)), 1439);
});

test('all day row: a Day with no start time; the rest are on the grid', () => {
  const items = [
    { task: { dueDate: '2026-10-16' }, id: 'a' },
    { task: { dueDate: '2026-10-16', startTime: '09:00' }, id: 'b' },
    { task: { dueDate: '2026-10-16', startTime: '00:00' }, id: 'c' },
  ];
  const { allDay, timed } = splitAllDay(items);
  assert.deepEqual(allDay.map((i) => i.id), ['a']);
  assert.deepEqual(timed.map((i) => i.id), ['b', 'c']);
});

test('only a real Day counts for the month chips', () => {
  assert.equal(dayOfTask({ dueDate: '2026-10-16' }), '2026-10-16');
  assert.equal(dayOfTask({ dueDate: 'tomorrow' }), null);
  assert.equal(dayOfTask({}), null);
});
