'use strict';
// @real-input: quiet
// Real check for build plan phase 5 (Daily Planning, Daily Shutdown, rollover,
// the phase 5 keys) on the desktop: real mouse and key input into the real app,
// on an isolated data folder asserted NOT to be the real one; Supabase is the in
// process fake (signed out, nothing leaves the machine). Covers: Cancel and
// Escape leave the stored tasks byte for byte as they were after every kind of
// draft change (until 3.43.0: F4 of PLAN_daily_flow makes Plan my day one screen that saves as you go, p59 checks it in
// full; nothing rolls onto today), Wrap up is one screen whose buttons save at once (p58 checks it in full), and the
// keys Ctrl+Shift+P, Shift+T, Shift+B, Left, Right and Ctrl+I (never while typing).
// BELIFIC_SHOTS: a folder for screenshots.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const C = require('./common');
const { makeInput, dayKeyFrom, readKv } = require('./input');

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
  const now = new Date();
  const dk = dayKeyFrom(now);
  const today = dk(0);
  const tomorrow = dk(1);
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      T('m1', 'Missed one', { dueDate: dk(-2) }),
      T('m2', 'Missed placed', { dueDate: dk(-1), startTime: '08:00', durationMinutes: 30 }),
      T('rep', 'Repeating daily', { dueDate: dk(-3), recurrence: 'daily' }),
      T('y1', 'Done yesterday', { dueDate: dk(-1), completed: true, completedAt: `${dk(-1)}T10:00:00.000Z`, actualMinutes: 25 }),
      T('t1', 'Today task', { dueDate: today, durationMinutes: 60 }),
      T('t2', 'Second today task', { dueDate: today }),
      T('b1', 'Brain one'),
      T('b2', 'Brain two'),
      T('tm', 'Tomorrow task', { dueDate: tomorrow }),
    ]),
  );
  // 3.25.0: "Show missed tasks" was off by default, so this check started from a person who turned it on (F3: the
  // switch is gone and the row is not read).
  fs.writeFileSync(path.join(dataDir, 'belific_user_settings.kv'), JSON.stringify([{ key: 'feature.missed', value: 'on', updatedAt: stamp }]));
  const file = path.join(dataDir, 'belific_tasks.kv');
  const raw = () => fs.readFileSync(file, 'utf8');
  const read = readKv(dataDir);
  const tasks = () => read('belific_tasks') || [];
  const byId = (id) => tasks().find((t) => t.id === id);
  const byTitle = (title) => tasks().filter((t) => t.title === title && !t.deletedAt);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await I.waitBody('Brain one', 20000);
  await C.sleep(800);
  const flowOpen = () => I.exists(`document.querySelector('[data-flow]')`);
  const inFlow = (label) => `document.querySelector('[data-flow] [aria-label=${JSON.stringify(label)}]')`;

  // ======== 1 to 3. Plan my day (F4 of PLAN_daily_flow, 3.43.0, changed on purpose): one screen, saved as you go ========
  // (The four steps, the draft, Cancel and Finish are gone; p59 checks the screen in full.)
  // 2.26.0: Plan my day was in the profile menu; 3.40.0 (F1 of PLAN_daily_flow): it is in the Plan button's menu.
  await I.click(`document.querySelector('[data-plan-menu]')`, 500);
  await I.click(`document.querySelector('[data-popover] [aria-label="Plan my day from the menu"]')`, 900);
  check('Plan my day opens on one screen (no steps, no Cancel)', (await flowOpen()) && !(await I.body()).includes('Step 1 of') && !(await I.exists(inFlow('Cancel and change nothing'))));
  check('earlier days are one folded line, not rows (2 from earlier days); no repeating day', (await I.textOf(`document.querySelector('[data-plan-earlier]')`)).includes('2 from earlier days') && !(await I.exists(`document.querySelector('[data-plan-add="m1"]')`)));
  await I.click(`document.querySelector('[data-plan-today="b1"]')`, 1200);
  check('Today on a Brain Dump task saves at once', byId('b1').dueDate === today && !byId('b1').startTime);
  await I.click(`document.querySelector('[data-plan-untick="t1"]')`, 1200);
  check('unticking a task of today sends it back to its list at once', !byId('t1').dueDate);
  await I.shot('p5-01-plan-my-day');
  await I.click(inFlow('Done'), 800);
  check('Done closes and moves nothing else: the earlier tasks stay on their days', !(await flowOpen()) && byId('m1').dueDate === dk(-2) && byId('m2').dueDate === dk(-1) && byId('m2').startTime === '08:00' && byId('rep').dueDate === dk(-3) && byId('b2').dueDate === undefined && byId('tm').dueDate === tomorrow);
  await I.blur();
  await I.key('P', ['control', 'shift']);
  await C.waitFor(flowOpen, 4000).catch(() => {});
  check('Ctrl+Shift+P opens Plan my day', await flowOpen());
  await I.key('Escape', [], 800);
  check('Escape closes it', !(await flowOpen()));

  // ======== 4. Wrap up (F3 of PLAN_daily_flow, 3.42.0, changed on purpose): one screen, each button saves at once ========
  await I.click(`document.querySelector('[data-plan-menu]')`, 500);
  await I.click(`document.querySelector('[data-popover] [aria-label="Wrap up from the menu"]')`, 600);
  check('Wrap up opens on one screen (no steps)', (await flowOpen()) && !(await I.body()).includes('Step 1 of') && (await I.body()).includes('Wrap up'));
  await I.click(`document.querySelector('[data-wrap-for="t2"][data-wrap-btn="tomorrow"]')`, 1200);
  check('Tomorrow moves that task at once', byId('t2').dueDate === tomorrow);
  await I.shot('p5-04-wrap-up');
  await I.click(`document.querySelector('[data-wrap-done]')`, 800);
  check('Done closes and moves nothing else: the one left stays today', !(await flowOpen()) && byId('b1').dueDate === today);
  check('earlier and repeating tasks did not move', byId('m1').dueDate === dk(-2) && byId('rep').dueDate === dk(-3));

  // ======== 5. The phase 5 keys ========
  await I.blur();
  await I.key('T', ['shift']);
  await C.sleep(700);
  // Today's first card (here the repeating task's occurrence for today, drawn first).
  const firstToday = await I.js(`(() => { const c = document.querySelector('[data-day-col="${today}"] [data-card-focus]'); return c && c.getAttribute('aria-label'); })()`);
  check('Shift+T puts the keyboard on the first task of today', !!firstToday && (await I.activeLabel()) === firstToday, `${await I.activeLabel()} / ${firstToday}`);
  // Ctrl+I on a stored task (an occurrence of a repeating task has no time section).
  await I.js(`(() => { const c = ${I.byLabel('Task Brain one')}; c && c.focus(); })()`);
  // 2.27.0: the card has no time section; Ctrl+I opens the details (the estimate is there; 3.26.0: no actual time).
  await I.key('i', ['control']);
  await C.waitFor(() => I.exists(I.dialog('Task details')), 3000).catch(() => {});
  check('Ctrl+I opens the details of the task (the estimate row is there, no Actual time)', (await I.exists(I.dialog('Task details'))) && (await I.textOf(I.dialog('Task details'))).includes('Estimated time') && !(await I.textOf(I.dialog('Task details'))).includes('Actual time'));
  await I.key('Escape');
  await C.sleep(300);
  check('Escape closes them again', !(await I.exists(I.dialog('Task details'))));
  await I.js(`(() => { const c = ${I.byLabel('Task Brain one')}; c && c.focus(); })()`);
  if (now.getDay() !== 0) {
    await I.key('Right');
    const right = await I.activeLabel();
    const firstTomorrow = await I.js(`(() => { const c = document.querySelector('[data-day-col="${tomorrow}"] [data-card-focus]'); return c && c.getAttribute('aria-label'); })()`);
    check('Right goes to the first task of the next day', !!firstTomorrow && right === firstTomorrow, `${right} / ${firstTomorrow}`);
    await I.key('Left');
    check('Left comes back to the first task of today', (await I.activeLabel()) === firstToday, String(await I.activeLabel()));
  } else {
    check('Right and Left: today is a Sunday, the board shows one day (nothing to move to)', true);
  }
  await I.blur();
  await I.key('B', ['shift']);
  await C.sleep(700);
  check('Shift+B puts the keyboard on the first Brain Dump task', (await I.activeLabel()) === 'Task Brain two', String(await I.activeLabel()));
  // never while typing
  await I.click(I.byLabel('Capture a thought'));
  await I.key('T', ['shift']);
  await I.key('B', ['shift']);
  await I.key('Right');
  check('Shift+T, Shift+B and Right typed in a box do nothing but type', (await I.activeLabel()) === 'Capture a thought');
  await I.key('P', ['control', 'shift']);
  check('Ctrl+Shift+P in a box does not open Planning', !(await flowOpen()));
  await I.blur();
  await I.key('/', ['shift']);
  check('the help lists the phase 5 keys', (await I.body()).includes('Daily Planning') && (await I.body()).includes('First task of the next day') && (await I.body()).includes('Open the details (time)'));
  await I.key('Escape');

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
