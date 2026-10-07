'use strict';
// Driver for the duration chip and dropdown real check (plain node): one fresh
// isolated data folder. Screenshots go to BELIFIC_SHOTS when set.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const desktop = path.join(__dirname, '..', '..');
const electronExe = require(path.join(desktop, 'node_modules', 'electron'));

const env = { ...process.env };
delete env.BELIFIC_REAL_USERDATA;
const r = spawnSync(electronExe, [path.join(__dirname, 'cp8f.js')], { cwd: desktop, env, encoding: 'utf8', timeout: 400000 });
const out = (r.stdout || '') + (r.stderr || '');
for (const line of out.split(/\r?\n/)) if (/^(PASS|FAIL|SUMMARY|INFO)/.test(line)) console.log(line);
console.log(r.status === 0 ? 'ALL PASSED' : 'SOME FAILED');
process.exit(r.status === 0 ? 0 : 1);
