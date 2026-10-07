// Run with `npm test` from mobile/. "My day starts at" (checkpoint 8.4).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DAY_START_OPTIONS, DEFAULT_DAY_START, dayStartMinutes, isDayStart, openingMinutes } from './dayStart.ts';
import { PX_PER_HOUR, scrollOffsetFor } from './timebox.ts';

const at = (h: number, m = 0) => h * 60 + m;

test('the default is 05:00 and the choices are 00:00 to 23:30 in 30 minute steps', () => {
  assert.equal(DEFAULT_DAY_START, '05:00');
  assert.equal(DAY_START_OPTIONS.length, 48);
  assert.equal(DAY_START_OPTIONS[0], '00:00');
  assert.equal(DAY_START_OPTIONS[1], '00:30');
  assert.equal(DAY_START_OPTIONS[10], '05:00');
  assert.equal(DAY_START_OPTIONS[40], '20:00');
  assert.equal(DAY_START_OPTIONS[47], '23:30');
  assert.ok(DAY_START_OPTIONS.includes(DEFAULT_DAY_START));
});

test('only a time in 30 minute steps is valid', () => {
  for (const ok of ['00:00', '05:00', '05:30', '20:00', '23:30']) assert.equal(isDayStart(ok), true, ok);
  for (const bad of ['05:15', '24:00', '5:00', '05:00:00', '', 'noon', null, undefined, 500, '23:59']) {
    assert.equal(isDayStart(bad), false, String(bad));
  }
});

test('dayStartMinutes reads a setting, and falls back to 05:00 for anything invalid', () => {
  assert.equal(dayStartMinutes('05:00'), at(5));
  assert.equal(dayStartMinutes('20:00'), at(20));
  assert.equal(dayStartMinutes('23:30'), at(23, 30));
  assert.equal(dayStartMinutes('05:15'), at(5));
  assert.equal(dayStartMinutes(undefined), at(5));
});

test('a day other than today opens at the day start', () => {
  assert.equal(openingMinutes({ isToday: false, nowMin: at(14), dayStartMin: at(5) }), at(5));
  assert.equal(openingMinutes({ isToday: false, nowMin: at(14), dayStartMin: at(20) }), at(20));
  assert.equal(openingMinutes({ isToday: false, nowMin: at(2), dayStartMin: at(0) }), 0);
});

test('today opens about an hour before now, but not before the day start', () => {
  // 14:20 with a 05:00 start: an hour before now
  assert.equal(openingMinutes({ isToday: true, nowMin: at(14, 20), dayStartMin: at(5) }), at(13, 20));
  // 05:30 with a 05:00 start: an hour before is 04:30, so the day start holds
  assert.equal(openingMinutes({ isToday: true, nowMin: at(5, 30), dayStartMin: at(5) }), at(5));
  // exactly at the start
  assert.equal(openingMinutes({ isToday: true, nowMin: at(5), dayStartMin: at(5) }), at(5));
  // 22:00 with a 20:00 start (a night shift): 21:00
  assert.equal(openingMinutes({ isToday: true, nowMin: at(22), dayStartMin: at(20) }), at(21));
});

test('before the day start today opens an hour before now (the small hours of a night shift)', () => {
  assert.equal(openingMinutes({ isToday: true, nowMin: at(3), dayStartMin: at(20) }), at(2));
  assert.equal(openingMinutes({ isToday: true, nowMin: at(0, 20), dayStartMin: at(20) }), 0);
  assert.equal(openingMinutes({ isToday: true, nowMin: at(4), dayStartMin: at(5) }), at(3));
});

test('the opening time becomes a scroll offset on the 24 hour grid', () => {
  assert.equal(scrollOffsetFor(openingMinutes({ isToday: false, nowMin: 0, dayStartMin: at(20) })), 20 * PX_PER_HOUR);
  assert.equal(scrollOffsetFor(openingMinutes({ isToday: false, nowMin: 0, dayStartMin: at(5) })), 5 * PX_PER_HOUR);
});
