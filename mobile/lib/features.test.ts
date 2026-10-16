// Run with `npm test` from mobile/. Power feature toggles (build plan phase 7).
import test from 'node:test';
import assert from 'node:assert/strict';
import { FEATURES, defaultFeatures, featureSettingKey, featureValue, featuresFromSettings, parseFeature } from './features.ts';
import { MAX_SETTING_VALUE, sanitizeSettingValue } from './syncCore.ts';

const STAMP = '2026-10-16T00:00:00.000Z';
const row = (key: string, value: string, deletedAt?: string) => ({ key, value, updatedAt: STAMP, ...(deletedAt ? { deletedAt } : {}) });

test('the seven power features, each with a stable setting key', () => {
  assert.deepEqual(FEATURES.map((f) => f.key), ['dueDates', 'priority', 'planning', 'pomodoro', 'templates', 'analytics', 'attachments']);
  assert.equal(featureSettingKey('pomodoro'), 'feature.pomodoro');
  for (const f of FEATURES) assert.ok(f.label && f.emoji && f.hint, f.key);
  assert.ok(FEATURES.every((f) => featureSettingKey(f.key).length < 40));
});

test('defaults keep the existing screens (reminders, priority, planning, analytics on); the new ones start off', () => {
  const d = defaultFeatures();
  assert.deepEqual(d, { dueDates: true, priority: true, planning: true, pomodoro: false, templates: false, analytics: true, attachments: false });
});

test('on and off are the only values; anything else is the default', () => {
  const pomodoro = FEATURES.find((f) => f.key === 'pomodoro')!;
  const priority = FEATURES.find((f) => f.key === 'priority')!;
  assert.equal(parseFeature(pomodoro, 'on'), true);
  assert.equal(parseFeature(pomodoro, 'off'), false);
  assert.equal(parseFeature(pomodoro, 'banana'), false, 'its default');
  assert.equal(parseFeature(priority, 'banana'), true, 'its default');
  assert.equal(parseFeature(priority, undefined), true);
  assert.equal(parseFeature(priority, null), true);
  assert.equal(featureValue(true), 'on');
  assert.equal(featureValue(false), 'off');
});

test('attachments are not built: the toggle cannot be on, whatever is stored', () => {
  const a = FEATURES.find((f) => f.key === 'attachments')!;
  assert.equal(a.comingLater, true);
  assert.equal(parseFeature(a, 'on'), false);
  assert.equal(featuresFromSettings([row('feature.attachments', 'on')]).attachments, false);
});

test('from the settings rows: stored values win, deleted rows and other keys are ignored', () => {
  const f = featuresFromSettings([
    row('feature.pomodoro', 'on'),
    row('feature.priority', 'off'),
    row('feature.analytics', 'off', STAMP),
    row('ui.panes', '{}'),
    row('template.x', '{}'),
  ]);
  assert.equal(f.pomodoro, true);
  assert.equal(f.priority, false);
  assert.equal(f.analytics, true, 'a deleted row is the default');
  assert.equal(f.templates, false);
});

test('a toggle value always fits a setting', () => {
  assert.equal(sanitizeSettingValue(featureValue(true)), 'on');
  assert.ok('off'.length < MAX_SETTING_VALUE);
});
