'use strict';
// Real check for 3.9.0 to 3.11.0: a task during a break, follow up. Real mouse input into the real app on
// an isolated data folder; Supabase is the in process fake (signed out, nothing leaves the machine).
//  3.9.0: the chip's menu (right click or its small ⋯ button): "Move out of break" (right after the
//         break, same day, same length) and "Remove time" (Anytime that day), each with a 5 second Undo;
//         a task with several times moves only the time inside the break; a repeating day asks This day
//         only / All days and its Undo puts it back; a chip dragged out is a normal move.
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
  const TODAY = day(0);
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, dueDate: TODAY, ...extra });
  const at = (id, title, start, len, extra = {}) => T(id, title, { startTime: start, durationMinutes: len, ...extra });
  const seed = [
    at('tea', 'Tea break', '09:00', 20, { cutsBelow: true }),
    // A daily walk that started a week ago: today's is projected, inside the tea break.
    at('walk', 'Short walk', '09:05', 10, { dueDate: day(-7), recurrence: 'daily', completed: true, completedAt: stamp }),
    at('lunch', 'Lunch', '12:00', 90, { cutsBelow: true }),
    at('pod', 'Listen to a podcast', '12:10', 30, { projectKey: 'work' }),
    at('call', 'Call the bank', '12:15', 20),
    at('pill', 'Take a pill', '08:00', 10, { extraTimes: ['12:40'] }),
  ];
  fs.writeFileSync(path.join(dataDir, 'belific_tasks.kv'), JSON.stringify(seed));
  fs.writeFileSync(path.join(dataDir, 'belific_projects.kv'), JSON.stringify([{ key: 'work', name: 'Work', colorKey: 'sky', createdAt: stamp, updatedAt: stamp }]));
  fs.writeFileSync(path.join(dataDir, 'belific_desktop_panes.kv'), JSON.stringify({ leftCollapsed: false, rightCollapsed: false, center: 'kanban', calendar: 'day' }));

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
  await I.waitBody('Lunch', 20000);
  await I.click(`document.querySelector('[aria-label="Show Tasks"]')`, 600);
  await C.sleep(1200);

  const V = (sel) => `[...document.querySelectorAll('${sel}')].find((e) => e.getBoundingClientRect().width > 0)`;
  const tb = (id) => `[data-block-id="${id}"]`;
  const chip = (blockId) => V(`[data-host-chip="${blockId}"]`);
  const scrollTo = (expr) => I.js(`(() => { const b = ${expr}; if (b) b.scrollIntoView({ block: 'center' }); return !!b; })()`);
  const undoText = () => I.js(`(document.querySelector('[data-undo-bar]') || {}).innerText || ''`);
  const rightClick = async (expr) => {
    await scrollTo(expr);
    await C.sleep(300);
    const r = await I.js(`(() => { const e = ${expr}; const b = e.getBoundingClientRect(); return { x: Math.round(b.left + 20), y: Math.round(b.top + b.height / 2) }; })()`);
    win.webContents.sendInputEvent({ type: 'mouseMove', x: r.x, y: r.y });
    await C.sleep(80);
    win.webContents.sendInputEvent({ type: 'mouseDown', x: r.x, y: r.y, button: 'right', clickCount: 1 });
    win.webContents.sendInputEvent({ type: 'mouseUp', x: r.x, y: r.y, button: 'right', clickCount: 1 });
    await C.sleep(500);
  };
  const menuOf = (blockId) => `document.querySelector('[data-host-chip-menu="${blockId}"]')`;

  // ======== Right click: the menu ========
  await scrollTo(V(tb('lunch')));
  await C.sleep(300);
  check('Lunch hosts the podcast, the call and the pill\'s 12:40', (await I.js(`(${V(tb('lunch'))} || {}).getAttribute?.('data-host-count')`)) === '3');
  await rightClick(chip('task:pod'));
  const menu = await I.textOf(menuOf('task:pod'));
  check('a right click on a chip opens its menu: Open, Move out of break, Remove time', menu.includes('Move out of break') && menu.includes('Remove time') && menu.includes('Open'), menu);
  await I.shot('p28-01-chip-menu-light');
  await I.click(`${menuOf('task:pod')}.querySelector('[aria-label="Move out of break"]')`, 900);
  const pod = byId('pod');
  check('Move out of break: right after the break, the same day and length', pod.startTime === '13:30' && pod.dueDate === TODAY && pod.durationMinutes === 30, JSON.stringify(pod));
  check('it is a block of its own again', await I.exists(V(tb('pod'))));
  const u1 = await undoText();
  check('an Undo message says what happened', /Moved Listen to a podcast out of Lunch/.test(u1) && /Undo/.test(u1), u1);
  await I.shot('p28-02-moved-out-undo');
  await C.sleep(5600);
  check('the Undo message goes after 5 seconds', !(await undoText()));

  // ======== The small button: Remove time, then Undo ========
  await scrollTo(chip('task:call'));
  await I.click(V('[data-host-menu="task:call"]'), 500);
  check('the small ⋯ button opens the same menu', (await I.textOf(menuOf('task:call'))).includes('Remove time'));
  await I.click(`${menuOf('task:call')}.querySelector('[aria-label="Remove time"]')`, 900);
  const call = byId('call');
  check('Remove time: Anytime on the same day', !call.startTime && call.dueDate === TODAY && call.durationMinutes === 20, JSON.stringify(call));
  check('its Undo message', /Call the bank has no time now/.test(await undoText()));
  await I.click(`document.querySelector('[data-undo-bar] [aria-label="Undo"]')`, 1000);
  check('Undo puts the time back, and it is in the break again', byId('call').startTime === '12:15' && (await I.exists(chip('task:call'))), JSON.stringify(byId('call')));

  // ======== Several times: only the one inside the break ========
  await scrollTo(chip('task:pill@12:40'));
  await I.click(V('[data-host-menu="task:pill@12:40"]'), 500);
  await I.click(`${menuOf('task:pill@12:40')}.querySelector('[aria-label="Move out of break"]')`, 900);
  const pill = byId('pill');
  check('a task with several times moves only its time inside the break', pill.startTime === '08:00' && JSON.stringify(pill.extraTimes) === '["13:30"]', JSON.stringify(pill));
  await I.click(`document.querySelector('[data-undo-bar] [aria-label="Undo"]')`, 1000);
  check('and Undo puts that time back', JSON.stringify(byId('pill').extraTimes) === '["12:40"]', JSON.stringify(byId('pill')));

  // ======== A repeating day ========
  const walkId = `walk:${TODAY}`;
  await scrollTo(V(tb('tea')));
  await C.sleep(300);
  check('today\'s projected walk is a chip in the tea break', await I.exists(chip(`task:${walkId}`)));
  await I.click(V(`[data-host-menu="task:${walkId}"]`), 500);
  await I.click(`${menuOf(`task:${walkId}`)}.querySelector('[aria-label="Move out of break"]')`, 900);
  const asked = await I.textOf(`document.querySelector('[data-scope-prompt]')`);
  check('a day of a repeating task asks This day only / All days', asked.includes('This day only') && asked.includes('All days'), asked);
  await I.click(`document.querySelector('[data-scope-prompt] [data-scope-choice="day"]')`, 1000);
  check('This day only: today\'s walk is stored at 09:20, the series keeps 09:05', byId(walkId)?.startTime === '09:20' && byId('walk').startTime === '09:05', JSON.stringify([byId(walkId), byId('walk')]));
  await C.waitFor(() => I.exists(`document.querySelector('[data-undo-bar]')`), 3000).catch(() => {});
  await I.click(`document.querySelector('[data-undo-bar] [aria-label="Undo"]')`, 1000);
  check('Undo puts today\'s walk back in the break', byId(walkId)?.startTime === '09:05' && byId('walk').startTime === '09:05' && (await I.exists(chip(`task:${walkId}`))), JSON.stringify(byId(walkId)));

  // ======== Drag a chip out ========
  await scrollTo(chip('task:call'));
  await C.sleep(300);
  const a = await I.js(`(() => { const r = ${chip('task:call')}.getBoundingClientRect(); return { x: Math.round(r.left + 30), y: Math.round(r.top + r.height / 2) }; })()`);
  win.webContents.sendInputEvent({ type: 'mouseMove', x: a.x, y: a.y });
  await C.sleep(80);
  win.webContents.sendInputEvent({ type: 'mouseDown', x: a.x, y: a.y, button: 'left', clickCount: 1 });
  // Two hours down (56 px an hour), clear of the break.
  for (let i = 1; i <= 12; i++) {
    win.webContents.sendInputEvent({ type: 'mouseMove', x: a.x, y: a.y + Math.round((168 * i) / 12), modifiers: ['leftButtonDown'] });
    await C.sleep(30);
  }
  await C.sleep(300);
  const lifted = await I.textOf(`document.querySelector('[data-lifted-card]')`);
  check('a chip lifts like a block', lifted.includes('Call the bank'), lifted);
  win.webContents.sendInputEvent({ type: 'mouseUp', x: a.x, y: a.y + 168, button: 'left', clickCount: 1 });
  await C.sleep(900);
  const moved = byId('call');
  check('dropped outside the break it is a normal move: a block of its own, same length', moved.startTime >= '14:00' && moved.durationMinutes === 20 && (await I.exists(V(tb('call')))) && !(await I.exists(chip('task:call'))), JSON.stringify(moved));
  await I.shot('p28-03-dragged-out');

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
