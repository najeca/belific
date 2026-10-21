'use strict';
// Real check for build plan phase 7 (power feature toggles, Labels overlay,
// pomodoro on the task timer, task templates, reset local cache, emoji on the
// Settings, Labels and Progress pages) on the desktop: real mouse and key input
// into the real app, on an isolated data folder asserted NOT to be the real one;
// Supabase is the in process fake (signed out, nothing leaves the machine).
// A pomodoro whose focus period ended 1 minute ago is seeded (and a task timer
// started 26 minutes ago) so the break, the whole minute rounding and the one
// timer rule can be checked without waiting 25 minutes.
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
  const today = dayKeyFrom(now)(0);
  const stamp = '2026-09-01T07:00:00.000Z';
  const MIN = 60000;
  const ago = (ms) => new Date(Date.now() - ms).toISOString();
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      // The focus period ended a minute ago; the timer under it has run 26 minutes.
      T('a1', 'Alpha', { priority: 'high', reminderMinutes: 15, projectKey: 'work', durationMinutes: 30, timerStartedAt: ago(26 * MIN + 20000), actualMinutes: 4 }),
      T('b1', 'Beta'),
      T('g1', 'Gamma', { durationMinutes: 45, notes: 'weekly notes', projectKey: 'work', priority: 'low', subtasks: [{ id: 'st1', title: 'First step', done: true }, { id: 'st2', title: 'Second step', done: false }], dueDate: today, completed: false }),
      T('q1', 'Quest', { dueDate: today, recurrence: 'daily' }),
    ]),
  );
  fs.writeFileSync(
    path.join(dataDir, 'belific_projects.kv'),
    JSON.stringify([
      { key: 'work', name: 'Work', colorKey: 'sage', createdAt: stamp, updatedAt: stamp },
      { key: 'home', name: 'Home', colorKey: 'clay', createdAt: stamp, updatedAt: stamp },
    ]),
  );
  fs.writeFileSync(
    path.join(dataDir, 'belific_desktop_pomodoro.kv'),
    JSON.stringify({ taskId: 'a1', phase: 'focus', startedMs: Date.now() - 26 * MIN, focusMinutes: 25, breakMinutes: 5, cycle: 1 }),
  );
  const read = readKv(dataDir);
  const tasks = () => read('belific_tasks') || [];
  const byId = (id) => tasks().find((t) => t.id === id);
  const settings = () => read('belific_user_settings') || [];
  const setting = (key) => settings().find((s) => s.key === key && !s.deletedAt);
  const labelNamed = (name) => (read('belific_projects') || []).find((p) => p.name === name && !p.deletedAt);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await I.waitBody('Beta', 20000);
  // 2.28.0: the app opens on the Calendar; these checks start on the Tasks view.
  await I.click(I.byLabel('Show Tasks'), 600);
  await C.sleep(800);
  const profileIcon = async () => ((await I.exists(I.byLabel('Profile and account'))) ? 'Profile and account' : 'Profile, not signed in');
  const openFromMenu = async (label) => {
    await I.click(I.byLabel(await profileIcon()));
    await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="${label}"]')`, 600);
  };
  const menuHas = async (label) => {
    await I.click(I.byLabel(await profileIcon()));
    const has = await I.exists(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="${label}"]')`);
    await I.key('Escape');
    return has;
  };
  const card = (title) => `Array.from(document.querySelectorAll('[aria-label=${JSON.stringify(`Task ${title}`)}]')).find((e) => e.getBoundingClientRect().width > 0)`;
  const focusCard = async (title) => {
    await I.js(`(() => { const c = ${card(title)}; if (c) c.focus(); })()`);
    await C.sleep(150);
  };
  const back = async () => {
    await I.click(I.byLabel('Back'));
    await I.waitBody('Beta', 8000);
  };
  const checked = (label) => I.js(`(() => { const e = ${I.byLabel(label)}; return e ? !!e.checked : null; })()`);
  const text = (label) => I.textOf(I.byLabel(label));
  const anyExists = (sel) => I.js(`!!document.querySelector(${JSON.stringify(sel)})`);
  const openSettings = async () => {
    await openFromMenu('Settings');
    await I.waitBody('POWER FEATURES', 8000);
  };

  // ======== 1. Settings: the power feature toggles ========
  await openSettings();
  const upper = (await I.body()).toUpperCase();
  // 2.45.0 (the Ellie look, on purpose): the section icons are thin line icons now, not emoji; the titles are unchanged.
  const hasIcon = (title) => I.js(`(() => { const h = [...document.querySelectorAll('[role="heading"]')].find((e) => e.textContent.trim().toUpperCase() === ${JSON.stringify(title)}); const p = h && h.previousElementSibling; return !!p && /ionicons/i.test(getComputedStyle(p).fontFamily); })()`);
  const secTitles = ['ACCOUNT', 'SYNC', 'PLANNING', 'DATA', 'LABELS', 'ABOUT', 'POWER FEATURES'];
  const secIcons = [];
  for (const t of secTitles) secIcons.push(await hasIcon(t));
  check('Settings sections each carry a line icon (Account, Sync, Planning, Data, Labels, About, Power features)', secTitles.every((s) => upper.includes(s)) && secIcons.every(Boolean), JSON.stringify(secIcons));
  check('the old section names still work for readers (accessible name "Account settings")', await I.exists(I.byLabel('Account settings')));
  check('defaults: reminders, planning and analytics are on', (await checked('🔔 Due dates and reminders')) === true && (await checked('🌅 Daily planning')) === true && (await checked('📊 Analytics')) === true);
  check('2.26.0: there is no Priority toggle (priority was removed from the interface)', (await checked('🚩 Priority')) === null && !(await I.body()).includes('Priority'));
  check('defaults: pomodoro and templates are off', (await checked('🍅 Pomodoro')) === false && (await checked('📑 Task templates')) === false);
  check('attachments say "Coming later" and have no switch', (await I.exists(I.byLabel('Attachments, coming later'))) && (await checked('📎 Attachments')) === null && (await I.body()).includes('Coming later'));
  await I.shot('p7-01-power-features');

  // Analytics off hides the profile menu row.
  await I.click(I.byLabel('📊 Analytics'));
  await C.waitFor(() => setting('feature.analytics'), 6000).catch(() => {});
  check('a toggle is one user_settings row ("off")', setting('feature.analytics')?.value === 'off', JSON.stringify(setting('feature.analytics')));
  check('Analytics off: the profile menu no longer lists it', (await menuHas('Analytics')) === false && (await menuHas('Trash')) === true);
  await I.click(I.byLabel('📊 Analytics'));
  await C.waitFor(() => setting('feature.analytics')?.value === 'on', 6000).catch(() => {});
  check('Analytics on again: the row is back', (await menuHas('Analytics')) === true);

  // 2.26.0: priority is gone from the interface, its stored value is kept.
  await back();
  check('no priority flag on any card (Alpha is stored as high)', !(await anyExists('[aria-label^="Priority:"]')));
  await focusCard('Alpha');
  await I.key('o');
  await C.waitFor(async () => I.exists(I.byLabel('Task details')), 8000);
  check('no Priority field in the details', !(await I.exists(`document.querySelector('[aria-label="Task details"] [aria-label="High"]')`)));
  // 2.27.1: the estimate is the time drop-down.
  await I.click(`document.querySelector('[aria-label="Task details"] [data-duration-select="Estimated time"]')`);
  await I.click(`document.querySelector('[data-popover] [aria-label="Estimated time 1 h"]')`);
  await C.waitFor(() => byId('a1').durationMinutes === 60, 6000).catch(() => {});
  check('editing the task keeps its stored priority (Alpha is still high)', byId('a1').durationMinutes === 60 && byId('a1').priority === 'high', JSON.stringify(byId('a1')));
  await I.key('Escape');

  // Reminders off.
  await openSettings();
  await I.click(I.byLabel('🔔 Due dates and reminders'));
  await C.waitFor(() => setting('feature.dueDates')?.value === 'off', 6000).catch(() => {});
  await back();
  // 2.27.0: the reminder is set in the task details (no bell on the card face).
  const reminderRow = async () => {
    await focusCard('Alpha');
    await I.key('o');
    await C.waitFor(() => I.exists(I.dialog('Task details')), 4000).catch(() => {});
    const has = await I.exists(`${I.dialog('Task details')}.querySelector('[aria-label^="Reminder:"]')`);
    await I.key('Escape');
    await C.sleep(300);
    return has;
  };
  check('Reminders off: no bell on any card and no Reminder row in the details', !(await anyExists('[aria-label^="Reminder:"]')) && !(await reminderRow()));
  check('Reminders off: the reminder already set is kept', byId('a1').reminderMinutes === 15);

  // Both back on.
  await openSettings();
  await I.click(I.byLabel('🔔 Due dates and reminders'));
  await C.waitFor(() => setting('feature.dueDates')?.value === 'on', 6000).catch(() => {});
  await back();
  check('reminders on again: the Reminder row is back in the details', await reminderRow());

  // Daily planning off.
  check('planning is on: the profile menu has Plan my day and Shut down my day', (await menuHas('Plan my day')) && (await menuHas('Shut down my day')));
  await openSettings();
  await I.click(I.byLabel('🌅 Daily planning'));
  await C.waitFor(() => setting('feature.planning')?.value === 'off', 6000).catch(() => {});
  await back();
  check('Planning off: the profile menu rows are gone', !(await menuHas('Plan my day')) && !(await menuHas('Shut down my day')));
  await I.js('document.activeElement && document.activeElement.blur()');
  await I.key('P', ['control', 'shift']);
  check('Planning off: Ctrl+Shift+P opens nothing', !(await I.exists(I.byLabel('Close daily planning'))) && !(await I.body()).includes('Good morning'));
  await openSettings();
  await I.click(I.byLabel('🌅 Daily planning'));
  await C.waitFor(() => setting('feature.planning')?.value === 'on', 6000).catch(() => {});
  await back();
  check('Planning on: the rows are back', await menuHas('Plan my day'));

  // ======== 2. Labels is an overlay, with emoji ========
  await openSettings();
  await I.click(I.byLabel('Open Labels'));
  await C.waitFor(async () => I.exists(I.dialog('Labels')), 6000);
  check('Labels opens as an overlay over Settings: the Settings page is still behind it', (await I.body()).toUpperCase().includes('NOTIFICATIONS') && (await I.exists(I.dialog('Labels'))));
  check('and it is not a page: there is no Back-to-Settings step (Back is still Settings\' own)', await I.exists(I.byLabel('Close')));
  await I.shot('p7-02-labels-overlay');
  await I.click(I.byLabel('Emoji of Work'));
  await I.click(I.byLabel('Emoji for Work'));
  await I.type('💼');
  await C.waitFor(() => labelNamed('Work')?.emoji === '💼', 6000).catch(() => {});
  check('a label can have an emoji: it is saved on the label', labelNamed('Work')?.emoji === '💼', JSON.stringify(labelNamed('Work')));
  check('the overlay shows it on the label row', (await I.textOf(I.dialog('Labels'))).includes('Work'));
  await I.js('document.activeElement && document.activeElement.blur()');
  // 2.27.1: the emoji is set in the label's edit form (a popover): Escape closes it first.
  await I.key('Escape');
  await C.sleep(300);
  await I.key('Escape');
  await C.sleep(300);
  check('Escape closes the overlay and focus returns to the button that opened it', !(await I.exists(I.dialog('Labels'))) && (await I.activeLabel()) === 'Open Labels', String(await I.activeLabel()));
  check('Settings is still showing after the overlay closed', (await I.body()).toUpperCase().includes('NOTIFICATIONS'));
  await I.click(I.byLabel('Open Labels'));
  await C.waitFor(async () => I.exists(I.dialog('Labels')), 6000);
  // The middle of the scrim is the card, so the press goes to its corner.
  await I.click(`({ getBoundingClientRect: () => ({ x: 6, y: 60, width: 4, height: 4 }), scrollIntoView() {} })`);
  await C.sleep(250);
  check('a press outside the card closes it too', !(await I.exists(I.dialog('Labels'))));
  await back();
  check('the new label emoji shows on the card (💼 Work)', (await I.body()).includes('💼'));

  // ======== 3. Pomodoro on the task timer ========
  check('pomodoro is off by default: no pomodoro button on a card, no countdown', !(await anyExists('[aria-label^="Start a pomodoro on"]')) && !(await I.exists(I.byLabel('Pomodoro status'))));
  check('the seeded task timer still shows in the floating timer', await I.exists(I.byLabel('Timer running for Alpha')));
  await openSettings();
  await I.click(I.byLabel('🍅 Pomodoro'));
  await C.waitFor(() => setting('feature.pomodoro')?.value === 'on', 6000).catch(() => {});
  await back();
  await C.waitFor(async () => I.exists(I.byLabel('Take a break')), 10000).catch(() => {});
  check('a pomodoro left from before is found again; its focus period is over, and it offers a break or keep going', (await I.exists(I.byLabel('Take a break'))) && (await I.exists(I.byLabel('Keep going'))), await I.body());
  check('the widget says the focus time is up', (await text('Pomodoro status')).includes('Focus time is up'), await text('Pomodoro status'));
  await I.shot('p7-03-pomodoro-focus-over');
  await I.click(I.byLabel('Take a break'));
  await C.waitFor(() => byId('a1') && !byId('a1').timerStartedAt, 8000);
  check('Take a break stops the task timer the ordinary way: 26 whole minutes added to the 4 already there', byId('a1').actualMinutes === 30, JSON.stringify(byId('a1')));
  check('and no task timer is running during the break', tasks().every((t) => !t.timerStartedAt));
  check('the break counts down', /Break \d+:\d\d left/.test(await text('Pomodoro status')), await text('Pomodoro status'));
  await I.shot('p7-04-pomodoro-break');
  await I.click(I.byLabel('Start the next focus period'));
  await C.waitFor(() => !!byId('a1').timerStartedAt, 8000);
  check('Skipping the break starts the focus period: Alpha\'s timer runs, and only Alpha\'s', tasks().filter((t) => t.timerStartedAt).map((t) => t.id).join() === 'a1');
  check('the countdown is on a fresh focus period', /Focus 2[45]:\d\d left/.test(await text('Pomodoro status')), await text('Pomodoro status'));
  // The one timer rule: starting another task's timer stops this one and ends the pomodoro.
  // 2.27.0: the timer and the pomodoro are in the card's ⋮ menu.
  const fromMenu = async (title, row) => {
    await I.hover(card(title));
    await I.click(`${card(title)}.querySelector('[data-ctl="more"]')`);
    await I.click(`document.querySelector('[data-popover] [aria-label="${row}"]')`);
  };
  await fromMenu('Beta', 'Start the timer');
  await C.waitFor(() => !!byId('b1').timerStartedAt && !byId('a1').timerStartedAt, 8000);
  check('one timer at a time still holds: Beta runs, Alpha\'s stopped', tasks().filter((t) => t.timerStartedAt).map((t) => t.id).join() === 'b1');
  check('Alpha\'s whole minutes were kept (not rounded up, nothing lost)', byId('a1').actualMinutes === 30, JSON.stringify(byId('a1')));
  await C.waitFor(async () => !(await I.exists(I.byLabel('Pomodoro status'))), 16000).catch(() => {});
  check('the pomodoro ended by itself when another task\'s timer started', !(await I.exists(I.byLabel('Pomodoro status'))));
  await I.click(I.byLabel('Stop the timer for Beta'));
  await C.waitFor(() => !byId('b1').timerStartedAt, 8000);
  // A fresh pomodoro from the card.
  await fromMenu('Beta', 'Start a pomodoro');
  await C.waitFor(() => !!byId('b1').timerStartedAt, 8000);
  check('Start a pomodoro on a card starts that task\'s timer and a 25 minute countdown', /Focus 2[45]:\d\d left/.test(await text('Pomodoro status')), await text('Pomodoro status'));
  // Switching the feature off ends the pomodoro, but the task timer carries on.
  await openSettings();
  await I.click(I.byLabel('🍅 Pomodoro'));
  await C.waitFor(() => setting('feature.pomodoro')?.value === 'off', 6000).catch(() => {});
  await back();
  check('Pomodoro off: the countdown and card buttons are gone, the task timer is untouched', !(await I.exists(I.byLabel('Pomodoro status'))) && !(await anyExists('[aria-label^="Start a pomodoro on"]')) && !!byId('b1').timerStartedAt);
  await I.click(I.byLabel('Stop the timer for Beta'));
  await C.waitFor(() => !byId('b1').timerStartedAt, 8000);

  // ======== 4. Task templates ========
  await openSettings();
  await I.click(I.byLabel('📑 Task templates'));
  await C.waitFor(() => setting('feature.templates')?.value === 'on', 6000).catch(() => {});
  check('Templates on: Settings has a manager that says there are none yet', (await I.body()).includes('No templates yet'));
  await back();
  await focusCard('Gamma');
  await I.key('o');
  await C.waitFor(async () => I.exists(I.byLabel('Task details')), 8000);
  // 2.26.0: Save as template is in the details modal's ⋮ menu.
  await I.click(I.byLabel('More task actions'));
  await I.click(I.byLabel('Save as template'));
  await I.click(I.byLabel('Template name'));
  await I.js('document.activeElement.select()');
  await I.type('Weekly review');
  await I.click(I.byLabel('Save the template'));
  await C.waitFor(() => settings().some((s) => s.key.startsWith('template.') && !s.deletedAt), 6000).catch(() => {});
  const tplRow = settings().find((s) => s.key.startsWith('template.') && !s.deletedAt);
  const tpl = tplRow ? JSON.parse(tplRow.value) : null;
  check('a template is one user_settings row holding the task\'s description', tpl && tpl.name === 'Weekly review' && tpl.title === 'Gamma' && tpl.durationMinutes === 45 && tpl.notes === 'weekly notes' && tpl.priority === 'low' && tpl.projectKey === 'work' && tpl.steps.join() === 'First step,Second step', tplRow && tplRow.value);
  check('it holds no progress (no Day, no timer, no done state)', tpl && !('dueDate' in tpl) && !('timerStartedAt' in tpl) && !('completed' in tpl) && !('actualMinutes' in tpl));
  await I.key('Escape');
  const before = tasks().filter((t) => t.title === 'Gamma').length;
  await I.click(I.byLabel('New from template'));
  await I.click(I.byLabel('Template Weekly review'));
  await C.waitFor(() => tasks().filter((t) => t.title === 'Gamma').length === before + 1, 8000);
  const made = tasks().filter((t) => t.title === 'Gamma' && t.id !== 'g1')[0];
  check('New from template makes a task with the template\'s title, estimate, notes, label, priority', made && made.durationMinutes === 45 && made.notes === 'weekly notes' && made.projectKey === 'work' && made.priority === 'low', JSON.stringify(made));
  check('with the steps un-ticked and with their own ids, no Day, not done', made && made.subtasks.length === 2 && made.subtasks.every((s) => !s.done) && made.subtasks.every((s) => s.id !== 'st1' && s.id !== 'st2') && !made.dueDate && !made.completed);
  check('the original task is untouched', byId('g1').subtasks[0].done === true && byId('g1').dueDate === today);
  await I.shot('p7-05-templates');
  await openSettings();
  await I.click(I.byLabel('Rename template Weekly review'));
  await I.js('document.activeElement.select()');
  await I.type('Friday review');
  await I.key('Return');
  await C.waitFor(() => { const r = settings().find((s) => s.key.startsWith('template.') && !s.deletedAt); return r && JSON.parse(r.value).name === 'Friday review'; }, 6000).catch(() => {});
  check('a template can be renamed in Settings', JSON.parse(settings().find((s) => s.key.startsWith('template.') && !s.deletedAt).value).name === 'Friday review');
  await I.click(I.byLabel('Delete template Friday review'));
  await I.click(I.byLabel('Confirm delete template Friday review'));
  await C.waitFor(() => !settings().some((s) => s.key.startsWith('template.') && !s.deletedAt), 6000).catch(() => {});
  check('deleting a template removes it (the row is tombstoned, never hard deleted)', settings().some((s) => s.key.startsWith('template.') && s.deletedAt) && !settings().some((s) => s.key.startsWith('template.') && !s.deletedAt));
  check('tasks already made from it stay', tasks().filter((t) => t.title === 'Gamma').length === before + 1);

  // ======== 5. Reset local cache and resync ========
  const rowsBefore = JSON.stringify(tasks().map((t) => t.id).sort());
  await I.click(I.byLabel('Reset local cache and resync'));
  check('it asks first, and says what it does', (await text('Reset local cache confirmation')).includes('uploaded first') && (await text('Reset local cache confirmation')).includes('nothing is deleted'), await text('Reset local cache confirmation'));
  await I.click(I.byLabel('Cancel reset'));
  check('Cancel does nothing', !(await I.exists(I.byLabel('Reset local cache confirmation'))) && JSON.stringify(tasks().map((t) => t.id).sort()) === rowsBefore);
  await I.click(I.byLabel('Reset local cache and resync'));
  await I.click(I.byLabel('Confirm reset local cache'));
  await C.waitFor(async () => I.exists(I.byLabel('Reset result')), 8000);
  check('REFUSED when signed out (this computer holds the only copy), in plain words', (await text('Reset result')).includes('only copy') && (await text('Reset result')).includes('nothing was reset'), await text('Reset result'));
  check('and nothing was cleared: every task is still here', JSON.stringify(tasks().map((t) => t.id).sort()) === rowsBefore && (read('belific_projects') || []).length === 2);
  await I.shot('p7-06-reset-refused');

  // ======== 6. Emoji on the Progress page ========
  await back();
  await openFromMenu('Progress');
  await C.waitFor(async () => (await I.body()).includes('Progress'), 8000);
  // 2.45.0 (on purpose): a line icon in front of the heading, not an emoji.
  check('Progress has a line icon in its heading', (await I.js(`(() => { const h = [...document.querySelectorAll('[role="heading"]')].find((e) => e.textContent.trim() === 'Progress'); const p = h && h.previousElementSibling; return !!p && /ionicons/i.test(getComputedStyle(p).fontFamily); })()`)) === true);

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
