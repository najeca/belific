'use strict';
// @real-input: quiet
// Real touch check for the 3.53.1 fix at 390 x 844: "This day only" on the FIRST day of a repeating shift stays on that day.
// On a FIXED CLOCK (Thursday 12 Nov 2026, 10:00), "Night shift" repeats every day from today at 19:00 for 3 h with "Check
// the log" on its checklist (today's row is its only stored row, so it is also the template the later days come from).
//   - Today: Add inside "Pack the bag", This day only -> a row of today's Night shift;
//   - Add inside "Check handover", All days of Night shift -> a row of today's Night shift too;
//   - the clock moves to Friday 13 (a stored day now, carrying the series) and Saturday 14 (a day drawn from the series):
//     each shows "Check the log" and "Check handover", never "Pack the bag".
// Runs quiet.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const C = require('./common');
const { phoneWindow } = require('./phone-common');

process.env.BELIFIC_NO_PROTOCOL_REGISTER = '1';
const userData = C.isolate();
console.log(`USERDATA ${userData}`);

const D1 = '2026-11-12';
const D2 = '2026-11-13';

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
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      { id: 'night', title: 'Night shift', dueDate: D1, startTime: '19:00', durationMinutes: 180, recurrence: 'daily', subtasks: [{ id: 'k1', title: 'Check the log', done: false }], completed: false, createdAt: stamp, updatedAt: stamp },
    ]),
  );
  const all = () => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dataDir, 'belific_tasks.kv'), 'utf8'));
    } catch {
      return [];
    }
  };
  const live = () => all().filter((t) => !t.deletedAt);
  const titles = (id) => ((live().find((t) => t.id === id) || {}).subtasks || []).map((s) => s.title);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.show();
  await C.sleep(2500);

  // A fixed clock, set before the page loads (phoneWindow reloads it); moved on by replacing the script and reloading.
  const dbg = win.webContents.debugger;
  if (!dbg.isAttached()) dbg.attach('1.3');
  await dbg.sendCommand('Page.enable');
  const clockSource = (ms) => `(() => { const R = Date; const start = R.now(); const base = ${ms};
    class D extends R { constructor(...a) { if (a.length === 0) super(base + (R.now() - start)); else super(...a); } static now() { return base + (R.now() - start); } }
    window.Date = D; })()`;
  let clockId = null;
  const setClock = async (day) => {
    if (clockId) await dbg.sendCommand('Page.removeScriptToEvaluateOnNewDocument', { identifier: clockId });
    clockId = (await dbg.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: clockSource(new Date(2026, 10, day, 10, 0, 0, 0).getTime()) })).identifier;
  };
  await setClock(12);
  let P = await phoneWindow(win);
  await C.sleep(1800);
  const shot = async (name) => {
    if (!process.env.BELIFIC_SHOTS) return;
    fs.mkdirSync(process.env.BELIFIC_SHOTS, { recursive: true });
    fs.writeFileSync(path.join(process.env.BELIFIC_SHOTS, `${name}.png`), (await win.webContents.capturePage()).toPNG());
  };
  const tabEls = `[...document.querySelectorAll('a, [role="tab"], [role="button"], [role="link"]')].filter((e) => { const r = e.getBoundingClientRect(); return r.top > 760 && r.height > 20 && r.width > 40 && r.width < 200; })`;
  const tab = (name) => `${tabEls}.find((e) => e.textContent.replace(/[^ -~]/g, '').trim() === '${name}')`;
  const scrollTo = (sel) => P.js(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => x.getBoundingClientRect().height > 0); if (e) e.scrollIntoView({ block: 'center' }); return !!e; })()`);
  const tapSel = async (sel, wait = 900) => {
    await scrollTo(sel);
    await C.sleep(250);
    await P.finger.tap(`[...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => x.getBoundingClientRect().height > 0)`, wait);
  };
  const focusSel = (sel) => P.js(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => x.getBoundingClientRect().height > 0); if (!e) return false; e.focus(); return true; })()`);
  const typeText = async (t) => {
    await win.webContents.insertText(t);
    await C.sleep(250);
  };
  const rows = () => P.js(`(() => { const b = [...document.querySelectorAll('[data-shift-body="Night shift"]')].find((x) => x.getBoundingClientRect().height > 0); return b ? [...b.querySelectorAll('[data-inside-row]')].map((r) => r.innerText.replace(/\\s+/g, ' ').trim()) : null; })()`);
  const has = (list, t) => !!list && list.some((r) => r.includes(t));
  const addInside = async (name, scope) => {
    await tapSel('[data-add-inside="Night shift"]', 1200);
    await focusSel('[data-add-inside-name]');
    await typeText(name);
    await tapSel(`[data-add-inside-when="scope-${scope}"]`, 600);
    await tapSel('[data-add-inside-form] [aria-label="Add inside"]', 1500);
  };

  // ---- Thursday 12 (the first day) ----
  await P.finger.tap(tab('Today'), 1200);
  check('Today, Thu 12: Night shift shows "Check the log"', has(await rows(), 'Check the log'), JSON.stringify(await rows()));
  await addInside('Pack the bag', 'day');
  const t1 = await rows();
  check('This day only: "Pack the bag" is a row of today\'s Night shift', has(t1, 'Pack the bag'), JSON.stringify(t1));
  check('stored: today\'s row has it; Friday is stored as the series was', JSON.stringify(titles('night')) === JSON.stringify(['Check the log', 'Pack the bag']) && JSON.stringify(titles(`night:${D2}`)) === JSON.stringify(['Check the log']), JSON.stringify(live().map((t) => [t.id, (t.subtasks || []).map((s) => s.title)])));
  await addInside('Check handover', 'all');
  const t2 = await rows();
  check('All days: "Check handover" is a row of today\'s Night shift too', has(t2, 'Check handover') && has(t2, 'Pack the bag'), JSON.stringify(t2));
  await shot('phone-p20-thu');

  // ---- Friday 13 (stored) and Saturday 14 (drawn from the series) ----
  for (const [day, name] of [
    [13, 'Fri 13 (stored)'],
    [14, 'Sat 14 (from the series)'],
  ]) {
    await setClock(day);
    P = await phoneWindow(win);
    await C.sleep(1800);
    await P.finger.tap(tab('Today'), 1200);
    const r = await rows();
    check(`${name}: "Check the log" and "Check handover", no "Pack the bag"`, has(r, 'Check the log') && has(r, 'Check handover') && !has(r, 'Pack the bag'), JSON.stringify(r));
  }
  await shot('phone-p20-sat');

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
