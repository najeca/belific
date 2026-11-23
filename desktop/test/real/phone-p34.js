'use strict';
// @real-input: quiet
// Real touch check for 3.75.0 (PLAN_push_after P3): push after on the phone, at 390 x 844, on tomorrow's Day view.
//   - hold and drag a block onto busy time: the chain is pushed later, the bar says how many, Undo puts all back;
//   - a dragged shift takes its row with it (the desktop's shift carry, new on the phone, question 5);
//   - a new time in the details pushes too, with the sheet's Undo;
//   - the add flow's phrase with a time pushes what it lands on, and says so in the flow.
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
  const D = day(1);
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, start, len, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, dueDate: D, startTime: start, durationMinutes: len, ...extra });
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      T('e1', 'Early one', '07:00', 15),
      T('e2', 'Early two', '07:15', 15),
      T('stand', 'Standup', '09:00', 60),
      T('a', 'Alpha', '10:30', 60),
      T('b', 'Bravo', '11:30', 30),
      T('shift', 'Shift', '13:00', 180),
      T('r1', 'Shift row', '13:30', 30),
      T('tail', 'Tail', '16:45', 30),
      T('den', 'Dentist prep', '17:15', 30),
    ]),
  );
  const rows = () => JSON.parse(fs.readFileSync(path.join(dataDir, 'belific_tasks.kv'), 'utf8'));
  const task = (id) => rows().find((t) => t.id === id && !t.deletedAt);
  const at = (id) => (task(id) || {}).startTime;
  const times = (ids) => ids.map((id) => `${id}@${at(id)}`).join(' ');

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.show();
  await C.sleep(2500);
  const P = await phoneWindow(win);
  const shot = async (name) => {
    if (!process.env.BELIFIC_SHOTS) return;
    fs.mkdirSync(process.env.BELIFIC_SHOTS, { recursive: true });
    fs.writeFileSync(path.join(process.env.BELIFIC_SHOTS, `${name}.png`), (await win.webContents.capturePage()).toPNG());
  };
  const tabEls = `[...document.querySelectorAll('a, [role="tab"], [role="button"], [role="link"]')].filter((e) => { const r = e.getBoundingClientRect(); return r.top > 760 && r.height > 20 && r.width > 40 && r.width < 200; })`;
  const tab = (name) => `${tabEls}.find((e) => e.textContent.replace(/[^ -~]/g, '').trim() === '${name}')`;
  const visible = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].reverse().find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left >= -1 && r.left < innerWidth && r.top < innerHeight && r.bottom > 0; })`;
  const block = (id) => `document.querySelector('[data-block-tap="${id}"]')`;
  const scrollToHour = async (hour) => {
    await P.js(`(() => { let e = document.querySelector('[data-empty-slots]'); while (e && !(e.scrollHeight > e.clientHeight + 4 && ['auto', 'scroll'].includes(getComputedStyle(e).overflowY))) e = e.parentElement; if (e) e.scrollTop = ${hour} * 56; })()`);
    await C.sleep(400);
  };
  const notice = () => P.js(`(document.querySelector('[data-undo-bar]') || {}).innerText || ''`);
  const typeText = async (t) => {
    await win.webContents.insertText(t);
    await C.sleep(250);
  };

  await P.finger.tap(tab('Calendar'), 1200);
  await P.finger.tap(visible('[aria-label="Next day"]'), 900);
  await C.waitFor(() => P.js(`!!document.querySelector('[data-block-tap="task:stand"]')`), 6000).catch(() => {});

  // ---- the chain ----
  await scrollToHour(8);
  await P.finger.holdDrag(block('task:stand'), 0, 56, 520, 500, 1000);
  await C.sleep(600);
  check('Standup dragged an hour down to 10:00', at('stand') === '10:00', JSON.stringify(task('stand')));
  check('the chain is pushed: Alpha 11:00, Bravo 12:00', times(['a', 'b']) === 'a@11:00 b@12:00', times(['a', 'b']));
  const n1 = await notice();
  check('the bar says "Moved Standup to 10:00am and pushed 2 tasks later" with Undo', n1.includes('Moved Standup to 10:00am and pushed 2 tasks later') && /Undo/.test(n1), n1);
  await shot('phone-p34-chain');
  await P.finger.tap(`document.querySelector('[data-undo-bar] [aria-label="Undo"]')`, 1200);
  check('Undo puts the drag and both pushes back', times(['stand', 'a', 'b']) === 'stand@09:00 a@10:30 b@11:30', times(['stand', 'a', 'b']));

  // ---- a shift takes its row ----
  await scrollToHour(12);
  await P.finger.holdDrag(block('task:shift'), 0, 56, 520, 500, 1000);
  await C.sleep(600);
  check('the shift moves to 14:00 and its row goes with it (14:30)', times(['shift', 'r1']) === 'shift@14:00 r1@14:30', times(['shift', 'r1']));
  check('what the shift now overlaps is pushed from its end: Tail 17:00, Dentist prep 17:30', times(['tail', 'den']) === 'tail@17:00 den@17:30', times(['tail', 'den']));
  const n2 = await notice();
  check('the shift and its row count once: "pushed 2 tasks later"', n2.includes('Moved Shift to 2:00pm and pushed 2 tasks later'), n2);
  await P.finger.tap(`document.querySelector('[data-undo-bar] [aria-label="Undo"]')`, 1200);
  check('Undo puts the shift, its row and the pushes back', times(['shift', 'r1', 'tail', 'den']) === 'shift@13:00 r1@13:30 tail@16:45 den@17:15', times(['shift', 'r1', 'tail', 'den']));

  // ---- the details ----
  await scrollToHour(6.5);
  await P.finger.tap(block('task:e1'), 1200);
  await P.finger.tap(visible('[aria-label^="Time, "]'), 700);
  await P.finger.tap(visible('input[aria-label="Start time"]'), 300);
  await P.js(`(() => { const e = document.activeElement; if (e && e.select) e.select(); })()`);
  await typeText('07:10');
  await P.js(`document.activeElement.blur()`);
  await C.waitFor(() => at('e2') === '07:25', 6000).catch(() => {});
  check('a new time in the details pushes too: Early two to 07:25', times(['e1', 'e2']) === 'e1@07:10 e2@07:25', times(['e1', 'e2']));
  const sheet = await P.js(`document.body.innerText`);
  check('the details say so, with Undo', sheet.includes('Moved Early one to 7:10am and pushed 1 task later'), '');
  await shot('phone-p34-details');
  if (await P.js(`!!(${visible('[aria-label="Done"]')})`)) await P.finger.tap(visible('[aria-label="Done"]'), 900);
  else if (await P.js(`!!(${visible('[aria-label="Close"]')})`)) await P.finger.tap(visible('[aria-label="Close"]'), 900);
  await C.sleep(600);

  // ---- the add flow ----
  await P.finger.tap(tab('Today'), 1000);
  await P.finger.tap(visible('[data-add-button]'), 1200);
  await C.waitFor(() => P.js(`!!(${visible('[data-step-next]')})`), 5000).catch(() => {});
  await typeText('Dentist tomorrow 5pm 30m');
  await P.finger.tap(visible('[data-step-next]'), 1500);
  const dentist = rows().find((t) => t.title === 'Dentist' && !t.deletedAt);
  check('the phrase stores Dentist tomorrow at 17:00', !!dentist && dentist.startTime === '17:00' && dentist.dueDate === D, JSON.stringify(dentist));
  await C.waitFor(() => at('den') === '18:00', 4000).catch(() => {});
  check('and pushes what it lands on: Tail (16:45, it overlaps the start) to 17:30, Dentist prep to 18:00', times(['tail', 'den']) === 'tail@17:30 den@18:00', times(['tail', 'den']));
  const line = await P.js(`(() => { const e = document.querySelector('[data-step-pushed]'); return e ? e.innerText.replace(/\\s+/g, ' ') : ''; })()`);
  check('the flow says "Added Dentist at 5:00pm and pushed 2 tasks later" with Undo', line.includes('Added Dentist at 5:00pm and pushed 2 tasks later') && /Undo/.test(line), line);
  await shot('phone-p34-add');
  await P.finger.tap(visible('[aria-label="Undo the push"]'), 1200);
  check('its Undo takes the pushes back and keeps Dentist', at('den') === '17:15' && at('tail') === '16:45' && !!rows().find((t) => t.title === 'Dentist' && !t.deletedAt), times(['den']));

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
