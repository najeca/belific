'use strict';
// Shared helpers for the real-app checks (run with Electron, not node --test).
// Every launch uses an isolated data folder, asserted NOT to be the real
// belific-desktop folder, and never touches the real Supabase project:
// every request to the Supabase host is cancelled and recorded.
const { app, BrowserWindow, session } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MAIN = path.join(__dirname, '..', '..', 'main.js');
const SUPABASE_HOST = 'uucycebkpgwbktdytxvr.supabase.co';

function realFolders() {
  const appData = app.getPath('appData');
  return [path.join(appData, 'belific-desktop'), path.join(appData, 'belific-desktop-dev'), path.join(appData, 'Belific')]
    .map((p) => path.resolve(p).toLowerCase());
}

// Sets userData to a folder under the OS temp dir (or the one given by the
// parent run) and asserts it is isolated before main.js loads.
function isolate() {
  const userData = path.resolve(process.env.BELIFIC_REAL_USERDATA || fs.mkdtempSync(path.join(os.tmpdir(), 'belific-real-')));
  const lower = userData.toLowerCase();
  if (!lower.startsWith(path.resolve(os.tmpdir()).toLowerCase())) throw new Error(`ASSERT: ${userData} is not under the temp folder`);
  for (const real of realFolders()) {
    if (lower === real || lower.startsWith(real + path.sep)) throw new Error(`ASSERT: ${userData} is a real data folder`);
  }
  app.setPath('userData', userData);
  if (app.getPath('userData') !== userData) throw new Error('ASSERT: userData was not applied');
  return userData;
}

// Records every request leaving a window session and cancels any to Supabase.
function watchNetwork() {
  const seen = [];
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    let host = '';
    try {
      const u = new URL(details.url);
      host = u.protocol === 'app:' || u.protocol === 'devtools:' || u.protocol === 'data:' ? '' : u.host;
    } catch {
      host = 'unparseable';
    }
    if (host) seen.push(host);
    callback({ cancel: host === SUPABASE_HOST });
  });
  return seen;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, ms = 15000, step = 100) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('waitFor timed out');
    await sleep(step);
  }
}

function seedTasks(userData, tasks) {
  const dir = path.join(userData, 'data');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'belific_tasks.kv'), JSON.stringify(tasks));
}

function makeChecker() {
  const results = [];
  return {
    check(name, ok, detail = '') {
      results.push({ name, ok: !!ok });
      console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`);
    },
    summary() {
      const failed = results.filter((r) => !r.ok).length;
      console.log(`SUMMARY ${results.length - failed}/${results.length} passed`);
      return failed;
    },
  };
}

function firstWindow() {
  return BrowserWindow.getAllWindows()[0];
}

module.exports = { MAIN, SUPABASE_HOST, isolate, watchNetwork, sleep, waitFor, seedTasks, makeChecker, firstWindow };
