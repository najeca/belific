'use strict';
// @real-input: quiet
// Real check for the stale titles on repeating days (step 4 of the 2026-11-02 batch). A repeating task on three
// weekdays: a past day that is done, yesterday's day (stored, not done), and today's day, stored because it was
// moved into the Short break and shortened to 10 minutes (it shows as a block in the break's gap; a chip until 3.33.0). The task is renamed
// from the details of yesterday's day, as Jethro did from a stored day.
//   1. today's block in the gap, today's details and the next projected day all show the NEW title,
//   2. the past day that is done keeps the old title,
//   3. today's own time (15:05) and length (10 min) stay; the break still hosts it,
//   4. Ctrl+Z puts every day back to the old title in one step.
// Real mouse and key input into the real app, isolated data folder, in process fake Supabase.
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
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const wd = (shift) => WD[new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + shift).getDay()];
  // Three weekdays like Mon Wed Fri: yesterday's, today's and the day after tomorrow's.
  const days = [wd(-1), wd(0), wd(2)];
  const OLD = 'Apply to 1 application';
  const NEW = 'Apply to 15 application';
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const rule = { recurrence: 'weekly', recurrenceDays: days, startTime: '10:00', durationMinutes: 60, projectKey: 'work' };
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      // A week ago today: done.
      T('apply', OLD, { ...rule, dueDate: dk(-7), completed: true, completedAt: `${dk(-7)}T11:00:00.000Z` }),
      T(`apply:${dk(-1)}`, OLD, { ...rule, dueDate: dk(-1) }),
      // Today: moved into the Short break and shortened to 10 minutes.
      T(`apply:${today}`, OLD, { ...rule, dueDate: today, startTime: '15:05', durationMinutes: 10, updatedAt: '2026-09-02T07:00:00.000Z' }),
      T('brk', 'Short break', { dueDate: today, startTime: '15:00', durationMinutes: 30, cutsBelow: true }),
    ]),
  );
  fs.writeFileSync(path.join(dataDir, 'belific_projects.kv'), JSON.stringify([{ key: 'work', name: 'Work', colorKey: 'sage', createdAt: stamp, updatedAt: stamp }]));
  const read = readKv(dataDir);
  const tasks = () => read('belific_tasks') || [];
  const byId = (id) => tasks().find((t) => t.id === id);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1440, 900);
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await C.sleep(3500);

  const panel = `document.querySelector('[data-detail-panel]')`;
  // 3.34.0 (PLAN_breaks_as_gaps P2): a task in a break is a block in the break's gap (it was a chip in the break).
  const chip = (id) => `document.querySelector('[data-cal-block="cal${today}:${id}"][data-in-gap]')`;
  const chipText = () => I.js(`(() => { const c = ${chip(`apply:${today}`)}; return c ? c.innerText : null; })()`);
  const block = (day, id) => `document.querySelector('[data-cal-block="cal${day}:${id}"]')`;
  const blockText = (day, id) => I.js(`(() => { const b = ${block(day, id)}; return b ? b.innerText : null; })()`);
  let at = 0;
  const goDay = async (shift) => {
    const label = shift < at ? 'Calendar previous day' : 'Calendar next day';
    for (let i = 0; i < Math.abs(shift - at); i++) await I.click(I.byLabel(label), 500);
    at = shift;
  };
  const scrollTo = async (hour) => {
    await I.js(`(() => { const s = document.querySelector('[data-cal-scroller]'); if (s) s.scrollTop = ${hour} * 60 * (s.scrollHeight / 1440) - 40; })()`);
    await C.sleep(300);
  };

  // The Calendar's day view.
  await I.click(I.byLabel('Show the Calendar'), 800).catch(() => {});
  await I.key('d');
  await C.sleep(700);
  await scrollTo(15);
  check('before: today\'s day is a block in the Short break\'s gap with the old title', ((await chipText()) || '').includes(OLD), String(await chipText()));
  await I.shot('p47-01-before');

  // ======== Rename from yesterday's stored day ========
  await goDay(-1);
  await scrollTo(10);
  await I.click(block(dk(-1), `apply:${dk(-1)}`), 800);
  await C.waitFor(() => I.exists(panel), 4000);
  const title = `${panel}.querySelector('[aria-label="Title"]')`;
  await I.click(title, 200);
  await I.js(`(() => { const t = ${title}; t.select ? t.select() : null; })()`);
  await I.type(NEW);
  await I.enter([], 600);
  await I.blur();
  await I.key('Escape');
  await C.sleep(800);
  await C.waitFor(() => byId(`apply:${dk(-1)}`)?.title === NEW, 4000).catch(() => {});
  check('the edited day has the new title', byId(`apply:${dk(-1)}`)?.title === NEW, JSON.stringify(byId(`apply:${dk(-1)}`)));

  // ======== 1. Every day shows it ========
  await C.waitFor(() => byId(`apply:${today}`)?.title === NEW, 3000).catch(() => {});
  check('1: today\'s stored day (moved into the break, shortened) has the new title', byId(`apply:${today}`)?.title === NEW, JSON.stringify(byId(`apply:${today}`)));
  await goDay(0);
  await scrollTo(15);
  check('1: today\'s block in the gap shows the new title', ((await chipText()) || '').includes(NEW), String(await chipText()));
  await I.shot('p47-02-after');
  await goDay(2);
  await scrollTo(10);
  check('1: the next projected day shows the new title', ((await blockText(dk(2), `apply:${dk(2)}`)) || '').includes(NEW), String(await blockText(dk(2), `apply:${dk(2)}`)));

  // ======== 2. The past day that is done keeps its title ========
  check('2: the past day that is done keeps the old title', byId('apply').title === OLD, JSON.stringify(byId('apply')));

  // ======== 3. Today keeps its own time and length ========
  const t = byId(`apply:${today}`);
  check('3: today keeps 15:05 and 10 minutes', t.startTime === '15:05' && t.durationMinutes === 10, JSON.stringify(t));
  check('3: and the other day keeps the series time', byId(`apply:${dk(-1)}`).startTime === '10:00' && byId(`apply:${dk(-1)}`).durationMinutes === 60);

  // ======== 4. One undo puts every day back ========
  await I.blur();
  await I.key('Z', ['control']);
  await C.sleep(1200);
  check('4: Ctrl+Z puts every day back to the old title', byId(`apply:${today}`).title === OLD && byId(`apply:${dk(-1)}`).title === OLD, JSON.stringify(tasks().map((x) => [x.id, x.title])));

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
