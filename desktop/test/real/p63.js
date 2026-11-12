'use strict';
// @real-input: quiet
// Real check for R2 of PLAN_repeat_end_and_parts (3.48.0): Repeat until, on a FIXED CLOCK (Thursday 12 Nov 2026, 10:00).
//   - a boot camp repeating Mon to Thu at 18:00, with a done day yesterday and an open stored day on Tue 17 Nov;
//   - the details show "Repeat until" with "No end"; picking Mon 16 Nov writes the end on every row, the repeat line
//     reads "Mon to Thu, until Mon 16 Nov", the 16th card says "Last day", and the days after it are hidden (the
//     stored 17th is still there, not deleted); the done day stays;
//   - one Ctrl+Z brings every day back; the visible Clear button does the same;
//   - "End repeat here" in the card's menu makes that day the last; text 14 px or more, nothing red.
// Runs quiet.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const C = require('./common');
const { makeInput, readKv } = require('./input');

process.env.BELIFIC_NO_PROTOCOL_REGISTER = '1';
const userData = C.isolate();
console.log(`USERDATA ${userData}`);

const TODAY = '2026-11-12';

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
  const stamp = '2026-11-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const camp = (extra = {}) => ({ id: 'camp', title: 'Boot camp', dueDate: '2026-11-02', startTime: '18:00', durationMinutes: 60, recurrence: 'weekly', recurrenceDays: ['Mon', 'Tue', 'Wed', 'Thu'], completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      camp({ completed: true, completedAt: '2026-11-02T19:00:00.000Z' }),
      camp({ id: 'camp:2026-11-11', dueDate: '2026-11-11', completed: true, completedAt: '2026-11-11T19:00:00.000Z' }),
      camp({ id: 'camp:2026-11-17', dueDate: '2026-11-17', notes: 'stored ahead' }),
    ]),
  );
  const read = readKv(dataDir);
  const raw = () => read('belific_tasks') || [];
  const byId = (id) => raw().find((t) => t.id === id);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1700, 1000);
  win.show();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');

  const dbg = win.webContents.debugger;
  dbg.attach('1.3');
  await dbg.sendCommand('Page.enable');
  const clockSource = (ms) => `(() => { const R = Date; const start = R.now(); const base = ${ms};
    class D extends R { constructor(...a) { if (a.length === 0) super(base + (R.now() - start)); else super(...a); } static now() { return base + (R.now() - start); } }
    window.Date = D; })()`;
  await dbg.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: clockSource(new Date(2026, 10, 12, 10, 0, 0, 0).getTime()) });
  win.webContents.reload();
  await C.sleep(2500);
  await I.waitBody('Boot camp', 20000);
  await I.click(I.byLabel('Show Tasks'), 900).catch(() => {});
  await C.sleep(900);

  const col = (day) => `document.querySelector('[data-day-col="${day}"]')`;
  const card = (day, id) => `(${col(day)} && ${col(day)}.querySelector('[data-task-card="${id}"]'))`;
  // A projected card has no data-task-card (it is not stored): cards are found by their title inside the day's column.
  const titleIn = (day) => `(${col(day)} && ${col(day)}.querySelector('[aria-label="Title Boot camp"]'))`;
  const hasCard = (day) => I.exists(titleIn(day));
  const panel = `document.querySelector('[data-detail-panel]')`;
  const notRed = (scope) =>
    I.js(`![...document.querySelectorAll('${scope} *')].some((e) => { const s = getComputedStyle(e); return [s.color, s.backgroundColor].some((c) => { const m = /rgba?\\((\\d+), (\\d+), (\\d+)/.exec(c); return m && +m[1] > 180 && +m[2] < 110 && +m[3] < 110; }); })`);
  const undo = async () => {
    await I.blur();
    await I.key('Z', ['control'], 1500);
  };
  const visibleDays = await I.js(`[...document.querySelectorAll('[data-day-col]')].map((e) => e.getAttribute('data-day-col'))`);
  check('the board shows today to at least Wed 18 Nov', visibleDays.includes(TODAY) && visibleDays.includes('2026-11-18'), JSON.stringify(visibleDays));
  check('before: the camp shows on 12, 16, 17 (stored) and 18 Nov', (await hasCard(TODAY)) && (await hasCard('2026-11-16')) && (await I.exists(card('2026-11-17', 'camp:2026-11-17'))) && (await hasCard('2026-11-18')), JSON.stringify(await I.js(`[...document.querySelectorAll('[data-day-col]')].map((c) => [c.getAttribute('data-day-col'), [...c.querySelectorAll('[data-task-card]')].map((e) => e.getAttribute('data-task-card'))])`)));

  // ---- the details: Repeat until ----
  await I.click(`${titleIn(TODAY)}`, 1000);
  await C.waitFor(() => I.exists(panel), 5000);
  const untilBtn = I.byLabel('Repeat until: No end');
  check('the details have "Repeat until" showing "No end"', await I.exists(untilBtn));
  check('the repeat line reads "Mon to Thu"', await I.exists(I.byLabel('Repeat: Mon to Thu')));
  await I.click(untilBtn, 700);
  const note = await I.js(`document.body.innerText.includes('The last day it happens. Later days are hidden, not deleted.') && document.body.innerText.includes('Pick a day on or after Mon 2 Nov.')`);
  check('the picker says what the date means and the first day allowed, in plain words', note);
  await I.shot('p63-picker');
  await I.click(I.byLabel('Repeat until 2026-11-16'), 1500);
  const rows = raw();
  check('picking Mon 16 Nov writes the end on every row (done ones too); nothing is deleted', rows.length === 3 && rows.every((r) => r.repeatUntil === '2026-11-16' && !r.deletedAt), JSON.stringify(rows.map((r) => [r.id, r.repeatUntil, r.deletedAt])));
  check('the repeat line reads "Mon to Thu, until Mon 16 Nov"; the field shows the date with a visible Clear button', (await I.exists(I.byLabel('Repeat: Mon to Thu, until Mon 16 Nov'))) && (await I.exists(I.byLabel('Repeat until: Mon 16 Nov'))) && (await I.exists(`document.querySelector('[data-until-clear]')`)));
  const clearFont = await I.js(`(() => { const e = document.querySelector('[data-until-clear] div[dir="auto"]'); return e ? parseFloat(getComputedStyle(e).fontSize) : 0; })()`);
  check('Clear is 14 px; nothing red in the details', clearFont >= 14 && (await notRed('[data-detail-panel]')), String(clearFont));
  await I.key('Escape', [], 800);
  await C.sleep(600);
  check('the board: the camp still on 12 and 16 Nov, hidden on 17 and 18 Nov', (await hasCard(TODAY)) && (await hasCard('2026-11-16')) && !(await hasCard('2026-11-17')) && !(await hasCard('2026-11-18')));
  check('the stored 17th is still stored, open, not deleted', !!byId('camp:2026-11-17') && !byId('camp:2026-11-17').deletedAt && !byId('camp:2026-11-17').completed);
  const last = await I.js(`(() => { const l = ${col('2026-11-16')}.querySelector('[data-last-day]'); return l ? [l.innerText.trim(), parseFloat(getComputedStyle(l).fontSize)] : null; })()`);
  check('the 16th card says "Last day" in 14 px', !!last && last[0] === 'Last day' && last[1] >= 14, JSON.stringify(last));
  check('the 12th card does not', !(await I.exists(`${col(TODAY)}.querySelector('[data-last-day]')`)));
  await I.shot('p63-ended');

  // ---- one Ctrl+Z brings every day back ----
  await undo();
  check('one Ctrl+Z: no end on any row, the 17th and 18th are back', raw().every((r) => !r.repeatUntil) && (await hasCard('2026-11-17')) && (await hasCard('2026-11-18')), JSON.stringify(raw().map((r) => r.repeatUntil)));

  // ---- End repeat here from the card's menu ----
  await I.hover(titleIn('2026-11-16'), 400);
  await I.click(`${col('2026-11-16')}.querySelector('[aria-label="More actions for Boot camp"]')`, 700);
  check('the card menu has "End repeat here" with its plain sub line', await I.js(`document.body.innerText.includes('End repeat here') && document.body.innerText.includes('This day is the last. Later days are hidden.')`));
  await I.shot('p63-menu');
  await I.click(I.byLabel('End repeat here'), 1500);
  check('"End repeat here" on Mon 16 Nov makes it the last day; the 17th and 18th are hidden', raw().every((r) => r.repeatUntil === '2026-11-16') && !(await hasCard('2026-11-17')) && !(await hasCard('2026-11-18')) && (await hasCard('2026-11-16')));

  // ---- Clear in the details brings them back ----
  await I.click(`${titleIn(TODAY)}`, 1000);
  await C.waitFor(() => I.exists(panel), 5000);
  await I.click(`document.querySelector('[data-until-clear]')`, 1500);
  check('Clear: no end on any row, "No end" shown, the later days back', raw().every((r) => !r.repeatUntil) && (await I.exists(I.byLabel('Repeat until: No end'))));
  await I.key('Escape', [], 800);
  await C.sleep(500);
  check('the board shows the 17th and 18th again', (await hasCard('2026-11-17')) && (await hasCard('2026-11-18')));
  check('the done day yesterday is untouched', byId('camp:2026-11-11').completed === true);

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
