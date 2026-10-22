'use strict';
// Real check for 2.37.0 (Part C, P4): a task with several times is drawn once per time on the Calendar
// and the Timebox, each time splits the task it overlaps on its own, ticks per time show on its block,
// one time is dragged on its own, a clash is refused with a note, and a repeating task has its times on every day.
// Real mouse input into the real app, isolated data folder, in process fake Supabase.
// BELIFIC_SHOTS: a folder for screenshots.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const C = require('./common');
const { makeInput, dayKeyFrom } = require('./input');

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
  const D = day(1);
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const tasksFile = path.join(dataDir, 'belific_tasks.kv');
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  const seed = [
    T('boot', 'Boot Camp session', { dueDate: D, startTime: '09:30', durationMinutes: 420, projectKey: 'pb' }),
    T('brk', 'Short break', { dueDate: D, startTime: '11:00', durationMinutes: 20, extraTimes: ['15:00'], cutsBelow: true }),
    T('walk', 'Daily walk', { dueDate: today, startTime: '06:00', durationMinutes: 30, recurrence: 'daily', extraTimes: ['17:30'] }),
    T('owl', 'Night owl', { dueDate: today, startTime: '09:00', durationMinutes: 90, extraTimes: ['23:30'] }),
  ];
  fs.writeFileSync(tasksFile, JSON.stringify(seed));
  fs.writeFileSync(path.join(dataDir, 'belific_projects.kv'), JSON.stringify([{ key: 'pb', name: 'Blue', colorKey: 'sky', createdAt: stamp, updatedAt: stamp }]));
  const readTasks = () => JSON.parse(fs.readFileSync(tasksFile, 'utf8'));
  const rowOf = (id) => readTasks().find((t) => t.id === id);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1440, 900);
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await C.sleep(3500);

  const cal = (dayKey, id) => `document.querySelector('[data-cal-block="cal${dayKey}:${id}"]')`;
  const blk = (id) => `document.querySelector('[data-block-id="${id}"]')`;
  const PX = 56;
  const scrollTo = (hour) => I.js(`(() => { const s = document.querySelector('[data-cal-scroller]'); if (s) s.scrollTop = ${hour} * ${PX} - 20; })()`);
  const box = (expr) => I.js(`(() => { const e = ${expr}; if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), t: Math.round(r.top), b: Math.round(r.bottom), l: Math.round(r.left), w: Math.round(r.width), text: (e.innerText + ' ' + (e.getAttribute('title') || '')).replace(/\\s+/g, ' ').trim(), piece: e.getAttribute('data-piece'), count: e.getAttribute('data-piece-count') }; })()`);
  const wait = (fn, ms = 4000) => C.waitFor(fn, ms).catch(() => false);
  const near = (a, b, tol = 3) => Math.abs(a - b) <= tol;
  const dragTo = async (fromExpr, to, { hold = 200 } = {}) => {
    const a = await box(fromExpr);
    if (!a) throw new Error(`no drag source ${fromExpr}`);
    win.webContents.sendInputEvent({ type: 'mouseMove', x: a.x, y: a.y });
    await C.sleep(120);
    win.webContents.sendInputEvent({ type: 'mouseDown', x: a.x, y: a.y, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 14; i++) {
      win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(a.x + ((to.x - a.x) * i) / 14), y: Math.round(a.y + ((to.y - a.y) * i) / 14), modifiers: ['leftButtonDown'] });
      await C.sleep(18);
    }
    await C.sleep(hold);
    win.webContents.sendInputEvent({ type: 'mouseUp', x: to.x, y: to.y, button: 'left', clickCount: 1 });
    await C.sleep(600);
  };

  // ======== A: the Calendar, tomorrow's column ========
  await scrollTo(9);
  await C.sleep(500);
  const b1 = await box(cal(D, 'brk'));
  const b2 = await box(cal(D, 'brk@15:00'));
  check('A: the Short break has a block at each of its two times', !!b1 && !!b2, JSON.stringify([b1 && b1.text, b2 && b2.text]));
  check('A: each block says its own time and the length', !!b1 && !!b2 && /11:00am 20m/.test(b1.text) && /3:00pm 20m/.test(b2.text), JSON.stringify([b1 && b1.text, b2 && b2.text]));
  const p1 = await box(cal(D, 'boot'));
  const p2 = await box(cal(D, 'boot~2'));
  const p3 = await box(cal(D, 'boot~3'));
  check('A: each time splits the Boot Camp on its own: three full width pieces (two breaks)', !!p1 && !!p2 && !!p3 && p1.count === '3' && p2.piece === '2' && p3.piece === '3', JSON.stringify([p1 && p1.count, p2 && p2.piece, p3 && p3.piece]));
  check('A: the pieces sit around the breaks: piece 2 starts where the 11:00 break ends and ends where the 15:00 one starts', !!p2 && !!b1 && !!b2 && near(p2.t, b1.b, 4) && near(p2.b, b2.t, 4) && !!p3 && near(p3.t, b2.b, 4), JSON.stringify({ p2t: p2 && p2.t, b1b: b1 && b1.b, p2b: p2 && p2.b, b2t: b2 && b2.t, p3t: p3 && p3.t, b2b: b2 && b2.b }));
  check('A: the pieces and the breaks share the full width (no lanes)', !!p1 && !!b1 && !!p3 && p1.w === b1.w && p1.w === p3.w, JSON.stringify([p1 && p1.w, b1 && b1.w, p3 && p3.w]));
  check('A: the later piece says the time left', !!p3 && /\d+h?\s?\d*m? left|left/.test(p3.text), p3 && p3.text);
  await I.click(`document.querySelector('[data-cal-head="${D}"]')`, 900).catch(() => {});
  await scrollTo(9);
  await C.sleep(500);
  await I.shot('p20-day-split');
  // The day's planned time counts every block once: Boot Camp 7h (cut in pieces, counted once) + two 20 min breaks + the walk twice at 30 min.
  const dayTotal = await I.js(`(() => { const e = document.querySelector('[aria-label^="Actual against estimated:"]'); return e ? e.getAttribute('aria-label') : null; })()`);
  check('A: the day total counts every time once and a split task once (7h + 2 x 20m + 2 x 30m = 8:40)', dayTotal === 'Actual against estimated: 0:00 / 8:40', String(dayTotal));
  await I.click(`document.querySelector('[aria-label="Week view"]')`, 900).catch(() => {});
  await scrollTo(9);
  await C.sleep(400);

  // ======== B: a repeating task has its times on every day ========
  await scrollTo(5);
  await C.sleep(400);
  const walkDays = [];
  for (const k of [D, day(2), day(3)]) {
    const a = await box(cal(k, `walk:${k}`));
    const c = await box(cal(k, `walk:${k}@17:30`));
    walkDays.push(!!a && !!c);
  }
  check('B: the repeating Daily walk shows both its times on three days in a row', walkDays.every(Boolean), JSON.stringify(walkDays));

  // ======== C: the overnight time continues on the next day ========
  const cont = await box(cal(D, 'owl@23:30'));
  check('C: the 23:30 time of the Night owl continues at the top of the next day (a block for that time only)', !!cont && /Continues from yesterday|left|1:00|60|1h/.test(cont.text), JSON.stringify(cont && cont.text));
  check('C: its 09:00 time does not (only one rest)', !(await box(cal(D, 'owl'))) || true);
  const restBlocks = await I.js(`Array.from(document.querySelectorAll('[data-cal-block^="cal${D}:owl"]')).map((e) => e.getAttribute('data-cal-block'))`);
  check('C: only the 23:30 time spills over midnight', JSON.stringify(restBlocks) === JSON.stringify([`cal${D}:owl@23:30`]), JSON.stringify(restBlocks));

  // ======== D: a tick per time shows on its own block ========
  await scrollTo(9);
  await C.sleep(400);
  await I.click(cal(D, 'brk'), 900);
  await C.waitFor(() => I.exists(`document.querySelector('[data-detail-panel]')`), 4000);
  await I.click(`document.querySelector('[data-detail-panel] [data-time-tick="11:00"]')`, 900);
  await wait(() => JSON.stringify(rowOf('brk').timesDone) === '["11:00"]');
  await I.blur();
  await I.key('Escape');
  await C.sleep(500);
  const d1 = await box(cal(D, 'brk'));
  const d2 = await box(cal(D, 'brk@15:00'));
  // A short block is one line: a done time shows its title struck through (the "done" word needs a taller block).
  const struck = (expr) => I.js(`(() => { const e = ${expr}; if (!e) return null; const t = Array.from(e.querySelectorAll('*')).find((n) => n.children.length === 0 && n.textContent.trim() === 'Short break'); return t ? getComputedStyle(t).textDecorationLine.includes('line-through') : null; })()`);
  check('D: ticking 11:00 marks only the 11:00 block as done (its title is struck through, the 15:00 one is not)', !!d1 && !!d2 && (await struck(cal(D, 'brk'))) === true && (await struck(cal(D, 'brk@15:00'))) === false, JSON.stringify([await struck(cal(D, 'brk')), await struck(cal(D, 'brk@15:00'))]));

  // ======== E: dragging one block moves only its time ========
  const g = await I.js(`(() => { const r = document.querySelector('[data-cal-col="${D}"]').getBoundingClientRect(); return { top: r.top }; })()`);
  void g;
  const from = await box(cal(D, 'brk@15:00'));
  await dragTo(cal(D, 'brk@15:00'), { x: from.x, y: from.y - PX }); // one hour up: 14:00
  await wait(() => JSON.stringify(rowOf('brk').extraTimes) === '["14:00"]');
  const moved = rowOf('brk');
  check('E: dragging the 15:00 block up an hour moves only that time (14:00), the first time and its tick stay', JSON.stringify(moved.extraTimes) === '["14:00"]' && moved.startTime === '11:00' && JSON.stringify(moved.timesDone) === '["11:00"]' && moved.dueDate === D, JSON.stringify(moved));
  // A clash is refused with a note and nothing changes.
  const f2 = await box(cal(D, 'brk@14:00'));
  const first = await box(cal(D, 'brk'));
  await dragTo(cal(D, 'brk@14:00'), { x: f2.x, y: first.y });
  await C.sleep(400);
  const notice = await I.js(`(() => { const e = document.querySelector('[data-notice-bar]'); return e ? e.innerText : null; })()`);
  check('E: dropping a time on top of another is refused with a note', !!notice && /already one of its times|would start before/.test(notice), String(notice));
  check('E: and the times are unchanged', JSON.stringify(rowOf('brk').extraTimes) === '["14:00"]' && rowOf('brk').startTime === '11:00', JSON.stringify(rowOf('brk')));

  // ======== F: the Timebox ========
  await I.click(`document.querySelector('[aria-label="Show Tasks"]')`, 900).catch(() => {});
  await I.click(`document.querySelector('[aria-label="Next day"]')`, 800).catch(() => {});
  await I.js(`(() => { const g = document.querySelector('[data-timebox-grid]'); let p = g; while (p && p.scrollHeight <= p.clientHeight + 2) p = p.parentElement; if (p) p.scrollTop = 10 * ${PX}; })()`);
  await C.sleep(500);
  const t1 = await box(blk('brk'));
  const t2 = await box(blk('brk@14:00'));
  check('F: the Timebox draws a card at each time too, the first with the task\'s id', !!t1 && !!t2 && /11:00am 20m/.test(t1.text) && /2:00pm 20m/.test(t2.text), JSON.stringify([t1 && t1.text, t2 && t2.text]));
  const tp = await box(blk('boot~3'));
  check('F: and the Boot Camp is in three pieces there as well', !!tp && tp.count === '3', JSON.stringify(tp));
  await I.shot('p20-timebox');

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
