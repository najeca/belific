'use strict';
// Builds the unsigned Windows installer: first the Expo web export (into
// mobile/dist, bundled as resources/web), then electron-builder (NSIS, per
// user). The app version comes from mobile/app.json, so there is one number.
//   npm run dist            installer + unpacked app in desktop/dist
//   npm run dist -- --dir   unpacked app only (faster)
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const desktop = path.join(__dirname, '..');
const appJson = JSON.parse(fs.readFileSync(path.join(desktop, '..', 'mobile', 'app.json'), 'utf8'));
const version = appJson.expo.version;

function run(command, args) {
  const result = spawnSync([command, ...args].join(' '), { cwd: desktop, stdio: 'inherit', shell: true });
  if (result.status !== 0) process.exit(result.status === null ? 1 : result.status);
}

fs.rmSync(path.join(desktop, 'dist'), { recursive: true, force: true });
run('node', ['scripts/build-web.js']);
// Never sign, never publish: this is an unsigned local installer.
const builderArgs = ['electron-builder', '--win', '--x64', '--publish', 'never', `-c.extraMetadata.version=${version}`];
if (process.argv.includes('--dir')) builderArgs.push('--dir');
run('npx', builderArgs);
console.log(`Built Belific ${version} in desktop/dist`);
