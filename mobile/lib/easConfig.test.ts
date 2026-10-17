// mobile/eas.json and app.json for the TestFlight build (2.18.1). No EAS command
// is run and nothing is contacted: this only reads the two files. The project
// URL and the publishable key are EAS environment variables on Expo's servers,
// never in the repo (docs/BELIFIC_EAS_TESTFLIGHT.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const eas = JSON.parse(fs.readFileSync(path.join(ROOT, 'eas.json'), 'utf8'));
const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
const raw = fs.readFileSync(path.join(ROOT, 'eas.json'), 'utf8');

test('the production profile reads the production EAS environment', () => {
  assert.equal(eas.build.production.environment, 'production');
  assert.equal(eas.build.production.ios.distribution, 'store');
  assert.equal(eas.build.production.ios.buildConfiguration, 'Release');
  assert.equal(eas.build.production.ios.simulator, false);
});

test('no variable values, keys or project addresses are in eas.json', () => {
  assert.equal(eas.build.production.env, undefined, 'no inline env block: values live in EAS');
  assert.doesNotMatch(raw, /SUPABASE|EXPO_PUBLIC|supabase\.co|sb_publishable|eyJ|secret|ANON/i);
});

test('only environment is added: no appVersionSource and no autoIncrement (the build number is raised by hand in app.json)', () => {
  const allowedTop = new Set(['cli', 'build', 'submit']);
  for (const k of Object.keys(eas)) assert.ok(allowedTop.has(k), k);
  assert.equal(eas.appVersionSource, undefined);
  assert.doesNotMatch(raw, /appVersionSource|autoIncrement/);
  const allowedProfile = new Set(['environment', 'ios']);
  for (const k of Object.keys(eas.build.production)) assert.ok(allowedProfile.has(k), k);
  const allowedCli = new Set(['version']);
  for (const k of Object.keys(eas.cli)) assert.ok(allowedCli.has(k), k);
});

test('submit.production exists and is empty: Apple details are asked for interactively, never stored', () => {
  assert.deepEqual(Object.keys(eas.submit), ['production']);
  assert.deepEqual(eas.submit.production, {});
});

test('the app is 2.25.0, bundle com.najeca.belific, scheme belific (the callback link)', () => {
  assert.equal(app.expo.version, '2.25.0');
  assert.equal(app.expo.ios.bundleIdentifier, 'com.najeca.belific');
  assert.equal(app.expo.scheme, 'belific');
  assert.equal(app.expo.ios.usesAppleSignIn, true);
});

test('phase 8: expo-calendar pinned to the SDK 54 version, calendar read text present, no Reminders permission asked for', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.dependencies['expo-calendar'], '15.0.8');
  const plist = app.expo.ios.infoPlist;
  for (const k of ['NSCalendarsUsageDescription', 'NSCalendarsFullAccessUsageDescription']) {
    assert.match(plist[k], /only reads them: it never changes, copies or uploads them/, k);
  }
  assert.equal(plist.NSRemindersUsageDescription, undefined);
  assert.equal(plist.NSRemindersFullAccessUsageDescription, undefined);
  assert.equal(plist.NSCalendarsWriteOnlyAccessUsageDescription, undefined, 'no write access: Belific never writes to the phone calendar');
  // The package's config plugin would add Reminders texts; the strings are set directly instead.
  assert.ok(!JSON.stringify(app.expo.plugins).includes('expo-calendar'));
});
