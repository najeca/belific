'use strict';
// Real check for 2.34.1 (Part C, P1): the timer can be started on any task at any time.
//  1. a day of a repeating task that is only shown starts a timer from the details (it is
//     stored first, once), and stopping adds the time,
//  2. "Start from HH:mm" counts from the scheduled start of a time that has begun,
//  3. the shortcut works on a shown day too,
//  4. a start that cannot happen says so in a note instead of doing nothing.
// Real mouse and key input into the real app, isolated data folder, in process fake Supabase.
// BELIFIC_SHOTS: a folder for screenshots. Needs the clock to be past 00:03 local.
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
  const btn = (label) => `(${I.visible(`[data-detail-panel] [aria-label=${JSON.stringify(label)}]`)})`;

  // ======== 1. A shown day of a repeating task starts a timer ========
  check('1: before: today\'s day of the series is not stored', !rowOf(OCC));
  await openDetails(OCC);
  check('1: the details offer "Start the timer" on a day that is only shown', await I.exists(btn('Start the timer')));
  await I.click(btn('Start the timer'), 1200);
  const started = await C.waitFor(() => !!(rowOf(OCC) && rowOf(OCC).timerStartedAt), 5000).catch(() => false);
  const occ = rowOf(OCC);
  check('1: the day is stored once, with a running timer', !!started && !!occ && typeof occ.timerStartedAt === 'string', JSON.stringify(occ && { id: occ.id, t: occ.timerStartedAt }));
  check('1: the stored day keeps the series (title, time, length, repeat)', !!occ && occ.title === BOOT && occ.startTime === '00:01' && occ.durationMinutes === 600 && occ.recurrence === 'daily');
  check('1: no extra copy was made (the root and today only)', readTasks().filter((t) => t.title === BOOT).length === 2, String(readTasks().filter((t) => t.title === BOOT).length));
  check('1: no "could not start" note', !(await I.exists(`document.querySelector('[data-notice-bar]')`)));
  await C.sleep(1500);
  check('1: the details now offer "Stop the timer"', await I.exists(btn('Stop the timer')));
  await I.click(btn('Stop the timer'), 1200);
  await C.waitFor(() => !(rowOf(OCC) && rowOf(OCC).timerStartedAt), 5000).catch(() => {});
  const stopped = rowOf(OCC);
  check('1: stopping clears the timer and keeps the actual time', !!stopped && !stopped.timerStartedAt && typeof stopped.actualMinutes === 'number', JSON.stringify(stopped && { a: stopped.actualMinutes, t: stopped.timerStartedAt }));
  await closeDetails();

  // ======== 2. Start from ========
  await openDetails('solo');
  check('2: a task whose time has begun today offers "Start from 12:02am"', await I.exists(`document.querySelector('[data-detail-panel] [data-start-from="00:02"]')`));
  const label = await I.js(`(() => { const e = document.querySelector('[data-detail-panel] [data-start-from="00:02"]'); return e ? e.getAttribute('aria-label') : null; })()`);
  check('2: its accessible name says the time and the minutes ago', /^Start the timer from 12:02am, \d+ minutes ago$/.test(label || ''), String(label));
  await I.click(`document.querySelector('[data-detail-panel] [data-start-from="00:02"]')`, 1200);
  await C.waitFor(() => !!(rowOf('solo') && rowOf('solo').timerStartedAt), 5000).catch(() => {});
  const solo = rowOf('solo');
  const want = new Date();
  want.setHours(0, 2, 0, 0);
  check('2: the timer counts from the scheduled start (today 00:02)', !!solo && solo.timerStartedAt === want.toISOString(), `${solo && solo.timerStartedAt} want ${want.toISOString()}`);
  const elapsed = Math.floor((Date.now() - want.getTime()) / 60000);
  const shown = await I.js(`document.querySelector('[data-detail-panel]').innerText`);
  const clockLine = shown.split('\n').find((l) => /\d+:\d{2}:?\d{0,2}\s*\/\s*\d/.test(l)) || '';
  const m = /(\d+):(\d{2})(?::(\d{2}))?\s*\/\s*\d/.exec(clockLine);
  const shownMin = m ? (m[3] !== undefined ? Number(m[1]) * 60 + Number(m[2]) : Number(m[1]) * 60 + Number(m[2])) : -1;
  check('2: the time so far already shows the minutes since the start', shownMin >= elapsed - 1, `line "${clockLine}" elapsed ${elapsed}`);
  check('2: while it runs there is no second "Start from"', !(await I.exists(`document.querySelector('[data-detail-panel] [data-start-from]')`)));
  await closeDetails();

  // ======== 3. The shortcut on a day that is only shown ========
  // Stop the running one first (starting another would stop it anyway).
  await I.click(`document.querySelector('[aria-label="Show Tasks"]')`, 900).catch(() => {});
  await C.sleep(600);
  const card = `Array.from(document.querySelectorAll('[data-projected="1"][aria-label="Task ${BOOT}"]')).find((e) => e.getBoundingClientRect().width > 0)`;
  // Today's day is stored now (step 1), so it is a stored card; the next day is the shown one.
  const hasCard = await I.exists(card);
  if (hasCard) {
    await I.js(`(() => { const c = ${card}; c && c.focus(); })()`);
    await C.sleep(300);
    await I.key('Return', ['control', 'shift'], 1200);
    const tomorrowId = `boot:${day(1)}`;
    await C.waitFor(() => !!(rowOf(tomorrowId) && rowOf(tomorrowId).timerStartedAt), 4000).catch(() => {});
    check('3: Ctrl+Shift+Enter starts the timer on a day that is only shown', !!(rowOf(tomorrowId) && rowOf(tomorrowId).timerStartedAt), JSON.stringify(rowOf(tomorrowId)));
    check('3: starting it stopped the one that was running (one timer at a time)', !rowOf('solo').timerStartedAt && (rowOf('solo').actualMinutes ?? 0) >= 1, JSON.stringify(rowOf('solo')));
  } else {
    check('3: a shown card for the series exists on the Tasks board', false, 'no projected card found');
  }
  await I.key('Escape');

  // ======== 4. A start that cannot happen says so ========
  await I.click(`document.querySelector('[aria-label="Show the Calendar"]')`, 900).catch(() => {});
  await openDetails(`gone:${today}`);
  // The series disappears from storage while the details are open (deleted on another computer).
  fs.writeFileSync(tasksFile, JSON.stringify(readTasks().filter((t) => !t.id.startsWith('gone'))));
  await I.click(btn('Start the timer'), 1000);
  const note = await C.waitFor(() => I.exists(`document.querySelector('[data-notice-bar]')`), 4000).catch(() => false);
  const text = note ? await I.js(`document.querySelector('[data-notice-bar]').innerText`) : '';
  check('4: a timer that cannot start shows a note', !!note && /Could not start the timer/.test(text), text);
  check('4: nothing was stored for it', !readTasks().some((t) => t.id.startsWith('gone')));
  await I.shot('p18-timer-note');
  await closeDetails();

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
