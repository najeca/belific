'use strict';
// Real check for 2.38.0 (Part C, P5): a task with several times a day reminds at each of them.
// Real Electron, isolated data folder (asserted), in process fake Supabase. Like p15 it captures
// Notification calls in the main process instead of looking at the screen, and waits for the real
// timers (about three minutes). Covered: one toast at each time of a task, a time that is ticked
// sends none, a task with one time is unchanged, and the Reminder row and menu say "for each time".
// BELIFIC_SHOTS: a folder for screenshots.
const fs = require('node:fs');
const path = require('node:path');
const electron = require('electron');
const { app, shell } = electron;
const realNow = Date.now.bind(Date);

const C = require('./common');
const { makeInput } = require('./input');

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
  const toasts = [];
  electron.Notification.prototype.show = function show() {
    toasts.push({ title: this.title, body: this.body, at: realNow() });
  };
  app.whenReady().then(() => {
    const fake = C.installFakeSupabase();
    fake.store = { tables: {} };
  });

  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  // The first minute boundary 50 to 110 seconds from now; the second time is one minute later.
  const base = new Date(realNow() + 50 * 1000);
  base.setSeconds(0, 0);
  base.setMinutes(base.getMinutes() + 1);
  const at = (plusMin) => {
    const d = new Date(base.getTime() + plusMin * 60000);
    return { dueDate: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}`, ms: d.getTime() };
  };
  const t0 = at(0);
  const t1 = at(1);
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, dueDate: t0.dueDate, startTime: t0.time, durationMinutes: 1, reminders: [0], ...extra });
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      T('two', 'Two times', { extraTimes: [t1.time] }),
      T('ticked', 'Ticked time', { extraTimes: [t1.time], timesDone: [t0.time] }),
      T('one', 'One time'),
    ]),
  );
  fs.writeFileSync(path.join(dataDir, 'belific_desktop_settings.kv'), JSON.stringify({}));

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1440, 900);
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await C.sleep(3500);

  // ======== The details: the Reminder row says it is for each time ========
  const cal = (id) => `document.querySelector('[data-cal-block="cal${t0.dueDate}:${id}"]')`;
  await I.js(`(() => { const s = document.querySelector('[data-cal-scroller]'); if (s) s.scrollTop = ${Math.max(0, Number(t0.time.slice(0, 2)) - 2)} * 56; })()`);
  await C.sleep(500);
  await I.click(cal('two'), 900).catch(() => {});
  const opened = await C.waitFor(() => I.exists(`document.querySelector('[data-detail-panel]')`), 4000).catch(() => false);
  check('the details of a task with two times open', !!opened);
  const rowText = await I.js(`(() => { const e = document.querySelector('[data-detail-panel] [aria-label^="Reminder:"]'); return e ? e.getAttribute('aria-label') : null; })()`);
  check('its Reminder row says the list is for each time', !!rowText && /for each time/.test(rowText), String(rowText));
  await I.click(`document.querySelector('[data-detail-panel] [aria-label^="Reminder:"]')`, 700).catch(() => {});
  const note = await I.js(`(() => { const e = document.querySelector('[data-reminder-each-time]'); return e ? e.innerText : null; })()`);
  check('and its menu has the "For each time" line', !!note && /For each time/.test(note), String(note));
  await I.key('Escape');
  await I.blur();
  await I.key('Escape');
  await C.sleep(300);

  // ======== The toasts, from the real timers ========
  const waitUntil = t1.ms + 8000;
  while (realNow() < waitUntil) await C.sleep(500);
  const by = (title) => toasts.filter((t) => t.title === title);
  check('a task with two times gets a toast at each: two "Starting now"', by('Two times').length === 2 && by('Two times').every((t) => t.body === 'Starting now'), JSON.stringify(by('Two times')));
  const gap = by('Two times').length === 2 ? by('Two times')[1].at - by('Two times')[0].at : 0;
  check('the second toast comes a minute after the first (the second time)', Math.abs(gap - 60000) < 5000, String(gap));
  check('a time that is ticked sends no toast: the task with its first time done toasts once, at its second time', by('Ticked time').length === 1 && by('Ticked time')[0].at >= t1.ms - 1500, JSON.stringify(by('Ticked time')));
  check('a task with one time toasts once, as before', by('One time').length === 1, JSON.stringify(by('One time')));
  check('and nothing else was shown', toasts.length === 4, String(toasts.length));
  await C.sleep(2500);
  check('each toast fired once (no repeats a moment later)', toasts.length === 4, String(toasts.length));

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
