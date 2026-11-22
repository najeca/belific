'use strict';
// @real-input: quiet
// Real check for 3.70.0 (PLAN_desktop_parity D4): the step by step add dialog on the desktop (the phone's flow as a
// centred dialog). Keys and clicks go through sendInputEvent (no real pointer), so it runs quiet.
//   - opens from the header Add button and from N; focus starts in the text box; "Step 1 of 5"
//   - Next on screen 1 stores the task at once (a title, no Day), a phrase fills its screens and they are passed over
//   - Enter is Next, Esc goes Back (on screen 1 it closes and keeps the task), 1 to 3 pick Today, Tomorrow, Pick a date
//   - time and length (Just a reminder stores 0 minutes), list and label, notes and a smaller task; Skip and Back
//   - the stored row after each answer; Tab stays inside the dialog and wraps; closing half way keeps the task
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
  const dk = dayKeyFrom(new Date());
  const today = dk(0);
  const tomorrow = dk(1);
  const stamp = '2026-11-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const write = (k, v) => fs.writeFileSync(path.join(dataDir, `${k}.kv`), JSON.stringify(v));
  write('belific_tasks', [{ id: 'seed', title: 'Seed task', completed: false, createdAt: stamp, updatedAt: stamp, dueDate: today }]);
  write('belific_projects', [{ key: 'health', name: 'Health', colorKey: 'sage', createdAt: stamp, updatedAt: stamp }]);
  write('belific_lists', [{ key: 'home', name: 'Home', emoji: '🏠', createdAt: stamp, updatedAt: stamp }]);
  const read = readKv(dataDir);
  const live = () => (read('belific_tasks') || []).filter((t) => !t.deletedAt);
  const stored = (title) => live().find((t) => t.title === title);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1500, 950);
  win.show();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await C.sleep(2500);
  await I.waitBody('Seed task', 20000);
  const q = (sel) => `document.querySelector(${JSON.stringify(sel)})`;
  const step = () => I.js(`(() => { const e = document.querySelector('[data-step-add]'); return e ? e.getAttribute('data-step-add') : null; })()`);
  const dots = () => I.js(`(() => { const e = document.querySelector('[data-step-dots]'); return e ? e.getAttribute('data-step-dots') : null; })()`);
  const open = () => I.exists(q('[data-step-add]'));
  const activeIn = () => I.js(`!!document.activeElement && !!document.activeElement.closest('[data-step-add]')`);
  const wait = (fn) => C.waitFor(fn, 4000).catch(() => {});

  // ---- opening ----
  check('the header has an Add button', await I.exists(q('[data-ctl="addSteps"]')));
  await I.click(q('[data-ctl="addSteps"]'), 700);
  check('Add opens a centred dialog on screen 1', (await step()) === 'what' && (await I.exists(`document.querySelector('[role="dialog"][aria-label="Add a task"]')`)));
  const box = await I.js(`(() => { const r = document.querySelector('[data-step-add]').getBoundingClientRect(); return { w: Math.round(r.width), cx: Math.round(r.left + r.width / 2), vw: window.innerWidth }; })()`);
  check('it is about 560 px wide and centred', box.w >= 520 && box.w <= 580 && Math.abs(box.cx - box.vw / 2) <= 4, JSON.stringify(box));
  check('focus starts in the text box', (await I.js(`document.activeElement && document.activeElement.getAttribute('data-step-text')`)) === '1');
  check('the dots say Step 1 of 5', (await dots()) === 'Step 1 of 5');
  check('Next is off while the box is empty', await I.js(`${q('[data-step-next]')}.disabled`));
  await I.shot('p73-screen1');

  // ---- screen 1 stores at once ----
  await I.type('Buy stamps');
  await I.enter([], 700);
  await wait(() => !!stored('Buy stamps'));
  const t1 = stored('Buy stamps');
  check('Enter is Next and stores the task at once, with no Day', !!t1 && !t1.dueDate && (await step()) === 'when', JSON.stringify(t1));
  check('the dots say Step 2 of 5', (await dots()) === 'Step 2 of 5');
  await I.shot('p73-screen2');

  // ---- screen 2: keys 1 to 3 ----
  check('on screen 2 focus is on the first answer inside the dialog', await activeIn());
  await I.key('2', [], 700);
  await wait(() => stored('Buy stamps')?.dueDate === tomorrow);
  check('key 2 picks Tomorrow and moves on to What time', stored('Buy stamps')?.dueDate === tomorrow && (await step()) === 'time', JSON.stringify(stored('Buy stamps')));

  // ---- screen 3: time, length, Just a reminder ----
  await I.js(`(() => { const el = document.querySelector('[data-step-timefield]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, '09:30'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await wait(() => stored('Buy stamps')?.startTime === '09:30');
  check('a time is stored', stored('Buy stamps')?.startTime === '09:30', JSON.stringify(stored('Buy stamps')));
  await I.click(q('[data-step-chip="len-45"]'), 600);
  await wait(() => stored('Buy stamps')?.durationMinutes === 45);
  check('a length chip stores minutes', stored('Buy stamps')?.durationMinutes === 45);
  await I.click(q('[data-step-chip="reminder"]'), 600);
  await wait(() => stored('Buy stamps')?.durationMinutes === 0);
  check('Just a reminder stores 0 minutes', stored('Buy stamps')?.durationMinutes === 0 && stored('Buy stamps')?.startTime === '09:30', JSON.stringify(stored('Buy stamps')));
  await I.click(q('[data-step-chip="len-30"]'), 600);
  await wait(() => stored('Buy stamps')?.durationMinutes === 30);
  await I.shot('p73-screen3');

  // ---- Back and Esc ----
  await I.click(q('[data-step-back]'), 500);
  check('Back returns to When', (await step()) === 'when');
  await I.key('Escape', [], 500);
  check('Esc on a later screen goes Back, not out (screen 1 shows)', (await step()) === 'what' && (await open()));
  check('the task is still stored after going back', !!stored('Buy stamps'));
  await I.enter([], 600);
  check('Next from screen 1 again does not store a second task', live().filter((t) => t.title === 'Buy stamps').length === 1);
  check('and it goes on to the next screen', ['when', 'time'].includes(await step()), String(await step()));

  // ---- Skip, screen 4 ----
  for (let i = 0; i < 4 && (await step()) !== 'where'; i++) await I.click(q('[data-step-skip]'), 500);
  check('Skip reaches Which list or label', (await step()) === 'where');
  await I.click(q('[data-step-chip="list-home"]'), 500);
  await wait(() => stored('Buy stamps')?.listKey === 'home');
  check('a list is stored', stored('Buy stamps')?.listKey === 'home');
  await I.click(q('[data-step-chip="label-health"]'), 500);
  await wait(() => stored('Buy stamps')?.projectKey === 'health');
  check('a label is stored', stored('Buy stamps')?.projectKey === 'health');
  await I.js(`document.querySelector('[data-step-chip="list-brain-dump"]').focus()`);
  await I.key('1', [], 500);
  await wait(() => !stored('Buy stamps')?.listKey);
  check('key 1 picks Brain Dump (no list)', !stored('Buy stamps')?.listKey);
  await I.shot('p73-screen4');

  // ---- Tab stays inside, wraps ----
  let outside = false;
  for (let i = 0; i < 30; i++) {
    await I.key('Tab', [], 60);
    if (!(await activeIn())) outside = true;
  }
  check('Tab 30 times never leaves the dialog', !outside);

  // ---- screen 5: notes, a smaller task, Done ----
  await I.click(q('[data-step-next]'), 700);
  check('the last screen is Anything else to add', (await step()) === 'more' && (await dots()) === 'Step 5 of 5');
  await I.js(`document.querySelector('[data-step-notes]').focus()`);
  await I.type('Ask for first class');
  await I.js(`document.querySelector('[data-step-partinput]').focus()`);
  await I.type('Find the post office');
  await I.enter([], 700);
  const parts = () => live().filter((t) => t.parentId === t1.id);
  await wait(() => parts().length === 1);
  check('a smaller task is added under it', parts().length === 1 && parts()[0].title === 'Find the post office', JSON.stringify(parts()));
  await I.click(q('[data-step-next]'), 900);
  await wait(() => stored('Buy stamps')?.notes === 'Ask for first class');
  check('Done closes the dialog and keeps the notes', !(await open()) && stored('Buy stamps')?.notes === 'Ask for first class', JSON.stringify(stored('Buy stamps')));
  await I.shot('p73-done');

  // ---- N opens it, a phrase answers its screens, closing keeps the task ----
  await I.blur();
  await I.key('n', [], 700);
  check('N opens the dialog', (await step()) === 'what');
  await I.type('Dentist tomorrow 3pm');
  check('a phrase shows what it understood', await I.exists(q('[data-phrase-chips]')));
  await I.enter([], 800);
  await wait(() => !!stored('Dentist'));
  const t2 = stored('Dentist');
  check('the phrase stores a Day and a time', !!t2 && t2.dueDate === tomorrow && /^15:00$/.test(t2.startTime || ''), JSON.stringify(t2));
  check('the screens it answered are passed over (next is Which list or label)', (await step()) === 'where', String(await step()));
  await I.click(q('[data-step-close]'), 700);
  check('Close keeps the task and closes the dialog', !(await open()) && !!stored('Dentist'));

  // ---- Esc on screen 1 with words typed keeps them ----
  await I.blur();
  await I.key('n', [], 700);
  await I.type('Water the plants');
  await I.key('Escape', [], 800);
  await wait(() => !!stored('Water the plants'));
  check('Esc on screen 1 closes and stores the words typed', !(await open()) && !!stored('Water the plants'));

  const before = live().length;
  await I.blur();
  await I.key('n', [], 700);
  await I.key('Escape', [], 600);
  check('Esc on an empty screen 1 closes without storing a task', !(await open()) && live().length === before, `${before} -> ${live().length}`);

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
