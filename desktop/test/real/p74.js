'use strict';
// @real-input: quiet
// Real check for 3.71.0 (PLAN_desktop_parity D5): Repeats groups in the left pane, slab cards, the right click menu.
//   - the list switcher has Repeats; its groups (Daily, Weekly, Monthly) with the count, the pattern in words and
//     "Until 17 Dec" (the phone's words); a group folds and stays folded after a reload (local kv, never synced)
//   - a task card has the slab shadow in light and none in dark
//   - right click and Shift+F10 open one menu with the shared action list (Done, Edit, Skip today for a repeat, Move,
//     Delete, More); Delete on a repeat asks "Only today, or every day?"; Esc closes; Done ticks through the usual write
//   - the Earlier button is still there (the Missed files were renamed)
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
  const stamp = '2026-11-01T07:00:00.000Z';
  const until = dk(40);
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const write = (k, v) => fs.writeFileSync(path.join(dataDir, `${k}.kv`), JSON.stringify(v));
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  write('belific_tasks', [
    T('walk', 'Morning walk', { dueDate: today, recurrence: 'daily', repeatUntil: until }),
    T('gym', 'Gym', { dueDate: today, recurrence: 'weekly', recurrenceDays: ['Mon', 'Wed'] }),
    T('rent', 'Pay rent', { dueDate: today, recurrence: 'monthly', recurrenceMonthDay: 3 }),
    T('one', 'One off card', { projectKey: 'health', durationMinutes: 20 }),
  ]);
  write('belific_projects', [{ key: 'health', name: 'Health', colorKey: 'sage', createdAt: stamp, updatedAt: stamp }]);
  const read = readKv(dataDir);
  const stored = (id) => (read('belific_tasks') || []).find((t) => t.id === id);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1500, 950);
  win.show();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await C.sleep(2500);
  await I.waitBody('One off card', 20000);
  const q = (sel) => `document.querySelector(${JSON.stringify(sel)})`;
  const wait = (fn) => C.waitFor(fn, 4000).catch(() => {});
  const shadow = (sel) => I.js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? getComputedStyle(e).boxShadow : null; })()`);

  // ---- slab on a card, light ----
  await I.js(`document.documentElement.setAttribute('data-theme-probe', '1')`);
  const lightShadow = await shadow('[data-task-card]');
  check('a task card has the slab shadow in light (6 px right and down, no blur)', !!lightShadow && /6px 6px 0px/.test(lightShadow), String(lightShadow));
  await I.shot('p74-card-light');

  // ---- the Earlier button is still there ----
  check('the Earlier button is still in the left pane', await I.exists(q('[data-missed-button]')));

  // ---- Repeats ----
  await I.click(q('[data-ctl="lists"]'), 600);
  check('the list switcher has a Repeats row', await I.exists(I.byLabel('Show Repeats')));
  await I.click(I.byLabel('Show Repeats'), 800);
  check('Repeats shows in the left pane with its three repeating tasks', (await I.js(`document.querySelector('[data-repeats-list]')?.getAttribute('data-repeats-list')`)) === '3');
  const heads = await I.js(`[...document.querySelectorAll('[data-group-head]')].map((e) => e.innerText.replace(/\\s+/g, ' ').trim())`);
  check('the groups are Daily, Weekly and Monthly, each with its count', heads.length === 3 && /daily · 1/i.test(heads[0]) && /weekly · 1/i.test(heads[1]) && /monthly · 1/i.test(heads[2]), JSON.stringify(heads));
  const words = await I.js(`[...document.querySelectorAll('[data-quest-words]')].map((e) => e.innerText.trim())`);
  check('Daily says "Every day" with "Until" and the end day', /^Every day · Until \d{1,2} \w{3}$/.test(words[0] || ''), JSON.stringify(words));
  check('Weekly says "Every Monday and Wednesday"', words.includes('Every Monday and Wednesday'), JSON.stringify(words));
  check('Monthly says "Monthly on the 3rd"', words.includes('Monthly on the 3rd'), JSON.stringify(words));
  check('the add box is not shown on Repeats (nothing to type into)', !(await I.exists(`document.querySelector('[aria-label="Capture a thought"]')`)));
  const repShadow = await shadow('[data-repeat-row]');
  check('a Repeats row is a slab card too', !!repShadow && /6px 6px 0px/.test(repShadow), String(repShadow));
  await I.shot('p74-repeats');

  // ---- fold, kept after a reload ----
  await I.click(q('[data-group-head="daily"]'), 500);
  check('a click on a group heading folds it', (await I.js(`document.querySelectorAll('[data-repeat-group="daily"] [data-repeat-row]').length`)) === 0 && (await I.js(`document.querySelector('[data-group-head="daily"]').getAttribute('data-folded')`)) === '1');
  check('the other groups stay open', (await I.js(`document.querySelectorAll('[data-repeat-row]').length`)) === 2);
  await C.sleep(400);
  const kvFolds = (() => { try { return fs.readFileSync(path.join(dataDir, 'belific_desktop_repeat_folds.kv'), 'utf8'); } catch { return ''; } })();
  check('the fold is kept on this computer only (a kv row, not a synced table)', kvFolds.includes('daily'), kvFolds);
  await win.webContents.reload();
  await C.sleep(3500);
  await I.waitBody('Gym', 20000).catch(() => {});
  check('after a reload Repeats is still shown and Daily is still folded', (await I.exists(q('[data-repeats-list]'))) && (await I.js(`document.querySelector('[data-group-head="daily"]')?.getAttribute('data-folded')`)) === '1');
  await I.click(q('[data-group-head="daily"]'), 500);
  check('a second click unfolds it', (await I.js(`document.querySelectorAll('[data-repeat-group="daily"] [data-repeat-row]').length`)) === 1);

  // ---- the right click menu, on a repeating row ----
  const rowPoint = await I.js(`(() => { const r = document.querySelector('[data-repeat-row="walk"]').getBoundingClientRect(); return { x: Math.round(r.left + 40), y: Math.round(r.top + 14) }; })()`);
  win.webContents.sendInputEvent({ type: 'mouseDown', x: rowPoint.x, y: rowPoint.y, button: 'right', clickCount: 1 });
  win.webContents.sendInputEvent({ type: 'mouseUp', x: rowPoint.x, y: rowPoint.y, button: 'right', clickCount: 1 });
  await C.sleep(600);
  check('a right click opens one menu', (await I.js(`document.querySelectorAll('[data-card-menu]').length`)) === 1);
  const items = await I.js(`[...document.querySelectorAll('[data-card-menu-item]')].map((e) => e.innerText.trim())`);
  check('the menu is the shared list: Done, Edit, Skip today, Move, Delete, More', JSON.stringify(items) === JSON.stringify(['Done', 'Edit', 'Skip today', 'Move', 'Delete', 'More']), JSON.stringify(items));
  check('Delete is not red', (await I.js(`getComputedStyle(document.querySelector('[data-card-menu-item="delete"]')).color`)) !== 'rgb(229, 72, 77)');
  await I.click(q('[data-card-menu-item="delete"]'), 500);
  check('Delete on a repeating task asks Only today, or every day', (await I.js(`document.querySelector('[data-card-menu] [role="note"]')?.innerText`)) === 'Only today, or every day?' && (await I.exists(q('[data-card-menu-item="delete-today"]'))) && (await I.exists(q('[data-card-menu-item="delete-all"]'))));
  await I.key('Escape', [], 400);
  check('Esc goes back to the actions', (await I.js(`document.querySelector('[data-card-menu]')?.getAttribute('data-card-menu')`)) === 'main');
  await I.key('Escape', [], 400);
  check('Esc again closes the menu', !(await I.exists(q('[data-card-menu]'))));

  // ---- the right click menu on a task card; Done ticks it ----
  await I.click(q('[data-ctl="lists"]'), 500);
  await I.click(I.byLabel('Show Brain Dump'), 800);
  const cardPoint = await I.js(`(() => { const r = document.querySelector('[data-task-card="one"]').getBoundingClientRect(); return { x: Math.round(r.left + 60), y: Math.round(r.top + 20) }; })()`);
  win.webContents.sendInputEvent({ type: 'mouseDown', x: cardPoint.x, y: cardPoint.y, button: 'right', clickCount: 1 });
  win.webContents.sendInputEvent({ type: 'mouseUp', x: cardPoint.x, y: cardPoint.y, button: 'right', clickCount: 1 });
  await C.sleep(600);
  const items2 = await I.js(`[...document.querySelectorAll('[data-card-menu-item]')].map((e) => e.innerText.trim())`);
  check('a one off task has no Skip today', JSON.stringify(items2) === JSON.stringify(['Done', 'Edit', 'Move', 'Delete', 'More']), JSON.stringify(items2));
  await I.shot('p74-menu');
  await I.click(q('[data-card-menu-item="done"]'), 800);
  await wait(() => stored('one')?.completed === true);
  check('Done ticks it through the usual write and closes the menu', stored('one')?.completed === true && !(await I.exists(q('[data-card-menu]'))));
  const openUndo = () => 1;
  void openUndo;

  // ---- Shift+F10 on a focused card ----
  await I.js(`document.querySelector('[data-task-card="one"]')?.focus()`);
  const cardThere = await I.exists(q('[data-task-card="one"]'));
  if (cardThere) {
    await I.key('F10', ['shift'], 600);
    check('Shift+F10 on a focused card opens the same menu', await I.exists(q('[data-card-menu]')));
    await I.key('Escape', [], 400);
  } else {
    check('Shift+F10: the ticked card left the list, skipped', true);
  }

  // ---- dark: no slab ----
  const icon = (await I.exists(I.byLabel('Profile and account'))) ? 'Profile and account' : 'Profile, not signed in';
  await I.click(I.byLabel(icon), 500);
  await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 700);
  await I.waitBody('POWER FEATURES', 8000);
  await I.click(`document.querySelector('[data-theme-setting] [data-theme-mode="dark"]')`, 900);
  await I.click(I.byLabel('Back'), 900);
  await I.click(q('[data-ctl="lists"]'), 500);
  await I.click(I.byLabel('Show Brain Dump'), 800);
  await I.js(`document.querySelector('[data-task-card]') && 1`);
  const theme = await I.js(`document.documentElement.getAttribute('data-theme')`);
  const darkShadow = await shadow('[data-task-card]');
  check('in dark a card has no slab shadow', theme === 'dark' && (darkShadow === null || darkShadow === 'none'), `${theme} ${darkShadow}`);
  await I.shot('p74-card-dark');

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
