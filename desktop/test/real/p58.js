'use strict';
// @real-input: quiet
// Real check for F3 of PLAN_daily_flow (3.42.0): Wrap up on one screen and the Earlier panel.
//   - the Tasks board's past column shows only what was done there (D5); the Earlier pill counts what waits (a shift as
//     one);
//   - Wrap up (the Plan button's menu) is one screen with one main button, Done; a tick saves at once and Ctrl+Z puts it
//     back; Tomorrow, Back to its list and Let go (to the Trash) save at once and fold the row with its own Undo, which
//     undoes that row even when it is not the last change; "Only the 1 step left to tomorrow" splits a task (one Ctrl+Z);
//     a repeating day has no Tomorrow or Back to its list, and Let go skips that day only; Tomorrow on a shift takes the
//     open item inside it and leaves the done one (one Ctrl+Z); the figure "Tomorrow so far"; nothing red, text 14 px+;
//   - the Earlier panel: Tomorrow, Back to its list, Let go (Ctrl+Z), Today only before 14:00, a shift with its inside
//     row, Tick all marks them done on their own days, and its Undo.
// Runs quiet.
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
  const yesterday = dk(-1);
  const before = dk(-2);
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const all7 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      // today
      T('paid', 'Pay the gas bill', { dueDate: today, completed: true, completedAt: stamp }),
      T('water', 'Water the plants', { dueDate: today }),
      T('boiler', 'Book the boiler service', { dueDate: today, startTime: '20:30', durationMinutes: 30 }),
      T('bank', 'Ring the bank', { dueDate: today, listKey: 'home' }),
      T('card', 'Buy a card', { dueDate: today }),
      T('shed', 'Tidy the shed', { dueDate: today, listKey: 'home', durationMinutes: 60, subtasks: [{ id: 'a', title: 'Sweep', done: true }, { id: 'b', title: 'Sort', done: true }, { id: 'c', title: 'Paint', done: false }] }),
      T('gym', 'Gym', { dueDate: today, startTime: '19:00', durationMinutes: 60, recurrence: 'weekly', recurrenceDays: all7 }),
      T('shift', 'Shift', { dueDate: today, startTime: '08:00', durationMinutes: 600 }),
      T('brief', 'Briefing', { dueDate: today, startTime: '08:30', durationMinutes: 30, completed: true, completedAt: stamp }),
      T('ring', 'Ring other departments', { dueDate: today, startTime: '14:00', durationMinutes: 60 }),
      // earlier days
      T('olddone', 'Old done', { dueDate: yesterday, completed: true, completedAt: stamp }),
      T('old1', 'Old one', { dueDate: before }),
      T('old2', 'Old two', { dueDate: yesterday, listKey: 'home' }),
      T('old3', 'Old three', { dueDate: yesterday }),
      T('night', 'Night shift', { dueDate: yesterday, startTime: '08:00', durationMinutes: 600 }),
      T('hand', 'Handover', { dueDate: yesterday, startTime: '09:00', durationMinutes: 30 }),
    ]),
  );
  fs.writeFileSync(path.join(dataDir, 'belific_lists.kv'), JSON.stringify([{ key: 'home', name: 'House jobs', emoji: '🏠', sortOrder: 0, createdAt: stamp, updatedAt: stamp }]));
  const read = readKv(dataDir);
  const raw = () => read('belific_tasks') || [];
  const live = (id) => raw().find((t) => t.id === id && !t.deletedAt);
  const liveT = (title) => raw().filter((t) => t.title === title && !t.deletedAt);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1920, 1000);
  win.show();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await I.waitBody('Water the plants', 20000);
  await I.click(I.byLabel('Show Tasks'), 900).catch(() => {});
  await C.sleep(800);
  const ctrlZ = async () => {
    await I.blur();
    await I.key('Z', ['control'], 1600);
  };
  const btn = (key, id) => `document.querySelector('[data-wrap-for="${key}"][data-wrap-btn="${id}"]')`;
  const folded = (key) => I.js(`document.querySelector('[data-wrap-row="${key}"]')?.getAttribute('data-wrap-decided') ?? null`);
  const noRed = (root) => I.js(`![...document.querySelectorAll('${root} *')].some((e) => { const m = /rgb\\((\\d+), (\\d+), (\\d+)/.exec(getComputedStyle(e).color); return m && +m[1] > 180 && +m[2] < 110 && +m[3] < 110; })`);
  const smallText = (root) => I.js(`[...document.querySelectorAll('${root} *')].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 14).map((e) => e.textContent.trim().slice(0, 30))`);

  // ---- the board's past day and the pill (D5) ----
  const pastCol = await I.exists(`document.querySelector('[data-day-col="${yesterday}"]')`);
  if (pastCol) {
    // Done tasks show when the board shows done tasks at all (as today's done one does).
    const doneShown = await I.exists(`document.querySelector('[data-day-col="${today}"] [aria-label="Task Pay the gas bill"]')`);
    check('yesterday on the board shows what was done there, not the unticked ones', (await I.exists(`document.querySelector('[data-day-col="${yesterday}"] [aria-label="Task Old done"]')`)) === doneShown && !(await I.exists(`document.querySelector('[data-day-col="${yesterday}"] [aria-label="Task Old three"]')`)) && !(await I.exists(`document.querySelector('[data-day-col="${yesterday}"] [aria-label="Task Night shift"]')`)));
  } else {
    check('yesterday on the board (not drawn at this width): skipped', true);
  }
  const pill = () => I.js(`document.querySelector('[data-missed-button]')?.getAttribute('data-missed-button') ?? null`);
  check('the Earlier pill is there with no setting, and counts 4 (the night shift with Handover inside it is one)', (await pill()) === '4', String(await pill()));

  // ---- Wrap up ----
  await I.click(`document.querySelector('[data-plan-menu]')`, 500);
  await I.click(`document.querySelector('[data-popover] [aria-label="Wrap up from the menu"]')`, 900);
  const wrapOpen = () => I.exists(`document.querySelector('[data-wrap-up]')`);
  check('Wrap up opens on one screen: no steps, no Next, no Cancel; one main button, Done', (await wrapOpen()) && !/Step \d of/.test(await I.body()) && !(await I.exists(I.byLabel('Next step'))) && !(await I.exists(I.byLabel('Cancel and change nothing'))) && (await I.exists(`document.querySelector('[data-wrap-done]')`)));
  const keys = await I.js(`[...document.querySelectorAll('[data-wrap-row]')].map((r) => r.getAttribute('data-wrap-row'))`);
  check('today is listed by time, the shift with its two inside under it', ['shift', 'brief', 'ring', 'boiler', 'gym', 'paid', 'water', 'bank', 'card', 'shed'].every((k) => keys.includes(k)) && keys.indexOf('brief') === keys.indexOf('shift') + 1 && keys.indexOf('gym') < keys.indexOf('boiler'), JSON.stringify(keys));
  check('each unticked task has Tomorrow, Back to its list and Let go, visible', (await I.exists(btn('boiler', 'tomorrow'))) && (await I.exists(btn('boiler', 'list'))) && (await I.exists(btn('boiler', 'letgo'))) && (await I.js(`getComputedStyle(${btn('boiler', 'tomorrow')}).opacity`)) === '1');
  check('a done task has no buttons', !(await I.exists(btn('paid', 'tomorrow'))) && !(await I.exists(btn('brief', 'tomorrow'))));
  check('a repeating day has Let go only (it never moves)', !(await I.exists(btn('gym', 'tomorrow'))) && !(await I.exists(btn('gym', 'list'))) && (await I.exists(btn('gym', 'letgo'))));
  check('nothing is red and every word is 14 px or more', (await noRed('[data-wrap-up]')) && (await smallText('[data-wrap-up]')).length === 0, JSON.stringify(await smallText('[data-wrap-up]')));
  await I.shot('p58-wrap-up');

  // the tick
  await I.click(`document.querySelector('[data-wrap-tick="water"]')`, 1200);
  check('a tick saves at once', live('water').completed === true);
  await ctrlZ();
  check('Ctrl+Z in Wrap up takes the tick back', live('water').completed === false && (await wrapOpen()));

  // Tomorrow, Back to its list, Let go
  await I.click(btn('boiler', 'tomorrow'), 1200);
  check('Tomorrow: the Day is tomorrow, the time stays; the row folds to "Tomorrow" with Undo', live('boiler').dueDate === tomorrow && live('boiler').startTime === '20:30' && (await folded('boiler')) === 'tomorrow' && (await I.exists(`document.querySelector('[data-wrap-undo="boiler"]')`)));
  await I.click(btn('bank', 'list'), 1200);
  check('Back to its list: no Day, its list kept', !live('bank').dueDate && live('bank').listKey === 'home' && (await folded('bank')) === 'list');
  await I.click(btn('card', 'letgo'), 1200);
  check('Let go: to the Trash (a tombstone)', !live('card') && raw().some((t) => t.id === 'card' && t.deletedAt) && (await folded('card')) === 'letGo');
  await I.click(`document.querySelector('[data-wrap-undo="boiler"]')`, 1500);
  check('the row\'s own Undo puts that row back even when it is not the last change; the later ones stay', live('boiler').dueDate === today && !live('bank').dueDate && !live('card') && (await folded('boiler')) === null && (await I.exists(btn('boiler', 'tomorrow'))));
  await I.click(`document.querySelector('[data-wrap-undo="card"]')`, 1500);
  check('Undo on Let go brings the task back', liveT('Buy a card').some((t) => t.dueDate === today));

  // the steps
  const stepsBtn = await I.js(`${btn('shed', 'steps')}?.getAttribute('aria-label') ?? ''`);
  check('a task with steps offers "Only the 1 step left to tomorrow"', stepsBtn.startsWith('Only the 1 step left to tomorrow'), stepsBtn);
  await I.click(btn('shed', 'steps'), 1500);
  const copy = liveT('Tidy the shed').find((t) => t.id !== 'shed');
  check('steps: today keeps its two ticked steps and is done; a copy with the one left is on tomorrow', live('shed').completed === true && live('shed').subtasks.length === 2 && !!copy && copy.dueDate === tomorrow && copy.subtasks.length === 1 && copy.subtasks[0].title === 'Paint' && copy.listKey === 'home', JSON.stringify(copy));
  await ctrlZ();
  check('one Ctrl+Z undoes both', live('shed').completed === false && live('shed').subtasks.length === 3 && liveT('Tidy the shed').length === 1);

  // the repeating day
  await I.click(btn('gym', 'letgo'), 1500);
  check('Let go on a repeating day skips today only: it still repeats tomorrow', !(await I.exists(`document.querySelector('[data-day-col="${today}"] [aria-label="Task Gym"]')`)) && (await I.exists(`document.querySelector('[data-day-col="${tomorrow}"] [aria-label="Task Gym"]')`)) && (await folded('gym')) === 'skip');

  // the shift
  await I.click(btn('shift', 'tomorrow'), 1800);
  check('Tomorrow on the shift takes the open item inside it; the done one stays today', live('shift').dueDate === tomorrow && live('ring').dueDate === tomorrow && live('ring').startTime === '14:00' && live('brief').dueDate === today, JSON.stringify(['shift', 'ring', 'brief'].map((id) => live(id).dueDate)));
  const fig = await I.textOf(`document.querySelector('[data-wrap-figure]')`);
  check('the figure says what tomorrow holds, the shift once', /^Tomorrow so far: \d+ tasks?/.test(fig) && !/missed/i.test(await I.body()), fig);
  await ctrlZ();
  check('one Ctrl+Z puts the shift and its item back on today', live('shift').dueDate === today && live('ring').dueDate === today);
  await I.click(`document.querySelector('[data-wrap-done]')`, 800);
  check('Done closes, and moves nothing else', !(await wrapOpen()) && live('water').dueDate === today && !live('water').completed);

  // ---- Earlier ----
  await I.click(`document.querySelector('[data-missed-button]')`, 900);
  const earlier = `[data-earlier]`;
  check('Earlier opens with its rows, the night shift with Handover under it', (await I.exists(`document.querySelector('${earlier}')`)) && (await I.js(`[...document.querySelectorAll('${earlier} [data-wrap-row]')].map((r) => r.getAttribute('data-wrap-row')).join(',')`)) === 'old1,night,hand,old3,old2');
  const hour = new Date().getHours();
  const hasToday = await I.exists(btn('old1', 'today'));
  check(`Today shows only before 14:00 (now ${hour}:00)`, hasToday === (hour >= 4 && hour < 14));
  check('the panel says Earlier, never "missed" or "overdue"; nothing red', !/missed|overdue/i.test(await I.textOf(`document.querySelector('${earlier}')`)) && (await noRed(earlier)));
  await I.shot('p58-earlier');
  await I.click(btn('old1', 'tomorrow'), 1200);
  check('Earlier, Tomorrow: saved at once', live('old1').dueDate === tomorrow && (await folded('old1')) === 'tomorrow');
  await I.click(btn('old2', 'list'), 1200);
  check('Earlier, Back to its list', !live('old2').dueDate && live('old2').listKey === 'home');
  await I.click(btn('old3', 'letgo'), 1200);
  check('Earlier, Let go: to the Trash', !live('old3'));
  await ctrlZ();
  check('Ctrl+Z in Earlier brings it back', liveT('Old three').length === 1 && (await I.exists(`document.querySelector('${earlier}')`)));
  await I.click(btn('night', 'tomorrow'), 1500);
  check('Earlier, Tomorrow on a shift takes Handover too', live('night').dueDate === tomorrow && live('hand').dueDate === tomorrow);
  await ctrlZ();
  check('one Ctrl+Z puts both back on their day', live('night').dueDate === yesterday && live('hand').dueDate === yesterday);
  await C.sleep(600);
  const tickAll = `document.querySelector('[data-earlier-tick-all]')`;
  const n = await I.js(`${tickAll}?.getAttribute('data-earlier-tick-all') ?? null`);
  check('Tick all counts what is still open (the night shift, Handover and Old three)', n === '3', String(n));
  await I.click(tickAll, 1800);
  const ticked = ['night', 'hand'].map(live).concat(liveT('Old three'));
  check('Tick all: every one is done on its own day (yesterday)', ticked.every((t) => t.completed && new Date(t.completedAt).getDate() === new Date(`${yesterday}T12:00:00`).getDate()), JSON.stringify(ticked.map((t) => [t.title, t.completedAt])));
  check('the pill counts nothing left (no zero shown)', (await pill()) === '0' && !(await I.exists(`document.querySelector('[data-missed-count]')`)));
  await I.click(`document.querySelector('[data-earlier-tick-all-undo]')`, 1500);
  check('Undo puts them all back, unticked', ['night', 'hand'].every((id) => !live(id).completed) && liveT('Old three').every((t) => !t.completed));
  await I.key('Escape', [], 600);
  check('Escape closes Earlier', !(await I.exists(`document.querySelector('${earlier}')`)));

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
