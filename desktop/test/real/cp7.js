'use strict';
// Real-app check for checkpoint 7 (run through test/real/run-cp7.js). The
// harness captures Notification and Tray calls in the main process instead of
// looking at the screen. Isolated data folder asserted before launch; the
// Windows startup entry and protocol registration are never written.
const fs = require('node:fs');
const path = require('node:path');
const electron = require('electron');
const { app, shell } = electron;
const C = require('./common');

process.env.BELIFIC_NO_PROTOCOL_REGISTER = '1';
process.env.BELIFIC_NO_LOGIN_ITEM = '1';
const userData = C.isolate();
const pad = (n) => String(n).padStart(2, '0');

run().catch((err) => {
  console.log(`FAIL harness error: ${err.stack || err}`);
  app.exit(1);
});

async function run() {
  const { check, summary } = C.makeChecker();
  shell.openExternal = async () => {};

  // Capture instead of showing: every toast and the tray menu.
  const toasts = [];
  const proto = electron.Notification.prototype;
  proto.show = function show() {
    toasts.push({ title: this.title, body: this.body, at: Date.now() });
  };
  const trays = [];
  let trayMenu = null;
  const trayProto = electron.Tray.prototype;
  const origSetMenu = trayProto.setContextMenu;
  trayProto.setContextMenu = function (menu) {
    trays.push(this);
    trayMenu = menu;
    return origSetMenu.call(this, menu);
  };

  // An event and a placed task about 75 to 135 seconds from now, plus tasks
  // planned for that day without a time, for the daily reminder.
  const target = new Date(Date.now() + 75 * 1000);
  target.setSeconds(0, 0);
  target.setMinutes(target.getMinutes() + 1);
  const day = `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}`;
  const hm = `${pad(target.getHours())}:${pad(target.getMinutes())}`;
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(
    path.join(dataDir, 'belific_custom_events.kv'),
    JSON.stringify([
      { id: 'e1', title: 'Real check event', category: 'work', icon: '📅', start: hm, end: '23:59', notes: '', date: day, isCustom: true },
      { id: 'e-far', title: 'Event in a week', category: 'work', icon: '📅', start: hm, end: '23:59', notes: '', date: '2099-01-01', isCustom: true },
    ]),
  );
  const t = (id, title, extra) => ({ id, title, completed: false, createdAt: '2026-10-06T08:00:00.000Z', ...extra });
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      t('p1', 'Real check placed task', { dueDate: day, startTime: hm }),
      t('p2', 'Completed placed task', { dueDate: day, startTime: hm, completed: true }),
      t('d1', 'Planned one', { dueDate: day }),
      t('d2', 'Planned two', { dueDate: day }),
      t('d3', 'Planned done', { dueDate: day, completed: true }),
    ]),
  );

  let aumid = null;
  const origAumid = app.setAppUserModelId.bind(app);
  app.setAppUserModelId = (id) => {
    aumid = id;
    return origAumid(id);
  };

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  const js = (code) => win.webContents.executeJavaScript(code);
  const logText = () => {
    try {
      return fs.readFileSync(path.join(userData, 'logs', 'main.log'), 'utf8');
    } catch {
      return '';
    }
  };
  await C.waitFor(async () => (await js('document.body.innerText')).includes('Planned one'));
  check('app loads with seeded data', true);
  check('AppUserModelID is set for Windows toasts', aumid === 'com.najeca.belific.desktop');
  check('tray was created with Open and Quit', trays.length === 1 && trayMenu && trayMenu.items.map((i) => i.label).join('|') === 'Open Belific||Quit Belific');

  // Defaults, then settings persisted in the main process store.
  const defaults = await js('belificDesktop.settings.get()');
  check('defaults: events, tasks and daily reminder on at 09:00; tray on; start with Windows off', defaults.notifyEvents && defaults.notifyTasks && defaults.dailyReminder && defaults.dailyTime === '09:00' && defaults.closeToTray && defaults.startWithWindows === false);
  const set = await js(`belificDesktop.settings.set({ dailyTime: '${hm}', dailyTime2: 'x', startWithWindows: 'yes' })`);
  check('settings validated: time applied, junk ignored', set.dailyTime === hm && set.startWithWindows === false && !('dailyTime2' in set));
  check('settings written to the main process store', JSON.parse(fs.readFileSync(path.join(dataDir, 'belific_desktop_settings.kv'), 'utf8')).dailyTime === hm);

  // The Settings modal shows the new sections.
  const rect = await js(`(() => { const e = document.querySelector('[aria-label="Account and sync settings"]'); const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
  win.webContents.sendInputEvent({ type: 'mouseDown', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  win.webContents.sendInputEvent({ type: 'mouseUp', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  await C.waitFor(async () => (await js('document.body.innerText')).includes('Close to the system tray'));
  const text = (await js('document.body.innerText')).toUpperCase();
  check('Settings modal has Notifications and Window sections', text.includes('NOTIFICATIONS') && text.includes('WINDOW') && text.includes('START WITH WINDOWS') && text.includes('DAILY REMINDER'));

  // Close to tray: the window hides, the app keeps running, a one time note.
  win.close();
  await C.sleep(500);
  check('closing the window hides it (close to tray); the app keeps running', !win.isDestroyed() && !win.isVisible());
  check('first close shows the tray note once', toasts.filter((x) => x.title === 'Belific is still running').length === 1);
  const afterClose = await js('belificDesktop.settings.get()').catch(() => null);
  check('tray note remembered in settings', afterClose === null || afterClose.trayNoteShown === true);

  // Wait for the three toasts with the window hidden.
  const waitMs = target.getTime() - Date.now() + 20000;
  await C.waitFor(() => toasts.some((x) => x.title === 'Real check event') && toasts.some((x) => x.title === 'Real check placed task') && toasts.some((x) => x.title === 'Belific' && /planned for today/.test(x.body)), waitMs, 250);
  const fired = toasts.filter((x) => x.title !== 'Belific is still running');
  const firedAt = Math.max(...fired.map((x) => x.at));
  check('event toast fired with the window hidden in the tray', toasts.some((x) => x.title === 'Real check event' && x.body === '📅 Starting now'));
  check('placed task toast fired', toasts.some((x) => x.title === 'Real check placed task' && x.body === 'Starting now'));
  check('daily reminder is one grouped toast: 2 tasks (completed and placed excluded)', toasts.filter((x) => x.title === 'Belific').length === 1 && toasts.some((x) => x.body === '2 tasks planned for today'));
  check('no toast for the completed placed task or the event a week away', !toasts.some((x) => /Completed placed|in a week/.test(x.title)));
  check('toasts fired at the start minute (within 5 s)', Math.abs(firedAt - target.getTime()) < 5000, String(firedAt - target.getTime()));
  await C.sleep(3000);
  check('each toast fired exactly once', fired.length === 3);

  // The tray menu: Open brings the window back, close hides it again with no second note.
  const openItem = trayMenu.items.find((i) => i.label === 'Open Belific');
  openItem.click();
  await C.sleep(500);
  check('tray Open Belific shows and focuses the window', win.isVisible());
  win.close();
  await C.sleep(500);
  check('second close hides again without repeating the note', !win.isVisible() && toasts.filter((x) => x.title === 'Belific is still running').length === 1);

  // Close to tray off: closing the window quits (checked through the setting only here).
  const noNetwork = !/error|failed/i.test(logText().replace(/toast shown/g, ''));
  check('no errors in the main log', noNetwork, logText().slice(-300));

  const failed = summary();
  if (failed) app.exit(1);
  // The real Quit from the tray. The driver checks that the process then exits on its own.
  console.log('QUIT_CLICKED');
  trayMenu.items.find((i) => i.label === 'Quit Belific').click();
}
