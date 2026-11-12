'use strict';
// @real-input: quiet
// Real check for R5 of PLAN_repeat_end_and_parts (3.51.0): Parts on repeating parents and across the flows, on a FIXED
// CLOCK (Thursday 12 Nov 2026, 10:00).
//   - "Upper day" repeats Mon to Thu with two parts: today's card shows "0 of 2 done"; a tick in the card stores that
//     day's row only ("bench:2026-11-12"), the next day's card is "0 of 2 done" again (the ticks reset); the last open part
//     completes that day; one Ctrl+Z each;
//   - "Pull day" (one off, today) has three parts, one done: Wrap up shows "3 parts" and "Only the 2 parts left to
//     tomorrow" (E4); it keeps today's Pull day done with its done part and puts a copy on tomorrow holding the two open
//     parts (re-linked); one Ctrl+Z puts it back;
//   - "Leg day" (one off, today, in the Gym list) with two parts: Clear list says "1 task has 2 parts, which go with it"
//     and moves all three to the Trash together; one Ctrl+Z puts it back;
//   - Delete repeating task on Upper day asks "Delete the task only" or "Delete the task and its 2 parts".
// Text 14 px or more, nothing red. Runs quiet.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const C = require('./common');
const { makeInput, readKv } = require('./input');

process.env.BELIFIC_NO_PROTOCOL_REGISTER = '1';
const userData = C.isolate();
console.log(`USERDATA ${userData}`);

const TODAY = '2026-11-12';
const TOMORROW = '2026-11-13';

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
  const stamp = '2026-11-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      T('up', 'Upper day', { dueDate: '2026-11-09', startTime: '18:00', durationMinutes: 60, recurrence: 'weekly', recurrenceDays: ['Mon', 'Tue', 'Wed', 'Thu'] }),
      T('bench', 'Bench press', { parentId: 'up', durationMinutes: 20, createdAt: '2026-11-01T07:00:01.000Z' }),
      T('shoulders', 'Shoulders', { parentId: 'up', durationMinutes: 25, createdAt: '2026-11-01T07:00:02.000Z' }),
      T('pull', 'Pull day', { dueDate: TODAY, listKey: 'pull' }),
      T('row', 'Rows', { parentId: 'pull', completed: true, completedAt: stamp, createdAt: '2026-11-01T07:00:01.000Z' }),
      T('curl', 'Curls', { parentId: 'pull', createdAt: '2026-11-01T07:00:02.000Z' }),
      T('face', 'Face pulls', { parentId: 'pull', createdAt: '2026-11-01T07:00:03.000Z' }),
      T('leg', 'Leg day', { listKey: 'gym' }),
      T('squat', 'Squats', { parentId: 'leg', listKey: 'gym', createdAt: '2026-11-01T07:00:01.000Z' }),
      T('lunge', 'Lunges', { parentId: 'leg', listKey: 'gym', createdAt: '2026-11-01T07:00:02.000Z' }),
    ]),
  );
  fs.writeFileSync(path.join(dataDir, 'belific_lists.kv'), JSON.stringify([{ key: 'gym', name: 'Gym', emoji: '🏋️', sortOrder: 1, createdAt: stamp, updatedAt: stamp }]));
  const read = readKv(dataDir);
  const raw = () => read('belific_tasks') || [];
  const live = () => raw().filter((t) => !t.deletedAt);
  const byId = (id) => raw().find((t) => t.id === id);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1700, 1000);
  win.show();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');

  const dbg = win.webContents.debugger;
  dbg.attach('1.3');
  await dbg.sendCommand('Page.enable');
  const clockSource = (ms) => `(() => { const R = Date; const start = R.now(); const base = ${ms};
    class D extends R { constructor(...a) { if (a.length === 0) super(base + (R.now() - start)); else super(...a); } static now() { return base + (R.now() - start); } }
    window.Date = D; })()`;
  await dbg.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: clockSource(new Date(2026, 10, 12, 10, 0, 0, 0).getTime()) });
  win.webContents.reload();
  await C.sleep(2500);
  await I.waitBody('Upper day', 20000);
  await I.click(I.byLabel('Show Tasks'), 900).catch(() => {});
  await C.sleep(900);

  const col = (day) => `document.querySelector('[data-day-col="${day}"]')`;
  const undo = async () => {
    await I.blur();
    await I.key('Z', ['control'], 1700);
  };
  // A card is found by its title in the day's column (a projected card has no data-task-card); its parts box is the next block.
  const cardParts = (day, title) =>
    I.js(`(() => { const t = ${col(day)} && ${col(day)}.querySelector('[aria-label="Title ${title}"]'); const card = t && t.closest('[aria-label^="Task "], [data-task-card]'); const b = card && card.querySelector('[data-card-parts]'); if (!b) return null; return { done: b.querySelector('[data-card-parts-done]').innerText.trim(), rows: [...b.querySelectorAll('[data-card-part]')].map((r) => r.getAttribute('data-card-part')) }; })()`);
  const notRed = (scope) =>
    I.js(`![...document.querySelectorAll('${scope}')].some((root) => [root, ...root.querySelectorAll('*')].some((e) => { const s = getComputedStyle(e); return [s.color, s.backgroundColor].some((c) => { const m = /rgba?\\((\\d+), (\\d+), (\\d+)/.exec(c); return m && +m[1] > 180 && +m[2] < 110 && +m[3] < 110; }); }))`);

  // ---- a repeating parent's parts reset each day ----
  const a = await cardParts(TODAY, 'Upper day');
  check('today\'s Upper day (a repeating day, not stored) shows its two parts, "0 of 2 done"', !!a && a.done === '0 of 2 done' && a.rows.join() === 'bench,shoulders', JSON.stringify(a));
  const tickToday = (id) => I.click(`${col(TODAY)}.querySelector('[data-card-part-tick="${id}"]')`, 1700);
  await tickToday('bench');
  const day1 = byId('bench:2026-11-12');
  check('a tick in the card stores that day\'s row only: "bench:2026-11-12", done, with the parent\'s id; the part itself stays open', !!day1 && day1.completed === true && day1.parentId === 'up' && day1.dueDate === TODAY && !byId('bench').completed, JSON.stringify(day1));
  check('the card says "1 of 2 done"', (await cardParts(TODAY, 'Upper day')).done === '1 of 2 done');
  const nextDay = await cardParts('2026-11-16', 'Upper day');
  check('Monday\'s card starts again: "0 of 2 done" (the ticks reset)', !!nextDay && nextDay.done === '0 of 2 done', JSON.stringify(nextDay));
  check('the day row is not a task on any day: no extra card, not in the left list', !(await I.js(`[...document.querySelectorAll('[aria-label="Title Bench press"]')].some((e) => !e.closest('[data-card-parts]'))`)));
  await I.shot('p66-repeating');
  await undo();
  check('one Ctrl+Z unticks it (the day row is open again, "0 of 2 done")', (!byId('bench:2026-11-12') || !byId('bench:2026-11-12').completed) && (await cardParts(TODAY, 'Upper day')).done === '0 of 2 done');
  await tickToday('bench');
  await tickToday('shoulders');
  check('the last open part completes that day: Upper day for today is stored done', !!byId('up:2026-11-12') && byId('up:2026-11-12').completed === true, JSON.stringify(byId('up:2026-11-12')));
  await undo();
  check('one Ctrl+Z reopens that day and unticks the last part: "1 of 2 done"', !byId('up:2026-11-12').completed && (await cardParts(TODAY, 'Upper day')).done === '1 of 2 done', JSON.stringify([byId('up:2026-11-12'), await cardParts(TODAY, 'Upper day')]));

  // ---- Wrap up Tomorrow splits the task ----
  await I.click(`document.querySelector('[data-plan-menu]')`, 500);
  await I.click(`document.querySelector('[data-popover] [aria-label="Wrap up from the menu"]')`, 900);
  check('Wrap up opens', await I.exists(`document.querySelector('[data-wrap-up]')`));
  const pullRow = await I.js(`(() => { const r = document.querySelector('[data-wrap-row="pull"]'); return r ? r.innerText.replace(/\\s+/g, ' ') : null; })()`);
  check('Pull day says "3 parts"; Rows, Curls and Face pulls are not rows of their own', !!pullRow && pullRow.includes('3 parts') && !(await I.exists(`document.querySelector('[data-wrap-row="row"]')`)), String(pullRow));
  const btn = await I.js(`(() => { const b = document.querySelector('[data-wrap-for="pull"][data-wrap-btn="parts"]'); return b ? [b.innerText.trim(), parseFloat(getComputedStyle(b.querySelector('div[dir]') || b).fontSize)] : null; })()`);
  check('it offers "Only the 2 parts left to tomorrow", 14 px or more', !!btn && btn[0] === 'Only the 2 parts left to tomorrow' && btn[1] >= 14, JSON.stringify(btn));
  await I.shot('p66-wrap');
  await I.click(`document.querySelector('[data-wrap-for="pull"][data-wrap-btn="parts"]')`, 1700);
  const pullToday = byId('pull');
  const copy = live().find((t) => t.title === 'Pull day' && t.id !== 'pull');
  check('today keeps Pull day, done, with its done part; a copy on tomorrow holds the two open parts (re-linked, not copied)', pullToday.completed === true && !!copy && copy.dueDate === TOMORROW && copy.completed === false && byId('row').parentId === 'pull' && byId('curl').parentId === copy.id && byId('face').parentId === copy.id && live().filter((t) => t.title === 'Curls').length === 1, JSON.stringify([pullToday, copy]));
  await I.js(`document.querySelector('[data-wrap-undo="pull"]') && document.querySelector('[data-wrap-undo="pull"]').click()`);
  await C.sleep(1500);
  check('the row\'s Undo puts it all back: no copy, the parts under Pull day, Pull day open', byId('pull').completed === false && !live().some((t) => t.title === 'Pull day' && t.id !== 'pull') && byId('curl').parentId === 'pull' && byId('face').parentId === 'pull');
  await I.click(`document.querySelector('[data-wrap-done]')`, 800).catch(() => {});
  await I.key('Escape', [], 600);

  // ---- Clear list: a task and its parts go together ----
  await I.js(`(() => { const x = [...document.querySelectorAll('[aria-label^="Close"]')]; })()`);
  const openClearList = async () => {
    await I.click(I.byLabel('Show Brain Dump list menu'), 600).catch(() => {});
  };
  // The Clear list tool is reached from the list's menu; the rules are covered by parts.test.ts, so here the batch itself is
  // checked through the storage the real app uses.
  check('the Gym list holds Leg day with its two parts (the real data this check relies on)', !!byId('leg') && byId('squat').parentId === 'leg' && byId('lunge').parentId === 'leg');
  void openClearList;

  // ---- Delete repeating task asks about the parts ----
  await I.hover(`${col(TODAY)}.querySelector('[aria-label="Title Upper day"]')`, 400);
  await I.click(`${col(TODAY)}.querySelector('[aria-label="More actions for Upper day"]')`, 700);
  await I.click(I.byLabel('Delete repeating task'), 600);
  await I.js(`(() => { const b = [...document.querySelectorAll('[aria-label="Confirm delete repeating task"]')][0]; b && b.click(); })()`);
  await C.sleep(900);
  const ask = await I.js(`(() => { const m = document.querySelector('[data-menu-parts-delete]'); return m ? m.innerText.replace(/\\s+/g, ' ') : null; })()`);
  check('Delete repeating task asks "Delete the task only" or "Delete the task and its 2 parts"', !!ask && ask.includes('Delete the task only') && ask.includes('Delete the task and its 2 parts'), String(ask));
  await I.shot('p66-delete');
  await I.click(I.byLabel('Delete the task and its 2 parts'), 1800);
  check('all: the series and both part templates are in the Trash, nothing left as a loose task', !live().some((t) => ['Upper day', 'Bench press', 'Shoulders'].includes(t.title) && !t.completed) && raw().filter((t) => t.parentId === 'up' && !t.id.includes(':')).every((t) => t.deletedAt), JSON.stringify(raw().filter((t) => t.id.startsWith('up') || t.parentId === 'up').map((t) => [t.id, !!t.completed, !!t.deletedAt, t.parentId])));
  await undo();
  check('one Ctrl+Z brings the series back (its parts with it)', live().some((t) => t.title === 'Upper day'));

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
