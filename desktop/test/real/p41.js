'use strict';
// Real check for 3.21.0 (step 2): undo and redo of task changes on the desktop. Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z with the
// real keyboard in the real app (isolated data folder, in process fake Supabase; the sync queue itself is covered by undoStack.test.ts: a signed out
// app never queues): a time edit, a tick, a create, a delete; the keys are left to a text field that has the keyboard;
// the bottom bar says "Undone: moved Alpha" with Redo, and "Redone: ..." with Undo; every undo is a normal edit (updatedAt
// moves). Light and dark. BELIFIC_SHOTS: a folder for screenshots.
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
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      T('al', 'Alpha', { dueDate: day(0), startTime: '09:00', durationMinutes: 60 }),
      T('be', 'Beta'),
      T('rp', 'Rep walk', { recurrence: 'daily', dueDate: day(-1), startTime: '15:00', durationMinutes: 30 }),
      T('ga', 'Gamma', { dueDate: day(0), startTime: '13:00', durationMinutes: 30 }),
    ]),
  );
  fs.writeFileSync(path.join(dataDir, 'belific_desktop_panes.kv'), JSON.stringify({ leftCollapsed: false, rightCollapsed: false, center: 'kanban', calendar: 'day' }));
  const read = readKv(dataDir);
  const rows = () => read('belific_tasks') || [];
  const row = (id) => rows().find((t) => t.id === id);
  const liveTitles = () => rows().filter((t) => !t.deletedAt).map((t) => t.title);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1440, 900);
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await I.waitBody('Alpha', 20000);
  await I.click(I.byLabel('Show Tasks'), 800).catch(() => {});
  await C.sleep(800);

  const setValue = (sel, value) =>
    I.js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; el.focus(); set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  const bar = () => I.js(`(() => { const b = document.querySelector('[data-undo-bar], [data-notice-bar]'); return b ? { text: b.innerText.replace(/\\s+/g, ' ').trim(), buttons: [...b.querySelectorAll('[role="button"]')].map((x) => x.getAttribute('aria-label')) } : null; })()`);
  const undoKey = () => I.key('Z', ['control'], 900);
  const redoKey = () => I.key('Y', ['control'], 900);
  const redoAlt = () => I.key('Z', ['control', 'shift'], 900);
  // Nothing in a field has the keyboard: a click on the empty part of the page.
  const away = () => I.js(`(() => { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); })()`);

  async function pass(mode) {
    // ---- a time edit (the details) ----
    await I.click(I.byLabel('Title Alpha'), 900);
    await C.waitFor(() => I.exists(`document.querySelector('[data-detail-panel]')`), 8000);
    await setValue('[data-detail-panel] input[aria-label="Time"]', '10:00');
    await C.waitFor(async () => row('al').startTime === '10:00', 6000).catch(() => {});
    await I.key('Escape', [], 600);
    await away();
    const stampBefore = row('al').updatedAt;
    await undoKey();
    check(`${mode}: Ctrl+Z puts Alpha back at 09:00`, row('al').startTime === '09:00', JSON.stringify(row('al')));
    check(`${mode}: and it is a normal edit (updatedAt moved)`, row('al').updatedAt > stampBefore, `${stampBefore} -> ${row('al').updatedAt}`);
    const b1 = await bar();
    check(`${mode}: the bar says "Undone: moved Alpha" with Redo`, !!b1 && b1.text.startsWith('Undone: moved Alpha') && b1.buttons.includes('Redo'), JSON.stringify(b1));
    await I.shot(`p41-undone-${mode}`);
    await redoKey();
    check(`${mode}: Ctrl+Y redoes it (10:00)`, row('al').startTime === '10:00', JSON.stringify(row('al')));
    const b2 = await bar();
    check(`${mode}: the bar says "Redone: moved Alpha" with Undo`, !!b2 && b2.text.startsWith('Redone: moved Alpha') && b2.buttons.includes('Undo'), JSON.stringify(b2));
    await undoKey();
    await redoAlt();
    check(`${mode}: Ctrl+Shift+Z redoes too`, row('al').startTime === '10:00', JSON.stringify(row('al')));
    // The bar's own button.
    await undoKey();
    await I.click(`document.querySelector('[data-undo-bar] [aria-label="Redo"]')`, 900);
    check(`${mode}: the Redo button of the bar redoes it, and offers the Undo`, row('al').startTime === '10:00' && ((await bar()) || {}).text.startsWith('Redone'), JSON.stringify(await bar()));
    // Back to 09:00 for the next pass.
    await undoKey();
    check(`${mode}: and again 09:00`, row('al').startTime === '09:00');
  }

  await pass('light');

  // ---- text fields keep their own undo ----
  const alphaStart = row('al').startTime;
  await I.click(`document.querySelector('[data-add-plus="left"]')`, 300);
  await I.type('Typing here');
  const before = JSON.stringify(rows());
  const barBefore = JSON.stringify(await bar());
  await undoKey();
  check('a text field that has the keyboard keeps Ctrl+Z for its own typing (no task changed, the bar is as it was)', before === JSON.stringify(rows()) && barBefore === JSON.stringify(await bar()), barBefore);
  await I.js(`(() => { const e = document.activeElement; e.select && e.select(); })()`);
  await I.key('Backspace', [], 200);
  await away();

  // ---- a tick ----
  await I.click(I.byLabel('Mark Beta complete'), 800);
  check('a tick: Beta is done', row('be').completed === true);
  await away();
  await undoKey();
  check('Ctrl+Z un-ticks it', row('be').completed === false && ((await bar()) || {}).text.startsWith('Undone: ticked Beta'), JSON.stringify([row('be').completed, await bar()]));
  await redoKey();
  check('Ctrl+Y ticks it again', row('be').completed === true);
  await undoKey();

  // ---- a create ----
  await I.click(`document.querySelector('[data-add-plus="left"]')`, 300);
  await I.type('Made now');
  await I.enter();
  await C.waitFor(async () => liveTitles().includes('Made now'), 5000).catch(() => {});
  check('a create: the task exists', liveTitles().includes('Made now'));
  await away();
  await I.js(`document.body.click()`);
  await undoKey();
  check('Ctrl+Z deletes it again', !liveTitles().includes('Made now') && ((await bar()) || {}).text.startsWith('Undone: created Made now'), JSON.stringify(await bar()));
  await redoKey();
  check('Ctrl+Y brings it back (as a new row, a delete can never be cleared)', liveTitles().includes('Made now'), JSON.stringify(liveTitles()));
  await undoKey();
  check('and undone once more it is gone', !liveTitles().includes('Made now'));

  // ---- a delete (the card menu) ----
  await I.click(I.byLabel('More actions for Gamma'), 600);
  await I.click(`document.querySelector('[data-popover] [aria-label="Delete task"]')`, 500);
  await I.click(`document.querySelector('[data-popover] [aria-label="Confirm delete task"]')`, 1000);
  check('a delete: Gamma is gone', !liveTitles().includes('Gamma') && !!row('ga').deletedAt);
  await away();
  await undoKey();
  const gammas = rows().filter((t) => t.title === 'Gamma' && !t.deletedAt);
  check('Ctrl+Z brings Gamma back as the Trash restores one (a new live row, same day and time)', gammas.length === 1 && gammas[0].id !== 'ga' && gammas[0].startTime === '13:00' && gammas[0].dueDate === day(0), JSON.stringify(rows().filter((t) => t.title === 'Gamma')));
  check('the old tombstone stays', !!row('ga').deletedAt);
  await C.sleep(600);
  await I.shot('p41-gamma-back');

  // ---- a repeating day, nudged with the keyboard (this day only), then undone ----
  const repId = `rp:${day(0)}`;
  await I.js(`(() => { const b = document.querySelector('[data-block-id="${repId}"]'); if (b) { b.scrollIntoView({ block: 'center' }); b.focus(); } })()`);
  await C.sleep(400);
  check('Rep walk is a block on the Timebox today', await I.exists(`document.querySelector('[data-block-id="${repId}"]')`));
  await I.key('Down', [], 1200);
  check('the nudge moved that day only (the series keeps 15:00)', !!row(repId) && row(repId).startTime === '15:30' && row('rp').startTime === '15:00', JSON.stringify(rows().filter((r) => r.id.startsWith('rp'))));
  await away();
  await undoKey();
  const rep = rows().filter((r) => r.id.startsWith('rp') && !r.deletedAt);
  check('Ctrl+Z: no day of the series is left at 15:30, today is at 15:00 again', rep.length >= 1 && rep.every((r) => r.startTime === '15:00') && ((await bar()) || {}).text.startsWith('Undone: moved Rep walk'), JSON.stringify(rep.map((r) => [r.id, r.dueDate, r.startTime])));
  check('and today still shows the series once on the Timebox', (await I.js(`document.querySelectorAll('[data-block-id^="rp"]').length`)) === 1, String(await I.js(`document.querySelectorAll('[data-block-id^="rp"]').length`)));
  await redoKey();
  check('Ctrl+Y moves that day again', row(repId) && row(repId).startTime === '15:30');
  await undoKey();

  // ---- Dark ----
  const icon = (await I.exists(I.byLabel('Profile and account'))) ? 'Profile and account' : 'Profile, not signed in';
  await I.click(I.byLabel(icon));
  await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 700);
  await I.waitBody('POWER FEATURES', 8000);
  await I.click(`document.querySelector('[data-theme-setting] [data-theme-mode="dark"]')`, 900);
  await I.click(I.byLabel('Back'), 900);
  await I.click(I.byLabel('Show Tasks'), 800).catch(() => {});
  await C.sleep(600);
  await pass('dark');

  // ---- the keys are in the help ----
  await away();
  await I.key('/', ['shift'], 700);
  const help = await I.js('document.body.innerText');
  check('the shortcut help lists undo and redo', /Undo the last task change/.test(help) && /Redo/.test(help));
  await I.key('Escape', [], 300);

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
