'use strict';
// Real check for the 2.28.0 display batch (Part A): real mouse, key and text input
// into the real app, on an isolated data folder asserted NOT to be the real one;
// Supabase is the in process fake (signed out, nothing leaves the machine).
// A1 opens on the Calendar in Week mode, A2 the red ! marker, A3 full titles on
// Calendar blocks, A4 the palette lock note.
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
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  const LONG = 'Leep Talent Online Boot Camp Session';
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      T('long', LONG, { dueDate: today, startTime: '09:30', durationMinutes: 420, recurrence: 'weekly', recurrenceDays: [['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getDay()]] }),
      T('short', 'A very long title for a very short block', { dueDate: today, startTime: '18:00', durationMinutes: 15 }),
      T('must', 'Priority task', { dueDate: today, priority: 'high' }),
      T('plain', 'Plain task', { dueDate: today }),
      T('mustTimed', 'High timed', { dueDate: today, startTime: '11:00', durationMinutes: 60, priority: 'high' }),
      T('night', 'High night', { dueDate: today, startTime: '23:00', durationMinutes: 180, priority: 'high' }),
      T('ynight', 'High from yesterday', { dueDate: day(-1), startTime: '23:00', durationMinutes: 120, priority: 'high' }),
      T('lowTimed', 'Plain timed', { dueDate: today, startTime: '13:00', durationMinutes: 60 }),
    ]),
  );
  // The last session left the Tasks view, Month range, only today on and the sidebar hidden.
  fs.writeFileSync(
    path.join(dataDir, 'belific_desktop_panes.kv'),
    JSON.stringify({ leftCollapsed: true, rightCollapsed: false, center: 'kanban', calendar: 'month', onlyToday: true }),
  );

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1440, 900);
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await C.sleep(3500);

  // ======== A1. Opens on the Calendar, Week mode, whatever was remembered ========
  // Columns fully inside their scrolling box (the strip is wider than the screen).
  const shown = () => I.js(`(() => { const cols = [...document.querySelectorAll('[data-cal-col]')]; if (!cols.length) return 0; let box = cols[0].parentElement; while (box && !['auto', 'scroll'].includes(getComputedStyle(box).overflowX)) box = box.parentElement; const bb = (box || document.body).getBoundingClientRect(); return cols.filter((c) => { const r = c.getBoundingClientRect(); return r.left >= bb.left - 1 && r.right <= bb.right + 1; }).length; })()`);
  // The selected button of a pair has its own background.
  const bg = (label) => I.js(`getComputedStyle(document.querySelector('[aria-label="${label}"]')).backgroundColor`);
  const only = async (on, others) => { const b = await bg(on); for (const o of others) if ((await bg(o)) === b) return false; return true; };
  const wk = await shown();
  check('A1: opens on the Calendar (seven day columns on screen)', wk === 7 || wk === 6 || wk === 8, String(wk));
  check('A1: the Calendar button is the selected centre view', await only('Show the Calendar', ['Show Tasks']));
  check('A1: Week is the selected range', await only('Week view', ['Day view', 'Month view']));
  check('A1: "only today" from the last session is not kept', (await shown()) > 1);
  await I.shot('p12-A1-opening');

  // Changing the view and range during the session still works.
  await I.click(`document.querySelector('[aria-label="Day view"]')`, 500);
  check('A1: Day still works', (await shown()) === 1);
  await I.click(`document.querySelector('[aria-label="Week view"]')`, 500);

  // ======== A3. Full titles on Calendar blocks ========
  const blk = `document.querySelector('[data-cal-block$="long"]')`;
  const info = await I.js(`(() => { const b = ${blk}; if (!b) return null; const t = [...b.querySelectorAll('div,span')].find((e) => e.textContent.trim() === ${JSON.stringify(LONG)}) ; const r = t.getBoundingClientRect(); const s = getComputedStyle(t); return { h: Math.round(r.height), lh: parseFloat(s.lineHeight) || 16, overflow: s.textOverflow, clamp: s.webkitLineClamp, text: b.innerText.replace(/\\s+/g, ' '), clipped: t.scrollHeight > t.clientHeight + 1, tip: b.getAttribute('title') }; })()`);
  check('A3: the 7 hour block is on the Calendar', !!info, JSON.stringify(info));
  check('A3: the whole title is in the block', !!info && info.text.includes(LONG), info && info.text);
  check('A3: no ellipsis and no line clamp', !!info && info.overflow !== 'ellipsis' && (info.clamp === 'none' || info.clamp === undefined || info.clamp === ''), JSON.stringify(info));
  check('A3: the title wraps over more than one line', !!info && info.h > info.lh * 1.5, JSON.stringify(info));
  check('A3: the time and duration line shows in full', !!info && /9:30/.test(info.text) && /7h/.test(info.text), info && info.text);
  check('A3: the repeat icon is there', await I.exists(`${blk}.querySelector('[aria-label="Repeats"]')`));
  check('A3: the tooltip has the full text', !!info && !!info.tip && info.tip.includes(LONG) && /9:30/.test(info.tip), info && info.tip);
  const geom = await I.js(`(() => { const r = ${blk}.getBoundingClientRect(); return Math.round(r.height); })()`);
  check('A3: the block height is still tied to real time (7h = 7 hours of grid)', geom > 7 * 40, String(geom));
  const short = await I.js(`(() => { const b = document.querySelector('[data-cal-block$="short"]'); const t = [...b.querySelectorAll('div,span')].find((e) => e.textContent.includes('A very long title')); return { overflow: getComputedStyle(t).textOverflow, tip: b.getAttribute('title'), h: Math.round(b.getBoundingClientRect().height) }; })()`);
  check('A3: a short block never gets an ellipsis, and its tooltip has the full title', short.overflow !== 'ellipsis' && short.tip.includes('A very long title for a very short block'), JSON.stringify(short));
  await I.shot('p12-A3-blocks');

  // ======== A2. The red ! marker ========
  await I.click(`document.querySelector('[aria-label="Show Tasks"]')`, 800);
  // The Calendar stays mounted (hidden) from launch: opening Filter on Tasks must open one menu, not two.
  await I.click(`Array.from(document.querySelectorAll('[aria-label="Filter"]')).find((e) => e.getBoundingClientRect().width > 0)`, 600);
  check('A1: Filter on Tasks opens one menu (the hidden Calendar draws no copy)', (await I.js(`document.querySelectorAll('[data-popover]').length`)) === 1);
  await I.key('Escape', [], 300);
  const mark = await I.js(`(() => { const m = document.querySelector('[data-must-do="1"]'); return m ? { text: m.textContent, tip: m.getAttribute('title'), aria: m.getAttribute('aria-label') } : null; })()`);
  check('A2: the card shows the exclamation mark (U+2757)', !!mark && mark.text === '❗', JSON.stringify(mark));
  check('A2: it has the tooltip and aria-label "High priority"', !!mark && mark.tip === 'High priority' && mark.aria === 'High priority', JSON.stringify(mark));
  check('A2: no "Must do" words remain on the board', !(await I.js(`document.body.innerText.includes('Must do')`)));
  await I.click(`document.querySelector('[data-day-col="${today}"] [aria-label="Title Plain task"]')`, 600);
  await C.waitFor(() => I.exists(`document.querySelector('[data-detail-panel]')`), 4000).catch(() => {});
  const row = await I.js(`(() => { const r = document.querySelector('[data-detail-row="Must do"]'); return r ? { text: r.firstElementChild.textContent.trim(), tip: r.firstElementChild.getAttribute('title'), sw: r.querySelector('[role="switch"]')?.getAttribute('aria-label') } : null; })()`);
  check('A2: the details row shows only the mark, with the tooltip', !!row && row.text === '❗' && row.tip === 'High priority' && row.sw === 'High priority', JSON.stringify(row));
  await I.shot('p12-A2-details');
  await I.click(`document.querySelector('[data-detail-row="Must do"] [role="switch"]')`, 500);
  const stored = () => JSON.parse(fs.readFileSync(path.join(dataDir, 'belific_tasks.kv'), 'utf8')).find((t) => t.id === 'plain');
  check('A2: the switch still stores priority "high" (no data change)', stored().priority === 'high', JSON.stringify(stored()));
  await I.blur();
  await I.key('Escape');
  await C.sleep(400);

  // ======== A5 (2.28.1). The ! mark on Timebox cards and Calendar blocks ========
  const marks = (sel) => I.js(`(() => { const els = [...document.querySelectorAll(${JSON.stringify(sel)})].filter((e) => e.getBoundingClientRect().width > 0); return els.map((e) => { const m = e.querySelector('[data-priority-mark]'); return m ? { text: m.textContent, tip: m.getAttribute('title'), aria: m.getAttribute('aria-label') } : null; }); })()`);
  const okMark = (m) => !!m && m.text === '❗' && m.tip === 'High priority' && m.aria === 'High priority';
  // The Timebox (Tasks view): a timed block, an overnight block and the piece continued from yesterday.
  const tb = await marks('[data-block-id="mustTimed"]');
  check('A5: a Timebox block of a top priority task has the mark (tooltip and aria-label)', tb.length === 1 && okMark(tb[0]), JSON.stringify(tb));
  const tn = await marks('[data-block-id="night"]');
  check('A5: the Timebox block that runs past midnight has it', tn.length === 1 && okMark(tn[0]), JSON.stringify(tn));
  const tc = await marks('[data-continuation="1"][data-block-id="ynight"]');
  check('A5: the Timebox piece continued from yesterday has it', tc.length === 1 && okMark(tc[0]), JSON.stringify(tc));
  const tl = await marks('[data-block-id="lowTimed"]');
  check('A5: a task without top priority has no mark on the Timebox', tl.length === 1 && tl[0] === null, JSON.stringify(tl));
  await I.shot('p12-A5-timebox');
  // The Calendar, week: timed, overnight (both pieces), all-day chip, continuation.
  await I.click(`document.querySelector('[aria-label="Show the Calendar"]')`, 800);
  const cm = await marks('[data-cal-block$=":mustTimed"]');
  check('A5: a Calendar block has the mark', cm.length === 1 && okMark(cm[0]), JSON.stringify(cm));
  const cn = await marks('[data-cal-block$=":night"]');
  check('A5: every piece of the overnight block has it (today and the continuation tomorrow)', cn.length >= 2 && cn.every(okMark), JSON.stringify(cn));
  const cy = await marks('[data-cal-block$=":ynight"]');
  check('A5: the Calendar piece continued from yesterday has it', cy.length >= 1 && cy.every(okMark), JSON.stringify(cy));
  const ca = await marks('[aria-label="All day task Priority task"]');
  check('A5: the all-day chip has it', ca.length === 1 && okMark(ca[0]), JSON.stringify(ca));
  const cp = await marks('[data-cal-block$=":lowTimed"]');
  check('A5: tasks without top priority have no mark on the Calendar', cp.length === 1 && cp.every((m) => m === null), JSON.stringify(cp));
  const ev = await I.js(`document.querySelectorAll('[data-ext-block] [data-priority-mark]').length`);
  check('A5: imported events get no mark', ev === 0);
  // Never over the title: the mark sits to the right of the title text.
  const apart = await I.js(`(() => { const b = document.querySelector('[data-cal-block$=":mustTimed"]'); const m = b.querySelector('[data-priority-mark]').getBoundingClientRect(); const t = [...b.querySelectorAll('div,span')].find((e) => e.textContent.trim() === 'High timed').getBoundingClientRect(); return m.left >= t.right - 1 || m.top >= t.bottom - 1; })()`);
  check('A5: the mark does not overlap the title', apart);
  await I.shot('p12-A5-calendar');
  // Month chips.
  await I.click(`document.querySelector('[aria-label="Month view"]')`, 800);
  const mc = await marks('[aria-label="Calendar task High timed"]');
  check('A5: the month chip has it', mc.length >= 1 && okMark(mc[0]), JSON.stringify(mc));
  await I.click(`document.querySelector('[aria-label="Week view"]')`, 600);
  await I.click(`document.querySelector('[aria-label="Show Tasks"]')`, 800);

  // ======== A4. The palette lock note ========
  await I.click(`document.querySelector('[data-add-box="${today}"] [data-ctl="addLabel"]')`, 600);
  await I.click(`document.querySelector('[data-popover] [aria-label="New label"]')`, 500);
  const tick = `document.querySelector('[data-color-picker] [role="checkbox"]')`;
  check('A4: before it is confirmed the box and the note show', (await I.exists(tick)) && (await I.js(`document.querySelector('[data-color-picker]').innerText.includes('The last 12 colours')`)));
  const edge = await I.js(`(() => { const p = document.querySelector('[data-color-picker]'); const pop = document.querySelector('[data-popover]').getBoundingClientRect(); return [...p.querySelectorAll('div')].filter((e) => e.children.length === 0 && e.textContent.trim()).map((e) => { const r = e.getBoundingClientRect(); return { t: e.textContent.slice(0, 20), over: Math.round(r.right - pop.right), scrollOver: e.scrollWidth > e.clientWidth + 1 }; }); })()`);
  check('A4: the note text is not cut off at the right edge', edge.every((e) => e.over <= 0 && !e.scrollOver), JSON.stringify(edge));
  await I.shot('p12-A4-before');
  await I.click(tick, 500);
  check('A4: after the tick the box and the long note are gone', !(await I.exists(tick)) && !(await I.js(`document.querySelector('[data-color-picker]').innerText.includes('The last 12 colours')`)));
  check('A4: one short line instead ("Extra colours on")', (await I.js(`document.querySelector('[data-extra-colours-on]')?.textContent`)) === 'Extra colours on');
  check('A4: the extra colours are unlocked', !(await I.exists(`document.querySelector('[data-color-picker] [data-locked="1"]')`)));
  await I.shot('p12-A4-after');

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
