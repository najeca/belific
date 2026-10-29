'use strict';
// Real check for 3.15.2 (step 3): on every task card the bold figure at the top right is the LENGTH (3h, 1h 30m,
// 30m), the start time is only in the meta line, a card with no length shows no figure. Left pane, the Tasks board
// (its Today column), light and dark. BELIFIC_SHOTS: a folder for screenshots.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const C = require('./common');
const { makeInput, dayKeyFrom } = require('./input');

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
  const day = dayKeyFrom(new Date());
  const TODAY = day(0);
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      T('a', 'Long task', { dueDate: TODAY, startTime: '06:00', durationMinutes: 180 }),
      T('b', 'Mid task', { dueDate: TODAY, startTime: '09:00', durationMinutes: 90 }),
      T('c', 'Short task', { dueDate: TODAY, startTime: '11:00', durationMinutes: 30 }),
      T('e', 'No length task', { dueDate: TODAY, startTime: '13:00' }),
      T('g', 'Twice task', { dueDate: TODAY, startTime: '15:00', extraTimes: ['17:00'], durationMinutes: 60 }),
      T('d', 'Undated length', { durationMinutes: 45 }),
      T('f', 'Undated nothing'),
      T('h', 'Later task', { dueDate: day(2), startTime: '08:30', durationMinutes: 120 }),
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
  await I.waitBody('Long task', 20000);
  await I.click(I.byLabel('Show Tasks'), 800).catch(() => {});
  await C.sleep(800);

  // Every drawn card with this title: the bold figure and the meta line.
  const cards = (title) =>
    I.js(`[...document.querySelectorAll('[aria-label="Task ${title}"][data-task-card]')].filter((e) => e.getBoundingClientRect().width > 0).map((c) => { const t = c.querySelector('[data-card-time]'); const m = c.querySelector('[data-card-meta]'); return { top: t ? t.innerText.trim() : null, meta: m ? m.innerText.replace(/[\\uE000-\\uF8FF\\uFE0F]/g, '').replace(/\\s+/g, ' ').trim() : '', bold: t ? getComputedStyle(t).fontWeight : null }; })`);

  async function pass(mode) {
    const want = [
      ['Long task', '3h', '06:00'],
      ['Mid task', '1h 30m', '09:00'],
      ['Short task', '30m', '11:00'],
      ['No length task', null, '13:00'],
      ['Twice task', '1h', '15:00, 17:00'],
      ['Undated length', '45m', ''],
      ['Undated nothing', null, ''],
    ];
    for (const [title, top, start] of want) {
      const list = await cards(title);
      check(`${mode}: ${title}: seen on screen`, list.length >= 1, JSON.stringify(list));
      for (const c of list) {
        check(`${mode}: ${title}: bold figure is ${top === null ? 'absent' : top}`, c.top === top, JSON.stringify(c));
        check(`${mode}: ${title}: the start time ${start ? start : '(none)'} is in the meta line only`, start ? c.meta.includes(start) && !(c.top || '').includes(start) : !/\d\d:\d\d/.test(c.meta), JSON.stringify(c));
      }
    }
    const bolds = (await cards('Long task')).concat(await cards('Mid task'));
    check(`${mode}: the figure is bold`, bolds.every((c) => Number(c.bold) >= 600), JSON.stringify(bolds));
    await I.shot(`p33-cards-${mode}`);
  }

  await pass('light');

  // The left pane's own cards (undated and dated): the same face.
  const left = await I.js(`[...document.querySelectorAll('[aria-label="Task Undated length"][data-task-card]')].filter((e) => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().left < 300).length`);
  check('the left pane draws Undated length too', left >= 1, String(left));
  const later = await cards('Later task');
  check('a card of a later day: the length bold, the start time in the meta line', later.length >= 1 && later.every((c) => c.top === '2h' && c.meta.includes('08:30')), JSON.stringify(later));

  // Dark.
  const icon = (await I.exists(I.byLabel('Profile and account'))) ? 'Profile and account' : 'Profile, not signed in';
  await I.click(I.byLabel(icon));
  await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 700);
  await I.waitBody('POWER FEATURES', 8000);
  await I.click(`document.querySelector('[data-theme-setting] [data-theme-mode="dark"]')`, 900);
  await I.click(I.byLabel('Back'), 900);
  await I.click(I.byLabel('Show Tasks'), 800).catch(() => {});
  await C.sleep(600);
  await pass('dark');

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
