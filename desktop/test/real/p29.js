'use strict';
// Real check for 3.12.0 to 3.14.1: the lists batch. Real mouse, key and text input into the real app on an
// isolated data folder; Supabase is the in process fake (signed out, nothing leaves the machine).
//  3.12.0: the Create list button next to the name field (Enter still works; off while the name is empty or a
//          duplicate, with the reason).
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
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  const L = (key, name, sortOrder, extra = {}) => ({ key, name, sortOrder, createdAt: stamp, updatedAt: stamp, ...extra });
  const seed = [
    T('bd', 'Brain dump thing', { dueDate: TODAY, startTime: '09:00', durationMinutes: 30 }),
    T('gm', 'Play a game', { dueDate: TODAY, startTime: '10:00', durationMinutes: 30, listKey: 'LG' }),
    T('pl', 'Plain list thing', { dueDate: TODAY, startTime: '11:00', durationMinutes: 30, listKey: 'LP' }),
    T('rn', 'Renamed list thing', { dueDate: TODAY, startTime: '12:00', durationMinutes: 30, listKey: 'LR' }),
  ];
  fs.writeFileSync(path.join(dataDir, 'belific_tasks.kv'), JSON.stringify(seed));
  fs.writeFileSync(path.join(dataDir, 'belific_lists.kv'), JSON.stringify([L('LG', 'Games', 0, { emoji: '🎮' }), L('LP', 'Plain', 1), L('LR', 'Old name', 2, { emoji: '📚' })]));
  fs.writeFileSync(path.join(dataDir, 'belific_desktop_panes.kv'), JSON.stringify({ leftCollapsed: false, rightCollapsed: false, center: 'kanban', calendar: 'day' }));

  const read = readKv(dataDir);
  const lists = () => read('belific_lists') || [];

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1440, 900);
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await I.waitBody('Brain dump thing', 20000);
  await C.sleep(800);

  const pop = `document.querySelector('[data-popover]')`;
  const openLists = async () => {
    await I.click(`document.querySelector('[aria-label^="List: "][aria-label$="Change list"]')`, 500);
  };
  const createBtn = `document.querySelector('[data-popover] [aria-label="Create list"]')`;
  const btnOn = () => I.js(`${createBtn}.getAttribute('data-create-list') === 'on' || ${createBtn}.dataset.createList === 'on'`);
  const why = () => I.js(`(document.querySelector('[data-popover] [data-create-why]') || {}).innerText || ''`);

  // ======== 3.12.0: Create list ========
  await openLists();
  check('Create list sits in the New list box', await I.exists(createBtn));
  check('empty name: the button is off and says "Type a name to create the list"', !(await btnOn()) && (await why()) === 'Type a name to create the list', await why());
  await I.click(`document.querySelector('[data-popover] [aria-label="New list name"]')`, 200);
  await I.type('games');
  await C.sleep(200);
  check('a duplicate name (any case): off, "Another list has that name"', !(await btnOn()) && (await why()) === 'Another list has that name', await why());
  await I.click(createBtn, 400);
  check('a click on the off button creates nothing', lists().length === 3);
  await I.key('Return', [], 400);
  check('Enter on a duplicate creates nothing', lists().length === 3);
  await I.js(`(() => { const i = document.querySelector('[data-popover] [aria-label="New list name"]'); i.focus(); i.select(); })()`);
  await I.type('Brain Dump');
  await C.sleep(200);
  check('"Brain Dump": off, "Brain Dump is always there"', !(await btnOn()) && (await why()) === 'Brain Dump is always there', await why());
  await I.js(`(() => { const i = document.querySelector('[data-popover] [aria-label="New list name"]'); i.focus(); i.select(); })()`);
  await I.type('Reading');
  await C.sleep(200);
  check('a free name: on, no reason', (await btnOn()) && (await why()) === '', await why());
  await I.shot('p29-01-create-list');
  await I.click(createBtn, 700);
  check('Create list makes the list', lists().some((l) => l.name === 'Reading') && lists().length === 4, JSON.stringify(lists().map((l) => l.name)));
  check('and shows it (the button names it)', await I.exists(`document.querySelector('[aria-label="List: Reading. Change list"]')`));
  // Enter still works.
  await openLists();
  await I.click(`document.querySelector('[data-popover] [aria-label="New list name"]')`, 200);
  await I.type('Errands');
  await I.key('Return', [], 700);
  check('Enter still creates a list', lists().some((l) => l.name === 'Errands'), JSON.stringify(lists().map((l) => l.name)));

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
