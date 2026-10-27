'use strict';
// Real check for 3.14.1: the list emoji of every kind of list on every surface. The Brain Dump brain was
// missing from task cards, Calendar blocks and Timebox blocks (listEmojiOf gave nothing for a task with no list).
// Lists: Brain Dump, Games (an emoji), Plain (none), Old name (renamed during the check to Reading), and a task on
// a list that no longer exists (it reads as Brain Dump).
// Surfaces: the Tasks board cards, the left pane's cards, the Timebox, the Calendar's day. Light, renamed, dark.
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
  const timed = (id, title, start, extra = {}) => T(id, title, { dueDate: TODAY, startTime: start, durationMinutes: 90, ...extra });
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      timed('bd', 'Dump task', '07:00'),
      timed('gm', 'Games task', '09:00', { listKey: 'LG' }),
      timed('pl', 'Plain task', '11:00', { listKey: 'LP' }),
      timed('rn', 'Renamed task', '13:00', { listKey: 'LR' }),
      timed('gone', 'Orphan task', '15:00', { listKey: 'LX' }),
      T('ubd', 'Undated dump'),
      T('ugm', 'Undated games', { listKey: 'LG' }),
      T('upl', 'Undated plain', { listKey: 'LP' }),
      T('urn', 'Undated renamed', { listKey: 'LR' }),
    ]),
  );
  fs.writeFileSync(path.join(dataDir, 'belific_lists.kv'), JSON.stringify([L('LG', 'Games', 0, { emoji: '🎮' }), L('LP', 'Plain', 1), L('LR', 'Old name', 2, { emoji: '📚' })]));
  fs.writeFileSync(path.join(dataDir, 'belific_desktop_panes.kv'), JSON.stringify({ leftCollapsed: false, rightCollapsed: false, center: 'kanban', calendar: 'day' }));
  const read = readKv(dataDir);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1440, 900);
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await I.waitBody('Games task', 20000);
  await I.click(`document.querySelector('[aria-label="Show Tasks"]')`, 600);
  await C.sleep(1200);
  const strip = (e) => String(e || '').replace(/️/g, '');

  const TITLES = { bd: 'Dump task', gm: 'Games task', pl: 'Plain task', rn: 'Renamed task', gone: 'Orphan task' };
  const cardEmoji = async (title) =>
    strip(await I.js(`(() => { const c = [...document.querySelectorAll('[aria-label="Task ${title}"]')].find((e) => e.getBoundingClientRect().width > 0); const e = c && c.querySelector('[data-card-list-emoji]'); return e ? e.textContent : (c ? '' : null); })()`));
  const blockEmoji = (sel) =>
    I.js(`(() => { const b = document.querySelector('${sel}'); if (!b) return null; const e = b.querySelector('[data-block-list-emoji]'); return e ? { t: e.textContent.trim().replace(/️/g, ''), tip: e.getAttribute('title') || e.getAttribute('aria-label') || '' } : { t: '', tip: '' }; })()`);
  const WANT = { bd: ['🧠', 'Brain Dump'], gm: ['🎮', 'Games'], pl: ['', ''], rn: ['📚', 'Old name'], gone: ['🧠', 'Brain Dump'] };
  const surfaces = async (mode, want = WANT) => {
    for (const id of Object.keys(want)) {
      const [emoji, name] = want[id];
      const t0 = Date.now();
      let b = await cardEmoji(TITLES[id]);
      while (b !== emoji && Date.now() - t0 < 4000) {
        await C.sleep(250);
        b = await cardEmoji(TITLES[id]);
      }
      if (Date.now() - t0 > 400) console.log(`INFO ${mode} ${TITLES[id]} card needed ${Date.now() - t0} ms`);
      check(`${mode}: board card ${TITLES[id]} shows ${emoji || 'no emoji'}`, b === emoji, String(b));
      const t = await blockEmoji(`[data-block-id="${id}"]`);
      check(`${mode}: Timebox block ${TITLES[id]} shows ${emoji || 'no emoji'}${name ? ` (tooltip ${name})` : ''}`, !!t && t.t === emoji && (!emoji || t.tip.includes(name)), JSON.stringify(t));
    }
    await I.click(I.byLabel('Show the Calendar'), 900);
    for (const id of Object.keys(want)) {
      const [emoji, name] = want[id];
      await I.js(`(() => { const b = document.querySelector('[data-cal-block$="${id}"]'); if (b) b.scrollIntoView({ block: 'center' }); })()`);
      await C.sleep(150);
      const c = await blockEmoji(`[data-cal-block$="${id}"]`);
      check(`${mode}: Calendar block ${TITLES[id]} shows ${emoji || 'no emoji'}${name ? ` (tooltip ${name})` : ''}`, !!c && c.t === emoji && (!emoji || c.tip.includes(name)), JSON.stringify(c));
    }
    await I.shot(`p30-calendar-${mode}`);
    await I.click(I.byLabel('Show Tasks'), 900);
    await I.shot(`p30-board-${mode}`);
  };
  const openLists = () => I.click(`document.querySelector('[aria-label^="List: "][aria-label$="Change list"]')`, 500);
  const leftPane = async (mode) => {
    const cases = [['Show Brain Dump', 'Undated dump', '🧠'], ['Show list Games', 'Undated games', '🎮'], ['Show list Plain', 'Undated plain', ''], ['Show list Old name', 'Undated renamed', '📚'], ['Show list Reading', 'Undated renamed', '📚']];
    for (const [label, title, emoji] of cases) {
      const name = label.replace('Show list ', '').replace('Show ', '');
      if (name === 'Reading' && mode === 'light') continue;
      if (name === 'Old name' && mode !== 'light') continue;
      await openLists();
      await I.click(I.byLabel(label), 700);
      const e = await cardEmoji(title);
      check(`${mode}: left pane, ${name}: ${title} shows ${emoji || 'no emoji'}`, e === emoji, String(e));
    }
    await openLists();
    await I.click(I.byLabel('Show Brain Dump'), 500);
  };

  await surfaces('light');
  await leftPane('light');
  await I.shot('p30-left-pane-light');

  // A renamed list: the emoji stays, the tooltip follows the new name.
  await openLists();
  await I.click(`document.querySelector('[data-list-edit="LR"]')`, 500);
  await I.js(`(() => { const i = document.querySelector('[data-popover] [aria-label="Name of list Old name"]'); i.focus(); i.select(); })()`);
  await I.type('Reading');
  await I.click(`document.querySelector('[data-popover] [aria-label="Save list Old name"]')`, 800);
  check('the list is renamed in the data', (read('belific_lists').find((l) => l.key === 'LR') || {}).name === 'Reading');
  await I.key('Escape', [], 400);
  await surfaces('renamed', { ...WANT, rn: ['📚', 'Reading'] });
  await leftPane('renamed');

  // Dark.
  await I.click(`document.querySelector('[aria-label="Profile and account"]') || document.querySelector('[aria-label="Profile, not signed in"]')`, 500);
  await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 800);
  await I.click(`document.querySelector('[data-theme-setting] [data-theme-mode="dark"]')`, 900);
  if (await I.exists(I.byLabel('Back'))) await I.click(I.byLabel('Back'), 700);
  await surfaces('dark', { ...WANT, rn: ['📚', 'Reading'] });
  await leftPane('dark');
  await I.shot('p30-left-pane-dark');

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
