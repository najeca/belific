'use strict';
// Real touch check for 3.23.0, step 1, on the phone (390 x 844): the + beside the Tasks tab's add row opens a new
// task card (the task details sheet, empty, the title focused, "Save" at the top); nothing is stored until it has
// a title; closing it empty stores nothing. Light and dark. BELIFIC_SHOTS: a folder for screenshots.
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
  write('belific_tasks', [T('b', 'Plain one')]);
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
  }

  await pass('light');
  await P.finger.tap(tab('Today'), 900);
  await P.finger.tap(visible('[data-profile-avatar]'), 1200);
  await P.finger.tap(visible('[data-phone-theme] [data-seg="dark"]'), 900);
  if (await P.js(`!!(${visible('[aria-label="Back"]')})`)) await P.finger.tap(visible('[aria-label="Back"]'), 900);
  await pass('dark');

  app.exit(summary() === 0 ? 0 : 1);
}
