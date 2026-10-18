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
      T('ls1', 'Buy stamps', { listKey: 'le', dueDate: day(3), startTime: '14:00', durationMinutes: 15 }),
      T('ls2', 'Call bank', { listKey: 'le' }),
      T('late1', 'Late one', { dueDate: today, startTime: '00:00', durationMinutes: 15 }),
      T('a1', 'Trip prep', { dueDate: day(2) }),
      T('a2', 'Trip call', { dueDate: day(2), startTime: '15:00' }),
      T('a3', 'Trip done', { dueDate: day(2), completed: true, completedAt: stamp }),
      T('om', 'Old must', { dueDate: day(-3), priority: 'high' }),
      T('o1', 'Old one', { dueDate: day(-2) }),
      T('o2', 'Old two', { dueDate: day(-1), startTime: '08:00' }),
      T('o3', 'Old three', { dueDate: day(-1) }),
      T('o4', 'Old four', { dueDate: day(-1), startTime: '09:00' }),
    ]),
  );
  fs.writeFileSync(
    path.join(dataDir, 'belific_projects.kv'),
    // Work and Home already share Sage (item 3: left alone, with a notice).
    JSON.stringify([
      { key: 'pw', name: 'Work', colorKey: 'sage', createdAt: stamp, updatedAt: stamp },
      { key: 'ph', name: 'Home', colorKey: 'sage', createdAt: stamp, updatedAt: stamp },
    ]),
  );

  fs.writeFileSync(path.join(dataDir, 'belific_lists.kv'), JSON.stringify([{ key: 'le', name: 'Errands', sortOrder: 0, createdAt: stamp, updatedAt: stamp }]));

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
  await openLabelMenu('Later task');
  await I.click(I.byLabel('New label'), 300);
  const names = await I.js(`[...document.querySelectorAll('[data-new-label-form] [data-swatch]')].map((s) => s.getAttribute('aria-label').replace(' colour for the new label', '').replace(/, used by .*$/, ''))`);
  check('2: the swatches are the original eight, then red, orange, yellow, lime, green, teal, cyan, blue, indigo, purple, magenta, pink, then the wheel', JSON.stringify(names) === JSON.stringify(['Sage', 'Clay', 'Sky', 'Sand', 'Plum', 'Moss', 'Rose', 'Slate', 'Red', 'Orange', 'Yellow', 'Lime', 'Green', 'Teal', 'Cyan', 'Blue', 'Indigo', 'Purple', 'Magenta', 'Pink', 'Any']), JSON.stringify(names));
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
  const vtEdge = await I.js(`getComputedStyle(${card(today, 'Later task')}).borderLeftColor`);
  check('2: the card draws it (edge in the colour, a light tint)', vtEdge === 'rgb(122, 63, 208)', vtEdge);
  await I.shot('p10-02-colours');

  // ======== 3. No two labels with the same colour ========
  await openLabelMenu('Today task');
  await I.click(I.byLabel('New label'), 300);
  const sw = (key) => `document.querySelector('[data-new-label-form] [data-swatch="${key}"]')`;
  const sageTaken = await I.js(`(() => { const s = ${sw('sage')}; return s ? [s.getAttribute('data-taken'), s.getAttribute('aria-disabled'), getComputedStyle(s).opacity, !!s.querySelector('div div')] : null; })()`);
  check('3: a taken colour is dimmed, marked and says which label has it', !!sageTaken && sageTaken[0] === 'Work' && sageTaken[1] === 'true' && Number(sageTaken[2]) < 0.5 && sageTaken[3], JSON.stringify(sageTaken));
  check('3: a free colour is not marked', (await I.js(`${sw('clay')}.getAttribute('data-taken')`)) === null);
  const formColour = async () => I.js(`[...document.querySelectorAll('[data-new-label-form] [data-swatch]')].filter((s) => s.getAttribute('aria-selected') === 'true').map((s) => s.getAttribute('data-swatch')).join(',')`);
  const pickedBefore = await formColour();
  await I.click(sw('sage'), 300);
  check('3: a taken colour cannot be picked', (await formColour()) === pickedBefore && pickedBefore !== 'sage', pickedBefore);
  await I.click(sw('wheel'), 300);
  await I.click(I.byLabel('Hex colour for the new label'), 150);
  await I.js('document.activeElement.select()');
  await I.type('#7b41d0');
  await C.sleep(200);
  const clashName = await I.js(`document.querySelector('[data-color-clash]')?.getAttribute('data-color-clash') ?? null`);
  const useOff = await I.js(`document.querySelector('[aria-label="Use this colour for the new label"]').getAttribute('aria-disabled')`);
  check('3: the wheel refuses a colour too close to another label and names it', clashName === 'Violet thing' && useOff === 'true' && (await I.body()).includes('Too close to the colour of “Violet thing”'), JSON.stringify([clashName, useOff]));
  await I.key('Escape');
  await C.sleep(300);
  if (await I.exists(I.byLabel('Edit labels'))) await I.key('Escape');
  await openLabelMenu('Today task');
  await I.click(I.byLabel('Edit labels'), 600);
  await C.waitFor(() => I.exists('document.querySelector(\'[data-shared-colors]\')'), 4000).catch(() => {});
  const notice = await I.js(`document.querySelector('[data-shared-colors]')?.innerText ?? ''`);
  check('3: the Labels page names the labels that already share a colour, and leaves them alone', notice.includes('Work and Home share a colour') && labelNamed('Work').colorKey === 'sage' && labelNamed('Home').colorKey === 'sage', notice);
  await I.shot('p10-03-taken');
  await I.key('Escape');
  await C.sleep(300);

  // ======== 4. A list keeps its scheduled tasks ========
  await I.click(I.byLabel('List: Brain Dump. Change list'), 400);
  const errandsRow = await I.js(`document.querySelector('[aria-label="Show list Errands"]')?.innerText ?? ''`);
  check('4: the list count includes the scheduled task', /\b2\b/.test(errandsRow), errandsRow);
  await I.click(I.byLabel('Show list Errands'), 500);
  const leftCard = `document.querySelector('[aria-label="Task Buy stamps"]:not([data-day-col="${day(3)}"] *)')`;
  await C.waitFor(() => I.exists(leftCard), 4000).catch(() => {});
  const leftText = await I.js(`(() => { const c = ${leftCard}; return c && !c.closest('[data-day-col]') ? c.innerText : ''; })()`);
  const dayName = await I.js(`(() => { const [y, m, d] = '${day(3)}'.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); })()`);
  check('4: a scheduled task stays in its list, showing its day and time', leftText.includes('14:00') && leftText.includes(dayName), JSON.stringify([leftText, dayName]));
  check('4: the unscheduled task is in the list too, and comes first', await I.js(`(() => { const a = [...document.querySelectorAll('[aria-label^="Task "]')].filter((c) => !c.closest('[data-day-col]')).map((c) => c.getAttribute('aria-label')); return a.indexOf('Task Call bank') >= 0 && a.indexOf('Task Call bank') < a.indexOf('Task Buy stamps'); })()`));
  check('4: it is still on its day on the board', await I.exists(card(day(3), 'Buy stamps')));
  await I.shot('p10-04-list');
  await I.click(I.byLabel('List: Errands. Change list'), 400);
  await I.click(I.byLabel('Show Brain Dump'), 500);
  check('4: Brain Dump keeps its rule: a task with a day leaves it', !(await I.js(`[...document.querySelectorAll('[aria-label="Task Buy stamps"]')].some((c) => !c.closest('[data-day-col]'))`)));

  // ======== 6. The Missed list ========
  const missedBadge = () => I.js(`document.querySelector('[data-missed-button]')?.getAttribute('data-missed-button') ?? null`);
  check('6: nothing moved by itself on launch (missed tasks keep their days)', byId('o1').dueDate === day(-2) && byId('om').dueDate === day(-3) && byId('o4').dueDate === day(-1));
  // Five one off tasks, and the six days Gym (daily since six days ago) was due and not done.
  check('6: the Missed button in the left pane shows the count', (await missedBadge()) === '11', String(await missedBadge()));
  await I.click(`document.querySelector('[data-missed-button]')`, 600);
  const panel = (sel) => `document.querySelector('[role="dialog"][aria-label="Missed"] ${sel}')`;
  const rows = () => I.js(`[...document.querySelectorAll('[role="dialog"][aria-label="Missed"] [data-missed-row]')].map((r) => r.getAttribute('data-missed-row'))`);
  const r0 = await rows();
  check('6: the panel lists them all, Must do first', r0.length === 11 && r0[0] === 'om', JSON.stringify(r0));
  check('6: a missed task is not shown in today\'s column', !(await I.exists(card(today, 'Old one'))));
  check('6: one off tasks offer Today, Tomorrow, Pick a day and Drop; repeating days only Skip and Do it today', (await I.exists(panel('[aria-label="Move Old one to today"]'))) && (await I.exists(panel('[aria-label="Move Old one to tomorrow"]'))) && (await I.exists(panel('[aria-label="Pick a day for Old one"]'))) && (await I.exists(panel('[aria-label="Drop the day of Old one"]'))) && (await I.exists(panel('[aria-label="Do Gym today"]'))) && (await I.exists(panel('[aria-label^="Skip Gym on"]'))) && !(await I.exists(panel('[aria-label="Move Gym to today"]'))));
  await I.click(panel('[aria-label="Move Old one to today"]'), 600);
  await C.waitFor(() => byId('o1').dueDate === today, 4000).catch(() => {});
  check('6: Today moves the task to today', byId('o1').dueDate === today);
  await I.js(`(() => { const t = ${panel('[aria-label="Pick a day for Old must"]')}; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(t, '${day(4)}'); t.dispatchEvent(new Event('input', { bubbles: true })); t.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await C.waitFor(() => byId('om').dueDate === day(4), 4000).catch(() => {});
  check('6: Pick a day moves it to that day', byId('om').dueDate === day(4), JSON.stringify(byId('om')));
  await I.click(panel('[aria-label="Drop the day of Old four"]'), 600);
  await C.waitFor(() => !byId('o4').dueDate, 4000).catch(() => {});
  check('6: Drop clears the day and the time, the task stays', !byId('o4').dueDate && !byId('o4').startTime && !byId('o4').deletedAt, JSON.stringify(byId('o4')));
  await C.waitFor(() => I.exists(panel('[aria-label="Move all 2 to today"]')), 3000).catch(() => {});
  await I.click(panel('[aria-label="Move all 2 to today"]'), 800);
  await C.waitFor(() => byId('o2').dueDate === today && byId('o3').dueDate === today, 4000).catch(() => {});
  check('6: Move all to today moves the rest, keeping a time of day', byId('o2').dueDate === today && byId('o2').startTime === '08:00' && byId('o3').dueDate === today);
  const gymRows = () => tasks().filter((t) => t.id === 'gym' || t.id.startsWith('gym:'));
  // The days the panel still lists for Gym, and whether a Gym day was moved onto today.
  const missedDays = () => I.js(`[...document.querySelectorAll('[role="dialog"][aria-label="Missed"] [data-missed-row^="gym"]')].map((r) => r.getAttribute('data-missed-day'))`);
  const openGymToday = () => gymRows().some((t) => t.id !== 'gym' && !t.deletedAt && !t.completed && t.dueDate === today);
  await I.click(panel('[aria-label^="Skip Gym on"]'), 800);
  await C.waitFor(async () => !(await missedDays()).includes(day(-6)), 4000).catch(() => {});
  check('6: Skip writes the usual skip for that day (not moved)', !(await missedDays()).includes(day(-6)) && gymRows().some((t) => t.deletedAt) && !openGymToday(), JSON.stringify([await missedDays(), gymRows()]));
  const before6 = tasks().length;
  await I.click(panel('[aria-label="Do Gym today"]'), 800);
  await C.waitFor(() => tasks().some((t) => t.title === 'Gym' && t.id !== 'gym' && !t.id.startsWith('gym:') && t.dueDate === today), 4000).catch(() => {});
  await C.sleep(400);
  const copy = tasks().find((t) => t.title === 'Gym' && t.id !== 'gym' && !t.id.startsWith('gym:'));
  check('6: Do it today makes a one off task for today (no repeat), and that missed day is skipped', !!copy && copy.dueDate === today && !copy.recurrence && !(await missedDays()).includes(day(-5)) && !openGymToday() && tasks().length > before6, JSON.stringify(copy));
  await C.sleep(400);
  const r1 = await rows();
  check('6: what is left is the four other Gym days', r1.length === 4 && r1.every((id) => id === 'gym' || id.startsWith('gym:')), JSON.stringify(r1));
  await I.shot('p10-06-missed');
  await I.key('Escape');
  await C.sleep(500);
  check('6: the badge follows', (await missedBadge()) === '4', String(await missedBadge()));
  // Daily Planning shows the same list; its actions are a draft: Cancel writes nothing, Finish writes the skip.
  const inFlow = (label) => `document.querySelector('[data-flow] [aria-label=${JSON.stringify(label)}]')`;
  const openPlanning = async () => {
    await I.blur();
    await I.key('P', ['control', 'shift']);
    await C.waitFor(() => I.exists(`document.querySelector('[data-flow]')`), 4000).catch(() => {});
  };
  await openPlanning();
  const flowRows = await I.js(`document.querySelectorAll('[data-flow] [data-missed-row^="gym"]').length`);
  check('6: Daily Planning lists the same missed days, with the same actions', flowRows === 4 && (await I.exists(`document.querySelector('[data-flow] [aria-label^="Skip Gym on"]')`)), String(flowRows));
  const rawBefore = JSON.stringify(tasks());
  await I.click(`document.querySelector('[data-flow] [aria-label^="Skip Gym on"]')`, 400);
  check('6: in Planning a skip is a draft (the row goes, nothing written yet)', (await I.js(`document.querySelectorAll('[data-flow] [data-missed-row^="gym"]').length`)) === 3 && JSON.stringify(tasks()) === rawBefore);
  await I.click(inFlow('Cancel and change nothing'), 600);
  check('6: Cancel writes nothing', JSON.stringify(tasks()) === rawBefore && (await missedBadge()) === '4');
  await openPlanning();
  await I.click(`document.querySelector('[data-flow] [aria-label^="Skip Gym on"]')`, 400);
  for (let i = 0; i < 3; i++) await I.click(inFlow('Next step'), 400);
  await I.click(inFlow('Finish'), 1000);
  await C.waitFor(async () => (await missedBadge()) === '3', 5000).catch(() => {});
  check('6: Finish writes the skip (three Gym days left)', (await missedBadge()) === '3', String(await missedBadge()));

  // ======== 7. Late timed tasks ========
  // "Late one" was placed at 00:00 for 15 minutes today (late from 00:15 on).
  const lateBlock = `document.querySelector('[data-block-id="late1"]')`;
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  if (nowMin >= 16) {
    await C.waitFor(() => I.exists(`document.querySelector('[data-late-move="late1"]')`), 5000).catch(() => {});
    const lateState = await I.js(`(() => { const b = ${lateBlock}; return b ? [b.getAttribute('data-late'), getComputedStyle(b).opacity] : null; })()`);
    check('7: a placed task whose time has passed, not done, is faded', !!lateState && lateState[0] === '1' && Number(lateState[1]) <= 0.6, JSON.stringify(lateState));
    const moveLabel = await I.js(`document.querySelector('[data-late-move="late1"]')?.getAttribute('aria-label') ?? ''`);
    const toSlot = moveLabel.startsWith('Move to next free slot today');
    check('7: it offers Move to next free slot today (or Tomorrow when today is full)', toSlot || moveLabel.startsWith('No free slot left today: move to tomorrow'), moveLabel);
    check('7: nothing moved by itself', byId('late1').dueDate === today && byId('late1').startTime === '00:00');
    await I.click(`document.querySelector('[data-late-move="late1"]')`, 800);
    await C.waitFor(() => byId('late1').startTime !== '00:00' || byId('late1').dueDate !== today, 4000).catch(() => {});
    const moved = byId('late1');
    const [mh, mm] = (moved.startTime || '0:0').split(':').map(Number);
    const busyClash = tasks().some((t) => t.id !== 'late1' && !t.deletedAt && t.dueDate === moved.dueDate && t.startTime && (() => { const [h, m] = t.startTime.split(':').map(Number); const s = h * 60 + m; const e = s + (t.durationMinutes || 30); return mh * 60 + mm < e && s < mh * 60 + mm + 15; })());
    check('7: the move lands on a free half hour from now, or tomorrow at the same time', toSlot ? moved.dueDate === today && (mh * 60 + mm) % 30 === 0 && mh * 60 + mm >= nowMin && !busyClash : moved.dueDate === day(1) && moved.startTime === '00:00', JSON.stringify(moved));
    await C.sleep(500);
    check('7: once moved it is no longer late', !(await I.js(`${lateBlock}?.getAttribute('data-late') === '1'`)));
    await I.shot('p10-07-late');
  } else {
    console.log('SKIP 7: it is before 00:16, so the seeded block is not late yet');
  }

  // ======== 8. Away days ========
  const settings = () => read('belific_user_settings') || [];
  const awayRow = (k) => settings().find((s) => s.key === `away.${k}`);
  const dayMenu = (k) => `document.querySelector('[data-day-menu="${k}"]')`;
  const menuRow = (label) => `document.querySelector('[role="dialog"] [aria-label=${JSON.stringify(label)}]') || document.querySelector('[aria-label=${JSON.stringify(label)}][role="button"]')`;
  await I.click(`document.querySelector('[aria-label="Show today in Tasks"]')`).catch(() => {});
  await C.sleep(400);
  await I.click(dayMenu(day(2)), 400);
  const markText = await I.js(`[...document.querySelectorAll('[role="button"]')].find((b) => (b.getAttribute('aria-label') || '').startsWith('Mark ') && b.getAttribute('aria-label').endsWith(' as away'))?.innerText ?? ''`);
  check('8: the day header menu offers Mark as away, saying how many tasks are on the day', markText.includes('Mark as away') && markText.includes('2 tasks on this day'), markText);
  await I.click(`[...document.querySelectorAll('[role="button"]')].find((b) => (b.getAttribute('aria-label') || '').endsWith(' as away'))`, 400);
  check('8: a day with tasks asks first: next free day, spread, or leave them', (await I.exists(menuRow('Move them to the next free day'))) && (await I.exists(menuRow('Spread them across the next days'))) && (await I.exists(menuRow('Leave them here'))) && !awayRow(day(2)));
  await I.click(menuRow('Spread them across the next days'), 800);
  await C.waitFor(() => byId('a1').dueDate !== day(2), 4000).catch(() => {});
  check('8: the day is stored as away in a settings row (existing storage)', awayRow(day(2))?.value === '1', JSON.stringify(awayRow(day(2))));
  check('8: spread: one a day in board order, the time of day kept, a done task left alone', byId('a1').dueDate === day(3) && byId('a2').dueDate === day(4) && byId('a2').startTime === '15:00' && byId('a3').dueDate === day(2), JSON.stringify([byId('a1'), byId('a2'), byId('a3')]));
  await C.sleep(300);
  const awayCol = await I.js(`(() => { const c = ${col(day(2))}; return c ? [c.getAttribute('data-away'), getComputedStyle(c).backgroundColor, c.innerText.includes('Away')] : null; })()`);
  check('8: the day is greyed on the board, with an Away tag', !!awayCol && awayCol[0] === '1' && awayCol[1] !== 'rgba(0, 0, 0, 0)' && awayCol[2], JSON.stringify(awayCol));
  check('8: an undo is offered straight after', (await I.exists(`document.querySelector('[data-undo-bar]')`)) && (await I.textOf(`document.querySelector('[data-undo-bar]')`)).includes('Moved 2 tasks'));
  await I.click(`document.querySelector('[data-undo-bar] [aria-label="Undo"]')`, 800);
  await C.waitFor(() => byId('a1').dueDate === day(2) && byId('a2').dueDate === day(2), 4000).catch(() => {});
  check('8: Undo puts them back (the day stays away)', byId('a1').dueDate === day(2) && byId('a2').dueDate === day(2) && byId('a2').startTime === '15:00' && awayRow(day(2))?.value === '1');
  const warnText = await I.textOf(col(day(2)));
  check('8: adding to an away day warns', warnText.includes('This is an away day. The task is added anyway.'), warnText.slice(0, 200));
  await I.click(I.byLabel(`Add a task on ${day(2)}`), 200);
  await I.type('Packed lunch');
  await I.enter();
  await C.waitFor(() => !!byTitle('Packed lunch'), 4000).catch(() => {});
  check('8: but allows it', byTitle('Packed lunch')?.dueDate === day(2));
  await I.shot('p10-08-away');
  await I.click(I.byLabel('Show the Calendar'), 1200);
  await C.waitFor(() => I.exists(`document.querySelector('[data-cal-head="${day(2)}"]')`), 5000).catch(() => {});
  check('8: greyed in the Calendar too', (await I.js(`document.querySelector('[data-cal-head="${day(2)}"]')?.getAttribute('data-away') ?? null`)) === '1' && (await I.js(`document.querySelector('[data-cal-head="${day(1)}"]')?.getAttribute('data-away') ?? null`)) === null);
  await I.click(I.byLabel('Show Tasks'), 1000);
  // Tomorrow away: Daily Planning says so.
  await I.click(dayMenu(day(1)), 400);
  await I.click(`[...document.querySelectorAll('[role="button"]')].find((b) => (b.getAttribute('aria-label') || '').endsWith(' as away'))`, 400);
  if (await I.exists(menuRow('Leave them here'))) await I.click(menuRow('Leave them here'), 600);
  await C.waitFor(() => awayRow(day(1))?.value === '1', 4000).catch(() => {});
  check('8: Leave them here marks the day and moves nothing', awayRow(day(1))?.value === '1' && byTitle('Fresh one')?.dueDate === day(1));
  await openPlanning();
  check('8: Daily Planning shows the away day', (await I.js(`document.querySelector('[data-flow-away]')?.innerText ?? ''`)).includes('Tomorrow is an away day'));
  await I.click(inFlow('Cancel and change nothing'), 600);
  await I.click(dayMenu(day(1)), 400);
  await I.click(`[...document.querySelectorAll('[role="button"]')].find((b) => (b.getAttribute('aria-label') || '').startsWith('Not away on'))`, 600);
  await C.waitFor(() => awayRow(day(1))?.value === '0', 4000).catch(() => {});
  check('8: Not away any more writes the row back to 0 (not a tombstone, so it can be marked again)', awayRow(day(1))?.value === '0' && !awayRow(day(1))?.deletedAt && (await I.js(`${col(day(1))}.getAttribute('data-away')`)) === null);

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
