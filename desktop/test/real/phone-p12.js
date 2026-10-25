'use strict';
// Real touch check for 3.2.0 to 3.4.0 on the phone at 390 x 844: one day of a repeating task, this day only.
//  3.2.0: the details' date sheet moves a day of a repeating task through seriesActions.moveDay: a
//         projected day is stored on the new Day (the series unchanged), the series' first row has its day
//         skipped and a moved copy stored; the sheet says only this day moves and has no "No date".
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
    // A daily series that started a week ago: today is projected.
    T('walk', 'Morning walk', { dueDate: day(-7), startTime: '07:00', durationMinutes: 30, recurrence: 'daily', completed: true, completedAt: stamp }),
    // A new series whose only row is its first row, today.
    T('first', 'First class', { dueDate: today, startTime: '18:00', durationMinutes: 60, recurrence: 'daily' }),
  ]);
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
  const inSheet = (sel) => `(() => { const root = document.querySelector('[data-task-details]'); const sheet = root && root.parentElement; return sheet ? [...sheet.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.getBoundingClientRect().height > 0) : null; })()`;
  const sheetText = () => P.js(`(document.querySelector('[data-task-details]') || {}).parentElement?.innerText || ''`);
  const scrollTo = (sel) => P.js(`(() => { const e = ${inSheet(sel)}; if (e) e.scrollIntoView({ block: 'center' }); return !!e; })()`);
  const tapIn = async (sel, wait = 700) => {
    await scrollTo(sel);
    await C.sleep(250);
    await P.finger.tap(inSheet(sel), wait);
  };
  const openFromToday = async (title) => {
    await P.finger.tap(`[...document.querySelectorAll('[data-today-row="${title}"] [data-today-body]')][0]`, 700);
    await P.finger.tap(`[...document.querySelectorAll('[data-today-expanded] [aria-label="Edit ${title}"]')][0]`, 1200);
  };
  const todayRows = (title) => P.js(`document.querySelectorAll('[data-today-row="${title}"]').length`);

  // ======== 3.2.0: a projected day ========
  await P.finger.tap(tab('Today'), 1200);
  check('today shows the projected walk', (await todayRows('Morning walk')) === 1);
  await openFromToday('Morning walk');
  await tapIn('[data-detail-row="date"]');
  const sheet = await sheetText();
  check('the date sheet of a repeating day says only this day moves', sheet.includes('Only this day moves'), sheet.slice(0, 400));
  check('and has no "No date" (a day of a series keeps a Day)', !(await P.js(`!!${inSheet('[aria-label="No date"]')}`)));
  await shot('phone-p12-date-sheet');
  await tapIn(`[data-day="${day(2)}"]`);
  await C.sleep(500);
  const moved = task(`walk:${today}`);
  check('the day is stored with its own id on the new Day, keeping its rule', !!moved && moved.dueDate === day(2) && moved.recurrence === 'daily' && !moved.deletedAt, JSON.stringify(moved));
  check('the series is unchanged', task('walk').dueDate === day(-7) && task('walk').startTime === '07:00' && read('belific_tasks').filter((t) => t.id.startsWith('walk')).length === 2);
  await P.finger.tap(visible('[aria-label="Done"]'), 900);
  check('today no longer shows the walk (it moved away)', (await todayRows('Morning walk')) === 0);

  // ======== 3.2.0: the series' first row ========
  check('today shows the first class (its first row)', (await todayRows('First class')) === 1);
  await openFromToday('First class');
  await tapIn('[data-detail-row="date"]');
  await tapIn('[aria-label="Tomorrow"]');
  await C.sleep(500);
  const root = task('first');
  const copy = task(`first:${today}`);
  check('the first row is tombstoned with its rule (its day skipped)', !!root && !!root.deletedAt && root.recurrence === 'daily', JSON.stringify(root));
  check('its day is stored as a moved copy on tomorrow', !!copy && copy.dueDate === day(1) && copy.recurrence === 'daily' && copy.startTime === '18:00' && !copy.deletedAt, JSON.stringify(copy));
  check('the sheet now shows the moved copy (its date is tomorrow)', /Tomorrow/.test(await P.js(`(${inSheet('[data-detail-row="date"]')} || {}).innerText || ''`)));
  await P.finger.tap(visible('[aria-label="Done"]'), 900);
  check('today does not show the first class again (problem A)', (await todayRows('First class')) === 0);

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
