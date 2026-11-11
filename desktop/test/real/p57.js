'use strict';
// @real-input: quiet
// Real check for F2 of PLAN_daily_flow (3.41.0): the Clear tools, the batch undo, the avatar menu trimmed, the repeat
// rule undo and the carry of a shift moved a whole day.
//   - the avatar menu has only the account and Settings; Settings has Quick capture, Search, Keyboard shortcuts, Progress
//     and Trash as links; Q still opens Quick capture;
//   - Clear day (today, from the day menu): "Clear 3 tasks from today?" (a shift with two inside it, one plain task, one
//     repeating day; a done task is not counted), "This day only" or "All days" with All days chosen; This day only: the
//     one off tasks go back to their lists (Day and time cleared), Gym's day is skipped; one Ctrl+Z puts all back;
//     All days: Gym stops repeating and goes back to its list; one Ctrl+Z brings the rule back;
//   - Clear week (the Tasks board's week menu): one batch, one Ctrl+Z;
//   - Clear list (House jobs): its two unticked tasks to the Trash, the done one stays; one Ctrl+Z restores them;
//   - Clear label (Work): the label off its two tasks (the done one keeps it); one Ctrl+Z; then "Move the 2 tasks to
//     Trash"; one Ctrl+Z;
//   - Delete repeating task on Gym, then one Ctrl+Z: Gym repeats again (tomorrow shows it) (before Clear week: undoing a
//     skipped repeating day gives that day back as a plain copy, as undo always has);
//   - "Move to today" on Late shift (in two days) takes Handover (inside it) to today too; one Ctrl+Z.
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
  const later = dk(2);
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const all7 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      T('shift', 'Shift', { dueDate: today, startTime: '08:00', durationMinutes: 600 }),
      T('brief', 'Briefing', { dueDate: today, startTime: '08:30', durationMinutes: 30 }),
      T('lunch', 'Lunch', { dueDate: today, startTime: '13:00', durationMinutes: 30 }),
      T('bank', 'Call bank', { dueDate: today, listKey: 'home' }),
      T('donet', 'Done today', { dueDate: today, completed: true, completedAt: stamp }),
      T('gym', 'Gym', { dueDate: today, startTime: '19:00', durationMinutes: 60, recurrence: 'weekly', recurrenceDays: all7 }),
      T('shelf', 'Fix shelf', { listKey: 'home' }),
      T('door', 'Paint door', { listKey: 'home' }),
      T('oldjob', 'Old job', { listKey: 'home', completed: true, completedAt: stamp }),
      T('report', 'Report', { projectKey: 'W' }),
      T('slides', 'Slides', { projectKey: 'W', dueDate: tomorrow }),
      T('oldrep', 'Old report', { projectKey: 'W', completed: true, completedAt: stamp }),
      T('late', 'Late shift', { dueDate: later, startTime: '08:00', durationMinutes: 600 }),
      T('hand', 'Handover', { dueDate: later, startTime: '09:00', durationMinutes: 30 }),
    ]),
  );
  fs.writeFileSync(path.join(dataDir, 'belific_lists.kv'), JSON.stringify([{ key: 'home', name: 'House jobs', emoji: '🏠', sortOrder: 0, createdAt: stamp, updatedAt: stamp }]));
  fs.writeFileSync(path.join(dataDir, 'belific_projects.kv'), JSON.stringify([{ key: 'W', name: 'Work', colorKey: 'sage', createdAt: stamp, updatedAt: stamp }]));
  const read = readKv(dataDir);
  const raw = () => read('belific_tasks') || [];
  const live = (id) => raw().find((t) => t.id === id && !t.deletedAt);
  const liveT = (title) => raw().find((t) => t.title === title && !t.deletedAt);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1920, 1000);
  win.show();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await I.waitBody('Call bank', 20000);
  await I.click(I.byLabel('Show Tasks'), 900).catch(() => {});
  await C.sleep(800);
  const profileIcon = async () => ((await I.exists(I.byLabel('Profile and account'))) ? 'Profile and account' : 'Profile, not signed in');
  const undo = async () => {
    await I.blur();
    await I.key('Escape', [], 200);
    await I.key('Z', ['control'], 1600);
  };
  const box = `document.querySelector('[data-clear-box]')`;

  // ---- the avatar menu and Settings ----
  await I.click(I.byLabel(await profileIcon()), 500);
  const rows = await I.js(`[...document.querySelectorAll('[role="dialog"][aria-label="Profile menu"] [role="button"]')].map((b) => b.getAttribute('aria-label'))`);
  check('the avatar menu has Settings and the account, and no Quick capture, Search, Keyboard shortcuts, Progress or Trash', rows.includes('Settings') && !rows.some((r) => ['Quick capture', 'Search tasks', 'Keyboard shortcuts', 'Progress', 'Trash'].includes(r)), JSON.stringify(rows));
  await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 700);
  await I.waitBody('POWER FEATURES', 8000);
  const links = await I.js(`[...document.querySelectorAll('[data-settings-link]')].map((e) => e.getAttribute('data-settings-link'))`);
  check('Settings has links to Quick capture, Search, Keyboard shortcuts, Progress and Trash', JSON.stringify(links) === JSON.stringify(['Quick capture', 'Search', 'Keyboard shortcuts', 'Progress', 'Trash']), JSON.stringify(links));
  await I.click(`document.querySelector('[data-settings-link="Trash"]')`, 900);
  check('the Trash link opens the Trash', (await I.body()).includes('Trash'));
  await I.click(I.byLabel('Back'), 800);
  if (!(await I.exists(`document.querySelector('[data-settings-link]')`))) {
    await I.click(I.byLabel(await profileIcon()), 500);
    await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 700);
    await I.waitBody('POWER FEATURES', 8000);
  }
  await I.click(`document.querySelector('[data-settings-link="Quick capture"]')`, 900);
  check('the Quick capture link goes home and opens Quick capture', await I.exists(`document.querySelector('[aria-label="Quick capture"][role="dialog"]')`));
  await I.key('Escape', [], 500);
  await I.blur();
  await I.key('Q', [], 700);
  check('Q still opens Quick capture', await I.exists(`document.querySelector('[aria-label="Quick capture"][role="dialog"]')`));
  await I.key('Escape', [], 500);

  // ---- Clear day: this day only ----
  const openClearDay = async () => {
    await I.click(`document.querySelector('[data-day-menu="${today}"]')`, 600);
    await I.click(`document.querySelector('[data-popover] [aria-label^="Clear "]')`, 800);
  };
  await openClearDay();
  const q = await I.textOf(box);
  check('Clear day asks first: "Clear 3 tasks from today?", in plain words, with the shift as one and the repeat choice', q.includes('Clear 3 tasks from today?') && q.includes('Nothing is deleted') && q.includes('A shift counts as one, with the 2 tasks inside it.') && q.includes('This day only') && q.includes('All days'), q);
  const chosen = await I.js(`(() => { const a = document.querySelector('[data-clear-scope="all"]'); return a ? a.getAttribute('aria-checked') : null; })()`);
  check('All days is chosen; the main button says "Clear 3 tasks"; nothing is red', chosen === 'true' && (await I.exists(`document.querySelector('[data-clear-go][aria-label="Clear 3 tasks"]')`)) && (await I.js(`![...document.querySelectorAll('[data-clear-box] *')].some((e) => { const m = /rgb\\((\\d+), (\\d+), (\\d+)/.exec(getComputedStyle(e).color); return m && +m[1] > 180 && +m[2] < 110 && +m[3] < 110; })`)), String(chosen));
  await I.shot('p57-clear-day');
  await I.click(`document.querySelector('[data-clear-scope="day"]')`, 300);
  await I.click(`document.querySelector('[data-clear-go]')`, 1800);
  check('This day only: the shift, its two and Call bank lose their day; Call bank keeps its list; nothing is deleted', ['shift', 'brief', 'lunch', 'bank'].every((id) => live(id) && !live(id).dueDate) && live('bank').listKey === 'home', JSON.stringify(['shift', 'brief', 'lunch', 'bank'].map((id) => live(id) && live(id).dueDate)));
  check('the done task stays on its day; Gym\'s day today is skipped but it still repeats', live('donet').dueDate === today && !(await I.exists(`document.querySelector('[data-day-col="${today}"] [aria-label="Task Gym"]')`)) && (await I.exists(`document.querySelector('[data-day-col="${tomorrow}"] [aria-label="Task Gym"]')`)));
  await undo();
  check('one Ctrl+Z puts everything back (the shift, its two, Call bank and Gym today)', ['shift', 'brief', 'lunch', 'bank'].every((id) => live(id) && live(id).dueDate === today) && (await I.exists(`document.querySelector('[data-day-col="${today}"] [aria-label="Task Gym"]')`)), JSON.stringify(['shift', 'brief', 'lunch', 'bank'].map((id) => live(id) && live(id).dueDate)));

  // ---- Clear day: all days ----
  await openClearDay();
  await I.click(`document.querySelector('[data-clear-go]')`, 2000);
  const gymRows = raw().filter((t) => t.id === 'gym' || t.id.startsWith('gym:'));
  check('All days: Gym stops repeating and goes back to its list (no Day); it shows on no day', gymRows.every((t) => !t.recurrence) && !!liveT('Gym') && !liveT('Gym').dueDate && !(await I.exists(`document.querySelector('[data-day-col="${tomorrow}"] [aria-label="Task Gym"]')`)), JSON.stringify(gymRows.map((t) => [t.id, t.dueDate, t.recurrence, !!t.deletedAt])));
  await undo();
  check('one Ctrl+Z brings the rule back: Gym is on today and tomorrow again', liveT('Gym').recurrence === 'weekly' && (await I.exists(`document.querySelector('[data-day-col="${today}"] [aria-label="Task Gym"]')`)) && (await I.exists(`document.querySelector('[data-day-col="${tomorrow}"] [aria-label="Task Gym"]')`)), JSON.stringify(liveT('Gym')));

  // ---- Delete repeating task, then undo: the rule comes back ----
  await I.js(`(() => { const c = [...document.querySelectorAll('[data-day-col="${today}"] [aria-label="Task Gym"]')][0]; const b = c && c.querySelector('[data-ctl="more"]'); if (b) b.click(); })()`);
  await C.sleep(500);
  await I.click(`document.querySelector('[data-popover] [aria-label="Delete repeating task"]')`, 500);
  await I.click(`document.querySelector('[data-popover] [aria-label="Confirm delete repeating task"]')`, 1500);
  check('Gym is deleted (no day shows it)', !(await I.exists(`document.querySelector('[data-day-col="${tomorrow}"] [aria-label="Task Gym"]')`)));
  await undo();
  await C.sleep(600);
  check('one Ctrl+Z: Gym repeats again (tomorrow shows it)', await I.exists(`document.querySelector('[data-day-col="${tomorrow}"] [aria-label="Task Gym"]')`));

  // ---- Clear week ----
  await I.click(`document.querySelector('[data-week-menu]')`, 600);
  await I.click(`document.querySelector('[data-popover] [aria-label="Clear week"]')`, 800);
  const wq = await I.textOf(box);
  check('Clear week asks with the count first', /Clear \d+ tasks from \d+ \w+ to \d+ \w+\?/.test(wq), wq);
  await I.click(`document.querySelector('[data-clear-scope="day"]')`, 300);
  await I.click(`document.querySelector('[data-clear-go]')`, 2200);
  const inWeek = ['shift', 'bank'].concat(raw().some((t) => t.id === 'slides' && t.dueDate) ? [] : []);
  check('the week\'s tasks go back to their lists', inWeek.every((id) => !live(id).dueDate), JSON.stringify(inWeek.map((id) => live(id).dueDate)));
  await undo();
  check('one Ctrl+Z puts the whole week back', live('shift').dueDate === today && live('bank').dueDate === today && live('brief').dueDate === today);

  // ---- Clear list ----
  await I.click(`document.querySelector('[aria-label^="List: "][aria-label$="Change list"]')`, 500);
  await I.click(I.byLabel('Edit list House jobs'), 600);
  await I.click(`document.querySelector('[data-clear-list="home"]')`, 800);
  const lq = await I.textOf(box);
  check('Clear list: "Clear 3 tasks from the list House jobs?" (Call bank is in it too), they move to the Trash', lq.includes('Clear 3 tasks from the list House jobs?') && lq.includes('Trash'), lq);
  await I.click(`document.querySelector('[data-clear-go]')`, 1500);
  check('its unticked tasks are in the Trash; the done one stays', !liveT('Fix shelf') && !liveT('Paint door') && !liveT('Call bank') && !!liveT('Old job'));
  await undo();
  check('one Ctrl+Z restores them', !!liveT('Fix shelf') && !!liveT('Paint door') && !!liveT('Call bank'));
  await I.key('Escape', [], 300);

  // ---- Clear label ----
  // The Labels overlay opens from Settings; Ctrl+Z is a home screen key, so the check goes home to undo (as a person would).
  const openLabels = async () => {
    await I.click(I.byLabel(await profileIcon()), 500);
    await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 700);
    await I.waitBody('POWER FEATURES', 8000);
    await I.click(I.byLabel('Open Labels'), 900);
    await I.click(`document.querySelector('[data-clear-label="W"]')`, 900);
  };
  const home = async () => {
    await I.key('Escape', [], 400);
    if (await I.exists(I.byLabel('Back'))) await I.click(I.byLabel('Back'), 800);
    await C.sleep(400);
  };
  await openLabels();
  const bq = await I.textOf(box);
  check('Clear label: "Clear the label Work from 2 tasks?", main button and a smaller "Move the 2 tasks to Trash"', bq.includes('Clear the label Work from 2 tasks?') && (await I.exists(`document.querySelector('[data-clear-go][aria-label="Take the label off 2 tasks"]')`)) && (await I.exists(`document.querySelector('[data-clear-trash][aria-label="Move the 2 tasks to Trash"]')`)), bq);
  await I.shot('p57-clear-label');
  await I.click(`document.querySelector('[data-clear-go]')`, 1500);
  check('the label comes off Report and Slides; Old report (done) keeps it', !liveT('Report').projectKey && !liveT('Slides').projectKey && liveT('Old report').projectKey === 'W');
  await home();
  await undo();
  check('one Ctrl+Z puts the label back', liveT('Report').projectKey === 'W' && liveT('Slides').projectKey === 'W');
  await openLabels();
  await I.click(`document.querySelector('[data-clear-trash]')`, 1500);
  check('"Move the 2 tasks to Trash": both go to the Trash', !liveT('Report') && !liveT('Slides') && !!liveT('Old report'));
  await home();
  await undo();
  check('one Ctrl+Z restores both', !!liveT('Report') && !!liveT('Slides'));
  await I.click(I.byLabel('Show Tasks'), 700).catch(() => {});
  await C.sleep(600);

  // ---- Move to today takes what is inside along ----
  await I.js(`(() => { const b = document.querySelector('[data-day-col="${later}"] [aria-label="Move Late shift to today"]'); if (b) b.click(); return !!b; })()`);
  await C.sleep(1500);
  check('"Move to today" on Late shift takes Handover (inside it) to today, at the same time', live('late').dueDate === today && live('hand').dueDate === today && live('hand').startTime === '09:00', JSON.stringify([live('late').dueDate, live('hand').dueDate]));
  await undo();
  check('one Ctrl+Z puts both back', live('late').dueDate === later && live('hand').dueDate === later);

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
