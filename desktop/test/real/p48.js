'use strict';
// @real-input: quiet
// Real check for 3.27.0, rewritten for Shifts S2 (3.37.0): the desktop details have no Task or Break choice any more.
//   1. a plain task's details: no Task | Break control, no "Task or Break" row, no "Make it a normal block",
//   3. a task placed over a Break says "Shows inside <break>" in its details; a task over a task shows nothing new,
//   2. the Break "Lunch" (12:00, 1 h) is a gap, not a card: the day column ends with "☕ Free time · 1h"; its details say
//      it is free time and offer "Make it a normal block", which clears cutsBelow (nothing else); Lunch is then a
//      block with "Quick note" drawn inside it and the summary "10m of 1h planned, 50m free",
//   4. no "Split" anywhere in the details, the card or Settings.
// Real mouse and key input into the real app, isolated data folder, in process fake Supabase. Light and dark (P48_DARK).
// BELIFIC_SHOTS: screenshots.
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
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, dueDate: today, ...extra });
  const seed = [
    T('plain', 'Plan the week', { startTime: '09:00', durationMinutes: 30 }),
    T('lunch', 'Lunch', { startTime: '12:00', durationMinutes: 60, cutsBelow: true }),
    T('note', 'Quick note', { startTime: '12:10', durationMinutes: 10 }),
    T('a', 'Deep work', { startTime: '14:00', durationMinutes: 60 }),
    T('b', 'Email', { startTime: '14:15', durationMinutes: 15 }),
  ];
  // 3.40.0 (F1 of PLAN_daily_flow): the Free time line is a setting, off by default; this check is about the line.
  fs.writeFileSync(path.join(dataDir, 'belific_user_settings.kv'), JSON.stringify([{ key: 'board.free_time_line', value: 'true', updatedAt: '2026-09-01T07:00:00.000Z' }]));
  fs.writeFileSync(path.join(dataDir, 'belific_tasks.kv'), JSON.stringify(seed));
  const read = readKv(dataDir);
  const byId = (id) => (read('belific_tasks') || []).find((t) => t.id === id);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1440, 900);
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await C.sleep(3500);
  const mode = process.env.P48_DARK ? 'dark' : 'light';
  const settings = async () => {
    const ic = (await I.exists(I.byLabel('Profile and account'))) ? 'Profile and account' : 'Profile, not signed in';
    await I.click(I.byLabel(ic));
    await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 700);
    await I.waitBody('POWER FEATURES', 8000);
  };
  if (mode === 'dark') {
    await settings();
    await I.click(`document.querySelector('[data-theme-setting] [data-theme-mode="dark"]')`, 900);
    await I.click(I.byLabel('Back'), 900);
  }
  await I.click(I.byLabel('Show Tasks'), 800).catch(() => {});
  await C.sleep(600);
  const panel = `document.querySelector('[data-detail-panel]')`;
  const card = (title) => `Array.from(document.querySelectorAll('[aria-label="Task ${title}"]')).find((e) => e.getBoundingClientRect().width > 0)`;
  const openCard = async (title) => {
    await I.click(card(title), 900);
    await C.waitFor(() => I.exists(panel), 4000);
    await C.sleep(300);
  };
  const close = async () => {
    await I.blur();
    await I.key('Escape');
    await C.sleep(500);
  };
  const panelText = () => I.js(`(${panel} || {}).innerText || ''`);

  // ======== 1. A plain task: no Task | Break ========
  await openCard('Plan the week');
  const t1 = await panelText();
  check(`${mode} 1: no Task | Break control and no "Task or Break" row`, !(await I.exists(`${panel}.querySelector('[data-kind-choice], [data-kind]')`)) && !/Task or Break/.test(t1), t1);
  check(`${mode} 1: no "Make it a normal block" on a plain task`, !(await I.exists(`${panel}.querySelector('[data-make-normal]')`)));
  await I.shot(`p48-1-task-${mode}`);
  await close();

  // ======== 3. Shows inside, and nothing new for a task over a task ========
  await openCard('Quick note');
  check(`${mode} 3: a task over a Break says "Shows inside Lunch"`, /Shows inside Lunch/.test(await panelText()), await panelText());
  await I.shot(`p48-3-inside-${mode}`);
  await close();
  await openCard('Email');
  const emailText = await panelText();
  check(`${mode} 3: a task over a task shows nothing new`, !/Shows inside|Break is ignored|Inside this break/.test(emailText), emailText);
  check(`${mode} 4: no "Split" in the details`, !/split/i.test(emailText));
  await close();

  // ======== 2. A Break: a gap, the quiet line, "Make it a normal block" ========
  const line = await I.js(`(() => { const l = document.querySelector('[data-break-line="${today}"]'); return l ? l.innerText : null; })()`);
  check(`${mode} 2: a Break with a time is not a card; the day column ends with "☕ Free time · 1h"`, !(await I.js(`!!document.querySelector('[data-task-card="lunch"]')`)) && line === '☕ Free time · 1h', String(line));
  await I.click(I.byLabel('Show the Calendar'), 800).catch(() => {});
  await I.key('d');
  await C.sleep(700);
  await I.js(`(() => { const s = document.querySelector('[data-cal-scroller]'); if (s) s.scrollTop = 11 * 56; })()`);
  await C.sleep(400);
  const gap = await I.js(`(() => { const b = document.querySelector('[data-cal-block="cal${today}:lunch"]'); return b ? [b.getAttribute('data-gap'), b.innerText.trim()] : null; })()`);
  check(`${mode} 2: on the Calendar it is a gap, with no text`, !!gap && gap[0] === 'lunch' && gap[1] === '', JSON.stringify(gap));
  await I.click(`document.querySelector('[data-cal-block="cal${today}:lunch"]')`, 900);
  await C.waitFor(() => I.exists(panel), 4000);
  const t2 = await panelText();
  check(`${mode} 2: its details say it is free time, in plain words, with a visible "Make it a normal block"`, t2.includes('Free time is not counted as planned.') && (await I.exists(`${panel}.querySelector('[data-make-normal]')`)) && !(await I.exists(`${panel}.querySelector('[data-kind-choice]')`)), t2);
  await I.shot(`p48-2-free-time-${mode}`);
  await I.click(`${panel}.querySelector('[data-make-normal]')`, 900);
  await C.waitFor(() => byId('lunch').cutsBelow === undefined, 4000).catch(() => {});
  const l2 = byId('lunch');
  check(`${mode} 2: "Make it a normal block" clears cutsBelow and nothing else`, l2.cutsBelow === undefined && l2.startTime === '12:00' && l2.durationMinutes === 60 && l2.title === 'Lunch', JSON.stringify(l2));
  await close();
  await C.sleep(500);
  const shell = await I.js(`(() => { const b = document.querySelector('[data-cal-block="cal${today}:lunch"][data-shell]'); const inner = document.querySelector('[data-shell-inner] [data-cal-block="cal${today}:note"]'); return b ? [b.getAttribute('data-shell'), !!inner] : null; })()`);
  check(`${mode} 2: Lunch is now a block with Quick note drawn inside it, "10m of 1h planned, 50m free"`, !!shell && shell[0] === '10m of 1h planned, 50m free' && shell[1], JSON.stringify(shell));
  await I.shot(`p48-2-shell-${mode}`);
  await I.click(I.byLabel('Show Tasks'), 800).catch(() => {});
  await C.sleep(500);
  check(`${mode} 4: no "Split" on the board`, !/split/i.test(await I.body()));
  await settings();
  check(`${mode} 4: Settings says "Minimum piece size when a Break cuts a task" and no "Split"`, (await I.body()).includes('Minimum piece size when a Break cuts a task') && !/split/i.test(await I.body()));
  await I.click(I.byLabel('Back'), 900);

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
