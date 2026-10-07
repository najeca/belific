'use strict';
// The iOS bundle marker gate (checkpoint 11, decision 018). After
//   npx expo export --platform ios --output-dir <temp folder outside the repo>
// run
//   npm run check:ios-markers -- <that folder>
// It reads the Hermes bundle (.hbc) and fails (exit 1) if any desktop only
// marker is in it. A missing folder or a folder without a bundle exits 2, so a
// failed export can never look like a clean one.
//
// MARKERS are names and strings that must NOT be in the phone's bundle.
//
// ALLOWED is the one explicit exception: `copyRoutineCompletions` is an inert
// exported helper in the shared storage.ts that the phone never calls. Hermes
// de-duplicates strings, so a bundle count cannot show whether a name is used;
// the allowed name is therefore checked in SOURCE: git grep must find it only
// in the files listed in ALLOWED_FILES.
//
// `seriesStreak` is a marker only until the iOS catch-up release reuses the
// streak code. Whoever ships the phone feature must remove that marker from this
// list on purpose (and say so in the commit), not by accident.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const MARKERS = [
  'listenForAuthCallbacks',
  'startAppleSignIn',
  'SettingsPage',
  'LabelsPage',
  'ProgressPage',
  'seriesStreak',
  'RoutineConvertRow',
  'convertRoutines',
  'undoConversion',
  'routineConvertActions',
  'routine-convert',
  'Convert routines from your iPhone',
  'Show streaks',
];

const ALLOWED = {
  copyRoutineCompletions: 'inert helper in the shared storage.ts, never called by the phone',
};

// Where an allowed name may appear in source (repo relative, forward slashes).
const ALLOWED_FILES = new Set([
  'mobile/lib/storage.ts',
  'mobile/lib/routineConvertActions.ts',
  'mobile/scripts/ios-markers.js', // names it in the allow list
]);

function findBundles(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.hbc')) out.push(p);
    }
  };
  walk(dir);
  return out;
}

function count(buffer, text) {
  const needle = Buffer.from(text, 'utf8');
  let n = 0;
  for (let i = buffer.indexOf(needle); i !== -1; i = buffer.indexOf(needle, i + needle.length)) n += 1;
  return n;
}

// -> { error } when the folder or bundle is missing, else { hits, allowed }.
function scanBundle(dir, markers = MARKERS, allowed = ALLOWED) {
  if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return { error: `export folder not found: ${dir}` };
  const bundles = findBundles(dir);
  if (bundles.length === 0) return { error: `no .hbc bundle under ${dir}` };
  const hits = [];
  const seenAllowed = [];
  for (const file of bundles) {
    const buf = fs.readFileSync(file);
    for (const m of markers) {
      const n = count(buf, m);
      if (n > 0) hits.push({ marker: m, count: n, file: path.basename(file) });
    }
    for (const name of Object.keys(allowed)) {
      const n = count(buf, name);
      if (n > 0) seenAllowed.push({ marker: name, count: n, reason: allowed[name] });
    }
  }
  return { hits, allowed: seenAllowed };
}

// Source level check for the allowed names: files (tracked or untracked, not
// ignored) under mobile/ and desktop/ that mention them.
function sourceOffenders(root, allowed = ALLOWED, allowedFiles = ALLOWED_FILES) {
  const offenders = [];
  for (const name of Object.keys(allowed)) {
    const r = spawnSync('git', ['grep', '-l', '-I', '--untracked', '-e', name, '--', 'mobile', 'desktop'], { cwd: root, encoding: 'utf8' });
    if (r.status !== 0 && r.status !== 1) return { error: `git grep failed: ${r.stderr || r.error}` };
    for (const line of (r.stdout || '').split('\n').map((l) => l.trim()).filter(Boolean)) {
      const file = line.replace(/\\/g, '/');
      const test = /\.test\.(ts|js)$/.test(file) || /^desktop\/test\//.test(file);
      if (!allowedFiles.has(file) && !test) offenders.push({ marker: name, file });
    }
  }
  return { offenders };
}

function main(argv) {
  const dir = argv[0];
  const bundle = scanBundle(dir);
  if (bundle.error) {
    console.error(`ios-markers: ${bundle.error}`);
    return 2;
  }
  const root = path.resolve(__dirname, '..', '..');
  const source = sourceOffenders(root);
  if (source.error) {
    console.error(`ios-markers: ${source.error}`);
    return 2;
  }
  let failed = false;
  for (const h of bundle.hits) {
    failed = true;
    console.error(`FAIL marker in the iOS bundle: ${h.marker} (${h.count}) in ${h.file}`);
  }
  for (const o of source.offenders) {
    failed = true;
    console.error(`FAIL ${o.marker} is referenced outside its allowed files: ${o.file}`);
  }
  for (const a of bundle.allowed) console.log(`allowed: ${a.marker} x${a.count} (${a.reason}); source references checked`);
  console.log(failed ? 'ios-markers: FAILED' : `ios-markers: OK, ${MARKERS.length} markers, 0 hits`);
  return failed ? 1 : 0;
}

module.exports = { MARKERS, ALLOWED, ALLOWED_FILES, scanBundle, sourceOffenders, main };

if (require.main === module) process.exitCode = main(process.argv.slice(2));
