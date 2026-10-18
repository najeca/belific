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
      T('mr', 'Morning Routine', { dueDate: day(-1), recurrence: 'daily', completed: true, completedAt: stamp, subtasks: [{ id: 'm1', title: 'Stretch', done: true }, { id: 'm2', title: 'Water', done: true }, { id: 'm3', title: 'Journal', done: true }] }),
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
  check('the estimate figure uses Roboto Mono', /Roboto Mono/.test(await fontOf(`document.querySelector('[data-day-col="${today}"] [aria-label="Task Today task"] [data-card-time]')`)));
  const cardStyle = await I.js(`(() => { const c = document.querySelector('[data-day-col="${today}"] [aria-label="Task Today task"]'); const s = getComputedStyle(c); return { r: s.borderTopLeftRadius, shadow: s.boxShadow !== 'none', border: s.borderTopWidth, pt: s.paddingTop, pl: s.paddingLeft }; })()`);
  check('cards: 12 px corners, a light shadow, no hairline, padding 11 x 12', cardStyle.r === '12px' && cardStyle.shadow && cardStyle.border === '0px' && cardStyle.pt === '11px' && cardStyle.pl === '12px', JSON.stringify(cardStyle));
  check('a task with one of two steps done shows a part filled ring', (await ring()) === 'part');
  await I.js(`document.querySelector('[data-day-col="${today}"] [aria-label="Task Steps task"]').focus()`);
  await I.key('s');
  await C.waitFor(() => I.exists(`document.querySelector('[aria-label="Tick Second"]')`), 4000).catch(() => {});
  await I.click(`document.querySelector('[aria-label="Tick Second"]')`, 500);
  await C.waitFor(() => (byId('st').subtasks || []).every((x) => x.done), 6000).catch(() => {});
  check('ticking the last step ticks it, and (as before) completes the task', (byId('st').subtasks || []).every((x) => x.done) && byId('st').completed === true);
  // 2.27.0: S opens the details modal (the step was ticked there); close it.
  await I.key('Escape');
  await C.sleep(300);
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

  // ======== Step 5: the labels menu, 20 colours, emoji ========
  const projects = () => read('belific_projects') || [];
  const labelNamed = (n) => projects().find((p) => p.name === n && !p.deletedAt);
  const openLabelMenu = async () => {
    await I.js(`document.querySelector('[data-day-col="${today}"] [aria-label="Task Today task"]').focus()`);
    await C.sleep(150);
    await I.key('L', ['control']);
    await C.waitFor(() => I.exists(I.byLabel('New label')), 4000).catch(() => {});
  };
  await openLabelMenu();
  check('the label menu offers New label and Edit labels, keeping Suggested', (await I.exists(I.byLabel('New label'))) && (await I.exists(I.byLabel('Edit labels'))) && (await I.js(`/suggested/i.test(document.body.innerText)`)));
  await I.click(I.byLabel('New label'), 300);
  // 2.27.0: the 20 colours are the original eight and twelve vibrant ones, plus the colour wheel.
  check('New label opens a form with a name, an emoji, the 20 colours and the colour wheel', (await I.exists(`document.querySelector('[data-new-label-form]')`)) && (await I.js(`document.querySelectorAll('[data-new-label-form] [data-swatch]:not([data-swatch="wheel"])').length`)) === 20 && (await I.exists(`document.querySelector('[data-new-label-form] [data-swatch="wheel"]')`)));
  check('the 12 new colours and the wheel are locked until every computer runs 2.27', (await I.js(`document.querySelectorAll('[data-new-label-form] [data-swatch][aria-disabled="true"]').length`)) === 13 && (await I.js(`document.body.innerText.includes('an older Belific changes them back')`)));
  await I.click(I.byLabel('Teal colour for the new label'), 200);
  check('a locked colour cannot be picked', !(await I.js(`document.querySelector('[data-swatch="aqua"]').getAttribute('aria-selected') === 'true'`)));
  await I.click(I.byLabel('Every computer runs Belific 2.27 or later'), 300);
  check('ticking "Every computer runs Belific 2.27 or later" unlocks them (and it is kept on this computer)', (await I.js(`document.querySelectorAll('[data-new-label-form] [data-swatch][aria-disabled="true"]').length`)) === 0);
  await I.click(I.byLabel('Teal colour for the new label'), 200);
  await I.click(I.byLabel('New label name'), 100);
  await I.type('Garden');
  await I.click(I.byLabel('New label emoji'), 100);
  await I.type('🌱');
  await I.shot('p9-05-new-label');
  await I.click(I.byLabel('Create the new label'), 500);
  await C.waitFor(() => !!labelNamed('Garden'), 6000).catch(() => {});
  const g = labelNamed('Garden');
  check('Create saves the label with its emoji and the new colour', !!g && g.colorKey === 'aqua' && g.emoji === '🌱', JSON.stringify(g));
  await C.waitFor(() => byId('t1').projectKey === (g && g.key), 4000).catch(() => {});
  check('and puts it on the task', !!g && byId('t1').projectKey === g.key, JSON.stringify(byId('t1')));
  await C.sleep(400);
  const tint = await I.js(`(() => { const c = document.querySelector('[data-day-col="${today}"] [aria-label="Task Today task"]'); return c ? getComputedStyle(c).backgroundColor : ''; })()`);
  check('the card takes the teal tint', tint === 'rgb(210, 246, 241)', tint);
  const tealEdge = await I.js(`(() => { const c = document.querySelector('[data-day-col="${today}"] [aria-label="Task Today task"]'); return c ? getComputedStyle(c).borderLeftColor : ''; })()`);
  check('and the strong teal as its left edge', tealEdge === 'rgb(15, 158, 142)', tealEdge);
  check('the unlock is stored locally only', readKv(dataDir)('belific_desktop_label_colors_227_ok') === 1 || readKv(dataDir)('belific_desktop_label_colors_227_ok') === '1');
  await openLabelMenu();
  check('Remove label is offered for a task with a label', await I.exists(I.byLabel('Remove label')));
  await I.click(I.byLabel('Edit labels'), 500);
  check('Edit labels opens the Labels page', await I.js(`document.body.innerText.includes('Garden') && !!document.querySelector('[aria-label="Colour of Garden"]')`));
  await I.shot('p9-05-labels-page');
  await I.key('Escape');
  await C.sleep(300);

  // ======== Step 7: the task details modal ========
  await I.js(`document.querySelector('[data-day-col="${today}"] [aria-label="Task Mover"]').focus()`);
  await C.sleep(150);
  await I.key('o');
  await C.waitFor(() => I.exists(I.byLabel('Task details')), 6000).catch(() => {});
  const modal = await I.js(`(() => { const m = document.querySelector('[data-detail-panel]'); if (!m) return null; const r = m.getBoundingClientRect(); const t = m.querySelector('[aria-label="Title"]'); return { w: Math.round(r.width), cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2), vw: innerWidth, vh: innerHeight, font: t ? getComputedStyle(t).fontSize : '', rows: [...m.querySelectorAll('[data-detail-row]')].map((e) => e.dataset.detailRow), role: m.getAttribute('role') }; })()`);
  check('O opens the details as a centred modal about 600 px wide', !!modal && modal.w === 600 && Math.abs(modal.cx - modal.vw / 2) <= 2 && Math.abs(modal.cy - modal.vh / 2) <= 40 && modal.role === 'dialog', JSON.stringify(modal));
  check('its title is 23 px', !!modal && modal.font === '23px', modal && modal.font);
  check('rows in order: Task date, Estimated time, Actual time, Label, Repeats (then List), then Notes and Subtasks', !!modal && modal.rows.slice(0, 5).join('|') === 'Task date|Estimated time|Actual time|Label|Repeats' && (await I.js(`(() => { const m = document.querySelector('[data-detail-panel]'); const t = m.innerText; return t.indexOf('Repeats') < t.indexOf('Notes') && t.indexOf('Notes') < t.indexOf('Subtasks'); })()`)), JSON.stringify(modal && modal.rows));
  check('no duplicate or delete buttons on the modal itself', !(await I.exists(`document.querySelector('[data-detail-panel] [aria-label="Duplicate task"]')`)) && !(await I.exists(`document.querySelector('[data-detail-panel] [aria-label="Delete task"]')`)));
  await I.click(I.byLabel('More task actions'), 300);
  const menu = await I.js(`[...document.querySelectorAll('[aria-label="More task actions"][role="dialog"], [aria-label="More task actions"][role="menu"]')].length > 0 || !!document.querySelector('[aria-label="Task emoji"]')`);
  check('the ⋮ menu holds Emoji, Duplicate and Delete', menu && (await I.exists(I.byLabel('Duplicate task'))) && (await I.exists(I.byLabel('Delete task'))) && (await I.exists(I.byLabel('Task emoji'))));
  await I.shot('p9-07-menu');
  await I.click(I.byLabel('Task emoji'), 100);
  await I.type('🚚');
  await C.waitFor(() => byId('t2').emoji === '🚚', 4000).catch(() => {});
  check('the emoji set from the menu is saved and shown before the title', byId('t2').emoji === '🚚' && (await I.js(`document.querySelector('[data-detail-panel]').innerText.includes('🚚')`)));
  await I.key('Escape');
  await C.sleep(200);
  await I.click(I.byLabel('Title'), 100);
  await I.js('document.activeElement.select()');
  await I.type('Mover renamed');
  await I.key('Enter');
  await C.waitFor(() => byId('t2').title === 'Mover renamed', 4000).catch(() => {});
  check('the title saves on Enter', byId('t2').title === 'Mover renamed');
  await I.shot('p9-07-details');
  // The scrim's middle is under the modal: press its top left corner.
  win.webContents.sendInputEvent({ type: 'mouseDown', x: 24, y: 400, button: 'left', clickCount: 1 });
  win.webContents.sendInputEvent({ type: 'mouseUp', x: 24, y: 400, button: 'left', clickCount: 1 });
  await C.sleep(400);
  check('a press outside closes it', !(await I.exists(I.byLabel('Task details'))));

  // ======== Step 9: priority is gone from the interface ========
  await I.js(`document.querySelector('[data-day-col="${today}"] [aria-label="Task Today task"]').focus()`);
  await C.sleep(200);
  check('no priority control on a focused card (its controls are showing)', !(await I.exists(`document.querySelector('[aria-label^="Priority"]')`)));
  await I.key('o');
  await C.waitFor(() => I.exists(I.byLabel('Task details')), 6000).catch(() => {});
  check('no Priority row in the details', !(await I.js(`document.querySelector('[data-detail-panel]').innerText.includes('Priority')`)));
  await I.key('Escape');
  await C.sleep(300);

  // ======== Step 10: the Quests page shows and ticks steps ========
  await I.click(I.byLabel('Quests'), 600);
  await I.waitBody('Morning Routine', 8000);
  const count = () => I.js(`(() => { const e = document.querySelector('[data-quest="mr"] [data-quest-steps]'); return e ? e.dataset.questSteps : null; })()`);
  check('a quest with steps shows how many are done for today ("Morning Routine 0/3")', (await count()) === '0/3' && (await I.js(`document.querySelector('[data-quest="mr"]').innerText.includes('0/3')`)), String(await count()));
  check('its steps are hidden until it is expanded', !(await I.exists(`document.querySelector('[data-quest-step-list="mr"]')`)));
  await I.click(I.byLabel('Show the steps of Morning Routine'), 300);
  check('Show the steps lists them, for today', (await I.js(`(document.querySelector('[data-quest-step-list="mr"]') || {}).innerText || ''`)).includes('Stretch') && (await I.js(`document.querySelector('[data-quest-step-list="mr"]').innerText.includes('Today')`)));
  await I.shot('p9-10-quest-open');
  await I.click(I.byLabel('Stretch (Morning Routine)'), 500);
  const occ = () => tasks().find((t) => t.id === `mr:${today}`);
  await C.waitFor(() => !!occ() && (occ().subtasks || []).some((x) => x.done), 6000).catch(() => {});
  check('ticking a step stores today\'s occurrence with that step done (the template is untouched)', !!occ() && (occ().subtasks || []).filter((x) => x.done).length === 1 && occ().subtasks.find((x) => x.done).title === 'Stretch' && (byId('mr').subtasks || []).every((x) => x.done), JSON.stringify({ occ: occ(), tpl: byId('mr').subtasks }));
  await C.waitFor(async () => (await count()) === '1/3', 4000).catch(() => {});
  check('the count reads 1/3 and the list stays open', (await count()) === '1/3' && (await I.exists(`document.querySelector('[data-quest-step-list="mr"]')`)), String(await count()));
  await I.click(I.byLabel('Stretch (Morning Routine)'), 500);
  await C.waitFor(() => !!occ() && (occ().subtasks || []).every((x) => !x.done), 4000).catch(() => {});
  check('a second tap unticks it', !!occ() && (occ().subtasks || []).every((x) => !x.done));
  await I.click(I.byLabel('Back'), 400);

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
