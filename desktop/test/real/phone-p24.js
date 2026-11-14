'use strict';
// @real-input: quiet
// Real touch check for 3.58.0 (PLAN_phone_parity phase 2, item A) at 390 x 844: the first launch and the empty account.
// Everything runs against the fake Supabase in this process (common.js installFakeSupabase): no real project, no real
// sign in. A sign in is stood in for by storing a fake session and the account check hold, as the app does just
// before its code exchange or Apple's signInWithIdToken, then relaunching the page.
//   - first launch, signed out: "Sign in to see your tasks", the "Not signed in" line, Continue with Google, Continue
//     with Apple, a small "Use without an account"; 44 pt or more, 14 px or more, nothing red, no email; no network;
//   - "Use without an account" opens Today with "Not signed in" under the title, and a relaunch stays on Today;
//   - Settings, Account, Sign in opens the screen again;
//   - an Apple sign in whose account is empty: the sheet "This account has no tasks yet" says the tasks may be under
//     Google; nothing on the phone is uploaded; "Sign out and try another way" signs out (scope local) and shows the
//     Sign in screen;
//   - the same with "Start fresh": Today, and only then the phone's task reaches the account;
//   - an account with tasks: straight to Today with the account's task, then Settings, Sign out shows the screen again.
// Runs quiet.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const C = require('./common');
const { phoneWindow } = require('./phone-common');

process.env.BELIFIC_NO_PROTOCOL_REGISTER = '1';
process.env.BELIFIC_TEST_FIRST_LAUNCH = '1';
const userData = C.isolate();
console.log(`USERDATA ${userData}`);

run().catch((err) => {
  console.log(`FAIL harness error: ${err.stack || err}`);
  app.exit(1);
});

async function run() {
  const { check, summary } = C.makeChecker();
  let fake = null;
  app.whenReady().then(() => {
    fake = C.installFakeSupabase();
    fake.store = { tables: {} };
    fake.logoutOnline = true;
  });
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'belific_tasks.kv'), JSON.stringify([{ id: 'local1', title: 'Phone only task', completed: false, createdAt: stamp, updatedAt: stamp }]));
  const noAccountFile = path.join(dataDir, 'belific_phone_no_account.kv');

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.show();
  await C.sleep(2500);
  let P = await phoneWindow(win);
  await C.sleep(1500);
  const shot = async (name) => {
    if (!process.env.BELIFIC_SHOTS) return;
    fs.mkdirSync(process.env.BELIFIC_SHOTS, { recursive: true });
    fs.writeFileSync(path.join(process.env.BELIFIC_SHOTS, `${name}.png`), (await win.webContents.capturePage()).toPNG());
  };
  const welcome = () => P.js(`(document.querySelector('[data-welcome]') || {}).getAttribute ? document.querySelector('[data-welcome]').getAttribute('data-welcome') : null`);
  const waitWelcome = (want, ms = 12000) => C.waitFor(async () => (await welcome()) === want, ms).then(() => true).catch(() => false);
  const btn = (name) => `document.querySelector('[data-welcome-btn="${name}"]')`;
  const text = () => P.js(`document.body.innerText`);
  const tabEls = `[...document.querySelectorAll('a, [role="tab"], [role="button"], [role="link"]')].filter((e) => { const r = e.getBoundingClientRect(); return r.top > 760 && r.height > 20 && r.width > 40 && r.width < 200; })`;
  const onToday = () => C.waitFor(async () => (await P.js(`${tabEls}.length >= 3 && !document.querySelector('[data-welcome]')`)), 15000).then(() => true).catch(() => false);
  // Sizes, fonts and colours of everything visible on the screen (or inside `root`).
  const audit = (root) => P.js(`(() => {
    const root = ${root};
    const red = (c) => { const m = /rgba?\\((\\d+), (\\d+), (\\d+)/.exec(c); return !!m && +m[1] > 150 && +m[2] < 90 && +m[3] < 90; };
    const texts = [...root.querySelectorAll('*')].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
    const buttons = [...root.querySelectorAll('[role="button"]')].filter((e) => e.getBoundingClientRect().height > 0);
    return {
      small: texts.map((e) => ({ t: e.textContent.trim().slice(0, 30), f: parseFloat(getComputedStyle(e).fontSize) })).filter((x) => x.f < 14),
      buttons: buttons.map((e) => ({ l: e.getAttribute('aria-label'), h: Math.round(e.getBoundingClientRect().height), w: Math.round(e.getBoundingClientRect().width) })),
      red: [...root.querySelectorAll('*')].filter((e) => { const s = getComputedStyle(e); return red(s.color) || red(s.backgroundColor) || red(s.borderTopColor); }).length,
    };
  })()`);
  // A launch opens the app at its start (the iPhone always does); a plain reload would keep the tab's address.
  const relaunch = async () => {
    await P.js(`location.pathname = '/'`).catch(() => {});
    await C.sleep(2500);
    P = await phoneWindow(win);
    await C.sleep(1000);
  };
  const ref = C.SUPABASE_HOST.split('.')[0];
  // Stands in for a finished sign in: the hold the app writes first, then the session auth-js stores.
  const fakeSignIn = async (userId, provider) => {
    const now = Math.floor(Date.now() / 1000);
    const session = {
      access_token: C.fakeJwt(userId, now + 3600, fake.issueSession(userId)),
      refresh_token: 'fake-refresh-' + userId,
      expires_in: 3600,
      expires_at: now + 3600,
      token_type: 'bearer',
      user: { id: userId, aud: 'authenticated', role: 'authenticated', email: '', app_metadata: { provider }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    };
    await P.js(`(async () => {
      await window.belificDesktop.kv.setItem('belific_phone_account_check', 'pending');
      await window.belificDesktop.secureKv.setItem('sb-${ref}-auth-token', ${JSON.stringify(JSON.stringify(session))});
    })()`);
    await relaunch();
  };
  const sessionStored = () => P.js(`window.belificDesktop.secureKv.getItem('sb-${ref}-auth-token').then((v) => !!v)`);
  const serverTasks = (userId) => (fake.store.tables.tasks || []).filter((r) => r.user_id === userId);
  const openSettings = async () => {
    await P.finger.tap(`document.querySelector('[data-profile-avatar]')`, 1200);
  };

  // ---- first launch ----
  check('first launch opens the Sign in screen', await waitWelcome('sign-in'), String(await welcome()));
  const t1 = await text();
  check('it says "Sign in to see your tasks" and the "Not signed in" line', t1.includes('Sign in to see your tasks') && t1.includes('Not signed in'), t1.slice(0, 200));
  check('it has the plain line about accounts', t1.includes('Your tasks are kept with your account. Sign in to see them on this phone.'));
  const a1 = await audit(`document.querySelector('[data-welcome]')`);
  const labels = a1.buttons.map((b) => b.l);
  check('Continue with Google, Continue with Apple, Use without an account; no email', JSON.stringify(labels) === JSON.stringify(['Continue with Google', 'Continue with Apple', 'Use without an account']) && !/e-?mail/i.test(t1), JSON.stringify(labels));
  check('every button is 44 pt high or more', a1.buttons.every((b) => b.h >= 44 && b.w >= 44), JSON.stringify(a1.buttons));
  check('all text is 14 px or more', a1.small.length === 0, JSON.stringify(a1.small));
  check('nothing is red', a1.red === 0, String(a1.red));
  const order = await P.js(`['google', 'apple', 'no-account'].map((n) => Math.round(document.querySelector('[data-welcome-btn="' + n + '"]').getBoundingClientRect().top))`);
  check('Google, then Apple, then the small Use without an account below', order[0] < order[1] && order[1] < order[2], JSON.stringify(order));
  const fits = await P.js(`document.documentElement.scrollWidth <= innerWidth`);
  check('nothing runs off the side at 390 wide', fits);
  check('signed out, nothing reached the server', fake.restCalls === 0 && fake.tokenCalls === 0, `${fake.restCalls} ${fake.tokenCalls}`);
  await shot('phone-p24-first-launch');

  // ---- Use without an account ----
  await P.finger.tap(btn('no-account'), 1500);
  check('Use without an account opens Today', await onToday());
  const badge = await P.js(`(document.querySelector('[data-sync-badge]') || {}).innerText || ''`);
  check('Today keeps "Not signed in" under its title', badge.trim() === 'Not signed in', badge);
  check('the choice is kept on this phone', fs.existsSync(noAccountFile));
  await relaunch();
  check('a relaunch stays on Today (not asked again)', await onToday());

  // ---- Settings, Account, Sign in ----
  await openSettings();
  await P.finger.tap(`document.querySelector('[data-settings-sign-in]')`, 1500);
  check('Settings, Account, Sign in opens the Sign in screen', await waitWelcome('sign-in'));
  await P.finger.tap(btn('no-account'), 1500);
  check('and Use without an account goes back to Today', await onToday());

  // ---- an empty Apple account: Sign out and try another way ----
  await fakeSignIn('user-apple-empty', 'apple');
  check('after an Apple sign in to an empty account, the sheet shows', await waitWelcome('empty-account', 15000), String(await welcome()));
  const sheet = await P.js(`document.querySelector('[data-empty-sheet]').innerText`);
  check('"This account has no tasks yet"', sheet.includes('This account has no tasks yet'), sheet);
  check('it says plainly the tasks may be under Google, and that Apple and Google are separate', sheet.includes('You signed in with Apple. If you used Google before, your tasks are under your Google account, not this one.') && sheet.includes('Apple and Google are separate accounts'), sheet);
  check('it says nothing was uploaded', sheet.includes('Nothing on this phone has been uploaded to this account.'));
  const a2 = await audit(`document.querySelector('[data-empty-sheet]')`);
  check('Sign out and try another way, Start fresh', JSON.stringify(a2.buttons.map((b) => b.l)) === JSON.stringify(['Sign out and try another way', 'Start fresh']), JSON.stringify(a2.buttons));
  check('the sheet: 44 pt buttons, 14 px text, nothing red', a2.buttons.every((b) => b.h >= 44) && a2.small.length === 0 && a2.red === 0, JSON.stringify(a2));
  await shot('phone-p24-empty-account');
  await C.sleep(3000);
  check('nothing on the phone was uploaded while the sheet waits', serverTasks('user-apple-empty').length === 0, JSON.stringify(fake.store.tables.tasks || []));
  await P.finger.tap(btn('sign-out'), 2000);
  check('Sign out and try another way shows the Sign in screen', await waitWelcome('sign-in'));
  check('the session is gone from this phone', !(await sessionStored()));
  check('the sign out was local only', fake.logoutScopes.length > 0 && fake.logoutScopes.every((s) => s === 'local'), JSON.stringify(fake.logoutScopes));
  check('still nothing uploaded', serverTasks('user-apple-empty').length === 0);
  check('the "Use without an account" choice was forgotten by the sign out', !fs.existsSync(noAccountFile));

  // ---- an empty account: Start fresh ----
  await fakeSignIn('user-apple-fresh', 'apple');
  check('again the sheet', await waitWelcome('empty-account', 15000));
  await P.finger.tap(btn('start-fresh'), 2000);
  check('Start fresh opens Today', await onToday());
  const uploaded = await C.waitFor(() => serverTasks('user-apple-fresh').some((r) => r.id === 'local1'), 15000).then(() => true).catch(() => false);
  check('only now the phone\'s task reaches the account', uploaded, JSON.stringify(fake.store.tables.tasks || []));

  // ---- an account with tasks ----
  await openSettings();
  await P.finger.tap(`document.querySelector('[aria-label="Sign out"]')`, 2500);
  check('Settings, Sign out shows the Sign in screen', await waitWelcome('sign-in'));
  fake.store.tables.tasks = [...(fake.store.tables.tasks || []), { user_id: 'user-google-full', id: 'acct1', title: 'Task from the account', completed: false, created_at: stamp, updated_at: stamp, deleted_at: null, server_updated_at: stamp }];
  await fakeSignIn('user-google-full', 'google');
  check('an account with tasks goes straight to Today', await onToday());
  const hasTask = await C.waitFor(async () => fs.readFileSync(path.join(dataDir, 'belific_tasks.kv'), 'utf8').includes('Task from the account'), 15000).then(() => true).catch(() => false);
  check('the account\'s task is on the phone', hasTask);
  check('no sheet for an account with tasks', !(await P.js(`!!document.querySelector('[data-empty-sheet]')`)));

  const failed = summary();
  app.exit(failed ? 1 : 0);
}
