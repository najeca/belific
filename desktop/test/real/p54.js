'use strict';
// @real-input: quiet
// Real check for PLAN_shifts S3 (3.38.0): the shift's card and details, and "Add inside". Today: the nurse's Shift 8:00 for
// 10 h with Briefing 8:30 30m, Teams press meeting 10:00 1h, Ring patients 11:00 2h and Ring other departments 14:00 1h
// inside it (no lunch yet), and "Clinic" 19:00 for 2 h repeating every day.
//   - the Tasks board: the Shift card says "4h 30m of 10h planned, 5h 30m free", has a bar "0 of 4 done" and four rows;
//     the four are NOT cards of their own (D2) and the day still totals 10h (+2h Clinic);
//   - the details window shows the same, with an "Add inside" button;
//   - Add inside from the details: Lunch at 13:00 for 30 minutes -> an ordinary task on the day, a fifth row: "5h of 10h
//     planned, 5h free", "0 of 5 done";
//   - Add inside from the card: "Call other departments", no time -> an item of the shift's checklist (a sixth row);
//   - a time that sticks out of the shift says so in grey and offers "Fit inside";
//   - the right click menu of a block on the Calendar has "Add inside" and opens the same form;
//   - both new rows are ticked in place (no details opened): Lunch's task and the checklist item; the shift itself stays
//     open; each tick is one Ctrl+Z, and so is each add;
//   - Clinic repeats, so its form has "This day only" / "This and following" (3.49.0) / "All days of Clinic" with All days chosen: a to do added to all
//     days shows on tomorrow's Clinic card too, unticked.
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
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, startTime, durationMinutes, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, dueDate: today, startTime, durationMinutes, ...extra });
  const all7 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      T('shift', 'Shift', '08:00', 600),
      T('briefing', 'Briefing', '08:30', 30),
      T('teams', 'Teams press meeting', '10:00', 60),
      T('patients', 'Ring patients', '11:00', 120),
      T('depts', 'Ring other departments', '14:00', 60),
      T('clinic', 'Clinic', '19:00', 120, { recurrence: 'weekly', recurrenceDays: all7, dueDate: today }),
    ]),
  );
  const read = readKv(dataDir);
  const rows = () => (read('belific_tasks') || []).filter((t) => !t.deletedAt);
  const byId = (id) => rows().find((t) => t.id === id);
  const byTitle = (title) => rows().find((t) => t.title === title);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1440, 900);
  win.show();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await I.waitBody('Clinic', 20000);
  await I.click(I.byLabel('Show Tasks'), 900).catch(() => {});
  await C.sleep(800);

  const col = `document.querySelector('[data-day-col="${today}"]')`;
  const card = (id) => `${col}.querySelector('[data-task-card="${id}"]')`;
  const panel = `document.querySelector('[data-detail-panel]')`;
  const shiftBody = () =>
    I.js(`(() => {
      const c = ${card('shift')};
      const b = c && c.querySelector('[data-shift-body="shift"]');
      if (!b) return null;
      const sum = b.querySelector('[data-shift-summary-text]');
      const prog = b.querySelector('[data-shift-progress]');
      const rows = [...b.querySelectorAll('[data-inside-row]')].map((r) => r.getAttribute('data-inside-row'));
      const sizes = [sum, prog, ...b.querySelectorAll('[data-inside-row] span, [data-inside-row] div[dir]')].filter(Boolean).map((e) => parseFloat(getComputedStyle(e).fontSize));
      return { summary: sum ? sum.innerText : null, progress: prog ? prog.getAttribute('data-shift-progress') : null, doneText: prog ? prog.innerText.trim() : null, rows, add: !!b.querySelector('[data-add-inside]') };
    })()`);
  const rowOf = (key) => `${card('shift')}.querySelector('[data-inside-row="${key}"]')`;
  const tickOf = (key) => `${card('shift')}.querySelector('[data-inside-tick="${key}"]')`;
  const setInput = (sel, value) =>
    I.js(`(() => { const e = document.querySelector('${sel}'); if (!e) return false; const proto = e.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  const form = `document.querySelector('[data-add-inside-form]')`;
  const stackText = async (n) => {
    await I.blur();
    await I.key('Z', ['control'], 1400);
  };

  // ---- the card ----
  const s0 = await shiftBody();
  check('the Shift card: "4h 30m of 10h planned, 5h 30m free", "0 of 4 done", four rows', !!s0 && s0.summary === '4h 30m of 10h planned, 5h 30m free' && s0.progress === '0/4' && s0.doneText === '0 of 4 done' && s0.rows.length === 4, JSON.stringify(s0));
  check('D2: the four inside are rows, not cards of their own', !(await I.exists(card('briefing'))) && !(await I.exists(card('teams'))) && !(await I.exists(card('patients'))) && !(await I.exists(card('depts'))) && (await I.exists(card('shift'))));
  const total = await I.js(`(() => { const e = ${col}.querySelector('[aria-label^="Estimated for the day: "]'); return e ? e.getAttribute('aria-label') : null; })()`);
  check('the day total is the shift once plus Clinic: 12h (not doubled)', total === 'Estimated for the day: 12:00', String(total));
  const fonts = await I.js(`(() => { const c = ${card('shift')}; const b = c.querySelector('[data-shift-body]'); return [...b.querySelectorAll('*')].filter((e) => e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).map((e) => parseFloat(getComputedStyle(e).fontSize)); })()`);
  check('every text of the body is at least 14 px', fonts.length > 8 && fonts.every((f) => f >= 14), JSON.stringify(fonts));
  await I.shot('p54-card');

  // ---- the details ----
  await I.click(`${card('shift')}.querySelector('[aria-label="Title Shift"]')`, 900);
  await C.waitFor(() => I.exists(panel), 4000);
  const d0 = await I.js(`(() => { const b = ${panel}.querySelector('[data-shift-body="shift"]'); if (!b) return null; const p = b.querySelector('[data-shift-progress]'); const s = b.querySelector('[data-shift-summary-text]'); return { summary: s && s.innerText, done: p && p.innerText.trim(), rows: b.querySelectorAll('[data-inside-row]').length, add: !!b.querySelector('[data-add-inside]') }; })()`);
  check('the details show the same: summary, "0 of 4 done", the rows and an "Add inside" button', !!d0 && d0.summary === '4h 30m of 10h planned, 5h 30m free' && d0.done === '0 of 4 done' && d0.rows === 4 && d0.add, JSON.stringify(d0));
  await I.shot('p54-details');

  // ---- Add inside from the details: Lunch at 13:00 for 30 minutes ----
  await I.click(`${panel}.querySelector('[data-add-inside="shift"]')`, 700);
  await C.waitFor(() => I.exists(form), 4000);
  const f0 = await I.js(`(() => { const f = ${form}; return { text: f.innerText.replace(/\\s+/g, ' '), repeats: !!f.querySelector('[data-add-inside-scope]'), todo: f.querySelector('[data-add-inside-when="todo"]').getAttribute('aria-checked'), focus: document.activeElement && document.activeElement.getAttribute('data-add-inside-name') }; })()`);
  check('the form: a name, "No time, just a to do" chosen, "At a time", no repeat choice on a shift that does not repeat; the name has the keyboard', f0.text.includes('Add inside Shift') && f0.text.includes('What is it?') && f0.text.includes('At a time') && f0.todo === 'true' && !f0.repeats && f0.focus === '1', JSON.stringify(f0));
  check('"Add" is not available without a name', (await I.js(`${form}.querySelector('[data-add-inside-submit]').getAttribute('aria-disabled') || ${form}.querySelector('[data-add-inside-submit]').disabled`)) !== false);
  await I.type('Lunch', 200);
  await I.click(`${form}.querySelector('[data-add-inside-when="timed"]')`, 400);
  await setInput('[data-add-inside-time]', '17:45');
  await C.sleep(300);
  const note = await I.textOf(`${form}.querySelector('[data-add-inside-note]')`);
  check('a time that sticks out says so in grey and offers "Fit inside"', note.includes('This would end after Shift (6:00pm)') && note.includes('Fit inside'), note);
  await I.shot('p54-form-note');
  await I.click(`${form}.querySelector('[data-add-inside-fit]')`, 400);
  check('"Fit inside" moves it to 5:30pm for 30 minutes', (await I.js(`document.querySelector('[data-add-inside-time]').value`)) === '17:30');
  await setInput('[data-add-inside-time]', '13:00');
  await C.sleep(300);
  check('and at 13:00 there is no note', !(await I.exists(`${form}.querySelector('[data-add-inside-note]')`)));
  await I.shot('p54-form');
  await I.click(`${form}.querySelector('[data-add-inside-submit]')`, 1200);
  const lunch = byTitle('Lunch');
  check('Lunch is an ordinary task on the day at 13:00 for 30 minutes, not repeating', !!lunch && lunch.dueDate === today && lunch.startTime === '13:00' && lunch.durationMinutes === 30 && !lunch.recurrence && !lunch.cutsBelow, JSON.stringify(lunch));
  await I.blur();
  await I.key('Escape');
  await C.sleep(700);
  const s1 = await shiftBody();
  check('the card: "5h of 10h planned, 5h free", "0 of 5 done", five rows, and Lunch has no card', !!s1 && s1.summary === '5h of 10h planned, 5h free' && s1.progress === '0/5' && s1.rows.length === 5 && !(await I.exists(card(lunch.id))), JSON.stringify(s1));

  // ---- Add inside from the card: a to do ----
  await I.click(`${card('shift')}.querySelector('[data-add-inside="shift"]')`, 700);
  await C.waitFor(() => I.exists(form), 4000);
  await I.type('Call other departments', 250);
  await I.enter([], 1200);
  const sh = byId('shift');
  check('a to do with no time joins the shift\'s checklist (its subtasks), and nothing else is created', (sh.subtasks || []).length === 1 && sh.subtasks[0].title === 'Call other departments' && sh.subtasks[0].done === false && rows().length === 7, JSON.stringify([sh.subtasks, rows().length]));
  const s2 = await shiftBody();
  check('the card: six rows, "0 of 6 done", the summary unchanged', !!s2 && s2.rows.length === 6 && s2.progress === '0/6' && s2.summary === '5h of 10h planned, 5h free', JSON.stringify(s2));
  await I.shot('p54-six-rows');

  // ---- tick both in place ----
  const todoKey = `todo:${sh.subtasks[0].id}`;
  const lunchKey = 'task:lunch';
  // The Lunch row's key is the block id of the task (task:<id>).
  const lunchRowKey = `task:${lunch.id}`;
  await I.click(tickOf(lunchRowKey), 900);
  check('ticking Lunch\'s row stores it done, in place (no details opened)', byId(lunch.id).completed === true && !(await I.exists(panel)), JSON.stringify(byId(lunch.id)));
  await I.click(tickOf(todoKey), 900);
  const sh2 = byId('shift');
  check('ticking the to do flips it in the checklist; the shift itself stays open', sh2.subtasks[0].done === true && sh2.completed === false, JSON.stringify([sh2.subtasks, sh2.completed]));
  const s3 = await shiftBody();
  check('the card says "2 of 6 done"', !!s3 && s3.progress === '2/6' && s3.doneText === '2 of 6 done', JSON.stringify(s3));
  await I.shot('p54-ticked');

  // ---- Ctrl+Z, one step at a time ----
  await stackText();
  check('one Ctrl+Z unticks the to do', byId('shift').subtasks[0].done === false && byId(lunch.id).completed === true, JSON.stringify(byId('shift').subtasks));
  await stackText();
  check('one more unticks Lunch', byId(lunch.id).completed !== true);
  await stackText();
  check('one more takes the to do off the checklist', (byId('shift').subtasks || []).length === 0, JSON.stringify(byId('shift').subtasks));
  await stackText();
  check('one more removes Lunch; the card is back to "4h 30m of 10h planned, 5h 30m free", four rows', !byTitle('Lunch') && (await shiftBody()).summary === '4h 30m of 10h planned, 5h 30m free' && (await shiftBody()).rows.length === 4, JSON.stringify(await shiftBody()));

  // ---- the right click menu of a block on the Calendar ----
  await I.click(I.byLabel('Show the Calendar'), 900).catch(() => {});
  await I.key('d');
  await C.sleep(900);
  await I.js(`(() => { const s = document.querySelector('[data-cal-scroller]'); if (s) s.scrollTop = 7.5 * 56; })()`);
  await C.sleep(400);
  await I.js(`(() => { const b = document.querySelector('[data-cal-block="cal${today}:shift"]'); const r = b.getBoundingClientRect(); b.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 10, button: 2 })); })()`);
  await C.sleep(500);
  const menu = await I.textOf(`document.querySelector('[data-shift-block-menu="shift"]')`);
  check('the right click menu of the shift block has Open and Add inside', menu.includes('Open') && menu.includes('Add inside'), menu);
  await I.shot('p54-menu');
  await I.click(`document.querySelector('[data-shift-block-menu="shift"] [aria-label="Add inside Shift"]')`, 700);
  check('Add inside in the menu opens the same form', await I.exists(form));
  await I.click(`${form}.querySelector('[data-add-inside-cancel]')`, 500);
  check('Cancel closes it and writes nothing', !(await I.exists(form)) && rows().length === 6);

  // ---- a repeating shift: All days ----
  await I.click(I.byLabel('Show Tasks'), 900).catch(() => {});
  await C.sleep(800);
  // A card with nothing inside has no button (only a shift's card has one); the first thing goes in from its details.
  check('a plain card (Clinic, nothing inside yet) has no Add inside button', !(await I.exists(`${card('clinic')}.querySelector('[data-add-inside]')`)));
  await I.click(`${card('clinic')}.querySelector('[aria-label="Title Clinic"]')`, 900);
  await C.waitFor(() => I.exists(panel), 4000);
  await I.click(`${panel}.querySelector('[data-add-inside="clinic"]')`, 700);
  await C.waitFor(() => I.exists(form), 4000);
  const rep = await I.js(`(() => { const s = ${form}.querySelectorAll('[data-add-inside-scope]'); return [...s].map((e) => [e.getAttribute('data-add-inside-scope'), e.getAttribute('aria-checked'), e.innerText]); })()`);
  // 3.49.0 (R3 of PLAN_repeat_end_and_parts): a third choice, "This and following", between the two.
  check('Clinic repeats: "This day only", "This and following" and "All days of Clinic", All days chosen', rep.length === 3 && rep[0][0] === 'day' && rep[0][1] === 'false' && rep[1][0] === 'following' && rep[1][1] === 'false' && rep[1][2] === 'This and following' && rep[2][0] === 'all' && rep[2][1] === 'true' && rep[2][2] === 'All days of Clinic', JSON.stringify(rep));
  await I.type('Check handover', 250);
  await I.enter([], 1500);
  await I.blur();
  await I.key('Escape');
  await C.sleep(700);
  const clinicRows = rows().filter((t) => t.id === 'clinic' || t.id.startsWith('clinic:'));
  check('a to do for All days is in the series (Clinic\'s checklist)', clinicRows.some((t) => (t.subtasks || []).some((s) => s.title === 'Check handover')), JSON.stringify(clinicRows.map((t) => [t.id, t.subtasks])));
  const tmr = await I.js(`(() => { const c = document.querySelector('[data-day-col="${tomorrow}"]'); if (!c) return null; const b = c.querySelector('[data-shift-body]'); return b ? [...b.querySelectorAll('[data-inside-row]')].map((r) => r.innerText.replace(/\\s+/g, ' ').trim()) : null; })()`);
  check('tomorrow\'s Clinic card shows the to do too, unticked', !!tmr && tmr.length === 1 && tmr[0].includes('Check handover'), JSON.stringify(tmr));

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
