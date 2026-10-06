'use strict';
// Driver for the checkpoint 8.2 real pointer checks (plain node). Phase 1 runs
// the whole interaction check on a fresh isolated data folder; phase 2
// relaunches on the SAME folder to prove the filter was remembered across a
// relaunch. Screenshots go to BELIFIC_SHOTS when set.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const desktop = path.join(__dirname, '..', '..');
const electronExe = require(path.join(desktop, 'node_modules', 'electron'));

function run(phase, userData) {
  const env = { ...process.env, BELIFIC_PHASE: phase };
  if (userData) env.BELIFIC_REAL_USERDATA = userData;
  const r = spawnSync(electronExe, [path.join(__dirname, 'cp8b.js')], { cwd: desktop, env, encoding: 'utf8', timeout: 400000 });
  const out = (r.stdout || '') + (r.stderr || '');
  for (const line of out.split(/\r?\n/)) if (/^(PASS|FAIL|SUMMARY|INFO)/.test(line)) console.log(line);
  const m = /USERDATA (.+)/.exec(out);
  return { status: r.status, userData: m ? m[1].trim() : null, out };
}

console.log('--- phase 1: interaction checks');
const one = run('1');
if (!one.userData) {
  console.log('FAIL no isolated data folder was reported');
  process.exit(1);
}
console.log('--- phase 2: relaunch on the same folder');
const two = run('2', one.userData);
const ok = one.status === 0 && two.status === 0;
console.log(ok ? 'ALL PASSED' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
