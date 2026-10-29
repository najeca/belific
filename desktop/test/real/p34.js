'use strict';
// Real check for 3.16.0 (step 4): the Add row. A full width "+ Add a task" field whose placeholder is never cut,
// at the left pane's width and at narrower and wider ones; the total ("3h planned") is a quiet caption under the
// list header, not in the row; the + focuses the field and Enter creates; the details icon creates from the typed
// title and opens its details with the title focused (no title: nothing is created). Light and dark.
// BELIFIC_SHOTS: a folder for screenshots.
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
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  fs.writeFileSync(path.join(dataDir, 'belific_tasks.kv'), JSON.stringify([T('a', 'Planned one', { durationMinutes: 120 }), T('b', 'Planned two', { durationMinutes: 60 }), T('c', 'Today thing', { dueDate: day(0), startTime: '10:00', durationMinutes: 30 })]));
  fs.writeFileSync(path.join(dataDir, 'belific_desktop_panes.kv'), JSON.stringify({ leftCollapsed: false, rightCollapsed: false, center: 'kanban', calendar: 'day' }));
  const read = readKv(dataDir);
  const titles = () => read('belific_tasks').map((t) => t.title);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1440, 900);
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await I.waitBody('Planned one', 20000);
  await I.click(I.byLabel('Show Tasks'), 800).catch(() => {});
  await C.sleep(600);

  const box = (id) => `document.querySelector('[data-add-box="${id}"]')`;
  // The placeholder's width against the field's room (the same font): never cut.
  const placeholderFit = (id) =>
    I.js(`(() => { const b = ${box(id)}; if (!b) return null; const i = b.querySelector('input[type="text"], input:not([type])'); const cs = getComputedStyle(i); const c = document.createElement('canvas').getContext('2d'); c.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily; const w = c.measureText(i.placeholder).width; const room = i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); return { ph: i.placeholder, text: Math.ceil(w), room: Math.floor(room), boxW: Math.round(b.getBoundingClientRect().width), buttons: [...b.querySelectorAll('[data-ctl]')].map((e) => e.getAttribute('data-ctl')), planned: /planned/.test(b.innerText) }; })()`);

  async function pass(mode) {
    // ---- the left pane at its own width ----
    const fit = await placeholderFit('left');
    check(`${mode}: the placeholder reads "Add a task" and is not cut (needs ${fit && fit.text}px, has ${fit && fit.room}px)`, !!fit && fit.ph === 'Add a task' && fit.room >= fit.text, JSON.stringify(fit));
    check(`${mode}: the row holds the label and details buttons at the left pane width`, !!fit && fit.buttons.includes('addLabel') && fit.buttons.includes('addDetails'), JSON.stringify(fit && fit.buttons));
    check(`${mode}: the "planned" total is not in the Add row`, !!fit && fit.planned === false, JSON.stringify(fit));
    const cap = await I.js(`(() => { const c = document.querySelector('[data-planned]'); if (!c) return null; const sw = document.querySelector('[data-ctl="lists"]').getBoundingClientRect(); const b = ${box('left')}.getBoundingClientRect(); const r = c.getBoundingClientRect(); return { text: c.innerText.trim(), top: r.top, headBottom: sw.bottom, boxTop: b.top, boxBottom: b.bottom, inBox: ${box('left')}.contains(c), size: getComputedStyle(c).fontSize }; })()`);
    check(`${mode}: the total is a caption "3h planned" directly under the list header, above the Add row`, !!cap && cap.text === '3h planned' && !cap.inBox && cap.top >= cap.headBottom - 1 && cap.top + 14 <= cap.boxTop + 2 && cap.size === '12px', JSON.stringify(cap));
    await I.shot(`p34-left-${mode}`);

    // ---- narrower and wider boxes (the box is given a width; its controls follow) ----
    for (const w of [130, 150, 180, 222, 300, 420]) {
      await I.js(`(() => { const b = ${box('left')}; b.style.width = '${w}px'; b.style.flex = 'none'; })()`);
      await C.sleep(350);
      const f = await placeholderFit('left');
      check(`${mode}: at ${w}px the placeholder is whole (needs ${f && f.text}px, has ${f && f.room}px) with ${f && f.buttons.join('+') || 'no'} buttons`, !!f && f.room >= f.text && !f.planned, JSON.stringify(f));
      if (w >= 200) check(`${mode}: at ${w}px both the label and details buttons are there`, f.buttons.includes('addLabel') && f.buttons.includes('addDetails'), JSON.stringify(f.buttons));
      if (w < 151) check(`${mode}: at ${w}px only the + and the field remain`, f.buttons.length === 0, JSON.stringify(f.buttons));
      if (w === 180) check(`${mode}: at ${w}px the label stays, the details icon has gone`, f.buttons.join() === 'addLabel', JSON.stringify(f.buttons));
    }
    await I.js(`(() => { const b = ${box('left')}; b.style.width = ''; b.style.flex = ''; })()`);
    await C.sleep(350);
    // The day column's own box (272 wide, with the day's total): also whole.
    const dayId = day(0);
    const dfit = await placeholderFit(dayId);
    check(`${mode}: a day column's Add row keeps its placeholder whole too, and its label button`, !!dfit && dfit.room >= dfit.text && dfit.buttons.includes('addLabel') && dfit.buttons.includes('addDetails'), JSON.stringify(dfit));
    const dayTotal = await I.js(`(() => { const b = ${box(dayId)}; return b ? /\\d+:\\d\\d \\/ \\d+:\\d\\d/.test(b.innerText) : null; })()`);
    check(`${mode}: and the day's total (0:00 / 7:00) is still in it`, dayTotal === true, String(dayTotal));
    const oneLine = await I.js(`(() => { const t = [...${box(dayId)}.querySelectorAll('div')].find((e) => /\\d+:\\d\\d \\/ \\d+:\\d\\d/.test(e.textContent) && e.children.length === 0); return t ? Math.round(t.getBoundingClientRect().height) : null; })()`);
    check(`${mode}: the total stays on one line`, oneLine !== null && oneLine <= 24, String(oneLine));
  }

  await pass('light');

  const widths = await I.js(`(() => { const b = ${box(day(0))}; const kids = [...b.children].map((k) => Math.round(k.getBoundingClientRect().width)); const cs = getComputedStyle(b); return { box: Math.round(b.getBoundingClientRect().width), kids, pl: cs.paddingLeft, pr: cs.paddingRight, gap: cs.columnGap }; })()`);
  console.log('INFO day box children widths ' + JSON.stringify(widths));
  // ---- + focuses the field; Enter creates ----
  await I.js('document.activeElement && document.activeElement.blur()');
  await I.click(`document.querySelector('[data-add-plus="left"]')`, 300);
  check('clicking the + focuses the title field', (await I.activeLabel()) === 'Capture a thought', String(await I.activeLabel()));
  await I.type('Made with plus');
  await I.enter();
  await C.waitFor(async () => titles().includes('Made with plus'), 5000).catch(() => {});
  check('Enter creates the task', titles().includes('Made with plus'), JSON.stringify(titles()));
  check('and the field is empty and still focused for the next one', (await I.js(`document.activeElement && document.activeElement.value === '' && document.activeElement.getAttribute('aria-label') === 'Capture a thought'`)) === true);

  // ---- the details icon ----
  const before = titles().length;
  await I.click(`${box('left')}.querySelector('[data-ctl="addDetails"]')`, 400);
  check('details icon with no title: nothing is created', titles().length === before, `${before} -> ${titles().length}`);
  check('it says to type a name first and focuses the field', ((await I.js('document.body.innerText')) || '').includes('Type a name first, then open the details.') && (await I.activeLabel()) === 'Capture a thought');
  await I.type('Opened with details');
  check('typing clears that note', !(((await I.js('document.body.innerText')) || '').includes('Type a name first')));
  await I.click(`${box('left')}.querySelector('[data-ctl="addDetails"]')`, 900);
  await C.waitFor(async () => titles().includes('Opened with details'), 5000).catch(() => {});
  check('details icon with a title creates the task', titles().includes('Opened with details'), JSON.stringify(titles()));
  await C.waitFor(() => I.exists(`document.querySelector('[data-detail-panel]')`), 5000).catch(() => {});
  const ft = await I.js(`(() => { const a = document.activeElement; return { open: !!document.querySelector('[data-detail-panel]'), label: a && a.getAttribute('aria-label'), value: a && a.value }; })()`);
  check('its details open with the title focused', ft.open && ft.label === 'Title' && ft.value === 'Opened with details', JSON.stringify(ft));
  await I.shot('p34-details-opened');
  await I.key('Escape', [], 500);

  // ---- a day column: typing shows the time and estimate pickers; the buttons work ----
  await I.click(`${box(day(0))}.querySelector('[data-add-plus]')`, 300);
  await I.type('x');
  const pickers = await I.js(`(() => { const b = ${box(day(0))}; return { time: !!b.querySelector('input[type="time"]'), estimate: !!b.querySelector('[data-duration-select]'), label: !!b.querySelector('[data-ctl="addLabel"]'), details: !!b.querySelector('[data-ctl="addDetails"]') }; })()`);
  check('typing in a day column keeps the label, the time and the estimate pickers (the details icon gives way)', pickers.time && pickers.label && pickers.estimate && !pickers.details, JSON.stringify(pickers));
  await I.js(`document.activeElement.select()`);
  await I.key('Backspace', [], 200);

  // ---- Dark ----
  const icon = (await I.exists(I.byLabel('Profile and account'))) ? 'Profile and account' : 'Profile, not signed in';
  await I.click(I.byLabel(icon));
  await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 700);
  await I.waitBody('POWER FEATURES', 8000);
  await I.click(`document.querySelector('[data-theme-setting] [data-theme-mode="dark"]')`, 900);
  await I.click(I.byLabel('Back'), 900);
  await I.click(I.byLabel('Show Tasks'), 800).catch(() => {});
  await C.sleep(600);
  await pass('dark');

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
