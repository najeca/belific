// The continuous strip of days (2.26.0).
import test from 'node:test';
import assert from 'node:assert/strict';
import { columnHeading, dayAt, daysBetween, indexOfDay, leftDay, offsetOfDay, pageOffset, rangeTitle, stripAround, visibleRange, STRIP_DAYS_BACK } from './dayStrip.ts';

const STEP = 288;

test('the strip spans years either side of today; today opens at the left edge', () => {
  const s = stripAround('2026-10-17');
  assert.equal(indexOfDay(s, '2026-10-17'), STRIP_DAYS_BACK);
  assert.equal(dayAt(s, STRIP_DAYS_BACK), '2026-10-17');
  assert.equal(offsetOfDay(s, '2026-10-17', STEP), STRIP_DAYS_BACK * STEP);
  assert.equal(leftDay(s, STRIP_DAYS_BACK * STEP, STEP), '2026-10-17');
  // Sunday: Monday is the very next column, no week boundary.
  assert.equal(indexOfDay(s, '2026-10-19') - indexOfDay(s, '2026-10-18'), 1);
  assert.equal(indexOfDay(s, '2010-01-01'), -1);
  assert.equal(indexOfDay(s, 'nope'), -1);
});

test('day arithmetic is by calendar day across clock changes and leap years', () => {
  assert.equal(daysBetween('2026-10-24', '2026-10-26'), 2);
  assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2);
  assert.equal(daysBetween('2028-02-28', '2028-03-01'), 2);
  assert.equal(daysBetween('2026-10-17', '2026-10-10'), -7);
});

test('only the columns on screen plus three either side are drawn', () => {
  assert.deepEqual(visibleRange(0, 1000, STEP, 4000), { first: 0, last: 6 });
  assert.deepEqual(visibleRange(STEP * 100, 1000, STEP, 4000), { first: 97, last: 106 });
  assert.deepEqual(visibleRange(STEP * 3999, 1000, STEP, 4000), { first: 3996, last: 3999 });
  const r = visibleRange(STEP * 2000 + 17, 1600, STEP, 4000);
  assert.ok(r.last - r.first + 1 <= 13, 'a dozen columns at most, not thousands');
});

test('the arrows page by one screen of whole columns and stop at the ends', () => {
  assert.equal(pageOffset(STEP * 100, 1000, STEP, 1, 4000), STEP * 103);
  assert.equal(pageOffset(STEP * 100, 1000, STEP, -1, 4000), STEP * 97);
  assert.equal(pageOffset(STEP * 1, 1000, STEP, -1, 4000), 0);
  assert.equal(pageOffset(STEP * 3998, 1000, STEP, 1, 4000), STEP * 3997);
});

test('the heading of the days on screen and of each column', () => {
  assert.equal(rangeTitle('2026-10-17', '2026-10-23'), 'October 2026');
  assert.equal(rangeTitle('2026-10-28', '2026-11-03'), 'Oct to Nov 2026');
  assert.equal(rangeTitle('2026-12-29', '2027-01-04'), 'Dec 2026 to Jan 2027');
  assert.deepEqual(columnHeading('2026-10-17', '2026-10-17'), { weekday: 'Sat', date: 'Oct 17', when: 'today' });
  assert.equal(columnHeading('2026-10-16', '2026-10-17').when, 'past');
  assert.equal(columnHeading('2026-10-19', '2026-10-17').weekday, 'Mon');
});
