'use strict';
// Internal build step: export the Expo app for web into mobile/dist, which
// the Electron shell serves. The export is never hosted anywhere.
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const mobileDir = path.join(__dirname, '..', '..', 'mobile');
const result = spawnSync('npx', ['expo', 'export', '--platform', 'web'], {
  cwd: mobileDir,
  stdio: 'inherit',
  shell: true,
});
process.exitCode = result.status === null ? 1 : result.status;
