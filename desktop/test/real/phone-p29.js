'use strict';
// @real-input: quiet
// Real touch check for Plan my day on the phone (3.62.0, PLAN_phone_stepflow section 3) at 390 x 844:
//   the Plan button on Today, one task at a time in the planned order ("1 of 6"), each answer stored at once (Today,
//   Tomorrow, A time with the default length, Not today), a repeating day offers no Tomorrow and Not today skips only
//   that day, Undo of the last answer, the summary with an Undo per row, and closing half way keeps the answers.
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
    task('t1', 'A today', { dueDate: day(0) }),
    task('rep', 'B repeat', { recurrence: 'weekly', recurrenceDays: [wd], dueDate: day(-7) }),
    task('old', 'C old one', { dueDate: day(-2) }),
    task('da', 'D dump a'),
    task('db', 'E dump b'),
    task('wa', 'F work a', { listKey: 'LW' }),
    task('timed', 'Timed task', { dueDate: day(0), startTime: '08:00', durationMinutes: 30 }),
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
  const progress = () => P.js(`(document.querySelector('[data-plan-progress]') || { getAttribute: () => null }).getAttribute('data-plan-progress')`);
  const current = () => P.js(`(document.querySelector('[data-plan-task]') || { getAttribute: () => null }).getAttribute('data-plan-task')`);
  const answers = () => P.js(`[...document.querySelectorAll('[data-plan-answer]')].map((e) => e.getAttribute('data-plan-answer'))`);
  const bar = () => P.js(`[...document.querySelectorAll('[data-undo-bar]')].map((e) => e.innerText).join(' | ')`);
  const answer = (a) => tap(`[data-plan-answer="${a}"]`, 1100);

  check('Today has a Plan button (44 pt high)', (await P.js(`(() => { const e = document.querySelector('[data-plan-button]'); return !!e && e.getBoundingClientRect().height >= 44; })()`)));
  await tap('[data-plan-menu]', 800);
  await tap('[aria-label="Plan my day"]', 1500);
  check('Plan my day opens full screen on the first task, "1 of 6"', (await has('[data-plan-screen]')) && (await progress()) === '1 of 6', `${await progress()} ${await current()}`);
  check('the timed task on today is not asked about; the first is the untimed one of today', (await current()) === 'A today');
  check('the planned line is there', await has('[data-plan-figure]'));
  check('four answers: Today, Tomorrow, A time, Not today', JSON.stringify(await answers()) === JSON.stringify(['today', 'tomorrow', 'time', 'notToday']), JSON.stringify(await answers()));
  await shot('phone-p29-ask');

  await answer('today');
  check('Today: the next task shows, "2 of 6"', (await progress()) === '2 of 6' && (await current()) === 'B repeat', `${await progress()} ${await current()}`);
  check('a repeating day offers no Tomorrow', JSON.stringify(await answers()) === JSON.stringify(['today', 'time', 'notToday']), JSON.stringify(await answers()));
  await answer('notToday');
  const reps = read('belific_tasks').filter((t) => t.title === 'B repeat');
  check('Not today skips only that day: today is a tombstone, the repeat itself stays', !byId('rep').deletedAt && byId('rep').recurrence === 'weekly' && reps.some((t) => t.id === `rep:${day(0)}` && t.deletedAt), JSON.stringify(reps.map((t) => [t.id, !!t.deletedAt, t.dueDate])));
  check('next: the Earlier task, "3 of 6"', (await progress()) === '3 of 6' && (await current()) === 'C old one', `${await progress()} ${await current()}`);
  await answer('tomorrow');
  check('Tomorrow moves it to tomorrow', byId('old').dueDate === day(1), JSON.stringify(byId('old')));
  check('next: Brain Dump, "4 of 6"', (await progress()) === '4 of 6' && (await current()) === 'D dump a');

  // A time
  await answer('time');
  check('A time opens the time field', await has('[data-plan-time]'));
  await tap('[data-plan-time] input', 400);
  await win.webContents.insertText('14:30');
  await C.sleep(300);
  await win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
  await win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
  await C.sleep(600);
  await tap('[data-plan-set-time]', 1300);
  const da = byId('da');
  check('A time stores today at that time with the default length', da.dueDate === day(0) && da.startTime === '14:30' && da.durationMinutes > 0, JSON.stringify(da));
  check('the Undo bar says "At 14:30: D dump a"', /At 14:30: D dump a/.test(await bar()), await bar());
  await P.finger.tap(`[...document.querySelectorAll('[data-undo-bar] [aria-label="Undo"]')].pop()`, 1400);
  check('Undo of the last answer puts it back and asks it again', !byId('da').startTime && !byId('da').dueDate && (await current()) === 'D dump a' && (await progress()) === '4 of 6', `${JSON.stringify(byId('da'))} ${await current()} ${await progress()}`);
  await answer('today');
  check('Today on a list task gives it today with no time', byId('da').dueDate === day(0) && !byId('da').startTime, JSON.stringify(byId('da')));

  // close half way keeps what was answered
  await tap('[data-plan-done]', 1200);
  check('Done only closes: the answers stay', byId('old').dueDate === day(1) && byId('da').dueDate === day(0) && !(await has('[data-plan-screen]')));
  await tap('[data-plan-menu]', 800);
  await tap('[aria-label="Plan my day"]', 1500);
  check('opening again asks only what is left (Not today left the repeat day skipped)', (await current()) !== 'C old one' && (await current()) !== 'B repeat', await current());

  // finish: leave E in its list (Not today), F to tomorrow, then the summary
  let guard = 0;
  while ((await current()) && guard++ < 10) {
    const c = await current();
    if (c === 'E dump b') await answer('notToday');
    else if (c === 'F work a') await answer('tomorrow');
    else await answer('today');
  }
  check('Not today on a task still in its list leaves it as it is', !byId('db').dueDate && !byId('db').deletedAt, JSON.stringify(byId('db')));
  check('Tomorrow on a Work list task', byId('wa').dueDate === day(1) && byId('wa').listKey === 'LW', JSON.stringify(byId('wa')));
  check('the summary lists the answers, each with its own Undo', (await has('[data-plan-summary-head]')) && (await P.js(`document.querySelectorAll('[data-plan-undo-row]').length`)) >= 2, await P.js(`document.body.innerText.slice(0, 200)`));
  await shot('phone-p29-summary');
  await tap('[data-plan-undo-row="F work a"]', 1300);
  check('a row Undo puts that task back (F work a has no Day again)', !byId('wa').dueDate, JSON.stringify(byId('wa')));
  check('and the row says so', /Put back: F work a/.test(await P.js(`document.body.innerText`)));
  await tap('[data-plan-done]', 1200);

  // dark
  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
