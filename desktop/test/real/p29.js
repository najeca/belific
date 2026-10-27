'use strict';
// Real check for 3.12.0 to 3.14.1: the lists batch. Real mouse, key and text input into the real app on an
// isolated data folder; Supabase is the in process fake (signed out, nothing leaves the machine).
//  3.14.0: one emoji per list: taken emojis greyed out with the list that has them, nothing chosen from them,
//          Brain Dump keeps its brain, existing duplicates kept with a note in the edit box.
//  3.13.0: the emoji picker of a list: Frequently used, a tab with an icon per category, the chosen emoji large,
//          Done; light and dark.
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
  fs.writeFileSync(path.join(dataDir, 'belific_lists.kv'), JSON.stringify([L('LG', 'Games', 0, { emoji: '🎮' }), L('LP', 'Plain', 1), L('LR', 'Old name', 2, { emoji: '📚' }), L('LA', 'Twin A', 3, { emoji: '🍎' }), L('LB', 'Twin B', 4, { emoji: '🍎' })]));
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
  check('a click on the off button creates nothing', lists().length === 5);
  await I.key('Return', [], 400);
  check('Enter on a duplicate creates nothing', lists().length === 5);
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
  check('Create list makes the list', lists().some((l) => l.name === 'Reading') && lists().length === 6, JSON.stringify(lists().map((l) => l.name)));
  check('and shows it (the button names it)', await I.exists(`document.querySelector('[aria-label="List: Reading. Change list"]')`));
  // Enter still works.
  await openLists();
  await I.click(`document.querySelector('[data-popover] [aria-label="New list name"]')`, 200);
  await I.type('Errands');
  await I.key('Return', [], 700);
  check('Enter still creates a list', lists().some((l) => l.name === 'Errands'), JSON.stringify(lists().map((l) => l.name)));

  // ======== 3.13.0: the emoji picker ========
  const strip = (e) => String(e || '').replace(/️/g, '');
  const picker = `document.querySelector('[data-popover] [data-emoji-picker]')`;
  const large = () => I.js(`(${picker}.querySelector('[data-emoji-large]') || {}).textContent || ''`);
  const pickerOpen = async (label) => {
    await I.click(`document.querySelector('[data-popover] [aria-label="${label}"]')`, 500);
  };
  await I.key('Escape', [], 300);
  await openLists();
  await I.click(`document.querySelector('[data-listedit="LG"], [data-list-edit="LG"]')`, 500);
  check('the edit box opens', await I.exists(`document.querySelector('[data-popover] [data-list-edit-box="LG"]')`));
  await pickerOpen('Emoji for list Games');
  check('the picker opens in place with the emoji of the list shown large', (await I.exists(picker)) && strip(await large()) === '🎮', await large());
  const tabs = await I.js(`[...${picker}.querySelectorAll('[role="tab"]')].map((t) => t.getAttribute('aria-label') + (t.querySelector('svg, [class*="css-"]') ? '+icon' : ''))`);
  check('tabs: Smileys, People, Animals, Food, Activities, Travel, Objects, Symbols, Flags, each with an icon', JSON.stringify(tabs.map((t) => t.replace('+icon', ''))) === JSON.stringify(['Smileys', 'People', 'Animals', 'Food', 'Activities', 'Travel', 'Objects', 'Symbols', 'Flags']) && tabs.every((t) => t.endsWith('+icon')), JSON.stringify(tabs));
  const tabBox = await I.js(`(() => { const r = ${picker}.querySelector('[role="tab"]').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })()`);
  check('a tab is at least 32 px wide and 36 px tall (touch friendly)', tabBox.w >= 32 && tabBox.h >= 36, JSON.stringify(tabBox));
  check('"Frequently used" is at the top, empty at first, with a note', (await I.textOf(picker)).toLowerCase().includes('frequently used') && (await I.textOf(picker)).includes('Emoji you choose often will show here.'), (await I.textOf(picker)).slice(0, 200));
  await I.click(`${picker}.querySelector('[data-emoji-tab="animals"]')`, 300);
  await I.click(`[...${picker}.querySelectorAll('[data-emoji-cell]')].find((b) => b.getAttribute('aria-label') === 'dog face')`, 500);
  check('choosing keeps the picker open and shows the choice large', (await I.exists(picker)) && strip(await large()) === '🐶', await large());
  check('Frequently used now has it', strip(await I.js(`[...${picker}.querySelectorAll('[data-emoji-frequent] button')].map((b) => b.textContent).join('')`)) === '🐶');
  await I.shot('p29-02-picker-light');
  await I.click(`${picker}.querySelector('[data-emoji-done]')`, 500);
  check('Done closes the picker (the edit box stays)', !(await I.exists(picker)) && (await I.exists(`document.querySelector('[data-popover] [data-list-edit-box="LG"]')`)));
  await I.click(`document.querySelector('[data-popover] [aria-label="Save list Games"]')`, 700);
  check('Save writes the dog to Games', strip(lists().find((l) => l.key === 'LG').emoji) === '🐶', JSON.stringify(lists().find((l) => l.key === 'LG')));
  // The new list's own picker, in dark.
  await I.key('Escape', [], 300);
  await I.click(`document.querySelector('[aria-label="Profile and account"]') || document.querySelector('[aria-label="Profile, not signed in"]')`, 500);
  await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 800);
  await I.click(`document.querySelector('[data-theme-setting] [data-theme-mode="dark"]')`, 900);
  if (await I.exists(I.byLabel('Back'))) await I.click(I.byLabel('Back'), 700);
  await openLists();
  await pickerOpen('New list emoji');
  check('dark: the picker for a new list, nothing chosen yet', (await I.exists(picker)) && (await I.textOf(picker)).includes('No emoji chosen'));
  const frequentDark = strip(await I.js(`[...${picker}.querySelectorAll('[data-emoji-frequent] button')].map((b) => b.textContent).join('')`));
  check('dark: Frequently used still has the dog (kept on this computer)', frequentDark === '🐶', frequentDark);
  const pv = await I.js(`(() => { const p = ${picker}.querySelector('[data-emoji-preview]'); return getComputedStyle(p).backgroundColor; })()`);
  check('dark: the panel uses its own token (not the light one)', pv === 'rgb(34, 42, 37)', pv);
  await I.shot('p29-03-picker-dark');
  await I.key('Escape', [], 300);
  await I.key('Escape', [], 300);

  // ======== 3.14.0: one emoji per list ========
  const cellOf = (name) => `${picker}.querySelector('[data-emoji-cell][aria-label^="${name}"], [data-emoji-recent-cell][aria-label^="${name}"]')`;
  const caption = () => I.js(`(${picker}.querySelector('[data-emoji-caption]') || {}).innerText || ''`);
  const search = async (text) => {
    await I.js(`(() => { const i = ${picker}.querySelector('input[type="search"]'); i.focus(); i.select(); })()`);
    await I.type(text);
    await C.sleep(300);
  };
  await openLists();
  await pickerOpen('New list emoji');
  check('the picker says greyed out emoji belong to another list', (await caption()) === 'Greyed out emoji belong to another list.', await caption());
  await search('dog face');
  check('the dog (Games has it) is greyed out and says which list', (await I.js(`${cellOf('dog face')}.getAttribute('data-emoji-taken')`)) === 'Games', await I.js(`${cellOf('dog face')}.outerHTML.slice(0, 160)`));
  const grey = await I.js(`(() => { const b = ${cellOf('dog face')}; return { o: getComputedStyle(b).opacity, d: b.getAttribute('aria-disabled') }; })()`);
  check('greyed: faint and aria-disabled', Number(grey.o) < 0.5 && grey.d === 'true', JSON.stringify(grey));
  await I.click(cellOf('dog face'), 300);
  check('a click names the list and chooses nothing', (await caption()).includes('is already used by Games') && (await large()) === '', (await caption()) + '|' + (await large()));
  await I.shot('p29-04-taken-greyed-dark');
  await search('brain');
  await I.click(cellOf('brain'), 300);
  check("the brain is Brain Dump's: \"is Brain Dump's emoji\", not chosen", (await caption()).includes("Brain Dump's emoji") && (await I.js(`${cellOf('brain')}.getAttribute('data-emoji-taken')`)) === 'Brain Dump' && (await large()) === '');
  await search('📚');
  check('a typed or pasted taken emoji is not taken', (await caption()).includes('already used by Old name') && (await large()) === '', (await caption()) + '|' + (await large()));
  await search('rocket');
  await I.click(cellOf('rocket'), 400);
  check('a free emoji is chosen', strip(await large()) === '🚀', await large());
  await I.click(`${picker}.querySelector('[data-emoji-done]')`, 400);
  await I.click(`document.querySelector('[data-popover] [aria-label="New list name"]')`, 200);
  await I.type('Space');
  await I.click(createBtn, 800);
  check('the new list has the rocket', strip((lists().find((l) => l.name === 'Space') || {}).emoji) === '🚀', JSON.stringify(lists().find((l) => l.name === 'Space')));
  // Existing duplicates are left alone, with a note in the edit box.
  await openLists();
  await I.click(`document.querySelector('[data-list-edit="LB"]')`, 500);
  const sharedNote = await I.js(`(document.querySelector('[data-popover] [data-shared-emoji="LB"]') || {}).innerText || ''`);
  check('the edit box of a list sharing its emoji says so', sharedNote === '🍎 is also used by Twin A. It stays as it is; choose another emoji if you like.', sharedNote);
  await I.click(`document.querySelector('[data-popover] [aria-label="Name of list Twin B"]')`, 200);
  await I.js(`(() => { const i = document.querySelector('[data-popover] [aria-label="Name of list Twin B"]'); i.focus(); i.select(); })()`);
  await I.type('Twin Bee');
  await I.click(`document.querySelector('[data-popover] [aria-label="Save list Twin B"]')`, 800);
  check('it can still be renamed: the shared emoji is kept, nothing else changed', (lists().find((l) => l.key === 'LB') || {}).name === 'Twin Bee' && strip(lists().find((l) => l.key === 'LB').emoji) === '🍎' && strip(lists().find((l) => l.key === 'LA').emoji) === '🍎', JSON.stringify(lists().filter((l) => l.key === 'LA' || l.key === 'LB')));
  await I.click(`document.querySelector('[data-list-edit="LB"]')`, 500);
  await pickerOpen('Emoji for list Twin Bee');
  await search('red apple');
  check('in its own picker its own emoji is not greyed, the dog is', !(await I.js(`${cellOf('red apple')}.hasAttribute('data-emoji-taken')`)));
  await search('dog face');
  check('...and the other lists emoji are', (await I.js(`${cellOf('dog face')}.getAttribute('data-emoji-taken')`)) === 'Games');
  await search('rocket');
  await I.click(cellOf('rocket'), 400);
  check('choosing the rocket (Space has it) says so; the apple stays', (await caption()).includes('is already used by Space') && strip(await large()) === '🍎', (await caption()) + '|' + (await large()));
  await search('hammer');
  await I.click(cellOf('hammer'), 400);
  check('a free one replaces it and the note goes', strip(await large()) === '🔨' && !(await I.exists(`document.querySelector('[data-popover] [data-shared-emoji]')`)));
  await I.click(`${picker}.querySelector('[data-emoji-done]')`, 400);
  await I.click(`document.querySelector('[data-popover] [aria-label="Save list Twin Bee"]')`, 800);
  check('Save writes the hammer', strip(lists().find((l) => l.key === 'LB').emoji) === '🔨');
  check('Brain Dump keeps its brain in the lists menu', (await I.textOf(`document.querySelector('[data-popover]')`)).includes('Brain Dump') && (await I.js(`[...document.querySelectorAll('[data-popover] [aria-label="Show Brain Dump"]')].some((e) => e.innerText.includes('🧠'))`)));
  await I.key('Escape', [], 300);

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
