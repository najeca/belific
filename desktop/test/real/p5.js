'use strict';
// Real check for build plan phase 5 (Daily Planning, Daily Shutdown, rollover,
// the phase 5 keys) on the desktop: real mouse and key input into the real app,
// on an isolated data folder asserted NOT to be the real one; Supabase is the in
// process fake (signed out, nothing leaves the machine). Covers: Cancel and
// Escape leave the stored tasks byte for byte as they were after every kind of
// draft change, Finish applies the draft and rolls earlier unfinished tasks to
// today (a placed one keeps its time, a repeating one stays), a second Planning
// changes nothing, Shutdown moves only the chosen tasks to tomorrow, and the
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
  const next = () => I.click(inFlow('Next step'), 500);

  // Make every kind of draft change in Planning.
  async function draftEverything(withTime) {
    // step 1: tick a missed task as done
    await I.click(inFlow('Mark Missed one done'));
    await next();
    // step 2: pull from the list, add one
    await I.click(inFlow('Move Brain one to today'));
    await I.click(inFlow('Add a task for today'));
    await I.type('Added in planning');
    await I.enter();
    await next();
    // step 3: something can wait
    await I.click(inFlow('Move Today task to tomorrow'));
    await next();
    // step 4: a time
    if (withTime) {
      await I.js(`(() => { const s = ${inFlow('Time for Brain one')}; const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, '14:00'); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
      await C.sleep(300);
    }
  }

  // ======== 1. Cancel changes nothing ========
  const before = raw();
  // 2.26.0: Plan my day is in the profile menu.
  await I.click(I.byLabel('Profile, not signed in'));
  await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Plan my day"]')`, 600);
  check('the Daily Planning overlay opens, step 1 of 4', (await flowOpen()) && (await I.body()).includes('Step 1 of 4') && (await I.body()).includes('Review your work'));
  // 2.27.0 (the Missed list): a missed day of a repeating task is listed too, but only to skip or do today; it is never moved.
  check('step 1 lists the missed tasks; a repeating day only to skip or do today, never to move', (await I.exists(inFlow('Flow task Missed one'))) && (await I.exists(inFlow('Flow task Missed placed'))) && (await I.exists(inFlow('Do Repeating daily today'))) && !(await I.exists(inFlow('Move Repeating daily to today'))) && !(await I.exists(inFlow('Move Repeating daily to tomorrow'))));
  check('and what was finished yesterday', await I.exists(inFlow('Flow task Done yesterday')));
  await I.shot('p5-01-step1');
  await draftEverything(true);
  check('the draft shows on step 4 (the time)', (await I.body()).includes('14:00 Brain one'));
  await I.shot('p5-02-step4');
  await I.click(inFlow('Cancel and change nothing'));
  await C.sleep(800);
  check('Cancel closes the flow', !(await flowOpen()));
  check('Cancel: the stored tasks are byte for byte as they were', raw() === before);
  check('Cancel: nothing was added', byTitle('Added in planning').length === 0);
  // Escape is Cancel too
  await I.blur();
  await I.key('P', ['control', 'shift']);
  check('Ctrl+Shift+P opens Daily Planning', await flowOpen());
  await I.click(inFlow('Mark Missed one done'));
  await next();
  await I.click(inFlow('Move Brain one to today'));
  await I.click(inFlow('Add a task for today'));
  await I.type('ptbvdwm');
  check('letters typed in the flow are text', (await I.js('document.activeElement.value')) === 'ptbvdwm' && (await flowOpen()));
  await I.key('Escape');
  await C.sleep(800);
  check('Escape cancels: closed, byte for byte as before', !(await flowOpen()) && raw() === before);

  // ======== 2. Finish applies the draft and the rollover ========
  await I.blur();
  await I.key('P', ['control', 'shift']);
  await draftEverything(true);
  await I.click(inFlow('Finish'), 900);
  await C.waitFor(() => byTitle('Added in planning').length === 1, 8000);
  check('Finish closes the flow', !(await flowOpen()));
  check('the missed task ticked as done is done', byId('m1').completed === true && byId('m1').dueDate === dk(-2));
  check('the other missed task rolled to today and kept its time', byId('m2').dueDate === today && byId('m2').startTime === '08:00');
  check('the repeating task did not move', byId('rep').dueDate === dk(-3));
  check('the list task is on today at 14:00', byId('b1').dueDate === today && byId('b1').startTime === '14:00');
  check('the task that can wait is tomorrow', byId('t1').dueDate === tomorrow);
  check('the added task is on today', byTitle('Added in planning')[0].dueDate === today);
  check('untouched rows are untouched', byId('b2').dueDate === undefined && byId('tm').dueDate === tomorrow && byId('y1').completed === true);
  await I.shot('p5-03-after-finish');

  // ======== 3. A second Planning changes nothing (idempotent) ========
  await C.sleep(800);
  const afterFirst = raw();
  await I.blur();
  await I.key('P', ['control', 'shift']);
  for (let i = 0; i < 3; i++) await next();
  await I.click(inFlow('Finish'), 900);
  await C.sleep(800);
  check('a second Planning with no changes writes nothing at all', raw() === afterFirst);

  // ======== 4. Shutdown: only the chosen tasks go to tomorrow ========
  await I.click(I.byLabel('Profile, not signed in'));
  await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Shut down my day"]')`, 600);
  check('Daily Shutdown opens, step 1 of 2', (await flowOpen()) && (await I.body()).includes('Step 1 of 2'));
  check('what was done today is listed (the task ticked in Planning)', await I.exists(inFlow('Flow task Missed one')));
  // keep one today
  await I.click(inFlow('Move Brain one to tomorrow'));
  await next();
  check('step 2 previews tomorrow: already planned and from today', /already planned task/.test(await I.body()) && /from Today/.test(await I.body()));
  await I.shot('p5-04-shutdown');
  await I.click(inFlow('Finish'), 900);
  await C.waitFor(() => byId('m2').dueDate === tomorrow, 8000);
  check('the chosen unfinished tasks of today went to tomorrow', byId('m2').dueDate === tomorrow && byId('t2').dueDate === tomorrow && byTitle('Added in planning')[0].dueDate === tomorrow);
  check('the one left unticked stayed today, with its time', byId('b1').dueDate === today && byId('b1').startTime === '14:00');
  check('done and repeating tasks did not move', byId('m1').dueDate === dk(-2) && byId('rep').dueDate === dk(-3));

  // ======== 5. The phase 5 keys ========
  await I.blur();
  await I.key('T', ['shift']);
  await C.sleep(700);
  // Today's first card (here the repeating task's occurrence for today, drawn first).
  const firstToday = await I.js(`(() => { const c = document.querySelector('[data-day-col="${today}"] [data-card-focus]'); return c && c.getAttribute('aria-label'); })()`);
  check('Shift+T puts the keyboard on the first task of today', !!firstToday && (await I.activeLabel()) === firstToday, `${await I.activeLabel()} / ${firstToday}`);
  // Ctrl+I on a stored task (an occurrence of a repeating task has no time section).
  await I.js(`(() => { const c = ${I.byLabel('Task Brain one')}; c && c.focus(); })()`);
  // 2.27.0: the card has no time section; Ctrl+I opens the details (actual and estimated are there).
  await I.key('i', ['control']);
  await C.waitFor(() => I.exists(I.dialog('Task details')), 3000).catch(() => {});
  check('Ctrl+I opens the details of the task (the time rows are there)', (await I.exists(I.dialog('Task details'))) && (await I.textOf(I.dialog('Task details'))).includes('Actual time'));
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
