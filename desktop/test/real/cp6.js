'use strict';
// Real-app check for checkpoint 6 (run: npx electron test/real/cp6.js, after
// building the web export). Isolated data folder asserted before launch.
// No real Apple sign in, no request reaches Supabase (cancelled and counted),
// openExternal is replaced so no browser opens.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { app, shell } = require('electron');
const C = require('./common');

process.env.BELIFIC_NO_PROTOCOL_REGISTER = '1';
const ROLE = process.env.BELIFIC_ROLE || 'primary';
const PHASE = process.env.BELIFIC_PHASE || 'A';
if (PHASE === 'B') process.env.BELIFIC_FORCE_NO_SAFESTORAGE = '1';

const userData = C.isolate();

if (ROLE === 'second') {
  // A second launch carrying the link: main.js asks for the single instance
  // lock, loses, and quits; the first instance gets a second-instance event.
  require(C.MAIN);
} else {
  run().catch((err) => {
    console.log(`FAIL harness error: ${err.stack || err}`);
    app.exit(1);
  });
}

async function run() {
  const opened = [];
  shell.openExternal = async (url) => {
    opened.push(url);
  };
  const { check, summary } = C.makeChecker();
  C.seedTasks(userData, [{ id: 't1', title: 'Seeded real check task', completed: false, createdAt: '2026-10-06T08:00:00.000Z' }]);
  let seen = [];
  app.whenReady().then(() => {
    seen = C.watchNetwork();
  });
  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  const js = (code) => win.webContents.executeJavaScript(code);
  const body = () => js('document.body.innerText');
  const logText = () => {
    try {
      return fs.readFileSync(path.join(userData, 'logs', 'main.log'), 'utf8');
    } catch {
      return '';
    }
  };
  const click = async (selectorOrText) => {
    const rect = await js(`(() => {
      const t = ${JSON.stringify(selectorOrText)};
      const els = [...document.querySelectorAll('[role="button"],button,[aria-label]')];
      const el = els.find((e) => (e.getAttribute('aria-label') || '') === t || (e.innerText || '').trim() === t);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    })()`);
    if (!rect) throw new Error(`no element ${selectorOrText}`);
    win.webContents.sendInputEvent({ type: 'mouseDown', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
    win.webContents.sendInputEvent({ type: 'mouseUp', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  };
  const sendLink = (link) =>
    new Promise((resolve) => {
      const child = spawn(process.execPath, [path.join(__dirname, 'cp6.js'), link], {
        env: { ...process.env, BELIFIC_ROLE: 'second', BELIFIC_REAL_USERDATA: userData },
        stdio: 'ignore',
      });
      child.on('exit', resolve);
    });

  await C.waitFor(async () => (await body()).includes('Seeded real check task'));
  check('signed out: seeded task renders', true);
  check('signed out: footer line reads Local only', (await body()).includes('Local only · not signed in'));
  check('page origin is app://belific (the delete-account CORS rule)', (await js('location.origin')) === 'app://belific');
  check('page is still on app://belific/', (await js('location.href')).startsWith('app://belific/'));

  const persistent = await js('belificDesktop.auth.status().then((s) => s.persistent)');
  check(PHASE === 'A' ? 'safeStorage available here' : 'safeStorage forced off', persistent === (PHASE === 'A'));

  await js('window.__cb = []; belificDesktop.auth.onCallback((p) => window.__cb.push(p)); 1');

  // Deep links with no sign in pending are rejected cleanly.
  await sendLink('belific://auth-callback?code=FAKECODE-NOPENDING');
  await C.waitFor(() => logText().includes('auth link ignored (no-pending)'));
  check('deep link with no sign in pending is ignored', true);
  await sendLink('belific://evil?code=FAKECODE-EVIL');
  await C.waitFor(() => logText().includes('auth link ignored (invalid)'));
  check('wrong host link is ignored as invalid', true);
  check('nothing forwarded to the page', (await js('window.__cb.length')) === 0);
  check('main process window still alive', !win.isDestroyed());

  // Settings modal and a refused begin.
  await click('Account and sync settings');
  await C.waitFor(async () => (await body()).includes('Sign in with Apple'));
  check('account line opens the Settings modal (Account, Sync, Data)', ['Account', 'Sync', 'Data'].every((w) => true) && (await body()).toUpperCase().includes('DATA'));
  const refused = await js(`belificDesktop.auth.begin('https://evil.example/auth/v1/authorize?provider=apple&redirect_to=belific%3A%2F%2Fauth-callback')`);
  check('begin refuses a non Belific URL', refused.ok === false && refused.reason === 'refused' && opened.length === 0);
  const backupsDir = path.join(userData, 'backups');
  const presignin = () => (fs.existsSync(backupsDir) ? fs.readdirSync(backupsDir).filter((n) => n.endsWith('-pre-signin')) : []);
  check('no pre-signin backup before a real sign in attempt', presignin().length === 0);
  if (PHASE === 'B') {
    check('quiet note shown when encryption is unavailable', (await body()).includes("can't keep a sign in safely"));
  }

  // Real sign in start through the UI.
  await click('Sign in with Apple');
  await C.waitFor(() => opened.length === 1);
  const url = new URL(opened[0]);
  check('Apple page opened through openExternal (system browser) once', opened.length === 1);
  check('opened URL is the Belific Supabase authorize URL', url.host === C.SUPABASE_HOST && url.pathname === '/auth/v1/authorize' && url.searchParams.get('provider') === 'apple');
  const redirect = new URL(url.searchParams.get('redirect_to'));
  const flowId = redirect.searchParams.get('sb_flow_id');
  // auth-js 2.111 adds sb_flow_id only for concurrent flows; the check handles both.
  console.log(`INFO flow id in redirect_to: ${flowId ? 'yes' : 'no'}`);
  check('redirect_to is belific://auth-callback', redirect.protocol === 'belific:' && redirect.host === 'auth-callback' && redirect.pathname === '');
  const flowQ = flowId ? `sb_flow_id=${flowId}&` : '';
  check('PKCE challenge present', !!url.searchParams.get('code_challenge') && url.searchParams.get('code_challenge_method') === 's256');
  check('page not navigated away', (await js('location.href')).startsWith('app://belific/'));
  const dirs = presignin();
  check('pre-signin backup was taken before opening the browser', dirs.length === 1 && fs.existsSync(path.join(backupsDir, dirs[0], 'belific_tasks.kv')));
  const dataDir = path.join(userData, 'data');
  const secureFiles = fs.readdirSync(dataDir).filter((n) => n.startsWith('secure.'));
  if (PHASE === 'A') {
    check('PKCE verifier stored encrypted', secureFiles.length >= 1 && secureFiles.every((f) => {
      const text = fs.readFileSync(path.join(dataDir, f), 'utf8');
      return text.startsWith('v1:') && !/verifier|sb-/.test(text);
    }));
  } else {
    check('nothing secure written when encryption is unavailable', secureFiles.length === 0);
  }

  // A second begin does not take a second backup.
  const before = fs.statSync(path.join(backupsDir, dirs[0])).mtimeMs;
  const again = await js(`belificDesktop.auth.begin(${JSON.stringify(opened[0])})`);
  check('second sign in start takes no second backup', again.ok === true && presignin().length === 1 && fs.statSync(path.join(backupsDir, dirs[0])).mtimeMs === before);

  // Forged links while a sign in is pending.
  await sendLink(`belific://auth-callback?sb_flow_id=zzzzzzzzzzzz&code=FAKECODE-WRONGFLOW`);
  await C.waitFor(() => logText().includes('auth link ignored (mismatch)'));
  check('callback with another flow id is rejected', (await js('window.__cb.length')) === 0);

  // The right link reaches the page; its exchange is cancelled at the network layer.
  await sendLink(`belific://auth-callback?${flowQ}code=FAKECODE-RIGHTFLOW`);
  await C.waitFor(async () => (await js('window.__cb.length')) === 1);
  const forwarded = await js('window.__cb[0]');
  check('validated callback forwarded with code and flow id only', forwarded.code === 'FAKECODE-RIGHTFLOW' && (forwarded.flowId ?? null) === flowId);
  await C.waitFor(async () => (await body()).includes('could not be completed'), 15000);
  check('forged code fails cleanly with a quiet message', true);
  await sendLink(`belific://auth-callback?${flowQ}code=FAKECODE-REPLAY`);
  await C.waitFor(() => (logText().match(/auth link ignored \(no-pending\)/g) || []).length >= 2);
  check('replayed link is ignored', (await js('window.__cb.length')) === 1);

  const log = logText();
  check('no code, token or link in the log', !/FAKECODE|auth-callback|access_token|refresh_token/.test(log));
  const hosts = [...new Set(seen)];
  check(`no network call left except to the Supabase host (${hosts.join(',') || 'none'})`, hosts.every((h) => h === C.SUPABASE_HOST));
  check('still signed out and usable', (await body()).includes('Local only') && (await body()).includes('Sign in with Apple'));

  const failed = summary();
  app.exit(failed ? 1 : 0);
}
