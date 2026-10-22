'use strict';
// Real check for 2.48.0: edit a list (name and emoji) from a pencil on its row in the lists dropdown.
// Real mouse, key and text input into the real app on an isolated data folder; Supabase is the in process
// fake (signed out, nothing leaves the machine). The edit is checked in the stored list (same key, same
// tasks), in the dropdown, in the left pane and on a Calendar block and a Timebox block; the duplicate name
// refusal, Cancel, and Delete list inside the box are checked too. Screenshots in light and dark.
// BELIFIC_SHOTS: a folder for screenshots.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const C = require('./common');
const { makeInput, dayKeyFrom } = require('./input');

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
      T('inwork', 'Write the report', { listKey: 'L1' }),
      T('timed', 'Timed work block', { listKey: 'L1', dueDate: today, startTime: '10:00', durationMinutes: 60 }),
      T('inread', 'Read a chapter', { listKey: 'L2' }),
    ]),
  );
  fs.writeFileSync(
    path.join(dataDir, 'belific_lists.kv'),
    JSON.stringify([
      { key: 'L1', name: 'Work', emoji: '💼', sortOrder: 0, createdAt: stamp, updatedAt: stamp },
      { key: 'L2', name: 'Reading', emoji: '📚', sortOrder: 1, createdAt: stamp, updatedAt: stamp },
    ]),
  );
  fs.writeFileSync(path.join(dataDir, 'belific_desktop_panes.kv'), JSON.stringify({ leftCollapsed: false, rightCollapsed: false, center: 'kanban', calendar: 'day' }));
  const lists = () => JSON.parse(fs.readFileSync(path.join(dataDir, 'belific_lists.kv'), 'utf8'));
  const tasks = () => JSON.parse(fs.readFileSync(path.join(dataDir, 'belific_tasks.kv'), 'utf8'));
  const list = (key) => lists().find((l) => l.key === key);
  const strip = (e) => String(e || '').replace(/️/g, '');

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1440, 900);
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await C.sleep(3500);

  const opener = (name) => `Array.from(document.querySelectorAll('[aria-label="${name}"]')).find((e) => e.getBoundingClientRect().width > 0)`;
  const open = async (current) => {
    await I.click(opener(`List: ${current}. Change list`), 500);
    await C.waitFor(() => I.exists(I.dialog('Lists')), 4000);
  };
  const dropdownText = () => I.js(`(document.querySelector('[role="dialog"][aria-label="Lists"]') || {}).innerText || ''`);
  const box = `document.querySelector('[data-list-edit-box]')`;
  const field = (label) => `document.querySelector('[role="dialog"][aria-label="Lists"] input[aria-label="${label}"]')`;

  // ======== The pencils ========
  await open('Brain Dump');
  const pencils = await I.js(`[...document.querySelectorAll('[role="dialog"][aria-label="Lists"] [data-list-edit]')].map((e) => e.getAttribute('aria-label'))`);
  check('a pencil on each list row', JSON.stringify(pencils) === JSON.stringify(['Edit list Work', 'Edit list Reading']), JSON.stringify(pencils));
  check('no pencil on Brain Dump (not a stored list)', !(await I.js(`!![...document.querySelectorAll('[role="dialog"][aria-label="Lists"] [aria-label*="Edit list Brain"]')].length`)));
  const rowOfPencil = await I.js(`(() => { const p = document.querySelector('[data-list-edit="L1"]'); const r = p.getBoundingClientRect(); return { w: r.width, h: r.height }; })()`);
  check('the pencil is a real button of a usable size', rowOfPencil.w >= 24 && rowOfPencil.h >= 24, JSON.stringify(rowOfPencil));
  // Pressing the pencil edits; it does not also switch to the list.
  await I.click(I.byLabel('Edit list Work'), 500);
  check('the pencil opens the edit box, not the list', await I.exists(box));
  check('the box has the name, the emoji button, Save, Cancel and Delete list', (await I.exists(field('Name of list Work'))) && (await I.exists(I.byLabel('Emoji for list Work'))) && (await I.exists(I.byLabel('Save list Work'))) && (await I.exists(I.byLabel('Cancel list edit'))) && (await I.exists(I.byLabel('Delete list Work'))));
  check('the name is filled in and the old Delete list section is gone from the list view', (await I.js(`${field('Name of list Work')}.value`)) === 'Work');
  check('the dropdown still names the shown list as Brain Dump (the list was not switched)', await I.exists(opener('List: Brain Dump. Change list')));
  await I.shot('p25-light-edit-box');

  // ======== A name another list has ========
  const typeName = async (label, text) => {
    await I.js(`(() => { const i = ${field(label)}; i.focus(); i.select(); })()`);
    await I.type(text, 200);
  };
  await typeName('Name of list Work', 'reading');
  await I.click(I.byLabel('Save list Work'), 500);
  const dupText = await dropdownText();
  check('a name another list has is refused with the new list sentence, and the box stays open', dupText.includes('Another list has that name') && (await I.exists(box)), dupText);
  check('nothing was stored', list('L1').name === 'Work' && list('L1').updatedAt === stamp, JSON.stringify(list('L1')));
  await I.shot('p25-light-duplicate');

  // ======== Cancel ========
  await I.click(I.byLabel('Cancel list edit'), 500);
  check('Cancel goes back to the list view without a change', !(await I.exists(box)) && (await dropdownText()).includes('Work') && list('L1').name === 'Work' && list('L1').updatedAt === stamp);

  // ======== Save a new name and a new emoji ========
  await I.click(I.byLabel('Edit list Work'), 500);
  await typeName('Name of list Work', 'Deep work');
  await I.click(I.byLabel('Emoji for list Work'), 500);
  await I.type('rocket', 400);
  await I.key('Down', [], 250);
  await I.enter([], 600);
  check('the picked emoji shows on the emoji button before Save', strip(await I.js(`document.querySelector('[role="dialog"][aria-label="Lists"] [data-emoji-field] button').textContent`)) === '🚀');
  check('nothing is stored before Save', list('L1').name === 'Work');
  await I.click(I.byLabel('Save list Deep work'), 700).catch(async () => I.click(I.byLabel('Save list Work'), 700));
  await C.waitFor(() => list('L1').name === 'Deep work', 5000).catch(() => {});
  const L1 = list('L1');
  check('the same list row has the new name and emoji, the same key and order', L1.key === 'L1' && L1.name === 'Deep work' && strip(L1.emoji) === '🚀' && L1.sortOrder === 0 && L1.createdAt === stamp, JSON.stringify(L1));
  check('updatedAt moved (it syncs like any list edit)', Date.parse(L1.updatedAt) > Date.parse(stamp), L1.updatedAt);
  check('there are still two lists, none deleted', lists().length === 2 && lists().every((l) => !l.deletedAt));
  const kept = tasks();
  check('the tasks keep their list key and are all there', kept.length === 3 && kept.filter((t) => t.listKey === 'L1').length === 2 && kept.filter((t) => t.listKey === 'L2').length === 1, JSON.stringify(kept.map((t) => [t.id, t.listKey])));
  check('the edit box closed and the dropdown shows the new name and emoji', !(await I.exists(box)) && /🚀/.test(await dropdownText()) && (await dropdownText()).includes('Deep work') && !(await dropdownText()).includes('💼'), await dropdownText());

  // ======== Everywhere the list is shown ========
  await I.click(I.byLabel('Show list Deep work'), 700);
  check('the left pane button names the list with the new emoji', await I.exists(opener('List: Deep work. Change list')));
  const pane = await I.js(`(() => { const b = ${opener('List: Deep work. Change list')}; return b.innerText; })()`);
  check('the left pane button shows the rocket', /🚀/.test(pane) && /Deep work/i.test(pane), pane);
  await C.waitFor(async () => (await I.body()).includes('Write the report'), 4000).catch(() => {});
  check('the left pane shows the list\'s tasks', (await I.body()).includes('Write the report') && !(await I.body()).includes('Read a chapter'));
  await I.shot('p25-light-left-pane');
  await I.click(`document.querySelector('[aria-label="Show the Calendar"]')`, 900);
  await I.click(`document.querySelector('[aria-label="Day view"]')`, 800);
  await I.js(`(() => { const b = document.querySelector('[data-cal-block$="timed"]'); if (b) b.scrollIntoView({ block: 'center' }); })()`);
  await C.sleep(400);
  const cal = await I.js(`(() => { const b = document.querySelector('[data-cal-block$="timed"]'); return b ? { emoji: b.querySelector('[data-block-list-emoji]')?.textContent || '', name: b.querySelector('[data-block-list-emoji]')?.getAttribute('title') || '' } : null; })()`);
  check('the Calendar block shows the new emoji and the new name in its tooltip', !!cal && strip(cal.emoji) === '🚀' && cal.name === 'Deep work', JSON.stringify(cal));
  await I.shot('p25-light-calendar-block');
  await I.click(`document.querySelector('[aria-label="Show Tasks"]')`, 800);
  const timebox = await I.js(`(() => { const b = [...document.querySelectorAll('[data-block-id="timed"]')].find((e) => e.getBoundingClientRect().width > 0); return b ? b.querySelector('[data-block-list-emoji]')?.textContent || '' : null; })()`);
  check('the Timebox block shows the new list emoji', strip(timebox) === '🚀', String(timebox));

  // ======== Delete list lives inside the box ========
  await open('Deep work');
  await I.click(I.byLabel('Edit list Reading'), 500);
  await I.click(I.byLabel('Delete list Reading'), 500);
  check('Delete list asks first, with the waiting task count', (await dropdownText()).includes('Delete this list? Its 1 waiting tasks go back to Brain Dump.'), await dropdownText());
  check('nothing deleted yet', !list('L2').deletedAt);
  await I.click(I.byLabel('Cancel delete list'), 400);
  check('No keeps the list', !list('L2').deletedAt && (await I.exists(I.byLabel('Delete list Reading'))));
  await I.click(I.byLabel('Delete list Reading'), 400);
  await I.click(I.byLabel('Confirm delete list'), 700);
  await C.waitFor(() => !!list('L2').deletedAt, 5000).catch(() => {});
  check('deleting from the box tombstones the list and sends its task to Brain Dump', !!list('L2').deletedAt && !tasks().find((t) => t.id === 'inread').listKey && tasks().length === 3, JSON.stringify(tasks().map((t) => [t.id, t.listKey])));

  // ======== Dark ========
  await I.click(`document.querySelector('[aria-label="Profile and account"]') || document.querySelector('[aria-label="Profile, not signed in"]')`, 500);
  await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 800);
  await I.click(`document.querySelector('[data-theme-setting] [data-theme-mode="dark"]')`, 900);
  if (await I.exists(I.byLabel('Back'))) await I.click(I.byLabel('Back'), 700);
  check('the dark theme is on', (await I.js(`document.documentElement.getAttribute('data-theme')`)) === 'dark');
  await open('Brain Dump').catch(async () => open('Deep work'));
  await I.shot('p25-dark-dropdown');
  await I.click(I.byLabel('Edit list Deep work'), 500);
  const dark = await I.js(`(() => {
    const b = document.querySelector('[data-list-edit-box]');
    const inp = b.querySelector('input');
    const save = [...b.querySelectorAll('[role="button"]')].find((e) => e.getAttribute('aria-label') === 'Save list Deep work');
    const rgb = (s) => (s.match(/[\\d.]+/g) || []).map(Number);
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    const ratio = (a, c) => { const x = lum(a), y = lum(c); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const sb = getComputedStyle(save);
    const st = getComputedStyle(save.querySelector('div,span'));
    const ib = getComputedStyle(inp);
    const radii = [ib.borderTopLeftRadius, sb.borderTopLeftRadius].map(parseFloat);
    return { save: ratio(rgb(st.color), rgb(sb.backgroundColor)), input: ratio(rgb(ib.color), rgb(ib.backgroundColor)), radii };
  })()`);
  check('dark: the Save label and the name field are readable (4.5:1)', dark.save >= 4.5 && dark.input >= 4.5, JSON.stringify(dark));
  check('dark: radii are on the scale (4, 6, 8, 10, 16)', dark.radii.every((r) => [0, 4, 6, 8, 10, 16].includes(r)), JSON.stringify(dark.radii));
  await I.shot('p25-dark-edit-box');
  await I.click(I.byLabel('Cancel list edit'), 400);

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
