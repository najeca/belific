import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Checkpoint 11: the iOS marker gate (mobile/scripts/ios-markers.js). It must
// exit non zero on any marker, on a missing export folder and on a folder with
// no bundle; it must allow exactly copyRoutineCompletions, and only while the
// source references stay in the allowed files.
const require = createRequire(import.meta.url);
const markers = require('../scripts/ios-markers.js');
const SCRIPT = path.resolve(import.meta.dirname, '..', 'scripts', 'ios-markers.js');

function exportDir(bundleText: string | null): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'belific-ios-markers-'));
  if (bundleText !== null) {
    const js = path.join(dir, '_expo', 'static', 'js', 'ios');
    fs.mkdirSync(js, { recursive: true });
    fs.writeFileSync(path.join(js, 'index-abc.hbc'), Buffer.concat([Buffer.from([0xc6, 0x1f, 0xbc, 0x03]), Buffer.from(bundleText, 'utf8')]));
  }
  return dir;
}

function cli(dir: string | undefined): { code: number | null; err: string } {
  const r = spawnSync(process.execPath, dir === undefined ? [SCRIPT] : [SCRIPT, dir], { encoding: 'utf8' });
  return { code: r.status, err: r.stderr };
}

test('the marker list includes the checkpoint 11 markers and the earlier desktop ones', () => {
  for (const m of ['ProgressPage', 'seriesStreak', 'SettingsPage', 'LabelsPage', 'RoutineConvertRow', 'listenForAuthCallbacks', 'startAppleSignIn', 'SignInPage']) {
    assert.ok(markers.MARKERS.includes(m), m);
  }
});

test('2.18.1: the phone gets its own Google sign in, so two markers were removed on purpose and desktop only auth names were added', () => {
  for (const removed of ['startGoogleSignIn', 'Continue with Google']) assert.ok(!markers.MARKERS.includes(removed), `${removed} is no longer a marker`);
  for (const added of ['signOutDesktop', 'deleteAccountDesktop', 'answerAccountChoice', 'restoreAccountChoice', 'handleAuthCallback']) {
    assert.ok(markers.MARKERS.includes(added), added);
  }
  // the desktop only code itself still defines these names, so the gate is not empty
  const desktopAuth = fs.readFileSync(path.resolve(import.meta.dirname, 'desktopAuth.ts'), 'utf8');
  for (const name of ['signOutDesktop', 'deleteAccountDesktop', 'answerAccountChoice', 'restoreAccountChoice', 'handleAuthCallback', 'startGoogleSignIn']) assert.match(desktopAuth, new RegExp(name));
  // and no phone file defines or uses a desktop only marker
  const phoneFiles = ['phoneGoogleAuth.ts', 'phoneGoogleFlow.ts', 'phoneAuthCore.ts', 'auth.ts', '../app/settings.tsx', '../app/+native-intent.ts'];
  for (const f of phoneFiles) {
    const text = fs.readFileSync(path.resolve(import.meta.dirname, f), 'utf8');
    for (const m of markers.MARKERS) assert.ok(!text.includes(m), `${f} contains the desktop only marker ${m}`);
  }
});

test('2.21.0: the iPhone gets Convert routines and Quests, so three markers were removed on purpose; the desktop row stays protected', () => {
  for (const removed of ['convertRoutines', 'undoConversion', 'routineConvertActions']) assert.ok(!markers.MARKERS.includes(removed), `${removed} is no longer a marker`);
  for (const kept of ['RoutineConvertRow', 'routine-convert', 'Convert routines from your iPhone', 'seriesStreak', 'ProgressPage']) assert.ok(markers.MARKERS.includes(kept), kept);
  // no new phone file uses a desktop only marker
  const phoneFiles = ['../components/legacy/QuestsScreen.tsx', '../components/legacy/BrainDumpScreen.tsx', '../app/components/RoutineConvertSection.tsx', 'quests.ts', 'questActions.ts', 'lists.ts', 'emoji.ts'];
  for (const f of phoneFiles) {
    const text = fs.readFileSync(path.resolve(import.meta.dirname, f), 'utf8');
    for (const m of markers.MARKERS) assert.ok(!text.includes(m), `${f} contains the desktop only marker ${m}`);
  }
});

test('the only allowed name is copyRoutineCompletions', () => {
  assert.deepEqual(Object.keys(markers.ALLOWED), ['copyRoutineCompletions']);
  assert.ok(!markers.MARKERS.includes('copyRoutineCompletions'));
});

test('a missing export folder is an error, and the command exits 2', () => {
  const gone = path.join(os.tmpdir(), 'belific-no-such-export-folder');
  assert.ok(markers.scanBundle(gone).error);
  assert.equal(cli(gone).code, 2);
  assert.equal(cli(undefined).code, 2);
});

test('a folder without a bundle is an error, not a clean pass', () => {
  const dir = exportDir(null);
  assert.ok(markers.scanBundle(dir).error);
  assert.equal(cli(dir).code, 2);
});

test('a clean bundle passes with exit 0', () => {
  const dir = exportDir('nothing desktop here, only TodayScreen and SomethingElse');
  const r = markers.scanBundle(dir);
  assert.deepEqual(r.hits, []);
  assert.equal(cli(dir).code, 0);
});

test('every marker fails the gate with exit 1, ProgressPage and seriesStreak included', () => {
  for (const m of markers.MARKERS) {
    const dir = exportDir(`xx ${m} yy`);
    assert.deepEqual(markers.scanBundle(dir).hits.map((h: { marker: string }) => h.marker), [m], m);
    const r = cli(dir);
    assert.equal(r.code, 1, m);
    assert.ok(r.err.includes(m), m);
  }
});

test('the allowed name in the bundle is reported but does not fail', () => {
  const dir = exportDir('xx copyRoutineCompletions yy');
  const r = markers.scanBundle(dir);
  assert.deepEqual(r.hits, []);
  assert.equal(r.allowed[0].marker, 'copyRoutineCompletions');
  assert.equal(cli(dir).code, 0);
});

test('source check: the allowed name is fine in its files and tests, an offender anywhere else', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'belific-ios-src-'));
  spawnSync('git', ['init', '-q'], { cwd: dir });
  const write = (name: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  };
  write('mobile/lib/storage.ts', 'export function copyRoutineCompletions() {}');
  write('mobile/lib/routineConvertActions.ts', 'copyRoutineCompletions();');
  write('mobile/lib/storage.test.ts', 'copyRoutineCompletions');
  assert.deepEqual(markers.sourceOffenders(dir).offenders, []);
  write('mobile/app/(tabs)/today.tsx', 'copyRoutineCompletions();');
  assert.deepEqual(markers.sourceOffenders(dir).offenders, [{ marker: 'copyRoutineCompletions', file: 'mobile/app/(tabs)/today.tsx' }]);
});

test('the real repository passes the source check today', () => {
  const root = path.resolve(import.meta.dirname, '..', '..');
  assert.deepEqual(markers.sourceOffenders(root).offenders, []);
});

// PLAN_phone (the iPhone catch-up, 2.49.0 on): each marker removed on purpose, with its phase. A
// removal not listed here (or a listed one put back) fails, so every change to the list is deliberate.
const PHONE_REMOVED: Record<string, string[]> = {
  P1: ['Match system'],
  // P5: the phone's own per phone "Show streaks" switch (Settings). seriesStreak is still a marker.
  P5: ['Show streaks'],
  // P7: the phone's reminders and extra times. setDefaultReminders and the desktop's settings line stay markers.
  P7: ['effectiveReminders', 'Add another time'],
};
test('PLAN_phone: markers removed on purpose, by phase; the desktop only theme functions stay markers', () => {
  for (const [phase, names] of Object.entries(PHONE_REMOVED)) {
    for (const n of names) assert.ok(!markers.MARKERS.includes(n), `${phase}: ${n} is no longer a marker`);
  }
  for (const kept of ['seriesStreak', 'setDefaultReminders', 'Reminders for a timed task', 'installTheme', 'setThemeMode', 'vibrantColor', 'resizeRefusal', 'searchEmoji', 'Smallest piece when a break splits a task']) assert.ok(markers.MARKERS.includes(kept), kept);
});
