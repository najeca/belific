'use strict';
// @real-input: quiet
// Real check for 3.74.0 (PLAN_push_after P2): push after on the desktop. Tomorrow's Timebox (so nothing is in the past),
// drags driven by PointerEvents dispatched in the page (the app's own DragProvider reads them), keys through
// sendInputEvent, so it runs quiet.
//   - a drag onto a busy time pushes the chain later, stopping at the first gap big enough; a done task stays;
//     the Undo bar says how many; its Undo puts the drop and every push back; one Ctrl+Z does too;
//   - a pushed shift carries its row; a break is a wall (the pushed task jumps to its end);
//   - a chain that cannot end by midnight pushes nothing and the note says why (the drop stays);
//   - a repeating day is pushed as that day (a day row), the series' root row is unchanged;
//   - a new time in the details pushes too; with the setting off nothing is pushed.
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
  const day = dayKeyFrom(new Date());
  const D1 = day(1);
  const stamp = '2026-11-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, start, len, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, dueDate: D1, startTime: start, durationMinutes: len, ...extra });
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      // Setting off (last): q1 dropped onto q2.
      T('q1', 'Quiet one', '00:00', 30),
      T('q2', 'Quiet two', '00:30', 30),
      // The details: e1 to 01:10 pushes e2.
      T('e1', 'Early one', '01:00', 15),
      T('e2', 'Early two', '01:15', 15),
      // Keys and resize: Shift+Down on n1 (to the next 30 minutes, 02:00 to 03:00) pushes n2; n2 resized 30 minutes
      // longer pushes m5.
      T('n1', 'Night one', '02:00', 20),
      T('n2', 'Night two', '02:30', 20),
      // A repeating day: run every day at 05:30 since 1 November; m5 dropped at 05:00.
      T('m5', 'Mover five', '03:30', 60),
      T('run', 'Morning run', '05:30', 30, { dueDate: '2026-11-01', recurrence: 'daily' }),
      // The chain: Gym 07:00 to 09:00.
      T('gym', 'Gym', '07:00', 60),
      T('a', 'Alpha', '09:30', 60),
      T('done', 'Done one', '10:15', 30, { completed: true, completedAt: stamp }),
      T('b', 'Bravo', '10:30', 30),
      T('c', 'Charlie', '11:00', 30),
      T('d', 'Delta', '12:00', 30),
      // A shift with a row: m2 12:30 to 13:30 pushes the shift 30 minutes.
      T('m2', 'Mover two', '12:30', 60),
      T('shift', 'Shift', '14:00', 180),
      T('r1', 'Shift row', '14:30', 30),
      // A break is a wall: m3 17:30 to 18:00 pushes x, which jumps the break.
      T('m3', 'Mover three', '17:30', 30),
      T('x', 'Xray', '18:15', 45),
      T('brk', 'Tea', '19:00', 30, { cutsBelow: true }),
      // Midnight: m4 21:00 to 22:00, the chain cannot end by 24:00.
      T('m4', 'Mover four', '21:00', 60),
      T('late1', 'Late one', '22:30', 60),
      T('late2', 'Late two', '23:30', 30),
    ]),
  );
  fs.writeFileSync(path.join(dataDir, 'belific_desktop_panes.kv'), JSON.stringify({ leftCollapsed: false, rightCollapsed: false, center: 'kanban', calendar: 'day' }));
  const read = readKv(dataDir);
  const rows = () => read('belific_tasks') || [];
  const row = (id) => rows().find((t) => t.id === id && !t.deletedAt);
  const at = (id) => (row(id) || {}).startTime;
  const times = (ids) => ids.map((id) => `${id}@${at(id)}`).join(' ');

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1440, 900);
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await I.waitBody('Gym', 20000);
  await I.click(I.byLabel('Show Tasks'), 800).catch(() => {});
  await C.sleep(800);
  await I.click(`document.querySelector('[aria-label="Next day"]')`, 1000);

  const V = (sel) => `[...document.querySelectorAll('${sel}')].find((e) => e.getBoundingClientRect().width > 0)`;
  const TB = '[data-timebox-grid]';
  const tbSel = (id) => `${TB} [data-block-id="${id}"]`;
  const minOf = (hm) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));
  const bar = () => I.js(`(() => { const b = document.querySelector('[data-undo-bar], [data-notice-bar]'); return b ? b.innerText.replace(/\\s+/g, ' ').trim() : ''; })()`);
  const away = () => I.js(`(() => { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); })()`);
  const dragTo = async (id, toHm) => {
    const from = minOf(at(id));
    await I.js(`(() => { const b = ${V(tbSel(id))}; if (b) b.scrollIntoView({ block: 'center' }); })()`);
    await C.sleep(400);
    await I.drag(V(tbSel(id)), TB, from + 5, minOf(toHm) + 5);
    await C.waitFor(() => at(id) === toHm, 5000).catch(() => {});
    await C.sleep(900);
  };
  const clickUndo = async () => {
    await I.click(`document.querySelector('[data-undo-bar] [aria-label="Undo"]')`, 1200);
    await C.sleep(600);
  };

  check('the Timebox shows tomorrow with the seeded blocks', await I.exists(V(tbSel('gym'))));

  // ---- the chain ----
  await dragTo('gym', '09:00');
  check('Gym is dropped at 09:00', at('gym') === '09:00', JSON.stringify(row('gym')));
  check('the chain is pushed: Alpha 10:00, Bravo 11:00, Charlie 11:30', times(['a', 'b', 'c']) === 'a@10:00 b@11:00 c@11:30', times(['a', 'b', 'c']));
  check('it stops at the first gap big enough: Delta stays at 12:00', at('d') === '12:00', times(['d']));
  check('a done task never moves', at('done') === '10:15' && row('done').completed === true, JSON.stringify(row('done')));
  const b1 = await bar();
  check('the Undo bar says "Moved Gym to 9:00am and pushed 3 tasks later"', b1.includes('Moved Gym to 9:00am and pushed 3 tasks later'), b1);
  await I.shot('p71-01-chain');
  await clickUndo();
  check('its Undo puts the drop and every push back', times(['gym', 'a', 'b', 'c', 'd']) === 'gym@07:00 a@09:30 b@10:30 c@11:00 d@12:00', times(['gym', 'a', 'b', 'c', 'd']));
  await dragTo('gym', '09:00');
  check('dropped again, the chain is pushed again', times(['gym', 'a', 'b', 'c']) === 'gym@09:00 a@10:00 b@11:00 c@11:30', times(['gym', 'a', 'b', 'c']));
  await away();
  await I.key('Z', ['control'], 1200);
  await C.sleep(600);
  check('one Ctrl+Z puts it all back', times(['gym', 'a', 'b', 'c']) === 'gym@07:00 a@09:30 b@10:30 c@11:00', times(['gym', 'a', 'b', 'c']));

  // ---- a shift carries its row ----
  await dragTo('m2', '13:30');
  check('the shift is pushed to 14:30 and its row goes with it (15:00)', times(['m2', 'shift', 'r1']) === 'm2@13:30 shift@14:30 r1@15:00', times(['m2', 'shift', 'r1']));
  const b2 = await bar();
  check('the shift and its row count once: "pushed 1 task later"', b2.includes('pushed 1 task later'), b2);

  // ---- a break is a wall ----
  await dragTo('m3', '18:00');
  check('Xray jumps the Tea break to 19:30', times(['m3', 'x']) === 'm3@18:00 x@19:30', times(['m3', 'x']));
  check('the break never moves', at('brk') === '19:00', JSON.stringify(row('brk')));
  await I.shot('p71-02-wall');

  // ---- midnight ----
  await dragTo('m4', '22:00');
  check('the drop itself stays (22:00)', at('m4') === '22:00', JSON.stringify(row('m4')));
  check('nothing is pushed past midnight', times(['late1', 'late2']) === 'late1@22:30 late2@23:30', times(['late1', 'late2']));
  const b3 = await bar();
  check('the note says why: "Not enough room before midnight to push 2 tasks"', b3.includes('Not enough room before midnight to push 2 tasks. They overlap for now.'), b3);
  await clickUndo();
  check('its Undo puts the drop back', at('m4') === '21:00', JSON.stringify(row('m4')));

  // ---- a repeating day ----
  await dragTo('m5', '05:00');
  const dayRow = rows().find((t) => t.id === `run:${D1}` && !t.deletedAt);
  check('the repeating day is pushed as that day: a day row at 06:00', !!dayRow && dayRow.startTime === '06:00' && dayRow.dueDate === D1, JSON.stringify(dayRow));
  check('the series root row is unchanged (05:30, its own day)', at('run') === '05:30' && row('run').dueDate === '2026-11-01' && row('run').updatedAt === stamp, JSON.stringify(row('run')));
  await clickUndo();
  const back = rows().find((t) => t.id === `run:${D1}`);
  check('Undo gives the day back as the series shows it (05:30, not skipped)', at('m5') === '03:30' && (!back || (back.startTime === '05:30' && !back.deletedAt)), JSON.stringify(back));
  check('and the day is still drawn', await C.waitFor(() => I.exists(V(`${TB} [data-block-task="run:${D1}"], ${TB} [data-block-id="run:${D1}"]`)), 4000).then(() => true, () => false));

  // ---- keys and resize (question 7) ----
  await I.js(`(() => { const b = ${V(tbSel('n1'))}; if (b) { b.scrollIntoView({ block: 'center' }); b.focus(); } })()`);
  await C.sleep(400);
  await I.key('Down', ['shift'], 1200);
  await C.waitFor(() => at('n2') === '03:00', 5000).catch(() => {});
  check('Shift+Down on a block (longer, to 03:00) pushes the next one: Night two to 03:00', row('n1').durationMinutes === 60 && times(['n1', 'n2']) === 'n1@02:00 n2@03:00', JSON.stringify([row('n1'), row('n2')]));
  const b5 = await bar();
  check('the keys get the same Undo bar', b5.includes('Moved Night one to 2:00am and pushed 1 task later'), b5);
  await away();
  await I.js(`(() => { const b = ${V(tbSel('n2'))}; if (b) b.scrollIntoView({ block: 'center' }); })()`);
  await C.sleep(400);
  const n2End = minOf(at('n2')) + row('n2').durationMinutes;
  await I.drag(V(`${TB} [aria-label="Resize Night two"]`), TB, n2End - 1, n2End + 29);
  await C.waitFor(() => at('m5') !== '03:30', 5000).catch(() => {});
  await C.sleep(600);
  const n2 = row('n2');
  const n2Ends = minOf(n2.startTime) + n2.durationMinutes;
  check('a resize that runs into the next task pushes it: Mover five to the new end of Night two', n2.durationMinutes > 30 && minOf(at('m5')) === n2Ends, JSON.stringify([n2, row('m5')]));

  // ---- the details ----
  await I.click(V(`[data-day-col="${D1}"] [aria-label="Title Early one"]`), 900);
  await C.waitFor(() => I.exists(`document.querySelector('[data-detail-panel]')`), 8000).catch(() => {});
  await I.js(`(() => { const el = document.querySelector('[data-detail-panel] input[aria-label="Time"]'); if (!el) return; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; el.focus(); set.call(el, '01:10'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await C.waitFor(() => at('e2') === '01:25', 6000).catch(() => {});
  check('a new time in the details pushes too: Early two to 01:25', times(['e1', 'e2']) === 'e1@01:10 e2@01:25', times(['e1', 'e2']));
  const b4 = await bar();
  check('with the same Undo bar', b4.includes('Moved Early one to 1:10am and pushed 1 task later'), b4);
  await I.key('Escape', [], 600);
  if (await I.exists(`document.querySelector('[data-detail-panel]')`)) await I.click(`document.querySelector('[aria-label="Close the task details"]')`, 600);

  // ---- the setting ----
  await I.click(I.byLabel('Profile, not signed in'), 900);
  await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 1500);
  check('Settings has the push after switch, on', await I.exists(`document.querySelector('[data-push-after-setting] [aria-checked="true"]')`));
  await I.click(I.byLabel('Push later tasks when times overlap'), 900);
  const setting = (read('belific_user_settings') || []).find((r) => r.key === 'push.after' && !r.deletedAt);
  check('switched off, it is stored as push.after = off (synced row)', !!setting && setting.value === 'off', JSON.stringify(setting));
  await I.key('Escape', [], 900);
  await I.click(I.byLabel('Back to home'), 1200).catch(() => {});
  await C.sleep(600);
  if (!(await I.exists(V(tbSel('q1'))))) await I.click(`document.querySelector('[aria-label="Next day"]')`, 1000);
  await dragTo('q1', '00:30');
  check('with the setting off a drop onto a busy time pushes nothing', times(['q1', 'q2']) === 'q1@00:30 q2@00:30', times(['q1', 'q2']));

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
