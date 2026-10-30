'use strict';
// Real check for 3.20.0 (step 1): no "This day only / All days" question, ever. The first time of a repeating task
// (set in the details) goes to every repeat day; a later time from the details reaches every day that was not
// changed on its own, and a day with its own time keeps it; the details say so in one quiet line. Light and dark.
// (The drops and drags are covered by p26, p28, p37 and cp8h.) BELIFIC_SHOTS: a folder for screenshots.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const C = require('./common');
const { makeInput, dayKeyFrom, readKv } = require('./input');

process.env.BELIFIC_NO_PROTOCOL_REGISTER = '1';
const userData = C.isolate();
console.log(`USERDATA ${userData}`);

run().catch((err) => {
  console.log(`FAIL harness error: ${err.stack || err}`);
  app.exit(1);
});

async function run() {
  const { check, summary } = C.makeChecker();
  app.whenReady().then(() => {
    const fake = C.installFakeSupabase();
    fake.store = { tables: {} };
  });
  const now = new Date();
  const day = dayKeyFrom(now);
  const wdOf = (shift) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + shift).getDay();
  // The first Monday or Thursday from today, and the next one after it.
  let first = 0;
  while (![1, 4].includes(wdOf(first))) first += 1;
  let second = first + 1;
  while (![1, 4].includes(wdOf(second))) second += 1;
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  const zone = { recurrence: 'weekly', recurrenceDays: ['Mon', 'Thu'] };
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      T('z', 'Zone 2', { ...zone, dueDate: day(first), durationMinutes: 60 }),
      T('zs', 'Zone seeded', { ...zone, dueDate: day(first), startTime: '09:00', durationMinutes: 60 }),
      T(`zs:${day(second)}`, 'Zone seeded', { ...zone, dueDate: day(second), startTime: '17:00', durationMinutes: 60 }),
    ]),
  );
  fs.writeFileSync(path.join(dataDir, 'belific_desktop_panes.kv'), JSON.stringify({ leftCollapsed: false, rightCollapsed: false, center: 'kanban', calendar: 'week' }));
  const read = readKv(dataDir);
  const rows = (root) => (read('belific_tasks') || []).filter((t) => t.id === root || t.id.startsWith(`${root}:`));
  const row = (id) => (read('belific_tasks') || []).find((t) => t.id === id);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1440, 900);
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await I.waitBody('Zone 2', 20000);
  await I.click(I.byLabel('Show Tasks'), 800).catch(() => {});
  await C.sleep(800);
  const setValue = (sel, value) =>
    I.js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; el.focus(); set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  const openDetails = async (title) => {
    await I.click(I.byLabel(`Title ${title}`), 900);
    await C.waitFor(() => I.exists(`document.querySelector('[data-detail-panel]')`), 8000);
  };
  const noteText = () => I.js(`(() => { const n = document.querySelector('[data-detail-panel] [data-series-time-note]'); return n ? n.innerText.trim() : null; })()`);
  const prompt = () => I.exists(`document.querySelector('[data-scope-prompt], [data-action-menu]')`);

  // ---- A: the first time ----
  await openDetails('Zone 2');
  check('A: the details of a repeating task say how a time is applied', (await noteText()) === 'Applied to every repeat day. Days you moved keep their own time.', String(await noteText()));
  await setValue('[data-detail-panel] input[aria-label="Time"]', '16:30');
  await C.waitFor(async () => row('z').startTime === '16:30', 6000).catch(() => {});
  check('A: setting the first time stores it on the series (every repeat day reads it)', row('z').startTime === '16:30' && rows('z').length === 1, JSON.stringify(rows('z')));
  check('A: and nothing is asked', !(await prompt()));
  await I.shot('p40-first-time-light');
  await I.key('Escape', [], 500);

  // ---- B: a later time, and a day with its own time ----
  await openDetails('Zone seeded');
  await setValue('[data-detail-panel] input[aria-label="Time"]', '18:30');
  await C.waitFor(async () => row('zs').startTime === '18:30', 6000).catch(() => {});
  await C.sleep(600);
  check('B: a later time from the details changes the series (18:30)', row('zs').startTime === '18:30', JSON.stringify(row('zs')));
  check('B: the day that was changed on its own keeps 17:00', row(`zs:${day(second)}`).startTime === '17:00', JSON.stringify(row(`zs:${day(second)}`)));
  check('B: nothing is asked', !(await prompt()));
  await I.shot('p40-later-time-light');
  await I.key('Escape', [], 500);

  // ---- Dark ----
  const icon = (await I.exists(I.byLabel('Profile and account'))) ? 'Profile and account' : 'Profile, not signed in';
  await I.click(I.byLabel(icon));
  await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 700);
  await I.waitBody('POWER FEATURES', 8000);
  await I.click(`document.querySelector('[data-theme-setting] [data-theme-mode="dark"]')`, 900);
  await I.click(I.byLabel('Back'), 900);
  await I.click(I.byLabel('Show Tasks'), 800).catch(() => {});
  await C.sleep(600);
  await openDetails('Zone seeded');
  check('dark: the quiet line is there', (await noteText()) === 'Applied to every repeat day. Days you moved keep their own time.', String(await noteText()));
  await I.shot('p40-note-dark');

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
