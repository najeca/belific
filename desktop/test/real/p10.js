'use strict';
// Real check for the 2.27.0 fix batch: real mouse, key and text input into the
// real app, on an isolated data folder asserted NOT to be the real one; Supabase
// is the in process fake (signed out, nothing leaves the machine). One section
// per item of the batch.
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
  const today = day(0);
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      T('t1', 'Today task', { dueDate: today, durationMinutes: 30, projectKey: 'pw' }),
      T('nosteps', 'No steps here', { dueDate: today }),
      T('st', 'Steps task', { dueDate: today, subtasks: [{ id: 's1', title: 'First', done: true }, { id: 's2', title: 'Second', done: false }] }),
      T('cb', 'Cal block', { dueDate: today, startTime: '10:00', durationMinutes: 30 }),
      T('later', 'Later task', { dueDate: day(2) }),
      T('gym', 'Gym', { dueDate: day(-6), recurrence: 'daily' }),
      T('bd', 'Brain one'),
    ]),
  );
  fs.writeFileSync(
    path.join(dataDir, 'belific_projects.kv'),
    JSON.stringify([{ key: 'pw', name: 'Work', colorKey: 'sage', createdAt: stamp, updatedAt: stamp }]),
  );

  const read = readKv(dataDir);
  const tasks = () => read('belific_tasks') || [];
  const byId = (id) => tasks().find((t) => t.id === id);
  const byTitle = (title) => tasks().find((t) => t.title === title && !t.deletedAt);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1440, 900);
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await I.waitBody('Today task', 20000);
  await C.sleep(1000);

  const col = (key) => `document.querySelector('[data-day-col="${key}"]')`;
  const card = (key, title) => `document.querySelector('[data-day-col="${key}"] [aria-label^="Task ${title}"]')`;
  const modalOpen = () => I.exists(I.dialog('Task details'));
  const modalTitle = () => I.js(`(${I.dialog('Task details')} && ${I.dialog('Task details')}.querySelector('[aria-label="Title"]') || {}).value || ''`);
  const closeModal = async () => {
    await I.key('Escape');
    await C.waitFor(async () => !(await modalOpen()), 3000).catch(() => {});
  };
  // Moves the pointer onto a card until its hover icons really show (an injected
  // move is sometimes not seen as a hover on the first try).
  const hoverIcons = async (expr) => {
    for (let i = 0; i < 10; i++) {
      await I.hover(expr, 200);
      if ((await I.js(`getComputedStyle(${expr}.querySelector('[data-card-controls]')).opacity`)) === '1') return true;
      win.webContents.sendInputEvent({ type: 'mouseMove', x: 2, y: 2 });
      await C.sleep(150);
    }
    return false;
  };

  // ======== 1. The card, the add box and the modal ========
  // Clicking the card body opens the modal; the card never expands.
  const h0 = await I.js(`${card(today, 'Today task')}.getBoundingClientRect().height`);
  await I.click(`${card(today, 'Today task')}.querySelector('[aria-label="Title Today task"]')`, 600);
  check('1: a click on a card opens the details modal', (await modalOpen()) && (await modalTitle()) === 'Today task');
  await closeModal();
  const h1 = await I.js(`${card(today, 'Today task')}.getBoundingClientRect().height`);
  check('1: the card did not expand in place (same height)', Math.abs(h0 - h1) < 1, `${h0} ${h1}`);
  check('1: the card has no inline row of controls (no notes box, no estimate dropdown)', !(await I.exists(`${card(today, 'Today task')}.querySelector('[aria-label^="Notes for"], [data-ctl="duration"], [data-ctl="timer"]')`)));
  check('1: no subtask counter on a card without subtasks', !/\d\/\d/.test(await I.textOf(card(today, 'No steps here'))), await I.textOf(card(today, 'No steps here')));
  check('1: a card with subtasks shows the ring and 1/2', (await I.textOf(card(today, 'Steps task'))).includes('1/2') && (await I.exists(`${card(today, 'Steps task')}.querySelector('[data-steps-ring="part"]')`)));
  // Hover: at most three icons, Label first.
  await hoverIcons(card(today, 'Today task'));
  const icons = await I.js(`[...${card(today, 'Today task')}.querySelectorAll('[data-card-controls] [role="button"]')].map((b) => b.getAttribute('aria-label'))`);
  check('1: on hover at most three icons: Label first, Move to today, the menu', icons.length <= 3 && /^Label|^Select label/.test(icons[0]) && icons[icons.length - 1].startsWith('More actions'), JSON.stringify(icons));
  const ctlOpacity = await I.js(`getComputedStyle(${card(today, 'Today task')}.querySelector('[data-card-controls]')).opacity`);
  check('1: the icons show on hover', ctlOpacity === '1', ctlOpacity);
  // The ring ticks a step and does not open the modal.
  await I.click(`${card(today, 'Steps task')}.querySelector('[data-ctl="steps"]')`, 600);
  await C.waitFor(() => (byId('st').subtasks || []).every((s) => s.done), 4000).catch(() => {});
  check('1: the steps ring ticks the next step and does not open the modal', (byId('st').subtasks || []).every((s) => s.done) && !(await modalOpen()));
  // The tick box completes and does not open the modal.
  await I.click(`${card(today, 'No steps here')}.querySelector('[aria-label="Mark No steps here complete"]')`, 600);
  await C.waitFor(() => byId('nosteps').completed === true, 4000).catch(() => {});
  check('1: the tick box completes the task and does not open the modal', byId('nosteps').completed === true && !(await modalOpen()));
  // Move to today from the hover icon.
  await C.sleep(300);
  await I.click(`document.querySelector('[aria-label="Show today in Tasks"]')`).catch(() => {});
  await hoverIcons(card(day(2), 'Later task'));
  await I.click(`${card(day(2), 'Later task')}.querySelector('[data-ctl="today"]')`, 600);
  if (await modalOpen()) await closeModal();
  await C.waitFor(() => byId('later').dueDate === today, 4000).catch(() => {});
  check('1: Move to today on hover moves the task to today', byId('later').dueDate === today);

  // The add box: title, time and Label; the Label button shows straight away and is inside the box.
  const box = `document.querySelector('[data-add-box="${day(1)}"]')`;
  const inBox = await I.js(`(() => { const b = ${box}.getBoundingClientRect(); const l = ${box}.querySelector('[data-ctl="addLabel"]').getBoundingClientRect(); return l.width > 0 && l.right <= b.right + 0.5 && l.left >= b.left; })()`);
  check('1: the Add a task box shows the Label button inside it, not cut off', inBox);
  await I.click(I.byLabel(`Add a task on ${day(1)}`));
  await I.type('Fresh one');
  const withTime = await I.js(`(() => { const b = ${box}.getBoundingClientRect(); const t = ${box}.querySelector('input[type="time"]'); const l = ${box}.querySelector('[data-ctl="addLabel"]').getBoundingClientRect(); return !!t && t.getBoundingClientRect().right <= b.right && l.right <= b.right + 0.5 && l.width > 0; })()`);
  check('1: while typing, the time field shows and the Label button stays fully visible', withTime);
  await I.click(`${box}.querySelector('[data-ctl="addLabel"]')`, 500);
  await I.click(I.byLabel('Work'), 500);
  await I.click(I.byLabel(`Add a task on ${day(1)}`), 200);
  await I.js(`(() => { const t = ${box}.querySelector('input[type="time"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(t, '09:30'); t.dispatchEvent(new Event('input', { bubbles: true })); t.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await I.click(I.byLabel(`Add a task on ${day(1)}`), 200);
  await I.enter();
  await C.waitFor(() => !!byTitle('Fresh one'), 5000).catch(() => {});
  const fresh = byTitle('Fresh one');
  check('1: the new task has its day, time and label from the box', fresh && fresh.dueDate === day(1) && fresh.startTime === '09:30' && fresh.projectKey === 'pw', JSON.stringify(fresh));
  // The brand new task opens its modal straight away.
  await C.waitFor(() => I.exists(card(day(1), 'Fresh one')), 4000).catch(() => {});
  await I.click(`${card(day(1), 'Fresh one')}.querySelector('[aria-label="Title Fresh one"]')`, 600);
  check('1: a brand new task opens its details straight away', (await modalOpen()) && (await modalTitle()) === 'Fresh one');
  // The modal holds what left the card: time of day, reminder, steps.
  check('1: the modal has the time of day, the reminder and an add subtask field', (await I.exists(`${I.dialog('Task details')}.querySelector('input[type="time"]')`)) && (await I.exists(`${I.dialog('Task details')}.querySelector('[aria-label^="Reminder:"]')`)) && (await I.exists(`${I.dialog('Task details')}.querySelector('[aria-label="Add subtask to Fresh one"]')`)));
  await I.click(`${I.dialog('Task details')}.querySelector('[aria-label="Add subtask to Fresh one"]')`, 200);
  await I.type('Step A');
  await I.enter();
  await C.waitFor(() => (byTitle('Fresh one').subtasks || []).length === 1, 4000).catch(() => {});
  check('1: a subtask is added in the modal', (byTitle('Fresh one').subtasks || [])[0]?.title === 'Step A');
  await closeModal();
  await I.shot('p10-01-cards');

  // The left list and the Timebox open the same modal; Enter on a focused card too.
  await I.click(`document.querySelector('[aria-label="Task Brain one"] [aria-label="Title Brain one"]')`, 600);
  check('1: a card in the left list opens the modal', (await modalTitle()) === 'Brain one');
  await closeModal();
  await I.click(`document.querySelector('[data-block-id="cb"]')`, 600);
  check('1: a Timebox block opens the modal', (await modalTitle()) === 'Cal block');
  await closeModal();
  await I.js(`${card(today, 'Today task')}.focus()`);
  await I.enter();
  await C.sleep(400);
  check('1: Enter on a focused card opens the modal', (await modalTitle()) === 'Today task');
  await closeModal();
  // A repeating day that is only shown (not stored) opens too, and writes nothing.
  const before = tasks().length;
  await I.click(`${card(day(1), 'Gym')}.querySelector('[aria-label="Title Gym"]')`, 600);
  check('1: a repeating day opens the modal (series edits) and opening writes nothing', (await modalTitle()) === 'Gym' && tasks().length === before && (await I.body()).includes('Repeating: changes apply to every day'));
  await closeModal();

  // ======== 2. Label colours: vibrant swatches and the colour wheel ========
  const projects = () => read('belific_projects') || [];
  const labelNamed = (n) => projects().find((p) => p.name === n && !p.deletedAt);
  const openLabelMenu = async (title) => {
    await I.js(`${card(today, title)}.focus()`);
    await C.sleep(150);
    await I.key('L', ['control']);
    await C.waitFor(() => I.exists(I.byLabel('New label')), 4000).catch(() => {});
  };
  await openLabelMenu('No steps here');
  await I.click(I.byLabel('New label'), 300);
  const names = await I.js(`[...document.querySelectorAll('[data-new-label-form] [data-swatch]')].map((s) => s.getAttribute('aria-label').replace(' colour for the new label', ''))`);
  check('2: the swatches are the original eight, then red, orange, yellow, lime, green, teal, cyan, blue, indigo, purple, magenta, pink, then the wheel', JSON.stringify(names) === JSON.stringify(['Sage', 'Clay', 'Sky', 'Sand', 'Plum', 'Moss', 'Rose', 'Slate', 'Red', 'Orange', 'Yellow', 'Lime', 'Green', 'Teal', 'Cyan', 'Blue', 'Indigo', 'Purple', 'Magenta', 'Pink', 'Any colour for the new label']), JSON.stringify(names));
  check('2: the new colours need "Every computer runs Belific 2.27 or later"', (await I.exists(I.byLabel('Every computer runs Belific 2.27 or later'))) && (await I.js(`document.querySelector('[data-swatch="wheel"]').getAttribute('aria-disabled')`)) === 'true');
  await I.click(I.byLabel('Every computer runs Belific 2.27 or later'), 300);
  await I.click(`document.querySelector('[data-new-label-form] [data-swatch="wheel"]')`, 300);
  check('2: the wheel opens with a hue, a shade and a hex field', (await I.exists(I.byLabel('Hue for the new label'))) && (await I.exists(I.byLabel('Shade for the new label'))) && (await I.exists(I.byLabel('Hex colour for the new label'))));
  await I.click(I.byLabel('Hex colour for the new label'), 150);
  await I.js('document.activeElement.select()');
  await I.type('#7a3fd0');
  await I.click(I.byLabel('Use this colour for the new label'), 300);
  await I.click(I.byLabel('New label name'), 100);
  await I.type('Violet thing');
  await I.click(I.byLabel('Create the new label'), 600);
  await C.waitFor(() => !!labelNamed('Violet thing'), 5000).catch(() => {});
  const vt = labelNamed('Violet thing');
  check('2: a wheel colour is stored as a hex value in the label colour field', !!vt && vt.colorKey === '#7A3FD0', JSON.stringify(vt));
  await C.sleep(400);
  const vtEdge = await I.js(`getComputedStyle(${card(today, 'No steps here')}).borderLeftColor`);
  check('2: the card draws it (edge in the colour, a light tint)', vtEdge === 'rgb(122, 63, 208)', vtEdge);
  await I.shot('p10-02-colours');

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
