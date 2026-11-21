'use strict';
// @real-input: quiet
// Real touch check for Wrap up and Plan week on the phone (3.65.0, PLAN_phone_parity phase 9) at 390 x 844: the Plan button
// opens the flow that fits the time (the desktop's rule), its chevron lists all three, Wrap up asks one task at a time
// (Done, Tomorrow, Back to its list, Let go; a repeating day only Done and Let go for today), Plan week asks which day
// (last week first, then Brain Dump and lists), each answer is stored at once with Undo, and the summary has an Undo per row.
// Runs quiet.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const C = require('./common');
const { dayKeyFrom } = require('./input');
const { phoneWindow } = require('./phone-common');

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
  const day = dayKeyFrom(new Date());
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const write = (k, v) => fs.writeFileSync(path.join(dataDir, `${k}.kv`), JSON.stringify(v));
  const task = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date().getDay()];
  write('belific_tasks', [
    task('a', 'A one off', { dueDate: day(0) }),
    task('rep', 'B repeat', { recurrence: 'weekly', recurrenceDays: [wd], dueDate: day(-7) }),
    task('c', 'C steps', { dueDate: day(0), subtasks: [{ id: 's1', title: 'one', done: true }, { id: 's2', title: 'two', done: false }] }),
    task('d', 'D let go', { dueDate: day(0) }),
    task('e', 'E to list', { dueDate: day(0), listKey: 'LW' }),
    task('fin', 'Finished', { dueDate: day(0), completed: true }),
    task('old', 'G last week', { dueDate: day(-3) }),
    task('da', 'H dump a'),
    task('wa', 'I work a', { listKey: 'LW' }),
  ]);
  write('belific_lists', [{ key: 'LW', name: 'Work', sortOrder: 0, emoji: '💼', createdAt: stamp, updatedAt: stamp }]);
  const read = (k) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dataDir, `${k}.kv`), 'utf8'));
    } catch {
      return [];
    }
  };
  const byId = (id) => read('belific_tasks').find((x) => x.id === id);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.show();
  await C.sleep(2500);
  const P = await phoneWindow(win);
  await C.sleep(1500);
  const shot = async (name) => {
    if (!process.env.BELIFIC_SHOTS) return;
    fs.mkdirSync(process.env.BELIFIC_SHOTS, { recursive: true });
    fs.writeFileSync(path.join(process.env.BELIFIC_SHOTS, `${name}.png`), (await win.webContents.capturePage()).toPNG());
  };
  const visible = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].reverse().find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left >= -1 && r.left < innerWidth && r.top < innerHeight; })`;
  const tap = (sel, ms = 900) => P.finger.tap(visible(sel), ms);
  const has = (sel) => P.js(`!!(${visible(sel)})`);
  const bar = () => P.js(`[...document.querySelectorAll('[data-undo-bar]')].map((e) => e.innerText).join(' | ')`);
  const progress = () => P.js(`(document.querySelector('[data-flow-progress]') || { getAttribute: () => null }).getAttribute('data-flow-progress')`);
  const current = () => P.js(`(document.querySelector('[data-flow-task]') || { getAttribute: () => null }).getAttribute('data-flow-task')`);
  const answers = () => P.js(`[...document.querySelectorAll('[data-flow-answer]')].map((e) => e.getAttribute('data-flow-answer'))`);
  const answer = (a) => tap(`[data-flow-answer="${a}"]`, 1100);
  const openFlow = async (label) => {
    await tap('[data-plan-menu]', 800);
    await tap(`[aria-label="${label}"]`, 1500);
  };
  const skipTo = async (title, a = 'done') => {
    let guard = 0;
    while ((await current()) !== title && guard++ < 8) await answer(a);
  };

  // ---- the Plan button follows the time ----
  const now = new Date();
  const dow = now.getDay();
  const hour = now.getHours();
  const expected = dow === 0 && hour >= 16 ? 'week' : dow === 1 && hour >= 4 && hour < 14 ? 'week' : hour >= 4 && hour < 14 ? 'planning' : 'shutdown';
  const btn = await P.js(`(document.querySelector('[data-plan-button]') || { getAttribute: () => null }).getAttribute('data-plan-button')`);
  check('the Plan button opens the flow that fits the time (Plan my day before 14:00, Wrap up after, Plan week Sunday from 16:00 and Monday morning)', btn === expected, `${btn} expected ${expected}`);
  await tap('[data-plan-menu]', 800);
  const menuRows = await P.js(`[...document.querySelectorAll('[data-action-menu] [role="button"]')].map((e) => e.getAttribute('aria-label')).filter(Boolean)`);
  const first = { planning: 'Plan my day', shutdown: 'Wrap up', week: 'Plan week' }[expected];
  check('the chevron lists all three, the one the button opens first', ['Plan my day', 'Wrap up', 'Plan week'].every((x) => menuRows.includes(x)) && menuRows[0] === first, JSON.stringify(menuRows));
  await tap('[data-menu-scrim]', 700);

  // ---- Wrap up ----
  await openFlow('Wrap up');
  check('Wrap up opens full screen on a task of today', (await has('[data-flow-screen="wrap"]')) && !!(await current()), `${await progress()} ${await current()}`);
  check('it asks the 5 open tasks (Finished is not asked)', /^1 of 5$/.test(String(await progress())), String(await progress()));
  check('the figure says what tomorrow holds', /Tomorrow so far/.test(await P.js(`(document.querySelector('[data-flow-figure]') || { innerText: '' }).innerText`)));
  await shot('phone-p33-wrap');
  await skipTo('A one off');
  check('A one off offers Done, Tomorrow, Back to its list, Let go', JSON.stringify(await answers()) === JSON.stringify(['done', 'tomorrow', 'list', 'letGo']), JSON.stringify(await answers()));
  await answer('tomorrow');
  check('Tomorrow moves it to tomorrow', byId('a').dueDate === day(1), JSON.stringify(byId('a')));
  check('the Undo bar says so', /Tomorrow: A one off/.test(await bar()), await bar());
  await P.finger.tap(`[...document.querySelectorAll('[data-undo-bar] [aria-label="Undo"]')].pop()`, 1400);
  check('Undo puts it back and asks it again', byId('a').dueDate === day(0) && (await current()) === 'A one off', `${JSON.stringify(byId('a'))} ${await current()}`);
  await answer('done');
  check('Done ticks it', byId('a').completed === true);
  await skipTo('B repeat');
  check('a repeating day offers only Done and Let go for today', JSON.stringify(await answers()) === JSON.stringify(['done', 'letGo']), JSON.stringify(await answers()));
  await answer('letGo');
  const reps = read('belific_tasks').filter((t) => t.id.split(':')[0] === 'rep');
  check('Let go skips only that day: a tombstone for today, the repeat itself stays', reps.some((t) => t.id === `rep:${day(0)}` && t.deletedAt) && !byId('rep').deletedAt, JSON.stringify(reps.map((t) => [t.id, !!t.deletedAt])));
  await skipTo('C steps');
  check('a task with some steps ticked offers the steps left', (await answers()).includes('steps'), JSON.stringify(await answers()));
  await answer('steps');
  const copies = read('belific_tasks').filter((t) => t.title === 'C steps');
  check('the steps left go to tomorrow on a copy, today is done', copies.length === 2 && copies.some((t) => t.dueDate === day(1) && !t.completed) && byId('c').completed === true, JSON.stringify(copies.map((t) => [t.id, t.dueDate, t.completed])));
  await skipTo('D let go');
  await answer('letGo');
  check('Let go on a one off task puts it in the Trash', !!byId('d').deletedAt, JSON.stringify(byId('d')));
  await skipTo('E to list');
  await answer('list');
  check('Back to its list clears the Day and keeps the list', !byId('e').dueDate && byId('e').listKey === 'LW' && !byId('e').deletedAt, JSON.stringify(byId('e')));
  check('the summary lists the answers, each with its own Undo', (await has('[data-flow-summary-head]')) && (await P.js(`document.querySelectorAll('[data-flow-undo-row]').length`)) >= 4, await P.js(`document.body.innerText.slice(0, 160)`));
  await shot('phone-p33-wrap-summary');
  await tap('[data-flow-undo-row="D let go"]', 1300);
  check('a row Undo puts that task back (D let go is live again)', !byId('d').deletedAt, JSON.stringify(byId('d')));
  check('and the row says so', /Put back: D let go/.test(await P.js(`document.body.innerText`)));
  await tap('[data-flow-done]', 1200);

  // ---- Plan week ----
  await openFlow('Plan week');
  check('Plan week opens full screen on last week first', (await has('[data-flow-screen="week"]')) && (await current()) === 'G last week', `${await progress()} ${await current()}`);
  check('the figure lists the days', /Mon|Tue|Wed|Thu|Fri|Sat|Sun/.test(await P.js(`(document.querySelector('[data-flow-figure]') || { innerText: '' }).innerText`)));
  const ids = await answers();
  const dayIds = ids.filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x));
  check('the answers are the days from today on, then Not now', ids[ids.length - 1] === 'skip' && dayIds.length >= 1 && dayIds.length <= 7 && dayIds.every((x) => x >= day(0)), JSON.stringify(ids));
  await shot('phone-p33-week');
  const pick = dayIds[dayIds.length - 1];
  await answer(pick);
  check('a day moves the task there', byId('old').dueDate === pick, JSON.stringify(byId('old')));
  check('next: Brain Dump', (await current()) === 'H dump a', String(await current()));
  await answer(dayIds[0]);
  check('a Brain Dump task gets the day with no time', byId('da').dueDate === dayIds[0] && !byId('da').startTime, JSON.stringify(byId('da')));
  await P.finger.tap(`[...document.querySelectorAll('[data-undo-bar] [aria-label="Undo"]')].pop()`, 1400);
  check('Undo puts it back and asks it again', !byId('da').dueDate && (await current()) === 'H dump a', JSON.stringify(byId('da')));
  await answer(dayIds[0]);
  check('then the list tasks (E to list went back to its list in Wrap up)', (await current()) === 'E to list', String(await current()));
  await answer('skip');
  check('and I work a', (await current()) === 'I work a', String(await current()));
  await answer('skip');
  check('Not now leaves it where it is', !byId('wa').dueDate && !byId('wa').deletedAt, JSON.stringify(byId('wa')));
  check('the summary says so', (await has('[data-flow-summary-head]')) && /Left for now: I work a/.test(await P.js(`document.body.innerText`)));
  await tap('[data-flow-undo-row="G last week"]', 1300);
  check('a row Undo puts G last week back on its old day', byId('old').dueDate === day(-3), JSON.stringify(byId('old')));
  await tap('[data-flow-done]', 1200);

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
