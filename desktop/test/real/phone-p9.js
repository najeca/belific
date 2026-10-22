'use strict';
// Real touch check for PLAN_phone P9 (2.57.0): the Calendar's Week and Month at 390 x 844, and the
// sideways swipe. Week has seven columns with short titles; a tap on a day in Week or Month opens it in
// Day view and never creates a task; a sideways swipe moves one day, week or month; a vertical scroll
// (even a slightly slanted one) never turns the page.
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
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, dueDate: today, ...extra });
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      T('a', 'Quarterly planning workshop with the team', { startTime: '09:00', durationMinutes: 60 }),
      T('b', 'Buy milk'),
      T('c', 'Dentist appointment', { dueDate: day(1), startTime: '14:00' }),
      T('d', 'Walk', { dueDate: day(-3), startTime: '07:00', recurrence: 'daily' }),
    ]),
  );
  const count = () => JSON.parse(fs.readFileSync(path.join(dataDir, 'belific_tasks.kv'), 'utf8')).length;

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
  const title = () => P.js(`(document.querySelector('[data-cal-title]') || {}).getAttribute?.('data-cal-title')`);
  const page = `document.querySelector('[data-cal-page]')`;
  const swipe = async (dx, dy = 0) => {
    const p = await P.point(page);
    await P.finger.drag(page, dx, dy, 260, 900, { x: p.w / 2, y: Math.min(300, p.h / 2) });
  };

  await P.finger.tap(tab('Calendar'), 1200);

  // Day: the sideways swipe.
  await swipe(-220);
  check('Day: a swipe to the left goes to the next day', (await title()) === day(1), String(await title()));
  await swipe(220);
  check('Day: a swipe to the right comes back', (await title()) === today, String(await title()));
  const scroller = `(() => { let e = document.querySelector('[data-empty-slots]'); while (e && !(e.scrollHeight > e.clientHeight + 4 && ['auto', 'scroll'].includes(getComputedStyle(e).overflowY))) e = e.parentElement; return e; })()`;
  const before = await P.js(`${scroller}.scrollTop`);
  // Down (the timeline opens near now, which may already be the bottom of the day).
  await swipe(30, 200);
  const after = await P.js(`${scroller}.scrollTop`);
  check('Day: a slanted vertical drag scrolls the timeline and never turns the page', (await title()) === today && after < before - 60, `${before} -> ${after}`);
  check('Day: and it opened nothing', !(await P.js(`!!document.querySelector('[data-quick-add], [data-task-details]')`)));

  // Week.
  await P.finger.tap(visible('[data-seg="week"]'), 900);
  const cols = await P.js(`[...document.querySelectorAll('[data-week-day]')].map((e) => e.getAttribute('data-week-day'))`);
  check('Week: seven day columns', cols.length === 7 && cols.includes(today), JSON.stringify(cols));
  const chips = await P.js(`[...document.querySelectorAll('[data-week-day="${today}"] [data-week-item]')].map((e) => e.innerText)`);
  check('Week: short titles only', chips.length >= 3 && chips.every((t) => t.length <= 9) && chips.includes('Buy milk'), JSON.stringify(chips));
  await shot('phone-p9-week');
  const n0 = count();
  await P.finger.tap(visible(`[data-week-day="${day(1)}"]`), 1000);
  check('Week: a tap on a day opens it in Day view, and creates nothing', !!(await P.js(`document.querySelector('[data-day-view="${day(1)}"]')`)) && count() === n0 && !(await P.js(`!!document.querySelector('[data-quick-add]')`)));
  await P.finger.tap(visible('[data-seg="week"]'), 900);
  const weekBefore = await P.js(`document.querySelector('[data-week-view]').getAttribute('data-week-view')`);
  await swipe(-220);
  const weekAfter = await P.js(`document.querySelector('[data-week-view]').getAttribute('data-week-view')`);
  check('Week: a swipe to the left goes to the next week', weekAfter > weekBefore && (Date.parse(weekAfter) - Date.parse(weekBefore)) / 86400000 === 7, `${weekBefore} -> ${weekAfter}`);

  // Month.
  await P.finger.tap(visible('[aria-label="Go to today"]'), 800);
  await P.finger.tap(visible('[data-seg="month"]'), 900);
  const cells = await P.js(`document.querySelectorAll('[data-month-day]').length`);
  check('Month: whole weeks of the month', cells >= 28 && cells % 7 === 0, String(cells));
  await shot('phone-p9-month');
  const m0 = await P.js(`document.querySelector('[data-month-view]').getAttribute('data-month-view')`);
  await swipe(-220);
  const m1 = await P.js(`document.querySelector('[data-month-view]').getAttribute('data-month-view')`);
  check('Month: a swipe to the left goes to the next month', m1 !== m0 && m1 > m0, `${m0} -> ${m1}`);
  await swipe(220);
  const n1 = count();
  await P.finger.tap(visible(`[data-month-day="${today}"]`), 1000);
  check('Month: a tap on a day opens it in Day view, and creates nothing', !!(await P.js(`document.querySelector('[data-day-view="${today}"]')`)) && count() === n1);

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
