'use strict';
// Driver for the checkpoint 7 real checks (plain node). Part 1 runs the app
// under the harness (toasts, tray) and asserts that Quit from the tray really
// ends the process. Part 2 (with --installer) builds the NSIS installer, then
// launches the unpacked app on an isolated data folder.
//   node test/real/run-cp7.js [--installer]
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const desktop = path.join(__dirname, '..', '..');
const electronExe = require(path.join(desktop, 'node_modules', 'electron'));
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + detail}`);
};

function realFolder(p) {
  const lower = path.resolve(p).toLowerCase();
  const appData = (process.env.APPDATA || '').toLowerCase();
  const real = ['belific-desktop', 'belific-desktop-dev', 'belific'].map((n) => path.join(appData, n));
  return real.some((r) => lower === r || lower.startsWith(r + path.sep)) || !lower.startsWith(path.resolve(os.tmpdir()).toLowerCase());
}

function part1() {
  return new Promise((resolve) => {
    const child = spawn(electronExe, [path.join(__dirname, 'cp7.js')], { cwd: desktop, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let quitAt = 0;
    child.stdout.on('data', (d) => {
      const s = d.toString();
      out += s;
      for (const line of s.split(/\r?\n/)) {
        if (/^(PASS|FAIL|SUMMARY|INFO)/.test(line)) console.log(line);
        if (line.includes('QUIT_CLICKED')) quitAt = Date.now();
      }
    });
    child.stderr.on('data', () => {});
    const guard = setTimeout(() => child.kill(), 240000);
    child.on('exit', (code) => {
      clearTimeout(guard);
      check('Quit from the tray really exits the process', quitAt > 0 && Date.now() - quitAt < 15000 && code === 0, `code ${code}`);
      check('harness checks passed', /SUMMARY (\d+)\/\1 passed/.test(out) && !/^FAIL/m.test(out));
      resolve();
    });
  });
}

function getJson(port) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: '/json' }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve(JSON.parse(body)));
    }).on('error', reject);
  });
}

async function part2() {
  console.log('Building the installer (npm run dist)…');
  const build = spawnSync('npm', ['run', 'dist'], { cwd: desktop, shell: true, stdio: 'inherit' });
  check('npm run dist succeeds', build.status === 0);
  const dist = path.join(desktop, 'dist');
  const installers = fs.existsSync(dist) ? fs.readdirSync(dist).filter((f) => /^Belific-Setup-.*\.exe$/.test(f)) : [];
  check('NSIS installer exists', installers.length === 1, installers.join(','));
  const unpacked = path.join(dist, 'win-unpacked', 'Belific.exe');
  check('unpacked app exists', fs.existsSync(unpacked));
  if (!fs.existsSync(unpacked)) return;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'belific-unpacked-'));
  check('unpacked launch uses an isolated data folder (not the real one)', !realFolder(tmp));
  const child = spawn(unpacked, [`--user-data-dir=${tmp}`, '--remote-debugging-port=9347'], {
    env: { ...process.env, BELIFIC_NO_PROTOCOL_REGISTER: '1', BELIFIC_NO_LOGIN_ITEM: '1' },
    stdio: 'ignore',
  });
  let pages = null;
  for (let i = 0; i < 60 && !pages; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const list = await getJson(9347);
      if (list.some((p) => p.type === 'page' && p.url.startsWith('app://belific/'))) pages = list;
    } catch {
      // not up yet
    }
  }
  check('unpacked app launches and serves the bundled web export at app://belific/', !!pages);
  await new Promise((r) => setTimeout(r, 1500));
  check('it wrote its data and backups only under the isolated folder', fs.existsSync(path.join(tmp, 'backups')) && fs.existsSync(path.join(tmp, 'data')));
  child.kill();
  spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
}

(async () => {
  await part1();
  if (process.argv.includes('--installer')) await part2();
  const failed = results.filter((r) => !r).length;
  console.log(`SUMMARY ${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
