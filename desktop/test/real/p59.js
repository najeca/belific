'use strict';
// @real-input: quiet
// Real check for F4 of PLAN_daily_flow (3.43.0): Plan my day on one screen.
//   - the Plan button's menu (and Ctrl+Shift+P) opens it: no steps, no Next, no Cancel, one main button (Done); it takes
//     the place of the left pane and the centre, and the real Timebox stays on the right, on today;
//   - On today: a shift is one item ("2 inside"), its inside blocks are not rows of their own; unticking a repeating
//     task skips it today (the row folds with its own Undo, which brings it back); unticking a one off task sends it back
//     to its list (Ctrl+Z puts it back);
//   - Add to today: Today on a Brain Dump task and on a list's task (the picker); a repeating task whose next day is not
//     today moves that day here; a task dragged from the list onto the Timebox gets today and that time (Ctrl+Z);
//   - earlier days are one folded line that opens Earlier, and closing it comes back to Plan my day;
//   - Done closes and the panes come back; nothing red, words 14 px or more;
//   - Settings: "Remind me to plan my day", off by default, writes the setting with its time.
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
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const all7 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const tomorrowName = all7[new Date(`${tomorrow}T12:00:00`).getDay()];
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      T('pay', 'Pay the gas bill', { dueDate: today, listKey: 'home' }),
      T('paid', 'Paid rent', { dueDate: today, completed: true, completedAt: stamp }),
      T('water', 'Water the plants', { dueDate: today, recurrence: 'weekly', recurrenceDays: all7 }),
      T('shift', 'Shift', { dueDate: today, startTime: '05:00', durationMinutes: 180 }),
      T('brief', 'Briefing', { dueDate: today, startTime: '05:30', durationMinutes: 30 }),
      T('lunch', 'Early call', { dueDate: today, startTime: '07:00', durationMinutes: 30 }),
      T('boiler', 'Book the boiler service'),
      T('bank', 'Ring the bank', { durationMinutes: 30 }),
      T('shed', 'Tidy the shed', { listKey: 'home' }),
      T('clinic', 'Clinic', { dueDate: tomorrow, recurrence: 'weekly', recurrenceDays: [tomorrowName] }),
      T('old', 'Old one', { dueDate: dk(-1) }),
    ]),
  );
  fs.writeFileSync(path.join(dataDir, 'belific_lists.kv'), JSON.stringify([{ key: 'home', name: 'House jobs', emoji: '🏠', sortOrder: 0, createdAt: stamp, updatedAt: stamp }]));
  const read = readKv(dataDir);
  const raw = () => read('belific_tasks') || [];
  const live = (id) => raw().find((t) => t.id === id && !t.deletedAt);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1600, 1000);
  win.show();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await I.waitBody('Book the boiler service', 20000);
  await I.click(I.byLabel('Show Tasks'), 900).catch(() => {});
  await C.sleep(800);
  const ctrlZ = async () => {
    await I.blur();
    await I.key('Z', ['control'], 1600);
  };
  const screen = `document.querySelector('[data-plan-day]')`;
  const open = () => I.exists(screen);
  const shown = (sel) => I.js(`(() => { const e = document.querySelector('${sel}'); return !!e && e.getBoundingClientRect().width > 0; })()`);
  const row = (key) => I.exists(`document.querySelector('[data-plan-row="${key}"]')`);
  const folded = (key) => I.js(`document.querySelector('[data-plan-day] [data-wrap-row="${key}"]')?.getAttribute('data-wrap-decided') ?? null`);

  // ---- open ----
  await I.click(`document.querySelector('[data-plan-menu]')`, 500);
  await I.click(`document.querySelector('[data-popover] [aria-label="Plan my day from the menu"]')`, 1200);
  check('Plan my day opens on one screen: no steps, no Next, no Cancel; one main button, Done', (await open()) && !/Step \d of/.test(await I.body()) && !(await I.exists(I.byLabel('Next step'))) && !(await I.exists(I.byLabel('Cancel and change nothing'))) && (await I.exists(`document.querySelector('[data-plan-done]')`)));
  check('it takes the place of the left pane and the centre; the Timebox stays on the right', !(await shown('[data-pane="left"]')) && !(await shown('[data-pane="center"]')) && (await shown('[data-pane="right"]')) && (await shown('[data-timebox-grid]')));
  check('nothing is red and every word is 14 px or more', (await I.js(`![...document.querySelectorAll('[data-plan-day] *')].some((e) => { const m = /rgb\\((\\d+), (\\d+), (\\d+)/.exec(getComputedStyle(e).color); return m && +m[1] > 180 && +m[2] < 110 && +m[3] < 110; })`)) && (await I.js(`[...document.querySelectorAll('[data-plan-day] *')].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 14).length`)) === 0);
  await I.shot('p59-plan-my-day');

  // ---- On today ----
  const shiftMeta = await I.textOf(`document.querySelector('[data-plan-row="shift"]')`);
  check('a shift is one item, with what is inside it folded into it ("2 inside")', shiftMeta.includes('2 inside') && !(await row('brief')) && !(await row('lunch')), shiftMeta);
  check('On today lists the day\'s tasks, the repeating one and the done one too', (await row('pay')) && (await row('water')) && (await row('paid')));
  await I.click(`document.querySelector('[data-plan-untick="water"]')`, 1500);
  check('unticking a repeating task skips it today: the row folds, "Skipped today"', !(await row('water')) && (await folded('water')) === 'skipToday' && !raw().some((t) => t.id.startsWith('water') && !t.deletedAt && t.dueDate === today));
  await I.click(`document.querySelector('[data-plan-day] [data-wrap-undo="water"]')`, 1500);
  // The first day of a series comes back stored as water:<day> (with its rule), as undoing a skip always has.
  check('its Undo brings it back on today', (await I.exists(`document.querySelector('[data-plan-row^="water"]')`)) && raw().some((t) => t.id.startsWith('water') && !t.deletedAt && t.dueDate === today && t.recurrence));
  await I.click(`document.querySelector('[data-plan-untick="pay"]')`, 1500);
  check('unticking a one off task sends it back to its list', !live('pay').dueDate && live('pay').listKey === 'home' && (await folded('pay')) === 'notToday');
  await ctrlZ();
  check('Ctrl+Z in Plan my day puts it back on today', live('pay').dueDate === today && (await row('pay')));

  // ---- Add to today ----
  check('Add to today shows Brain Dump first, with its tasks', (await I.exists(`document.querySelector('[data-plan-today="boiler"]')`)) && !(await I.exists(`document.querySelector('[data-plan-today="shed"]')`)));
  await I.click(`document.querySelector('[data-plan-today="boiler"]')`, 1500);
  check('Today on a Brain Dump task: on today, untimed; it shows on the left', live('boiler').dueDate === today && !live('boiler').startTime && (await row('boiler')) && (await I.js(`document.querySelector('[data-plan-day] [data-wrap-row="boiler"]')?.getAttribute('data-wrap-decided')`)) === 'addToday');
  await I.js(`(() => { const s = document.querySelector('[data-plan-list]'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, 'home'); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await C.sleep(900);
  check('the picker shows a list\'s tasks', await I.exists(`document.querySelector('[data-plan-today="shed"]')`));
  await I.click(`document.querySelector('[data-plan-today="shed"]')`, 1500);
  check('Today on a list\'s task: on today', live('shed').dueDate === today && (await row('shed')));
  const clinicKey = await I.js(`document.querySelector('[data-plan-add^="clinic"]')?.getAttribute('data-plan-add') ?? null`);
  check('a repeating task whose next day is not today is offered, with its next day', !!clinicKey && (await I.textOf(`document.querySelector('[data-plan-add^="clinic"]')`)).includes('next:'), String(clinicKey));
  await I.click(`document.querySelector('[data-plan-today^="clinic"]')`, 1800);
  check('Today on it moves that one day here; it still repeats', raw().some((t) => t.id.startsWith('clinic') && !t.deletedAt && t.dueDate === today) && raw().some((t) => t.id.startsWith('clinic') && t.recurrence));
  await ctrlZ();
  check('Ctrl+Z takes it back', !raw().some((t) => t.id.startsWith('clinic') && !t.deletedAt && t.dueDate === today));

  // ---- drag onto the Timebox ----
  await I.js(`(() => { const s = document.querySelector('[data-plan-list]'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, ''); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await C.sleep(900);
  // The Timebox scrolled so 11:00 is in view.
  await I.js(`(() => { const g = document.querySelector('[data-timebox-grid]'); let p = g.parentElement; while (p && p.scrollHeight <= p.clientHeight + 2) p = p.parentElement; if (p) p.scrollTop += g.getBoundingClientRect().top - p.getBoundingClientRect().top + 9 * 56; return true; })()`);
  await C.sleep(400);
  await I.drag(`document.querySelector('[data-plan-add="bank"]')`, '[data-timebox-grid]', 10 * 60, 11 * 60, { toXExpr: `document.querySelector('[data-timebox-grid]')` });
  await C.waitFor(() => live('bank').dueDate === today, 4000).catch(() => {});
  check('a task dragged from Add to today onto the Timebox gets today and that time', live('bank').dueDate === today && /^1[01]:/.test(live('bank').startTime || ''), JSON.stringify(live('bank')));
  check('and it shows on the left, timed', (await row('bank')) && (await I.textOf(`document.querySelector('[data-plan-row="bank"]')`)).includes('am'));
  await ctrlZ();
  check('Ctrl+Z takes the drop back', !live('bank').dueDate && !live('bank').startTime);
  check('the planned figure counts the shift once', /^Planned \d+h/.test(await I.textOf(`document.querySelector('[data-plan-figure]')`)), await I.textOf(`document.querySelector('[data-plan-figure]')`));

  // ---- earlier days, folded ----
  check('earlier days are one folded line, "1 from earlier days"', (await I.textOf(`document.querySelector('[data-plan-earlier]')`)).includes('1 from earlier days') && !/missed|overdue/i.test(await I.textOf(screen)));
  await I.click(`document.querySelector('[data-plan-earlier]')`, 1000);
  check('it opens Earlier', await I.exists(`document.querySelector('[data-earlier]')`));
  await I.key('Escape', [], 1000);
  check('closing Earlier comes back to Plan my day', (await open()) && !(await I.exists(`document.querySelector('[data-earlier]')`)));

  // ---- Done ----
  await I.click(`document.querySelector('[data-plan-done]')`, 900);
  check('Done closes; the panes come back', !(await open()) && (await shown('[data-pane="center"]')));
  await I.blur();
  await I.key('P', ['control', 'shift'], 1000);
  check('Ctrl+Shift+P opens Plan my day', await open());
  await I.key('Escape', [], 800);
  check('Escape closes it', !(await open()));

  // ---- the morning note setting ----
  const ic = (await I.exists(I.byLabel('Profile and account'))) ? 'Profile and account' : 'Profile, not signed in';
  await I.click(I.byLabel(ic), 500);
  await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 900);
  await I.waitBody('POWER FEATURES', 8000);
  const sw = I.byLabel('Remind me to plan my day');
  check('Settings has "Remind me to plan my day", off by default, beside the evening note', (await I.exists(sw)) && (await I.js(`${sw}.getAttribute('aria-checked')`)) === 'false' && (await I.body()).includes('Remind me to wrap up'));
  await I.click(sw, 900);
  const prefs = await I.js(`globalThis.belificDesktop.settings.get()`);
  check('turning it on saves it, at 08:00 unless changed; the time can be set', prefs.planReminder === true && prefs.planTime === '08:00' && (await I.exists(I.byLabel('Plan my day reminder time'))), JSON.stringify(prefs));
  check('its words are plain', (await I.body()).includes('Time to plan your day, if you like.'));

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
