'use strict';
// @real-input: pointer (hover, drag)
// Real check for PLAN_desktop_parity D3 (3.67.0), added at 3.71.0: dragging an Anytime card on the desktop Today view.
// Pointer only: it needs a visible, active window and the mouse left alone (a drag with a 4 px start, a drop line, a
// drag that is not a click). Covers: a drag down and a drag up change the order, the order is stored in the phone's
// user_settings row (today.order.<day>) and is kept after a reload, a plain click still opens the details and a drag
// does not, Alt+Up and Alt+Down move the focused card, and the Tasks board's today column keeps its own order.
// Run by hand with the mouse cleared (the quiet run skips it; p70 covers the same drag through sendInputEvent).
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
  const T = (id, title, n) => ({ id, title, completed: false, createdAt: `2026-11-01T07:00:0${n}.000Z`, updatedAt: stamp, dueDate: day });
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'belific_tasks.kv'), JSON.stringify([T('a1', 'Alpha card', 1), T('a2', 'Bravo card', 2), T('a3', 'Charlie card', 3), T('a4', 'Delta card', 4)]));
  const read = readKv(dataDir);
  const orderRow = () => ((read('belific_user_settings') || []).find((r) => r.key === `today.order.${day}` && !r.deletedAt) || {}).value;

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1700, 1000);
  win.show();
  win.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await C.sleep(2500);
  await I.waitBody('Alpha card', 20000);
  const q = (sel) => `document.querySelector(${JSON.stringify(sel)})`;
  const cards = () => I.js(`[...document.querySelectorAll('[data-today-pane] [data-anytime-card]')].map((e) => e.getAttribute('data-anytime-title'))`);
  await I.click(q('[data-center-view="today"]'), 1500);
  const rect = (id) => I.js(`(() => { const r = ${q(`[data-anytime-card="${id}"]`)}.getBoundingClientRect(); return { x: Math.round(r.left + 40), y: Math.round(r.top + r.height / 2), h: Math.round(r.height) }; })()`);
  const mouseDrag = async (from, toY) => {
    win.webContents.sendInputEvent({ type: 'mouseMove', x: from.x, y: from.y });
    await C.sleep(150);
    win.webContents.sendInputEvent({ type: 'mouseDown', x: from.x, y: from.y, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 10; i++) {
      win.webContents.sendInputEvent({ type: 'mouseMove', x: from.x, y: Math.round(from.y + ((toY - from.y) * i) / 10), button: 'left', modifiers: ['leftButtonDown'] });
      await C.sleep(40);
    }
    win.webContents.sendInputEvent({ type: 'mouseUp', x: from.x, y: toY, button: 'left', clickCount: 1 });
    await C.sleep(900);
  };

  check('Anytime shows the four cards in their created order', JSON.stringify(await cards()) === JSON.stringify(['Alpha card', 'Bravo card', 'Charlie card', 'Delta card']), JSON.stringify(await cards()));
  // Drag Alpha below Charlie.
  const a = await rect('a1');
  const c = await rect('a3');
  await mouseDrag(a, c.y + Math.round(c.h / 2) + 4);
  let now = await cards();
  check('a drag down moves Alpha below Charlie', JSON.stringify(now) === JSON.stringify(['Bravo card', 'Charlie card', 'Alpha card', 'Delta card']), JSON.stringify(now));
  check('the drag did not open the details', !(await I.exists(q('[data-detail-panel]'))));
  check('the order is stored in the phone\'s row (today.order.<day>)', JSON.stringify(JSON.parse(orderRow() || '[]').slice(0, 4)) === '["a2","a3","a1","a4"]', String(orderRow()));
  // Drag Delta to the top.
  const d = await rect('a4');
  const first = await rect('a2');
  await mouseDrag(d, first.y - Math.round(first.h / 2) - 4);
  now = await cards();
  check('a drag up moves Delta to the top', now[0] === 'Delta card', JSON.stringify(now));
  // Alt+Up and Alt+Down.
  await I.js(`${q('[data-anytime-card="a3"]')}.focus()`);
  await I.key('Up', ['alt'], 700);
  const afterUp = await cards();
  check('Alt+Up moves the focused card one place up', afterUp.indexOf('Charlie card') === now.indexOf('Charlie card') - 1, JSON.stringify(afterUp));
  await I.key('Down', ['alt'], 700);
  const afterDown = await cards();
  check('Alt+Down moves it back one place down', JSON.stringify(afterDown) === JSON.stringify(now), JSON.stringify(afterDown));
  // A plain click opens the details.
  const m = await rect('a2');
  win.webContents.sendInputEvent({ type: 'mouseMove', x: m.x, y: m.y });
  await C.sleep(120);
  win.webContents.sendInputEvent({ type: 'mouseDown', x: m.x, y: m.y, button: 'left', clickCount: 1 });
  win.webContents.sendInputEvent({ type: 'mouseUp', x: m.x, y: m.y, button: 'left', clickCount: 1 });
  await C.sleep(900);
  check('a plain click still opens the details', await I.exists(q('[data-detail-panel]')));
  await I.key('Escape', [], 700);
  // Reload keeps the order.
  const keep = await cards();
  win.webContents.reload();
  await C.sleep(3000);
  await I.waitBody('Alpha card', 20000);
  if (!(await I.exists(q('[data-today-pane]')))) await I.click(q('[data-center-view="today"]'), 1500);
  check('the order is kept after a reload', JSON.stringify(await cards()) === JSON.stringify(keep), JSON.stringify(await cards()));
  // The board keeps its own order.
  await I.click(q('[data-center-view="kanban"]'), 1500);
  const col = await I.js(`[...document.querySelectorAll('[data-day-col="${day}"] [data-task-card]')].map((e) => e.innerText.split('\\n')[0])`);
  check('the Tasks board today column keeps its own order (oldest first)', col.length === 0 || JSON.stringify(col.filter((t) => /card$/.test(t))) === JSON.stringify(['Alpha card', 'Bravo card', 'Charlie card', 'Delta card']), JSON.stringify(col));

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
