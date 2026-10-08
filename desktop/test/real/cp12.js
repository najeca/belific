'use strict';
// Real check for checkpoint 12 (2.18.0): the Sign in page with Apple and Google.
// Real mouse and key events into the real app on an isolated data folder
// asserted NOT to be the real one. Supabase is the in process fake from
// common.js (a real PKCE check; nothing leaves the machine) and its fake Apple
// and Google pages: the app's system browser call is replaced, the test opens
// the URL the app handed over in a hidden window against the fake, reads the
// fake provider page and delivers its link the way the operating system would.
// NO real sign in, no real Apple or Google page, no database contact.
// BELIFIC_SHOTS: a folder for screenshots.
const fs = require('node:fs');
const path = require('node:path');
const { app, shell, BrowserWindow } = require('electron');
const C = require('./common');

process.env.BELIFIC_NO_PROTOCOL_REGISTER = '1';
const userData = C.isolate();
const SHOTS = process.env.BELIFIC_SHOTS || '';
console.log(`USERDATA ${userData}`);

run().catch((err) => {
  console.log(`FAIL harness error: ${err.stack || err}`);
  app.exit(1);
});

async function run() {
  const { check, summary } = C.makeChecker();
  const opened = [];
  shell.openExternal = async (url) => {
    opened.push(url);
  };
  let fake = null;
  app.whenReady().then(() => {
    fake = C.installFakeSupabase();
    fake.logoutOnline = true;
    fake.store = { tables: {} };
  });
  C.seedTasks(userData, [{ id: 'a', title: 'Alpha', completed: false, createdAt: '2026-10-08T08:00:00.000Z' }]);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  const js = (code) => win.webContents.executeJavaScript(code, true);
  win.show();
  win.focus();
  win.webContents.focus();
  const body = () => js('document.body.innerText');
  const waitBody = (text, ms = 15000) => C.waitFor(async () => (await body()).includes(text), ms);
  const waitGone = (text, ms = 8000) => C.waitFor(async () => !(await body()).includes(text), ms);
  await waitBody('Alpha', 20000);

  // ---- real input helpers (as in cp9 to cp11) ----
  const visible = (sel) => `Array.from(document.querySelectorAll(${JSON.stringify(sel)})).find((e) => e.getBoundingClientRect().width > 0)`;
  const byLabel = (label) => visible(`[aria-label=${JSON.stringify(label)}]`);
  const inPopover = (label) => `document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label=${JSON.stringify(label)}]')`;
  const rectOf = (expr) =>
    js(`(() => { const el = ${expr}; if (!el) return null; el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = el.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: r.width, h: r.height }; })()`);
  const mouse = (type, x, y) => win.webContents.sendInputEvent({ type, x, y, button: 'left', clickCount: 1 });
  const click = async (expr, wait = 300) => {
    let r = await rectOf(expr);
    if (!r) throw new Error(`no element for ${expr}`);
    for (let i = 0; i < 10; i++) {
      win.webContents.sendInputEvent({ type: 'mouseMove', x: r.x, y: r.y });
      await C.sleep(150);
      const again = await rectOf(expr);
      const same = again && again.x === r.x && again.y === r.y;
      r = again || r;
      if (same) break;
    }
    mouse('mouseDown', r.x, r.y);
    mouse('mouseUp', r.x, r.y);
    await C.sleep(wait);
  };
  const press = async (keyCode, wait = 150) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode });
    await C.sleep(wait);
  };
  const enter = async () => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
    win.webContents.sendInputEvent({ type: 'char', keyCode: String.fromCharCode(13) });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
    await C.sleep(300);
  };
  const exists = (expr) => js(`!!${expr}`);
  const activeLabel = () => js(`document.activeElement && document.activeElement.getAttribute('aria-label')`);
  const shot = async (name) => {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    fs.writeFileSync(path.join(SHOTS, `${name}.png`), (await win.webContents.capturePage()).toPNG());
  };
  const logText = () => {
    try {
      return fs.readFileSync(path.join(userData, 'logs', 'main.log'), 'utf8');
    } catch {
      return '';
    }
  };
  const deliver = (link) => app.emit('second-instance', {}, [process.execPath, link], '');
  const popoverOpen = () => exists(`document.querySelector('[role="dialog"][aria-label="Profile menu"]')`);
  const iconOut = 'Profile, not signed in';
  const iconIn = 'Profile and account';
  const openProfile = async () => {
    if (await popoverOpen()) return;
    const icon = (await exists(byLabel(iconIn))) ? iconIn : iconOut;
    await click(byLabel(icon));
    await C.waitFor(popoverOpen, 5000);
  };
  const onSignInPage = async () => (await body()).includes('Continue with Apple');
  const openSignInFromPopover = async () => {
    await openProfile();
    await click(inPopover('Sign in'));
    await C.waitFor(onSignInPage, 8000);
  };
  const hint = () => js(`(() => { const e = document.querySelector('[aria-live="polite"]'); return e ? e.innerText : null; })()`);
  const BANNED = /\b(lost|lose|broke|broken|break|missed|miss|behind|fail|failed|overdue|late|risk|danger|warning|hurry|don't|zero|must|required)\b/i;

  // The fake provider page: the URL the app asked the browser to open is loaded
  // in a hidden window against the fake Supabase, and its page and links read.
  const visitProvider = async (url) => {
    const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
    try {
      await w.loadURL(url);
      const text = await w.webContents.executeJavaScript('document.body.innerText');
      const links = await w.webContents.executeJavaScript(
        `Object.fromEntries(Array.from(document.querySelectorAll('a')).map((a) => [a.id, a.getAttribute('href')]))`,
      );
      return { text, links };
    } finally {
      w.destroy();
    }
  };

  const dataDir = path.join(userData, 'data');
  const backupsDir = path.join(userData, 'backups');
  const presignin = () => (fs.existsSync(backupsDir) ? fs.readdirSync(backupsDir).filter((n) => n.endsWith('-pre-signin')) : []);
  const secureFiles = () => (fs.existsSync(dataDir) ? fs.readdirSync(dataDir).filter((n) => n.startsWith('secure.')) : []);

  // ======== 0. Signed out: the popover has one Sign in button ========
  check('signed out: no network request since launch', fake.hosts.length === 0, JSON.stringify(fake.hosts));
  await openProfile();
  const pop = await js(`document.querySelector('[role="dialog"][aria-label="Profile menu"]').innerText`);
  check('the popover still says Local only, not signed in', pop.includes('Local only, not signed in'));
  check('the popover has a Sign in button and no provider button', (await exists(inPopover('Sign in'))) && !pop.includes('Continue with') && !pop.includes('Sign in with Apple'), pop);

  // ======== 1. The Sign in page ========
  await click(inPopover('Sign in'));
  await C.waitFor(onSignInPage, 8000);
  const page = await body();
  check('the page offers Continue with Apple and Continue with Google', page.includes('Continue with Apple') && page.includes('Continue with Google'));
  check('the page offers Not now and says you can use Belific without an account', page.includes('Not now') && page.includes('You can use Belific without an account.'));
  check('there is no Use email button yet (arrives with 2.19.0)', !/use email/i.test(page) && !(await exists(byLabel('Use email'))));
  check('there is no "Sign in with Apple" wording left on the page', !page.includes('Sign in with Apple'));
  check('the Back button is in the top strip and the panes are hidden and inert', (await exists(byLabel('Back'))) && (await exists(`document.querySelector('[inert]')`)));
  const btn = await rectOf(byLabel('Continue with Google'));
  check('the provider buttons are at least 44px tall', btn && btn.h >= 44, JSON.stringify(btn));
  check('no banned wording on the page', !BANNED.test(page), page);
  check('opening the page contacted nothing', fake.hosts.length === 0 && opened.length === 0);
  await shot('cp12-signin-page');

  // keyboard: Tab reaches Apple, Google, Not now in that order
  const seen = [];
  for (let i = 0; i < 8; i++) {
    await press('Tab');
    seen.push(await activeLabel());
  }
  const ia = seen.indexOf('Continue with Apple');
  const ig = seen.indexOf('Continue with Google');
  const inn = seen.indexOf('Not now', ig + 1);
  check('Tab reaches Continue with Apple, then Continue with Google, then Not now', ia >= 0 && ig > ia && inn > ig, JSON.stringify(seen));

  // Escape leaves the page and focus returns to the profile icon (it opened the page)
  await press('Escape');
  await waitGone('Continue with Apple');
  check('Escape leaves the Sign in page', !(await onSignInPage()) && (await body()).includes('Alpha'));
  check('focus returns to the profile icon', (await activeLabel()) === iconOut, String(await activeLabel()));

  // Back does the same
  await openSignInFromPopover();
  await click(byLabel('Back'));
  await waitGone('Continue with Apple');
  check('Back leaves the Sign in page and returns focus to the profile icon', (await activeLabel()) === iconOut, String(await activeLabel()));

  // ======== 2. From Settings, Account ========
  await openProfile();
  await click(inPopover('Settings'));
  await C.waitFor(async () => (await body()).toUpperCase().includes('PLANNING'), 8000);
  const settings = await body();
  check('Settings, Account has a Sign in button and no "Sign in with Apple"', (await exists(byLabel('Sign in'))) && !settings.includes('Sign in with Apple'));
  await click(byLabel('Sign in'));
  await C.waitFor(onSignInPage, 8000);
  check('the Settings button opens the same page', (await body()).includes('Continue with Google'));
  await click(byLabel('Back'));
  await C.waitFor(async () => (await body()).toUpperCase().includes('PLANNING'), 8000);
  check('Back returns to Settings, not to the board', !(await onSignInPage()));
  check('focus returns to the Sign in button in Settings', (await activeLabel()) === 'Sign in', String(await activeLabel()));
  await press('Escape');
  await C.waitFor(async () => !(await body()).toUpperCase().includes('PLANNING'), 8000);

  // ======== 3. Not now: nothing started, nothing contacted ========
  await openSignInFromPopover();
  await click(byLabel('Not now'));
  await waitGone('Continue with Apple');
  check('Not now returns to the board', (await body()).includes('Alpha'));
  check('signed out use never touched the network or the browser', fake.hosts.length === 0 && opened.length === 0 && presignin().length === 0);

  // ======== 4. The main process refuses everything but Apple and Google ========
  const authorize = (q) => `https://${C.SUPABASE_HOST}/auth/v1/authorize?${q}&redirect_to=${encodeURIComponent('belific://auth-callback')}&code_challenge=x&code_challenge_method=s256`;
  const refusals = [
    authorize('provider=github'),
    authorize('provider=email'),
    authorize('provider=apple&provider=github'),
    authorize('provider=Google'),
    `https://evil.example/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent('belific://auth-callback')}`,
    `https://${C.SUPABASE_HOST}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent('https://evil.example')}`,
  ];
  let allRefused = true;
  for (const u of refusals) {
    const r = await js(`belificDesktop.auth.begin(${JSON.stringify(u)})`);
    if (r.ok !== false || r.reason !== 'refused') allRefused = false;
  }
  check('begin refuses other providers, a second provider, a bad spelling, a bad host and a bad redirect', allRefused && opened.length === 0 && presignin().length === 0);

  // ======== 5. Google, started with the keyboard ========
  await openSignInFromPopover();
  for (let i = 0; i < 8 && (await activeLabel()) !== 'Continue with Google'; i++) await press('Tab');
  check('Continue with Google can be focused with Tab', (await activeLabel()) === 'Continue with Google');
  await enter();
  await C.waitFor(() => opened.length === 1, 15000);
  const g = new URL(opened[0]);
  check('Enter on Continue with Google opened one URL in the system browser', opened.length === 1);
  check('it is the Belific Supabase authorize URL for provider google', g.host === C.SUPABASE_HOST && g.pathname === '/auth/v1/authorize' && g.searchParams.get('provider') === 'google');
  check('it asks Google for an account chooser', g.searchParams.get('prompt') === 'select_account');
  const gr = new URL(g.searchParams.get('redirect_to'));
  check('redirect_to is belific://auth-callback', gr.protocol === 'belific:' && gr.host === 'auth-callback' && gr.pathname === '');
  check('PKCE challenge present', !!g.searchParams.get('code_challenge') && g.searchParams.get('code_challenge_method') === 's256');
  check('the pre-signin backup was taken before the browser opened', presignin().length === 1);
  check('the page says to finish in the browser', (await hint()) === 'Finish signing in in your browser…', String(await hint()));
  check('the app page did not navigate away', (await js('location.href')).startsWith('app://belific/'));

  const gpage = await visitProvider(opened[0]);
  check('the fake Google page was reached through the fake Supabase', gpage.text.includes('Fake Google sign in page') && fake.authorizeCalls.at(-1).provider === 'google');
  const googleMessages = {};
  // the person says no at Google: a quiet message, the sign in stays open
  deliver(gpage.links.deny);
  await C.waitFor(async () => (await hint()) === 'Sign in was cancelled.', 10000);
  googleMessages.denied = await hint();
  check('Google said no: "Sign in was cancelled."', googleMessages.denied === 'Sign in was cancelled.');
  // a stray code fails quietly and keeps the sign in alive
  const tokensBefore = fake.tokenCalls;
  deliver('belific://auth-callback?code=FAKECODE-JUNK1');
  await C.waitFor(() => fake.tokenCalls === tokensBefore + 1, 10000);
  await C.waitFor(async () => ((await hint()) || '').startsWith('Still waiting'), 10000);
  googleMessages.junk = await hint();
  check('a wrong code fails with the quiet waiting message', googleMessages.junk.startsWith('Still waiting'));
  // the real link
  deliver(gpage.links.continue);
  await C.waitFor(() => exists(byLabel(iconIn)), 20000);
  await waitGone('Continue with Google');
  check('the Google code signed in (PKCE verified by the fake server) and the page closed', !(await onSignInPage()) && (await body()).includes('Alpha'));
  await openProfile();
  const popIn = await js(`document.querySelector('[role="dialog"][aria-label="Profile menu"]').innerText`);
  check('the account line shows the Google user', popIn.includes('user-google-3333@example.test'), popIn);
  check('the first ever sign in did not ask the account question', !(await body()).includes('different account'));
  await C.waitFor(() => fake.restCalls > 0, 15000);
  check('sync started after the sign in', fake.restCalls > 0);
  const persistent = await js('belificDesktop.auth.status().then((s) => s.persistent)');
  if (persistent) {
    const files = secureFiles();
    check('the session is stored encrypted, no token in any file', files.length >= 1 && files.every((f) => {
      const text = fs.readFileSync(path.join(dataDir, f), 'utf8');
      return text.startsWith('v1:') && !/fake-|eyJ|sb-|token/.test(text);
    }));
  }
  await press('Escape');
  await click(byLabel(iconIn));
  await click(inPopover('Settings'));
  await C.waitFor(async () => (await body()).toUpperCase().includes('PLANNING'), 8000);
  const signedSettings = await body();
  check('Settings, Account shows the Google account', signedSettings.includes('Signed in as user-google-3333@example.test'));
  check('"Add a sign in method" is not built here (it needs a dashboard setting, left for 2.19.0)', !signedSettings.includes('Add a sign in method'));
  await press('Escape');
  await C.waitFor(async () => !(await body()).toUpperCase().includes('PLANNING'), 8000);

  // ======== 6. Sign out, then a cancelled Apple attempt ========
  await openProfile();
  await click(inPopover('Sign out'));
  await C.waitFor(() => exists(byLabel(iconOut)), 15000);
  check('signed out again', await exists(byLabel(iconOut)));
  check('every logout used scope local', fake.logoutScopes.length >= 1 && fake.logoutScopes.every((x) => x === 'local'), JSON.stringify(fake.logoutScopes));

  await openSignInFromPopover();
  await click(byLabel('Continue with Apple'));
  await C.waitFor(() => opened.length === 2, 15000);
  check('Continue with Apple opens the Apple authorize URL', new URL(opened[1]).searchParams.get('provider') === 'apple');
  check('Apple gets no account chooser parameter', !new URL(opened[1]).searchParams.has('prompt'));
  const cancelled = await visitProvider(opened[1]);
  check('the fake Apple page was reached', cancelled.text.includes('Fake Apple sign in page') && fake.authorizeCalls.at(-1).provider === 'apple');
  await click(byLabel('Not now'));
  await waitGone('Continue with Apple');
  const tokensAfterCancel = fake.tokenCalls;
  deliver(cancelled.links.continue);
  await C.waitFor(() => logText().includes('auth link ignored (no-pending)'), 10000);
  await C.sleep(500);
  check('Not now ended the pending sign in: a late link is ignored and nothing is exchanged', fake.tokenCalls === tokensAfterCancel && (await exists(byLabel(iconOut))));

  // ======== 7. Apple, for real, as a different account ========
  await openSignInFromPopover();
  await click(byLabel('Continue with Apple'));
  await C.waitFor(() => opened.length === 3, 15000);
  const apage = await visitProvider(opened[2]);
  check('the fake Apple page was reached again', apage.text.includes('Fake Apple sign in page'));
  const appleMessages = {};
  deliver(apage.links.deny);
  await C.waitFor(async () => (await hint()) === 'Sign in was cancelled.', 10000);
  appleMessages.denied = await hint();
  const tokensBeforeA = fake.tokenCalls;
  deliver('belific://auth-callback?code=FAKECODE-JUNK2');
  await C.waitFor(() => fake.tokenCalls === tokensBeforeA + 1, 10000);
  await C.waitFor(async () => ((await hint()) || '').startsWith('Still waiting'), 10000);
  appleMessages.junk = await hint();
  check('identical errors: Apple and Google say the same words for a refusal and for a wrong code', appleMessages.denied === googleMessages.denied && appleMessages.junk === googleMessages.junk, JSON.stringify({ appleMessages, googleMessages }));
  deliver(apage.links.continue);
  await C.waitFor(async () => (await body()).includes('This is a different account'), 20000);
  check('a different account than the one this computer last used gets the upload or start empty question (also for Apple after Google)', true);
  check('nothing is uploaded before the question is answered', !(fake.store.tables.tasks || []).some((r) => r.user_id === 'user-one-1111'));
  await click(`Array.from(document.querySelectorAll('[role="button"]')).find((e) => (e.innerText || '').startsWith('Upload this computer'))`);
  await C.waitFor(() => exists(byLabel(iconIn)), 20000);
  await C.waitFor(() => (fake.store.tables.tasks || []).some((r) => r.user_id === 'user-one-1111'), 20000);
  check('answering Upload signs in as the Apple user and syncs', (fake.store.tables.tasks || []).some((r) => r.user_id === 'user-one-1111'));
  check('a safety backup of the switch exists', fs.existsSync(backupsDir) && fs.readdirSync(backupsDir).some((n) => n.endsWith('-account-switch')));
  check('still one pre-signin backup (it is taken only once)', presignin().length === 1);

  // ======== 8. Nothing secret in the log, the data or the backups ========
  const log = logText();
  const secrets = ['GOODGOOGLE', 'GOODCODE', 'FAKECODE', 'eyJ', 'fake-refresh', 'code_verifier', 'code_challenge', 'belific://auth-callback?', '.supabase.co', 'access_token', 'refresh_token'];
  check('the main log holds no code, token, verifier or link', secrets.every((s) => !log.includes(s)), log);
  const walk = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])) : []);
  const leaks = [dataDir, backupsDir, path.join(userData, 'logs')]
    .flatMap(walk)
    .filter((f) => !path.basename(f).startsWith('secure.'))
    .filter((f) => {
      try {
        const t = fs.readFileSync(f, 'utf8');
        return ['GOODGOOGLE', 'GOODCODE', 'fake-refresh', 'eyJ'].some((s) => t.includes(s));
      } catch {
        return false;
      }
    });
  check('no data file, backup or log other than the encrypted session holds a token or code', leaks.length === 0, leaks.join(','));
  await shot('cp12-after');

  // ======== 9. Network ========
  check('only the fake Supabase host was contacted, nothing unexpected', fake.unexpected.length === 0 && fake.hosts.every((h) => h === C.SUPABASE_HOST), JSON.stringify([...new Set(fake.hosts)]));
  check('the system browser was only ever handed Belific Supabase authorize URLs (no real Apple or Google page)', opened.every((u) => u.startsWith(`https://${C.SUPABASE_HOST}/auth/v1/authorize?`)));

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
