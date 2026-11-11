'use strict';
// @real-input: quiet
// Real check for PLAN_breaks_as_gaps P4 (3.35.0): the scissors. Today, Calendar Day view, "Boot Camp" 9:30 for 7 h
// repeating (today and tomorrow in its rule) and a one off "Read" at 20:00.
//   - the button in the header and C (no card focused) turn them on: pressed button, hint, a layer over the column;
//   - hover: a line and the time under the pointer, snapped to 5 minutes;
//   - D3: a cut that would leave a 10 minute piece is muted with "A piece would be 10 min (min 30)" and is not made;
//   - click 11:00, click 11:20 on Boot Camp: the popover asks This day only / All days of Boot Camp, All days has the
//     keyboard; Enter makes ONE Break series from today on the task's days; the gap shows today and tomorrow;
//   - one Ctrl+Z removes it;
//   - press, drag and release 12:30 to 13:30, This day only: a one off Break today;
//   - on empty grid (18:00 to 18:30) no popover: a one off Break;
//   - Esc drops a cut in progress; Esc again turns the scissors off;
//   - C on a focused card completes it and leaves the scissors off (D2); the Timebox has the button and the layer.
// The pointer is PointerEvents dispatched in the page; keys and clicks are sendInputEvent. Runs quiet.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const C = require('./common');
const { makeInput, dayKeyFrom, readKv } = require('./input');

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
  const dk = dayKeyFrom(new Date());
  const today = dk(0);
  const tomorrow = dk(1);
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const wd = (s) => WD[new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + s).getDay()];
  const days = [wd(-1), wd(0), wd(1), wd(2)];
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      T('camp', 'Boot Camp', { recurrence: 'weekly', recurrenceDays: days, dueDate: dk(-7), startTime: '09:30', durationMinutes: 420 }),
      T('read', 'Read', { dueDate: today, startTime: '20:00', durationMinutes: 30 }),
    ]),
  );
  const read = readKv(dataDir);
  const rows = () => read('belific_tasks') || [];
  const breaks = () => rows().filter((t) => t.cutsBelow && !t.deletedAt);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1440, 900);
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await I.waitBody('Read', 20000);
  await I.click(I.byLabel('Show the Calendar'), 800).catch(() => {});
  await I.key('d');
  await C.sleep(800);
  await I.js(`(() => { const s = document.querySelector('[data-cal-scroller]'); if (s) s.scrollTop = 9 * 56; })()`);
  await C.sleep(300);

  const layer = `document.querySelector('[data-cal-col="${today}"] [data-blade-layer]')`;
  // A pointer event at a time of the grid: 'down' and 'move' on the layer (or the window), 'up' on the window.
  const P = (type, min, onWindow = false) =>
    I.js(`(() => {
      const l = ${layer};
      const grid = document.querySelector('[data-calendar-grid]');
      if (!l || !grid) return false;
      const r = l.getBoundingClientRect();
      const o = { bubbles: true, cancelable: true, composed: true, clientX: r.left + r.width / 2, clientY: grid.getBoundingClientRect().top + (${min} / 60) * 56, button: 0, buttons: ${type === 'pointerup' ? 0 : 1}, pointerId: 9, pointerType: 'mouse', isPrimary: true };
      (${onWindow ? 'window' : 'l'}).dispatchEvent(new PointerEvent('${type}', o));
      return true;
    })()`);
  const click = async (min) => {
    await P('pointerdown', min);
    await P('pointerup', min, true);
    await C.sleep(250);
  };
  const m = (h, mm = 0) => h * 60 + mm;
  const btn = () => I.js(`(document.querySelector('[data-blade-button]') || {}).getAttribute?.('data-blade-button')`);

  // ---- on with C (nothing focused) ----
  check('the Calendar header has the scissors button, off, with "Scissors (C)"', (await btn()) === 'off' && (await I.exists(`document.querySelector('[data-blade-button][aria-label="Scissors (C)"]')`)));
  await I.blur();
  await I.key('C', [], 500);
  check('C turns the scissors on: the button is pressed, the hint shows, a layer covers the column', (await btn()) === 'on' && (await I.exists(`document.querySelector('[data-blade-hint]')`)) && (await I.exists(layer)), String(await btn()));
  await P('pointermove', m(11, 2));
  await C.sleep(200);
  check('hover: a line with the time under the pointer, snapped to 5 minutes (11:00)', await I.exists(`document.querySelector('[data-cal-col="${today}"] [data-blade-line="11:00"]')`));
  await I.shot('p51-hover');

  // ---- D3: refused, with the reason ----
  await click(m(9, 40));
  await P('pointermove', m(10), true);
  await C.sleep(250);
  const refused = await I.js(`(document.querySelector('[data-blade-refused]') || {}).getAttribute?.('data-blade-refused')`);
  check('D3: a cut that leaves a 10 minute piece is muted with the reason', refused === 'A piece would be 10 min (min 30)', String(refused));
  await I.shot('p51-refused');
  await click(m(10));
  await C.sleep(500);
  check('and the second click makes nothing', breaks().length === 0 && !(await I.exists(`document.querySelector('[data-blade-ask]')`)));
  await I.key('Escape', [], 400);
  check('Esc drops the cut in progress, the scissors stay on', !(await I.exists(`document.querySelector('[data-blade-preview]')`)) && (await btn()) === 'on');

  // ---- click, click, All days (Enter) ----
  await click(m(11));
  await P('pointermove', m(11, 20), true);
  await C.sleep(200);
  check('the preview gap runs from the first click to the pointer', await I.exists(`document.querySelector('[data-blade-preview="11:00-11:20"]')`));
  await click(m(11, 20));
  await C.sleep(400);
  const ask = await I.textOf(`document.querySelector('[data-blade-ask]')`);
  const focused = await I.js(`document.activeElement && document.activeElement.getAttribute('data-blade-choice')`);
  check('on a repeating task the popover asks: This day only / All days of Boot Camp, All days focused', ask.includes('This day only') && ask.includes('All days of Boot Camp') && focused === 'all', JSON.stringify([ask, focused]));
  await I.shot('p51-ask');
  await I.enter([], 1200);
  const b1 = breaks();
  check('Enter makes ONE Break: 11:00 for 20 minutes from today, on Boot Camp\'s days', b1.length === 1 && b1[0].title === 'Break' && b1[0].dueDate === today && b1[0].startTime === '11:00' && b1[0].durationMinutes === 20 && b1[0].recurrence === 'weekly' && JSON.stringify(b1[0].recurrenceDays) === JSON.stringify(days), JSON.stringify(b1));
  check('the gap is drawn today', await I.exists(`document.querySelector('[data-cal-col="${today}"] [data-gap]')`));
  check('the scissors stay on after a cut', (await btn()) === 'on');
  await I.shot('p51-cut-all-days');
  await I.click(I.byLabel('Calendar next day'), 800);
  check('and tomorrow too (the break series)', await I.exists(`document.querySelector('[data-cal-col="${tomorrow}"] [data-gap]')`));
  await I.click(I.byLabel('Calendar previous day'), 800);
  await I.blur();
  await I.key('Z', ['control'], 1500);
  check('one Ctrl+Z removes it', breaks().length === 0 && !(await I.exists(`document.querySelector('[data-cal-col="${today}"] [data-gap]')`)), JSON.stringify(breaks()));

  // ---- press, drag, release; This day only ----
  await I.js(`(() => { const s = document.querySelector('[data-cal-scroller]'); if (s) s.scrollTop = 9 * 56; })()`);
  await C.sleep(300);
  await P('pointerdown', m(12, 30));
  for (const t of [m(12, 50), m(13, 10), m(13, 30)]) {
    await P('pointermove', t, true);
    await C.sleep(60);
  }
  await P('pointerup', m(13, 30), true);
  await C.sleep(500);
  check('a press, a drag and a release make the cut in one movement (the popover asks)', await I.exists(`document.querySelector('[data-blade-ask]')`));
  await I.click(`document.querySelector('[data-blade-choice="day"]')`, 1200);
  const b2 = breaks();
  check('This day only: a one off Break today 12:30 for 1 h', b2.length === 1 && b2[0].dueDate === today && b2[0].startTime === '12:30' && b2[0].durationMinutes === 60 && !b2[0].recurrence, JSON.stringify(b2));

  // ---- empty grid: no popover ----
  await I.js(`(() => { const s = document.querySelector('[data-cal-scroller]'); if (s) s.scrollTop = 14 * 56; })()`);
  await C.sleep(300);
  await click(m(18));
  await click(m(18, 30));
  await C.sleep(900);
  const b3 = breaks().find((t) => t.startTime === '18:00');
  check('on empty grid there is no popover: a one off Break 18:00 for 30 minutes', !!b3 && b3.durationMinutes === 30 && !b3.recurrence && !(await I.exists(`document.querySelector('[data-blade-ask]')`)), JSON.stringify(breaks()));

  // ---- Esc twice: off ----
  await click(m(19));
  await I.key('Escape', [], 300);
  await I.key('Escape', [], 400);
  check('Esc drops the cut, Esc again turns the scissors off (no layer, button off)', (await btn()) === 'off' && !(await I.exists(layer)) && breaks().length === 2, String(await btn()));

  // ---- the Timebox has the button and the layer ----
  await I.click(`document.querySelector('[data-timebox-grid]') && [...document.querySelectorAll('[data-blade-button]')].find((b) => b.getBoundingClientRect().width > 0 && b.closest('[data-pane]') !== null) || [...document.querySelectorAll('[data-blade-button]')].pop()`, 500);
  check('the Timebox has its own button and its grid gets the layer too', (await I.js(`document.querySelectorAll('[data-blade-button]').length`)) >= 2 && (await I.exists(`document.querySelector('[data-timebox-grid] [data-blade-layer]')`)));
  await I.key('Escape', [], 400);

  // ---- D2: C on a focused card completes it ----
  await I.click(I.byLabel('Show Tasks'), 900).catch(() => {});
  await C.sleep(600);
  const focusedCard = await I.js(`(() => { const c = [...document.querySelectorAll('[aria-label="Task Read"]')].find((e) => e.getBoundingClientRect().width > 0); const f = c && (c.closest('[data-card-focus]') || c.querySelector('[data-card-focus]') || c); if (!f) return false; f.focus(); return !!f; })()`);
  await I.key('C', [], 900);
  const readRow = rows().find((t) => t.id === 'read');
  check('D2: C on a focused card completes it and the scissors stay off', focusedCard && !!readRow?.completed && (await btn()) === 'off', JSON.stringify([focusedCard, readRow, await btn()]));

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
