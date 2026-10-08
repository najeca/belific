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
  for (const m of ['ProgressPage', 'seriesStreak', 'SettingsPage', 'LabelsPage', 'RoutineConvertRow', 'listenForAuthCallbacks', 'startAppleSignIn', 'startGoogleSignIn', 'SignInPage', 'Continue with Google']) {
    assert.ok(markers.MARKERS.includes(m), m);
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
