'use strict';
// @real-input: quiet
// Real touch check for the 3.61.0 Tasks tab redesign (phone only) at 390 x 844:
//   slab rows (own card, a gap, label colour edge, list name, label dot), the Repeats groups (headers, fold kept after a
//   reload, the pattern in words, Until), the top (Lists, Labels with counts, + New label, a label chip opens its tasks
//   grouped by list), Search, Trash with Restore, and room at the bottom of Tasks above the round +.
// Runs quiet.
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
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const write = (k, v) => fs.writeFileSync(path.join(dataDir, `${k}.kv`), JSON.stringify(v));
  const task = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  const stamp2 = new Date().toISOString();
  write('belific_tasks', [
    task('a', 'Buy stamps', { listKey: 'LW', projectKey: 'LH' }),
    task('b', 'Renew passport', { projectKey: 'LH' }),
    task('c', 'Plain thing'),
    task('d', 'Pay rent', { projectKey: 'LM', dueDate: day(3) }),
    task('e', 'Water plants', { recurrence: 'daily', dueDate: day(0), repeatUntil: day(20) }),
    task('f', 'Gym', { recurrence: 'weekly', recurrenceDays: ['Mon', 'Wed'], dueDate: day(0) }),
    task('g', 'Bin day', { recurrence: 'monthly', recurrenceMonthDay: 3, dueDate: day(0) }),
    task('h', 'Old gadget', { deletedAt: stamp2, updatedAt: stamp2 }),
  ]);
  write('belific_lists', [{ key: 'LW', name: 'Work', sortOrder: 0, emoji: '💼', createdAt: stamp, updatedAt: stamp }]);
  write('belific_projects', [
    { key: 'LH', name: 'Health', emoji: '💪', colorKey: 'sage', createdAt: stamp, updatedAt: stamp },
    { key: 'LM', name: 'Money', colorKey: 'sky', createdAt: stamp, updatedAt: stamp },
  ]);
  const read = (k) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dataDir, `${k}.kv`), 'utf8'));
    } catch {
      return [];
    }
  };

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.show();
  await C.sleep(2500);
  const P = await phoneWindow(win);
  await C.sleep(1500);
  const shot = async (name) => {
    if (!process.env.BELIFIC_SHOTS) return;
    fs.mkdirSync(process.env.BELIFIC_SHOTS, { recursive: true });
    fs.writeFileSync(path.join(process.env.BELIFIC_SHOTS, `${name}.png`), (await win.webContents.capturePage()).toPNG());
  };
  const tabEls = `[...document.querySelectorAll('a, [role="tab"], [role="button"], [role="link"]')].filter((e) => { const r = e.getBoundingClientRect(); return r.top > 760 && r.height > 20 && r.width > 40 && r.width < 200; })`;
  const tab = (name) => `${tabEls}.find((e) => e.textContent.replace(/[^ -~]/g, '').trim() === '${name}')`;
  const visible = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].reverse().find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left >= -1 && r.left < innerWidth && r.top < innerHeight; })`;
  const tap = (sel, ms = 900) => P.finger.tap(visible(sel), ms);
  const has = (sel) => P.js(`!!(${visible(sel)})`);
  const text = (sel) => P.js(`((${visible(sel)}) || {}).innerText || ''`);
  const typeText = async (t) => {
    await win.webContents.insertText(t);
    await C.sleep(500);
  };
  const chipTap = async (attr) => {
    await P.js(`document.querySelector('[${attr}]').scrollIntoView({ inline: 'center', block: 'nearest' })`);
    await C.sleep(300);
    await tap(`[${attr}]`, 1000);
  };
  const slabs = () => P.js(`[...document.querySelectorAll('[data-slab-row]')].map((e) => { const r = e.getBoundingClientRect(); return { id: e.getAttribute('data-slab-row'), top: Math.round(r.top), bottom: Math.round(r.bottom), text: e.innerText.replace(/\\n/g, ' | ') }; })`);

  await P.finger.tap(tab('Tasks'), 1500);

  // ---- slab rows ----
  const rows = await slabs();
  check('Brain Dump shows each task as its own slab card', rows.length >= 2, JSON.stringify(rows.map((r) => r.text)));
  check('a gap of at least 10 pt between two cards', rows.length >= 2 && rows[1].top - rows[0].bottom >= 10, JSON.stringify(rows.map((r) => [r.top, r.bottom])));
  const pass = rows.find((r) => /Renew passport/.test(r.text));
  check('a row names its list small (Brain Dump) and its label (Health)', !!pass && /Brain Dump/.test(pass.text) && /Health/.test(pass.text), JSON.stringify(pass));
  await shot('phone-p28-tasks');

  // ---- the top: lists and labels ----
  check('there are + New list and + New label', (await has('[data-list-chip="new"]')) && (await has('[data-label-chip="new"]')));
  const health = await P.js(`(document.querySelector('[data-label-filter="Health"]') || {}).innerText || ''`);
  check('the Health chip counts 2 open tasks', /Health/.test(health) && /2$/.test(health.trim()), health);
  const money = await P.js(`(document.querySelector('[data-label-filter="Money"]') || {}).innerText || ''`);
  check('the Money chip counts 1', /1$/.test(money.trim()), money);
  await chipTap('data-label-filter="Health"');
  check('a label chip shows its tasks grouped by list (Brain Dump and Work)', await P.js(`(() => { const v = document.querySelector('[data-label-view]'); return !!v && /Brain Dump/.test(v.innerText) && /Work/.test(v.innerText) && /Buy stamps/.test(v.innerText) && /Renew passport/.test(v.innerText); })()`), await text('[data-label-view]'));
  await shot('phone-p28-label-view');

  // ---- New label ----
  await chipTap('data-label-chip="new"');
  check('+ New label opens the sheet', await has('[data-label-sheet]'));
  await tap('[aria-label="Label name"]', 500);
  await typeText('Errands');
  await tap('[aria-label="Create label"]', 1400);
  const lab = read('belific_projects').find((p) => p.name === 'Errands');
  check('the label is stored with a colour', !!lab && !!lab.colorKey, JSON.stringify(lab));
  check('and its chip shows', /Errands/.test(await P.js(`(document.querySelector('[data-label-filter="Errands"]') || {}).innerText || ''`)));

  // ---- Repeats ----
  await chipTap('data-list-chip="__repeating__"');
  check('the chip is called Repeats and "Repeating" is gone', /Repeats/.test(await P.js(`document.querySelector('[data-list-chip="__repeating__"]').innerText`)) && !/Repeating/.test(await P.js(`document.body.innerText`)));
  const heads = await P.js(`[...document.querySelectorAll('[data-group-head]')].map((e) => e.innerText.replace(/\\s+/g, ' ').trim())`);
  check('groups Daily, Weekly, Monthly with counts', heads.map((h) => h.replace(/[^A-Za-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()).join('|') === 'Daily 1|Weekly 1|Monthly 1', JSON.stringify(heads));
  const words = await P.js(`[...document.querySelectorAll('[data-quest-words]')].map((e) => e.innerText)`);
  check('the patterns in words, with Until', words.includes('Every Monday and Wednesday') && words.includes('Monthly on the 3rd') && words.some((w) => /^Every day · Until \d{1,2} \w{3}$/.test(w)), JSON.stringify(words));
  await shot('phone-p28-repeats');
  await tap('[data-group-head="weekly"]', 700);
  check('a group folds (Gym is hidden)', !(await P.js(`(document.querySelector('[data-repeat-group="weekly"]') || {innerText: ''}).innerText.includes('Gym')`)));
  win.webContents.reload();
  await C.sleep(3500);
  await P.finger.tap(tab('Tasks'), 1500);
  await chipTap('data-list-chip="__repeating__"');
  check('after a reload it is still folded, the others open', !(await P.js(`(document.querySelector('[data-repeat-group="weekly"]') || {innerText: ''}).innerText.includes('Gym')`)) && (await P.js(`(document.querySelector('[data-repeat-group="daily"]') || {innerText: ''}).innerText.includes('Water plants')`)));
  await tap('[data-group-head="weekly"]', 700);
  check('tapping again opens it', await P.js(`(document.querySelector('[data-repeat-group="weekly"]') || {innerText: ''}).innerText.includes('Gym')`));

  // ---- Search ----
  await chipTap('data-list-chip="dump"');
  await tap('[data-open-search]', 1000);
  check('Search opens full screen', await has('[data-overlay="search"]'));
  await tap('[data-search-input]', 400);
  await typeText('passp');
  check('the shared search finds Renew passport', await has('[data-search-hit="Renew passport"]'), await text('[data-overlay="search"]'));
  await tap('[data-overlay-close="search"]', 900);

  // ---- Trash ----
  await tap('[data-open-trash]', 1000);
  check('Trash lists Old gadget', await has('[data-trash-entry="Old gadget"]'));
  await tap('[aria-label="Restore Old gadget"]', 1400);
  check('Restore brings it back as a live task', read('belific_tasks').some((t) => t.title === 'Old gadget' && !t.deletedAt), JSON.stringify(read('belific_tasks').filter((t) => t.title === 'Old gadget')));
  await tap('[data-overlay-close="trash"]', 900);
  check('and it shows in Brain Dump', await P.js(`document.body.innerText.includes('Old gadget')`));

  // ---- room at the bottom above the round + ----
  const more = [];
  for (let i = 0; i < 12; i++) more.push(task(`x${i}`, `Filler ${i}`));
  write('belific_tasks', [...read('belific_tasks'), ...more]);
  win.webContents.reload();
  await C.sleep(3500);
  await P.finger.tap(tab('Tasks'), 1500);
  const t = await P.js(`(() => { const sc = [...document.querySelectorAll('div')].filter((e) => e.scrollHeight > e.clientHeight + 40 && getComputedStyle(e).overflowY !== 'visible' && e.clientWidth > 300).pop(); if (!sc) return 'noscroll'; sc.scrollTop = sc.scrollHeight; return new Promise((res) => setTimeout(() => { const fab = document.querySelector('[data-add-button]').getBoundingClientRect(); const bottoms = [...document.querySelectorAll('[data-slab-row]')].map((e) => e.getBoundingClientRect().bottom); res({ fabTop: Math.round(fab.top), last: Math.round(Math.max(...bottoms)) }); }, 500)); })()`);
  check('Tasks: scrolled to the end, the last card ends above the round +', t !== 'noscroll' && t.last <= t.fabTop - 8, JSON.stringify(t));
  await shot('phone-p28-bottom');

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
