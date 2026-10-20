'use strict';
// Real check for Part B, phase P4 (2.31.0): "Cut tasks underneath". Real mouse, key and
// text input into the real app, isolated data folder, in process fake Supabase.
// The drawing: one wide column, full width boxes stacked top to bottom: the first piece
// of the task with its title and "9:30am 7h", the break as a grey box in the gap, then the
// next piece with the same title, its start time and "5h 10m left". Nothing side by side.
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
  const d1 = day(1);
  const d2 = day(2);
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  const BOOT = 'Leep Talent Online Boot Camp Session';
  const seed = [
    // The drawing (today): 9:30 to 16:30, a 20 minute break at 11:00.
    T('boot', BOOT, { dueDate: today, startTime: '09:30', durationMinutes: 420, projectKey: 'pb' }),
    T('brk', 'Short Break', { dueDate: today, startTime: '11:00', durationMinutes: 20, cutsBelow: true }),
    // Three breaks (tomorrow): 9:00 to 13:00 cut at 9:50, 11:00 and 12:10.
    T('long', 'Long host', { dueDate: d1, startTime: '09:00', durationMinutes: 240, projectKey: 'pb' }),
    T('b1', 'Break one', { dueDate: d1, startTime: '09:50', durationMinutes: 15, cutsBelow: true }),
    T('b2', 'Break two', { dueDate: d1, startTime: '11:00', durationMinutes: 30, cutsBelow: true }),
    T('b3', 'Break three', { dueDate: d1, startTime: '12:10', durationMinutes: 15, cutsBelow: true }),
    // A refused cut (day after): the break would leave 20 minutes before it.
    T('short', 'Short host', { dueDate: d2, startTime: '09:00', durationMinutes: 60, projectKey: 'pb' }),
    T('late', 'Late break', { dueDate: d2, startTime: '09:20', durationMinutes: 60, cutsBelow: true }),
    // A repeating pair (every day from today): each occurrence is cut on its own day.
    T('rec', 'Rec host', { dueDate: today, startTime: '17:00', durationMinutes: 240, recurrence: 'daily', projectKey: 'pb' }),
    T('recb', 'Rec break', { dueDate: today, startTime: '18:00', durationMinutes: 20, recurrence: 'daily', cutsBelow: true }),
    // Overnight (day after): 22:00 to 04:00, a break at 23:00.
    T('night', 'Night host', { dueDate: d2, startTime: '22:00', durationMinutes: 360, projectKey: 'pb' }),
    T('nbrk', 'Night break', { dueDate: d2, startTime: '23:00', durationMinutes: 20, cutsBelow: true }),
  ];
  fs.writeFileSync(path.join(dataDir, 'belific_tasks.kv'), JSON.stringify(seed));
  fs.writeFileSync(path.join(dataDir, 'belific_projects.kv'), JSON.stringify([{ key: 'pb', name: 'Blue', colorKey: 'sky', createdAt: stamp, updatedAt: stamp }]));

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
  const box = (expr) => I.js(`(() => { const e = ${expr}; if (!e) return null; const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height), bg: s.backgroundColor, text: e.innerText.replace(/\\s+/g, ' ').trim() }; })()`);
  const stored = (id) => JSON.parse(fs.readFileSync(path.join(dataDir, 'belific_tasks.kv'), 'utf8')).find((t) => t.id === id);
  const scrollTo = (hour) => I.js(`(() => { const s = document.querySelector('[data-cal-scroller]'); if (s) s.scrollTop = ${hour} * 56 - 20; })()`);
  await scrollTo(9);
  await C.sleep(400);

  // ======== The drawing (Calendar, Week) ========
  const p1 = await box(cal(today, 'boot'));
  const br = await box(cal(today, 'brk'));
  const p2 = await box(cal(today, 'boot~2'));
  check('P4: the task is in two pieces with the break between them', !!p1 && !!br && !!p2, JSON.stringify({ p1, br, p2 }));
  check('P4: stacked top to bottom: piece one, the break, piece two', p1.b <= br.t + 1 && br.b <= p2.t + 1, JSON.stringify({ p1: [p1.t, p1.b], br: [br.t, br.b], p2: [p2.t, p2.b] }));
  check('P4: nothing side by side: all three have the same left edge and the same full width', p1.l === br.l && br.l === p2.l && p1.w === br.w && br.w === p2.w && p1.w > 120, JSON.stringify({ l: [p1.l, br.l, p2.l], w: [p1.w, br.w, p2.w] }));
  check('P4: the first piece shows the title and "9:30am 7h"', p1.text.includes(BOOT) && p1.text.includes('9:30am') && p1.text.includes('7h') && !p1.text.includes('left'), p1.text);
  check('P4: the break shows "Short Break 11:00am 20m"', br.text.includes('Short Break') && br.text.includes('11:00am') && br.text.includes('20m'), br.text);
  check('P4: the next piece has the same title, "11:20am" and "5h 10m left" (to 4:30pm)', p2.text.includes(BOOT) && p2.text.includes('11:20am') && p2.text.includes('5h 10m left') && !p2.text.includes('7h'), p2.text);
  check('P4: the break is a grey box (no label colour), the pieces carry the label colour', br.bg !== p1.bg && br.bg !== 'rgb(255, 255, 255)' && p1.bg === p2.bg, JSON.stringify({ br: br.bg, p1: p1.bg, p2: p2.bg }));
  check('P4: heights stay tied to real time (90 min and 310 min on a 56 px hour grid)', Math.abs(p1.h - 84) <= 3 && Math.abs(p2.h - 289) <= 4, JSON.stringify({ p1: p1.h, p2: p2.h }));
  check('P4: only the last piece has the resize handle', (await I.js(`document.querySelectorAll('[data-cal-col="${today}"] [aria-label="Resize ${BOOT}"]').length`)) === 1);
  check('P4: the stored task is untouched by the cut (no time, length or day changed)', (() => { const t = stored('boot'); return t.startTime === '09:30' && t.durationMinutes === 420 && t.dueDate === today && t.cutsBelow === undefined; })());
  await I.shot('p14-day-one-break');

  // A press on the second piece opens the whole task.
  await I.click(`${cal(today, 'boot~2')}.firstElementChild`, 700);
  const opened = await C.waitFor(() => I.exists(`document.querySelector('[data-detail-panel]')`), 4000).then(() => true).catch(() => false);
  check('P4: a press on the second piece opens the details of the task', opened && (await I.js(`[...document.querySelector('[data-detail-panel]').querySelectorAll('input,textarea')].some((i) => i.value === ${JSON.stringify(BOOT)})`)));
  await I.blur();
  await I.key('Escape');
  await C.sleep(400);

  // ======== Three breaks (tomorrow) ========
  const col1 = await I.js(`(() => { const c = document.querySelector('[data-cal-col="${d1}"]'); return c ? Math.round(c.getBoundingClientRect().width) : 0; })()`);
  const names = ['long', 'long~2', 'long~3', 'long~4', 'b1', 'b2', 'b3'];
  const three = [];
  for (const n of names) three.push(await box(cal(d1, n)));
  check('P4: three breaks make four pieces and three break boxes', three.every(Boolean), JSON.stringify(three.map((x) => !!x)));
  check('P4: all seven are full width and in one column', three.every((x) => x && x.l === three[0].l && x.w === three[0].w) && three[0].w > 100, JSON.stringify(three.map((x) => x && [x.l, x.w])));
  const order = ['long', 'b1', 'long~2', 'b2', 'long~3', 'b3', 'long~4'].map((n) => three[names.indexOf(n)]);
  check('P4: in time order top to bottom (a 15 minute break keeps the 20 px minimum block height, so it may touch the next piece by a few pixels)', order.every((x, i) => i === 0 || order[i - 1].b <= x.t + 8), JSON.stringify(order.map((x) => [x.t, x.b])));
  check('P4: the pieces count down the time left from their own start (4h, then 2h 55m, 1h 30m, 35m left)', three[0].text.includes('4h') && three[1].text.includes('10:05am') && three[1].text.includes('2h 55m left') && three[2].text.includes('11:30am') && three[2].text.includes('1h 30m left') && three[3].text.includes('12:25pm') && three[3].text.includes('35m left'), JSON.stringify(three.slice(0, 4).map((x) => x.text)));
  void col1;
  await scrollTo(9);
  await I.shot('p14-day-three-breaks');

  // ======== A refused cut (day after) ========
  const whole = await box(cal(d2, 'short'));
  const lateBrk = await box(cal(d2, 'late'));
  const noSecond = await I.js(`!document.querySelector('[data-cal-block="cal${d2}:short~2"]')`);
  check('P4: a cut that would leave 20 minutes is refused: the task stays whole', !!whole && noSecond && !whole.text.includes('left'), whole && whole.text);
  check('P4: the two then sit side by side as before', !!whole && !!lateBrk && whole.l !== lateBrk.l, JSON.stringify({ w: whole && whole.l, b: lateBrk && lateBrk.l }));
  check('P4: the break says why, in a small badge (Not cut: 20 min piece (min 30))', !!lateBrk && lateBrk.text.includes('Not cut') && lateBrk.text.includes('20 min piece') && lateBrk.text.includes('min 30'), lateBrk && lateBrk.text);
  const tip = await I.js(`${cal(d2, 'late')}.getAttribute('title')`);
  check('P4: and its tooltip has the note too', !!tip && tip.includes('Not cutting Short host') && tip.includes('a piece would be 20 min') && tip.includes('minimum is 30 min'), String(tip));
  await I.shot('p14-refused');

  // ======== Day view: a wide column, the drawing as drawn (screenshots) ========
  const dayShot = async (k, name, hour) => {
    await I.click(`document.querySelector('[data-cal-head="${k}"]')`, 800);
    await scrollTo(hour);
    await C.sleep(400);
    await I.shot(name);
  };
  await dayShot(today, 'p14-DAY-one-break', 9);
  const wide = await box(cal(today, 'boot'));
  const wideBrk = await box(cal(today, 'brk'));
  const wide2 = await box(cal(today, 'boot~2'));
  check('P4: in Day view the three boxes are one wide column (the drawing): same left, same wide width, stacked', !!wide && !!wideBrk && !!wide2 && wide.l === wideBrk.l && wide.w === wideBrk.w && wide.w === wide2.w && wide.w > 500 && wide.b <= wideBrk.t + 1 && wideBrk.b <= wide2.t + 1, JSON.stringify([wide && wide.w, wideBrk && wideBrk.w, wide2 && wide2.w]));
  check('P4: with one line each as drawn: the break reads "Short Break 11:00am 20m"', !!wideBrk && wideBrk.text.includes('Short Break') && wideBrk.text.includes('11:00am') && wideBrk.text.includes('20m'), wideBrk && wideBrk.text);
  await I.click(`document.querySelector('[aria-label="Week view"]')`, 700);
  await dayShot(d1, 'p14-DAY-three-breaks', 9);
  await I.click(`document.querySelector('[aria-label="Week view"]')`, 700);
  await dayShot(d2, 'p14-DAY-refused', 9);
  const dayNote = await box(cal(d2, 'late'));
  check('P4: in Day view the refused break shows its badge in full', !!dayNote && dayNote.text.includes('Not cut: 20 min piece (min 30)'), dayNote && dayNote.text);
  await I.click(`document.querySelector('[aria-label="Week view"]')`, 700);
  await scrollTo(9);
  await C.sleep(300);

  // ======== Overnight (day after): the piece after the break runs on, left counts to 04:00 ========
  await scrollTo(21);
  await C.sleep(300);
  const n1 = await box(cal(d2, 'night'));
  const n2 = await box(cal(d2, 'night~2'));
  check('P4: an overnight task is cut too: the second piece says 4h 40m left (to 04:00) and carries the continues marker', !!n1 && !!n2 && n2.text.includes('11:20pm') && n2.text.includes('4h 40m left') && (await I.exists(`${cal(d2, 'night~2')}.parentElement.querySelector('[aria-label="Continues after 24:00"]')`)), JSON.stringify({ n1: n1 && n1.text, n2: n2 && n2.text }));
  const d3 = day(3);
  const cont = await box(cal(d3, 'night'));
  check('P4: the rest on the next day is drawn from midnight (04:00) as before', !!cont && cont.text.includes('Night host'), cont && cont.text);

  // ======== A repeating pair: each occurrence is cut on its own day ========
  await scrollTo(17);
  await C.sleep(300);
  const recDays = [];
  for (const k of [today, d1, d2]) recDays.push(await I.js(`[...document.querySelectorAll('[data-cal-col="${k}"] [aria-label^="Calendar block Rec host"]')].map((e) => { const r = e.getBoundingClientRect(); return { l: Math.round(r.left), w: Math.round(r.width), t: Math.round(r.top), b: Math.round(r.bottom), text: e.innerText.replace(/\s+/g, ' ') }; })`));
  check('P4: every occurrence of a repeating task is cut by every occurrence of a repeating break (two pieces each day)', recDays.every((x) => x.length === 2), JSON.stringify(recDays.map((x) => x.length)));
  check('P4: and its pieces are full width stacked pieces', recDays.every((x) => x.length === 2 && x[0].w === x[1].w && x[0].l === x[1].l && x[0].b <= x[1].t + 8 && x[1].text.includes('6:20pm') && x[1].text.includes('2h 40m left')), JSON.stringify(recDays));

  // ======== The Timebox panel ========
  await I.click(`document.querySelector('[aria-label="Show Tasks"]')`, 900);
  await I.js(`(() => { const g = document.querySelector('[data-timebox-grid]'); let p = g; while (p && p.scrollHeight <= p.clientHeight + 2) p = p.parentElement; if (p) p.scrollTop = 9 * 56 - 20; })()`);
  await C.sleep(400);
  const tb = (id) => box(`document.querySelector('[data-block-id="${id}"]')`);
  const [t1, tbrk, t2] = [await tb('boot'), await tb('brk'), await tb('boot~2')];
  check('P4: the Timebox draws the same stack (piece, break, piece)', !!t1 && !!tbrk && !!t2 && t1.b <= tbrk.t + 1 && tbrk.b <= t2.t + 1, JSON.stringify({ t1, tbrk, t2 }));
  check('P4: at full width in the Timebox too', t1.l === tbrk.l && tbrk.l === t2.l && t1.w === tbrk.w && t1.w === t2.w, JSON.stringify([t1.w, tbrk.w, t2.w]));
  check('P4: with the same texts', t1.text.includes('9:30am') && t1.text.includes('7h') && t2.text.includes('11:20am') && t2.text.includes('5h 10m left'), JSON.stringify([t1.text, t2.text]));
  await I.shot('p14-timebox');

  // ======== Turn the switch off in the details: the cut goes, nothing stored changes on the host ========
  await I.click(`document.querySelector('[data-day-col="${today}"] [aria-label="Title Short Break"]')`, 700);
  await C.waitFor(() => I.exists(`document.querySelector('[data-detail-panel]')`), 4000).catch(() => {});
  const sw = await I.js(`(() => { const s = document.querySelector('[data-cut-switch]'); return s ? [s.getAttribute('data-cut-switch'), s.getAttribute('aria-checked'), s.getAttribute('aria-label')] : null; })()`);
  check('P4: the details have the "Cut tasks underneath" switch, on for the break', !!sw && sw[0] === '1' && sw[1] === 'true' && sw[2] === 'Cut tasks underneath', JSON.stringify(sw));
  await I.click(`document.querySelector('[data-cut-switch]')`, 600);
  await C.sleep(500);
  check('P4: switched off, the stored switch is gone', stored('brk').cutsBelow === undefined, JSON.stringify(stored('brk')));
  await I.blur();
  await I.key('Escape');
  await C.sleep(500);
  const noPieces = await I.js(`!document.querySelector('[data-block-id="boot~2"]')`);
  const bootAfter = await tb('boot');
  const brkAfter = await tb('brk');
  check('P4: the pieces recompute at once: the task is whole again and overlaps the break side by side', noPieces && !!bootAfter && !!brkAfter && bootAfter.l !== brkAfter.l, JSON.stringify([bootAfter && bootAfter.l, brkAfter && brkAfter.l]));
  check('P4: the host row is exactly as it was', JSON.stringify(stored('boot')) === JSON.stringify(seed[0]));
  // and on again from the details
  await I.click(`document.querySelector('[data-day-col="${today}"] [aria-label="Title Short Break"]')`, 700);
  await C.waitFor(() => I.exists(`document.querySelector('[data-detail-panel]')`), 4000).catch(() => {});
  await I.click(`document.querySelector('[data-cut-switch]')`, 600);
  await C.sleep(400);
  check('P4: switched on again: stored true and the cut returns', stored('brk').cutsBelow === true && (await I.exists(`document.querySelector('[data-block-id="boot~2"]')`)));
  await I.blur();
  await I.key('Escape');
  await C.sleep(400);

  // ======== The setting: smallest piece (Settings, Planning) ========
  const profileIcon = async () => ((await I.exists(I.byLabel('Profile and account'))) ? 'Profile and account' : 'Profile, not signed in');
  await I.click(I.byLabel(await profileIcon()));
  await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 700);
  await I.waitBody('POWER FEATURES', 8000);
  const opts = await I.js(`[...document.querySelector('[aria-label="Smallest piece when a break cuts a task"]').options].map((o) => o.value + ':' + o.selected)`);
  check('P4: Settings, Planning offers 15, 30 and 60 minutes, 30 chosen by default', JSON.stringify(opts) === JSON.stringify(['15:false', '30:true', '60:false']), JSON.stringify(opts));
  await I.js(`(() => { const s = document.querySelector('[aria-label="Smallest piece when a break cuts a task"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, '60'); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await C.sleep(600);
  const rows = JSON.parse(fs.readFileSync(path.join(dataDir, 'belific_user_settings.kv'), 'utf8'));
  check('P4: it is saved as the synced setting planner.cut_min = 60', rows.some((r) => r.key === 'planner.cut_min' && r.value === '60' && !r.deletedAt), JSON.stringify(rows.map((r) => [r.key, r.value])));
  await I.click(I.byLabel('Back'), 700);
  await C.sleep(500);
  await I.click(`document.querySelector('[aria-label="Show the Calendar"]')`, 900);
  await scrollTo(9);
  await C.sleep(400);
  // With 60: the 50 minute first piece of the three break day is now too small.
  const stillCut = await I.js(`!!document.querySelector('[data-cal-block="cal${d1}:long~2"]')`);
  const noteNow = await box(cal(d1, 'b1'));
  const third = await I.js(`!!document.querySelector('[data-cal-block="cal${d1}:long~3"]')`);
  check('P4: with 60 minutes each cut is judged on its own: the 50 minute first piece refuses break one (info mark), break two still cuts', stillCut && !third && !!noteNow && (await I.exists(`${cal(d1, 'b1')}.querySelector('[data-cut-note-icon]')`)), JSON.stringify([stillCut, third, noteNow && noteNow.text]));
  const tip60 = await I.js(`(() => { const i = ${cal(d1, 'b1')}.querySelector('[data-cut-note-icon]'); return i ? i.getAttribute('title') + ' | ' + i.getAttribute('aria-label') : null; })()`);
  check('P4: a short break (no room for the badge) carries an info mark whose tooltip and aria-label say why', !!tip60 && tip60.includes('Not cutting Long host: a piece would be 50 min (the minimum is 1 h)') && tip60.split(' | ')[1] === tip60.split(' | ')[0], String(tip60));
  // today's 90 minute and 310 minute pieces are fine at 60
  check('P4: the drawing is still cut at 60 (90 and 310 minute pieces)', await I.exists(cal(today, 'boot~2')));
  await I.shot('p14-min-60');

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
