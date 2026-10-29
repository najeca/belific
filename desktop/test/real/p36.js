'use strict';
// Real check for 3.18.0 (step 6): the reminder options can be chosen before a task has a day and a time. They are
// stored on the task as usual (`reminders`), the menu says "Applies once you set a time", nothing is scheduled
// until a time is set, and then they fire normally (the main process scheduler holds one reminder per lead).
// Real Electron, isolated data folder, in process fake Supabase; like p15 it reads what the scheduler holds.
// BELIFIC_SHOTS: a folder for screenshots.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

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
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      { id: 'n', title: 'No time yet', completed: false, createdAt: stamp, updatedAt: stamp },
      { id: 'd', title: 'Dated no time', completed: false, createdAt: stamp, updatedAt: stamp, dueDate: dayKeyFrom(new Date())(1) },
    ]),
  );
  fs.writeFileSync(path.join(dataDir, 'belific_desktop_panes.kv'), JSON.stringify({ leftCollapsed: false, rightCollapsed: false, center: 'kanban', calendar: 'day' }));

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1440, 900);
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await I.waitBody('No time yet', 20000);
  await C.sleep(2500);
  const stored = (id) => JSON.parse(fs.readFileSync(path.join(dataDir, 'belific_tasks.kv'), 'utf8')).find((t) => t.id === id);
  const pending = () => (sched ? sched.pending() : []);
  const forTask = (id) => pending().filter((p) => p.key === `task:${id}` || p.key.startsWith(`task:${id}@`));
  const startOf = (id) => {
    const t = stored(id);
    const [y, m, d] = t.dueDate.split('-').map(Number);
    const [h, mi] = t.startTime.split(':').map(Number);
    return new Date(y, m - 1, d, h, mi, 0, 0).getTime();
  };
  const leads = (id) => forTask(id).map((p) => Math.round((startOf(id) - p.at) / 60000)).sort((a, b) => a - b);

  const openDetails = async (title) => {
    await I.click(I.byLabel('Show Tasks'), 800).catch(() => {});
    await I.click(I.byLabel(`Title ${title}`), 900);
    await C.waitFor(() => I.exists(`document.querySelector('[data-detail-panel]')`), 8000);
  };
  const openReminder = async () => {
    await I.click(`document.querySelector('[data-detail-panel] [aria-label^="Reminder:"]')`, 700);
  };
  const rowsState = () =>
    I.js(`(() => { const p = document.querySelector('[data-popover]'); if (!p) return null; return [...p.querySelectorAll('[role="button"]')].map((r) => ({ label: r.getAttribute('aria-label'), disabled: r.getAttribute('aria-disabled') === 'true' })); })()`);
  const setValue = (sel, value) =>
    I.js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; el.focus(); set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); })()`);

  async function reminderPass(title, id, mode) {
    await openDetails(title);
    await openReminder();
    const rows = await rowsState();
    const leadRows = (rows || []).filter((r) => /minutes? before|hour before|day before|At start time/.test(r.label || ''));
    check(`${mode}: ${title}: the lead options are listed`, leadRows.length >= 5, JSON.stringify(rows));
    check(`${mode}: ${title}: none of them is greyed out`, leadRows.every((r) => !r.disabled), JSON.stringify(leadRows));
    const text = await I.js(`document.querySelector('[data-popover]').innerText`);
    check(`${mode}: ${title}: the menu says "Applies once you set a time"`, String(text).includes('Applies once you set a time'), String(text));
    await I.shot(`p36-reminder-menu-${mode}`);
    await I.click(`document.querySelector('[data-popover] [aria-label^="5 minutes before"]')`, 600);
    const reminders = stored(id).reminders;
    check(`${mode}: ${title}: the choice is stored on the task as usual (reminders ${JSON.stringify(reminders)})`, Array.isArray(reminders) && reminders.includes(5), JSON.stringify(stored(id)));
    check(`${mode}: ${title}: and no column was added (only the existing fields)`, Object.keys(stored(id)).every((k) => ['id', 'title', 'completed', 'createdAt', 'updatedAt', 'dueDate', 'reminders', 'reminderMinutes', 'startTime', 'durationMinutes'].includes(k)), JSON.stringify(Object.keys(stored(id))));
    check(`${mode}: ${title}: nothing is scheduled while it has no time`, forTask(id).length === 0, JSON.stringify(forTask(id).map((p) => p.key)));
    await I.key('Escape', [], 400);
    const rowHint = await I.js(`(() => { const h = document.querySelector('[data-detail-panel] [data-reminder-row-hint]'); return h ? h.innerText.trim() : null; })()`);
    check(`${mode}: ${title}: the Reminder row shows the small hint`, rowHint === 'Applies once you set a time', String(rowHint));
    await I.shot(`p36-reminder-row-${mode}`);
  }

  // ---- A task with no day at all ----
  await reminderPass('No time yet', 'n', 'light');
  // Set a day and a time: 3 hours from now (the date may be tomorrow).
  const when = new Date(Date.now() + 3 * 3600 * 1000);
  const dayStr = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
  const timeStr = `${pad(when.getHours())}:${pad(when.getMinutes())}`;
  await setValue('[data-detail-panel] input[aria-label="Day"]', dayStr);
  await C.sleep(500);
  await C.waitFor(() => I.exists(`document.querySelector('[data-detail-panel] input[aria-label="Time"]')`), 5000);
  await setValue('[data-detail-panel] input[aria-label="Time"]', timeStr);
  await C.waitFor(async () => !!stored('n').startTime, 5000).catch(() => {});
  await C.sleep(1500);
  check('setting the day and a time stores them', stored('n').dueDate === dayStr && stored('n').startTime === timeStr, JSON.stringify(stored('n')));
  check('once it has a time the reminders fire normally: scheduled at the start and 5 minutes before', JSON.stringify(leads('n')) === JSON.stringify([0, 5]), JSON.stringify(leads('n')));
  const hintGone = await I.js(`!document.querySelector('[data-detail-panel] [data-reminder-row-hint]')`);
  check('and the hint is gone', hintGone === true);
  await I.key('Escape', [], 500);

  // ---- A task with a day but no time: the same ----
  await reminderPass('Dated no time', 'd', 'light-dated');

  // ---- Dark ----
  const icon = (await I.exists(I.byLabel('Profile and account'))) ? 'Profile and account' : 'Profile, not signed in';
  await I.key('Escape', [], 400);
  await I.click(I.byLabel(icon));
  await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 700);
  await I.waitBody('POWER FEATURES', 8000);
  await I.click(`document.querySelector('[data-theme-setting] [data-theme-mode="dark"]')`, 900);
  await I.click(I.byLabel('Back'), 900);
  await I.js(`1`);
  await I.click(I.byLabel('Show Tasks'), 800).catch(() => {});
  await C.sleep(400);
  await openDetails('Dated no time');
  await openReminder();
  const rowsDark = await rowsState();
  check('dark: the options are still all selectable', (rowsDark || []).filter((r) => /before|At start time/.test(r.label || '')).every((r) => !r.disabled), JSON.stringify(rowsDark));
  await I.shot('p36-reminder-menu-dark');

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
