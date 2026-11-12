'use strict';
// @real-input: quiet
// Real check for R3 of PLAN_repeat_end_and_parts (3.49.0): This and following, on a FIXED CLOCK (Thursday 12 Nov 2026,
// 10:00), with a boot camp repeating Mon to Thu at 18:00.
//   - the details of a repeating day have "Changes go to: This day only · This and following · All days" (All days
//     chosen), 14 px or more, nothing red;
//   - This and following on Mon 16 Nov, the title changed to "Morning camp": the series splits (the old one ends Sun 15
//     Nov, a new one starts on the 16th), today stays "Boot camp", the 16th to the 18th read "Morning camp", the details
//     follow the new day; one Ctrl+Z puts it all back;
//   - Clear day on Tue 17 Nov offers This and following: the repeat ends on the 16th (the 17th and 18th hidden, nothing
//     deleted); one Ctrl+Z puts it back.
// The scissors and Add inside need the pointer; their rules are in thisAndFollowing.test.ts.
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
    JSON.stringify([camp({ completed: true, completedAt: '2026-11-02T19:00:00.000Z' }), camp({ id: 'camp:2026-11-11', dueDate: '2026-11-11', completed: true, completedAt: '2026-11-11T19:00:00.000Z' })]),
  );
  const read = readKv(dataDir);
  const raw = () => read('belific_tasks') || [];
  const live = () => raw().filter((t) => !t.deletedAt);

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
  const titleIn = (day, title) => `(${col(day)} && ${col(day)}.querySelector('[aria-label="Title ${title}"]'))`;
  const panel = `document.querySelector('[data-detail-panel]')`;
  const undo = async () => {
    await I.blur();
    await I.key('Z', ['control'], 1600);
  };
  const notRed = (scope) =>
    I.js(`![...document.querySelectorAll('${scope} *')].some((e) => { const s = getComputedStyle(e); return [s.color, s.backgroundColor].some((c) => { const m = /rgba?\\((\\d+), (\\d+), (\\d+)/.exec(c); return m && +m[1] > 180 && +m[2] < 110 && +m[3] < 110; }); })`);

  // ---- the details of Mon 16 Nov ----
  await I.click(titleIn('2026-11-16', 'Boot camp'), 1000);
  await C.waitFor(() => I.exists(panel), 5000);
  const row = await I.js(`(() => { const r = document.querySelector('[data-change-scope]'); if (!r) return null; return { scope: r.getAttribute('data-change-scope'), text: r.innerText.replace(/\\s+/g, ' ').trim(), sizes: [...r.querySelectorAll('div[dir="auto"]')].map((e) => parseFloat(getComputedStyle(e).fontSize)) }; })()`);
  check('the details say "Changes go to: This day only · This and following · All days", All days chosen, 14 px or more', !!row && row.scope === 'all' && row.text.includes('Changes go to:') && row.text.includes('This day only') && row.text.includes('This and following') && row.text.includes('All days') && row.sizes.every((s) => s >= 14), JSON.stringify(row));
  check('nothing red in the details', await notRed('[data-detail-panel]'));
  await I.click(`document.querySelector('[data-change-scope-choice="following"]')`, 400);
  check('This and following can be chosen', (await I.js(`document.querySelector('[data-change-scope]').getAttribute('data-change-scope')`)) === 'following');
  await I.shot('p64-scope');
  await I.click(`document.querySelector('[data-detail-panel] [aria-label="Title"]')`, 300);
  await I.key('A', ['control'], 200);
  await I.type('Morning camp', 300);
  await I.enter([], 1800);
  const oldRoot = raw().find((t) => t.id === 'camp');
  const newRoot = live().find((t) => t.title === 'Morning camp' && t.recurrence);
  check('the old series ends on Sun 15 Nov; a new one starts on Mon 16 Nov, Mon to Thu at 18:00', oldRoot.repeatUntil === '2026-11-15' && !!newRoot && newRoot.dueDate === '2026-11-16' && newRoot.startTime === '18:00' && JSON.stringify(newRoot.recurrenceDays) === JSON.stringify(['Mon', 'Tue', 'Wed', 'Thu']), JSON.stringify([oldRoot, newRoot]));
  check('the done day yesterday stays with the old series, untouched but for the end date', raw().find((t) => t.id === 'camp:2026-11-11').completed === true && raw().find((t) => t.id === 'camp:2026-11-11').title === 'Boot camp');
  check('the details follow the new first day', await I.exists(`document.querySelector('[data-detail-panel] [aria-label="Title"]')`) && (await I.js(`document.querySelector('[data-detail-panel] [aria-label="Title"]').value`)) === 'Morning camp');
  await I.key('Escape', [], 800);
  await C.sleep(500);
  check('the board: today is still "Boot camp"; the 16th, 17th and 18th read "Morning camp"', (await I.exists(titleIn(TODAY, 'Boot camp'))) && (await I.exists(titleIn('2026-11-16', 'Morning camp'))) && (await I.exists(titleIn('2026-11-17', 'Morning camp'))) && (await I.exists(titleIn('2026-11-18', 'Morning camp'))) && !(await I.exists(titleIn('2026-11-17', 'Boot camp'))));
  await I.shot('p64-split');

  await undo();
  check('one Ctrl+Z puts it all back: no end, no "Morning camp", the 17th is "Boot camp" again', !raw().find((t) => t.id === 'camp').repeatUntil && !live().some((t) => t.title === 'Morning camp') && (await I.exists(titleIn('2026-11-17', 'Boot camp'))), JSON.stringify(live().map((t) => [t.id, t.title, t.repeatUntil])));

  // ---- Clear day on Tue 17 Nov: This and following ----
  await I.click(`document.querySelector('[data-day-menu="2026-11-17"]')`, 600);
  await I.click(`document.querySelector('[data-popover] [aria-label^="Clear "]')`, 900);
  const q = await I.textOf(`document.querySelector('[data-clear-box]')`);
  check('Clear day offers This day only, This and following, All days', q.includes('This day only') && q.includes('This and following') && q.includes('All days'), q);
  await I.click(`document.querySelector('[data-clear-scope="following"]')`, 300);
  await I.shot('p64-clear');
  await I.click(`document.querySelector('[data-clear-go]')`, 1800);
  check('This and following ends the repeat on Mon 16 Nov: every row has the end, nothing deleted', raw().filter((t) => t.id.startsWith('camp')).every((t) => t.repeatUntil === '2026-11-16' && !t.deletedAt), JSON.stringify(raw().map((t) => [t.id, t.repeatUntil, t.deletedAt])));
  check('the board: the 16th still shows it, the 17th and 18th do not', (await I.exists(titleIn('2026-11-16', 'Boot camp'))) && !(await I.exists(titleIn('2026-11-17', 'Boot camp'))) && !(await I.exists(titleIn('2026-11-18', 'Boot camp'))));
  await undo();
  check('one Ctrl+Z brings the 17th and 18th back', raw().filter((t) => t.id.startsWith('camp')).every((t) => !t.repeatUntil) && (await I.exists(titleIn('2026-11-17', 'Boot camp'))) && (await I.exists(titleIn('2026-11-18', 'Boot camp'))));

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
