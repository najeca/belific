'use strict';
// @real-input: quiet
// Real touch check for R6 of PLAN_repeat_end_and_parts (3.52.0): Repeat until and Parts on the phone at 390 x 844, in the
// desktop's wording.
//   - Tasks tab: "Upper day" has two parts: its row reads "0 of 2 done" with a bar and two part rows (never rows of their
//     own); a tick in the row works in place, stored at once; 44 pt targets, text 14 px or more, nothing red;
//   - the details: a Parts section with a visible "Add part" button and a box (type, Enter, the box stays for the next); the
//     old "Add a step" is gone for a task with no steps; a task with steps keeps them under "Checklist" with "Turn into
//     parts" (one tap, the same names and ticks);
//   - a part opens with "Part of Upper day" and no Date or Time; "Take out of Upper day" makes it an ordinary task;
//   - Delete on a task with parts asks "Delete the task only" or "Delete the task and its 2 parts";
//   - the details of a repeating day have "Repeat until" ("No end"): a day on or after the start is written on every row, the
//     repeat line reads "..., until ...", a day before the start is refused with a quiet line, Clear brings the days back;
//   - Today: a repeating day's parts are rows under it and reset each day (a tick is that day's row).
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
  const today = day(0);
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  const write = (k, v) => fs.writeFileSync(path.join(dataDir, `${k}.kv`), JSON.stringify(v));
  write('belific_tasks', [
    T('up', 'Upper day', { listKey: 'L1' }),
    T('bench', 'Bench press', { parentId: 'up', listKey: 'L1', durationMinutes: 20, createdAt: '2026-09-01T07:00:01.000Z' }),
    T('sh', 'Shoulders', { parentId: 'up', listKey: 'L1', createdAt: '2026-09-01T07:00:02.000Z' }),
    T('leg', 'Leg day', { listKey: 'L1', subtasks: [{ id: 's1', title: 'Squats', done: true }, { id: 's2', title: 'Lunges', done: false }] }),
    T('walk', 'Morning walk', { dueDate: day(-3), startTime: '07:00', recurrence: 'daily' }),
    T('stretch', 'Stretch', { parentId: 'walk', createdAt: '2026-09-01T07:00:01.000Z' }),
    T('bend', 'Bend', { parentId: 'walk', createdAt: '2026-09-01T07:00:02.000Z' }),
    T('flat', 'Plain one', { listKey: 'L1' }),
  ]);
  write('belific_lists', [{ key: 'L1', name: 'Gym', emoji: '🏋️', sortOrder: 0, createdAt: stamp, updatedAt: stamp }]);
  const read = (k) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dataDir, `${k}.kv`), 'utf8'));
    } catch {
      return [];
    }
  };
  const all = () => read('belific_tasks');
  const live = () => all().filter((t) => !t.deletedAt);
  const task = (id) => all().find((t) => t.id === id);

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
  const inSheet = (sel) => `(() => { const root = document.querySelector('[data-task-details]'); const sheet = root && root.parentElement; return sheet ? [...sheet.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.getBoundingClientRect().height > 0) : null; })()`;
  const scrollTo = (sel) => P.js(`(() => { const e = ${inSheet(sel)}; if (e) e.scrollIntoView({ block: 'center' }); return !!e; })()`);
  const tapIn = async (sel, wait = 700) => {
    await scrollTo(sel);
    await C.sleep(250);
    await P.finger.tap(inSheet(sel), wait);
  };
  const typeText = async (t) => {
    await win.webContents.insertText(t);
    await C.sleep(250);
  };
  const enter = async () => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
    win.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
    await C.sleep(900);
  };
  const focusIn = async (sel) => {
    await scrollTo(sel);
    await P.js(`(() => { const e = ${inSheet(sel)}; e.focus(); })()`);
  };
  const blur = () => P.js('document.activeElement && document.activeElement.blur()');
  const menuTap = (label) => P.finger.tap(`[...document.querySelectorAll('[data-action-menu] [aria-label=${JSON.stringify(label)}]')].pop()`, 900);
  const sheetText = () => P.js(`(() => { const r = document.querySelector('[data-task-details]'); return r && r.parentElement ? r.parentElement.innerText : ''; })()`);
  const notRed = (sel) =>
    P.js(`![...document.querySelectorAll(${JSON.stringify(sel)})].some((root) => [root, ...root.querySelectorAll('*')].some((e) => { const s = getComputedStyle(e); return [s.color, s.backgroundColor].some((c) => { const m = /rgba?\\((\\d+), (\\d+), (\\d+)/.exec(c); return m && +m[1] > 180 && +m[2] < 110 && +m[3] < 110; }); }))`);
  const minFont = (sel) => P.js(`Math.min(...[...document.querySelectorAll(${JSON.stringify(sel)})].flatMap((root) => [...root.querySelectorAll('*')]).filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).map((e) => parseFloat(getComputedStyle(e).fontSize)))`);
  const gridDay = async (wanted) => {
    for (const k of wanted) if (await P.js(`!!${inSheet(`[data-day="${k}"]`)}`)) return k;
    await tapIn('[aria-label="Next month"]');
    return wanted[0];
  };

  // ---- Tasks tab: parts are rows under their task ----
  await P.finger.tap(tab('Tasks'), 1000);
  await P.finger.tap(visible('[data-list-chip="L1"]'), 900);
  const rowText = (title) => P.js(`(() => { const r = document.querySelector('[data-task-row="${title}"]'); return r ? r.innerText.replace(/\\s+/g, ' ') : null; })()`);
  const up = await rowText('Upper day');
  const upParts = await P.js(`(() => { const r = document.querySelector('[data-card-parts="Upper day"]'); return r ? r.innerText.split(/\\s+/).join(' ') : null; })()`);
  check('"Upper day" reads "0 of 2 done" with its two parts as rows under it', !!up && up.includes('0 of 2 done') && !!upParts && upParts.includes('Bench press') && upParts.includes('Shoulders'), `${up} | ${upParts}`);
  check('the parts are not rows of their own', (await P.js(`document.querySelectorAll('[data-task-row="Bench press"]').length`)) === 0);
  check('the part rows are 44 pt, text 14 px or more, nothing red', (await P.js(`(() => { const r = document.querySelector('[data-card-part="Bench press"]'); return r ? r.getBoundingClientRect().height : 0; })()`)) >= 44 && (await minFont('[data-card-parts="Upper day"]')) >= 14 && (await notRed('[data-card-parts="Upper day"]')));
  await shot('phone-p18-list');
  await P.finger.tap(`[...document.querySelectorAll('[data-part-tick="Bench press"]')][0]`, 1400);
  check('a tick in the row works in place: Bench press done, "1 of 2 done", stored at once', task('bench').completed === true && !task('up').completed && ((await rowText('Upper day')) || '').includes('1 of 2 done'), JSON.stringify(task('bench')));
  await P.finger.tap(`[...document.querySelectorAll('[data-part-tick="Bench press"]')][0]`, 1400);
  check('and unticks', task('bench').completed === false);

  // ---- the details: Parts ----
  await P.finger.tap(`[...document.querySelectorAll('[data-task-row="Upper day"] [data-task-body]')][0]`, 1200);
  check('a tap opens the details of Upper day', await P.js(`!!document.querySelector('[data-task-details="up"]')`));
  check('Parts with a visible "Add part" button, and no "Add a step"', (await P.js(`!!${inSheet('[data-add-part]')}`)) && !(await P.js(`!!${inSheet('[aria-label="Add a step"]')}`)));
  check('the Parts heading reads "Parts  0 of 2 done"; text 14 px or more; nothing red', ((await sheetText()).replace(/\s+/g, ' ')).toLowerCase().includes('parts 0 of 2 done') && (await P.js(`!!${inSheet('[data-parts-bar="0/2"]')}`)));
  await focusIn('[data-part-input]');
  await typeText('Back');
  await enter();
  await typeText('Core');
  await enter();
  const partsNow = live().filter((t) => t.parentId === 'up');
  check('Enter adds each part and the box stays ready for the next: Back and Core, the parent\'s id, no Day', partsNow.map((p) => p.title).join() === 'Bench press,Shoulders,Back,Core' && partsNow.every((p) => !p.dueDate), JSON.stringify(partsNow.map((p) => p.title)));
  await shot('phone-p18-details');
  await blur();

  // ---- a part opens with "Part of" ----
  await tapIn('[data-part-open="Back"]', 1200);
  const partSheet = (await sheetText()).replace(/\s+/g, ' ');
  check('a part opens with "Part of Upper day", and no Date or Time row', partSheet.includes('Part of Upper day') && !(await P.js(`!!${inSheet('[data-detail-row="date"]')}`)) && !(await P.js(`!!${inSheet('[data-detail-row="time"]')}`)) && (await P.js(`!!${inSheet('[data-detail-row="duration"]')}`)), partSheet.slice(0, 160));
  await tapIn('[data-take-out]', 1200);
  check('"Take out of Upper day" makes it an ordinary task in the list', !task(partsNow[2].id).parentId, JSON.stringify(task(partsNow[2].id)));
  await C.sleep(600);

  // ---- steps into parts ----
  await P.finger.tap(`[...document.querySelectorAll('[data-task-row="Leg day"] [data-task-body]')][0]`, 1200);
  check('a task with steps keeps them under "Checklist" with "Turn into parts"', ((await sheetText()).replace(/\s+/g, ' ')).toLowerCase().includes('checklist') && (await P.js(`!!${inSheet('[aria-label="Turn into parts"]')}`)));
  await tapIn('[aria-label="Turn into parts"]', 1200);
  const legParts = live().filter((t) => t.parentId === 'leg');
  check('Turn into parts: two parts with the same names and ticks, the checklist emptied', legParts.map((p) => `${p.title}:${p.completed}`).join() === 'Squats:true,Lunges:false' && !(task('leg').subtasks || []).length, JSON.stringify(legParts));

  // ---- Delete with parts ----
  await tapIn('[aria-label="Delete task"]', 900);
  const menuText = await P.js(`(document.querySelector('[data-action-menu]') || {}).innerText || ''`);
  check('Delete asks "Delete the task only" or "Delete the task and its 2 parts"', menuText.includes('Delete the task only') && menuText.includes('Delete the task and its 2 parts'), menuText);
  await menuTap('Delete the task only');
  check('"Delete the task only": Leg day to the Trash, its parts ordinary tasks', !!task('leg').deletedAt && legParts.every((p) => !task(p.id).parentId && !task(p.id).deletedAt));

  // ---- Repeat until, and a repeating parent's parts, from Today ----
  await P.finger.tap(tab('Today'), 1200);
  const walk = await P.js(`(() => { const r = document.querySelector('[data-today-row="Morning walk"]'); return r ? r.innerText.replace(/\\s+/g, ' ') : null; })()`);
  check('Today: Morning walk (a repeating day) shows its part "Stretch" as a row, "0 of 2 done"', !!walk && walk.includes('0 of 2 done') && walk.includes('Stretch'), String(walk));
  await P.finger.tap(`[...document.querySelectorAll('[data-part-tick="Stretch"]')][0]`, 1500);
  const dayRow = task(`stretch:${today}`);
  check('a tick stores that day\'s row only; the part itself stays open', !!dayRow && dayRow.completed === true && dayRow.parentId === 'walk' && !task('stretch').completed && !task(`walk:${today}`), JSON.stringify(dayRow));
  await P.finger.tap(`[...document.querySelectorAll('[data-today-row="Morning walk"] [data-today-body]')][0]`, 700);
  await P.finger.tap(`[...document.querySelectorAll('[data-today-expanded] [aria-label="Edit Morning walk"]')][0]`, 1200).catch(() => {});
  check('Edit opens the details of the repeating day', await P.js(`!!document.querySelector('[data-task-details]')`));
  check('"Repeat until" shows "No end"', ((await P.js(`(${inSheet('[data-detail-row="until"]')} || {}).innerText || ''`)) || '').includes('No end'));
  await tapIn('[data-detail-row="until"]');
  check('the picker says what the date means, in plain words', (await sheetText()).includes('The last day it happens. Later days are hidden, not deleted.'));
  const before = day(-5);
  const later = await gridDay([day(6), day(5), day(7), day(8)]);
  await tapIn(`[data-day="${later}"]`, 1200);
  const walkRows = all().filter((t) => t.id === 'walk' || t.id.startsWith('walk:'));
  check('a day on or after the start is written on every row of the series', walkRows.length >= 1 && walkRows.every((t) => t.repeatUntil === later), JSON.stringify(walkRows.map((t) => [t.id, t.repeatUntil])));
  check('the Repeat row now says "... until ..."', ((await P.js(`(${inSheet('[data-detail-row="repeat"]')} || {}).innerText || ''`)) || '').includes('until'));
  await tapIn('[data-detail-row="until"]');
  await tapIn('[aria-label="Clear the end date"]', 1200);
  check('Clear brings the days back: no end on any row', all().filter((t) => t.id === 'walk' || t.id.startsWith('walk:')).every((t) => !t.repeatUntil));
  void before;
  await P.finger.tap(visible('[aria-label="Done"]'), 900);

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
