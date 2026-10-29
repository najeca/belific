'use strict';
// Real check for 3.17.0 (step 5): the Today button (jump to today) sits beside the Tasks / Calendar toggle and
// Only today sits next to Day / Week / Month (and next to Filter on the board), each with a tooltip; today is marked
// with a small "Today" tag on its column header in Day, Week and Month and a clear today style in the month grid.
// Light and dark. BELIFIC_SHOTS: a folder for screenshots.
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
  const TODAY = day(0);
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  fs.writeFileSync(path.join(dataDir, 'belific_tasks.kv'), JSON.stringify([T('a', 'Today thing', { dueDate: TODAY, startTime: '10:00', durationMinutes: 60 }), T('b', 'Tomorrow thing', { dueDate: day(1), startTime: '11:00', durationMinutes: 30 })]));
  fs.writeFileSync(path.join(dataDir, 'belific_desktop_panes.kv'), JSON.stringify({ leftCollapsed: false, rightCollapsed: false, center: 'kanban', calendar: 'week' }));

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1440, 900);
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await I.waitBody('Today thing', 20000);
  await I.click(I.byLabel('Show Tasks'), 800).catch(() => {});
  await C.sleep(500);

  const lum = (rgb) => {
    const m = String(rgb).match(/\d+(\.\d+)?/g) || [0, 0, 0];
    const [r, g, b] = m.slice(0, 3).map((v) => { const c = Number(v) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const vis = (label) => `[...document.querySelectorAll('[aria-label="${label}"]')].find((e) => e.getBoundingClientRect().width > 0)`;
  const rect = (label) => I.js(`(() => { const e = ${vis(label)}; if (!e) return null; const r = e.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), title: e.getAttribute('title'), disabled: e.getAttribute('aria-disabled'), pressed: e.getAttribute('aria-pressed') }; })()`);

  async function layout(mode) {
    // ---- Tasks view ----
    const seg = await rect('Show the Calendar');
    const tasksToday = await rect('Show today in Tasks');
    const quests = await rect('Quests');
    check(`${mode}: top row: Today sits right after the Tasks / Calendar toggle, before Quests, in the same row`, !!seg && !!tasksToday && !!quests && tasksToday.l >= seg.r && tasksToday.r <= quests.l && Math.abs(tasksToday.t - seg.t) < 12, JSON.stringify({ seg, tasksToday, quests }));
    check(`${mode}: the top row no longer has Only today`, !!tasksToday && (await I.js(`[...document.querySelectorAll('[aria-label="Show only today"]')].filter((e) => e.getBoundingClientRect().top < 70 && e.getBoundingClientRect().width > 0).length`)) === 0);
    check(`${mode}: Today has a tooltip`, !!tasksToday && /today/i.test(tasksToday.title || ''), JSON.stringify(tasksToday));
    const only = await rect('Show only today');
    const filter = await I.js(`(() => { const b = [...document.querySelectorAll('[aria-label^="Filter"], [data-ctl="filter"]')].find((e) => e.getBoundingClientRect().width > 0); if (!b) return null; const r = b.getBoundingClientRect(); return { r: Math.round(r.right), t: Math.round(r.top) }; })()`);
    check(`${mode}: on the board Only today is next to Filter (below the top row), with a tooltip`, !!only && only.t > 70 && /only today/i.test(only.title || '') && (!filter || (only.l >= filter.r - 2 && Math.abs(only.t - filter.t) < 14)), JSON.stringify({ only, filter }));
    await I.shot(`p35-tasks-${mode}`);
    // ---- Calendar ----
    await I.click(I.byLabel('Show the Calendar'), 900);
    const cal = await rect('Calendar go to today');
    check(`${mode}: in the Calendar the Today button keeps its place beside the toggle`, !!cal && cal.t < 70 && cal.l > 150, JSON.stringify(cal));
    const wk = await rect('Week view');
    const mo = await rect('Month view');
    const only2 = await rect('Show only today');
    check(`${mode}: Only today is next to Day / Week / Month (right of Month, same row), with a tooltip`, !!mo && !!only2 && only2.l >= mo.r && Math.abs(only2.t - mo.t) < 14 && /only today/i.test(only2.title || ''), JSON.stringify({ wk, mo, only2 }));
  }

  await layout('light');

  // ---- Today works: the board ----
  await I.click(I.byLabel('Show Tasks'), 800);
  await C.sleep(400);
  const dis0 = (await rect('Show today in Tasks')).disabled;
  check('board: Today is off while today is at the left edge', dis0 === 'true', String(dis0));
  await I.click(I.byLabel('Later days'), 500);
  await I.click(I.byLabel('Later days'), 500);
  const dis1 = (await rect('Show today in Tasks')).disabled;
  check('board: paged away, Today is on', dis1 !== 'true', String(dis1));
  await I.click(I.byLabel('Show today in Tasks'), 700);
  const first = await I.js(`(() => { const cols = [...document.querySelectorAll('[data-day-col]')].filter((e) => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().right > 300); cols.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left); return cols[0] ? cols[0].getAttribute('data-day-col') : null; })()`);
  check('board: clicking Today in the top row brings today back to the left', first === TODAY, String(first));

  // ---- Calendar: Week, Day, Month ----
  await I.click(I.byLabel('Show the Calendar'), 900);
  const tags = (view) => I.js(`[...document.querySelectorAll('[data-today-tag]')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => ({ day: e.getAttribute('data-today-tag'), text: e.innerText.trim(), bg: getComputedStyle(e).backgroundColor, color: getComputedStyle(e).color, h: Math.round(e.getBoundingClientRect().height) }))`);
  async function views(mode) {
    for (const v of ['Week', 'Day', 'Month']) {
      await I.click(I.byLabel(`${v} view`), 900);
      const t = await tags(v);
      check(`${mode}: ${v}: exactly one Today tag, on today (${TODAY})`, t.length === 1 && t[0].day === TODAY && t[0].text === 'Today', JSON.stringify(t));
      const page = await I.js('getComputedStyle(document.body).backgroundColor');
      check(`${mode}: ${v}: the tag text is 4.5:1 or more on its pill`, t.length === 1 && ratio(t[0].color, t[0].bg.startsWith('rgba') ? page : t[0].bg) >= 4.5, JSON.stringify(t));
      if (v === 'Month') {
        const cell = await I.js(`(() => { const c = document.querySelector('[data-cal-day="${TODAY}"]'); const o = [...document.querySelectorAll('[data-cal-day]')].find((e) => e.getAttribute('data-cal-day') !== '${TODAY}' && e.getBoundingClientRect().width > 0); const n = c.querySelector('div[dir="auto"]'); const cs = getComputedStyle(c); const ocs = getComputedStyle(o); const ns = getComputedStyle(n); return { border: cs.borderTopWidth, otherBorder: ocs.borderTopWidth, borderColor: cs.borderTopColor, numBg: ns.backgroundColor, numColor: ns.color, round: ns.borderTopLeftRadius }; })()`);
        check(`${mode}: Month: today's cell has a 2px accent frame (others a hairline), the number in a filled circle`, cell.border === '2px' && parseFloat(cell.otherBorder) <= 1 && parseFloat(cell.round) >= 10 && ratio(cell.numColor, cell.numBg) >= 4, JSON.stringify(cell));
      } else {
        const head = await I.js(`(() => { const h = document.querySelector('[data-cal-head="${TODAY}"]'); const cs = getComputedStyle(h); return { bg: cs.backgroundColor, border: cs.borderBottomWidth }; })()`);
        check(`${mode}: ${v}: today's header has the accent underline and a soft fill`, head.border === '2px' && head.bg !== 'rgba(0, 0, 0, 0)', JSON.stringify(head));
      }
      await I.shot(`p35-${v.toLowerCase()}-${mode}`);
    }
  }
  await views('light');

  // ---- Calendar Today and Only today work ----
  await I.click(I.byLabel('Week view'), 900);
  await I.click(I.byLabel('Calendar next week'), 700);
  const d1 = (await rect('Calendar go to today')).disabled;
  check('Calendar: paged to next week, Today is on', d1 !== 'true', String(d1));
  await I.click(I.byLabel('Calendar go to today'), 800);
  const headToday = await I.js(`!!document.querySelector('[data-cal-head="${TODAY}"]') && [...document.querySelectorAll('[data-today-tag]')].filter((e) => e.getBoundingClientRect().width > 0).length === 1`);
  check('Calendar: Today in the top row brings this week back (the Today tag is on screen)', headToday === true);
  const d2 = (await rect('Calendar go to today')).disabled;
  check('Calendar: and it is off again', d2 === 'true', String(d2));
  await I.click(I.byLabel('Show only today'), 800);
  const heads = await I.js(`[...document.querySelectorAll('[data-cal-head]')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.getAttribute('data-cal-head'))`);
  check('Calendar: Only today shows just today\'s column', JSON.stringify(heads) === JSON.stringify([TODAY]), JSON.stringify(heads));
  check('Calendar: it reads as pressed', (await rect('Show only today')).pressed === 'true');
  await I.shot('p35-only-today-light');
  await I.click(I.byLabel('Show only today'), 800);
  const heads2 = await I.js(`[...document.querySelectorAll('[data-cal-head]')].filter((e) => e.getBoundingClientRect().width > 0).length`);
  check('Calendar: pressing it again shows the week again', heads2 >= 5, String(heads2));

  // ---- Dark ----
  const icon = (await I.exists(I.byLabel('Profile and account'))) ? 'Profile and account' : 'Profile, not signed in';
  await I.click(I.byLabel(icon));
  await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 700);
  await I.waitBody('POWER FEATURES', 8000);
  await I.click(`document.querySelector('[data-theme-setting] [data-theme-mode="dark"]')`, 900);
  await I.click(I.byLabel('Back'), 900);
  await I.click(I.byLabel('Show Tasks'), 800).catch(() => {});
  await C.sleep(500);
  await layout('dark');
  await views('dark');

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
