'use strict';
// @real-input: quiet
// Real touch check for 3.57.0 (PLAN_phone_parity phase 5) at 390 x 844: the centred hold card on Today.
//   - a press and hold on "Pay rent" dims the screen and shows a card in the middle: the task's title, day and time,
//     length and list, and Done, Edit, Move, Delete, More (48 pt high, 14 px or more); no Skip today on a one off task;
//   - Delete is plain dark text, not red; Move offers Tomorrow, Next week, Pick a day and the lists; a tap on the dim area closes;
//   - a repeating task also has Skip today with its plain line; Skip today hides today, the series stays;
//   - Delete on a repeating task asks "Only today, or every day?" on the card: Only today skips the day, Every day deletes the series;
//   - Done ticks the task.
// Runs quiet.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const C = require('./common');
const { dayKeyFrom } = require('./input');
const { phoneWindow } = require('./phone-common');

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
  const tomorrow = day(1);
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  const write = (k, v) => fs.writeFileSync(path.join(dataDir, `${k}.kv`), JSON.stringify(v));
  write('belific_tasks', [
    T('rent', 'Pay rent', { dueDate: today, startTime: '09:00', durationMinutes: 30, listKey: 'L1', projectKey: 'P1' }),
    T('call', 'Call the bank', { dueDate: today }),
    T('swim', 'Swim', { dueDate: '2026-09-01', startTime: '07:00', durationMinutes: 60, recurrence: 'daily' }),
    T('yoga', 'Yoga', { dueDate: '2026-09-01', startTime: '08:00', durationMinutes: 30, recurrence: 'daily' }),
    T('run', 'Run', { dueDate: '2026-09-01', startTime: '10:00', durationMinutes: 30, recurrence: 'daily' }),
  ]);
  write('belific_lists', [{ key: 'L1', name: 'Home', emoji: '🏠', sortOrder: 0, createdAt: stamp, updatedAt: stamp }]);
  write('belific_projects', [{ key: 'P1', name: 'Money', emoji: '💷', colorKey: 'yellow', createdAt: stamp, updatedAt: stamp }]);
  const read = (k) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dataDir, `${k}.kv`), 'utf8'));
    } catch {
      return [];
    }
  };
  const task = (id) => read('belific_tasks').find((t) => t.id === id);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.show();
  await C.sleep(2500);
  const P = await phoneWindow(win);
  await C.sleep(1500);
  const shot = async (name) => {
    if (!process.env.BELIFIC_SHOTS) return;
    fs.mkdirSync(process.env.BELIFIC_SHOTS, { recursive: true });
    fs.writeFileSync(path.join(process.env.BELIFIC_SHOTS, `${name}.png`), (await win.webContents.capturePage()).toPNG());
  };
  const tabEls = `[...document.querySelectorAll('a, [role="tab"], [role="button"], [role="link"]')].filter((e) => { const r = e.getBoundingClientRect(); return r.top > 760 && r.height > 20 && r.width > 40 && r.width < 200; })`;
  const tab = (name) => `${tabEls}.find((e) => e.textContent.replace(/[^ -~]/g, '').trim() === '${name}')`;
  const body = (title) => `[...document.querySelectorAll('[data-today-row="${title}"] [data-today-body]')][0]`;
  const cardOpen = () => P.js(`!!document.querySelector('[data-hold-card]')`);
  const holdItems = () => P.js(`[...document.querySelectorAll('[data-hold-card] [role="button"]')].map((e) => e.getAttribute('aria-label'))`);
  const holdTap = (label) => P.finger.tap(`document.querySelector('[data-hold-card] [aria-label=${JSON.stringify(label)}]')`, 1000);
  const menuItems = () => P.js(`[...document.querySelectorAll('[data-action-menu] [role="button"]')].map((e) => e.getAttribute('aria-label'))`);
  const menuTap = (label) => P.finger.tap(`[...document.querySelectorAll('[data-action-menu] [aria-label=${JSON.stringify(label)}]')].pop()`, 1000);
  const todayText = () => P.js(`document.body.innerText`);

  await P.finger.tap(tab('Today'), 1200);

  // ---- a one off task ----
  await P.finger.hold(body('Pay rent'), 480, 900);
  check('a press and hold opens the card', await cardOpen());
  const box = await P.js(`(() => { const e = document.querySelector('[data-hold-card]'); const r = e.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: innerWidth, h: innerHeight, top: r.top, bottom: r.bottom, text: e.innerText.replace(/\\s+/g, ' ') }; })()`);
  check('it sits in the middle of the screen', Math.abs(box.cx - box.w / 2) < 6 && box.cy > box.h * 0.25 && box.cy < box.h * 0.75 && box.top > 30 && box.bottom < box.h - 30, JSON.stringify(box));
  check('it shows the label, title, day and time, length and list', ['Money', 'Pay rent', 'Today, 9:00am to 9:30am', '30m', 'Home'].every((w) => box.text.includes(w)), box.text);
  check('Done, Edit, Move, Delete, More and Cancel; no Skip today on a one off task', JSON.stringify(await holdItems()) === JSON.stringify(['Done', 'Edit', 'Move', 'Delete', 'More', 'Cancel']), JSON.stringify(await holdItems()));
  const sizes = await P.js(`[...document.querySelectorAll('[data-hold-btn]')].map((e) => ({ n: e.getAttribute('data-hold-btn'), h: Math.round(e.getBoundingClientRect().height), f: parseFloat(getComputedStyle(e.querySelector('div') || e).fontSize) }))`);
  check('buttons are 44 high or more, text 14 px or more', sizes.length === 5 && sizes.every((b) => b.h >= 44 && b.f >= 14), JSON.stringify(sizes));
  const red = await P.js(`(() => { const d = document.querySelector('[data-hold-btn="delete"]'); return [d, ...d.querySelectorAll('*')].some((e) => { const s = getComputedStyle(e); return [s.color, s.backgroundColor, s.borderTopColor].some((c) => { const m = /rgba?\\((\\d+), (\\d+), (\\d+)/.exec(c); return !!m && +m[1] > 170 && +m[2] < 90 && +m[3] < 90; }); }); })()`);
  check('Delete is plain text with its word, not red', !red && (await P.js(`document.querySelector('[data-hold-btn="delete"]').innerText.trim()`)) === 'Delete');
  await shot('phone-p23-card');
  await P.finger.tapAt(box.w / 2, 40, 900);
  check('a tap on the dim area closes it', !(await cardOpen()));

  // Move
  await P.finger.hold(body('Pay rent'), 480, 900);
  await holdTap('Move');
  await C.sleep(500);
  check('Move offers Tomorrow, Next week, Pick a day, Brain Dump and the list', JSON.stringify(await menuItems()) === JSON.stringify(['Tomorrow', 'Next week', 'Pick a day', 'Brain Dump', '🏠 Home', 'Cancel']), JSON.stringify(await menuItems()));
  await menuTap('Tomorrow');
  check('Tomorrow moves the task to tomorrow', task('rent').dueDate === tomorrow, JSON.stringify(task('rent')));

  // Done
  await P.finger.hold(body('Call the bank'), 480, 900);
  await holdTap('Done');
  check('Done ticks it', task('call').completed === true);

  // ---- repeating tasks ----
  await P.finger.hold(body('Swim'), 480, 900);
  check('a repeating task also has Skip today', JSON.stringify(await holdItems()) === JSON.stringify(['Done', 'Edit', 'Skip today', 'Move', 'Delete', 'More', 'Cancel']), JSON.stringify(await holdItems()));
  const note = await P.js(`(() => { const e = document.querySelector('[data-hold-skip-note]'); return e ? { t: e.innerText.trim(), f: parseFloat(getComputedStyle(e).fontSize) } : null; })()`);
  check('Skip today has a plain line saying what it does, 14 px or more', !!note && note.t.includes('not today. It still repeats next time.') && note.f >= 14, JSON.stringify(note));
  await holdTap('Skip today');
  check('Skip today hides it today and the series stays', !(await todayText()).includes('Swim') && !task('swim').deletedAt);

  await P.finger.hold(body('Yoga'), 480, 900);
  await holdTap('Delete');
  const ask = await P.js(`(() => { const e = document.querySelector('[data-hold-ask]'); return e ? e.innerText.replace(/\\s+/g, ' ') : null; })()`);
  check('Delete on a repeating task asks "Only today, or every day?" on the same card', !!ask && ask.includes('Only today, or every day?') && ask.includes('Only today') && ask.includes('Every day'), String(ask));
  await shot('phone-p23-ask');
  await holdTap('Only today');
  check('Only today skips the day and keeps the series', !(await todayText()).includes('Yoga') && !task('yoga').deletedAt);

  await P.finger.hold(body('Run'), 480, 900);
  await holdTap('Delete');
  await holdTap('Every day');
  check('Every day deletes the series (to the Trash)', !!task('run').deletedAt);

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
