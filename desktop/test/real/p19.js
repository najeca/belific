'use strict';
// Real check for 2.36.0 (Part C, P3): one task, several times in a day.
//  1. the details panel: "+ Add another time", a tick, a move and a remove per time, refusals with a note,
//  2. completion per time (ticking the last open time completes the task, unticking reopens it),
//  3. a repeating task's shown day has the series' extra times, ticking one stores only that day,
//  4. the card shows its times, and the day's planned time counts every time.
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
  const D = day(1);
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const tasksFile = path.join(dataDir, 'belific_tasks.kv');
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  const seed = [
    T('brk', 'Short break', { dueDate: D, startTime: '11:00', durationMinutes: 20 }),
    // A daily series stored today with a second time: tomorrow is a shown day.
    T('rep', 'Daily walk', { dueDate: today, startTime: '10:00', durationMinutes: 30, recurrence: 'daily', extraTimes: ['15:00'] }),
  ];
  fs.writeFileSync(tasksFile, JSON.stringify(seed));
  const readTasks = () => JSON.parse(fs.readFileSync(tasksFile, 'utf8'));
  const rowOf = (id) => readTasks().find((t) => t.id === id);

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
  const inPanel = (sel) => `document.querySelector('[data-detail-panel] ${sel}')`;
  const scrollTo = (hour) => I.js(`(() => { const s = document.querySelector('[data-cal-scroller]'); if (s) s.scrollTop = ${hour} * 56 - 20; })()`);
  const openDetails = async (id) => {
    await scrollTo(8);
    await C.sleep(300);
    await I.click(cal(D, id), 800);
    await C.waitFor(() => I.exists(panel), 4000);
  };
  const closeDetails = async () => {
    await I.blur();
    await I.key('Escape');
    await C.sleep(400);
  };
  // Sets a time input the way a person finishing a time does: the value changes and the page is told.
  const setTime = (selector, value) =>
    I.js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  const timeValues = () => I.js(`Array.from(document.querySelectorAll('[data-detail-panel] [data-time-item] input[type=time]')).map((e) => e.value)`);
  const wait = (fn, ms = 4000) => C.waitFor(fn, ms).catch(() => false);

  // ======== 1. The details panel ========
  await openDetails('brk');
  check('1: a task with one time shows one time and "+ Add another time"', (await I.exists(inPanel('[data-add-time]'))) && (await I.exists(inPanel('input[aria-label="Time"]'))));
  await I.click(inPanel('[data-add-time]'), 900);
  await wait(() => !!rowOf('brk').extraTimes);
  check('1: it adds the end of the last time rounded up to the half hour (11:30), as an extra time', JSON.stringify(rowOf('brk').extraTimes) === '["11:30"]' && rowOf('brk').startTime === '11:00', JSON.stringify(rowOf('brk')));
  check('1: the details now list both times, each with a tick and a remove', JSON.stringify(await timeValues()) === '["11:00","11:30"]' && (await I.exists(inPanel('[data-time-tick="11:30"]'))));
  await setTime('[data-detail-panel] [data-time-item="11:30"] input[type=time]', '15:00');
  await wait(() => JSON.stringify(rowOf('brk').extraTimes) === '["15:00"]');
  check('1: moving the second time to 15:00 is stored', JSON.stringify(rowOf('brk').extraTimes) === '["15:00"]', JSON.stringify(rowOf('brk')));
  await setTime('[data-detail-panel] [data-time-item="15:00"] input[type=time]', '11:10');
  await C.sleep(700);
  const note = await I.js(`(() => { const e = document.querySelector('[data-detail-panel] [data-time-note]'); return e ? e.innerText : null; })()`);
  check('1: a time that would start before the first ends is refused with a note', !!note && /11:10am would start before the 11:00am one ends \(20 min each\)/.test(note) && JSON.stringify(rowOf('brk').extraTimes) === '["15:00"]', String(note));
  await I.shot('p19-details-extra-times');

  // ======== 2. Completion per time ========
  await I.click(inPanel('[data-time-tick="11:00"]'), 900);
  await wait(() => !!rowOf('brk').timesDone);
  check('2: ticking 11:00 leaves 15:00 open and the task not completed', JSON.stringify(rowOf('brk').timesDone) === '["11:00"]' && rowOf('brk').completed === false, JSON.stringify(rowOf('brk')));
  await I.click(inPanel('[data-time-tick="15:00"]'), 900);
  await wait(() => rowOf('brk').completed === true);
  check('2: ticking the last open time completes the task, with every time done', rowOf('brk').completed === true && JSON.stringify(rowOf('brk').timesDone) === '["11:00","15:00"]' && !!rowOf('brk').completedAt, JSON.stringify(rowOf('brk')));
  await I.click(inPanel('[data-time-tick="11:00"]'), 900);
  await wait(() => rowOf('brk').completed === false);
  check('2: unticking one time reopens it and the other time stays done', rowOf('brk').completed === false && JSON.stringify(rowOf('brk').timesDone) === '["15:00"]' && !rowOf('brk').completedAt, JSON.stringify(rowOf('brk')));
  await closeDetails();

  // ======== 4. The card and the planned time ========
  await I.click(`document.querySelector('[aria-label="Show Tasks"]')`, 900).catch(() => {});
  await C.sleep(500);
  const chip = await I.js(`(() => { const c = Array.from(document.querySelectorAll('[data-task-card="brk"]')).find((e) => e.getBoundingClientRect().width > 0); if (!c) return null; const t = c.querySelector('[data-card-time]'); return t ? { text: t.innerText, label: t.getAttribute('aria-label') } : null; })()`);
  check('4: the card shows both times, the done one with a tick', !!chip && chip.text === '11:00, 15:00 ✓', JSON.stringify(chip));
  check('4: its accessible name says which is done', !!chip && /^Starts 11:00, 15:00 \(done\)$/.test(chip.label || ''), JSON.stringify(chip));

  // ======== 3. A repeating task's shown day ========
  await I.click(`document.querySelector('[aria-label="Show the Calendar"]')`, 900).catch(() => {});
  await openDetails(`rep:${D}`);
  check('3: tomorrow\'s shown day of the series has both times (11:00 is not here: 10:00 and 15:00)', JSON.stringify(await timeValues()) === '["10:00","15:00"]', JSON.stringify(await timeValues()));
  check('3: and nothing is stored for that day yet', !rowOf(`rep:${D}`));
  await I.click(inPanel('[data-time-tick="15:00"]'), 1200);
  await wait(() => !!rowOf(`rep:${D}`));
  const day1 = rowOf(`rep:${D}`);
  check('3: ticking 15:00 stores that day with only 15:00 done', !!day1 && JSON.stringify(day1.timesDone) === '["15:00"]' && day1.completed === false && JSON.stringify(day1.extraTimes) === '["15:00"]', JSON.stringify(day1));
  check('3: the series itself is untouched (no ticks on the template)', rowOf('rep').timesDone === undefined && rowOf('rep').completed === false, JSON.stringify(rowOf('rep')));
  await closeDetails();
  await scrollTo(8);
  await openDetails(`rep:${day(2)}`).catch(() => {});
  const dayAfter = await I.exists(inPanel('[data-time-tick="15:00"]'));
  void dayAfter;
  await closeDetails();

  // Adding a time on a shown day edits the series.
  await openDetails(`rep:${D}`);
  await I.click(inPanel('[data-add-time]'), 1000);
  await wait(() => (rowOf(`rep:${D}`).extraTimes || []).length === 2);
  // The day was stored by the tick above; the latest stored row of a series is its template, so the series follows it.
  check('3: adding a time on that day gives it a third time (the stored day is the latest row: the series follows it)', (rowOf(`rep:${D}`).extraTimes || []).length === 2 && JSON.stringify(rowOf(`rep:${D}`).timesDone) === '["15:00"]', JSON.stringify(rowOf(`rep:${D}`)));
  await closeDetails();

  // ======== Removing the extra times ========
  await openDetails('brk');
  await I.click(inPanel('[aria-label="Remove the 3:00pm time"]'), 900);
  await wait(() => rowOf('brk').extraTimes === undefined);
  const b = rowOf('brk');
  check('1: removing the 15:00 time makes it an ordinary task again (no extra times, no ticks)', b.extraTimes === undefined && b.timesDone === undefined && b.startTime === '11:00', JSON.stringify(b));
  check('1: with its single time back as the usual Time field', await I.exists(inPanel('input[aria-label="Time"]')));
  await closeDetails();

  // The day's planned time counts every time: Short break 20 min once, the walk 30 min at three times.
  await I.click(`document.querySelector('[data-cal-head="${D}"]')`, 900).catch(() => {});
  await I.click(`document.querySelector('[aria-label="Day view"]')`, 900).catch(() => {});
  await C.sleep(500);
  const totals = await I.js(`(() => { const e = document.querySelector('[aria-label^="Actual against estimated:"]'); return e ? e.getAttribute('aria-label') : null; })()`);
  check('4: the planned time of the day counts every time (20 min + 3 x 30 min = 1:50)', totals === 'Actual against estimated: 0:00 / 1:50', String(totals));

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
