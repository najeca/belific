'use strict';
// @real-input: quiet
// Real check for 3.25.0: Missed. (1) "Show missed tasks" is off by default: no Earlier pill, no Missed panel, no "what
// you missed" step in Daily Planning, and Finish brings nothing onto today; the switch is in Settings and writes the
// synced row. (2) On: the Missed list holds one off tasks only (a repeating task's past days are never listed and
// nothing is written for them); "Skip all" and a per row "Done" mark tasks done on their own days (Day kept, completion
// recorded on that day, nothing deleted); an Undo for 8 seconds, no question first. (3) The same Skip all next to
// "Move all to today" in Daily Planning step 1, as a draft written on Finish. Light and dark.
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
  const settings = () => read('belific_user_settings') || [];
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
  const panel = (sel) => `document.querySelector('[role="dialog"][aria-label="Missed"] ${sel}')`;
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

  // ======== 1. Off by default ========
  check('1: Show missed tasks is off for a person who never saved it: no Earlier pill', !(await I.exists(pill)));
  await openPlanning();
  check('1: Daily Planning step 1 has no "what you missed" column', (await flowOpen()) && !((await I.body()).includes("Here's what you missed")) && !(await I.exists(`document.querySelector('[data-flow] [data-missed-list]')`)));
  const before = JSON.stringify(tasks());
  for (let i = 0; i < 3; i++) await I.click(inFlow('Next step'), 400);
  await I.click(inFlow('Finish'), 1000);
  await C.sleep(600);
  check('1: Finish brings nothing onto today: the missed tasks stay on their own days', byId('m1').dueDate === dk(-3) && byId('m2').dueDate === dk(-2) && byId('m3').dueDate === dk(-1) && byId('m2').startTime === '08:00', JSON.stringify(tasks().map((t) => [t.id, t.dueDate])));
  void before;

  // The switch in Settings.
  const icon = (await I.exists(I.byLabel('Profile and account'))) ? 'Profile and account' : 'Profile, not signed in';
  const openSettings = async () => {
    await I.click(I.byLabel(icon));
    await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 700);
    await I.waitBody('POWER FEATURES', 8000);
  };
  await openSettings();
  const sw = I.byLabel('🕐 Show missed tasks');
  check('1: Settings has the switch "Show missed tasks", off', (await I.exists(sw)) && (await I.js(`${sw}.getAttribute('aria-checked')`)) === 'false');
  await I.click(sw, 700);
  await C.waitFor(() => settings().find((s) => s.key === 'feature.missed')?.value === 'on', 6000).catch(() => {});
  check('1: turning it on writes the synced row feature.missed = on', settings().find((s) => s.key === 'feature.missed')?.value === 'on', JSON.stringify(settings()));
  await I.click(I.byLabel('Back'), 900);
  await I.click(I.byLabel('Show Tasks'), 800).catch(() => {});
  await C.sleep(800);

  // ======== 2. On: the Missed panel ========
  check('2: the Earlier pill is there and counts the three one off tasks (no Gym day)', (await badge()) === '3', String(await badge()));
  await I.click(pill, 700);
  const rows = () => I.js(`[...document.querySelectorAll('[role="dialog"][aria-label="Missed"] [data-missed-row]')].map((r) => r.getAttribute('data-missed-row'))`);
  const r0 = await rows();
  check('2: the panel lists the three, oldest first, and no repeating day', JSON.stringify(r0) === JSON.stringify(['m1', 'm2', 'm3']), JSON.stringify(r0));
  const gymBefore = JSON.stringify(tasks().filter((t) => t.id === 'gym' || t.id.startsWith('gym:')));
  const btns = await I.js(`(() => { const a = document.querySelector('[role="dialog"][aria-label="Missed"] [data-missed-skip-all]'); const b = document.querySelector('[role="dialog"][aria-label="Missed"] [data-missed-all-today]'); if (!a || !b) return null; const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return { skip: a.innerText.trim(), today: b.innerText.trim(), sameLine: Math.abs(ra.top - rb.top) < 4, order: ra.left < rb.left, above: ra.bottom <= document.querySelector('[data-missed-row]').getBoundingClientRect().top }; })()`);
  check('2: "Skip all (3)" sits at the top, next to "Move all to today (3)"', !!btns && btns.skip === 'Skip all (3)' && btns.today === 'Move all to today (3)' && btns.sameLine && btns.order && btns.above, JSON.stringify(btns));
  check('2: every row has a Done button', (await I.exists(panel('[aria-label^="Mark Missed one done"]'))) && (await I.exists(panel('[aria-label^="Mark Missed two done"]'))) && (await I.exists(panel('[aria-label^="Mark Missed three done"]'))));
  await I.shot(`p46-missed-panel-${mode}`);

  // A per row Done.
  await I.click(panel('[aria-label^="Mark Missed one done"]'), 700);
  await C.waitFor(() => byId('m1').completed === true, 4000).catch(() => {});
  const m1 = byId('m1');
  check('2: Done marks that task done on its own day: Day kept, completion on that day, not deleted', m1.completed === true && m1.dueDate === dk(-3) && localDay(m1.completedAt) === dk(-3) && !m1.deletedAt, JSON.stringify(m1));
  check('2: the other two are untouched and the row leaves the list', !byId('m2').completed && !byId('m3').completed && !(await rows()).includes('m1'), JSON.stringify(await rows()));
  check('2: an Undo shows, with no question first', await I.exists(`document.querySelector('[data-undo-bar]')`) && !(await I.exists(`document.querySelector('[role="alertdialog"]')`)));
  await I.click(`document.querySelector('[data-undo-bar] [aria-label="Undo"]')`, 700);
  await C.waitFor(() => byId('m1').completed === false, 4000).catch(() => {});
  check('2: Undo puts the task back exactly (not done, no completion time), and it is listed again', byId('m1').completed === false && !byId('m1').completedAt && byId('m1').dueDate === dk(-3) && (await rows()).includes('m1'), JSON.stringify(byId('m1')));

  // Skip all.
  await I.click(panel('[data-missed-skip-all]'), 800);
  await C.waitFor(() => ['m1', 'm2', 'm3'].every((id) => byId(id).completed === true), 4000).catch(() => {});
  const all = ['m1', 'm2', 'm3'].map(byId);
  check('2: Skip all marks all three done on their own days (Days and times kept)', all.every((t) => t.completed && localDay(t.completedAt) === t.dueDate && !t.deletedAt) && byId('m2').startTime === '08:00' && byId('m2').dueDate === dk(-2), JSON.stringify(all));
  check('2: it ticks the steps too, like any completion', (byId('m3').subtasks || []).every((s) => s.done), JSON.stringify(byId('m3').subtasks));
  check('2: nothing was deleted and nothing was written for the repeating Gym days', tasks().length === 6 && JSON.stringify(tasks().filter((t) => t.id === 'gym' || t.id.startsWith('gym:'))) === gymBefore);
  check('2: the list is empty and the pill count follows', (await rows()).length === 0 && (await I.body()).includes('Nothing missed'));
  check('2: one Undo for all three', (await I.exists(`document.querySelector('[data-undo-bar]')`)) && ((await I.js(`document.querySelector('[data-undo-bar]').innerText`)) || '').includes('3 done'), await I.js(`(document.querySelector('[data-undo-bar]') || {}).innerText`));
  await I.shot(`p46-missed-skipped-${mode}`);
  await I.click(`document.querySelector('[data-undo-bar] [aria-label="Undo"]')`, 800);
  await C.waitFor(() => ['m1', 'm2', 'm3'].every((id) => byId(id).completed === false), 4000).catch(() => {});
  check('2: Undo takes all three back (steps as they were too)', ['m1', 'm2', 'm3'].every((id) => !byId(id).completed && !byId(id).completedAt) && (byId('m3').subtasks || []).every((s) => !s.done), JSON.stringify(['m1', 'm2', 'm3'].map(byId)));
  check('2: and they are listed again', JSON.stringify(await rows()) === JSON.stringify(['m1', 'm2', 'm3']), JSON.stringify(await rows()));
  // The Undo goes away by itself after about 8 seconds.
  await I.click(panel('[aria-label^="Mark Missed one done"]'), 700);
  await C.waitFor(() => byId('m1').completed === true, 4000).catch(() => {});
  const shown = await I.exists(`document.querySelector('[data-undo-bar]')`);
  const t0 = Date.now();
  const gone = await C.waitFor(async () => !(await I.exists(`document.querySelector('[data-undo-bar]')`)), 14000).then(() => Date.now() - t0).catch(() => -1);
  check(`2: the Undo shows, and goes by itself after about 8 seconds (gone after ${gone} ms)`, shown && gone >= 6500 && gone <= 12500, String(gone));
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
