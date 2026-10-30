'use strict';
// Real touch check for PLAN_phone P10 (2.58.0): press and hold a block on the Day timeline, then drag
// it in time, at 390 x 844. 15 minute steps (decision 6); the drop writes the desktop's fields; Undo
// puts it back; one time of a task with several times moves alone (an overlap is refused with a note);
// a projected repeating day moves the series' time, never its day; a quick tap still opens the block,
// and a drag without the hold moves nothing.
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
  // Tomorrow: a day that is never in the past while the check runs.
  const D = day(1);
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, dueDate: D, ...extra });
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      T('stand', 'Standup', { startTime: '09:00', durationMinutes: 60 }),
      T('brk', 'Short break', { startTime: '11:00', durationMinutes: 20, extraTimes: ['15:00'] }),
      T('walk', 'Morning walk', { dueDate: day(-3), startTime: '07:00', durationMinutes: 30, recurrence: 'daily' }),
    ]),
  );
  const task = (id) => JSON.parse(fs.readFileSync(path.join(dataDir, 'belific_tasks.kv'), 'utf8')).find((t) => t.id === id);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.show();
  await C.sleep(2500);
  const P = await phoneWindow(win);
  const shot = async (name) => {
    if (!process.env.BELIFIC_SHOTS) return;
    fs.mkdirSync(process.env.BELIFIC_SHOTS, { recursive: true });
    fs.writeFileSync(path.join(process.env.BELIFIC_SHOTS, `${name}.png`), (await win.webContents.capturePage()).toPNG());
  };
  const tabEls = `[...document.querySelectorAll('a, [role="tab"], [role="button"], [role="link"]')].filter((e) => { const r = e.getBoundingClientRect(); return r.top > 760 && r.height > 20 && r.width > 40 && r.width < 200; })`;
  const tab = (name) => `${tabEls}.find((e) => e.textContent.replace(/[^ -~]/g, '').trim() === '${name}')`;
  const visible = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].reverse().find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left >= -1 && r.left < innerWidth && r.top < innerHeight && r.bottom > 0; })`;
  const block = (id) => `document.querySelector('[data-block-tap="${id}"]')`;
  const scrollToHour = async (hour) => {
    await P.js(`(() => { let e = document.querySelector('[data-empty-slots]'); while (e && !(e.scrollHeight > e.clientHeight + 4 && ['auto', 'scroll'].includes(getComputedStyle(e).overflowY))) e = e.parentElement; if (e) e.scrollTop = ${hour} * 56; })()`);
    await C.sleep(400);
  };
  const notice = () => P.js(`(document.querySelector('[data-undo-bar]') || {}).innerText || ''`);

  await P.finger.tap(tab('Calendar'), 1200);
  await P.finger.tap(visible('[aria-label="Next day"]'), 900);
  await C.waitFor(() => P.js(`!!document.querySelector('[data-block-tap="task:stand"]')`), 6000).catch(() => {});
  await scrollToHour(6.5);

  // Hold, then drag an hour down.
  await P.finger.holdDrag(block('task:stand'), 0, 56, 520, 500, 1000);
  check('hold then drag an hour down moves it to 10:00', task('stand').startTime === '10:00' && task('stand').dueDate === D, JSON.stringify(task('stand')));
  check('a message says where it went, with Undo', /Moved to 10:00am/.test(await notice()) && /Undo/.test(await notice()), await notice());
  await shot('phone-p10-moved');
  await P.finger.tap(`document.querySelector('[data-undo-bar] [aria-label="Undo"]')`, 900);
  check('Undo puts it back at 9:00', task('stand').startTime === '09:00', JSON.stringify(task('stand')));

  // 15 minute steps: about 25 minutes down lands on the nearest quarter (9:30).
  await P.finger.holdDrag(block('task:stand'), 0, 28, 520, 400, 1000);
  check('the drop snaps to a quarter hour (9:30)', task('stand').startTime === '09:30', JSON.stringify(task('stand')));

  // A drag without the hold moves nothing; a quick tap still opens the block.
  await P.finger.drag(block('task:stand'), 0, 80, 200, 800);
  check('a drag without the hold moves nothing', task('stand').startTime === '09:30');
  await P.finger.tap(block('task:stand'), 1200);
  check('a quick tap still opens the details', await P.js(`!!document.querySelector('[data-task-details="stand"]')`));
  await P.finger.tap(visible('[aria-label="Done"]'), 900);

  // One time of a task with several times.
  await scrollToHour(10);
  await P.finger.holdDrag(block('task:brk@15:00'), 0, 56, 520, 500, 1000);
  check('one time of a task with several times moves alone (15:00 to 16:00)', task('brk').startTime === '11:00' && JSON.stringify(task('brk').extraTimes) === '["16:00"]', JSON.stringify(task('brk')));
  await scrollToHour(10);
  await P.finger.holdDrag(block('task:brk@16:00'), 0, -(4.75 * 56), 520, 700, 1000);
  check('a drop over its other time is refused, with a note', JSON.stringify(task('brk').extraTimes) === '["16:00"]' && /Not moving it/.test(await notice()), `${JSON.stringify(task('brk'))} ${await notice()}`);

  // A projected repeating day: since 3.20.0 a drag changes that day only, with no question (the series keeps 7:00).
  await scrollToHour(6);
  await P.finger.holdDrag(block(`task:walk:${D}`), 0, 28, 520, 400, 1000);
  await C.sleep(600);
  check('no question is asked', !(await P.js(`!!document.querySelector('[data-action-menu]')`)));
  check('a repeating day moves that day only (7:30); the series keeps 7:00', !!task(`walk:${D}`) && task(`walk:${D}`).startTime === '07:30' && task('walk').startTime === '07:00' && task('walk').dueDate === day(-3), JSON.stringify([task('walk'), task(`walk:${D}`)]));

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
