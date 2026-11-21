'use strict';
// @real-input: quiet
// Real check for 3.67.0 (PLAN_desktop_parity D3): the desktop Today view, a third centre view with the Timebox beside it.
//   - the Now card (what runs now, time left, Next, the label pill), the hours strip per label (Sleep off until switched
//     on in Settings, Daily hours), the timeline (bubble height by length, the Now marker in the running bubble), Anytime
//     cards reordered by a mouse drag and by Alt+Down, stored in the same user_settings row the phone uses
//     (today.order.<day>) and kept after a reload, a tick with Undo, Done today, no red mark, and the Tasks board's today
//     column left in its own order. Mouse and keys go through sendInputEvent (no real pointer), so it runs quiet.
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
  const day = dayKeyFrom(new Date())(0);
  const stamp = '2026-11-01T07:00:00.000Z';
  const pad = (n) => String(n).padStart(2, '0');
  const hm = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const n = new Date();
  const nowMin = n.getHours() * 60 + n.getMinutes();
  // Too close to midnight for a task running now and one after it: those checks are skipped, the rest run.
  const timed = nowMin >= 40 && nowMin <= 22 * 60;
  const startNow = Math.max(0, nowMin - 30);
  const startNext = Math.min(23 * 60 + 30, nowMin + 60);
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, dueDate: day, ...extra });
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const write = (k, v) => fs.writeFileSync(path.join(dataDir, `${k}.kv`), JSON.stringify(v));
  write('belific_tasks', [
    ...(timed ? [T('gym', 'Gym', { startTime: hm(startNow), durationMinutes: 60, projectKey: 'health' }), T('call', 'Call Mum', { startTime: hm(startNext), durationMinutes: 15 })] : []),
    T('a1', 'Alpha card', { createdAt: '2026-11-01T07:00:01.000Z' }),
    T('a2', 'Bravo card', { createdAt: '2026-11-01T07:00:02.000Z' }),
    T('a3', 'Charlie card', { createdAt: '2026-11-01T07:00:03.000Z' }),
    T('nap', 'Nap', { durationMinutes: 60, projectKey: 'sleep', createdAt: '2026-11-01T07:00:04.000Z' }),
    T('fin', 'Finished', { completed: true }),
  ]);
  write('belific_projects', [
    { key: 'health', name: 'Health', colorKey: 'sage', createdAt: stamp, updatedAt: stamp },
    { key: 'sleep', name: 'Sleep', colorKey: 'sky', createdAt: stamp, updatedAt: stamp },
  ]);
  const read = readKv(dataDir);
  const task = (id) => (read('belific_tasks') || []).find((t) => t.id === id);
  const orderRow = () => ((read('belific_user_settings') || []).find((r) => r.key === `today.order.${day}` && !r.deletedAt) || {}).value;

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1700, 1000);
  win.show();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await C.sleep(2500);
  await I.waitBody('Alpha card', 20000);
  const q = (sel) => `document.querySelector(${JSON.stringify(sel)})`;
  const attr = (sel, a) => I.js(`(${q(sel)} || { getAttribute: () => null }).getAttribute(${JSON.stringify(a)})`);
  const cards = () => I.js(`[...document.querySelectorAll('[data-today-pane] [data-anytime-card]')].map((e) => e.getAttribute('data-anytime-title'))`);

  // ---- the view ----
  check('the centre has a Today view beside Tasks and Calendar', await I.exists(q('[data-center-view="today"]')));
  await I.click(q('[data-center-view="today"]'), 1500);
  check('Today opens in the centre', await I.exists(q('[data-today-pane]')));
  const right = await I.js(`(() => { const r = (${q('[data-pane="right"]')} || { getBoundingClientRect: () => ({ width: 0 }) }).getBoundingClientRect(); return Math.round(r.width); })()`);
  check('the Timebox stays on the right', right > 200, String(right));
  check('the jump to today button is not shown on Today (it is always today)', !(await I.exists(q('[data-ctl="today"]'))));
  await I.shot('p70-today');

  // ---- Now card ----
  if (timed) {
    check('the Now card shows what runs now', (await attr('[data-now-card]', 'data-now-card')) === 'now' && (await attr('[data-now-title]', 'data-now-title')) === 'Gym', String(await attr('[data-now-card]', 'data-now-card')));
    check('with the time left', /min left|h left/.test(String(await attr('[data-now-left]', 'data-now-left'))), String(await attr('[data-now-left]', 'data-now-left')));
    check('and Next with its start', /^Next: Call Mum at .+, in /.test(String(await attr('[data-now-next]', 'data-now-next'))), String(await attr('[data-now-next]', 'data-now-next')));
    check('the pill names the label', (await attr('[data-now-pill]', 'data-now-pill')) === 'Health', String(await attr('[data-now-pill]', 'data-now-pill')));
    const bubbles = await I.js(`[...document.querySelectorAll('[data-today-pane] [data-bubble]')].map((e) => Number(e.getAttribute('data-bubble')))`);
    check('bubble height shows the length (60 min 60, 15 min at least 44)', JSON.stringify(bubbles) === '[60,44]', JSON.stringify(bubbles));
    check('the Now marker is inside the running bubble', await I.exists(q('[data-today-pane] [data-now-marker="inside"]')));
  } else {
    console.log('NOTE: near midnight, the Now card checks with a running task were skipped');
  }

  // ---- hours strip ----
  const total = Number(await attr('[data-hours-strip]', 'data-hours-strip'));
  check('the hours strip leaves Sleep out by default', total === (timed ? 75 : 0), String(total));

  // ---- Anytime order ----
  const before = await cards();
  check('Anytime shows each untimed task of today as its own card', JSON.stringify(before) === JSON.stringify(['Alpha card', 'Bravo card', 'Charlie card', 'Nap']), JSON.stringify(before));
  const rect = (sel) => I.js(`(() => { const r = ${q(sel)}.getBoundingClientRect(); return { x: Math.round(r.left + 40), y: Math.round(r.top + r.height / 2), h: Math.round(r.height) }; })()`);
  const a = await rect('[data-anytime-card="a1"]');
  const b = await rect('[data-anytime-card="a2"]');
  win.webContents.sendInputEvent({ type: 'mouseMove', x: a.x, y: a.y });
  await C.sleep(150);
  win.webContents.sendInputEvent({ type: 'mouseDown', x: a.x, y: a.y, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 8; i++) {
    win.webContents.sendInputEvent({ type: 'mouseMove', x: a.x, y: Math.round(a.y + ((b.y - a.y + b.h / 2 + 6) * i) / 8), button: 'left', modifiers: ['leftButtonDown'] });
    await C.sleep(40);
  }
  win.webContents.sendInputEvent({ type: 'mouseUp', x: a.x, y: Math.round(b.y + b.h / 2 + 6), button: 'left', clickCount: 1 });
  await C.sleep(900);
  const afterDrag = await cards();
  check('a mouse drag moves Alpha below Bravo', JSON.stringify(afterDrag.slice(0, 2)) === JSON.stringify(['Bravo card', 'Alpha card']), JSON.stringify(afterDrag));
  check('the drag did not open the details', !(await I.exists(q('[data-detail-panel]'))));
  check('the order is stored in the phone\'s row (user_settings today.order.<day>)', JSON.stringify(JSON.parse(orderRow() || '[]').slice(0, 2)) === '["a2","a1"]', String(orderRow()));
  await I.js(`${q('[data-anytime-card="a3"]')}.focus()`);
  await I.key('Down', ['alt'], 700);
  const afterKey = await cards();
  check('Alt+Down moves the focused card one place down', afterKey.indexOf('Charlie card') === 3 && afterKey.indexOf('Nap') === 2, JSON.stringify(afterKey));
  win.webContents.reload();
  await C.sleep(3000);
  await I.waitBody('Alpha card', 20000);
  if (!(await I.exists(q('[data-today-pane]')))) await I.click(q('[data-center-view="today"]'), 1500);
  check('the order is kept after a reload', JSON.stringify(await cards()) === JSON.stringify(afterKey), JSON.stringify(await cards()));

  // ---- tick, Undo, Done today ----
  await I.click(q('[data-today-pane] [data-today-tick="a2"]'), 1200);
  check('a tick marks it done', task('a2') && task('a2').completed === true);
  check('the Undo bar says so', /Done: Bravo card/.test(await I.body()));
  check('Done today lists the ticked untimed tasks', Number(await attr('[data-done-today]', 'data-done-today')) === 2, String(await attr('[data-done-today]', 'data-done-today')));

  // ---- no red, and the board is not reordered ----
  const red = await I.js(`[...document.querySelectorAll('[data-today-pane] *')].some((e) => /rgb\\(229, 72, 77\\)/.test(getComputedStyle(e).color + getComputedStyle(e).backgroundColor) || (e.childNodes.length === 1 && e.textContent === '❗'))`);
  check('nothing red and no priority mark on Today', !red);
  await I.click(q('[data-center-view="kanban"]'), 1500);
  const col = await I.js(`[...document.querySelectorAll('[data-day-col="${day}"] [data-task-card]')].map((e) => e.innerText.split('\\n')[0])`);
  check('the Tasks board today column keeps its own order', col.indexOf('Alpha card') < col.indexOf('Charlie card') || col.length === 0, JSON.stringify(col));

  // ---- Settings, Daily hours ----
  await I.click(I.byLabel('Profile, not signed in'), 900);
  await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 1500);
  check('Settings has Daily hours with a switch per label', await I.exists(q('[data-daily-hours="2"]')));
  await I.click(I.byLabel('Count Sleep in daily hours'), 900);
  check('switching Sleep on stores the phone\'s row', ((read('belific_user_settings') || []).find((r) => r.key === 'hours.count.sleep') || {}).value === 'on');
  await I.key('Escape', [], 900);
  await I.click(I.byLabel('Back to home'), 1200).catch(() => {});
  if (!(await I.exists(q('[data-center-view="today"]')))) await I.key('Escape', [], 900);
  await I.click(q('[data-center-view="today"]'), 1500);
  const total2 = Number(await attr('[data-hours-strip]', 'data-hours-strip'));
  check('then the strip counts Sleep', total2 === (timed ? 135 : 60), String(total2));

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
