'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULTS, sanitize } = require('../src/settings');

test('dayStart defaults to 05:00', () => {
  assert.equal(DEFAULTS.dayStart, '05:00');
  assert.equal(sanitize({}).dayStart, '05:00');
});

test('dayStart accepts a time in 30 minute steps', () => {
  for (const v of ['00:00', '05:30', '20:00', '23:30']) assert.equal(sanitize({ dayStart: v }).dayStart, v);
});

test('dayStart ignores anything else and keeps the current value', () => {
  const current = sanitize({ dayStart: '20:00' });
  for (const bad of ['05:15', '24:00', '5:00', '', 'noon', 500, null, undefined, true, {}]) {
    assert.equal(sanitize({ dayStart: bad }, current).dayStart, '20:00', JSON.stringify(bad));
  }
});

test('a hand edited stored dayStart that is not valid falls back to the default', () => {
  assert.equal(sanitize({}, { ...DEFAULTS, dayStart: '07:13' }).dayStart, '05:00');
  assert.equal(sanitize({}, { ...DEFAULTS, dayStart: undefined }).dayStart, '05:00');
});

test('other settings are unaffected by dayStart', () => {
  const out = sanitize({ dayStart: '20:00', dailyTime: '08:30', notifyEvents: false });
  assert.equal(out.dailyTime, '08:30');
  assert.equal(out.notifyEvents, false);
  assert.equal(out.closeToTray, true);
});
