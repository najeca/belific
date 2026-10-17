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
      T('cb', 'Cal block', { dueDate: today, startTime: '10:00', durationMinutes: 30 }),
      T('sd', 'All steps done', { dueDate: today, subtasks: [{ id: 'd1', title: 'One', done: true }, { id: 'd2', title: 'Two', done: true }] }),
      T('st', 'Steps task', { dueDate: today, subtasks: [{ id: 's1', title: 'First', done: true }, { id: 's2', title: 'Second', done: false }] }),
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
    const a = await I.js(`(() => { const e = ${fromExpr}; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + 80), y: Math.round(r.top + 18) }; })()`);
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
  check('the day total shows in the box (0:00 / 1:00 for today)', (await colText(today)).includes('0:00 / 1:00'));
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

  // ======== Step 3: the card, Inter, the steps ring ========
  const fontOf = (expr) => I.js(`(() => { const e = ${expr}; return e ? getComputedStyle(e).fontFamily : ''; })()`);
  const ring = () => I.js(`(() => { const c = document.querySelector('[data-day-col="${today}"] [aria-label="Task Steps task"]'); const r = c && c.querySelector('[data-card-meta] [data-steps-ring]'); return r ? r.dataset.stepsRing : null; })()`);
  const faces = await I.js(`[...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, '') + ' ' + f.weight)`);
  check('Inter is loaded from the app and draws the card titles (as the "Segoe UI" face of the text stack)', faces.some((f) => /^Segoe UI 600/.test(f)) && /Segoe UI/.test(await fontOf(`document.querySelector('[aria-label="Title Today task"]')`)), JSON.stringify(faces));
  check('the estimate figure uses Roboto Mono', /Roboto Mono/.test(await fontOf(`document.querySelector('[aria-label^="Duration of Today task"] [data-mono]')`)));
  const cardStyle = await I.js(`(() => { const c = document.querySelector('[data-day-col="${today}"] [aria-label="Task Today task"]'); const s = getComputedStyle(c); return { r: s.borderTopLeftRadius, shadow: s.boxShadow !== 'none', border: s.borderTopWidth, pt: s.paddingTop, pl: s.paddingLeft }; })()`);
  check('cards: 12 px corners, a light shadow, no hairline, padding 11 x 12', cardStyle.r === '12px' && cardStyle.shadow && cardStyle.border === '0px' && cardStyle.pt === '11px' && cardStyle.pl === '12px', JSON.stringify(cardStyle));
  check('a task with one of two steps done shows a part filled ring', (await ring()) === 'part');
  await I.js(`document.querySelector('[data-day-col="${today}"] [aria-label="Task Steps task"]').focus()`);
  await I.key('s');
  await C.waitFor(() => I.exists(`document.querySelector('[aria-label="Tick Second"]')`), 4000).catch(() => {});
  await I.click(`document.querySelector('[aria-label="Tick Second"]')`, 500);
  await C.waitFor(() => (byId('st').subtasks || []).every((x) => x.done), 6000).catch(() => {});
  check('ticking the last step ticks it, and (as before) completes the task', (byId('st').subtasks || []).every((x) => x.done) && byId('st').completed === true);
  const doneRing = await I.js(`(() => { const r = document.querySelector('[data-day-col="${today}"] [aria-label="Task All steps done"] [data-card-meta] [data-steps-ring]'); return r ? r.dataset.stepsRing : null; })()`);
  check('every step done: the ring is solid with a tick', doneRing === 'done');
  const ringBg = await I.js(`(() => { const r = document.querySelector('[data-day-col="${today}"] [aria-label="Task All steps done"] [data-card-meta] [data-steps-ring]'); return r ? getComputedStyle(r).backgroundColor : ''; })()`);
  check('the full ring is the sage accent (#5C7A6B)', ringBg === 'rgb(92, 122, 107)', ringBg);
  await I.shot('p9-03-cards');

  // ======== Step 4: the Calendar does what the Timebox does ========
  await I.click(I.byLabel('Show the Calendar'));
  await C.sleep(400);
  await I.blur();
  await I.key('w');
  await C.sleep(800);
  const calBlock = (key, id) => `document.querySelector('[data-cal-block="cal${key}:${id}"]')`;
  const yAt = (hhmm) => I.js(`(() => { const g = document.querySelector('[data-calendar-grid]').getBoundingClientRect(); const [h, m] = '${hhmm}'.split(':').map(Number); return Math.round(g.top + (h + m / 60) * 56); })()`);
  const colX = (key) => I.js(`(() => { const c = document.querySelector('[data-cal-col="${key}"]'); if (!c) return null; const r = c.getBoundingClientRect(); return Math.round(r.left + r.width / 2); })()`);
  const scrollGridTo = (hhmm) => I.js(`(() => { const s = document.querySelector('[data-cal-scroller]'); const [h] = '${hhmm}'.split(':').map(Number); s.scrollTop = Math.max(0, h * 56 - 120); return s.scrollTop; })()`);
  const headLeft = (key) => I.js(`(() => { const sc = document.querySelector('[data-cal-scroller]').getBoundingClientRect(); const h = document.querySelector('[data-cal-head="${key}"]'); return h ? Math.round(h.getBoundingClientRect().left - sc.left) : null; })()`);
  const pointerDrag = async (from, to, { hold = 250, release = true } = {}) => {
    win.webContents.sendInputEvent({ type: 'mouseMove', x: from.x, y: from.y });
    await C.sleep(80);
    win.webContents.sendInputEvent({ type: 'mouseDown', x: from.x, y: from.y, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 14; i++) {
      win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(from.x + ((to.x - from.x) * i) / 14), y: Math.round(from.y + ((to.y - from.y) * i) / 14), modifiers: ['leftButtonDown'] });
      await C.sleep(25);
    }
    await C.sleep(hold);
    if (release) {
      win.webContents.sendInputEvent({ type: 'mouseUp', x: to.x, y: to.y, button: 'left', clickCount: 1 });
      await C.sleep(600);
    }
  };
  const h0 = await headLeft(today);
  check('the week view opens with today as its first column (a rolling week)', h0 !== null && h0 <= 52, String(h0));

  // Move a block to tomorrow at 14:00.
  await scrollGridTo('10:00');
  await C.sleep(300);
  const blk = await I.js(`(() => { const r = ${calBlock(today, 'cb')}.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 8) }; })()`);
  const to = { x: await colX(day(1)), y: (await yAt('14:00')) + 8 };
  await pointerDrag(blk, to, { release: false, hold: 400 });
  check('while dragging over the Calendar, its column shows the dashed slot with the time', (await I.js(`(document.querySelector('[data-cal-col="${day(1)}"] [data-slot-preview]') || {}).innerText || ''`)).includes('14:00'));
  await I.shot('p9-04-cal-drag');
  win.webContents.sendInputEvent({ type: 'mouseUp', x: to.x, y: to.y, button: 'left', clickCount: 1 });
  await C.waitFor(() => byId('cb').dueDate === day(1) && byId('cb').startTime === '14:00', 6000).catch(() => {});
  check('dropping moves the task to tomorrow at 14:00 (30 minute steps, like the Timebox)', byId('cb').dueDate === day(1) && byId('cb').startTime === '14:00', JSON.stringify(byId('cb')));

  // Resize its bottom edge by an hour.
  await C.sleep(400);
  const edge = await I.js(`(() => { const b = ${calBlock(day(1), 'cb')}; const h = b && b.parentElement.querySelector('[aria-label="Resize Cal block"]'); if (!h) return null; const r = h.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  if (edge) await pointerDrag(edge, { x: edge.x, y: edge.y + 56 }, { hold: 200 });
  await C.waitFor(() => byId('cb').durationMinutes === 90, 6000).catch(() => {});
  check('dragging the bottom edge changes the estimate (30 -> 90 minutes)', byId('cb').durationMinutes === 90, JSON.stringify({ edge, task: byId('cb') }));

  // Drop a task from the list onto today at 16:00.
  await scrollGridTo('14:00');
  await C.sleep(300);
  const row = await I.js(`(() => { const r = document.querySelector('[data-pane="left"] [aria-label="Task Brain one"]').getBoundingClientRect(); return { x: Math.round(r.left + 80), y: Math.round(r.top + 18) }; })()`);
  await pointerDrag(row, { x: await colX(today), y: (await yAt('16:00')) + 4 }, { hold: 300 });
  await C.waitFor(() => byId('bd').startTime === '16:00', 6000).catch(() => {});
  check('a task from the list dropped on the Calendar gets that day and time', byId('bd').dueDate === today && byId('bd').startTime === '16:00' && byId('bd').durationMinutes === 120, JSON.stringify(byId('bd')));

  // Keyboard: the arrows move a focused block.
  const focusBlock = async () => {
    await I.js(`(() => { const k = ${JSON.stringify('')}; const e = document.querySelector('[data-calendar] [data-block-task="cb"]'); if (e) e.focus(); return !!e; })()`);
    await C.sleep(150);
  };
  await focusBlock();
  await I.key('Down');
  await C.waitFor(() => byId('cb').startTime === '14:30', 4000).catch(() => {});
  check('Down on a focused block: 30 minutes later', byId('cb').startTime === '14:30', JSON.stringify(byId('cb')));
  await C.sleep(400);
  await focusBlock();
  await I.key('Right');
  await C.waitFor(() => byId('cb').dueDate === day(2), 4000).catch(() => {});
  check('Right: the day after', byId('cb').dueDate === day(2), JSON.stringify(byId('cb')));
  await C.sleep(400);
  await focusBlock();
  await I.key('Down', ['shift']);
  await C.waitFor(() => byId('cb').durationMinutes === 120, 4000).catch(() => {});
  check('Shift+Down: 30 minutes longer', byId('cb').durationMinutes === 120, JSON.stringify(byId('cb')));
  for (let i = 0; i < 4; i++) {
    await focusBlock();
    await I.key('Left');
    await C.sleep(400);
  }
  check('Left goes back day by day but never onto a past day', byId('cb').dueDate === today, byId('cb').dueDate);

  // A block dropped on the all day row loses its time.
  await scrollGridTo('14:00');
  await C.sleep(300);
  const k = byId('cb').dueDate;
  const b2 = await I.js(`(() => { const e = ${calBlock(k, 'cb')}; if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 8) }; })()`);
  const cell = await I.js(`(() => { const r = document.querySelector('[data-all-day-cell="${k}"]').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  if (b2) await pointerDrag(b2, cell, { hold: 300 });
  await C.waitFor(() => !byId('cb').startTime, 4000).catch(() => {});
  check('a block dropped on the all day row keeps its day and loses its time', !byId('cb').startTime && byId('cb').dueDate === k, JSON.stringify({ b2, task: byId('cb') }));

  // Today on the Calendar's rolling week.
  await I.click(I.byLabel('Calendar next week'));
  await C.sleep(500);
  const h7 = await headLeft(day(7));
  check('Next moves the rolling week on by seven days', h7 !== null && h7 <= 52, String(h7));
  await I.click(I.byLabel('Calendar go to today'));
  await C.sleep(500);
  const hT = await headLeft(today);
  check('Today jumps the Calendar back to today', hT !== null && hT <= 52, String(hT));
  await I.shot('p9-04-calendar');
  await I.click(I.byLabel('Show Tasks'));
  await C.sleep(300);

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
