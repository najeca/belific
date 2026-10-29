'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULTS, sanitize, loadSettings } = require('../src/settings');

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

test('showStreaks defaults to on, is a boolean, and ignores anything else (checkpoint 11)', () => {
  assert.equal(DEFAULTS.showStreaks, true);
  assert.equal(sanitize({}).showStreaks, true);
  assert.equal(sanitize({ showStreaks: false }).showStreaks, false);
  const off = sanitize({ showStreaks: false });
  for (const bad of ['no', 0, null, undefined, {}]) assert.equal(sanitize({ showStreaks: bad }, off).showStreaks, false, JSON.stringify(bad));
  assert.equal(sanitize({ dailyTime: '08:00' }, off).showStreaks, false);
});

test('vibrantColours defaults to ON (3.19.0, new users), is a boolean, and ignores anything else (Vibrant task colours)', () => {
  assert.equal(DEFAULTS.vibrantColours, true);
  assert.equal(sanitize({}).vibrantColours, true);
  assert.equal(sanitize({ vibrantColours: false }).vibrantColours, false);
  assert.equal(sanitize({ vibrantColours: true }).vibrantColours, true);
  const on = sanitize({ vibrantColours: true });
  for (const bad of ['yes', 1, null, undefined, {}]) assert.equal(sanitize({ vibrantColours: bad }, on).vibrantColours, true, JSON.stringify(bad));
  assert.equal(sanitize({ dailyTime: '08:00' }, on).vibrantColours, true);
});

test('theme defaults to light and accepts light, dark and system only', () => {
  assert.equal(DEFAULTS.theme, 'light');
  assert.equal(sanitize({}).theme, 'light');
  for (const v of ['light', 'dark', 'system']) assert.equal(sanitize({ theme: v }).theme, v);
  const current = sanitize({ theme: 'dark' });
  for (const bad of ['Dark', 'auto', '', 1, null, undefined, true, {}]) assert.equal(sanitize({ theme: bad }, current).theme, 'dark', JSON.stringify(bad));
  assert.equal(sanitize({}, { ...DEFAULTS, theme: 'purple' }).theme, 'light');
  assert.equal(sanitize({ theme: 'dark' }).vibrantColours, true);
});

// ---- 3.19.0: defaults for NEW users only ----
const memKv = (stored) => ({ getItem: async () => stored, setItem: async () => {} });

test('3.19.0: a new user (nothing ever saved) gets Vibrant task colours ON and Theme Light', async () => {
  const s = await loadSettings(memKv(null));
  assert.equal(s.vibrantColours, true);
  assert.equal(s.theme, 'light', 'Light, not Match system');
  assert.equal(s.showStreaks, true, 'the rest of the defaults are untouched');
  assert.deepEqual(s.defaultReminders, [0]);
});

test('3.19.0: settings saved before are not changed: no vibrant key means it was off and stays off, theme stays', async () => {
  const older = JSON.stringify({ dailyTime: '08:30', theme: 'dark', showStreaks: false });
  const s = await loadSettings(memKv(older));
  assert.equal(s.vibrantColours, false);
  assert.equal(s.theme, 'dark');
  assert.equal(s.dailyTime, '08:30');
  assert.equal(s.showStreaks, false);
  // Saved on Match system stays on Match system; a saved theme is never replaced by the default.
  assert.equal((await loadSettings(memKv(JSON.stringify({ theme: 'system' })))).theme, 'system');
  // A file with no theme either was written when Light was the default: Light.
  assert.equal((await loadSettings(memKv(JSON.stringify({ dailyTime: '08:30' })))).theme, 'light');
});

test('3.19.0: an explicit saved choice is kept either way', async () => {
  assert.equal((await loadSettings(memKv(JSON.stringify({ vibrantColours: false })))).vibrantColours, false);
  assert.equal((await loadSettings(memKv(JSON.stringify({ vibrantColours: true })))).vibrantColours, true);
});

test('3.19.0: a file that cannot be read keeps the old default (it was somebody\'s settings), a store that cannot be read is a new start', async () => {
  assert.equal((await loadSettings(memKv('{not json'))).vibrantColours, false);
  assert.equal((await loadSettings(memKv('null'))).vibrantColours, true, 'an empty saved value is not saved settings');
  assert.equal((await loadSettings({ getItem: async () => { throw new Error('boom'); }, setItem: async () => {} })).vibrantColours, true);
});

test('3.19.0: the first save writes the whole object, so a new user keeps ON afterwards and an old user keeps OFF', async () => {
  const fresh = sanitize({ theme: 'dark' }, await loadSettings(memKv(null)));
  assert.equal(fresh.vibrantColours, true);
  const old = sanitize({ theme: 'dark' }, await loadSettings(memKv(JSON.stringify({ dailyTime: '08:30' }))));
  assert.equal(old.vibrantColours, false);
});
