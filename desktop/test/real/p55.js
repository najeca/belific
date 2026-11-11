'use strict';
// @real-input: quiet
// Real check for PLAN_shifts S4 (3.39.0): repeating shifts and carry. Today the nurse's Shift 8:00 for 10 h repeats four
// days a week (today, tomorrow, +3, +4); Briefing 8:30 for 30m repeats on the same days; Lunch 13:00 is today only. A
// one off Night 20:00 for 12 h holds Handover 20:30 (today) and Meds 02:00 (tomorrow, after midnight). Quick call 19:00
// for 1 h and Study tomorrow 18:00 for 3 h each have two steps.
//   - the S4 fix: Quick call (under 2 h) keeps its steps ring; Study (3 h, to dos only) shows rows;
//   - the Shift card has Briefing and Lunch as rows; the Night card has Handover and "Meds 2:00am (next day)"; Meds has
//     no card tomorrow and tomorrow's total leaves it out;
//   - this day only: Down on tomorrow's Shift block (Timebox) moves that day and its Briefing by 30 minutes, nothing
//     else; one Ctrl+Z puts both back;
//   - a day move across midnight: Right on Night moves it, Handover and Meds a day later; one Ctrl+Z puts all back;
//   - Skip this day on the Shift card asks "Skip the shift only" / "Skip the shift and its 2 items"; with its items, the
//     shift's day, Briefing's day and Lunch go; one Ctrl+Z brings all three back;
//   - Delete on Night (details) asks; "Delete the shift and its 2 items" deletes all three; one Ctrl+Z restores them;
//   - Delete repeating task on the Shift card: "Delete the shift only" leaves Briefing and Lunch; one Ctrl+Z restores it.
// Runs quiet.
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
  const tomorrow = dk(1);
  const dayAfter = dk(2);
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const wd = (s) => WD[new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + s).getDay()];
  const days = [wd(0), wd(1), wd(3), wd(4)];
  const T = (id, title, startTime, durationMinutes, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, dueDate: today, startTime, durationMinutes, ...extra });
  const rule = { recurrence: 'weekly', recurrenceDays: days };
  const steps = [
    { id: 'a', title: 'First', done: false },
    { id: 'b', title: 'Second', done: false },
  ];
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      T('shift', 'Shift', '08:00', 600, rule),
      T('brief', 'Briefing', '08:30', 30, rule),
      T('lunch', 'Lunch', '13:00', 30),
      T('call', 'Quick call', '19:00', 60, { subtasks: steps }),
      T('study', 'Study', '18:00', 180, { dueDate: tomorrow, subtasks: steps.map((s) => ({ ...s, id: `s${s.id}` })) }),
      T('night', 'Night', '20:00', 720),
      T('handover', 'Handover', '20:30', 30),
      T('meds', 'Meds', '02:00', 30, { dueDate: tomorrow }),
    ]),
  );
  const read = readKv(dataDir);
  const raw = () => read('belific_tasks') || [];
  const live = (id) => raw().find((t) => t.id === id && !t.deletedAt);
  // Undo of a delete brings a task back under a new id (trash.ts): look it up by its title on its day.
  const liveT = (title, day = today) => raw().find((t) => t.title === title && t.dueDate === day && !t.deletedAt);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1440, 900);
  win.show();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await I.waitBody('Quick call', 20000);
  await I.click(I.byLabel('Show Tasks'), 900).catch(() => {});
  await C.sleep(900);

  const col = (day) => `document.querySelector('[data-day-col="${day}"]')`;
  const card = (day, id) => `${col(day)}.querySelector('[data-task-card="${id}"]')`;
  const cardT = (day, title) => `[...${col(day)}.querySelectorAll('[aria-label="Task ${title}"]')].find((e) => e.getBoundingClientRect().width > 0)`;
  const rowsOf = (day, id) => I.js(`(() => { const c = ${card(day, id)}; const b = c && c.querySelector('[data-shift-body]'); return b ? [...b.querySelectorAll('[data-inside-row]')].map((r) => r.innerText.replace(/\\s+/g, ' ').trim()) : null; })()`);
  const totalOf = (day) => I.js(`(() => { const e = ${col(day)} && ${col(day)}.querySelector('[aria-label^="Estimated for the day: "]'); return e ? e.getAttribute('aria-label').slice(23) : null; })()`);
  const undo = async () => {
    await I.blur();
    await I.key('Escape', [], 200);
    await I.key('Z', ['control'], 1500);
  };
  const menuOf = async (day, title) => {
    await I.js(`(() => { const c = ${cardT(day, title)}; const b = c && c.querySelector('[data-ctl="more"]'); if (b) b.click(); return !!b; })()`);
    await C.sleep(500);
  };
  const popover = `document.querySelector('[data-popover]')`;

  // ---- the S4 fix ----
  check('fix: Quick call (1 h, steps only) keeps its steps ring, no rows', (await I.exists(`${card(today, 'call')}.querySelector('[data-steps-ring]')`)) && !(await I.exists(`${card(today, 'call')}.querySelector('[data-shift-body]')`)));
  const study = await rowsOf(tomorrow, 'study');
  check('fix: Study (3 h, steps only) shows its two to dos as rows, no ring', !!study && study.length === 2 && !(await I.exists(`${card(tomorrow, 'study')}.querySelector('[data-steps-ring]')`)), JSON.stringify(study));

  // ---- rows, midnight ----
  const shiftRows = await rowsOf(today, 'shift');
  check('the Shift card has Briefing and Lunch as rows; neither has a card', !!shiftRows && shiftRows.length === 2 && shiftRows[0].startsWith('Briefing') && shiftRows[1].startsWith('Lunch') && !(await I.exists(card(today, 'brief'))) && !(await I.exists(card(today, 'lunch'))), JSON.stringify(shiftRows));
  const nightRows = await rowsOf(today, 'night');
  check('the Night card has Handover and "Meds 2:00am (next day)"', !!nightRows && nightRows.length === 2 && nightRows[0].startsWith('Handover') && nightRows[1].includes('Meds') && nightRows[1].includes('2:00am (next day)'), JSON.stringify(nightRows));
  check('Meds has no card tomorrow (it is a row of Night)', !(await I.exists(card(tomorrow, 'meds'))));
  const t0 = await totalOf(today);
  const t1 = await totalOf(tomorrow);
  check('totals: today 23h (Shift, Quick call, Night; what is inside counts once); tomorrow 13h (Shift and Study; Meds counts with Night)', t0 === '23:00' && t1 === '13:00', JSON.stringify([t0, t1]));
  await I.shot('p55-board');

  // ---- this day only: tomorrow's Shift 30 minutes later on the Timebox ----
  await I.click(I.byLabel('Next day'), 900);
  const focused = await I.js(`(() => { const b = [...document.querySelectorAll('[data-timebox-grid] [data-block-id="shift:${tomorrow}"]')].find((e) => e.getBoundingClientRect().width > 0); if (!b) return false; b.focus(); return document.activeElement === b; })()`);
  await I.key('Down', [], 1800);
  const occ = live(`shift:${tomorrow}`);
  const bOcc = live(`brief:${tomorrow}`);
  check('this day only: Down moves tomorrow\'s Shift to 8:30 and its Briefing to 9:00, that day only', focused && !!occ && occ.startTime === '08:30' && !!bOcc && bOcc.startTime === '09:00' && live('shift').startTime === '08:00' && live('brief').startTime === '08:30', JSON.stringify([focused, occ && occ.startTime, bOcc && bOcc.startTime]));
  check('and Study, outside the shift, stays at 18:00', live('study').startTime === '18:00');
  await undo();
  const occ2 = live(`shift:${tomorrow}`);
  const bOcc2 = live(`brief:${tomorrow}`);
  check('one Ctrl+Z puts both back', (!occ2 || occ2.startTime === '08:00') && (!bOcc2 || bOcc2.startTime === '08:30'), JSON.stringify([occ2, bOcc2]));
  await I.click(I.byLabel('Previous day'), 900);

  // ---- a day move across midnight: Night a day later ----
  const nf = await I.js(`(() => { const b = [...document.querySelectorAll('[data-timebox-grid] [data-block-id="night"]')].find((e) => e.getBoundingClientRect().width > 0); if (!b) return false; b.focus(); return document.activeElement === b; })()`);
  await I.key('Right', [], 1800);
  check('Right on Night: Night, Handover and Meds all move a day later (Meds to the day after tomorrow, 02:00)', nf && live('night').dueDate === tomorrow && live('handover').dueDate === tomorrow && live('handover').startTime === '20:30' && live('meds').dueDate === dayAfter && live('meds').startTime === '02:00', JSON.stringify([live('night').dueDate, live('handover').dueDate, live('meds').dueDate]));
  await undo();
  check('one Ctrl+Z puts all three back', live('night').dueDate === today && live('handover').dueDate === today && live('meds').dueDate === tomorrow, JSON.stringify([live('night').dueDate, live('handover').dueDate, live('meds').dueDate]));

  // ---- Skip this day, with its items ----
  await I.click(I.byLabel('Show Tasks'), 700).catch(() => {});
  await C.sleep(600);
  await menuOf(today, 'Shift');
  await I.click(`${popover}.querySelector('[aria-label="Skip this day"]')`, 900);
  const skipAsk = await I.textOf(`document.querySelector('[data-shift-choice="skip"]')`);
  check('Skip this day asks: "Skip the shift only" / "Skip the shift and its 2 items"', skipAsk.includes('Skip the shift only') && skipAsk.includes('Skip the shift and its 2 items'), skipAsk);
  await I.shot('p55-skip-ask');
  await I.click(`document.querySelector('[data-shift-choice="skip"] [data-shift-choice-pick="all"]')`, 1500);
  check('with its items: the shift\'s day, Briefing\'s day and Lunch are gone from today', !(await I.exists(card(today, 'shift'))) && !live('lunch') && !(raw().some((t) => !t.deletedAt && (t.id === 'brief' || t.id === `brief:${today}`) && t.dueDate === today)), JSON.stringify(raw().filter((t) => ['shift', 'brief', 'lunch'].includes(t.id.split(':')[0])).map((t) => [t.id, t.dueDate, !!t.deletedAt])));
  await undo();
  const back = await I.js(`(() => { const c = ${cardT(today, 'Shift')}; const b = c && c.querySelector('[data-shift-body]'); return b ? b.querySelectorAll('[data-inside-row]').length : null; })()`);
  check('one Ctrl+Z brings all three back: the Shift card with its two rows, Lunch', back === 2 && !!liveT('Lunch'), JSON.stringify([back, raw().filter((t) => ['Shift', 'Briefing', 'Lunch'].includes(t.title)).map((t) => [t.id, t.dueDate, !!t.deletedAt])]));

  // ---- Delete Night from its details, with its items ----
  await I.click(`${cardT(today, 'Night')}.querySelector('[aria-label="Title Night"]')`, 900);
  const panel = `document.querySelector('[data-detail-panel]')`;
  await C.waitFor(() => I.exists(panel), 4000);
  await I.click(`${panel}.parentElement.querySelector('[aria-label="More task actions"]') || document.querySelector('[aria-label="More task actions"]')`, 600);
  await I.click(`document.querySelector('[data-popover] [aria-label="Delete task"]')`, 500);
  await I.js(`(() => { const c = document.querySelector('[aria-label="Confirm delete task"]'); if (c) { c.scrollIntoView({ block: 'center' }); c.click(); } })()`);
  await C.sleep(900);
  const delAsk = await I.textOf(`document.querySelector('[data-shift-choice="delete"]')`);
  check('Delete on Night asks: "Delete the shift only" / "Delete the shift and its 2 items"', delAsk.includes('Delete the shift only') && delAsk.includes('Delete the shift and its 2 items'), delAsk);
  await I.shot('p55-delete-ask');
  await I.js(`document.querySelector('[data-shift-choice="delete"] [data-shift-choice-pick="all"]').click()`);
  await C.sleep(1500);
  check('"Delete the shift and its 2 items": Night, Handover and Meds go to the Trash', !live('night') && !live('handover') && !live('meds'));
  await undo();
  check('one Ctrl+Z restores all three', !!liveT('Night') && !!liveT('Handover') && !!liveT('Meds', tomorrow));

  // ---- Delete repeating task, the shift only ----
  await I.click(I.byLabel('Show Tasks'), 700).catch(() => {});
  await C.sleep(700);
  await menuOf(today, 'Shift');
  await I.click(`${popover}.querySelector('[aria-label="Delete repeating task"]')`, 500);
  await I.click(`${popover}.querySelector('[aria-label="Confirm delete repeating task"]')`, 900);
  check('Delete repeating task asks too', await I.exists(`document.querySelector('[data-shift-choice="delete"]')`));
  await I.click(`document.querySelector('[data-shift-choice="delete"] [data-shift-choice-pick="only"]')`, 1500);
  check('"Delete the shift only": the shift series is gone, Briefing and Lunch stay', !liveT('Shift') && !!liveT('Briefing') && !!liveT('Lunch'), JSON.stringify([!!liveT('Shift'), !!liveT('Briefing'), !!liveT('Lunch')]));
  await undo();
  // As since 3.21.0 (undoStack.ts reviveRows): a deleted series comes back as a copy of the day, without its rule.
  check('one Ctrl+Z brings the shift back (as a copy of the day, as undo of a deleted series always has)', !!liveT('Shift'), JSON.stringify(liveT('Shift')));

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
