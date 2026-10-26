'use strict';
// Real touch check for 3.9.0 to 3.11.0 on the phone at 390 x 844: a task during a break, follow up.
//  3.9.0: the break's sheet has, per task, Tick, Open (its title) and "Move out" (right after the
//         break, with Undo for 5 seconds); Undo puts it back.
// BELIFIC_SHOTS: a folder for screenshots.
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
  const T = (id, title, start, len, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, dueDate: today, startTime: start, durationMinutes: len, ...extra });
  const write = (k, v) => fs.writeFileSync(path.join(dataDir, `${k}.kv`), JSON.stringify(v));
  write('belific_tasks', [T('tea', 'Tea', '09:00', 20, { cutsBelow: true }), T('t1', 'Water the plants', '09:00', 5), T('t2', 'Text Mum', '09:10', 10, { projectKey: 'work' })]);
  write('belific_projects', [{ key: 'work', name: 'Work', colorKey: 'sky', createdAt: stamp, updatedAt: stamp }]);
  const read = (k) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dataDir, `${k}.kv`), 'utf8'));
    } catch {
      return [];
    }
  };
  const task = (id) => read('belific_tasks').find((t) => t.id === id);

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
  const visible = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].reverse().find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left >= -1 && r.left < innerWidth && r.top < innerHeight && r.bottom > 0; })`;
  const scrollToHour = (hour) =>
    P.js(`(() => { let e = document.querySelector('[data-empty-slots]'); while (e && !(e.scrollHeight > e.clientHeight + 4 && ['auto', 'scroll'].includes(getComputedStyle(e).overflowY))) e = e.parentElement; if (e) e.scrollTop = ${hour} * 56; return !!e; })()`);
  const sheetText = () => P.js(`(document.querySelector('[data-hosted-sheet]') || {}).innerText || ''`);
  const openSheet = async () => {
    await scrollToHour(8);
    await C.sleep(400);
    await P.finger.tap(visible('[data-block-tap="task:tea"]'), 1000);
  };
  const close = async () => {
    if (await P.js(`!!(${visible('[aria-label="Done"]')})`)) await P.finger.tap(visible('[aria-label="Done"]'), 900);
  };

  await P.finger.tap(tab('Calendar'), 1200);
  await openSheet();
  const s1 = await sheetText();
  check('the sheet lists each task with Move out, and Open Tea', s1.includes('Water the plants') && s1.includes('Text Mum') && (s1.match(/Move out/g) || []).length === 2 && s1.includes('Open Tea'), s1);
  check('each row has a tick, its title (Open) and Move out, 44 pt each', await P.js(`[...document.querySelectorAll('[data-hosted-tick], [data-hosted-open], [data-hosted-out]')].every((e) => { const r = e.getBoundingClientRect(); return r.height >= 44 && r.width >= 44; })`));
  await shot('phone-p14-sheet');
  await P.finger.tap(visible('[data-hosted-tick="task:t1"]'), 1200);
  check('Tick ticks that task', task('t1').completed === true && !task('tea').completed, JSON.stringify(task('t1')));
  await openSheet();
  await P.finger.tap(visible('[data-hosted-out="task:t2"]'), 1500);
  check('Move out: right after the break, same day and length', task('t2').startTime === '09:20' && task('t2').dueDate === today && task('t2').durationMinutes === 10, JSON.stringify(task('t2')));
  const bar = await P.js(`(document.querySelector('[data-undo-bar]') || {}).innerText || ''`);
  check('an Undo message says so', /Moved Text Mum out of Tea/.test(bar) && /Undo/.test(bar), bar);
  await shot('phone-p14-moved-out');
  await P.finger.tap(visible('[data-undo-bar] [aria-label="Undo"]'), 1500);
  check('Undo puts it back in the break', task('t2').startTime === '09:10', JSON.stringify(task('t2')));
  await openSheet();
  await P.finger.tap(visible('[data-hosted-open="task:t2"]'), 1200);
  const v = await P.js(`[...document.querySelectorAll('input, textarea')].filter((e) => e.getBoundingClientRect().height > 0).map((e) => e.value).join('|') + (document.body.innerText || '')`);
  check('Open (the title) opens the task', v.includes('Text Mum'), v.slice(0, 120));
  await close();

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
