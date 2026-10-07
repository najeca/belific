'use strict';
// Driver for the checkpoint 8.3 real checks (plain node). Phase 1 is the whole
// interaction check on a fresh isolated data folder; phase 2 relaunches on the
// SAME folder to prove a running timer survives closing the app; phases 3 and 4
// each start on a fresh folder with a timer left running over 12 hours; phase 5
// starts with a stored timer whose task is completed. Screenshots go to
// BELIFIC_SHOTS when set.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const desktop = path.join(__dirname, '..', '..');
const electronExe = require(path.join(desktop, 'node_modules', 'electron'));

function run(phase, userData) {
  const env = { ...process.env, BELIFIC_PHASE: phase };
  delete env.BELIFIC_REAL_USERDATA;
  if (userData) env.BELIFIC_REAL_USERDATA = userData;
  const r = spawnSync(electronExe, [path.join(__dirname, 'cp8f.js')], { cwd: desktop, env, encoding: 'utf8', timeout: 400000 });
  const out = (r.stdout || '') + (r.stderr || '');
  for (const line of out.split(/\r?\n/)) if (/^(PASS|FAIL|SUMMARY|INFO)/.test(line)) console.log(line);
  const m = /USERDATA (.+)/.exec(out);
  return { status: r.status, userData: m ? m[1].trim() : null };
}

let ok = true;
console.log('--- phase 1: interaction checks');
const one = run('1');
ok = ok && one.status === 0 && !!one.userData;
if (one.userData) {
  console.log('--- phase 2: relaunch on the same folder, timer still running');
  ok = run('2', one.userData).status === 0 && ok;
}
console.log('--- phase 3: a timer left over 12 hours, answered with Add');
ok = run('3').status === 0 && ok;
console.log('--- phase 4: a timer left over 12 hours, answered with a typed time');
ok = run('4').status === 0 && ok;
console.log('--- phase 5: startup with a timer whose task is completed');
ok = run('5').status === 0 && ok;
console.log(ok ? 'ALL PASSED' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
