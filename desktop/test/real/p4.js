'use strict';
// Real check for build plan phase 4 (Quests) on the desktop: real mouse and key
// input into the real app, on an isolated data folder asserted NOT to be the
// real one; Supabase is the in process fake (signed out, nothing leaves the
// machine). Covers: the Quests page from the top strip, every section, no
// repeating task hidden (an unknown rule included), due text, streaks from the
// stored history and a converted routine's old ticks, one tap complete and
// reopen, a planned skip, Today and Timebox, and the details panel's Repeats
// (the card's own control) with the Every year warning.
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
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()];
  const pad = (n) => String(n).padStart(2, '0');
  const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, day, extra = {}) => ({ id, title, dueDate: day, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  const D = (id, title, day, extra = {}) => T(id, title, day, { completed: true, completedAt: `${day}T09:00:00.000Z`, ...extra });
  const rows = [];
  // Daily: done the last five days
  rows.push(D('dw', 'Daily walk', dk(-5), { recurrence: 'daily', emoji: '🚶' }));
  for (const s of [-4, -3, -2, -1]) rows.push(D(`dw:${dk(s)}`, 'Daily walk', dk(s), { recurrence: 'daily', emoji: '🚶' }));
  // A converted routine: yesterday's row, five old ticks before it
  rows.push(D('rt_cr1', 'Evening wind down', dk(-1), { recurrence: 'daily', reminderMinutes: -1 }));
  // Weekly on today's weekday, three weeks done
  const wk = { recurrence: 'weekly', recurrenceDays: [weekday] };
  rows.push(D('wk', 'Weekly review', dk(-21), wk), D(`wk:${dk(-14)}`, 'Weekly review', dk(-14), wk), D(`wk:${dk(-7)}`, 'Weekly review', dk(-7), wk));
  // Every 3 weeks on today's weekday
  const tw = { recurrence: 'triweekly', recurrenceDays: [weekday] };
  rows.push(D('tw', 'Deep clean', dk(-42), tw), D(`tw:${dk(-21)}`, 'Deep clean', dk(-21), tw));
  // Monthly on the 1st: the two months before this one done
  const m2 = key(new Date(now.getFullYear(), now.getMonth() - 2, 1));
  const m1 = key(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  rows.push(D('mo', 'Pay rent', m2, { recurrence: 'monthly', recurrenceMonthDay: 1 }), D(`mo:${m1}`, 'Pay rent', m1, { recurrence: 'monthly', recurrenceMonthDay: 1 }));
  // Every year: ten days from now, done last year
  const inTen = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 10);
  const lastYear = key(new Date(inTen.getFullYear() - 1, inTen.getMonth(), inTen.getDate()));
  rows.push(D('an', 'Car service', lastYear, { recurrence: 'annual', recurrenceMonthDay: inTen.getDate() }));
  // A rule from a newer device: still shown
  rows.push(T('xx', 'Mystery repeat', dk(-3), { recurrence: 'quarterly_from_the_future' }));
  // Not quests
  rows.push(T('plain', 'Plain task', today), T('ended', 'Ended habit', dk(-3)));
  fs.writeFileSync(path.join(dataDir, 'belific_tasks.kv'), JSON.stringify(rows));
  fs.writeFileSync(path.join(dataDir, 'belific_routines.kv'), JSON.stringify([{ id: 'cr1', title: 'Evening wind down', timeOfDay: 'evening', createdAt: stamp, updatedAt: stamp, deletedAt: stamp }]));
  fs.writeFileSync(path.join(dataDir, 'belific_routine_completions.kv'), JSON.stringify([-6, -5, -4, -3, -2].map((s) => ({ routineId: 'cr1', date: dk(s), completedAt: `${dk(s)}T20:00:00.000Z` }))));
  const read = readKv(dataDir);
  const tasks = () => read('belific_tasks') || [];
  const byId = (id) => tasks().find((t) => t.id === id);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await I.waitBody('Plain task', 20000);
  // 2.28.0: the app opens on the Calendar; these checks start on the Tasks view.
  await I.click(I.byLabel('Show Tasks'), 600);
  const quest = (title) => I.byLabel(`Quest ${title}`);
  const questText = (title) => I.textOf(quest(title));
  const inQuest = (title, label) => `(${quest(title)} || document).querySelector('[aria-label=${JSON.stringify(label)}]')`;

  // ======== 1. The page, the sections, nothing hidden ========
  await I.click(I.byLabel('Quests'));
  await I.waitBody('Your repeating tasks', 8000);
  const sections = await I.js(`Array.from(document.querySelectorAll('[aria-label$=" quests"]')).filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.getAttribute('aria-label'))`);
  check('the sections, in order', JSON.stringify(sections) === JSON.stringify(['Daily quests', 'Weekly quests', 'Every few weeks quests', 'Monthly quests', 'Every year quests', 'Other repeats quests']), JSON.stringify(sections));
  for (const t of ['Daily walk', 'Evening wind down', 'Weekly review', 'Deep clean', 'Pay rent', 'Car service', 'Mystery repeat']) check(`${t} has a card`, await I.exists(quest(t)));
  check('a one off task and an ended series are not quests', !(await I.exists(quest('Plain task'))) && !(await I.exists(quest('Ended habit'))));
  await I.shot('p4-01-quests');

  // ======== 2. Due text and streaks from the history ========
  check('daily: due today, 5 days in a row, its emoji', /Due today/.test(await questText('Daily walk')) && /5 days in a row/.test(await questText('Daily walk')) && /🚶/.test(await questText('Daily walk')), await questText('Daily walk'));
  check('the converted routine counts its old ticks: 6 days in a row', /6 days in a row/.test(await questText('Evening wind down')), await questText('Evening wind down'));
  check('weekly: 3 weeks in a row, due today', /3 weeks in a row/.test(await questText('Weekly review')) && /Due today/.test(await questText('Weekly review')));
  check('every 3 weeks: 2 stretches of 3 weeks in a row', /2 stretches of 3 weeks in a row/.test(await questText('Deep clean')), await questText('Deep clean'));
  check('monthly: 2 months in a row, due this month (or today on the 1st)', /2 months in a row/.test(await questText('Pay rent')) && /Due (this month|today)/.test(await questText('Pay rent')), await questText('Pay rent'));
  check('every year: 1 year in a row, next in ten days', /1 year in a row/.test(await questText('Car service')) && /Next: /.test(await questText('Car service')), await questText('Car service'));
  check('never a zero or a warning word on the page', !/\b0 (days|weeks|months|years)\b|lost|broke|missed|behind|overdue/i.test(await I.body()));

  // ======== 3. One tap, and the second tap reopens ========
  await I.click(inQuest('Daily walk', 'Complete Daily walk'));
  await C.waitFor(() => byId(`dw:${today}`) && byId(`dw:${today}`).completed, 8000);
  check('one tap stored today and completed it', byId(`dw:${today}`).completed === true);
  await C.waitFor(async () => /Done today/.test(await questText('Daily walk')), 5000).catch(() => {});
  check('the card says Done today, 6 days in a row', /Done today/.test(await questText('Daily walk')) && /6 days in a row/.test(await questText('Daily walk')), await questText('Daily walk'));
  await I.click(inQuest('Daily walk', 'Reopen Daily walk'));
  await C.waitFor(() => byId(`dw:${today}`) && !byId(`dw:${today}`).completed, 8000);
  check('the second tap reopened it; the streak is as before', /Due today/.test(await questText('Daily walk')) && /5 days in a row/.test(await questText('Daily walk')));

  // ======== 4. A planned skip ========
  await I.click(inQuest('Weekly review', 'Skip Weekly review this time'));
  await C.waitFor(() => byId(`wk:${today}`) && byId(`wk:${today}`).deletedAt, 8000);
  check('skip writes the occurrence as a tombstone', !!byId(`wk:${today}`).deletedAt);
  check('the week is skipped, the streak still 3', /Skipped this week/.test(await questText('Weekly review')) && /3 weeks in a row/.test(await questText('Weekly review')), await questText('Weekly review'));

  // ======== 5. Today and Timebox ========
  const anDay = key(inTen);
  await I.click(inQuest('Car service', 'Put Car service on today'));
  await C.waitFor(() => byId(`an:${anDay}`), 8000);
  check('Today stores that occurrence on today, keeping its own day in its id', byId(`an:${anDay}`).dueDate === today);
  await I.click(inQuest('Daily walk', 'Put Daily walk on the Timebox today'));
  await C.waitFor(() => byId(`dw:${today}`) && byId(`dw:${today}`).startTime, 8000);
  check('Timebox gives today\'s occurrence the next half hour', /^\d\d:(00|30)$/.test(byId(`dw:${today}`).startTime), JSON.stringify(byId(`dw:${today}`)));
  await I.shot('p4-02-after-actions');

  // back home: both are on today's board
  await I.click(I.byLabel('Back'));
  await I.waitBody('Plain task', 8000);
  check('the occurrence put on today is on today\'s board', await I.exists(I.byLabel('Task Car service')));
  check('the series root is untouched: the rule did not move', byId('an').dueDate === lastYear && byId('an').recurrence === 'annual');

  // ======== 6. The details panel's Repeats is the card's control, with the Every year warning ========
  await I.js(`(() => { const c = ${I.byLabel('Task Plain task')}; c && c.focus(); })()`);
  await I.key('o');
  await C.waitFor(() => I.exists(I.byLabel('Task details')), 8000);
  await I.click(`document.querySelector('[aria-label="Task details"] [aria-label="Repeat: Does not repeat"]')`);
  check('the Repeat control opens from the panel', (await I.body()).includes('Every year'));
  await I.click(I.byLabel('Repeat Every year'));
  check('choosing Every year shows the warning', (await I.body()).includes('Update Belific on every device'));
  check('and Apply waits for the tick', await I.js(`(() => { const b = ${I.byLabel('Apply repeat')}; return !!b && b.getAttribute('aria-disabled') === 'true'; })()`));
  await I.shot('p4-03-annual-warning');
  await I.click(I.byLabel('Every device is updated'));
  await I.click(I.byLabel('Apply repeat'));
  await C.waitFor(() => byId('plain') && byId('plain').recurrence === 'annual', 8000);
  check('applied: the task repeats every year on its own date number', byId('plain').recurrence === 'annual' && byId('plain').recurrenceMonthDay === now.getDate());
  await I.blur();
  await I.key('Escape');

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
