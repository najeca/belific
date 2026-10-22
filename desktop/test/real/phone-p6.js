'use strict';
// Real touch check for PLAN_phone P6 (2.54.0): a task's details on the phone at 390 x 844. Title,
// emoji, top priority, date (chips and the month grid), time, length (presets and typed), label (and
// a new one), list, notes, steps (add, tick, rename, delete) and Delete; every edit is stored at once
// and keeps the fields the phone does not show (cutsBelow, reminders, extra times, times done, the
// timer). A projected repeating day edits its series; its date moves only that day.
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
  const FULL = { cutsBelow: true, reminders: [0, 10], reminderMinutes: 0, actualMinutes: 25, timerStartedAt: '2026-10-22T09:00:00.000Z', extraTimes: ['15:00'], timesDone: ['15:00'] };
  write('belific_tasks', [
    T('full', 'Boot camp', { ...FULL, startTime: '09:30', durationMinutes: 60, dueDate: day(2), listKey: 'L1' }),
    T('plain', 'Throwaway'),
    T('walk', 'Morning walk', { dueDate: day(-3), startTime: '07:00', recurrence: 'daily' }),
  ]);
  write('belific_lists', [
    { key: 'L1', name: 'Work', emoji: '💼', sortOrder: 0, createdAt: stamp, updatedAt: stamp },
    { key: 'L2', name: 'Home', emoji: '🏠', sortOrder: 1, createdAt: stamp, updatedAt: stamp },
  ]);
  write('belific_projects', [{ key: 'p1', name: 'Health', colorKey: 'sage', createdAt: stamp, updatedAt: stamp }]);
  const read = (k) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dataDir, `${k}.kv`), 'utf8'));
    } catch {
      return [];
    }
  };
  const task = (id) => read('belific_tasks').find((t) => t.id === id);
  const kept = (t) => t.cutsBelow === true && JSON.stringify(t.reminders) === '[0,10]' && t.actualMinutes === 25 && t.timerStartedAt === FULL.timerStartedAt && JSON.stringify(t.timesDone) === '["15:00"]';

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
    await C.sleep(600);
  };
  const replaceIn = async (sel, t) => {
    await scrollTo(sel);
    await P.js(`(() => { const e = ${inSheet(sel)}; e.focus(); e.select && e.select(); })()`);
    await typeText(t);
  };
  const blur = () => P.js('document.activeElement && document.activeElement.blur()');
  const menuTap = (label) => P.finger.tap(`[...document.querySelectorAll('[data-action-menu] [aria-label=${JSON.stringify(label)}]')].pop()`, 900);
  const rowValue = (key) => P.js(`(${inSheet(`[data-detail-row="${key}"]`)} || {}).innerText || ''`);

  // Open the task from Work.
  await P.finger.tap(tab('Tasks'), 1000);
  await P.finger.tap(visible('[data-list-chip="L1"]'), 900);
  await P.finger.tap(`[...document.querySelectorAll('[data-task-row="Boot camp"] [data-task-body]')][0]`, 1200);
  check('a tap opens the task details', await P.js(`!!document.querySelector('[data-task-details="full"]')`));
  await shot('phone-p6-details');

  // Title and emoji.
  await replaceIn('[aria-label="Task title"]', 'Boot camp day');
  await blur();
  await C.sleep(700);
  check('the title is saved, nothing else lost', task('full').title === 'Boot camp day' && kept(task('full')), JSON.stringify(task('full')));
  await replaceIn('[aria-label="Task emoji"]', '🏃');
  await blur();
  await C.sleep(700);
  check('the emoji is saved', (task('full').emoji || '').replace(/️/g, '') === '🏃');

  // Priority.
  await tapIn('[data-detail-row="priority"] [role="switch"]');
  check('top priority is saved (red mark)', task('full').priority === 'high' && /❗/.test(await rowValue('priority')));

  // Date: chips and the month grid.
  await tapIn('[data-detail-row="date"]');
  await tapIn('[aria-label="Tomorrow"]');
  check('Tomorrow sets tomorrow', task('full').dueDate === day(1) && kept(task('full')));
  await tapIn('[data-detail-row="date"]');
  await tapIn(`[data-day="${day(5)}"]`);
  check('a day in the month grid sets that day', task('full').dueDate === day(5));
  await shot('phone-p6-date');

  // Time: a clash with the other time is refused with a note; a free time is saved, the other kept.
  await tapIn('[data-detail-row="time"]');
  await replaceIn('[aria-label="Start time"]', '14:30');
  await enter();
  check('a time that overlaps the task\'s other time is refused with a note', task('full').startTime === '09:30' && /Not moving it/.test(await P.js(`document.querySelector('[data-task-details]').parentElement.innerText`)));
  await replaceIn('[aria-label="Start time"]', '10:15');
  await enter();
  check('a free time is saved; the extra time stays', task('full').startTime === '10:15' && JSON.stringify(task('full').extraTimes) === '["15:00"]', JSON.stringify(task('full')));

  // Length.
  await tapIn('[data-detail-row="duration"]');
  await tapIn('[aria-label="Length 45 min"]');
  check('a preset length is saved', task('full').durationMinutes === 45, String(task('full').durationMinutes));
  await replaceIn('[aria-label="Other length"]', '1h 15m');
  await enter();
  check('a typed length is saved', task('full').durationMinutes === 75, String(task('full').durationMinutes));

  // Label.
  await tapIn('[data-detail-row="label"]');
  await menuTap('Health');
  check('a label is chosen', task('full').projectKey === 'p1');
  await tapIn('[data-detail-row="label"]');
  await menuTap('New label');
  await replaceIn('[aria-label="New label name"]', 'Errands');
  await tapIn('[aria-label="Add label"]');
  const errands = read('belific_projects').find((p) => p.name === 'Errands');
  check('a new label is made (with a colour) and chosen', !!errands && !!errands.colorKey && task('full').projectKey === errands.key, JSON.stringify(errands));

  // List.
  await tapIn('[data-detail-row="list"]');
  await menuTap('🏠 Home');
  check('the list is changed', task('full').listKey === 'L2' && kept(task('full')));

  // Notes.
  await replaceIn('[aria-label="Notes"]', 'Gate B, bring water');
  await blur();
  await C.sleep(700);
  check('notes are saved', task('full').notes === 'Gate B, bring water');

  // Steps.
  await replaceIn('[aria-label="Add a step"]', 'Pack the bag');
  await enter();
  await replaceIn('[aria-label="Add a step"]', 'Fill the bottle');
  await enter();
  check('steps are added', JSON.stringify((task('full').subtasks || []).map((x) => x.title)) === JSON.stringify(['Pack the bag', 'Fill the bottle']));
  await tapIn('[aria-label="Step Pack the bag"]');
  check('a step ticks (the task stays open)', task('full').subtasks[0].done === true && !task('full').completed);
  await tapIn('[aria-label="Delete step Fill the bottle"]');
  check('a step is deleted', task('full').subtasks.length === 1);
  check('after every edit the Part B and C fields and the timer are still there', kept(task('full')), JSON.stringify(task('full')));
  await shot('phone-p6-steps');
  await P.finger.tap(visible('[aria-label="Done"]'), 900);
  check('Done closes the details', !(await P.js(`!!document.querySelector('[data-task-details]')`)));

  // Delete from the details.
  await P.finger.tap(visible('[data-list-chip="dump"]'), 900);
  await P.finger.tap(`[...document.querySelectorAll('[data-task-row="Throwaway"] [data-task-body]')][0]`, 1200);
  await tapIn('[aria-label="Delete task"]');
  await menuTap('Delete task');
  check('Delete task deletes it and closes the details', !!task('plain').deletedAt && !(await P.js(`!!document.querySelector('[data-task-details]')`)));

  // A projected repeating day from Today.
  await P.finger.tap(tab('Today'), 1200);
  await P.finger.tap(`[...document.querySelectorAll('[data-today-row="Morning walk"] [data-today-body]')][0]`, 700);
  await P.finger.tap(`[...document.querySelectorAll('[data-today-expanded] [aria-label="Edit Morning walk"]')][0]`, 1200);
  check('Edit on Today opens the details of the repeating day', await P.js(`(document.querySelector('[data-task-details]') || {}).parentElement?.innerText.includes('Repeating task')`));
  await replaceIn('[aria-label="Task title"]', 'Morning run');
  await blur();
  await C.sleep(900);
  check('a projected day edits its series (the template is renamed)', task('walk').title === 'Morning run', JSON.stringify(task('walk')));
  await tapIn('[data-detail-row="date"]');
  await tapIn('[aria-label="Tomorrow"]');
  const moved = task(`walk:${today}`);
  check('its date moves only that day: today\'s day is stored and moved to tomorrow; the series is unchanged', !!moved && moved.dueDate === day(1) && task('walk').dueDate === day(-3), JSON.stringify(moved));
  await P.finger.tap(visible('[aria-label="Done"]'), 900);

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
