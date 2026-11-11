'use strict';
// @real-input: quiet
// Real check for PLAN_breaks_as_gaps P3 (3.34.0): editing a gap. Today, Calendar Day view:
//   - "Deep work" 9:00 for 4 h with a one off "Coffee" break 10:00 for 20 min inside it;
//   - a repeating "Camp" 14:00 for 3 h with a repeating "Short break" 15:00 for 20 min (both shown, not stored).
// Checks: the gap's bottom edge resizes it in 5 minute steps; its top edge moves its start and keeps its end; a drag
// on its body moves it (5 minute steps since 3.35.0, as its edges); one Ctrl+Z undoes the last; a repeating break resized on one day
// changes that day only; D5: Deep work dragged an hour later takes Coffee along, and one Ctrl+Z puts both back.
// The pointer is driven with PointerEvents dispatched in the page (the app's own drag code reads them), so nothing
// moves the real mouse and it runs quiet. Real app, isolated data folder, in process fake Supabase.
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
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const wd = (s) => WD[new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + s).getDay()];
  const rule = { recurrence: 'weekly', recurrenceDays: [wd(-1), wd(0), wd(1)] };
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      T('deep', 'Deep work', { dueDate: today, startTime: '09:00', durationMinutes: 240 }),
      T('coffee', 'Coffee', { dueDate: today, startTime: '10:00', durationMinutes: 20, cutsBelow: true }),
      T('camp', 'Camp', { ...rule, dueDate: dk(-7), startTime: '14:00', durationMinutes: 180 }),
      T('rb', 'Short break', { ...rule, dueDate: dk(-7), startTime: '15:00', durationMinutes: 20, cutsBelow: true }),
    ]),
  );
  const read = readKv(dataDir);
  const rows = () => read('belific_tasks') || [];
  const byId = (id) => rows().find((t) => t.id === id);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1440, 900);
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await C.sleep(3500);
  await I.click(I.byLabel('Show the Calendar'), 800).catch(() => {});
  await I.key('d');
  await C.sleep(800);
  await I.js(`(() => { const s = document.querySelector('[data-cal-scroller]'); if (s) s.scrollTop = ${8.5 * 56}; })()`);
  await C.sleep(400);

  // A press at `fromMin` on the element `sel`, moved to `toMin`, released: PointerEvents in the page.
  const drag = (sel, fromMin, toMin) =>
    I.js(`(async () => {
      const el = ${sel};
      const grid = document.querySelector('[data-calendar-grid]');
      if (!el || !grid) return 'missing';
      const r = el.getBoundingClientRect();
      const top = grid.getBoundingClientRect().top;
      const x = r.left + r.width / 2;
      const yOf = (m) => top + (m / 60) * 56;
      const o = (y) => ({ bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0, buttons: 1, pointerId: 7, pointerType: 'mouse', isPrimary: true });
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      el.dispatchEvent(new PointerEvent('pointerdown', o(yOf(${fromMin}))));
      for (let i = 1; i <= 8; i++) {
        window.dispatchEvent(new PointerEvent('pointermove', o(yOf(${fromMin} + ((${toMin} - ${fromMin}) * i) / 8))));
        await wait(40);
      }
      window.dispatchEvent(new PointerEvent('pointerup', o(yOf(${toMin}))));
      return 'ok';
    })()`);
  const edge = (which, id) => `document.querySelector('[data-gap-edge="${which}:${id}"]')`;
  const gap = (id) => `document.querySelector('[data-gap="${id}"]')`;
  const m = (h, mm = 0) => h * 60 + mm;
  const settle = () => C.sleep(1200);

  // ---- the bottom edge: 5 minute steps ----
  check('the Coffee gap has a top and a bottom edge', (await I.exists(edge('top', 'coffee'))) && (await I.exists(edge('bottom', 'coffee'))));
  await drag(edge('bottom', 'coffee'), m(10, 18), m(10, 36));
  await settle();
  check('bottom edge: Coffee is 35 minutes from 10:00 (5 minute steps)', byId('coffee')?.startTime === '10:00' && byId('coffee')?.durationMinutes === 35, JSON.stringify(byId('coffee')));
  // ---- the top edge: the start moves, the end stays ----
  await drag(edge('top', 'coffee'), m(10, 1), m(9, 49));
  await settle();
  check('top edge: Coffee starts 9:50 and still ends 10:35 (45 minutes)', byId('coffee')?.startTime === '09:50' && byId('coffee')?.durationMinutes === 45, JSON.stringify(byId('coffee')));
  // ---- the body: a move, then one Ctrl+Z ----
  await drag(gap('coffee'), m(10, 10), m(11, 10));
  await settle();
  check('a drag on the gap moves it by exactly an hour (5 minute steps): 10:50, still 45 minutes', byId('coffee')?.startTime === '10:50' && byId('coffee')?.durationMinutes === 45, JSON.stringify(byId('coffee')));
  await I.shot('p50-moved');
  await I.blur();
  await I.key('Z', ['control'], 1500);
  check('one Ctrl+Z puts the gap back at 9:50', byId('coffee')?.startTime === '09:50' && byId('coffee')?.durationMinutes === 45, JSON.stringify(byId('coffee')));

  // ---- a repeating break: this day only ----
  const rid = `rb:${today}`;
  check('the repeating Short break is drawn today as a gap', await I.exists(gap(rid)));
  await drag(edge('bottom', rid), m(15, 18), m(15, 31));
  await settle();
  const dayRow = rows().find((t) => t.id.startsWith('rb') && t.dueDate === today && !t.deletedAt && t.id !== 'rb');
  check('a repeating break resized on one day: that day is 30 minutes', !!dayRow && dayRow.durationMinutes === 30, JSON.stringify(dayRow));
  check('and the series keeps 20 minutes (the other days)', byId('rb')?.durationMinutes === 20, JSON.stringify(byId('rb')));

  // ---- D5: the task under a gap takes it along, one undo for both ----
  // 3.35.0: any piece takes the drag; here the FIRST piece (9:00 to 9:50), which until 3.34.0 could not be dragged.
  await drag(`document.querySelector('[data-cal-block="cal${today}:deep"]')`, m(9, 20), m(10, 20));
  await settle();
  check('D5: Deep work dragged an hour later starts 10:00', byId('deep')?.startTime === '10:00', JSON.stringify(byId('deep')));
  check('D5: and Coffee went with it (10:50, 45 minutes)', byId('coffee')?.startTime === '10:50' && byId('coffee')?.durationMinutes === 45, JSON.stringify(byId('coffee')));
  await I.shot('p50-d5');
  await I.blur();
  await I.key('Z', ['control'], 1500);
  check('D5: one Ctrl+Z puts both back (9:00 and 9:50)', byId('deep')?.startTime === '09:00' && byId('coffee')?.startTime === '09:50', JSON.stringify([byId('deep'), byId('coffee')]));

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
