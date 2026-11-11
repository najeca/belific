'use strict';
// @real-input: quiet
// Real check for PLAN_shifts S1 (3.36.0): a block inside a longer block counts once. Today: the nurse's Shift 8:00 for
// 10 h with five things inside it (Briefing 8:30 30m, Teams press meeting 10:00 1h, Ring patients 11:00 2h, Lunch 13:00
// 30m, Ring other departments 14:00 1h) and a one off "Read" at 20:00 for 30m, outside it.
//   - the Kanban day total reads 10:30 (the shift once, Read beside it), not 15:30;
//   - the Timebox says Scheduled 10h 30m.
// (Free time inside a shift, D3, is covered by nesting.test.ts.)
// Runs quiet.
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
  const dk = dayKeyFrom(new Date());
  const today = dk(0);
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, startTime, durationMinutes, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, dueDate: today, startTime, durationMinutes, ...extra });
  const nurse = [
    T('shift', 'Shift', '08:00', 600),
    T('briefing', 'Briefing', '08:30', 30),
    T('teams', 'Teams press meeting', '10:00', 60),
    T('patients', 'Ring patients', '11:00', 120),
    T('lunch', 'Lunch', '13:00', 30),
    T('depts', 'Ring other departments', '14:00', 60),
    T('read', 'Read', '20:00', 30),
  ];
  fs.writeFileSync(path.join(dataDir, 'belific_tasks.kv'), JSON.stringify(nurse));

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1440, 900);
  win.show();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await I.waitBody('Ring patients', 20000);
  await I.click(I.byLabel('Show Tasks'), 900).catch(() => {});
  await C.sleep(800);

  const kanban = () => I.js(`[...document.querySelectorAll('[aria-label^="Estimated for the day: "]')].map((e) => e.getAttribute('aria-label').slice(23))`);
  const k1 = await kanban();
  check('Kanban: today reads 10:30 (the shift once, Read beside it), not 15:30', k1.includes('10:30') && !k1.includes('15:30'), JSON.stringify(k1));
  check('Timebox: Scheduled 10h 30m', (await I.body()).includes('Scheduled 10h 30m'), '');
  await I.shot('p52-totals');
  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
