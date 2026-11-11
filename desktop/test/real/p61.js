'use strict';
// @real-input: quiet
// Real check for F6 of PLAN_daily_flow (3.45.0): quick reminders, on a FIXED CLOCK (Thursday 12 Nov 2026, 10:00).
//   - a reminder (a time, 0 minutes) is a small bubble on the Timebox and the Calendar, BESIDE a block at the same time:
//     the block keeps its full width (no lane), no block is drawn for the reminder, and its text shows at 14 px when no
//     block covers its time;
//   - a reminder inside a shift's time is not a row of the shift and does not change its summary;
//   - it never changes a total: the Timebox's Scheduled, the board's day total, the Calendar's Estimated, Wrap up's
//     "Tomorrow so far" count and the Earlier count (a reminder of yesterday is not waiting there);
//   - on the board it is a one line row at the top of its day column, not a card;
//   - ticking the bubble (its card's Done) clears it, Ctrl+Z puts it back; the board row's tick too;
//   - Quick capture: the "Remind me" switch with a time makes a reminder (today, or tomorrow once the time has passed);
//     with the switch off, T and Q add as before.
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
const TOMORROW = '2026-11-13';
const YESTERDAY = '2026-11-11';

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
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  const R = (id, title, day, time) => T(id, title, { dueDate: day, startTime: time, durationMinutes: 0 });
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      T('meet', 'Team meeting', { dueDate: TODAY, startTime: '11:00', durationMinutes: 60 }),
      R('pharm', 'Ring the pharmacy', TODAY, '11:15'),
      T('shift', 'Shift', { dueDate: TODAY, startTime: '13:00', durationMinutes: 240 }),
      T('inner', 'Stock count', { dueDate: TODAY, startTime: '14:00', durationMinutes: 30 }),
      R('r3', 'Move the car', TODAY, '14:30'),
      R('tabs', 'Take tablets', TODAY, '20:00'),
      T('tm', 'Post the parcel', { dueDate: TOMORROW, startTime: '09:00', durationMinutes: 30 }),
      R('r4', 'Bins out', TOMORROW, '08:00'),
      T('oldt', 'Old task', { dueDate: YESTERDAY }),
      R('r0', 'Old reminder', YESTERDAY, '18:00'),
    ]),
  );
  const read = readKv(dataDir);
  const raw = () => read('belific_tasks') || [];
  const live = (id) => raw().find((t) => t.id === id && !t.deletedAt);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1700, 1000);
  win.show();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');

  // ---- the fixed clock: the page's Date, replaced before any page script runs ----
  const dbg = win.webContents.debugger;
  dbg.attach('1.3');
  await dbg.sendCommand('Page.enable');
  const clockSource = (ms) => `(() => { const R = Date; const start = R.now(); const base = ${ms};
    class D extends R { constructor(...a) { if (a.length === 0) super(base + (R.now() - start)); else super(...a); } static now() { return base + (R.now() - start); } }
    window.Date = D; })()`;
  await dbg.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: clockSource(new Date(2026, 10, 12, 10, 0, 0, 0).getTime()) });
  win.webContents.reload();
  await C.sleep(2500);
  await C.waitFor(() => I.exists(`document.querySelector('[data-plan-button]')`), 20000);
  await C.sleep(900);
  await I.click(I.byLabel('Show Tasks'), 800).catch(() => {});
  await C.waitFor(() => I.exists(`document.querySelector('[data-timebox-grid] [data-block-task="meet"]')`), 15000);
  await C.sleep(600);

  const rect = (sel) => I.js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; })()`);
  const beside = async (scope, reminder, block, other) => {
    const bub = await rect(`${scope} [data-reminder-bubble="${reminder}"]`);
    const blk = await rect(`${scope} [data-block-task="${block}"]`);
    const ref = await rect(`${scope} [data-block-task="${other}"]`);
    // Nothing covers it: the element at its centre is the bubble (or its icon).
    const hit = await I.js(`(() => { const b = document.querySelector('${scope} [data-reminder-bubble="${reminder}"]'); if (!b) return false; const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!e && (e === b || b.contains(e)); })()`);
    const ok = !!bub && !!blk && !!ref && hit && Math.abs(bub.cx - blk.l) <= 4 && bub.cy > blk.t && bub.cy < blk.b && Math.abs(blk.w - ref.w) <= 2;
    return { ok, info: JSON.stringify({ bub, blk, ref, hit }) };
  };
  const fontOf = (sel) => I.js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? parseFloat(getComputedStyle(e).fontSize) : 0; })()`);
  const notRed = (sel) =>
    I.js(`![...document.querySelectorAll(${JSON.stringify(sel)})].flatMap((e) => [e, ...e.querySelectorAll('*')]).some((e) => { const s = getComputedStyle(e); return [s.color, s.backgroundColor, s.borderColor].some((c) => { const m = /rgba?\\((\\d+), (\\d+), (\\d+)/.exec(c); return m && +m[1] > 180 && +m[2] < 110 && +m[3] < 110; }); })`);
  const scheduled = async () => (/Scheduled ([0-9hm ]+?)(?:\n|$)/.exec(await I.textOf(`document.querySelector('[data-pane="right"]')`)) || [])[1] || '';
  const boardTotal = () => I.js(`(() => { const e = document.querySelector('[data-day-col="${TODAY}"] [aria-label^="Estimated for the day"]'); return e ? e.getAttribute('aria-label') : ''; })()`);

  // ---- the Timebox: bubbles beside blocks, no lane, no block, the label when there is room ----
  const tb = '[data-timebox-grid]';
  check('the Timebox draws the day\'s three reminders as bubbles, and no block for any of them', (await I.js(`document.querySelectorAll('${tb} [data-reminder-bubble]').length`)) === 3 && !(await I.exists(`document.querySelector('[data-block-task="pharm"], [data-block-task="tabs"], [data-block-task="r3"]')`)));
  const b1 = await beside(tb, 'pharm', 'meet', 'shift');
  check('11:15 "Ring the pharmacy" is a bubble beside the 11:00 meeting: on its left edge, inside its time, and the meeting keeps its full width', b1.ok, b1.info);
  check('its text does not cover the meeting; "Take tablets" at 20:00 (no block near) shows its text beside its bubble at 14 px', !(await I.exists(`document.querySelector('${tb} [data-reminder-label="pharm"]')`)) && (await I.textOf(`document.querySelector('${tb} [data-reminder-label="tabs"]')`)).includes('8:00pm Take tablets') && (await fontOf(`${tb} [data-reminder-label="tabs"]`)) >= 14);
  const summ = await I.js(`(() => { const e = document.querySelector('${tb} [data-shell-summary], ${tb} [data-shell-short]'); return e ? e.getAttribute('data-shell-summary') || e.getAttribute('data-shell-short') : ''; })()`);
  check('a reminder inside the shift\'s time is not inside the shift: its summary counts the 30 minute block only', summ.includes('30m of 4h planned') || summ === '30m/4h', summ);
  const sch = await scheduled();
  check('the Timebox total is the work only: Scheduled 5h (the meeting and the shift), not 5h 30m', sch === '5h', sch);
  await I.shot('p61-timebox');

  // ---- the board: rows at the top, never cards, never in the total ----
  const col = `[data-day-col="${TODAY}"]`;
  const order = await I.js(`(() => { const c = document.querySelector('${col}'); if (!c) return null; const rows = [...c.querySelectorAll('[data-reminder-row]')]; const card = c.querySelector('[data-task-card]'); return { rows: rows.map((r) => r.getAttribute('data-reminder-row')), first: !!card && rows.every((r) => r.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING), text: rows.map((r) => r.innerText.trim()) }; })()`);
  check('on the board the day\'s reminders are one line rows at the top of its column, earliest first, with the time', !!order && JSON.stringify(order.rows) === JSON.stringify(['pharm', 'r3', 'tabs']) && order.first && order.text[0].includes('11:15am Ring the pharmacy'), JSON.stringify(order));
  check('a reminder is never a card, and never a row of the shift\'s card', !(await I.exists(`document.querySelector('[data-task-card="pharm"], [data-task-card="r3"], [data-task-card="tabs"]')`)) && !(await I.textOf(`document.querySelector('${col} [data-task-card="shift"]')`)).includes('Move the car'));
  const bt = await boardTotal();
  check('the board\'s day total is the work only: 5:00', bt === 'Estimated for the day: 5:00', bt);
  check('a reminder of yesterday is not waiting in Earlier: the count is 1 (the old task)', (await I.js(`(() => { const b = document.querySelector('[data-missed-button]'); return b ? b.getAttribute('data-missed-button') : null; })()`)) === '1');
  check('the row text is 14 px; nothing red on the rows or bubbles', (await fontOf(`${col} [data-reminder-row] div[dir="auto"]`)) >= 14 && (await notRed('[data-reminder-row], [data-reminder-bubble], [data-reminder-label]')));
  await I.shot('p61-board');

  // ---- Wrap up's count ----
  await I.click(`document.querySelector('[data-plan-menu]')`, 500);
  await I.click(`document.querySelector('[data-popover] [aria-label="Wrap up from the menu"]')`, 1200);
  const wrapBody = await I.body();
  check('Wrap up\'s "Tomorrow so far" counts the task, not the reminder: 1 task, 30m', wrapBody.includes('Tomorrow so far: 1 task, 30m'), (/Tomorrow so far[^\n]*/.exec(wrapBody) || [''])[0]);
  await I.click(`document.querySelector('[data-wrap-done]')`, 900);

  // ---- the Calendar, Day view ----
  await I.click(`document.querySelector('[aria-label="Show the Calendar"]') || document.querySelector('[aria-label="Show Calendar"]')`, 1200);
  await I.click(I.byLabel('Day view'), 1200).catch(() => {});
  await C.waitFor(() => I.exists(`document.querySelector('[data-calendar-grid] [data-block-task="meet"]')`), 10000).catch(() => {});
  await C.sleep(500);
  const cg = '[data-calendar-grid]';
  const b2 = await beside(cg, 'pharm', 'meet', 'shift');
  check('the Calendar draws the same bubble beside the meeting, which keeps its full width; no block for a reminder', b2.ok && !(await I.exists(`document.querySelector('${cg} [data-block-task="pharm"]')`)), b2.info);
  const est = await I.js(`(() => { const e = document.querySelector('[aria-label^="Estimated: "]'); return e ? e.getAttribute('aria-label') : ''; })()`);
  check('the Calendar\'s Estimated is the work only: 5:00', est === 'Estimated: 5:00', est);
  await I.shot('p61-calendar');
  await I.click(I.byLabel('Show Tasks'), 1000).catch(() => {});
  await C.waitFor(() => I.exists(`document.querySelector('${tb} [data-reminder-bubble="pharm"]')`), 10000).catch(() => {});

  // ---- tick the bubble, Ctrl+Z ----
  await I.click(`document.querySelector('${tb} [data-reminder-bubble="pharm"]')`, 500);
  const card = await I.textOf(`document.querySelector('[data-reminder-card="pharm"]')`);
  check('a click on the bubble opens its card: the text, Done, Edit and Close, all visible', card.includes('11:15am Ring the pharmacy') && ['Done', 'Edit', 'Close'].every((w) => card.includes(w)) && (await fontOf('[data-reminder-card="pharm"] div[dir="auto"]')) >= 14, card);
  await I.click(`document.querySelector('[data-reminder-done="pharm"]')`, 1200);
  check('Done ticks it and the bubble goes; the totals do not move', !!live('pharm') && live('pharm').completed === true && !(await I.exists(`document.querySelector('${tb} [data-reminder-bubble="pharm"]')`)) && (await scheduled()) === '5h' && (await boardTotal()) === 'Estimated for the day: 5:00');
  await I.blur();
  await I.key('Z', ['control'], 1200);
  check('Ctrl+Z puts it back: not done, the bubble is there again', !!live('pharm') && !live('pharm').completed && (await C.waitFor(() => I.exists(`document.querySelector('${tb} [data-reminder-bubble="pharm"]')`), 5000).then(() => true, () => false)));
  await I.click(`document.querySelector('${col} [data-reminder-tick="tabs"]')`, 1200);
  check('the board row\'s tick ticks it too: its bubble goes, the row stays as done', !!live('tabs') && live('tabs').completed === true && !(await I.exists(`document.querySelector('${tb} [data-reminder-bubble="tabs"]')`)) && (await I.js(`(() => { const t = document.querySelector('[data-reminder-tick="tabs"]'); return !t || t.getAttribute('aria-checked') === 'true'; })()`)));
  await I.blur();
  await I.key('Z', ['control'], 1200);
  check('Ctrl+Z again: "Take tablets" is back, not done', !!live('tabs') && !live('tabs').completed && (await C.waitFor(() => I.exists(`document.querySelector('${tb} [data-reminder-bubble="tabs"]')`), 5000).then(() => true, () => false)));

  // ---- Quick capture: the "Remind me" switch ----
  const setTime = (hm) => I.js(`(() => { const i = document.querySelector('[data-remind-time]'); const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(i, '${hm}'); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  const box = `document.querySelector('[aria-label="Quick capture"][role="dialog"]')`;
  await I.blur();
  await I.key('T', [], 800);
  check('T opens Quick capture with a visible "Remind me" switch, off, in 14 px words', (await I.exists(box)) && (await I.js(`(() => { const s = document.querySelector('[data-remind-row] [role="switch"]'); return !!s && s.getAttribute('aria-checked') === 'false' && s.getBoundingClientRect().width > 0; })()`)) && (await fontOf('[data-remind-row] div[dir="auto"]')) >= 14);
  await I.type('Water the plants', 200);
  await I.click(`document.querySelector('[data-remind-row] [role="switch"]')`, 500);
  check('switched on: a time field, and the words say when', (await I.exists(`document.querySelector('[data-remind-time]')`)) && (await I.textOf(`document.querySelector('[data-remind-when]')`)).startsWith('Reminds you today at 10:30am'));
  await setTime('09:00');
  await C.sleep(300);
  check('a time that has passed today is tomorrow, said plainly', (await I.textOf(`document.querySelector('[data-remind-when]')`)).startsWith('Reminds you tomorrow at 9:00am'));
  await setTime('15:45');
  await C.sleep(300);
  check('15:45: "Reminds you today at 3:45pm", in 14 px', (await I.textOf(`document.querySelector('[data-remind-when]')`)).startsWith('Reminds you today at 3:45pm') && (await fontOf('[data-remind-when]')) >= 14);
  await I.click(`document.querySelector('[aria-label="Quick capture task"]')`, 200);
  await I.enter([], 1200);
  const made = raw().find((t) => t.title === 'Water the plants');
  check('Enter makes a reminder: today, 15:45, 0 minutes, in no list', !!made && made.dueDate === TODAY && made.startTime === '15:45' && made.durationMinutes === 0 && !made.listKey && !(await I.exists(box)), JSON.stringify(made));
  check('its bubble is on the Timebox at once, and the totals still do not move', !!made && (await C.waitFor(() => I.exists(`document.querySelector('${tb} [data-reminder-bubble="${made.id}"]')`), 5000).then(() => true, () => false)) && (await scheduled()) === '5h' && (await boardTotal()) === 'Estimated for the day: 5:00');
  await I.blur();
  await I.key('T', [], 800);
  await I.type('Plain today task', 200);
  await I.enter([], 1000);
  const plainT = raw().find((t) => t.title === 'Plain today task');
  check('with the switch off, T adds to today as before (no time, no 0)', !!plainT && plainT.dueDate === TODAY && !plainT.startTime && plainT.durationMinutes === undefined, JSON.stringify(plainT));
  await I.blur();
  await I.key('Q', [], 800);
  check('Q opens Quick capture as before, with the switch off', (await I.exists(box)) && (await I.js(`document.querySelector('[data-remind-row] [role="switch"]').getAttribute('aria-checked')`)) === 'false');
  await I.type('Plain list thing', 200);
  await I.enter([], 1000);
  const plainQ = raw().find((t) => t.title === 'Plain list thing');
  check('Q adds to the list as before (no Day, no time)', !!plainQ && !plainQ.dueDate && !plainQ.startTime, JSON.stringify(plainQ));
  await I.shot('p61-after');

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
