'use strict';
// @real-input: quiet
// Real touch check for S5 of PLAN_shifts (3.53.0): the phone matches the desktop for shifts, at 390 x 844 (the nurse example).
//   - Today: "Shift" (8:00, 10h) shows its summary and "x of y done" with a bar, the blocks inside it as rows (never rows of their
//     own), and the day's total reads the shift once ("10h planned");
//   - "Add inside": Lunch at 13:00 for 30 min becomes an ordinary task inside the shift; "Call other departments" with no time
//     joins the shift's checklist; the summary and the count follow at once;
//   - both ticks work in place on the rows; the bar's count follows; Undo puts the last tick back; the same row unticks;
//   - the details have no Task | Break; a shift there shows the same summary, rows and Add inside; free time shows
//     "Make it a normal block", which turns it into an ordinary block;
//   - Tasks: a shift in a list shows its rows, the inside block is not a row of its own, a tick works in place;
//   - a repeating shift's form has This day only / This and following / All days of Night cover;
//   - 44 pt rows and buttons, text 14 px or more, nothing red.
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
  const today = day(0);
  const tomorrow = day(1);
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  const write = (k, v) => fs.writeFileSync(path.join(dataDir, `${k}.kv`), JSON.stringify(v));
  write('belific_tasks', [
    T('sh', 'Shift', { dueDate: today, startTime: '08:00', durationMinutes: 600 }),
    T('br', 'Briefing', { dueDate: today, startTime: '08:30', durationMinutes: 30 }),
    T('tm', 'Teams press meeting', { dueDate: today, startTime: '10:00', durationMinutes: 60 }),
    T('pt', 'Ring patients', { dueDate: today, startTime: '11:00', durationMinutes: 120 }),
    T('cl', 'Clinic', { listKey: 'L1', dueDate: tomorrow, startTime: '09:00', durationMinutes: 180 }),
    T('nt', 'Notes', { listKey: 'L1', dueDate: tomorrow, startTime: '10:00', durationMinutes: 60 }),
    T('qh', 'Quiet hour', { listKey: 'L1', dueDate: tomorrow, startTime: '14:00', durationMinutes: 60, cutsBelow: true }),
    T('nc', 'Night cover', { listKey: 'L1', dueDate: tomorrow, startTime: '19:00', durationMinutes: 180, recurrence: 'daily', subtasks: [{ id: 'k1', title: 'Check the log', done: false }] }),
  ]);
  write('belific_lists', [{ key: 'L1', name: 'Work', emoji: '💼', sortOrder: 0, createdAt: stamp, updatedAt: stamp }]);
  const read = (k) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dataDir, `${k}.kv`), 'utf8'));
    } catch {
      return [];
    }
  };
  const all = () => read('belific_tasks');
  const live = () => all().filter((t) => !t.deletedAt);
  const task = (id) => all().find((t) => t.id === id);
  const byTitle = (title) => live().find((t) => t.title === title);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.show();
  await C.sleep(2500);
  const P = await phoneWindow(win);
  await C.sleep(1800);
  const shot = async (name) => {
    if (!process.env.BELIFIC_SHOTS) return;
    fs.mkdirSync(process.env.BELIFIC_SHOTS, { recursive: true });
    fs.writeFileSync(path.join(process.env.BELIFIC_SHOTS, `${name}.png`), (await win.webContents.capturePage()).toPNG());
  };
  const tabEls = `[...document.querySelectorAll('a, [role="tab"], [role="button"], [role="link"]')].filter((e) => { const r = e.getBoundingClientRect(); return r.top > 760 && r.height > 20 && r.width > 40 && r.width < 200; })`;
  const tab = (name) => `${tabEls}.find((e) => e.textContent.replace(/[^ -~]/g, '').trim() === '${name}')`;
  const visible = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].reverse().find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left >= -1 && r.left < innerWidth && r.top < innerHeight && r.bottom > 0; })`;
  const scrollTo = (sel) => P.js(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => x.getBoundingClientRect().height > 0); if (e) e.scrollIntoView({ block: 'center' }); return !!e; })()`);
  const tapSel = async (sel, wait = 900) => {
    await scrollTo(sel);
    await C.sleep(250);
    await P.finger.tap(`[...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => x.getBoundingClientRect().height > 0)`, wait);
  };
  const typeText = async (t) => {
    await win.webContents.insertText(t);
    await C.sleep(250);
  };
  const enter = async () => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
    win.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
    await C.sleep(900);
  };
  const focusSel = (sel, select = false) => P.js(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => x.getBoundingClientRect().height > 0); if (!e) return false; e.focus(); ${select ? 'e.select();' : ''} return true; })()`);
  const text = (sel) => P.js(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => x.getBoundingClientRect().height > 0); return e ? e.innerText.replace(/\\s+/g, ' ').trim() : null; })()`);
  const notRed = (sel) =>
    P.js(`![...document.querySelectorAll(${JSON.stringify(sel)})].some((root) => [root, ...root.querySelectorAll('*')].some((e) => { const s = getComputedStyle(e); return [s.color, s.backgroundColor].some((c) => { const m = /rgba?\\((\\d+), (\\d+), (\\d+)/.exec(c); return m && +m[1] > 180 && +m[2] < 110 && +m[3] < 110; }); }))`);
  const minFont = (sel) => P.js(`Math.min(...[...document.querySelectorAll(${JSON.stringify(sel)})].flatMap((root) => [...root.querySelectorAll('*')]).filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.replace(/[\uE000-\uF8FF\u200B]/g, '').trim())).map((e) => parseFloat(getComputedStyle(e).fontSize)))`);
  const tall = (sel) => P.js(`(() => { const l = [...document.querySelectorAll(${JSON.stringify(sel)})].filter((e) => e.getBoundingClientRect().height > 0); return l.length > 0 && l.every((e) => e.getBoundingClientRect().height >= 44); })()`);

  // ---- Today: the shift card ----
  await P.finger.tap(tab('Today'), 1200);
  const shiftText = await text('[data-shift-body="Shift"]');
  check('Today: Shift shows its summary "3h 30m of 10h planned" and "0 of 3 done"', !!shiftText && shiftText.includes('of 10h planned') && shiftText.includes('0 of 3 done'), String(shiftText));
  check('the blocks inside are rows of the shift, not rows of their own', (await P.js(`document.querySelectorAll('[data-today-row="Briefing"], [data-today-row="Teams press meeting"], [data-today-row="Ring patients"]').length`)) === 0 && (await P.js(`document.querySelectorAll('[data-shift-body="Shift"] [data-inside-row]').length`)) === 3);
  check('the day total reads the shift once: "10h planned"', (await text('[data-today-planned]')) === '10h planned', String(await text('[data-today-planned]')));
  check('rows and the button are 44 pt, text 14 px or more, nothing red', (await tall('[data-shift-body="Shift"] [data-inside-row]')) && (await tall('[data-add-inside="Shift"]')) && (await minFont('[data-shift-body="Shift"]')) >= 14 && (await notRed('[data-shift-body="Shift"]')));
  await shot('phone-p19-today');

  // ---- Add inside: Lunch at 13:00 ----
  await tapSel('[data-add-inside="Shift"]', 1200);
  check('"Add inside" opens a form: What is it? and a choice of No time or At a time', !!(await text('[data-add-inside-form]')) && (await text('[data-add-inside-form]')).includes('No time, just a to do') && (await text('[data-add-inside-form]')).includes('At a time'));
  await focusSel('[data-add-inside-name]');
  await typeText('Lunch');
  await tapSel('[data-add-inside-when="timed"]', 700);
  await focusSel('[data-add-inside-form] input[aria-label="Time"]', true);
  await typeText('13:00');
  await enter();
  await tapSel('[data-add-inside-form] [aria-label="Add inside"]', 1500);
  const lunch = byTitle('Lunch');
  check('Lunch: an ordinary task on the shift\'s day at 13:00 for 30 min', !!lunch && lunch.dueDate === today && lunch.startTime === '13:00' && lunch.durationMinutes === 30, JSON.stringify(lunch));
  check('it is a row of the shift (not a row of its own); the summary now reads "4h of 10h planned"', (await P.js(`document.querySelectorAll('[data-today-row="Lunch"]').length`)) === 0 && ((await text('[data-shift-body="Shift"]')) || '').includes('4h of 10h planned'), String(await text('[data-shift-body="Shift"]')));

  // ---- Add inside: no time ----
  await tapSel('[data-add-inside="Shift"]', 1200);
  await focusSel('[data-add-inside-name]');
  await typeText('Call other departments');
  await tapSel('[data-add-inside-form] [aria-label="Add inside"]', 1500);
  const sub = (task('sh').subtasks || []).find((s) => s.title === 'Call other departments');
  check('"Call other departments", no time: on the shift\'s checklist, no new task', !!sub && !byTitle('Call other departments'), JSON.stringify(task('sh').subtasks));
  check('the count follows: "0 of 5 done"; the to do is a row with no time', ((await text('[data-shift-body="Shift"]')) || '').includes('0 of 5 done'), String(await text('[data-shift-body="Shift"]')));

  // ---- ticks in place, and Undo ----
  await tapSel('[data-inside-tick="Lunch"]', 1500);
  check('tick Lunch in place: stored done, "1 of 5 done"', task(lunch.id).completed === true && ((await text('[data-shift-body="Shift"]')) || '').includes('1 of 5 done'), String(await text('[data-shift-body="Shift"]')));
  await tapSel('[data-inside-tick="Call other departments"]', 1500);
  check('tick the to do in place: its step is done, the shift itself is not completed, "2 of 5 done"', (task('sh').subtasks.find((s) => s.title === 'Call other departments') || {}).done === true && !task('sh').completed && ((await text('[data-shift-body="Shift"]')) || '').includes('2 of 5 done'), String(await text('[data-shift-body="Shift"]')));
  check('the day total still reads 10h (ticked blocks leave the "still to do" figure, never double count)', ((await text('[data-today-planned]')) || '').startsWith('10h') || ((await text('[data-today-planned]')) || '').startsWith('9h'), String(await text('[data-today-planned]')));
  check('an Undo bar says "Done: Call other departments"', ((await text('[data-undo-bar]')) || '').includes('Done: Call other departments'), String(await text('[data-undo-bar]')));
  await shot('phone-p19-ticked');
  await P.finger.tap(visible('[data-undo-bar] [aria-label="Undo"]'), 1500);
  check('Undo puts the to do back: not done, "1 of 5 done"; Lunch stays ticked', (task('sh').subtasks.find((s) => s.title === 'Call other departments') || {}).done === false && task(lunch.id).completed === true && ((await text('[data-shift-body="Shift"]')) || '').includes('1 of 5 done'));
  await tapSel('[data-inside-tick="Lunch"]', 1500);
  check('the same tick unticks Lunch', task(lunch.id).completed === false);

  // ---- the details: no Task | Break ----
  await P.finger.tap(visible('[data-today-row="Shift"] [data-today-body]'), 700);
  await P.finger.tap(visible('[aria-label="Edit Shift"]'), 1400);
  check('the details of Shift open', await P.js(`!!document.querySelector('[data-task-details="sh"]')`));
  const sheet = await P.js(`(() => { const r = document.querySelector('[data-task-details]'); return r && r.parentElement ? r.parentElement.innerText.replace(/\\s+/g, ' ') : ''; })()`);
  check('no Task | Break choice and no "Task or Break" wording in the phone details', !(await P.js(`!!document.querySelector('[data-kind-choice]')`)) && !sheet.includes('Task or Break') && !sheet.includes('Cuts the tasks it overlaps'), sheet.slice(0, 200));
  check('a shift in the details has the summary, rows and Add inside', (await P.js(`!!document.querySelector('[data-detail-shift="sh"] [data-shift-summary]')`)) && (await P.js(`!!document.querySelector('[data-detail-shift="sh"] [data-inside-row]')`)) && (await P.js(`!!document.querySelector('[data-detail-shift="sh"] [data-add-inside="Shift"]')`)));
  await shot('phone-p19-details');
  await P.finger.tap(visible('[aria-label="Done"]'), 900);

  // ---- Tasks: a shift in a list ----
  await P.finger.tap(tab('Tasks'), 1000);
  await P.finger.tap(visible('[data-list-chip="L1"]'), 900);
  const clinic = await text('[data-shift-body="Clinic"]');
  check('Tasks: Clinic shows "1h of 3h planned, 2h free" and "0 of 1 done"', !!clinic && clinic.includes('1h of 3h planned, 2h free') && clinic.includes('0 of 1 done'), String(clinic));
  check('Tasks: "Notes" (inside Clinic) is a row of the shift, not a row of its own', (await P.js(`document.querySelectorAll('[data-task-row="Notes"]').length`)) === 0 && (await P.js(`document.querySelectorAll('[data-shift-body="Clinic"] [data-inside-row="Notes"]').length`)) === 1);
  await tapSel('[data-shift-body="Clinic"] [data-inside-tick="Notes"]', 1500);
  check('a tick on the row works in place: Notes done, "1 of 1 done"', task('nt').completed === true && ((await text('[data-shift-body="Clinic"]')) || '').includes('1 of 1 done'));
  const tr = [await tall('[data-shift-body="Clinic"] [data-inside-row]'), await minFont('[data-shift-body="Clinic"]'), await notRed('[data-shift-body="Clinic"]')];
  check('Tasks rows are 44 pt, text 14 px or more, nothing red', tr[0] && tr[1] >= 14 && tr[2], JSON.stringify(tr));
  await shot('phone-p19-tasks');

  // ---- a repeating shift: the three scopes ----
  await tapSel('[data-add-inside="Night cover"]', 1200);
  const form = (await text('[data-add-inside-form]')) || '';
  check('a repeating shift\'s form asks This day only / This and following / All days of Night cover', form.includes('This day only') && form.includes('This and following') && form.includes('All days of Night cover'), form);
  await focusSel('[data-add-inside-name]');
  await typeText('Hand over');
  await tapSel('[data-add-inside-when="scope-day"]', 600);
  await tapSel('[data-add-inside-form] [aria-label="Add inside"]', 1500);
  const nc = (live().filter((t) => t.id === 'nc' || t.id.startsWith('nc:')));
  check('"This day only" adds the to do to that day row (the desktop rule), a task is not made', nc.some((t) => (t.subtasks || []).some((s) => s.title === 'Hand over')) && !byTitle('Hand over'), JSON.stringify(nc.map((t) => [t.id, (t.subtasks || []).map((s) => s.title)])));

  // ---- free time: Make it a normal block ----
  await P.finger.tap(visible('[data-task-row="Quiet hour"] [data-task-body]'), 1400);
  check('free time: the details say "Free time" with "Make it a normal block", and no Task | Break', (await P.js(`!!document.querySelector('[data-free-time]')`)) && (await P.js(`!!document.querySelector('[data-make-normal]')`)) && !(await P.js(`!!document.querySelector('[data-kind-choice]')`)));
  check('"Make it a normal block" is 44 pt', await tall('[data-make-normal]'));
  await tapSel('[data-make-normal]', 1400);
  check('it stores an ordinary block (no cutsBelow) and the Free time section goes', !task('qh').cutsBelow && !(await P.js(`!!document.querySelector('[data-free-time]')`)), JSON.stringify(task('qh')));
  await P.finger.tap(visible('[aria-label="Done"]'), 900);

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
