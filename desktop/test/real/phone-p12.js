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

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
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
    // 3.3.0: tomorrow's yoga already moved onto today, in the Health list.
    T('yoga', 'Yoga', { dueDate: day(-6), recurrence: 'weekly', recurrenceDays: [WD[new Date(`${day(1)}T12:00:00`).getDay()]], completed: true, completedAt: stamp, listKey: 'L1' }),
    T(`yoga:${day(1)}`, 'Yoga', { dueDate: today, startTime: '08:00', durationMinutes: 45, recurrence: 'weekly', recurrenceDays: [WD[new Date(`${day(1)}T12:00:00`).getDay()]], listKey: 'L1' }),
  ]);
  write('belific_lists', [{ key: 'L1', name: 'Health', emoji: '💪', sortOrder: 0, createdAt: stamp, updatedAt: stamp }]);
  // 3.4.0: a daily swim at 06:00; today's is projected.
  const seeded = JSON.parse(fs.readFileSync(path.join(dataDir, 'belific_tasks.kv'), 'utf8'));
  write('belific_tasks', [...seeded, T('swim', 'Swim', { dueDate: day(-7), startTime: '06:00', durationMinutes: 30, recurrence: 'daily', completed: true, completedAt: stamp })]);
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

  // ======== 3.3.0: moved days say where they came from ========
  const fromName = WD[new Date(`${day(1)}T12:00:00`).getDay()];
  const rowMoved = (sel) => P.js(`(() => { const r = document.querySelector('${sel}'); const m = r && r.querySelector('[data-moved-from]'); return m ? { text: m.innerText, from: m.getAttribute('data-moved-from') } : null; })()`);
  const todayYoga = await rowMoved('[data-today-row="Yoga"]');
  check('Today: the moved yoga row says "Moved from <its day>"', !!todayYoga && todayYoga.text.includes(`Moved from ${fromName}`) && todayYoga.from === day(1), JSON.stringify(todayYoga));
  check('Today: a row that was not moved has no caption', !(await P.js(`!!document.querySelector('[data-today-row] [data-moved-from]:not([data-moved-from="${day(1)}"])')`)));
  await shot('phone-p12-today-moved');
  await openFromToday('Yoga');
  const detail = await P.js(`(${inSheet('[data-detail-moved]')} || {}).innerText || ''`);
  check('the details say where it came from, this day only', detail.includes(`Moved from ${fromName}`) && /this day only/.test(detail), detail);
  await shot('phone-p12-details-moved');
  await P.finger.tap(visible('[aria-label="Done"]'), 900);
  await P.finger.tap(tab('Tasks'), 1000);
  await P.finger.tap(visible('[data-list-chip="L1"]'), 900);
  const tasksYoga = await rowMoved('[data-task-row="Yoga"]');
  check('Tasks: the moved row in its list says where it came from', !!tasksYoga && tasksYoga.text.includes(`Moved from ${fromName}`), JSON.stringify(tasksYoga));
  await shot('phone-p12-tasks-moved');

  // ======== 3.20.0: a new time in the details goes to every repeat day, with no question ========
  const setTime = async (hhmm) => {
    // The Time row opens and closes its field: tap it only while the field is closed.
    if (!(await P.js(`!!${inSheet('[aria-label="Start time"]')}`))) await tapIn('[data-detail-row="time"]');
    await scrollTo('[aria-label="Start time"]');
    await P.js(`(() => { const e = ${inSheet('[aria-label="Start time"]')}; e.focus(); e.select && e.select(); })()`);
    await win.webContents.insertText(hhmm);
    await C.sleep(250);
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
    win.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
    await C.sleep(900);
  };
  await P.finger.tap(tab('Today'), 1200);
  await openFromToday('Swim');
  await setTime('07:15');
  check('no question is asked', !(await P.js(`!!document.querySelector('[data-action-menu]')`)));
  check('the sheet says the time applies to every repeat day', (await P.js(`document.body.innerText`)).includes('Applied to every repeat day. Days you moved keep their own time.'));
  await shot('phone-p12-series-time');
  check('the series moves to 07:15 for every day (nothing stored for today)', task('swim').startTime === '07:15' && !task(`swim:${today}`), JSON.stringify([task('swim'), task(`swim:${today}`)]));
  await setTime('07:45');
  check('and again: 07:45', task('swim').startTime === '07:45', JSON.stringify(task('swim')));
  await P.finger.tap(visible('[aria-label="Done"]'), 900);

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
