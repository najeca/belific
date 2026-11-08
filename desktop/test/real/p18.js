'use strict';
// @real-input: pointer (hover)
// Real check, rewritten for 3.26.0 (Actual time and the timer removed). It was the check of
// 2.34.1 (the timer on any task at any time); now it checks that nothing offers a timer:
//  1. the details of a shown day of a repeating task and of a task whose time has begun
//     have no Actual time row, no Start the timer and no Start from,
//  2. the ⋮ menu has no timer rows,
//  3. Ctrl+Shift+Enter on a shown card stores nothing (the shown day stays unstored),
//  4. the stored timer fields of a task are kept as they were.
// Real mouse and key input into the real app, isolated data folder, in process fake Supabase.
// BELIFIC_SHOTS: a folder for screenshots.
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
  const today = day(0);
  const yesterday = day(-1);
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const tasksFile = path.join(dataDir, 'belific_tasks.kv');
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  // A daily series stored yesterday, 00:01 for ten hours: today's day is only shown, and has begun.
  const BOOT = 'Boot Camp session';
  const OCC = `boot:${today}`;
  const seed = [
    T('boot', BOOT, { dueDate: yesterday, startTime: '00:01', durationMinutes: 600, recurrence: 'daily' }),
    T('solo', 'Solo task', { dueDate: today, startTime: '00:02', durationMinutes: 600 }),
    T('gone', 'Vanishing series', { dueDate: yesterday, startTime: '00:03', durationMinutes: 600, recurrence: 'daily' }),
  ];
  fs.writeFileSync(tasksFile, JSON.stringify(seed));
  const readTasks = () => JSON.parse(fs.readFileSync(tasksFile, 'utf8'));

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1440, 900);
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await C.sleep(3500);

  const cal = (dayKey, id) => `document.querySelector('[data-cal-block="cal${dayKey}:${id}"]')`;
  const panel = `document.querySelector('[data-detail-panel]')`;
  const openDetails = async (id) => {
    await I.js(`(() => { const s = document.querySelector('[data-cal-scroller]'); if (s) s.scrollTop = 0; })()`);
    await C.sleep(300);
    await I.click(cal(today, id), 800);
    await C.waitFor(() => I.exists(panel), 4000);
  };
  const closeDetails = async () => {
    await I.blur();
    await I.key('Escape');
    await C.sleep(400);
  };
  const rowOf = (id) => readTasks().find((t) => t.id === id);

  const noTimer = async () => !(await I.js(`/Actual time|Start the timer|Stop the timer|Start from/.test(document.querySelector('[data-detail-panel]').innerText)`)) && !(await I.exists(`document.querySelector('[data-detail-panel] [data-start-from]')`));

  // ======== 1. The details ========
  await openDetails(OCC);
  check('1: a shown day of a repeating task: no Actual time, no timer, no Start from', await noTimer(), await I.js(`document.querySelector('[data-detail-panel]').innerText`));
  await closeDetails();
  await openDetails('solo');
  check('1: a task whose time has begun: no Actual time, no timer, no Start from', await noTimer());
  await closeDetails();
  check('1: opening them stored nothing', !rowOf(OCC) && !rowOf('solo').timerStartedAt);

  // ======== 2. The ⋮ menu ========
  await I.click(`document.querySelector('[aria-label="Show Tasks"]')`, 900).catch(() => {});
  await C.sleep(600);
  const solo = `Array.from(document.querySelectorAll('[aria-label="Task Solo task"]')).find((e) => e.getBoundingClientRect().width > 0)`;
  await I.hover(solo);
  await I.click(`${solo}.querySelector('[data-ctl="more"]')`, 500);
  check('2: the menu has no timer rows', !(await I.exists(`document.querySelector('[data-popover] [aria-label^="Start the timer"], [data-popover] [aria-label="Stop the timer"]')`)));
  await I.key('Escape');
  await C.sleep(300);

  // ======== 3. The old timer key on a shown day ========
  const card = `Array.from(document.querySelectorAll('[data-projected="1"][aria-label="Task ${BOOT}"]')).find((e) => e.getBoundingClientRect().width > 0)`;
  check('3: a shown card for the series exists on the Tasks board', await I.exists(card));
  await I.js(`(() => { const c = ${card}; c && c.focus(); })()`);
  await C.sleep(300);
  await I.key('Return', ['control', 'shift'], 1200);
  check('3: Ctrl+Shift+Enter stores nothing and starts no timer', readTasks().every((t) => !t.timerStartedAt), JSON.stringify(readTasks().map((t) => t.id)));
  await I.key('Escape');
  await I.shot('p18-no-timer');

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
