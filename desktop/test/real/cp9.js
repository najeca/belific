'use strict';
// Real pointer and keyboard check for checkpoint 9 (2.15.0): the profile icon
// and its popover (signed out and signed in), the Settings page, the Labels
// page, the inert hidden panes and the keyboard route for cards. Real mouse and
// key events into the real app on an isolated data folder asserted NOT to be the
// real one. Supabase is the in process fake from common.js (a real PKCE check,
// nothing leaves the machine); shell.openExternal, shell.openPath and the save
// dialog are replaced, so no browser, Explorer window or dialog ever opens.
// BELIFIC_SHOTS: a folder for screenshots.
const fs = require('node:fs');
const path = require('node:path');
const { app, shell, dialog, ipcMain, Menu } = require('electron');
const C = require('./common');

process.env.BELIFIC_NO_PROTOCOL_REGISTER = '1';
const userData = C.isolate();
const SHOTS = process.env.BELIFIC_SHOTS || '';
const pad = (n) => String(n).padStart(2, '0');
console.log(`USERDATA ${userData}`);

run().catch((err) => {
  console.log(`FAIL harness error: ${err.stack || err}`);
  app.exit(1);
});

async function run() {
  const { check, summary } = C.makeChecker();
  const opened = [];
  const openedPaths = [];
  let exportDialogs = 0;
  shell.openExternal = async (url) => {
    opened.push(url);
  };
  shell.openPath = async (p) => {
    openedPaths.push(p);
    return '';
  };
  dialog.showSaveDialog = async () => {
    exportDialogs += 1;
    return { canceled: true };
  };
  let notifyUpdates = 0;
  const realHandle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, fn) =>
    realHandle(
      channel,
      channel === 'notify:update'
        ? (event, ...args) => {
            notifyUpdates += 1;
            return fn(event, ...args);
          }
        : fn,
    );
  let fake = null;
  app.whenReady().then(() => {
    fake = C.installFakeSupabase();
    fake.logoutOnline = true;
  });

  const now = new Date();
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const t = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: '2026-10-06T08:00:00.000Z', updatedAt: '2026-10-06T08:00:00.000Z', ...extra });
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      t('a', 'Alpha', { dueDate: today, projectKey: 'work', subtasks: [{ id: 's1', title: 'first sub', done: false }] }),
      t('b', 'Bravo', { dueDate: today, projectKey: 'work' }),
      t('c', 'Charlie', { projectKey: 'home', completed: true, completedAt: '2026-10-06T09:00:00.000Z' }),
      t('d', 'Delta', { dueDate: today }),
      t('e', 'Echo', { projectKey: 'errands' }),
    ]),
  );
  const proj = (key, name, colorKey) => ({ key, name, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', colorKey });
  fs.writeFileSync(
    path.join(dataDir, 'belific_projects.kv'),
    JSON.stringify([proj('work', 'Work', 'sage'), proj('home', 'Home', 'clay'), proj('errands', 'Errands', 'sky')]),
  );
  const read = (key) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dataDir, `${key}.kv`), 'utf8'));
    } catch {
      return [];
    }
  };
  const settingsFile = () => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dataDir, 'belific_desktop_settings.kv'), 'utf8'));
    } catch {
      return {};
    }
  };
  const taskNamed = (title) => read('belific_tasks').find((x) => x.title === title);
  const liveLabels = () => read('belific_projects').filter((p) => !p.deletedAt);
  const labelNamed = (name) => liveLabels().find((p) => p.name === name);
  const appJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'mobile', 'app.json'), 'utf8'));

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  const js = (code) => win.webContents.executeJavaScript(code, true);
  win.show();
  win.focus();
  win.webContents.focus();
  const body = () => js('document.body.innerText');
  await C.waitFor(async () => (await body()).includes('Alpha'), 20000);

  // ---- real input helpers ----
  const visible = (sel) => `Array.from(document.querySelectorAll(${JSON.stringify(sel)})).find((e) => e.getBoundingClientRect().width > 0)`;
  const byLabel = (label) => visible(`[aria-label=${JSON.stringify(label)}]`);
  const byText = (text) =>
    `Array.from(document.querySelectorAll('[role="button"],button,[aria-label]')).find((e) => (e.innerText || '').trim() === ${JSON.stringify(text)} && e.getBoundingClientRect().width > 0)`;
  const rectOf = (expr) =>
    js(`(() => { const el = ${expr}; if (!el) return null; el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = el.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: r.width, h: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right }; })()`);
  const mouse = (type, x, y) => win.webContents.sendInputEvent({ type, x, y, button: 'left', clickCount: 1 });
  const click = async (expr, wait = 250) => {
    let r = await rectOf(expr);
    if (!r) throw new Error(`no element for ${expr}`);
    for (let i = 0; i < 8; i++) {
      win.webContents.sendInputEvent({ type: 'mouseMove', x: r.x, y: r.y });
      await C.sleep(120);
      const again = await rectOf(expr);
      const same = again && again.x === r.x && again.y === r.y;
      r = again || r;
      if (same) break;
    }
    mouse('mouseDown', r.x, r.y);
    mouse('mouseUp', r.x, r.y);
    await C.sleep(wait);
  };
  const press = async (keyCode, wait = 80) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode });
    await C.sleep(wait);
  };
  const enter = async () => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
    win.webContents.sendInputEvent({ type: 'char', keyCode: String.fromCharCode(13) });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
    await C.sleep(150);
  };
  const type = async (text) => {
    for (const ch of text) {
      const keyCode = ch === ' ' ? 'Space' : ch;
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode });
      win.webContents.sendInputEvent({ type: 'char', keyCode: ch });
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode });
      await C.sleep(15);
    }
    await C.sleep(150);
  };
  const q = (sel) => `document.querySelector(${JSON.stringify(sel)})`;
  const exists = (expr) => js(`!!${expr}`);
  const activeLabel = () => js(`document.activeElement && document.activeElement.getAttribute('aria-label')`);
  const activeValue = () => js('document.activeElement && document.activeElement.value');
  const shot = async (name) => {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(SHOTS, `${name}.png`), img.toPNG());
  };
  const overlays = () =>
    js(`(() => {
      const out = [];
      for (const el of document.querySelectorAll('*')) {
        const s = getComputedStyle(el);
        if (s.position !== 'fixed' && s.position !== 'absolute') continue;
        const r = el.getBoundingClientRect();
        if (r.width < innerWidth * 0.9 || r.height < innerHeight * 0.9) continue;
        const bg = s.backgroundColor;
        const visible = bg && bg !== 'transparent' && !/rgba\\(\\s*\\d+,\\s*\\d+,\\s*\\d+,\\s*0\\s*\\)/.test(bg);
        if (visible) out.push(el.tagName + ':' + (el.getAttribute('aria-label') || el.className).toString().slice(0, 30));
      }
      return out;
    })()`);
  const baseline = new Set(await overlays());
  const noNewOverlay = async () => (await overlays()).filter((o) => !baseline.has(o)).length === 0;
  const popoverOpen = (label) => exists(q(`[role="dialog"][aria-label=${JSON.stringify(label)}]`));
  const panesHidden = () => js(`(() => { const c = document.querySelector('[data-task-card]'); return !!c && c.getBoundingClientRect().width === 0; })()`);
  const setNative = (selector, value) =>
    js(`(() => { const i = document.querySelector(${JSON.stringify(selector)}); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(value)}); i.dispatchEvent(new Event('input', { bubbles: true })); return i.value; })()`);

  // ======== A. The profile icon, signed out ========
  const iconOut = 'Profile, not signed in';
  check('a profile icon is at the top of the app', await exists(byLabel(iconOut)));
  const iconRect = await rectOf(byLabel(iconOut));
  // 2.26.0: it is the last control of the centre pane's top row (the Timebox
  // column is to its right), at the top of the window.
  const centreRect = await js(`(() => { const r = document.querySelector('[data-pane="center"]').getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top }; })()`);
  const inWindow = iconRect.top >= 0 && iconRect.top < centreRect.top + 64 && iconRect.right <= centreRect.right && iconRect.left > centreRect.left + (centreRect.right - centreRect.left) * 0.7;
  check('it sits at the top right of the centre pane', inWindow, JSON.stringify({ iconRect, centreRect }));
  const covers = await js(`(() => {
    const ic = ${byLabel(iconOut)}.getBoundingClientRect();
    return Array.from(document.querySelectorAll('input, [data-task-card], [aria-label^="Task "]')).some((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.left < ic.right && r.right > ic.left && r.top < ic.bottom && r.bottom > ic.top;
    });
  })()`);
  check('the icon covers no pane control or card', !covers);
  const body0 = await body();
  check('the old account line at the bottom left is gone', !body0.includes('Local only · not signed in') && !(await exists(byLabel('Account and sync settings'))));
  await click(byLabel(iconOut));
  check('the icon opens a popover', await popoverOpen('Profile menu'));
  const popText = await js(`${q('[role="dialog"][aria-label="Profile menu"]')}.innerText`);
  check('signed out: says Local only, not signed in', popText.includes('Local only, not signed in'), popText);
  check('signed out: one line about all your devices', popText.includes('Sign in to keep your tasks on all your devices'));
  check('signed out: one Sign in button (2.18.0: Apple and Google are chosen on the Sign in page)', await exists(`${q('[role="dialog"][aria-label="Profile menu"]')} && ${byLabel('Sign in')}`) && !(await js(`${q('[role="dialog"][aria-label="Profile menu"]')}.innerText`)).includes('Continue with'));
  check('the popover is small: no full viewport overlay, no backdrop', await noNewOverlay());
  const pr = await rectOf(q('[role="dialog"][aria-label="Profile menu"]'));
  check('the popover stays inside the window and is under 320px wide', pr.left >= 0 && pr.right <= (await js('innerWidth')) && pr.w <= 320, JSON.stringify(pr));
  await shot('cp9-profile-signed-out');
  await press('Escape');
  check('Escape closes it and focus returns to the icon', !(await popoverOpen('Profile menu')) && (await activeLabel()) === iconOut);
  await click(byLabel(iconOut));
  check('it reopens', await popoverOpen('Profile menu'));
  mouse('mouseDown', 6, 6);
  mouse('mouseUp', 6, 6);
  await C.sleep(250);
  check('a press outside closes it', !(await popoverOpen('Profile menu')));

  // The privacy policy says a signed out app sends nothing anywhere: nothing has reached any https host yet.
  check('signed out: no network request was made since launch (privacy policy claim)', fake.hosts.length === 0, JSON.stringify(fake.hosts));

  // Start the sign in from the popover (real auth-js, fake Supabase).
  await click(byLabel(iconOut));
  await click(byLabel('Sign in'));
  await C.waitFor(async () => (await body()).includes('Continue with Apple'));
  await click(byLabel('Continue with Apple'));
  await C.waitFor(() => opened.length === 1);
  const url = new URL(opened[0]);
  fake.challenge = url.searchParams.get('code_challenge');
  check('Continue with Apple on the Sign in page starts the existing flow (browser opened once)', url.host === C.SUPABASE_HOST && url.pathname === '/auth/v1/authorize' && url.searchParams.get('provider') === 'apple');
  check('the Sign in page says to finish in the browser', (await body()).includes('Finish signing in in your browser'));
  const flowId = new URL(url.searchParams.get('redirect_to')).searchParams.get('sb_flow_id');
  app.emit('second-instance', {}, [process.execPath, `belific://auth-callback?${flowId ? `sb_flow_id=${flowId}&` : ''}code=GOODCODE`], '');
  await C.waitFor(() => exists(byLabel('Profile and account')), 20000);
  check('signed in: the icon now has an account label', true);
  check('signed in: the icon shows the initial U (user-one email)', (await js(`${byLabel('Profile and account')}.innerText`)).trim() === 'U');
  check('first ever sign in has no account question', !(await body()).includes('different account'));
  await C.waitFor(() => fake.restCalls > 0, 15000);

  // ======== A2. Signed in popover ========
  check('the Sign in page closed after the sign in (2.18.0)', !(await body()).includes('Continue with Apple'));
  await click(byLabel('Profile and account'));
  check('the profile icon now opens the signed in account', await popoverOpen('Profile menu'));
  const inText = await js(`${q('[role="dialog"][aria-label="Profile menu"]')}.innerText`);
  check('signed in: shows the account email', inText.includes('user-one-1111@example.test'), inText);
  check('signed in: shows sync status and last synced time', /Synced|Syncing|waiting|problem/i.test(inText) && /Last synced|Not synced yet/.test(inText), inText);
  check('signed in: Sync now, Settings and Sign out are there', ['Sync now', 'Settings', 'Sign out'].every((w) => inText.includes(w)));
  check('signed in: no full viewport overlay', await noNewOverlay());
  await shot('cp9-profile-signed-in');
  const restBefore = fake.restCalls;
  await click(byLabel('Sync now'));
  await C.waitFor(() => fake.restCalls > restBefore, 15000);
  check('Sync now runs a real sync pass (the fake saw requests)', fake.restCalls > restBefore);
  check('Sync now keeps the popover open to show the result', await popoverOpen('Profile menu'));

  // ======== B. The Settings page ========
  const alphaCard = await rectOf(q('[aria-label="Task Alpha"]'));
  await click(byLabel('Settings'));
  await C.waitFor(async () => (await body()).toUpperCase().includes('PLANNING'), 8000);
  check('Settings opens as a page inside the app (popover closed)', !(await popoverOpen('Profile menu')));
  check('Settings is not a full viewport overlay', await noNewOverlay());
  check('the profile icon is still visible on the Settings page', await exists(byLabel('Profile and account')));
  const sText = (await body()).toUpperCase();
  check('sections: Account, Sync, Planning, Notifications, Data, Labels, About', ['ACCOUNT', 'SYNC', 'PLANNING', 'NOTIFICATIONS', 'DATA', 'LABELS', 'ABOUT'].every((w) => sText.includes(w)));
  check('a Back button replaces the wordmark', await exists(byLabel('Back')));
  await shot('cp9-settings-page');

  // The hidden panes are inert.
  check('the panes are hidden (zero size) and marked inert', (await panesHidden()) && (await exists(q('[inert]'))));
  let reached = false;
  for (let i = 0; i < 40; i++) {
    await press('Tab', 30);
    if (await js(`!!(document.activeElement && document.activeElement.closest('[inert]'))`)) reached = true;
  }
  check('forty Tab presses never put focus inside the hidden panes', !reached);
  // Keys now go to the page body, not to a Settings control that Tab focused.
  await js('document.activeElement && document.activeElement.blur()');
  const tasksBefore = JSON.stringify(read('belific_tasks'));
  // Escape is left out: since checkpoint 11 it leaves the page (cp11 checks that).
  for (const k of ['Return', 'n', 'Space', 'Delete']) await press(k, 40);
  check('keys pressed on the Settings page change no task', JSON.stringify(read('belific_tasks')) === tasksBefore);
  const updatesBefore = notifyUpdates;
  const restBefore2 = fake.restCalls;
  win.webContents.send('notify:tick');
  await C.waitFor(() => notifyUpdates > updatesBefore, 15000).catch(() => {});
  check('the notification payload is still sent while the panes are hidden (main tick)', notifyUpdates > updatesBefore);

  // Account section: delete account (the existing flow; the fake has no function).
  await click(byText('Delete account'));
  check('Delete account asks first, inline', (await body()).includes('This deletes your Belific account'));
  await click(byLabel('Confirm delete account'));
  await C.waitFor(async () => (await body()).includes('has not been deleted'), 15000);
  check('the delete function being unavailable gives a plain message', (await body()).includes('The account could not be deleted') && (await body()).includes('Your account has not been deleted'));
  check('and the user is still signed in', await exists(byLabel('Profile and account')));

  // Sync section.
  const restBefore3 = fake.restCalls;
  await click(byText('Sync now'));
  await C.waitFor(() => fake.restCalls > restBefore3, 15000);
  check('Settings, Sync now runs a sync pass', fake.restCalls > restBefore3);

  // Switches use palette colours only (no react-native-web teal thumb), on and off.
  const teal = () => js(`Array.from(document.querySelectorAll('*')).some((e) => { const s = getComputedStyle(e); return s.backgroundColor === 'rgb(0, 150, 136)' || s.backgroundColor === 'rgb(38, 166, 154)'; })`);
  check('Settings switches (several on, one off) show no teal anywhere', !(await teal()));

  // Planning: My day starts at.
  await js(`${q('select[aria-label="My day starts at"]')}.focus()`);
  check('Planning: My day starts at defaults to 05:00', (await js(`${q('select[aria-label="My day starts at"]')}.value`)) === '05:00');
  await press('Down');
  await press('Down');
  await C.waitFor(() => settingsFile().dayStart === '06:00', 6000).catch(() => {});
  check('Planning: arrow keys change it and it persists in the main process settings', settingsFile().dayStart === '06:00', JSON.stringify(settingsFile().dayStart));

  // Notifications and window toggles, each by a real click.
  const toggle = async (label, key, expected) => {
    await click(byLabel(label));
    await C.waitFor(() => settingsFile()[key] === expected, 6000).catch(() => {});
    check(`Toggle "${label}" persists (${key} = ${expected})`, settingsFile()[key] === expected, JSON.stringify(settingsFile()[key]));
  };
  await toggle('Event starts', 'notifyEvents', false);
  await toggle('Tasks placed on the Timebox', 'notifyTasks', false);
  await toggle('Close to the system tray', 'closeToTray', false);
  await toggle('Start with Windows', 'startWithWindows', true);
  await toggle('Start with Windows', 'startWithWindows', false);
  await setNative('input[aria-label="Daily reminder time"]', '07:45');
  await C.waitFor(() => settingsFile().dailyTime === '07:45', 6000).catch(() => {});
  check('Daily reminder time persists', settingsFile().dailyTime === '07:45', JSON.stringify(settingsFile().dailyTime));
  await toggle('Daily reminder of tasks planned for today', 'dailyReminder', false);
  check('turning the daily reminder off hides its time box', !(await exists(q('input[aria-label="Daily reminder time"]'))));
  await toggle('Daily reminder of tasks planned for today', 'dailyReminder', true);
  await toggle('Event starts', 'notifyEvents', true);
  await toggle('Tasks placed on the Timebox', 'notifyTasks', true);
  await toggle('Close to the system tray', 'closeToTray', true);

  // Data section.
  await click(byText('Open backups folder'));
  await C.waitFor(() => openedPaths.some((p) => p.endsWith('backups')), 4000).catch(() => {});
  check('Data: Open backups folder opens the backups folder', openedPaths.some((p) => p.endsWith('backups') && p.startsWith(userData)), JSON.stringify(openedPaths));
  await click(byText('Export data…'));
  await C.waitFor(() => exportDialogs === 1, 4000).catch(() => {});
  check('Data: Export data opens the save dialog', exportDialogs === 1);
  check('Data: there is no Import (a later checkpoint)', !(await body()).toLowerCase().includes('import'));

  // About section.
  check('About: shows the app version', (await body()).includes(`Belific ${appJson.expo.version}`), appJson.expo.version);
  await click(byLabel('Privacy policy'));
  await C.waitFor(() => opened.length === 2, 4000).catch(() => {});
  check('About: Privacy policy opens the published page in the system browser', opened[1] === 'https://najeca.github.io/belific/privacy.html', String(opened[1]));
  await click(byLabel('Report an issue'));
  await C.waitFor(() => opened.length === 3, 4000).catch(() => {});
  check('About: Report an issue opens the issue tracker', opened[2] === 'https://github.com/najeca/belific/issues', String(opened[2]));
  const licencesFile = path.join(path.dirname(process.execPath), 'LICENSES.chromium.html');
  check('About: the licences row shows only because the file ships beside the app', fs.existsSync(licencesFile) === (await exists(byLabel('Chromium and Electron licences'))));
  if (fs.existsSync(licencesFile)) {
    await click(byLabel('Chromium and Electron licences'));
    await C.waitFor(() => openedPaths.includes(licencesFile), 4000).catch(() => {});
    check('About: the licences row opens that file', openedPaths.includes(licencesFile));
  }

  // The File menu has Settings and shows the page.
  const fileMenu = Menu.getApplicationMenu().items[0].submenu.items;
  const settingsItem = fileMenu.find((i) => i.label === 'Settings…');
  check('the app menu has File, Settings…', !!settingsItem);
  await click(byLabel('Back'));
  await C.waitFor(() => panesHidden().then((h) => !h), 4000);
  check('Back returns to the three panes, visible again', !(await panesHidden()) && !(await exists(q('[inert]'))));
  const alphaAgain = await rectOf(q('[aria-label="Task Alpha"]'));
  check('the board is exactly where it was', Math.abs(alphaAgain.x - alphaCard.x) < 2 && Math.abs(alphaAgain.y - alphaCard.y) < 2, `${JSON.stringify(alphaCard)} ${JSON.stringify(alphaAgain)}`);
  settingsItem.click();
  await C.waitFor(async () => (await body()).toUpperCase().includes('PLANNING'), 6000);
  check('File, Settings… brings up the Settings page', true);

  // ======== C. The Labels page ========
  await click(byLabel('Open Labels'));
  await C.waitFor(async () => (await body()).toUpperCase().includes('ADD A LABEL'), 6000);
  // Phase 7: Labels is an overlay over Settings, not a page.
  check('Labels opens as an overlay over Settings (Settings text still there, a dialog named Labels)', (await body()).toUpperCase().includes('NOTIFICATIONS') && (await exists(q('[role="dialog"][aria-label="Labels"]'))));
  baseline.add('DIV:Close labels');
  const lText = await body();
  check('lists every label with its open task count', lText.includes('Work') && lText.includes('2 open tasks') && lText.includes('Home') && lText.includes('No open tasks') && lText.includes('Errands') && lText.includes('1 open task'), lText);
  check('there is no reordering control', !(await exists(q('[aria-label^="Reorder label"]'))));
  await shot('cp9-labels-page');

  // Rename inline.
  await click(byLabel('Rename label Home'));
  await C.waitFor(async () => (await activeLabel()) === 'Rename Home', 3000);
  await js('document.activeElement.select()');
  await type('Household stuff');
  check('Rename: spaces typed, value exact', (await activeValue()) === 'Household stuff', String(await activeValue()));
  await enter();
  await C.waitFor(() => !!labelNamed('Household stuff'), 6000).catch(() => {});
  check('Rename: Enter saves it (and no label is lost or duplicated)', !!labelNamed('Household stuff') && !labelNamed('Home') && liveLabels().length === 3);
  // A duplicate name is refused.
  await click(byLabel('Rename label Work'));
  await C.waitFor(async () => (await activeLabel()) === 'Rename Work', 3000);
  await js('document.activeElement.select()');
  await type('household STUFF');
  await enter();
  await C.waitFor(async () => (await body()).includes('Another label already has that name'), 4000).catch(() => {});
  check('Rename: a duplicate name (any case) is refused with a plain message', (await body()).includes('Another label already has that name') && !!labelNamed('Work'));
  await press('Escape');
  await C.sleep(150);
  check('Rename: Escape cancels and keeps the old name', !!labelNamed('Work') && (await body()).includes('Work') && !(await exists(q('[aria-label="Rename Work"]'))), JSON.stringify([!!labelNamed('Work'), await exists(q('[aria-label="Rename Work"]')), await activeLabel()]));

  // Recolour from the palette.
  await click(byLabel('Colour of Household stuff'));
  check('Colour: opens a small popover with the 20 palette colours (12 locked until every computer runs 2.26)', (await popoverOpen('Colour for Household stuff')) && (await js(`document.querySelectorAll('[data-swatch]').length`)) === 20 && (await js(`document.querySelectorAll('[data-swatch][aria-disabled="true"]').length`)) === 12);
  check('Colour: no full viewport overlay', await noNewOverlay());
  await click(byLabel('Plum colour for Household stuff'));
  await C.waitFor(() => labelNamed('Household stuff')?.colorKey === 'plum', 6000).catch(() => {});
  check('Colour: choosing Plum saves it', labelNamed('Household stuff')?.colorKey === 'plum', JSON.stringify(labelNamed('Household stuff')));
  check('Colour: the popover closed', !(await popoverOpen('Colour for Household stuff')));

  // Add from the suggestions, and by typing.
  check('Suggestions: Work and Errands are not offered (already used), Study is', !(await exists(byLabel('Add suggested label Work'))) && (await exists(byLabel('Add suggested label Study'))));
  await click(byLabel('Add suggested label Study'));
  await C.waitFor(() => !!labelNamed('Study'), 6000).catch(() => {});
  check('Add: a suggested label is created with a colour', !!labelNamed('Study') && !!labelNamed('Study').colorKey);
  check('Add: it disappears from the suggestions', !(await exists(byLabel('Add suggested label Study'))));
  await click(byLabel('New label name'));
  await type('Reading list');
  await enter();
  await C.waitFor(() => !!labelNamed('Reading list'), 6000).catch(() => {});
  check('Add: a typed name is created', !!labelNamed('Reading list'));
  await click(byLabel('New label name'));
  await type('work');
  await enter();
  await C.waitFor(async () => (await body()).includes('A label with that name already exists'), 4000).catch(() => {});
  check('Add: a duplicate typed name is refused (case insensitive)', (await body()).includes('A label with that name already exists') && liveLabels().filter((l) => l.name.toLowerCase() === 'work').length === 1);

  // The notification payload keeps updating while hidden: a change on this page re-sends it.
  const updatesBefore2 = notifyUpdates;
  await click(byLabel('Add suggested label Admin'));
  await C.waitFor(() => notifyUpdates > updatesBefore2, 8000).catch(() => {});
  check('a data change on this page re-sends the notification payload', notifyUpdates > updatesBefore2);

  // Delete with the inline confirm; its tasks lose the label.
  await click(byLabel('Delete label Errands'));
  check('Delete: asks inline and says what happens to its tasks', (await body()).includes('Delete the label Errands? Its 1 task will lose the label.'), await body());
  await click(byLabel('Cancel delete'));
  check('Delete: Cancel keeps the label', !!labelNamed('Errands') && !(await body()).includes('Delete the label Errands?'));
  await click(byLabel('Delete label Errands'));
  await click(byLabel('Confirm delete label Errands'));
  await C.waitFor(() => !labelNamed('Errands'), 6000).catch(() => {});
  check('Delete: the label is tombstoned (never a hard delete)', !labelNamed('Errands') && read('belific_projects').some((p) => p.name === 'Errands' && p.deletedAt));
  check('Delete: its task kept existing and lost the label', !!taskNamed('Echo') && !taskNamed('Echo').deletedAt && !taskNamed('Echo').projectKey, JSON.stringify(taskNamed('Echo')));
  check('Delete: the other labels\' tasks are untouched', taskNamed('Alpha').projectKey === 'work' && taskNamed('Charlie').projectKey === 'home');

  // Back, back.
  await click(`document.querySelector('[role="dialog"][aria-label="Labels"] [aria-label="Close"]')`);
  await C.sleep(300);
  check('Closing the Labels overlay leaves Settings showing, focus back on the button that opened it', (await body()).toUpperCase().includes('NOTIFICATIONS') && !(await exists(q('[role="dialog"][aria-label="Labels"]'))) && (await activeLabel()) === 'Open Labels', String(await activeLabel()));
  await click(byLabel('Back'));
  await C.waitFor(() => panesHidden().then((h) => !h), 4000);
  check('Back again returns to the panes', !(await panesHidden()));
  await C.sleep(500);
  check('the renamed label shows on its cards after returning', true);

  // ======== D. Keyboard route for cards ========
  const cardSel = (title) => `[aria-label="Task ${title}"]:not([data-block-id])`;
  const expanded = (title) => exists(q(`${cardSel(title)} [aria-label^="Add subtask to"]`));
  // Put the keyboard at the very start, then Tab until a card has focus.
  await js('document.activeElement && document.activeElement.blur()');
  let onCard = null;
  for (let i = 0; i < 60 && !onCard; i++) {
    await press('Tab', 40);
    onCard = await js(`(() => { const a = document.activeElement; return a && a.getAttribute('data-card-focus') === '1' ? a.getAttribute('aria-label') : null; })()`);
  }
  check('Tab reaches a task card', !!onCard, String(onCard));
  const title = String(onCard).replace(/^Task /, '');
  check('the focused card has a visible focus ring in the accent colour', await js(`(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle === 'solid' && parseFloat(s.outlineWidth) >= 2 && s.outlineColor === 'rgb(92, 122, 107)'; })()`), JSON.stringify(await js(`(() => { const s = getComputedStyle(document.activeElement); return [s.outlineStyle, s.outlineWidth, s.outlineColor]; })()`)));
  await shot('cp9-card-focus');
  // 2.27.0: Enter on the card opens its details (no expanding in place); the
  // focus goes back to the card when they close.
  const modal = q('[role="dialog"][aria-label="Task details"]');
  const modalOpen = () => exists(modal);
  check('it is a face: no notes box on the card', !(await exists(q(`${cardSel(title)} [aria-label^="Notes for"]`))));
  await enter();
  await C.waitFor(() => modalOpen(), 3000).catch(() => {});
  check('Enter opens the details of the card', await modalOpen());
  await press('Escape');
  await C.waitFor(async () => !(await modalOpen()), 3000).catch(() => {});
  check('Escape closes them and the keyboard is back on the card', !(await modalOpen()) && (await js(`document.activeElement && document.activeElement.getAttribute('aria-label')`)) === `Task ${title}`);
  await enter();
  await C.waitFor(() => modalOpen(), 3000).catch(() => {});
  check('Enter opens them once more', await modalOpen());

  // Typing in a field never reaches the card (the 2.12.1 space key bug stays fixed).
  await click(q('[role="dialog"][aria-label="Task details"] [aria-label="Notes"]'));
  await type('a b  c');
  check('Notes: spaces typed, the details stayed open', (await activeValue()) === 'a b  c' && (await modalOpen()), String(await activeValue()));
  await enter();
  await type('x');
  check('Notes: Enter is a new line and does not close the details', (await activeValue()) === 'a b  c\nx' && (await modalOpen()), JSON.stringify(await activeValue()));
  await press('Escape');
  await C.waitFor(async () => !(await modalOpen()), 3000).catch(() => {});
  check('Escape in Notes saves them and closes the details', !(await modalOpen()));
  check('no popover or drag is left over', (await noNewOverlay()) && (await js(`document.body.style.cursor !== 'grabbing'`)));

  // Sign out from the popover at the end, back to the neutral icon.
  await click(byLabel('Profile and account'));
  await click(byLabel('Sign out'));
  await C.waitFor(() => exists(byLabel(iconOut)), 15000);
  check('Sign out from the popover returns to the neutral signed out icon', true);
  check('sign out kept all local data', read('belific_tasks').length === 5);

  check('the whole run contacted no host but the Supabase one (privacy policy claim)', fake.unexpected.length === 0 && fake.hosts.every((h) => h === C.SUPABASE_HOST), JSON.stringify([...new Set(fake.hosts)]));
  const failed = summary();
  app.exit(failed ? 1 : 0);
}
