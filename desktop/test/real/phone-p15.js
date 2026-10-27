'use strict';
// Real touch check for the lists batch (3.12.0 to 3.14.1) on the phone, 390 x 844.
//  3.14.0: one emoji per list: taken emojis greyed out (tap says which list), a typed one refused, the shared
//          emoji of two existing lists kept with a note in the edit sheet.
//  3.13.0: the emoji picker of a list's sheet: the chosen emoji large, Frequently used, a tab with an icon per
//          category (44 pt), 44 pt cells, no search box (marker gate), the emoji keyboard field; light and dark.
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
  write('belific_lists', [L('LG', 'Games', 0, { emoji: '🎮' }), L('LP', 'Plain', 1), L('LR', 'Old name', 2, { emoji: '📚' }), L('LA', 'Twin A', 3, { emoji: '🍎' }), L('LB', 'Twin B', 4, { emoji: '🍎' })]);
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
  await P.js(`document.querySelector('[data-list-chip="new"]').scrollIntoView({ inline: 'center', block: 'nearest' })`);
  await C.sleep(400);
  await P.finger.tap(chip('new'), 900);
  let st = await createState();
  check('the New list sheet has Create list next to the name, 44 pt tall', !!st && st.h >= 44, JSON.stringify(st));
  check('empty name: off, "Type a name to create the list"', !!st && st.disabled && (await sheetText()).includes('Type a name to create the list'), await sheetText());
  await P.finger.tap(visible('[data-list-sheet] input[aria-label="List name"]'), 300);
  await typeText('plain');
  st = await createState();
  check('a duplicate name (any case): off, "Another list has that name"', !!st && st.disabled && (await sheetText()).includes('Another list has that name'), await sheetText());
  await P.finger.tap(visible('[aria-label="Create list"]'), 600);
  check('tapping the off button creates nothing', lists().length === 5);
  await P.js(`(() => { const i = document.querySelector('[data-list-sheet] input[aria-label="List name"]'); i.focus(); i.select(); })()`);
  await typeText('Reading');
  st = await createState();
  check('a free name: on', !!st && !st.disabled && !(await sheetText()).includes('Type a name'), JSON.stringify(st));
  await shot('phone-p15-create-list');
  await P.finger.tap(visible('[aria-label="Create list"]'), 900);
  const reading = lists().find((l) => l.name === 'Reading');
  check('Create list makes the list and shows it', !!reading && (await P.js(`!!document.querySelector('[data-list-chip="${reading && reading.key}"]')`)));

  // ======== 3.13.0: the emoji picker ========
  const strip = (e) => String(e || '').replace(/️/g, '');
  const box = (sel) => P.js(`(() => { const e = ${visible(sel)}; if (!e) return null; const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })()`);
  const large = () => P.js(`(document.querySelector('[data-emoji-large]') || {}).textContent || ''`);
  const pickerChecks = async (mode) => {
    check(mode + ': the picker is in the sheet with its large panel', await P.js(`!!document.querySelector('[data-list-sheet] [data-emoji-pick] [data-emoji-large]')`));
    const tabs = await P.js(`[...document.querySelectorAll('[data-emoji-tab]')].map((e) => { const r = e.getBoundingClientRect(); return { k: e.getAttribute('data-emoji-tab'), l: e.getAttribute('aria-label'), h: Math.round(r.height), w: Math.round(r.width) }; })`);
    check(mode + ': eight tabs with their names, each at least 44 pt tall and wide', JSON.stringify(tabs.map((t) => t.l)) === JSON.stringify(['Smileys', 'People', 'Animals', 'Food', 'Activities', 'Travel', 'Objects', 'Symbols']) && tabs.every((t) => t.h >= 44 && t.w >= 40), JSON.stringify(tabs));
    const cellBox = await box('[data-emoji-cell]');
    check(mode + ': a cell is 44 pt', !!cellBox && cellBox.w >= 44 && cellBox.h >= 44, JSON.stringify(cellBox));
    check(mode + ': no search box on the phone (the emoji keyboard has its own)', !(await P.js(`!!document.querySelector('[data-list-sheet] input[type="search"], [data-list-sheet] [aria-label^="Search emoji"]')`)));
  };
  await P.js(`document.querySelector('[data-list-chip="dump"]').scrollIntoView({ inline: 'center', block: 'nearest' })`);
  await C.sleep(400);
  await P.js(`document.querySelector('[data-list-chip="LG"]').scrollIntoView({ inline: 'center', block: 'nearest' })`);
  await C.sleep(400);
  await P.finger.hold(chip('LG'), 480, 900);
  check('holding a list opens its sheet with the large emoji', strip(await large()) === '🎮', await large());
  await pickerChecks('light');
  check('Frequently used says so when empty', (await sheetText()).toLowerCase().includes('emoji you choose often will show here'));
  await P.finger.tap(visible('[data-emoji-tab="animals"]'), 500);
  await P.finger.tap(visible('[data-emoji-cell="🐶"]'), 600);
  check('a tap on a cell chooses it, shown large', strip(await large()) === '🐶' && (await P.js(`(document.querySelector('[data-list-sheet] input[aria-label="List emoji"]') || {}).value`)).includes('🐶'), await large());
  check('Frequently used has it', strip(await P.js(`[...document.querySelectorAll('[data-emoji-frequent-cell]')].map((e) => e.getAttribute('data-emoji-frequent-cell')).join('')`)) === '🐶');
  await shot('phone-p15-picker-light');
  await P.finger.tap(visible('[aria-label="Clear list emoji"]'), 500);
  check('Clear empties it', (await large()) === '');
  await P.finger.tap(visible('[data-emoji-frequent-cell="🐶"]'), 500);
  await P.finger.tap(visible('[aria-label="Save list Games"]'), 900);
  check('Save writes the dog to Games', strip(lists().find((l) => l.key === 'LG').emoji) === '🐶', JSON.stringify(lists().find((l) => l.key === 'LG')));
  // Dark.
  await P.finger.tap(tab('Today'), 900);
  await P.finger.tap(visible('[data-profile-avatar]'), 1200);
  await P.finger.tap(visible('[data-phone-theme] [data-seg="dark"]'), 900);
  if (await P.js(`!!(${visible('[aria-label="Back"]')})`)) await P.finger.tap(visible('[aria-label="Back"]'), 900);
  await P.finger.tap(tab('Tasks'), 1000);
  await P.js(`document.querySelector('[data-list-chip="LP"]').scrollIntoView({ inline: 'center', block: 'nearest' })`);
  await C.sleep(400);
  await P.finger.hold(chip('LP'), 480, 900);
  await pickerChecks('dark');
  const pv = await P.js(`(() => { const e = document.querySelector('[data-emoji-large]'); return getComputedStyle(e.parentElement).backgroundColor; })()`);
  check('dark: the panel uses its own token', pv === 'rgb(34, 42, 37)', pv);
  await shot('phone-p15-picker-dark');

  // ======== 3.14.0: one emoji per list (dark is on) ========
  const caption = () => P.js(`(document.querySelector('[data-emoji-caption]') || {}).textContent || ''`);
  const reveal = async (key) => {
    await P.js(`document.querySelector('[data-list-chip="${key}"]').scrollIntoView({ inline: 'center', block: 'nearest' })`);
    await C.sleep(400);
  };
  await P.finger.tap(visible('[aria-label="Cancel list edit"]'), 600).catch(() => {});
  await reveal('new');
  await P.finger.tap(chip('new'), 900);
  check('the New list sheet says greyed out emoji belong to another list', (await caption()) === 'Greyed out emoji belong to another list.', await caption());
  await P.finger.tap(visible('[data-emoji-tab="animals"]'), 500);
  const taken = await P.js(`(() => { const b = document.querySelector('[data-emoji-cell="🐶"]'); return b ? { owner: b.getAttribute('data-emoji-taken'), o: getComputedStyle(b).opacity, d: b.getAttribute('aria-disabled') } : null; })()`);
  check('the dog (Games has it) is greyed out and names the list', !!taken && taken.owner === 'Games' && Number(taken.o) < 0.5, JSON.stringify(taken));
  await P.finger.tap(visible('[data-emoji-cell="🐶"]'), 600);
  check('a tap says which list has it and chooses nothing', (await caption()).includes('is already used by Games') && (await large()) === '', (await caption()) + '|' + (await large()));
  await shot('phone-p15-taken-dark');
  await P.finger.tap(visible('[data-list-sheet] input[aria-label="List emoji"]'), 300);
  await typeText('📚');
  check('a typed taken emoji is refused with the name of the list', (await caption()).includes('already used by Old name') && (await P.js(`(document.querySelector('[data-list-sheet] input[aria-label="List emoji"]') || {}).value`)) === '', await caption());
  await P.finger.tap(visible('[data-emoji-tab="smileys"]'), 400);
  await P.finger.tap(visible('[data-list-sheet] input[aria-label="List name"]'), 300);
  await typeText('Space');
  await P.finger.tap(visible('[data-emoji-tab="travel"]'), 400);
  await P.finger.tap(visible('[data-emoji-cell="🚀"]'), 500);
  await P.finger.tap(visible('[aria-label="Create list"]'), 900);
  check('a free emoji is chosen and the list is made with it', strip((lists().find((l) => l.name === 'Space') || {}).emoji) === '🚀', JSON.stringify(lists().find((l) => l.name === 'Space')));
  // Existing duplicates: kept, with a note.
  await reveal('LB');
  await P.finger.hold(chip('LB'), 480, 900);
  const note = await P.js(`(document.querySelector('[data-shared-emoji="LB"]') || {}).textContent || ''`);
  check('the edit sheet of a list sharing its emoji says so', note === '🍎 is also used by Twin A. It stays as it is; choose another emoji if you like.', note);
  const own = await P.js(`(() => { const b = document.querySelector('[data-list-sheet] [data-emoji-frequent-cell="🍎"], [data-list-sheet] [data-emoji-cell="🍎"]'); return b ? b.hasAttribute('data-emoji-taken') : null; })()`);
  check('its own emoji is not greyed out', own === false || own === null, String(own));
  await P.js(`(() => { const i = document.querySelector('[data-list-sheet] input[aria-label="List name"]'); i.focus(); i.select(); })()`);
  await typeText('Twin Bee');
  await P.finger.tap(visible('[aria-label="Save list Twin B"]'), 900);
  check('it can still be renamed and keeps the shared emoji', (lists().find((l) => l.key === 'LB') || {}).name === 'Twin Bee' && strip(lists().find((l) => l.key === 'LB').emoji) === '🍎', JSON.stringify(lists().find((l) => l.key === 'LB')));

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
