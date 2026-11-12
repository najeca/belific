'use strict';
// @real-input: quiet
// Real check for R4 of PLAN_repeat_end_and_parts (3.50.0): Parts, on a FIXED CLOCK (Thursday 12 Nov 2026, 10:00).
//   - "Upper day" today: its details have a Parts section with a visible "Add part" button and no "Add subtask"; three
//     parts are added by typing a name and Enter each time (the box stays open); they are stored with the parent's id
//     and no Day;
//   - on the board they are rows in Upper day's card with a bar and "0 of 3 done", never cards of their own, and not in
//     the left list; a tick works in place ("1 of 3 done"), one Ctrl+Z each; the last one completes Upper day;
//   - totals count once (E2): "Pull day" has no estimate and parts of 20m and 25m, so today reads 0:45;
//   - a part's details say "Part of Upper day" with no Day row, and "Take out of Upper day" makes it an ordinary task;
//   - "Leg day" keeps its steps under "Checklist" with "Turn into parts"; one Ctrl+Z puts the steps back;
//   - Delete asks "Delete the task only" or "Delete the task and its 3 parts"; each is one Ctrl+Z;
//   - text 14 px or more, nothing red.
// Runs quiet.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const C = require('./common');
const { makeInput, readKv } = require('./input');

process.env.BELIFIC_NO_PROTOCOL_REGISTER = '1';
const userData = C.isolate();
console.log(`USERDATA ${userData}`);

const TODAY = '2026-11-12';

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
      T('upper', 'Upper day', { dueDate: TODAY, startTime: '18:00' }),
      T('pull', 'Pull day', { dueDate: TODAY }),
      T('row', 'Rows', { parentId: 'pull', durationMinutes: 20, createdAt: '2026-11-01T07:00:01.000Z' }),
      T('curl', 'Curls', { parentId: 'pull', durationMinutes: 25, createdAt: '2026-11-01T07:00:02.000Z' }),
      T('leg', 'Leg day', { dueDate: '2026-11-13', subtasks: [{ id: 's1', title: 'Squats', done: true }, { id: 's2', title: 'Lunges', done: false }] }),
    ]),
  );
  const read = readKv(dataDir);
  const raw = () => read('belific_tasks') || [];
  const live = () => raw().filter((t) => !t.deletedAt);
  const byId = (id) => raw().find((t) => t.id === id);
  const byTitle = (title) => live().find((t) => t.title === title);

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
  const card = (id) => `document.querySelector('[data-task-card="${id}"]')`;
  const panel = `document.querySelector('[data-detail-panel]')`;
  const undo = async () => {
    await I.blur();
    await I.key('Z', ['control'], 1700);
  };
  const notRed = (scope) =>
    I.js(`![...document.querySelectorAll('${scope}')].some((root) => [root, ...root.querySelectorAll('*')].some((e) => { const s = getComputedStyle(e); return [s.color, s.backgroundColor].some((c) => { const m = /rgba?\\((\\d+), (\\d+), (\\d+)/.exec(c); return m && +m[1] > 180 && +m[2] < 110 && +m[3] < 110; }); }))`);
  const minFont = (scope) => I.js(`Math.min(...[...document.querySelectorAll('${scope} *')].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).map((e) => parseFloat(getComputedStyle(e).fontSize)))`);
  const cardParts = (id) => I.js(`(() => { const b = document.querySelector('[data-card-parts="${id}"]'); if (!b) return null; return { done: b.querySelector('[data-card-parts-done]').innerText.trim(), rows: [...b.querySelectorAll('[data-card-part]')].map((r) => r.innerText.trim()) }; })()`);
  const openDetails = async (id, title) => {
    await I.click(`${card(id)}.querySelector('[aria-label="Title ${title}"]')`, 1000);
    await C.waitFor(() => I.exists(panel), 5000);
  };
  const closeDetails = async () => {
    await I.key('Escape', [], 700);
    await C.sleep(400);
  };

  // ---- totals count once (E2) ----
  const total = await I.js(`(() => { const e = ${col(TODAY)}.querySelector('[aria-label^="Estimated for the day: "]'); return e ? e.getAttribute('aria-label') : null; })()`);
  check('E2: Pull day has no estimate and parts of 20m and 25m: today reads 0:45, the parts never count twice', total === 'Estimated for the day: 0:45', String(total));
  check('Pull day\'s parts are rows in its card ("0 of 2 done"), never cards of their own', JSON.stringify(await cardParts('pull')) === JSON.stringify({ done: '0 of 2 done', rows: ['Rows\n20m', 'Curls\n25m'] }) && !(await I.exists(card('row'))) && !(await I.exists(card('curl'))), JSON.stringify(await cardParts('pull')));

  // ---- Add part, quick entry ----
  await openDetails('upper', 'Upper day');
  check('the details have Parts with a visible "Add part" button and no "Add subtask"', (await I.exists(`document.querySelector('[data-add-part]')`)) && !(await I.exists(I.byLabel('Add subtask to Upper day'))));
  await I.click(`document.querySelector('[data-part-input]')`, 300);
  for (const name of ['Bench press', 'Shoulders', 'Back']) {
    await I.type(name, 200);
    await I.enter([], 1200);
  }
  const parts = live().filter((t) => t.parentId === 'upper');
  check('Enter adds each part and the box stays open for the next: three parts, the parent\'s id, no Day', parts.length === 3 && parts.map((p) => p.title).join(',') === 'Bench press,Shoulders,Back' && parts.every((p) => !p.dueDate && !p.startTime) && (await I.activeLabel()) === 'Add a part to Upper day', JSON.stringify(parts.map((p) => [p.title, p.dueDate])));
  check('the section says "0 of 3 done"; 14 px or more; nothing red', (await I.js(`document.querySelector('[data-parts-done]').innerText.trim()`)) === '0 of 3 done' && (await minFont('[data-parts-section]')) >= 14 && (await notRed('[data-parts-section]')));
  await I.shot('p65-details');
  await closeDetails();

  // ---- on the board ----
  const cp = await cardParts('upper');
  check('Upper day\'s card has the three rows and "0 of 3 done"', !!cp && cp.done === '0 of 3 done' && cp.rows.length === 3, JSON.stringify(cp));
  const bench = byTitle('Bench press');
  check('the parts are not cards on the board, nor in the left list', !(await I.exists(card(bench.id))) && !(await I.js(`[...document.querySelectorAll('[aria-label="Title Bench press"]')].some((e) => !e.closest('[data-card-parts]'))`)));
  check('the card rows are 14 px or more, nothing red', (await minFont(`[data-card-parts="upper"]`)) >= 14 && (await notRed('[data-card-parts="upper"]')));
  await I.shot('p65-card');
  await I.click(`document.querySelector('[data-card-part-tick="${bench.id}"]')`, 1700);
  check('a tick works in place: Bench press done, "1 of 3 done", the details not opened', byId(bench.id).completed === true && (await cardParts('upper')).done === '1 of 3 done' && !(await I.exists(panel)));
  await undo();
  check('one Ctrl+Z unticks it', byId(bench.id).completed === false && (await cardParts('upper')).done === '0 of 3 done');
  for (const p of live().filter((t) => t.parentId === 'upper')) await I.click(`document.querySelector('[data-card-part-tick="${p.id}"]')`, 1700);
  // A done task leaves the board unless "Show complete" is on, so the stored rows are checked.
  check('the last open part completes Upper day', byId('upper').completed === true && live().filter((t) => t.parentId === 'upper').every((p) => p.completed), JSON.stringify(byId('upper')));
  await undo();
  check('one Ctrl+Z unticks the last part and reopens Upper day', byId('upper').completed === false && (await cardParts('upper')).done === '2 of 3 done');
  await undo();
  await undo();
  check('two more and nothing is ticked', live().filter((t) => t.parentId === 'upper').every((p) => !p.completed));

  // ---- a part's details, take out ----
  await openDetails('upper', 'Upper day');
  await I.click(`document.querySelector('[data-part-open="${bench.id}"]')`, 1000);
  check('the part\'s details say "Part of Upper day", with no Day row', (await I.exists(`document.querySelector('[data-part-of="upper"]')`)) && (await I.js(`document.querySelector('[data-part-of]').innerText.includes('Part of Upper day')`)) && !(await I.js(`document.querySelector('[data-detail-panel]').innerText.includes('Task date')`)));
  await I.shot('p65-part');
  await I.click(`document.querySelector('[data-take-out="${bench.id}"]')`, 1500);
  check('"Take out of Upper day": an ordinary task on today, in no parent', !byId(bench.id).parentId && byId(bench.id).dueDate === TODAY, JSON.stringify(byId(bench.id)));
  await closeDetails();
  check('it is a card on today now; Upper day has two rows', (await I.exists(card(bench.id))) && (await cardParts('upper')).rows.length === 2);
  await undo();
  check('one Ctrl+Z puts it back under Upper day', byId(bench.id).parentId === 'upper' && !(await I.exists(card(bench.id))) && (await cardParts('upper')).rows.length === 3);

  // ---- steps into parts ----
  await openDetails('leg', 'Leg day');
  check('Leg day keeps its steps under "Checklist" with a visible "Turn into parts"', (await I.js(`document.querySelector('[data-detail-panel]').innerText.includes('Checklist')`)) && (await I.exists(`document.querySelector('[data-turn-into-parts]')`)));
  await I.click(`document.querySelector('[data-turn-into-parts]')`, 1500);
  const legParts = live().filter((t) => t.parentId === 'leg');
  check('Turn into parts: two parts with the same names and ticks, the checklist emptied', legParts.map((p) => `${p.title}:${p.completed}`).join(',') === 'Squats:true,Lunges:false' && !(byId('leg').subtasks || []).length, JSON.stringify([legParts, byId('leg').subtasks]));
  await closeDetails();
  await undo();
  check('one Ctrl+Z puts the steps back and the parts away', (byId('leg').subtasks || []).length === 2 && !live().some((t) => t.parentId === 'leg'));

  // ---- delete ----
  await openDetails('upper', 'Upper day');
  await I.click(I.byLabel('More task actions'), 500);
  await I.click(I.byLabel('Delete task'), 700);
  check('Delete asks "Delete the task only" or "Delete the task and its 3 parts"', (await I.exists(`document.querySelector('[data-parts-delete-choice="only"]')`)) && (await I.js(`document.querySelector('[data-parts-delete-choice="all"]').innerText.trim()`)) === 'Delete the task and its 3 parts');
  await I.shot('p65-delete');
  await I.click(`document.querySelector('[data-parts-delete-choice="all"]')`, 1500);
  check('"Delete the task and its 3 parts": all four to the Trash', ['upper', ...raw().filter((t) => t.parentId === 'upper').map((t) => t.id)].every((id) => byId(id).deletedAt) && raw().filter((t) => t.parentId === 'upper').length === 3);
  await undo();
  // A tombstone is never cleared: Upper day comes back under a new id, and its parts follow it (R4).
  const up2 = byTitle('Upper day');
  check('one Ctrl+Z brings all four back together: the parts under the restored Upper day', !!up2 && live().filter((t) => t.parentId === up2.id).length === 3 && ((await cardParts(up2.id)) || { rows: [] }).rows.length === 3, JSON.stringify([up2, await cardParts(up2 && up2.id)]));
  await openDetails(up2.id, 'Upper day');
  await I.click(I.byLabel('More task actions'), 500);
  await I.click(I.byLabel('Delete task'), 700);
  await I.click(`document.querySelector('[data-parts-delete-choice="only"]')`, 1500);
  const freed = live().filter((t) => ['Bench press', 'Shoulders', 'Back'].includes(t.title));
  check('"Delete the task only": Upper day to the Trash, its parts ordinary tasks on today', !byTitle('Upper day') && freed.length === 3 && freed.every((t) => !t.parentId && t.dueDate === TODAY), JSON.stringify(freed));
  check('they are cards on today now', await I.exists(card(freed[0].id)));
  await undo();
  const up3 = byTitle('Upper day');
  check('one Ctrl+Z puts it all back', !!up3 && live().filter((t) => t.parentId === up3.id).length === 3);

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
