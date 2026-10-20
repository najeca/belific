'use strict';
// Real check for Part B, phase P5 (2.32.0): several reminders per timed task.
// Real Electron, isolated data folder (asserted), in process fake Supabase. Like cp7 it
// captures Notification and Tray calls in the main process instead of looking at the screen.
// Covered: a reminder at the start, an extra reminder before (the 5 minute one is checked
// in the scheduler; a 1 minute one is waited for), the default list in Settings, the
// per task list in the details, the tray keeping reminders alive with the window closed,
// quitting from the tray stopping them, and re-arming after sleep (the clock is moved
// forward in the main process while its timers do not run, as a sleeping computer does).
// BELIFIC_SHOTS: a folder for screenshots.
const fs = require('node:fs');
const path = require('node:path');
const electron = require('electron');
const { app, shell, powerMonitor } = electron;

// The main process clock, movable: Date.now is replaced BEFORE the app loads, so the
// scheduler (which takes Date.now at construction) sees the skew and real timers do not.
const realNow = Date.now.bind(Date);
let skew = 0;
Date.now = () => realNow() + skew;

const C = require('./common');
const { makeInput, dayKeyFrom } = require('./input');
const { Scheduler } = require('../../src/scheduler');

process.env.BELIFIC_NO_PROTOCOL_REGISTER = '1';
process.env.BELIFIC_NO_LOGIN_ITEM = '1';
const userData = C.isolate();
console.log(`USERDATA ${userData}`);
const pad = (n) => String(n).padStart(2, '0');

run().catch((err) => {
  console.log(`FAIL harness error: ${err.stack || err}`);
  app.exit(1);
});

async function run() {
  const { check, summary } = C.makeChecker();
  shell.openExternal = async () => {};

  // Capture instead of showing.
  const toasts = [];
  electron.Notification.prototype.show = function show() {
    toasts.push({ title: this.title, body: this.body, at: realNow() });
  };
  let trayMenu = null;
  const origSetMenu = electron.Tray.prototype.setContextMenu;
  electron.Tray.prototype.setContextMenu = function (menu) {
    trayMenu = menu;
    return origSetMenu.call(this, menu);
  };
  // The scheduler instance, to read what is scheduled.
  let sched = null;
  const origResched = Scheduler.prototype.reschedule;
  Scheduler.prototype.reschedule = function reschedule() {
    sched = this;
    return origResched.apply(this, arguments);
  };

  app.whenReady().then(() => {
    const fake = C.installFakeSupabase();
    fake.store = { tables: {} };
  });

  const day = dayKeyFrom(new Date());
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  // The first minute boundary 45 to 105 seconds from now.
  const base = new Date(realNow() + 45 * 1000);
  base.setSeconds(0, 0);
  base.setMinutes(base.getMinutes() + 1);
  const at = (plusMin) => {
    const d = new Date(base.getTime() + plusMin * 60000);
    return { dueDate: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, startTime: `${pad(d.getHours())}:${pad(d.getMinutes())}`, ms: d.getTime() };
  };
  const T = (id, title, when, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, dueDate: when.dueDate, startTime: when.startTime, durationMinutes: 30, ...extra });
  const tomorrow = dayKeyFrom(new Date())(1);
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      T('s1', 'Start only', at(0)), // the default list: at the start
      T('s2', 'Lead one and start', at(1), { reminders: [0, 1] }),
      T('s3', 'After sleep', at(4), { reminders: [0] }),
      T('p5', 'Five before', at(8), { reminders: [0, 5] }),
      T('l10', 'Legacy ten', at(20), { reminderMinutes: 10 }),
      T('none', 'None', at(9), { reminders: [] }),
      T('legoff', 'Legacy off', at(10), { reminderMinutes: -1 }),
      T('dflt', 'Default me', at(11)),
      T('ui', 'UI task', at(40), { reminders: [] }),
      // Untimed, tomorrow: the grouped daily reminder counts only the ones that want it.
      { id: 'u1', title: 'Untimed wants', completed: false, createdAt: stamp, updatedAt: stamp, dueDate: tomorrow },
      { id: 'u2', title: 'Untimed none', completed: false, createdAt: stamp, updatedAt: stamp, dueDate: tomorrow, reminders: [] },
      { id: 'u3', title: 'Untimed off', completed: false, createdAt: stamp, updatedAt: stamp, dueDate: tomorrow, reminderMinutes: -1 },
    ]),
  );
  void day;

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1440, 900);
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await C.sleep(4500);
  const stored = (id) => JSON.parse(fs.readFileSync(path.join(dataDir, 'belific_tasks.kv'), 'utf8')).find((t) => t.id === id);
  const pending = () => (sched ? sched.pending() : []);
  const forTask = (id) => pending().filter((p) => p.key === `task:${id}` || p.key.startsWith(`task:${id}@`));
  const leads = (id) => forTask(id).map((p) => Math.round((startOf(id) - p.at) / 60000)).sort((a, b) => a - b);
  const startOf = (id) => {
    const t = stored(id);
    const [y, m, d] = t.dueDate.split('-').map(Number);
    const [h, mi] = t.startTime.split(':').map(Number);
    return new Date(y, m - 1, d, h, mi, 0, 0).getTime();
  };

  // ======== What is scheduled, without waiting ========
  check('P5: a task with no list gets the default: one reminder at the start', JSON.stringify(leads('s1')) === '[0]', JSON.stringify(leads('s1')));
  check('P5: a task with [0, 5] is scheduled twice: at the start and 5 minutes before', JSON.stringify(leads('p5')) === '[0,5]', JSON.stringify(leads('p5')));
  const p5 = forTask('p5').sort((a, b) => a.at - b.at);
  check('P5: with the right words ("Starts in 5 minutes", then "Starting now")', p5.length === 2 && p5[0].body === 'Starts in 5 minutes' && p5[1].body === 'Starting now', JSON.stringify(p5.map((x) => x.body)));
  check('P5: the older single value still works (reminderMinutes 10 = one reminder 10 minutes before)', JSON.stringify(leads('l10')) === '[10]', JSON.stringify(leads('l10')));
  check('P5: an empty list is no reminder, and so is the older -1', leads('none').length === 0 && leads('legoff').length === 0, JSON.stringify([leads('none'), leads('legoff')]));
  check('P5: a repeated lead is one reminder (no duplicates)', new Set(forTask('p5').map((x) => x.key)).size === forTask('p5').length);
  const daily = pending().filter((p) => p.kind === 'daily');
  check('P5: the grouped daily reminder leaves out untimed tasks with no reminder (2 of 3 do not want one: 1 task)', daily.some((d) => d.body === '1 task planned for today'), JSON.stringify(daily.map((d) => d.body)));

  // ======== Settings: the default list ========
  const profileIcon = async () => ((await I.exists(I.byLabel('Profile and account'))) ? 'Profile and account' : 'Profile, not signed in');
  await I.click(I.byLabel(await profileIcon()));
  await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 700);
  await I.waitBody('POWER FEATURES', 8000);
  const chips = await I.js(`[...document.querySelectorAll('[data-default-lead]')].map((e) => e.getAttribute('data-default-lead') + ':' + e.getAttribute('aria-checked'))`);
  check('P5: Settings, Notifications lists the times (at start on by default)', JSON.stringify(chips) === JSON.stringify(['0:true', '5:false', '10:false', '15:false', '30:false', '60:false', '1440:false']), JSON.stringify(chips));
  const note = await I.js(`document.querySelector('[data-reminder-running-note]').innerText`);
  check('P5: it says honestly when reminders work: only while Belific runs, tray keeps them, Quit stops them', /only work while Belific is running/.test(note) && /system tray/.test(note) && /Quit/.test(note) && /Start with Windows/.test(note), note);
  check('P5: and offers Start with Windows (off by default, never turned on by itself)', await I.exists(`document.querySelector('[aria-label="Turn on Start with Windows"]')`));
  await I.click(`document.querySelector('[data-default-lead="5"]')`, 600);
  const settingsFile = () => JSON.parse(fs.readFileSync(path.join(dataDir, 'belific_desktop_settings.kv'), 'utf8'));
  check('P5: ticking "5 minutes before" saves the default list [0, 5] in the main process settings', JSON.stringify(settingsFile().defaultReminders) === '[0,5]', JSON.stringify(settingsFile()));
  await C.sleep(800);
  check('P5: and a task with no list of its own is now scheduled at the start and 5 minutes before', JSON.stringify(leads('dflt')) === '[0,5]', JSON.stringify(leads('dflt')));
  check('P5: a task with its own list is not touched by the default', JSON.stringify(leads('s2')) === '[0,1]' && JSON.stringify(leads('l10')) === '[10]', JSON.stringify([leads('s2'), leads('l10')]));
  await I.shot('p15-settings');
  await I.click(I.byLabel('Back'), 700);
  await C.sleep(500);

  // ======== The details: a list per task ========
  await I.click(`document.querySelector('[aria-label="Show Tasks"]')`, 800);
  const uiDay = stored('ui').dueDate;
  await I.click(`document.querySelector('[data-day-col="${uiDay}"] [aria-label="Title UI task"]')`, 800);
  await C.waitFor(() => I.exists(`document.querySelector('[data-detail-panel]')`), 4000).catch(() => {});
  const rowText = await I.js(`document.querySelector('[data-detail-row="Reminder"]').innerText.replace(/\\s+/g, ' ')`);
  check('P5: the Reminder row shows the task\'s own list (None for an empty one)', /None/.test(rowText), rowText);
  await I.click(`document.querySelector('[data-detail-panel] [aria-label^="Reminder:"]')`, 600);
  await I.click(`document.querySelector('[data-popover] [aria-label="At start time, off"]')`, 600);
  await C.sleep(400);
  check('P5: choosing "At start time" stores reminders [0] and mirrors 0 into the older value', JSON.stringify(stored('ui').reminders) === '[0]' && stored('ui').reminderMinutes === 0, JSON.stringify(stored('ui')));
  check('P5: the menu stays open for the next one', await I.exists(`document.querySelector('[data-popover] [aria-label="10 minutes before, off"]')`));
  await I.click(`document.querySelector('[data-popover] [aria-label="10 minutes before, off"]')`, 600);
  await C.sleep(400);
  check('P5: adding "10 minutes before" gives [0, 10]', JSON.stringify(stored('ui').reminders) === '[0,10]' && stored('ui').reminderMinutes === 0, JSON.stringify(stored('ui')));
  await C.sleep(600);
  check('P5: the scheduler now has both for that task', JSON.stringify(leads('ui')) === '[0,10]', JSON.stringify(leads('ui')));
  await I.shot('p15-details');
  await I.click(`document.querySelector('[data-popover] [aria-label="None"]')`, 600);
  await C.sleep(500);
  check('P5: "None" stores an empty list and -1, and nothing is scheduled for the task', JSON.stringify(stored('ui').reminders) === '[]' && stored('ui').reminderMinutes === -1 && leads('ui').length === 0, JSON.stringify([stored('ui'), leads('ui')]));
  await I.click(`document.querySelector('[data-detail-panel] [aria-label^="Reminder:"]')`, 600);
  await I.click(`document.querySelector('[data-popover] [aria-label="Default"]')`, 600);
  await C.sleep(500);
  check('P5: "Default" clears both again (the default list applies)', stored('ui').reminders === undefined && stored('ui').reminderMinutes === undefined && JSON.stringify(leads('ui')) === '[0,5]', JSON.stringify([stored('ui'), leads('ui')]));
  await I.blur();
  await I.key('Escape');
  await C.sleep(400);

  // ======== The tray keeps reminders alive with the window closed ========
  win.close();
  await C.sleep(600);
  check('P5: closing the window hides it (close to tray); the app keeps running', !win.isDestroyed() && !win.isVisible());
  check('P5: the tray exists with Open and Quit', !!trayMenu && trayMenu.items.map((i) => i.label).join('|') === 'Open Belific||Quit Belific');
  const waitMs = Math.max(5000, base.getTime() + 60 * 1000 + 15000 - realNow());
  await C.waitFor(() => toasts.some((x) => x.title === 'Start only') && toasts.some((x) => x.title === 'Lead one and start' && x.body === 'Starting now'), waitMs, 250);
  const mine = (t) => toasts.filter((x) => x.title === t);
  check('P5: the reminder at the start fired with the window hidden in the tray ("Starting now", once)', mine('Start only').length === 1 && mine('Start only')[0].body === 'Starting now', JSON.stringify(mine('Start only')));
  check('P5: the extra reminder fired 1 minute before ("Starts in 1 minute"), then the one at the start', mine('Lead one and start').length === 2 && mine('Lead one and start')[0].body === 'Starts in 1 minute' && mine('Lead one and start')[1].body === 'Starting now', JSON.stringify(mine('Lead one and start')));
  check('P5: the extra reminder came a minute before the start one (about 60 s apart)', (() => { const m = mine('Lead one and start'); return m.length === 2 && Math.abs(m[1].at - m[0].at - 60000) < 6000; })());
  check('P5: each toast fired at its time (within 6 s of the minute)', Math.abs(mine('Start only')[0].at - base.getTime()) < 6000, String(mine('Start only')[0].at - base.getTime()));
  check('P5: no toast for tasks with no reminder, or for ones whose time is still far off', !toasts.some((x) => ['None', 'Legacy off', 'Five before', 'Legacy ten'].includes(x.title)), JSON.stringify(toasts.map((x) => x.title)));

  // ======== Re-arming after sleep ========
  // "After sleep" starts 4 minutes after the base time; the wall clock now jumps forward
  // while the timers (real time) do not run, as when a computer sleeps. Without re-arming it
  // would still wait the old real time; on resume it is re-armed from the real clock.
  const s3At = at(4).ms;
  const jumpTo = s3At - 20 * 1000; // 20 seconds before it is due, by the (moved) wall clock
  const wallNow = realNow();
  const before = mine('After sleep').length;
  skew += jumpTo - wallNow;
  powerMonitor.emit('resume');
  const resumedAt = realNow();
  await C.waitFor(() => mine('After sleep').length > before, 45000, 250).catch(() => {});
  const lateBy = realNow() - resumedAt;
  check('P5: after the clock jumped (sleep), the reminder due 20 s later fired on time, re-armed on resume', mine('After sleep').length === before + 1 && lateBy < 32000, `${mine('After sleep').length} toasts, ${lateBy} ms after resume`);
  check('P5: and only once', mine('After sleep').length === before + 1);
  // A reminder that was due while asleep, longer ago than the grace, is skipped (not shown late).
  const skipped = toasts.length;
  // Wall clock to 25 minutes after the base time: everything that was due before it is more than the 5 minute grace late.
  skew = base.getTime() + 25 * 60 * 1000 - realNow();
  powerMonitor.emit('resume');
  await C.sleep(1500);
  check('P5: reminders that came due during a long sleep are not shown late (skipped), nothing fires in a burst', toasts.length === skipped, JSON.stringify(toasts.slice(skipped)));

  // ======== Quitting from the tray stops them ========
  let atQuit = null;
  app.on('before-quit', () => {
    atQuit = { pending: sched ? sched.pending().length : -1, timers: sched ? sched.timers.size : -1 };
  });
  trayMenu.items.find((i) => i.label === 'Quit Belific').click();
  await C.waitFor(() => atQuit !== null, 5000, 50).catch(() => {});
  check('P5: Quit from the tray stops every reminder (nothing left scheduled)', !!atQuit && atQuit.pending === 0 && atQuit.timers === 0, JSON.stringify(atQuit));
  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
