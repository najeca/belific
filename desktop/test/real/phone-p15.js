'use strict';
// Real touch check for the lists batch (3.12.0 to 3.14.1) on the phone, 390 x 844.
//  3.12.0: the New list sheet has a Create list button next to the name (44 pt, off while the name is empty
//          or a duplicate, with the reason).
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
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  const L = (key, name, sortOrder, extra = {}) => ({ key, name, sortOrder, createdAt: stamp, updatedAt: stamp, ...extra });
  const write = (k, v) => fs.writeFileSync(path.join(dataDir, `${k}.kv`), JSON.stringify(v));
  write('belific_tasks', [
    T('bd', 'Brain dump thing', { dueDate: today, startTime: '09:00', durationMinutes: 30 }),
    T('gm', 'Play a game', { dueDate: today, startTime: '10:00', durationMinutes: 30, listKey: 'LG' }),
    T('pl', 'Plain list thing', { dueDate: today, startTime: '11:00', durationMinutes: 30, listKey: 'LP' }),
    T('rn', 'Renamed list thing', { dueDate: today, startTime: '12:00', durationMinutes: 30, listKey: 'LR' }),
  ]);
  write('belific_lists', [L('LG', 'Games', 0, { emoji: '🎮' }), L('LP', 'Plain', 1), L('LR', 'Old name', 2, { emoji: '📚' })]);
  const read = (k) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dataDir, `${k}.kv`), 'utf8'));
    } catch {
      return [];
    }
  };
  const lists = () => read('belific_lists');

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.show();
  await C.sleep(2500);
  const P = await phoneWindow(win);
  await C.sleep(1800);
  const shot = async (name) => {
    if (!process.env.BELIFIC_SHOTS) return;
    fs.mkdirSync(process.env.BELIFIC_SHOTS, { recursive: true });
    fs.writeFileSync(path.join(process.env.BELIFIC_SHOTS, `${name}.png`), (await win.webContents.capturePage()).toPNG());
  };
  const text = () => P.js('document.body.innerText');
  const tabEls = `[...document.querySelectorAll('a, [role="tab"], [role="button"], [role="link"]')].filter((e) => { const r = e.getBoundingClientRect(); return r.top > 760 && r.height > 20 && r.width > 40 && r.width < 200; })`;
  const tab = (name) => `${tabEls}.find((e) => e.textContent.replace(/[^ -~]/g, '').trim() === '${name}')`;
  const visible = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left >= -1 && r.left < innerWidth; })`;
  const chip = (key) => visible(`[data-list-chip="${key}"]`);
  const typeText = async (t) => {
    await win.webContents.insertText(t);
    await C.sleep(250);
  };
  const sheetText = () => P.js(`(document.querySelector('[data-list-sheet]') || {}).innerText || ''`);
  const createState = () => P.js(`(() => { const b = [...document.querySelectorAll('[aria-label="Create list"]')].find((e) => e.getBoundingClientRect().width > 0); if (!b) return null; const r = b.getBoundingClientRect(); return { disabled: b.getAttribute('aria-disabled') === 'true', w: Math.round(r.width), h: Math.round(r.height) }; })()`);

  // ======== 3.12.0: Create list ========
  await P.finger.tap(tab('Tasks'), 1200);
  await P.finger.drag(chip('dump'), -300, 0, 300, 800);
  await P.finger.tap(chip('new'), 900);
  let st = await createState();
  check('the New list sheet has Create list next to the name, 44 pt tall', !!st && st.h >= 44, JSON.stringify(st));
  check('empty name: off, "Type a name to create the list"', !!st && st.disabled && (await sheetText()).includes('Type a name to create the list'), await sheetText());
  await P.finger.tap(visible('[data-list-sheet] input[aria-label="List name"]'), 300);
  await typeText('plain');
  st = await createState();
  check('a duplicate name (any case): off, "Another list has that name"', !!st && st.disabled && (await sheetText()).includes('Another list has that name'), await sheetText());
  await P.finger.tap(visible('[aria-label="Create list"]'), 600);
  check('tapping the off button creates nothing', lists().length === 3);
  await P.js(`(() => { const i = document.querySelector('[data-list-sheet] input[aria-label="List name"]'); i.focus(); i.select(); })()`);
  await typeText('Reading');
  st = await createState();
  check('a free name: on', !!st && !st.disabled && !(await sheetText()).includes('Type a name'), JSON.stringify(st));
  await shot('phone-p15-create-list');
  await P.finger.tap(visible('[aria-label="Create list"]'), 900);
  const reading = lists().find((l) => l.name === 'Reading');
  check('Create list makes the list and shows it', !!reading && (await P.js(`!!document.querySelector('[data-list-chip="${reading && reading.key}"]')`)));

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
