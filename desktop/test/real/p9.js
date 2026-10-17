'use strict';
// Real check for the 2.26.0 desktop redesign: real mouse, key and text input
// into the real app, on an isolated data folder asserted NOT to be the real
// one; Supabase is the in process fake (signed out, nothing leaves the
// machine). One section per redesign step.
// BELIFIC_SHOTS: a folder for screenshots.
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

  const day = dayKeyFrom(new Date());
  const today = day(0);
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      T('t1', 'Today task', { dueDate: today, durationMinutes: 30 }),
      T('t2', 'Mover', { dueDate: today }),
      T('old', 'Unfinished from before', { dueDate: day(-2) }),
      T('done', 'Finished yesterday', { dueDate: day(-1), completed: true, completedAt: new Date().toISOString() }),
      T('far', 'Far ahead', { dueDate: day(9) }),
      T('bd', 'Brain one', { durationMinutes: 120 }),
      T('bd2', 'Brain two', { durationMinutes: 45 }),
    ]),
  );

  const read = readKv(dataDir);
  const tasks = () => read('belific_tasks') || [];
  const byId = (id) => tasks().find((t) => t.id === id);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1440, 900);
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await I.waitBody('Today task', 20000);
  await C.sleep(1000);

  const col = (key) => `document.querySelector('[data-day-col="${key}"]')`;
  const colText = (key) => I.js(`(${col(key)} || {}).innerText || ''`);
  const colLeft = (key) => I.js(`(() => { const c = ${col(key)}; return c ? Math.round(c.getBoundingClientRect().left) : null; })()`);
  const stripLeft = () => I.js(`Math.round(document.querySelector('[data-strip]').getBoundingClientRect().left)`);
  const rendered = () => I.js(`document.querySelectorAll('[data-strip] [data-day-col]').length`);
  const drag = async (fromExpr, toExpr, { hold = 300, release = true, offsetY = 0 } = {}) => {
    const a = await I.js(`(() => { const e = ${fromExpr}; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + 24), y: Math.round(r.top + 14) }; })()`);
    const b = await I.js(`(() => { const e = ${toExpr}; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 120) }; })()`);
    win.webContents.sendInputEvent({ type: 'mouseMove', x: a.x, y: a.y });
    await C.sleep(80);
    win.webContents.sendInputEvent({ type: 'mouseDown', x: a.x, y: a.y, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 12; i++) {
      win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(a.x + ((b.x - a.x) * i) / 12), y: Math.round(a.y + ((b.y + offsetY - a.y) * i) / 12), modifiers: ['leftButtonDown'] });
      await C.sleep(25);
    }
    await C.sleep(hold);
    if (release) {
      win.webContents.sendInputEvent({ type: 'mouseUp', x: b.x, y: b.y + offsetY, button: 'left', clickCount: 1 });
      await C.sleep(500);
    }
    return b;
  };

  // ======== Step 2: continuous days, Today, add a task per day, no carry over ========
  check('the strip opens with today at its left edge', Math.abs((await colLeft(today)) - (await stripLeft())) <= 2, `${await colLeft(today)} vs ${await stripLeft()}`);
  check('the next days are there without pressing anything (no week boundary)', (await I.exists(col(day(1)))) && (await I.exists(col(day(2)))) && (await I.exists(col(day(3)))));
  check('only the columns near the screen are drawn (the strip spans years)', (await rendered()) > 3 && (await rendered()) <= 16, String(await rendered()));
  check('no carry over: the unfinished task from two days ago is not in Today', !(await colText(today)).includes('Unfinished from before'));
  check('the column header reads like "Sat Oct 17" with a Today tag', /\bToday\b/.test(await colText(today)));
  check('Today is disabled while today is at the left edge', (await I.js(`(${I.byLabel('Show today in Tasks')} || {}).getAttribute('aria-disabled')`)) === 'true');
  await I.shot('p9-02-strip');

  await I.click(I.byLabel('Earlier days'));
  await C.sleep(500);
  check('Earlier days scrolls back: the day before yesterday shows its unfinished task on its own day', (await colText(day(-2))).includes('Unfinished from before'));
  check('the finished task of yesterday stays hidden while Show complete is off (the filter, unchanged)', !(await colText(day(-1))).includes('Finished yesterday') && (await I.exists(col(day(-1)))));
  check('the stored date of the old task never changed', byId('old').dueDate === day(-2));
  check('past days have no Add a task box', !(await I.exists(`document.querySelector('[aria-label="Add a task on ${day(-1)}"]')`)));
  await I.shot('p9-02-earlier');
  await I.click(I.byLabel('Show today in Tasks'));
  await C.sleep(500);
  check('Today jumps back: today at the left edge again', Math.abs((await colLeft(today)) - (await stripLeft())) <= 2);

  await I.click(I.byLabel('Later days'));
  await C.sleep(500);
  await I.click(I.byLabel('Later days'));
  await C.sleep(500);
  check('Later days goes forward a screen at a time, to the task nine days ahead', (await colText(day(9))).includes('Far ahead'), await colText(day(9)));
  await I.click(I.byLabel('Show today in Tasks'));
  await C.sleep(400);

  // Add a task on tomorrow from its own box.
  await I.click(I.byLabel(`Add a task on ${day(1)}`));
  await I.type('Typed for tomorrow');
  await I.enter();
  await C.waitFor(() => tasks().some((t) => t.title === 'Typed for tomorrow'), 6000).catch(() => {});
  const typed = tasks().find((t) => t.title === 'Typed for tomorrow');
  check('a day\'s Add a task box makes a task on that day', typed && typed.dueDate === day(1), JSON.stringify(typed));
  check('the day total shows in the box (0:00 / 0:30 for today)', (await colText(today)).includes('0:00 / 0:30'));
  check('the list\'s box shows the time still planned there (2h 45m planned)', (await I.body()).includes('2h 45m planned'));

  // Drag a card to tomorrow: a placeholder shows where it will land.
  await drag(`document.querySelector('[data-day-col="${today}"] [aria-label="Task Mover"]')`, col(day(1)), { release: false, hold: 400 });
  check('while dragging, the target day shows a dashed placeholder with the task\'s name', (await I.js(`(document.querySelector('[data-drop-placeholder="${day(1)}"]') || {}).innerText || ''`)).includes('Mover'));
  check('and the lifted card follows the pointer', await I.exists(`document.querySelector('[data-lifted-card]')`));
  await I.shot('p9-02-drag');
  const at = await I.js(`(() => { const r = ${col(day(1))}.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 120) }; })()`);
  win.webContents.sendInputEvent({ type: 'mouseUp', x: at.x, y: at.y, button: 'left', clickCount: 1 });
  await C.waitFor(() => byId('t2').dueDate === day(1), 6000).catch(() => {});
  check('dropping moves it to that day', byId('t2').dueDate === day(1));

  // The mouse wheel scrolls the strip sideways: one column back shows yesterday beside today.
  const board = await I.js(`(() => { const r = document.querySelector('[data-strip]').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 300) }; })()`);
  win.webContents.sendInputEvent({ type: 'mouseWheel', x: board.x, y: board.y, deltaX: 288, deltaY: 0, canScroll: true });
  await C.sleep(600);
  check('the mouse wheel scrolls the days sideways (yesterday comes into view)', (await colLeft(day(-1))) !== null && (await colLeft(day(-1))) >= (await stripLeft()) - 4, String(await colLeft(day(-1))));
  await drag(`document.querySelector('[data-day-col="${day(1)}"] [aria-label="Task Mover"]')`, col(day(-1)), { hold: 300 });
  check('a past day refuses the drop (the task stays where it was)', byId('t2').dueDate === day(1));
  // And dropping on another card only moves it, never merges it (2.26.0).
  await drag(`document.querySelector('[data-day-col="${day(1)}"] [aria-label="Task Mover"]')`, `document.querySelector('[data-day-col="${today}"] [aria-label="Task Today task"]')`, { hold: 900, offsetY: -100 });
  await C.waitFor(() => byId('t2').dueDate === today, 6000).catch(() => {});
  const host = byId('t1');
  check('dropping a task onto another card moves it to that day and never makes it a subtask', byId('t2').dueDate === today && !byId('t2').deletedAt && !(host.subtasks || []).some((x) => x.title === 'Mover'), JSON.stringify({ t2: byId('t2'), host: host.subtasks }));
  await I.click(I.byLabel('Show today in Tasks'));
  await C.sleep(300);

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
