'use strict';
// @real-input: quiet
// Real check for the 3.53.1 fix: "This day only" on the FIRST day of a repeating shift stays on that day. On a FIXED CLOCK
// (Thursday 12 Nov 2026, 10:00), "Night shift" repeats every day from today at 19:00 for 3 h with "Check the log" on its
// checklist (its first and only stored row is today's, which is also the template the later days are drawn from).
//   - Add inside from today's details, "Pack the bag", This day only: today's card has it; Fri 13 and Sat 14 do not; the
//     stored rows say why (today's row has it, Friday is stored as the series was and now carries the series);
//   - Add inside again, "Check handover", All days (the default): today, Fri 13 and Sat 14 all show it, and still only
//     today has "Pack the bag";
//   - one Ctrl+Z takes "Check handover" off every day; a second takes "Pack the bag" off today (Friday's stored row stays, reading as the series does).
// Runs quiet.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const C = require('./common');
const { makeInput, readKv } = require('./input');

process.env.BELIFIC_NO_PROTOCOL_REGISTER = '1';
const userData = C.isolate();
console.log(`USERDATA ${userData}`);

const D1 = '2026-11-12';
const D2 = '2026-11-13';
const D3 = '2026-11-14';

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
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      { id: 'night', title: 'Night shift', dueDate: D1, startTime: '19:00', durationMinutes: 180, recurrence: 'daily', subtasks: [{ id: 'k1', title: 'Check the log', done: false }], completed: false, createdAt: stamp, updatedAt: stamp },
    ]),
  );
  const read = readKv(dataDir);
  const raw = () => read('belific_tasks') || [];
  const live = () => raw().filter((t) => !t.deletedAt);
  const titles = (id) => ((live().find((t) => t.id === id) || {}).subtasks || []).map((s) => s.title);

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
  await I.waitBody('Night shift', 20000);
  await I.click(I.byLabel('Show Tasks'), 900).catch(() => {});
  await C.sleep(900);

  const col = (day) => `document.querySelector('[data-day-col="${day}"]')`;
  const panel = `document.querySelector('[data-detail-panel]')`;
  const form = `document.querySelector('[data-add-inside-form]')`;
  const rowsOn = (day) =>
    I.js(`(() => { const c = ${col(day)}; if (!c) return null; const b = c.querySelector('[data-shift-body]'); return b ? [...b.querySelectorAll('[data-inside-row]')].map((r) => r.innerText.replace(/\\s+/g, ' ').trim()) : []; })()`);
  const has = (list, t) => !!list && list.some((r) => r.includes(t));
  const undo = async () => {
    await I.blur();
    await I.key('Z', ['control'], 1600);
  };
  const addInside = async (name, scope) => {
    await I.click(`${col(D1)}.querySelector('[aria-label="Title Night shift"]')`, 900);
    await C.waitFor(() => I.exists(panel), 5000);
    await I.click(`${panel}.querySelector('[data-add-inside="night"]')`, 700);
    await C.waitFor(() => I.exists(form), 4000);
    if (scope) await I.click(`${form}.querySelector('[data-add-inside-scope="${scope}"]')`, 400);
    await I.click(`${form}.querySelector('[data-add-inside-name]')`, 200);
    await I.type(name, 250);
    await I.enter([], 1600);
    await I.blur();
    await I.key('Escape');
    await C.sleep(800);
  };

  check('the three days show Night shift with "Check the log"', has(await rowsOn(D1), 'Check the log') && has(await rowsOn(D2), 'Check the log') && has(await rowsOn(D3), 'Check the log'), JSON.stringify([await rowsOn(D1), await rowsOn(D2), await rowsOn(D3)]));

  // ---- This day only, on the first day ----
  await addInside('Pack the bag', 'day');
  const r1 = [await rowsOn(D1), await rowsOn(D2), await rowsOn(D3)];
  check('This day only: today shows "Pack the bag"', has(r1[0], 'Pack the bag'), JSON.stringify(r1));
  check('Fri 13 and Sat 14 do not show it', !has(r1[1], 'Pack the bag') && !has(r1[2], 'Pack the bag') && has(r1[1], 'Check the log') && has(r1[2], 'Check the log'), JSON.stringify(r1));
  check('stored: today\'s row has it; Friday is stored as the series was (it carries the series on)', JSON.stringify(titles('night')) === JSON.stringify(['Check the log', 'Pack the bag']) && JSON.stringify(titles(`night:${D2}`)) === JSON.stringify(['Check the log']) && (live().find((t) => t.id === `night:${D2}`) || {}).recurrence === 'daily', JSON.stringify(live().map((t) => [t.id, (t.subtasks || []).map((s) => s.title)])));
  await I.shot('p67-day-only');

  // ---- All days ----
  await addInside('Check handover', null);
  const r2 = [await rowsOn(D1), await rowsOn(D2), await rowsOn(D3)];
  check('All days: today, Fri 13 and Sat 14 all show "Check handover"', r2.every((l) => has(l, 'Check handover')), JSON.stringify(r2));
  check('and still only today has "Pack the bag"', has(r2[0], 'Pack the bag') && !has(r2[1], 'Pack the bag') && !has(r2[2], 'Pack the bag'), JSON.stringify(r2));
  await I.shot('p67-all-days');

  // ---- Undo ----
  await undo();
  const r3 = [await rowsOn(D1), await rowsOn(D2), await rowsOn(D3)];
  check('one Ctrl+Z takes "Check handover" off every day', r3.every((l) => !has(l, 'Check handover')) && has(r3[0], 'Pack the bag'), JSON.stringify(r3));
  await undo();
  const r4 = [await rowsOn(D1), await rowsOn(D2)];
  // Friday's stored row stays (it reads exactly as the series does, as with any carrier row: hostActions.ts).
  check('a second Ctrl+Z takes "Pack the bag" off today; Friday reads as before', !has(r4[0], 'Pack the bag') && has(r4[0], 'Check the log') && JSON.stringify(r4[1]) === JSON.stringify(['Check the log']) && JSON.stringify(titles('night')) === JSON.stringify(['Check the log']), JSON.stringify([r4, live().map((t) => t.id)]));

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
