'use strict';
// @real-input: quiet
// Real touch check for 3.55.0 (PLAN_phone_parity phase 3) at 390 x 844: the example lists and labels.
//   - an empty phone: the Tasks tab shows Home, Work, Shopping as chips (44 pt high, 14 px or more); one tap makes the list
//     with its emoji, and the chips go away;
//   - New list shows the rest as a Quick start, one tap each;
//   - a task's Label menu offers Health, Money, Family; one tap makes the label with its emoji and colour and puts it on the task;
//   - a task's details read "Smaller tasks", "Add a smaller task" and the one line hint.
// Runs quiet.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const C = require('./common');
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
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const write = (k, v) => fs.writeFileSync(path.join(dataDir, `${k}.kv`), JSON.stringify(v));
  write('belific_tasks', [{ id: 'rent', title: 'Pay rent', completed: false, createdAt: stamp, updatedAt: stamp }]);
  const read = (k) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dataDir, `${k}.kv`), 'utf8'));
    } catch {
      return [];
    }
  };
  const lists = () => read('belific_lists').filter((l) => !l.deletedAt);
  const labels = () => read('belific_projects').filter((l) => !l.deletedAt);

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
  const visible = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].reverse().find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left >= -1 && r.left < innerWidth && r.top < innerHeight && r.bottom > 0; })`;
  const reveal = async (sel) => {
    await P.js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (e) e.scrollIntoView({ inline: 'center', block: 'nearest' }); })()`);
    await C.sleep(300);
  };
  const pageText = () => P.js(`document.body.innerText`);

  // ---- Tasks tab, no lists ----
  await P.finger.tap(tab('Tasks'), 1500);
  const chips = await P.js(`[...document.querySelectorAll('[data-list-preset]')].map((e) => { const r = e.getBoundingClientRect(); const t = e.querySelector('div,span'); return { n: e.getAttribute('data-list-preset'), h: Math.round(r.height), f: parseFloat(getComputedStyle(e.querySelector('*') || e).fontSize) }; })`);
  check('no lists: Home, Work and Shopping are offered as chips', JSON.stringify(chips.map((c) => c.n)) === '["Home","Work","Shopping"]', JSON.stringify(chips));
  check('each chip is 44 high or more, text 14 px or more', chips.every((c) => c.h >= 44 && c.f >= 14), JSON.stringify(chips));
  await shot('phone-p21-chips');
  check('nothing was made without a tap', lists().length === 0);
  await P.finger.tap(visible('[data-list-preset="Work"]'), 1500);
  check('one tap on Work makes the list with its emoji', lists().length === 1 && lists()[0].name === 'Work' && lists()[0].emoji === '💼', JSON.stringify(lists()));
  check('the chips go away once a list exists', !(await P.js(`!!document.querySelector('[data-list-preset]')`)));

  // ---- New list: the rest as Quick start ----
  await reveal('[aria-label="New list"]');
  await P.finger.tap(visible('[aria-label="New list"]'), 1200);
  const rest = await P.js(`[...document.querySelectorAll('[data-list-preset]')].map((e) => e.getAttribute('data-list-preset'))`);
  check('New list offers the two left: Home and Shopping, and the one line hint', JSON.stringify(rest) === '["Home","Shopping"]' && (await pageText()).includes('Tap one to add it.'), JSON.stringify(rest));
  await shot('phone-p21-newlist');
  await P.finger.tap(visible('[data-list-preset="Shopping"]'), 1500);
  check('one tap on Shopping makes it', lists().map((l) => l.name).sort().join() === 'Shopping,Work' && lists().find((l) => l.name === 'Shopping').emoji === '🛒', JSON.stringify(lists()));

  // ---- A task's label menu, and its smaller tasks ----
  await P.finger.tap(tab('Tasks'), 1000);
  await reveal('[data-list-chip="dump"]');
  await P.finger.tap(visible('[data-list-chip="dump"]'), 900);
  await P.finger.tap(`[...document.querySelectorAll('[data-task-row="Pay rent"] [data-task-body]')][0]`, 1300);
  check('a tap opens the details of Pay rent', await P.js(`!!document.querySelector('[data-task-details="rent"]')`));
  const inSheet = (sel) => `(() => { const root = document.querySelector('[data-task-details]'); const sheet = root && root.parentElement; return sheet ? [...sheet.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.getBoundingClientRect().height > 0) : null; })()`;
  const sheetText = () => P.js(`(() => { const r = document.querySelector('[data-task-details]'); return r && r.parentElement ? r.parentElement.innerText : ''; })()`);
  await P.js(`(() => { const e = ${inSheet('[data-detail-row="label"]')}; if (e) e.scrollIntoView({ block: 'center' }); })()`);
  await C.sleep(300);
  await P.finger.tap(inSheet('[data-detail-row="label"]'), 1000);
  const menu = await P.js(`[...document.querySelectorAll('[data-action-menu] [aria-label]')].map((e) => e.getAttribute('aria-label'))`);
  check('the Label menu offers Health, Money and Family', ['Add 💪 Health', 'Add 💷 Money', 'Add 👪 Family'].every((l) => menu.includes(l)), JSON.stringify(menu));
  await shot('phone-p21-labelmenu');
  await P.finger.tap(`[...document.querySelectorAll('[data-action-menu] [aria-label="Add 💷 Money"]')].pop()`, 1500);
  const money = labels().find((l) => l.name === 'Money');
  check('one tap makes Money with its emoji and the yellow colour, and puts it on the task', !!money && money.emoji === '💷' && money.colorKey === 'yellow' && read('belific_tasks').find((t) => t.id === 'rent').projectKey === money.key, JSON.stringify(labels()));
  check('nothing else was made', labels().length === 1);

  // ---- the words ----
  await P.js(`(() => { const e = ${inSheet('[data-parts-head], [data-add-part]')}; if (e) e.scrollIntoView({ block: 'center' }); })()`);
  await C.sleep(300);
  const text = (await sheetText()).replace(/\s+/g, ' ');
  check('the details read "Smaller tasks", "Add a smaller task" and the hint; no "Parts" or "Add part"', text.toLowerCase().includes('smaller tasks') && text.includes('Add a smaller task') && text.includes('Their own times and lengths, shown inside this block') /* 3.59.1: the phone's own line */ && !/Parts|Add part/.test(text), text.slice(0, 1500));
  const hint = await P.js(`(() => { const e = ${inSheet('[data-parts-hint]')}; return e ? parseFloat(getComputedStyle(e).fontSize) : 0; })()`);
  check('the hint is 14 px or more', hint >= 14, String(hint));
  const add = await P.js(`(() => { const e = ${inSheet('[data-add-part]')}; return e ? e.getBoundingClientRect().height : 0; })()`);
  check('the Add a smaller task button is 44 high or more', add >= 44, String(add));
  await shot('phone-p21-smaller');

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
