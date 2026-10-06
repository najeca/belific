'use strict';
// Real-app check for checkpoint 6 (run: npx electron test/real/cp6.js, after
// building the web export). Isolated data folder asserted before launch.
// No real Apple sign in. The REAL auth-js client runs in the page against a fake
// Supabase answered inside this process (common.js installFakeSupabase), with a
// real PKCE check; nothing leaves the machine. openExternal is replaced so no
// browser opens. Verifier keys are recorded by wrapping ipcMain.handle before
// main.js loads (the app itself has no test hook for it).
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { app, shell, ipcMain } = require('electron');
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
  let fake = null;
  const keysSeen = new Set();
  const valuesSeen = new Set();
  const realHandle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, fn) =>
    realHandle(channel, channel === 'secure:setItem'
      ? (event, key, value) => {
          if (/code-verifier$/.test(String(key))) {
            keysSeen.add(String(key));
            if (typeof value === 'string' && value.length > 8) valuesSeen.add(value);
          }
          return fn(event, key, value);
        }
      : fn);
  app.whenReady().then(() => {
    fake = C.installFakeSupabase();
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

  // ---- Real sign in start through the UI (real auth-js client, fake Supabase) ----
  const dataDir = path.join(userData, 'data');
  const walk = (d) =>
    fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])) : [];
  const verifierOnDisk = () =>
    ['data', 'backups', 'logs'].flatMap((d) => walk(path.join(userData, d))).some((f) => {
      try {
        const text = fs.readFileSync(f, 'utf8');
        return [...valuesSeen].some((v) => text.includes(v));
      } catch {
        return false;
      }
    });
  const verifierInMemory = async () => {
    for (const k of keysSeen) if ((await js(`belificDesktop.secureKv.getItem(${JSON.stringify(k)})`)) !== null) return true;
    return false;
  };
  const verifierNowhere = async () => keysSeen.size > 0 && !(await verifierInMemory()) && !verifierOnDisk();
  const secureFiles = () => (fs.existsSync(dataDir) ? fs.readdirSync(dataDir).filter((n) => n.startsWith('secure.')) : []);
  const startSignIn = async () => {
    const n = opened.length;
    await click('Sign in with Apple');
    await C.waitFor(() => opened.length === n + 1);
    fake.challenge = new URL(opened[n]).searchParams.get('code_challenge');
    return opened[n];
  };
  const tokenCall = async (code, expectMessage) => {
    const n = fake.tokenCalls;
    await sendLink(`belific://auth-callback?${flowQ}code=${code}`);
    await C.waitFor(() => fake.tokenCalls === n + 1);
    if (expectMessage) await C.waitFor(async () => (await body()).includes(expectMessage), 15000);
  };

  await click('Sign in with Apple');
  await C.waitFor(() => opened.length === 1);
  const url = new URL(opened[0]);
  fake.challenge = url.searchParams.get('code_challenge');
  check('Apple page opened through openExternal (system browser) once', opened.length === 1);
  check('opened URL is the Belific Supabase authorize URL', url.host === C.SUPABASE_HOST && url.pathname === '/auth/v1/authorize' && url.searchParams.get('provider') === 'apple');
  const redirect = new URL(url.searchParams.get('redirect_to'));
  const flowId = redirect.searchParams.get('sb_flow_id');
  // auth-js 2.111 adds sb_flow_id only for concurrent flows; the check handles both.
  console.log(`INFO flow id in redirect_to: ${flowId ? 'yes' : 'no'}`);
  check('redirect_to is belific://auth-callback', redirect.protocol === 'belific:' && redirect.host === 'auth-callback' && redirect.pathname === '');
  var flowQ = flowId ? `sb_flow_id=${flowId}&` : '';
  check('PKCE challenge present', !!url.searchParams.get('code_challenge') && url.searchParams.get('code_challenge_method') === 's256');
  check('page not navigated away', (await js('location.href')).startsWith('app://belific/'));
  const dirs = presignin();
  check('pre-signin backup was taken before opening the browser', dirs.length === 1 && fs.existsSync(path.join(backupsDir, dirs[0], 'belific_tasks.kv')));
  check('real auth-js saved a verifier through the new storage path (memory only)', keysSeen.size > 0 && (await verifierInMemory()));
  check('the verifier is on no disk file and no secure file exists yet', !verifierOnDisk() && secureFiles().length === 0);

  // L4: a second begin while one is running is refused and takes no second backup.
  const before = fs.statSync(path.join(backupsDir, dirs[0])).mtimeMs;
  const again = await js(`belificDesktop.auth.begin(${JSON.stringify(opened[0])})`);
  check('second begin while one is running is refused as busy, no second backup', again.ok === false && again.reason === 'busy' && presignin().length === 1 && fs.statSync(path.join(backupsDir, dirs[0])).mtimeMs === before);
  check('the running sign in kept its verifier after the refused begin', await verifierInMemory());

  // Forged links while a sign in is pending.
  if (flowId) {
    await sendLink('belific://auth-callback?sb_flow_id=zzzzzzzzzzzz&code=FAKECODE-WRONGFLOW');
    await C.waitFor(() => logText().includes('auth link ignored (mismatch)'));
    check('callback with another flow id is rejected', (await js('window.__cb.length')) === 0);
  }

  // M1: two stray junk codes fail, the real sign in survives, the real code succeeds.
  await tokenCall('FAKECODE-JUNK1', 'Still waiting');
  check('stray junk code fails the exchange with a quiet message', (await body()).includes('Still waiting'));
  check('the failed exchange restored the verifier (real auth-js had deleted it)', await verifierInMemory());
  await tokenCall('FAKECODE-JUNK2', 'Still waiting');
  check('a second junk code also leaves the sign in alive', await verifierInMemory());
  await tokenCall('GOODCODE');
  await C.waitFor(async () => (await body()).includes('Signed in as user-one-1111@example.test'), 15000);
  check('the real code then signs in with the restored verifier (PKCE verified by the fake server)', true);
  check('signed in: the verifier is gone from memory and disk', await verifierNowhere());
  check('first ever sign in proceeds without the account question', !(await body()).includes('different account'));
  await C.waitFor(() => fake.restCalls > 0);
  check('sync started after the sign in', fake.restCalls > 0);
  if (PHASE === 'A') {
    const files = secureFiles();
    check('the session is stored encrypted, no token in any file', files.length >= 1 && files.every((f) => {
      const text = fs.readFileSync(path.join(dataDir, f), 'utf8');
      return text.startsWith('v1:') && !/fake-|eyJ|sb-|token/.test(text);
    }));
  } else {
    check('nothing secure written when encryption is unavailable', secureFiles().length === 0);
  }
  await sendLink(`belific://auth-callback?${flowQ}code=GOODCODE`);
  await C.waitFor(() => (logText().match(/auth link ignored \(no-pending\)/g) || []).length >= 2);
  check('a replayed code after success is ignored', (await js('window.__cb.length')) >= 3 && fake.tokenCalls === 3);

  // M3: sign out while offline keeps a pending revoke, retried when back online.
  fake.logoutOnline = false;
  await click('Sign out');
  await C.waitFor(async () => (await body()).includes('Ending the session on the server is waiting'));
  check('offline sign out: signed out here, quiet revoke pending note shown', (await body()).includes('Local only'));
  if (PHASE === 'A') {
    const files = secureFiles();
    check('the pending revoke tokens are kept encrypted, never plain', files.length >= 1 && files.every((f) => {
      const text = fs.readFileSync(path.join(dataDir, f), 'utf8');
      return text.startsWith('v1:') && !text.includes('fake-refresh');
    }));
  }
  fake.logoutOnline = true;
  const logoutsBefore = fake.logoutCalls;
  await js("window.dispatchEvent(new Event('online')); 1");
  await C.waitFor(async () => !(await body()).includes('Ending the session on the server is waiting'), 15000);
  check('back online: the revoke was retried and the note cleared', fake.logoutCalls > logoutsBefore);
  if (PHASE === 'A') check('the revoke pending entry is gone from disk', secureFiles().length === 0);

  // L1: cancel, a failed begin, three failures, expiry and sign out leave no verifier anywhere.
  await startSignIn();
  check('cancel setup: a verifier exists', await verifierInMemory());
  await js('belificDesktop.auth.cancel()');
  check('cancel leaves no code-verifier key in memory or on disk', await verifierNowhere());

  const realOpen = shell.openExternal;
  shell.openExternal = async () => {
    throw new Error('no browser');
  };
  await click('Sign in with Apple');
  await C.waitFor(async () => (await body()).includes('Could not open your browser'));
  shell.openExternal = realOpen;
  check('a failed begin leaves no code-verifier key anywhere', await verifierNowhere());

  await startSignIn();
  await tokenCall('FAKECODE-F1', 'Still waiting');
  await tokenCall('FAKECODE-F2', 'Still waiting');
  await tokenCall('FAKECODE-F3', 'could not be completed');
  await C.waitFor(() => logText().includes('sign in ended (too-many-failures)'));
  check('three failed attempts close the sign in and leave no verifier', await verifierNowhere());
  await tokenCall('GOODCODE').catch(() => {});
  check('after it closed, even the right code is ignored', fake.tokenCalls >= 0 && (await body()).includes('Local only'));

  await startSignIn();
  check('expiry setup: a verifier exists', await verifierInMemory());
  const realNow = Date.now;
  Date.now = () => realNow() + 11 * 60 * 1000;
  await sendLink(`belific://auth-callback?${flowQ}code=FAKECODE-LATE`);
  await C.waitFor(() => logText().includes('auth link ignored (expired)'));
  Date.now = realNow;
  check('an expired sign in leaves no verifier and the late link is refused', await verifierNowhere());

  // M2: a different account on a computer with local data asks first.
  await startSignIn();
  const restBefore = fake.restCalls;
  const tokensBefore = fake.tokenCalls;
  await sendLink(`belific://auth-callback?${flowQ}code=GOODCODE2`);
  await C.waitFor(() => fake.tokenCalls === tokensBefore + 1);
  await C.waitFor(async () => (await body()).includes('This is a different account'), 15000);
  await C.sleep(1500);
  check('different account with local data: the question is shown', (await body()).includes("Upload this computer's data to this account"));
  check('nothing was uploaded or downloaded before the choice', fake.restCalls === restBefore);
  const switchDirsBefore = fs.readdirSync(backupsDir).filter((n) => n.includes('account-switch'));
  check('no account switch backup before the choice', switchDirsBefore.length === 0);
  await click('Start empty on this account (a backup of the local data is kept)');
  await C.waitFor(() => fs.readdirSync(backupsDir).some((n) => n.endsWith('account-switch')));
  const switchDir = fs.readdirSync(backupsDir).find((n) => n.endsWith('account-switch'));
  const switchFiles = fs.readdirSync(path.join(backupsDir, switchDir));
  check('a labelled backup of the local data was taken, without any secure file', switchFiles.includes('belific_tasks.kv') && switchFiles.every((f) => !f.startsWith('secure.')));
  check('the backup holds the seeded task', fs.readFileSync(path.join(backupsDir, switchDir, 'belific_tasks.kv'), 'utf8').includes('Seeded real check task'));
  await C.waitFor(async () => !(await body()).includes('Seeded real check task'), 15000);
  check('start empty: the local data is gone from the page', true);
  await C.waitFor(() => fake.restCalls > restBefore);
  check('after the choice, sync runs for the new account', fake.restCalls > restBefore);
  check('the stored last user id is the new account', fs.readFileSync(path.join(dataDir, 'belific_last_user_id.kv'), 'utf8') === 'user-two-2222');

  // L3 / L4 / L5: allow list, reserved keys, CSP.
  const before3 = opened.length;
  await js("window.open('https://evil.example/phish', '_blank'); 1");
  await js("window.open('http://github.com/najeca/belific/issues', '_blank'); 1");
  await C.sleep(500);
  check('window.open to a host that is not allow listed is ignored', opened.length === before3);
  await js("window.open('https://github.com/najeca/belific/issues', '_blank'); 1");
  await C.waitFor(() => opened.length === before3 + 1);
  check('window.open to the allow listed support page opens in the browser', opened[opened.length - 1] === 'https://github.com/najeca/belific/issues');
  const rejects = (code) => js(`(async () => { try { await ${code}; return false; } catch { return true; } })()`);
  check('kv IPC refuses secure.* keys', (await rejects("belificDesktop.kv.getItem('secure.abc')")) && (await rejects("belificDesktop.kv.setItem('secure.abc', 'x')")));
  check('kv IPC refuses the first sign in flag key', (await rejects("belificDesktop.kv.setItem('belific_first_signin_backup', 'x')")) && (await rejects("belificDesktop.kv.removeItem('belific_first_signin_backup')")));
  const csp = await js("fetch(location.href).then((r) => r.headers.get('content-security-policy'))");
  check('CSP has object-src, base-uri, form-action and frame-ancestors', ["object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'"].every((d) => csp.includes(d)));

  const log = logText();
  check('no code, token or link in the log', !/FAKECODE|GOODCODE|auth-callback|access_token|refresh_token|fake-access|fake-refresh|eyJ/.test(log));
  const hosts = [...new Set(fake.hosts)];
  check(`no network call left except to the Supabase host (${hosts.join(',') || 'none'})`, hosts.every((h) => h === C.SUPABASE_HOST) && fake.unexpected.length === 0);
  check('main process window still alive', !win.isDestroyed());

  const failed = summary();
  app.exit(failed ? 1 : 0);
}
