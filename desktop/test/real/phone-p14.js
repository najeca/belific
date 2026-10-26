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
  write('belific_tasks', [T('tea', 'Tea', '09:00', 20, { cutsBelow: true }), T('t1', 'Water the plants', '09:00', 5), T('t2', 'Text Mum', '09:10', 10, { projectKey: 'work', listKey: 'L1' }), T('free', 'Free task', '15:00', 30)]);
  write('belific_lists', [{ key: 'L1', name: 'Family', emoji: '🏠', sortOrder: 0, createdAt: stamp, updatedAt: stamp }]);
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

  // ======== 3.10.0: rows and details ========
  // t1 is ticked; t2 is back in the break. Show the Today list.
  const rowMeta = (title) => P.js(`(() => { const r = [...document.querySelectorAll('[data-today-row]')].find((e) => e.getAttribute('data-today-row') === '${title}'); if (!r) return null; const p = r.querySelector('[data-host-pill]'); const c = r.querySelector('[data-host-caption]'); return (p ? 'pill:' + p.innerText : '') + '|' + (c ? 'cap:' + c.innerText : ''); })()`);
  const todayChecks = async (theme) => {
    await P.finger.tap(tab('Today'), 1200);
    check(`${theme}: Today: the break's row shows "2 inside"`, (await rowMeta('Tea')) === 'pill:2 inside|', await rowMeta('Tea'));
    check(`${theme}: Today: a hosted task's row says "During Tea"`, (await rowMeta('Text Mum')) === '|cap:During Tea', await rowMeta('Text Mum'));
    check(`${theme}: Today: a task outside has neither`, (await rowMeta('Free task')) === '|', await rowMeta('Free task'));
    await shot(`phone-p14-today-${theme}`);
  };
  await todayChecks('light');
  // Tasks: a list with a dated task in it.
  await P.finger.tap(tab('Tasks'), 1200);
  await P.finger.tap(visible('[data-list-chip="L1"]'), 1000);
  const listCap = await P.js(`(() => { const r = [...document.querySelectorAll('[data-task-row]')].find((e) => e.getAttribute('data-task-row') === 'Text Mum'); const c = r && r.querySelector('[data-host-caption]'); return c ? c.innerText : null; })()`);
  check('Tasks: the row of a hosted task in a list says "During Tea"', listCap === 'During Tea', listCap);
  await shot('phone-p14-tasks-light');

  // The break's details: Inside this break, Move out with an Undo in the details.
  await P.finger.tap(tab('Calendar'), 1200);
  await openSheet();
  await P.finger.tap(visible('[data-hosted-sheet] [aria-label="Open Tea"]'), 1200);
  const inside = await P.js(`(document.querySelector('[data-inside-break]') || {}).innerText || ''`);
  check('the break\'s details list Inside this break: tick, title and Move out (44 pt)', /INSIDE THIS BREAK/.test(inside) && inside.includes('Text Mum') && inside.includes('Water the plants') && (await P.js(`[...document.querySelectorAll('[data-inside-tick], [data-inside-open], [data-inside-out]')].every((e) => e.getBoundingClientRect().height >= 44)`)), inside);
  await shot('phone-p14-break-details-light');
  await P.finger.tap(visible('[data-inside-out="task:t2"]'), 1500);
  check('Move out from the break\'s details', task('t2').startTime === '09:20', JSON.stringify(task('t2')));
  check('the details show an Undo', /Moved Text Mum out of Tea/.test(await P.js(`(document.querySelector('[data-details-undo]') || {}).innerText || ''`)));
  await P.finger.tap(visible('[data-details-undo] [aria-label="Undo"]'), 1500);
  check('Undo there puts it back', task('t2').startTime === '09:10', JSON.stringify(task('t2')));
  await P.finger.tap(visible('[data-inside-open="task:t2"]'), 1200);
  check('a row\'s title opens that task, which says "During: Tea" with Move out', /During: Tea/.test(await P.js(`(document.querySelector('[data-during-break]') || {}).innerText || ''`)) && (await P.js(`!!document.querySelector('[data-during-out]')`)));
  await shot('phone-p14-hosted-details-light');
  await close();

  // Dark.
  await P.finger.tap(tab('Today'), 900);
  await P.finger.tap(visible('[data-profile-avatar]'), 1200);
  await P.finger.tap(visible('[data-phone-theme] [data-seg="dark"]'), 900);
  if (await P.js(`!!(${visible('[aria-label="Back"]')})`)) await P.finger.tap(visible('[aria-label="Back"]'), 900);
  await todayChecks('dark');
  const pill = await P.js(`(() => { const p = document.querySelector('[data-host-pill]'); return getComputedStyle(p).backgroundColor; })()`);
  check('dark: the pill uses its dark token', pill === 'rgb(44, 58, 49)', pill);
  await P.finger.tap(tab('Calendar'), 1200);
  await openSheet();
  await P.finger.tap(visible('[data-hosted-sheet] [aria-label="Open Tea"]'), 1200);
  await shot('phone-p14-break-details-dark');
  await close();

  // ======== 3.11.0: refuse (dark is on) ========
  await P.finger.tap(tab('Calendar'), 1200);
  // The quick add: a tap just under the tea break is the 09:15 slot, inside it; 30 minutes do not fit.
  await scrollToHour(8);
  await C.sleep(400);
  const slot = await P.point(`document.querySelector('[data-empty-slots]')`);
  await P.finger.tapAt(slot.left + slot.w * 0.7, slot.top + 9.38 * 56, 900);
  check('a tap just under the break opens the quick add at 9:15am', /9:15am/.test(await P.js(`(document.querySelector('[data-quick-add]') || {}).getAttribute?.('data-quick-add') || ''`)));
  await P.finger.tap(visible('[data-quick-add] [aria-label="New task title"]'), 300);
  await win.webContents.insertText('Snack');
  await C.sleep(300);
  const typed = await P.js(`(document.querySelector('[data-quick-add] [aria-label="New task title"]') || {}).value || ''`);
  const n0 = read('belific_tasks').length;
  await P.finger.tap(visible('[data-quick-add] [aria-label="Add task"]'), 1000);
  const qn = await P.js(`(document.querySelector('[data-quick-add-note]') || {}).innerText || ''`);
  check('the quick add refuses it: "Longer than the break (20 min)", nothing stored', qn === 'Longer than the break (20 min)' && read('belific_tasks').length === n0, `typed "${typed}", note "${qn}"`);
  await shot('phone-p14-refused-quick-add-dark');
  await P.finger.tap(visible('[data-quick-add] [aria-label="Cancel adding"]'), 700);

  // The details: a hosted task given a length that sticks out of the break.
  await openSheet();
  await P.finger.tap(visible('[data-hosted-open="task:t2"]'), 1200);
  await P.finger.tap(visible('[aria-label^="Length,"]'), 700);
  await P.finger.tap(visible('[aria-label="Length 15 min"]'), 1000);
  check('the details refuse it: "Longer than the break. Shorten it or move it out."', (await P.js(`(document.querySelector('[data-break-note]') || {}).innerText || ''`)) === 'Longer than the break. Shorten it or move it out.' && task('t2').durationMinutes === 10, JSON.stringify(task('t2')));
  await shot('phone-p14-refused-details-dark');
  await close();

  // A hold-drag of a longer task onto the break.
  await scrollToHour(8.5);
  await C.sleep(400);
  // About 5 h 50 min up: the start lands on 09:15 (15 minute steps), inside the 09:00 to 09:20 break.
  await P.finger.holdDrag(visible('[data-block-tap="task:free"]'), 0, -320, 520, 700, 1000);
  const bar2 = await P.js(`(document.querySelector('[data-undo-bar]') || {}).innerText || ''`);
  check('a hold-drag of a 30 minute task onto the 20 minute break is refused and it stays', /Longer than the break \(20 min\)/.test(bar2) && task('free').startTime === '15:00', bar2 + ' ' + JSON.stringify(task('free')));

  // Shrinking the break is allowed: the task that no longer fits leaves it, and a note says so.
  await openSheet();
  await P.finger.tap(visible('[data-hosted-sheet] [aria-label="Open Tea"]'), 1200);
  await P.finger.tap(visible('[aria-label^="Length,"]'), 700);
  await P.finger.tap(visible('[aria-label="Length 10 min"]'), 1000);
  check('the break is 10 minutes now', task('tea').durationMinutes === 10, JSON.stringify(task('tea')));
  await close();
  await C.sleep(400);
  const bar3 = await P.js(`(document.querySelector('[data-undo-bar]') || {}).innerText || ''`);
  check('"1 task no longer fits and moved out of the break"', bar3.includes('1 task no longer fits and moved out of the break'), bar3);
  const ids = await P.js(`[...document.querySelectorAll('[data-phone-block]')].map((e) => e.getAttribute('data-phone-block'))`);
  check('that task is a block again; the one that still fits stays inside', ids.includes('task:t2') && !ids.includes('task:t1'), JSON.stringify(ids));
  await shot('phone-p14-shrunk-dark');

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
