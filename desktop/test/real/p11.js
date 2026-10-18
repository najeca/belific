'use strict';
// Real check for the 2.27.1 fix batch: real mouse, key and text input into the
// real app, on an isolated data folder asserted NOT to be the real one; Supabase
// is the in process fake (signed out, nothing leaves the machine). One section
// per item of the batch.
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
  const today = day(0);
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      T('t1', 'Modal task', { dueDate: today, durationMinutes: 30, projectKey: 'pw', listKey: 'lg', notes: 'A note', subtasks: [{ id: 's1', title: 'First', done: false }, { id: 's2', title: 'Second', done: true }] }),
      T('t2', 'Plain task', { dueDate: today }),
      T('t3', 'Placed task', { dueDate: today, startTime: '10:00', durationMinutes: 60, projectKey: 'pw', listKey: 'lg' }),
      T('t4', 'No emoji list', { dueDate: today, listKey: 'ln', projectKey: 'ph' }),
      T('t5', 'Brain item', { listKey: 'lg', projectKey: 'pw' }),
    ]),
  );
  // Nine labels: every one of the original eight is taken (item 4's case).
  const P = (key, name, colorKey, extra = {}) => ({ key, name, colorKey, createdAt: stamp, updatedAt: stamp, ...extra });
  fs.writeFileSync(
    path.join(dataDir, 'belific_projects.kv'),
    JSON.stringify([
      P('pw', 'Work', 'sage', { emoji: '💼' }),
      P('ph', 'Home', 'clay'),
      P('p3', 'Sky one', 'sky'),
      P('p4', 'Sand one', 'sand'),
      P('p5', 'Plum one', 'plum'),
      P('p6', 'Moss one', 'moss'),
      P('p7', 'Rose one', 'rose'),
      P('p8', 'Slate one', 'slate'),
      P('p9', 'Old teal', 'teal'),
    ]),
  );
  fs.writeFileSync(
    path.join(dataDir, 'belific_lists.kv'),
    JSON.stringify([
      { key: 'lg', name: 'Games', emoji: '🎲', sortOrder: 0, createdAt: stamp, updatedAt: stamp },
      { key: 'ln', name: 'Plain list', sortOrder: 1, createdAt: stamp, updatedAt: stamp },
    ]),
  );

  const read = readKv(dataDir);
  const tasks = () => read('belific_tasks') || [];
  const byId = (id) => tasks().find((t) => t.id === id);
  const projects = () => read('belific_projects') || [];
  const labelNamed = (n) => projects().find((p) => p.name === n && !p.deletedAt);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1440, 900);
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await I.waitBody('Modal task', 20000);
  await C.sleep(1000);

  const card = (key, title) => `document.querySelector('[data-day-col="${key}"] [aria-label^="Task ${title}"]')`;
  const panel = `document.querySelector('[data-detail-panel]')`;
  const modalOpen = () => I.exists(panel);
  const openModal = async (title) => {
    await I.click(`${card(today, title)}.querySelector('[aria-label="Title ${title}"]')`, 600);
    await C.waitFor(() => modalOpen(), 4000).catch(() => {});
  };
  const closeModal = async () => {
    await I.blur();
    await I.key('Escape');
    await C.waitFor(async () => !(await modalOpen()), 3000).catch(() => {});
  };

  // ======== 1. A compact details modal, no lines ========
  await openModal('Modal task');
  const rows = await I.js(`[...${panel}.querySelectorAll('[data-detail-row]')].map((r) => { const s = getComputedStyle(r); const b = r.getBoundingClientRect(); return { name: r.dataset.detailRow, h: Math.round(b.height), lines: parseFloat(s.borderTopWidth) + parseFloat(s.borderBottomWidth) }; })`);
  check('1: the rows keep their order', rows.slice(0, 6).map((r) => r.name).join('|') === 'Task date|Estimated time|Actual time|Label|Must do|Repeats', JSON.stringify(rows.map((r) => r.name)));
  check('1: every row is one compact line (at most 36 px)', rows.length >= 7 && rows.filter((r) => r.name !== 'Estimated time').every((r) => r.h <= 36), JSON.stringify(rows));
  check('1: no row has a divider line', rows.every((r) => r.lines === 0), JSON.stringify(rows));
  const lined = await I.js(`[...${panel}.querySelectorAll('*')].filter((e) => { if (e.tagName === 'INPUT' || e.tagName === 'SELECT' || e.tagName === 'TEXTAREA') return false; const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return r.width > 120 && ((parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none' && s.borderTopColor !== 'rgba(0, 0, 0, 0)') || (parseFloat(s.borderBottomWidth) > 0 && s.borderBottomStyle !== 'none' && s.borderBottomColor !== 'rgba(0, 0, 0, 0)')); }).length`);
  check('1: nothing wide in the modal draws a line', lined === 0, String(lined));
  const label = await I.js(`(() => { const r = ${panel}.querySelector('[data-detail-row="Label"]'); const n = r.firstElementChild.getBoundingClientRect(); const v = r.lastElementChild.getBoundingClientRect(); return { sameLine: Math.abs((n.top + n.height / 2) - (v.top + v.height / 2)) < 6, nameLeft: n.right <= v.left }; })()`);
  check('1: the name is on the left and the value on the right, on the same line', label.sameLine && label.nameLeft, JSON.stringify(label));
  const tall = await I.js(`Math.round(${panel}.getBoundingClientRect().height)`);
  check('1: the whole modal is short (under 640 px with notes and two subtasks)', tall < 640, String(tall));
  await I.shot('p11-01-modal');
  await closeModal();
  // A card has no line inside it (only the label's colour edge on the left).
  const cardLines = await I.js(`(() => { const c = ${card(today, 'Modal task')}; const all = [c, ...c.querySelectorAll('*')]; return all.filter((e) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return r.width > 60 && ['Top', 'Bottom', 'Right'].some((k) => parseFloat(s['border' + k + 'Width']) > 0 && s['border' + k + 'Style'] !== 'none'); }).length; })()`);
  check('1: a card has no lines separating its parts', cardLines === 0, String(cardLines));
  // A short window: nothing is cut off, the modal scrolls inside itself.
  win.setSize(1100, 480);
  await C.sleep(600);
  await openModal('Modal task');
  const fit = await I.js(`(() => { const p = ${panel}; const r = p.getBoundingClientRect(); const sc = [...p.querySelectorAll('div')].find((d) => d.scrollHeight > d.clientHeight + 4 && getComputedStyle(d).overflowY !== 'visible'); return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, scrolls: !!sc }; })()`);
  check('1: in a short window the modal fits and scrolls inside itself', fit.top >= 0 && fit.bottom <= fit.vh && fit.scrolls, JSON.stringify(fit));
  await I.js(`(() => { const p = ${panel}; const sc = [...p.querySelectorAll('div')].find((d) => d.scrollHeight > d.clientHeight + 4 && getComputedStyle(d).overflowY !== 'visible'); if (sc) sc.scrollTop = sc.scrollHeight; })()`);
  await C.sleep(300);
  const lastSeen = await I.js(`(() => { const el = ${panel}.querySelector('[aria-label="Add subtask to Modal task"]'); const r = el.getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0; })()`);
  check('1: the last field (Add subtask) can be scrolled into view', lastSeen);
  await closeModal();
  win.setSize(1440, 900);
  await C.sleep(600);

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
