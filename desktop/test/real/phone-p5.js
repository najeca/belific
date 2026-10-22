'use strict';
// Real touch check for PLAN_phone P5 (2.53.0): the Tasks tab at 390 x 844. The list switcher (Brain
// Dump, lists, Repeating, New list); the quick add row; every task of the chosen list (a named list
// keeps its dated tasks); swipe right marks done (with Undo); swipe left shows Tomorrow and Delete; a
// legacy Brain Dump item becomes a task when opened; press and hold a list edits it; Repeating ticks,
// skips and plans today, shows streaks small (hidden by the phone's own switch), and keeps unconverted
// routines ticking as before.
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
    T('a', 'Thought A', { createdAt: '2026-09-03T07:00:00.000Z' }),
    T('b', 'Thought B', { createdAt: '2026-09-02T07:00:00.000Z' }),
    T('w', 'Write report', { listKey: 'L1' }),
    T('wd', 'Dated in list', { listKey: 'L1', dueDate: day(1) }),
    T('st', 'Stretch daily', { dueDate: day(-5), recurrence: 'daily' }),
    T(`st:${day(-1)}`, 'Stretch daily', { dueDate: day(-1), recurrence: 'daily', completed: true, completedAt: `${day(-1)}T08:00:00.000Z` }),
    T(`st:${day(-2)}`, 'Stretch daily', { dueDate: day(-2), recurrence: 'daily', completed: true, completedAt: `${day(-2)}T08:00:00.000Z` }),
  ]);
  write('belific_lists', [{ key: 'L1', name: 'Work', emoji: '💼', sortOrder: 0, createdAt: stamp, updatedAt: stamp }]);
  write('belific_brain_dump', [{ id: 'old1', title: 'Old phone note', notes: '', createdAt: '2026-08-01T07:00:00.000Z', updatedAt: '2026-08-01T07:00:00.000Z' }]);
  write('belific_routines', [{ id: 'r1', title: 'Water plants', timeOfDay: 'morning', createdAt: stamp, updatedAt: stamp }]);
  const read = (k) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dataDir, `${k}.kv`), 'utf8'));
    } catch {
      return [];
    }
  };
  const task = (id) => read('belific_tasks').find((t) => t.id === id);
  const byTitle = (title) => read('belific_tasks').filter((t) => t.title === title);

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
  const text = () => P.js('document.body.innerText');
  const tabEls = `[...document.querySelectorAll('a, [role="tab"], [role="button"], [role="link"]')].filter((e) => { const r = e.getBoundingClientRect(); return r.top > 760 && r.height > 20 && r.width > 40 && r.width < 200; })`;
  const tab = (name) => `${tabEls}.find((e) => e.textContent.replace(/[^ -~]/g, '').trim() === '${name}')`;
  const visible = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left >= -1 && r.left < innerWidth; })`;
  const chip = (key) => visible(`[data-list-chip="${key}"]`);
  const rows = () => P.js(`[...document.querySelectorAll('[data-task-row]')].map((e) => e.getAttribute('data-task-row'))`);
  const body = (title) => `[...document.querySelectorAll('[data-task-row]')].find((e) => e.getAttribute('data-task-row') === ${JSON.stringify(title)})?.querySelector('[data-task-body]')`;
  const typeText = async (t) => {
    await win.webContents.insertText(t);
    await C.sleep(250);
  };
  const visibleAction = (label) => `[...document.querySelectorAll('[data-swipe-action=${JSON.stringify(label)}]')].find((e) => { const r = e.getBoundingClientRect(); return r.width > 40 && r.left >= 0 && r.right <= innerWidth + 1; })`;

  await P.finger.tap(tab('Tasks'), 1200);
  const chips = await P.js(`[...document.querySelectorAll('[data-list-chip]')].map((e) => e.getAttribute('data-list-chip'))`);
  check('the switcher: Brain Dump, the lists, Repeating, New list', JSON.stringify(chips) === JSON.stringify(['dump', 'L1', '__repeating__', 'new']), JSON.stringify(chips));
  const dump = await rows();
  check('Brain Dump: the thoughts and the old phone item, not the list task', dump.includes('Thought A') && dump.includes('Thought B') && dump.includes('Old phone note') && !dump.includes('Write report'), JSON.stringify(dump));
  await shot('phone-p5-braindump');

  // The quick add row.
  await P.finger.tap(visible('[aria-label="Add to Brain Dump"]'), 300);
  await typeText('Typed thought');
  await P.finger.tap(visible('[aria-label="Add"]'), 900);
  const typed = byTitle('Typed thought')[0];
  check('the add row stores a task in Brain Dump (no day, no list)', !!typed && !typed.dueDate && !typed.listKey, JSON.stringify(typed));

  // Swipe left: Tomorrow.
  await P.finger.drag(body('Thought A'), -200, 0, 260, 800, { x: 280, y: 20 });
  check('swipe left shows Tomorrow and Delete', !!(await P.js(`!!(${visibleAction('Tomorrow')}) && !!(${visibleAction('Delete')})`)));
  await shot('phone-p5-swipe-left');
  await P.finger.tap(visibleAction('Tomorrow'), 900);
  check('Tomorrow gives it tomorrow\'s date and takes it off Brain Dump', task('a').dueDate === day(1) && !(await rows()).includes('Thought A'), JSON.stringify(task('a')));
  // Swipe left: Delete.
  await P.finger.drag(body('Thought B'), -200, 0, 260, 800, { x: 280, y: 20 });
  await P.finger.tap(visibleAction('Delete'), 900);
  check('Delete deletes it', !!task('b').deletedAt);

  // A legacy item opens as a task.
  await P.finger.tap(body('Old phone note'), 1200);
  const converted = byTitle('Old phone note')[0];
  // 2.54.0 (P6): it opens in the task details (it was the old task form).
  check('opening an old phone item makes it a task and opens it', !!converted && !!read('belific_brain_dump').find((i) => i.id === 'old1').deletedAt && (await P.js(`!!document.querySelector('[data-task-details]')`)), JSON.stringify(converted));
  await P.finger.tap(`[...document.querySelectorAll('[aria-label="Done"]')].pop()`, 900);

  // A named list keeps its dated tasks.
  await P.finger.tap(chip('L1'), 900);
  const work = await rows();
  check('Work: its task and its dated task', work.includes('Write report') && work.includes('Dated in list'), JSON.stringify(work));
  await P.finger.tap(visible('[aria-label="Add to Work"]'), 300);
  await typeText('Call the client');
  await P.finger.tap(visible('[aria-label="Add"]'), 900);
  check('the add row adds to the chosen list', byTitle('Call the client')[0]?.listKey === 'L1');

  // Swipe right: done, with Undo.
  await P.finger.drag(body('Write report'), 230, 0, 260, 900, { x: 60, y: 20 });
  check('swipe right marks it done', task('w').completed === true);
  check('an Undo message shows', /Done: Write report/.test(await P.js(`(document.querySelector('[data-undo-bar]') || {}).innerText || ''`)));
  check('"Done today, 1" shows under the list', /Done today, 1/.test(await text()));
  await shot('phone-p5-swipe-right');
  await P.finger.tap(`document.querySelector('[data-undo-bar] [aria-label="Undo"]')`, 900);
  check('Undo reopens it', task('w').completed === false);

  // A vertical scroll on the list opens nothing and swipes nothing.
  await P.finger.drag(body('Write report'), 0, -60, 220, 600);
  check('a vertical move opens nothing and marks nothing', task('w').completed === false && !(await P.js(`!!document.querySelector('[data-action-menu]')`)) && !/Due date/.test(await text()));

  // Hold a row.
  await P.finger.hold(body('Write report'), 480, 700);
  const items = await P.js(`[...document.querySelectorAll('[data-action-menu] [role="button"]')].map((e) => e.getAttribute('aria-label'))`);
  check('hold a row: Edit, Duplicate, Move to list, Delete', JSON.stringify(items) === JSON.stringify(['Edit', 'Duplicate', 'Move to list', 'Delete', 'Cancel']), JSON.stringify(items));
  await P.finger.tap(`document.querySelector('[data-action-menu] [aria-label="Cancel"]')`, 600);

  // Hold a list: edit it.
  await P.finger.hold(chip('L1'), 480, 900);
  check('hold a list opens its edit box', await P.js(`!!document.querySelector('[data-list-sheet="L1"]')`));
  await P.js(`(() => { const i = document.querySelector('[data-list-sheet] input[aria-label="List name"]'); i.focus(); i.select(); })()`);
  await typeText('Deep work');
  await P.js(`(() => { const i = document.querySelector('[data-list-sheet] input[aria-label="List emoji"]'); i.focus(); i.select(); })()`);
  await typeText('🚀');
  await shot('phone-p5-list-edit');
  await P.finger.tap(visible('[aria-label="Save list Work"]'), 900);
  const L1 = read('belific_lists').find((l) => l.key === 'L1');
  check('the list is renamed with a new emoji, same key', L1.name === 'Deep work' && L1.emoji.replace(/️/g, '') === '🚀', JSON.stringify(L1));
  check('its tasks keep the list', task('w').listKey === 'L1');
  // New list: swipe the chip bar to the left to reach it.
  await P.finger.drag(chip('dump'), -260, 0, 300, 800);
  check('the chip bar scrolls sideways under a finger', await P.js(`(() => { const e = document.querySelector('[data-list-chip="new"]'); const r = e.getBoundingClientRect(); return r.right <= innerWidth + 1 && r.left >= 0; })()`));
  check('swiping the chip bar selected nothing', !(await P.js(`!!document.querySelector('[data-list-sheet]')`)));
  await P.finger.tap(chip('new'), 900);
  await P.finger.tap(visible('[data-list-sheet] input[aria-label="List name"]'), 300);
  await typeText('Reading');
  await P.finger.tap(visible('[aria-label="Save new list"]'), 900);
  const reading = read('belific_lists').find((l) => l.name === 'Reading');
  check('New list makes a list and shows it', !!reading && (await P.js(`!!document.querySelector('[data-list-chip="${reading && reading.key}"]')`)));

  // Repeating.
  await P.finger.tap(chip('__repeating__'), 1000);
  check('Repeating shows the repeating task with its streak', (await text()).includes('Stretch daily') && (await P.js(`!!document.querySelector('[data-streak]')`)), await text());
  check('Repeating keeps the unconverted routine', (await text()).includes('Water plants'));
  await shot('phone-p5-repeating');
  await P.finger.tap(visible('[data-quest-tick="Stretch daily"]'), 1000);
  check('one tap completes today', task(`st:${today}`)?.completed === true, JSON.stringify(task(`st:${today}`)));
  await P.finger.tap(`[...document.querySelectorAll('[data-routine-row="Water plants"] [role="button"]')][0]`, 900);
  check('a routine ticks as before', read('belific_routine_completions').some((c) => c.routineId === 'r1' && c.date === today));
  // The phone's own Show streaks switch.
  await P.finger.tap(visible('[data-profile-avatar]'), 1200);
  await P.finger.tap(visible('[data-phone-streaks] [role="switch"]'), 700);
  await P.finger.tap(visible('[aria-label="Back"]'), 900);
  await P.finger.tap(chip('__repeating__'), 900);
  check('Show streaks off (Settings, On this iPhone) hides the streak', !(await P.js(`!!document.querySelector('[data-streak]')`)));

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
