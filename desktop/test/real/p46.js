'use strict';
// @real-input: quiet
// Real check for 3.25.0: Missed, rewritten on purpose for F3 of PLAN_daily_flow (3.42.0). (1) There is no "Show missed
// tasks" switch any more: the Earlier pill is there for everyone (D5: the board's past days show only done tasks), and
// Plan my day's Finish brings nothing onto today. (2) The Earlier panel holds one off tasks only (a repeating task's past
// days are never listed and nothing is written for them); a tick and "Tick all" mark tasks done on their own days (Day
// kept, completion recorded on that day, nothing deleted), saved at once with an Undo on the row (or at the top for Tick
// all), no question first. (3) Skip all next to "Move all to today" in Plan my day step 1, as a draft written on Finish
// (until F4). Light and dark.
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
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      T('m1', 'Missed one', { dueDate: dk(-3) }),
      T('m2', 'Missed two', { dueDate: dk(-2), startTime: '08:00', durationMinutes: 30 }),
      T('m3', 'Missed three', { dueDate: dk(-1), subtasks: [{ id: 's1', title: 'Step', done: false }] }),
      T('gym', 'Gym', { dueDate: dk(-6), recurrence: 'daily' }),
      T('t1', 'Today task', { dueDate: today }),
      T('b1', 'Brain one'),
    ]),
  );
  // NO settings file: a person who never saved a value for the switch.
  const read = readKv(dataDir);
  const tasks = () => read('belific_tasks') || [];
  const byId = (id) => tasks().find((t) => t.id === id);
  const localDay = (iso) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1440, 900);
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await I.waitBody('Brain one', 20000);
  await I.click(I.byLabel('Show Tasks'), 800).catch(() => {});
  await C.sleep(800);
  const mode = process.env.P46_DARK ? 'dark' : 'light';
  const flowOpen = () => I.exists(`document.querySelector('[data-flow]')`);
  const inFlow = (label) => `document.querySelector('[data-flow] [aria-label=${JSON.stringify(label)}]')`;
  const pill = `document.querySelector('[data-missed-button]')`;
  const badge = () => I.js(`document.querySelector('[data-missed-button]')?.getAttribute('data-missed-button') ?? null`);
  const openPlanning = async () => {
    await I.blur();
    await I.key('P', ['control', 'shift']);
    await C.waitFor(flowOpen, 4000).catch(() => {});
    await C.sleep(400);
  };

  if (mode === 'dark') {
    const ic = (await I.exists(I.byLabel('Profile and account'))) ? 'Profile and account' : 'Profile, not signed in';
    await I.click(I.byLabel(ic));
    await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 700);
    await I.waitBody('POWER FEATURES', 8000);
    await I.click(`document.querySelector('[data-theme-setting] [data-theme-mode="dark"]')`, 900);
    await I.click(I.byLabel('Back'), 900);
    await I.click(I.byLabel('Show Tasks'), 800).catch(() => {});
    await C.sleep(600);
  }

  // ======== 1. No switch: Earlier is always there ========
  check('1: the Earlier pill is there for a person who never saved anything, and counts the three one off tasks (no Gym day)', (await I.exists(pill)) && (await badge()) === '3', String(await badge()));
  await openPlanning();
  check('1: Plan my day step 1 lists the earlier days', (await flowOpen()) && (await I.exists(`document.querySelector('[data-flow] [data-missed-list]')`)));
  for (let i = 0; i < 3; i++) await I.click(inFlow('Next step'), 400);
  await I.click(inFlow('Finish'), 1000);
  await C.sleep(600);
  check('1: Finish brings nothing onto today: the earlier tasks stay on their own days', byId('m1').dueDate === dk(-3) && byId('m2').dueDate === dk(-2) && byId('m3').dueDate === dk(-1) && byId('m2').startTime === '08:00', JSON.stringify(tasks().map((t) => [t.id, t.dueDate])));
  const icon = (await I.exists(I.byLabel('Profile and account'))) ? 'Profile and account' : 'Profile, not signed in';
  await I.click(I.byLabel(icon));
  await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 700);
  await I.waitBody('POWER FEATURES', 8000);
  check('1: Settings has no "Show missed tasks" switch', !(await I.body()).includes('Show missed tasks'));
  await I.click(I.byLabel('Back'), 900);
  await I.click(I.byLabel('Show Tasks'), 800).catch(() => {});
  await C.sleep(800);

  // ======== 2. The Earlier panel ========
  await I.click(pill, 700);
  const rows = () => I.js(`[...document.querySelectorAll('[data-earlier] [data-wrap-row]:not([data-wrap-decided])')].map((r) => r.getAttribute('data-wrap-row'))`);
  const r0 = await rows();
  check('2: the panel lists the three, oldest first, and no repeating day', JSON.stringify(r0) === JSON.stringify(['m1', 'm2', 'm3']), JSON.stringify(r0));
  const gymBefore = JSON.stringify(tasks().filter((t) => t.id === 'gym' || t.id.startsWith('gym:')));
  const top = await I.js(`(() => { const a = document.querySelector('[data-earlier-tick-all]'); if (!a) return null; return { text: a.innerText.trim(), above: a.getBoundingClientRect().bottom <= document.querySelector('[data-earlier] [data-wrap-row]').getBoundingClientRect().top }; })()`);
  check('2: "Tick all 3" sits at the top', !!top && top.text === 'Tick all 3' && top.above, JSON.stringify(top));
  check('2: every row has a tick and the three buttons', (await I.exists(`document.querySelector('[data-wrap-tick="m1"]')`)) && (await I.exists(`document.querySelector('[data-wrap-for="m3"][data-wrap-btn="tomorrow"]')`)) && (await I.exists(`document.querySelector('[data-wrap-for="m3"][data-wrap-btn="list"]')`)) && (await I.exists(`document.querySelector('[data-wrap-for="m3"][data-wrap-btn="letgo"]')`)));
  await I.shot(`p46-missed-panel-${mode}`);

  // A tick on one row.
  await I.click(`document.querySelector('[data-wrap-tick="m1"]')`, 900);
  await C.waitFor(() => byId('m1').completed === true, 4000).catch(() => {});
  const m1 = byId('m1');
  check('2: a tick marks that task done on its own day: Day kept, completion on that day, not deleted', m1.completed === true && m1.dueDate === dk(-3) && localDay(m1.completedAt) === dk(-3) && !m1.deletedAt, JSON.stringify(m1));
  check('2: the other two are untouched; the row folds with its own Undo, no question first', !byId('m2').completed && !byId('m3').completed && (await I.exists(`document.querySelector('[data-wrap-undo="m1"]')`)) && !(await I.exists(`document.querySelector('[role="alertdialog"]')`)));
  await I.click(`document.querySelector('[data-wrap-undo="m1"]')`, 900);
  await C.waitFor(() => byId('m1').completed === false, 4000).catch(() => {});
  check('2: Undo puts the task back exactly (not done, no completion time), and it is listed again', byId('m1').completed === false && !byId('m1').completedAt && byId('m1').dueDate === dk(-3) && (await rows()).includes('m1'), JSON.stringify(byId('m1')));

  // Tick all.
  await I.click(`document.querySelector('[data-earlier-tick-all]')`, 1200);
  await C.waitFor(() => ['m1', 'm2', 'm3'].every((id) => byId(id).completed === true), 4000).catch(() => {});
  const all = ['m1', 'm2', 'm3'].map(byId);
  check('2: Tick all marks all three done on their own days (Days and times kept)', all.every((t) => t.completed && localDay(t.completedAt) === t.dueDate && !t.deletedAt) && byId('m2').startTime === '08:00' && byId('m2').dueDate === dk(-2), JSON.stringify(all));
  check('2: it ticks the steps too, like any completion', (byId('m3').subtasks || []).every((x) => x.done), JSON.stringify(byId('m3').subtasks));
  check('2: nothing was deleted and nothing was written for the repeating Gym days', tasks().length === 6 && JSON.stringify(tasks().filter((t) => t.id === 'gym' || t.id.startsWith('gym:'))) === gymBefore);
  await C.sleep(600);
  check('2: one Undo for all three, at the top; the pill count follows', (await I.js(`document.querySelector('[data-earlier-ticked]')?.getAttribute('data-earlier-ticked') ?? null`)) === '3' && (await rows()).length === 0 && (await badge()) === '0', String(await badge()));
  await I.shot(`p46-missed-skipped-${mode}`);
  await I.click(`document.querySelector('[data-earlier-tick-all-undo]')`, 1200);
  await C.waitFor(() => ['m1', 'm2', 'm3'].every((id) => byId(id).completed === false), 4000).catch(() => {});
  check('2: Undo takes all three back (steps as they were too)', ['m1', 'm2', 'm3'].every((id) => !byId(id).completed && !byId(id).completedAt) && (byId('m3').subtasks || []).every((x) => !x.done), JSON.stringify(['m1', 'm2', 'm3'].map(byId)));
  check('2: and they are listed again', JSON.stringify(await rows()) === JSON.stringify(['m1', 'm2', 'm3']), JSON.stringify(await rows()));
  await I.click(`document.querySelector('[data-wrap-tick="m1"]')`, 900);
  await C.waitFor(() => byId('m1').completed === true, 4000).catch(() => {});
  check('2: the task stays done on its own day', byId('m1').completed === true && byId('m1').dueDate === dk(-3));
  await I.shot(`p46-missed-panel-after-${mode}`);
  await I.key('Escape', [], 500);

  // ======== 3. Daily Planning (two missed tasks left) ========
  await openPlanning();
  const flowBtns = await I.js(`(() => { const a = document.querySelector('[data-flow] [data-missed-skip-all]'); const b = document.querySelector('[data-flow] [data-missed-all-today]'); if (!a || !b) return null; const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return { skip: a.innerText.trim(), today: b.innerText.trim(), sameLine: Math.abs(ra.top - rb.top) < 4, order: ra.left < rb.left }; })()`);
  check('3: Planning step 1 has "Skip all (2)" next to "Move all to today (2)"', !!flowBtns && flowBtns.skip === 'Skip all (2)' && flowBtns.today === 'Move all to today (2)' && flowBtns.sameLine && flowBtns.order, JSON.stringify(flowBtns));
  check('3: each row has a Done tick (the existing round tick) and no repeating day is listed', (await I.exists(inFlow('Mark Missed two done'))) && !(await I.exists(`document.querySelector('[data-flow] [data-missed-row="gym"]')`)));
  const rawBefore = JSON.stringify(tasks());
  await I.shot(`p46-planning-${mode}`);
  await I.click(`document.querySelector('[data-flow] [data-missed-skip-all]')`, 500);
  check('3: Skip all is a draft: the rows are ticked, an Undo shows for a few seconds, nothing is stored yet', (await I.exists(inFlow('Mark Missed two not done'))) && (await I.exists(`document.querySelector('[data-flow] [data-missed-undo]')`)) && JSON.stringify(tasks()) === rawBefore);
  await I.click(`document.querySelector('[data-flow] [data-missed-undo-btn]')`, 500);
  check('3: Undo unticks them', (await I.exists(inFlow('Mark Missed two done'))) && !(await I.exists(`document.querySelector('[data-flow] [data-missed-undo]')`)) && JSON.stringify(tasks()) === rawBefore);
  await I.click(`document.querySelector('[data-flow] [data-missed-skip-all]')`, 500);
  for (let i = 0; i < 3; i++) await I.click(inFlow('Next step'), 400);
  await I.click(inFlow('Finish'), 1000);
  await C.waitFor(() => byId('m2').completed === true && byId('m3').completed === true, 5000).catch(() => {});
  check('3: Finish writes them done on their own days (Day kept, nothing rolled to today, nothing deleted)', ['m2', 'm3'].every((id) => byId(id).completed && localDay(byId(id).completedAt) === byId(id).dueDate && !byId(id).deletedAt) && byId('m2').dueDate === dk(-2) && byId('m3').dueDate === dk(-1), JSON.stringify(['m2', 'm3'].map(byId)));
  check('3: the repeating Gym rows and the other tasks are untouched', JSON.stringify(tasks().filter((t) => t.id === 'gym' || t.id.startsWith('gym:'))) === gymBefore && byId('t1').dueDate === today && !byId('t1').completed);
  check('3: nothing is missed any more: the pill shows 0', (await badge()) === '0', String(await badge()));

  app.exit(summary() === 0 ? 0 : 1);
}
