'use strict';
// @real-input: quiet
// Real touch check for 3.23.0, step 1, on the phone (390 x 844): the + beside the Tasks tab's add row opens a new
// task card (the task details sheet, empty, the title focused, "Save" at the top); nothing is stored until it has
// a title; closing it empty stores nothing. Step 2: the Tasks rows show the label's NAME on its own line, then the
// day and time on the next. Light and dark. BELIFIC_SHOTS: a folder for screenshots.
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
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  const write = (k, v) => fs.writeFileSync(path.join(dataDir, `${k}.kv`), JSON.stringify(v));
  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const tomorrow = new Date(today.getTime() + 86400000);
  const tkey = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
  write('belific_tasks', [T('b', 'Plain one'), T('a', 'Write the quarterly report for the whole team', { listKey: 'LG', projectKey: 'LB', dueDate: tkey, startTime: '09:30', durationMinutes: 90 })]);
  write('belific_lists', [{ key: 'LG', name: 'Games', sortOrder: 0, emoji: '🎮', createdAt: stamp, updatedAt: stamp }]);
  write('belific_projects', [{ key: 'LB', name: 'Quarterly planning and review', colorKey: 'sage', createdAt: stamp, updatedAt: stamp }]);
  const read = (k) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dataDir, `${k}.kv`), 'utf8'));
    } catch {
      return [];
    }
  };
  const titles = () => read('belific_tasks').map((t) => t.title);

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
  const tabEls = `[...document.querySelectorAll('a, [role="tab"], [role="button"], [role="link"]')].filter((e) => { const r = e.getBoundingClientRect(); return r.top > 760 && r.height > 20 && r.width > 40 && r.width < 200; })`;
  const tab = (name) => `${tabEls}.find((e) => e.textContent.replace(/[^ -~]/g, '').trim() === '${name}')`;
  const visible = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left >= -1 && r.left < innerWidth; })`;
  const typeText = async (t) => {
    await win.webContents.insertText(t);
    await C.sleep(300);
  };
  const sheetOpen = () => P.js(`!!document.querySelector('[data-task-details]')`);

  async function pass(mode) {
    await P.finger.tap(tab('Tasks'), 1200);
    const before = titles().length;
    const plus = await P.js(`(() => { const e = ${visible('[data-add-plus]')}; if (!e) return null; const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })()`);
    check(`${mode}: the add row has a + at least 44 pt`, !!plus && plus.w >= 44 && plus.h >= 44, JSON.stringify(plus));
    await P.finger.tap(visible('[data-add-plus]'), 1000);
    const o = await P.js(`(() => { const a = document.activeElement; const h = document.querySelector('[data-task-details]'); return { open: !!h, label: a && a.getAttribute('aria-label'), value: a && a.value, head: h ? h.innerText : '' }; })()`);
    check(`${mode}: the + opens the task sheet with an empty, focused title, "New task" and Save`, o.open && o.label === 'Task title' && o.value === '' && /New task/.test(o.head) && /Save/.test(o.head), JSON.stringify(o));
    check(`${mode}: no Delete button on a new card`, !(await P.js(`document.body.innerText.includes('Delete task')`)));
    await shot(`phone-p17-newcard-${mode}`);
    await P.finger.tap(visible('[aria-label="Save"]'), 900);
    check(`${mode}: Save with no title closes it and stores nothing`, !(await sheetOpen()) && titles().length === before, `${before} -> ${titles().length}`);
    await P.finger.tap(visible('[data-add-plus]'), 1000);
    await typeText(`Phone card ${mode}`);
    await P.js(`document.activeElement.blur()`);
    await C.sleep(700);
    check(`${mode}: leaving the title stores the task`, titles().includes(`Phone card ${mode}`), JSON.stringify(titles()));
    check(`${mode}: and the sheet now reads as an ordinary task (Done, Delete)`, (await P.js(`document.body.innerText.includes('Delete task')`)) && !!(await P.js(`!!${visible('[aria-label="Done"]')}`)));
    await P.finger.tap(visible('[aria-label="Done"]'), 900);
    check(`${mode}: it is one row`, titles().filter((t) => t === `Phone card ${mode}`).length === 1);
    await P.finger.tap(visible('input[aria-label^="Add to"]'), 300);
    await typeText(`Typed ${mode}`);
    await P.finger.tap(visible('[data-add-plus]'), 900);
    check(`${mode}: with a title typed, the + adds that task`, titles().includes(`Typed ${mode}`) && !(await sheetOpen()));

    // ---- step 2: the rows ----
    await P.js(`document.querySelector('[data-list-chip="LG"]').scrollIntoView({ inline: 'center', block: 'nearest' })`);
    await C.sleep(400);
    await P.finger.tap(visible('[data-list-chip="LG"]'), 900);
    const row = await P.js(`(() => { const body = [...document.querySelectorAll('[data-task-body]')].find((e) => e.innerText.includes('Write the quarterly')); if (!body) return null; const l = body.querySelector('[data-row-label]'); const w = body.querySelector('[data-row-when]'); const lt = l && l.lastElementChild; return { label: l ? l.innerText : null, when: w ? w.innerText : null, labTop: l && Math.round(l.getBoundingClientRect().top), whenTop: w && Math.round(w.getBoundingClientRect().top), labCut: lt ? lt.scrollWidth > lt.clientWidth + 1 : null }; })()`);
    check(`${mode}: the row names its label in words, not a dot`, !!row && /Quarterly planning and review/.test(row.label || '') && row.labCut === false, JSON.stringify(row));
    check(`${mode}: the day and time are on their own line under the label`, !!row && /9:30|09:30/.test(row.when || '') && row.whenTop > row.labTop, JSON.stringify(row));
    await shot(`phone-p17-rows-${mode}`);
    await P.js(`document.querySelector('[data-list-chip="dump"]').scrollIntoView({ inline: 'center', block: 'nearest' })`);
    await C.sleep(300);
    await P.finger.tap(visible('[data-list-chip="dump"]'), 700);
  }

  await pass('light');
  await P.finger.tap(tab('Today'), 900);
  await P.finger.tap(visible('[data-profile-avatar]'), 1200);
  await P.finger.tap(visible('[data-phone-theme] [data-seg="dark"]'), 900);
  if (await P.js(`!!(${visible('[aria-label="Back"]')})`)) await P.finger.tap(visible('[aria-label="Back"]'), 900);
  await pass('dark');

  app.exit(summary() === 0 ? 0 : 1);
}
