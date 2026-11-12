'use strict';
// @real-input: quiet
// Real check for F7 of PLAN_daily_flow (3.46.0): Quick capture understands simple phrases, on a FIXED CLOCK (Thursday
// 12 Nov 2026, 10:00).
//   - "ring dentist tomorrow 9am" (T): a preview line "Understood: Tomorrow · 9:00am" in 14 px, with a visible
//     "Keep it as plain text" button; Enter saves "ring dentist" on 13 Nov at 09:00 (no length);
//   - "gym Mon Wed 6pm 1h" (Q): the preview says "Mon, Wed · 6:00pm · 1h · repeats"; Enter saves "gym", repeating weekly
//     on Mon and Wed from Mon 16 Nov, 18:00, 60 minutes;
//   - "Keep it as plain text" saves the words as typed; text with no phrase ("ring 9 people") shows no preview and saves
//     as before; Shift+Enter saves and keeps the box open, the box and the preview cleared; with "Remind me" on there is
//     no phrase reading; nothing red.
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
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const read = readKv(dataDir);
  const raw = () => read('belific_tasks') || [];
  const byTitle = (t) => raw().find((x) => x.title === t && !x.deletedAt);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1700, 1000);
  win.show();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');

  // ---- the fixed clock ----
  const dbg = win.webContents.debugger;
  dbg.attach('1.3');
  await dbg.sendCommand('Page.enable');
  const clockSource = (ms) => `(() => { const R = Date; const start = R.now(); const base = ${ms};
    class D extends R { constructor(...a) { if (a.length === 0) super(base + (R.now() - start)); else super(...a); } static now() { return base + (R.now() - start); } }
    window.Date = D; })()`;
  await dbg.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: clockSource(new Date(2026, 10, 12, 10, 0, 0, 0).getTime()) });
  win.webContents.reload();
  await C.sleep(2500);
  await C.waitFor(() => I.exists(`document.querySelector('[data-plan-button]')`), 20000);
  await C.sleep(900);

  const box = `document.querySelector('[aria-label="Quick capture"][role="dialog"]')`;
  const preview = () => I.js(`(() => { const e = document.querySelector('[data-quick-preview-text]'); return e ? e.innerText.trim() : null; })()`);
  const fontOf = (sel) => I.js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? parseFloat(getComputedStyle(e).fontSize) : 0; })()`);
  const notRed = () =>
    I.js(`![...document.querySelectorAll('[aria-label="Quick capture"] *')].some((e) => { const s = getComputedStyle(e); return [s.color, s.backgroundColor, s.borderColor].some((c) => { const m = /rgba?\\((\\d+), (\\d+), (\\d+)/.exec(c); return m && +m[1] > 180 && +m[2] < 110 && +m[3] < 110; }); })`);
  const open = async (k) => {
    await I.blur();
    await I.key(k, [], 800);
  };

  // ---- "ring dentist tomorrow 9am" with T ----
  await open('T');
  check('T opens Quick capture with no preview while nothing is typed', (await I.exists(box)) && (await preview()) === null);
  await I.type('ring dentist tomorrow 9am', 400);
  const pv = await preview();
  check('the preview says what it understood: "Understood: Tomorrow · 9:00am"', pv === 'Understood: Tomorrow · 9:00am', String(pv));
  check('a visible "Keep it as plain text" button; the preview is 14 px; nothing red', (await I.exists(`document.querySelector('[data-quick-keep]')`)) && (await fontOf('[data-quick-preview-text]')) >= 14 && (await fontOf('[data-quick-keep] div[dir="auto"]')) >= 14 && (await notRed()));
  await I.shot('p62-preview');
  await I.enter([], 1200);
  const dentist = byTitle('ring dentist');
  check('Enter saves "ring dentist" on tomorrow at 09:00, with no length, no repeat; the box closes', !!dentist && dentist.dueDate === '2026-11-13' && dentist.startTime === '09:00' && dentist.durationMinutes === undefined && !dentist.recurrence && !(await I.exists(box)), JSON.stringify(dentist));
  check('nothing of the phrase is left in the title', !raw().some((t) => /tomorrow|9am/.test(t.title)));

  // ---- "gym Mon Wed 6pm 1h" with Q ----
  await open('Q');
  await I.type('gym Mon Wed 6pm 1h', 400);
  const pg = await preview();
  check('the preview says "Understood: Mon, Wed · 6:00pm · 1h · repeats"', pg === 'Understood: Mon, Wed · 6:00pm · 1h · repeats', String(pg));
  await I.enter([], 1200);
  const gym = byTitle('gym');
  check('Enter saves "gym": weekly on Mon and Wed, first on Mon 16 Nov, 18:00, 60 minutes', !!gym && gym.recurrence === 'weekly' && JSON.stringify(gym.recurrenceDays) === JSON.stringify(['Mon', 'Wed']) && gym.dueDate === '2026-11-16' && gym.startTime === '18:00' && gym.durationMinutes === 60, JSON.stringify(gym));

  // ---- keep it as plain text ----
  await open('T');
  await I.type('ring Sam 9am', 400);
  check('a time alone is understood too: "Understood: Today · 9:00am"', (await preview()) === 'Understood: Today · 9:00am');
  await I.click(`document.querySelector('[data-quick-keep]')`, 500);
  check('"Keep it as plain text" hides the preview', (await preview()) === null && (await I.exists(box)));
  await I.click(`document.querySelector('[aria-label="Quick capture task"]')`, 200);
  await I.enter([], 1200);
  const plainT = byTitle('ring Sam 9am');
  check('and saves the words as typed on today (T as before): no time, no length', !!plainT && plainT.dueDate === TODAY && !plainT.startTime && plainT.durationMinutes === undefined, JSON.stringify(plainT));

  // ---- no phrase: nothing changes ----
  await open('T');
  await I.type('ring 9 people', 300);
  check('"ring 9 people" shows no preview', (await preview()) === null);
  await I.enter([], 1000);
  const people = byTitle('ring 9 people');
  check('and saves on today as before', !!people && people.dueDate === TODAY && !people.startTime && people.durationMinutes === undefined, JSON.stringify(people));
  await open('Q');
  await I.type('Monday meeting notes', 300);
  check('"Monday meeting notes" is not read either', (await preview()) === null);
  await I.enter([], 1000);
  const notes = byTitle('Monday meeting notes');
  check('it goes to the list with no Day, as before', !!notes && !notes.dueDate && !notes.startTime, JSON.stringify(notes));

  // ---- Shift+Enter keeps the box open ----
  await open('T');
  await I.type('water plants tomorrow 30m', 400);
  check('"water plants tomorrow 30m": Tomorrow · 30m', (await preview()) === 'Understood: Tomorrow · 30m');
  await I.enter(['shift'], 1200);
  const water = byTitle('water plants');
  check('Shift+Enter saves it with the Day and length and keeps the box open, empty, with no preview', !!water && water.dueDate === '2026-11-13' && water.durationMinutes === 30 && !water.startTime && (await I.exists(box)) && (await preview()) === null);

  // ---- Remind me: no phrase reading ----
  await I.type('call mum tomorrow', 300);
  check('before the switch: the phrase is read', (await preview()) === 'Understood: Tomorrow');
  await I.click(`document.querySelector('[data-remind-row] [role="switch"]')`, 500);
  check('with "Remind me" on there is no phrase reading (it has its own time)', (await preview()) === null);
  await I.key('Escape', [], 600);
  check('Escape closes the box', !(await I.exists(box)));
  await I.shot('p62-after');

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
