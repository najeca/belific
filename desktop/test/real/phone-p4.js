'use strict';
// Real touch check for PLAN_phone P4 (2.52.0): Today at 390 x 844. Only today, timed in time order,
// Anytime below (routines first, top priority next); a tap opens a row in place; a step ticks; a tick
// takes the row away with Undo; Done today shows it again; a projected repeating day is stored by
// its tick; press and hold opens Edit, Duplicate, Move to list, Delete; a routine ticks as before and a
// converted routine shows once; old events are grey read only rows.
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
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, dueDate: today, ...extra });
  const write = (k, v) => fs.writeFileSync(path.join(dataDir, `${k}.kv`), JSON.stringify(v));
  write('belific_tasks', [
    T('standup', 'Standup', { startTime: '08:00', durationMinutes: 30, notes: 'Bring the numbers', subtasks: [{ id: 's1', title: 'Check the board', done: false }, { id: 's2', title: 'Share the plan', done: false }], projectKey: 'work', listKey: 'L1' }),
    T('review', 'Evening review', { startTime: '23:30', durationMinutes: 20 }),
    T('milk', 'Buy milk', { createdAt: '2026-09-02T07:00:00.000Z' }),
    T('rent', 'Pay rent', { priority: 'high', createdAt: '2026-09-03T07:00:00.000Z' }),
    T('walk', 'Morning walk', { dueDate: day(-3), startTime: '07:00', recurrence: 'daily' }),
    T('later', 'Tomorrow thing', { dueDate: day(1) }),
    T('rt_r2', 'Old habit', { dueDate: day(-2), recurrence: 'daily' }),
  ]);
  write('belific_projects', [{ key: 'work', name: 'Work', colorKey: 'sage', createdAt: stamp, updatedAt: stamp }]);
  write('belific_lists', [{ key: 'L1', name: 'Office', emoji: '🏢', sortOrder: 0, createdAt: stamp, updatedAt: stamp }]);
  write('belific_routines', [
    { id: 'r1', title: 'Stretch', timeOfDay: 'morning', createdAt: stamp, updatedAt: stamp },
    { id: 'r2', title: 'Old habit', timeOfDay: 'evening', createdAt: stamp, updatedAt: stamp },
  ]);
  write('belific_custom_events', [{ id: 'ev1', title: 'Gym class', category: 'health', icon: '🏋️', start: '13:00', end: '14:00', notes: '', date: today, createdAt: stamp, updatedAt: stamp }]);
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
  await C.sleep(2000);
  const shot = async (name) => {
    if (!process.env.BELIFIC_SHOTS) return;
    fs.mkdirSync(process.env.BELIFIC_SHOTS, { recursive: true });
    fs.writeFileSync(path.join(process.env.BELIFIC_SHOTS, `${name}.png`), (await win.webContents.capturePage()).toPNG());
  };
  const text = () => P.js('document.body.innerText');
  const rows = () => P.js(`[...document.querySelectorAll('[data-today-row]')].map((e) => e.getAttribute('data-today-row'))`);
  const body = (title) => `[...document.querySelectorAll('[data-today-row]')].find((e) => e.getAttribute('data-today-row') === ${JSON.stringify(title)})?.querySelector('[data-today-body]')`;
  const tickOf = (title) => `[...document.querySelectorAll('[data-today-row]')].find((e) => e.getAttribute('data-today-row') === ${JSON.stringify(title)})?.querySelector('[data-tick]')`;
  const menuItems = () => P.js(`[...document.querySelectorAll('[data-action-menu] [role="button"]')].map((e) => e.getAttribute('aria-label'))`);
  const menuTap = (label) => P.finger.tap(`document.querySelector('[data-action-menu] [aria-label=${JSON.stringify(label)}]')`, 900);

  // Order.
  const order = await rows();
  check('only today: the task for tomorrow is not on Today', !order.includes('Tomorrow thing'), JSON.stringify(order));
  const timedOrder = order.filter((t) => ['Morning walk', 'Standup', 'Evening review'].includes(t));
  check('timed tasks in time order (a projected repeating task included)', JSON.stringify(timedOrder) === JSON.stringify(['Morning walk', 'Standup', 'Evening review']), JSON.stringify(order));
  const any = order.filter((t) => ['Stretch', 'Old habit', 'Pay rent', 'Buy milk'].includes(t));
  check('Anytime: the routine first, then top priority, then oldest first (a converted routine is a task)', JSON.stringify(any) === JSON.stringify(['Stretch', 'Pay rent', 'Old habit', 'Buy milk']), JSON.stringify(any));
  check('a converted routine shows once (the series, not the routine)', order.filter((t) => t === 'Old habit').length === 1);
  check('an old event is a grey row among the timed ones', await P.js(`!!document.querySelector('[data-today-event="Gym class"]')`));
  check('the Now and Next line is there', /Now/.test(await text()) && !!(await P.js(`document.querySelector('[data-now-next]')`)));
  await shot('phone-p4-today');

  // Expand in place, tick a step.
  await P.finger.tap(body('Standup'), 700);
  const ex = await P.js(`(document.querySelector('[data-today-expanded]') || {}).innerText || ''`);
  check('a tap opens the row in place: notes, steps and Edit', ex.includes('Bring the numbers') && ex.includes('Check the board') && ex.includes('Edit'), ex);
  await shot('phone-p4-expanded');
  await P.finger.tap(`document.querySelector('[data-step="Check the board"]')`, 900);
  check('a step ticks from the open row (the task stays open: one step is left)', task('standup').subtasks[0].done === true && !task('standup').completed, JSON.stringify(task('standup').subtasks));
  await P.finger.tap(body('Standup'), 500);
  check('a second tap closes it', !(await P.js(`!!document.querySelector('[data-today-expanded]')`)));

  // Tick, Undo, Done today.
  await P.finger.tap(tickOf('Buy milk'), 900);
  check('a tick stores the task as done', task('milk').completed === true);
  check('the ticked row leaves the list', !(await rows()).includes('Buy milk'));
  const undoText = await P.js(`(document.querySelector('[data-undo-bar]') || {}).innerText || ''`);
  check('an Undo message shows', /Done: Buy milk/.test(undoText) && /Undo/.test(undoText), undoText);
  await shot('phone-p4-undo');
  await P.finger.tap(`document.querySelector('[data-undo-bar] [aria-label="Undo"]')`, 900);
  check('Undo puts it back', task('milk').completed === false && (await rows()).includes('Buy milk'));
  await P.finger.tap(tickOf('Buy milk'), 900);
  await C.waitFor(async () => !(await P.js(`!!document.querySelector('[data-undo-bar]')`)), 7000).catch(() => {});
  check('the Undo message goes away by itself after a few seconds', !(await P.js(`!!document.querySelector('[data-undo-bar]')`)));
  check('"Done today, 1" shows', /Done today, 1/.test(await text()));
  await P.finger.tap(`document.querySelector('[data-done-today]')`, 700);
  check('Done today opens and shows the ticked task', (await rows()).includes('Buy milk'));

  // A projected repeating day.
  await P.finger.tap(tickOf('Morning walk'), 900);
  const walked = task(`walk:${today}`);
  check('ticking a projected repeating day stores that day, done', !!walked && walked.completed === true && walked.dueDate === today, JSON.stringify(walked));
  check('the series itself is untouched', task('walk').completed === false);

  // A routine.
  await P.finger.tap(tickOf('Stretch'), 900);
  check('a routine ticks as before (a routine completion for today)', read('belific_routine_completions').some((c) => c.routineId === 'r1' && c.date === today));

  // Press and hold.
  await P.finger.hold(body('Pay rent'), 480, 700);
  check('hold opens Edit, Duplicate, Move to list, Delete', JSON.stringify(await menuItems()) === JSON.stringify(['Edit', 'Duplicate', 'Move to list', 'Delete', 'Cancel']), JSON.stringify(await menuItems()));
  await shot('phone-p4-menu');
  await menuTap('Duplicate');
  check('Duplicate makes a copy', read('belific_tasks').filter((t) => t.title === 'Pay rent' && !t.deletedAt).length === 2);
  await P.finger.hold(body('Pay rent'), 480, 700);
  await menuTap('Move to list');
  await C.sleep(500);
  check('Move to list offers Brain Dump and the lists', JSON.stringify(await menuItems()) === JSON.stringify(['Brain Dump', '🏢 Office', 'Cancel']), JSON.stringify(await menuItems()));
  await menuTap('🏢 Office');
  check('the task moves to the list', task('rent').listKey === 'L1');
  await P.finger.hold(body('Pay rent'), 480, 700);
  await menuTap('Delete');
  check('Delete deletes it (to Trash)', !!task('rent').deletedAt);
  await P.finger.hold(body('Evening review'), 480, 700);
  await menuTap('Edit');
  check('Edit opens the task form', (await text()).includes('Evening review') && /Due date|Notes/.test(await text()));
  await P.finger.tap(`[...document.querySelectorAll('[aria-label="Cancel"]')].pop()`, 800);

  // A repeating task's menu.
  await P.finger.hold(body('Old habit'), 480, 700);
  check('a repeating task offers Skip this day and Delete repeating task', JSON.stringify(await menuItems()) === JSON.stringify(['Edit', 'Duplicate', 'Move to list', 'Skip this day', 'Delete repeating task', 'Cancel']), JSON.stringify(await menuItems()));
  await menuTap('Cancel');

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
