'use strict';
// Real check for the 2.27.1 fix batch: real mouse, key and text input into the
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
      T('t1', 'Modal task', { dueDate: today, durationMinutes: 30, projectKey: 'pw', listKey: 'lg', notes: 'A note', subtasks: [{ id: 's1', title: 'First', done: false }, { id: 's2', title: 'Second', done: true }] }),
      T('t2', 'Plain task', { dueDate: today }),
      T('t3', 'Placed task', { dueDate: today, startTime: '10:00', durationMinutes: 60, projectKey: 'pw', listKey: 'lg' }),
      T('t4', 'No emoji list', { dueDate: today, listKey: 'ln', projectKey: 'ph' }),
      T('t5', 'Brain item', { listKey: 'lg', projectKey: 'pw' }),
    ]),
  );
  // Nine labels: every one of the original eight is taken (item 4's case).
  const P = (key, name, colorKey, extra = {}) => ({ key, name, colorKey, createdAt: stamp, updatedAt: stamp, ...extra });
  fs.writeFileSync(
    path.join(dataDir, 'belific_projects.kv'),
    JSON.stringify([
      P('pw', 'Work', 'sage', { emoji: '💼' }),
      P('ph', 'Home', 'clay'),
      P('p3', 'Sky one', 'sky'),
      P('p4', 'Sand one', 'sand'),
      P('p5', 'Plum one', 'plum'),
      P('p6', 'Moss one', 'moss'),
      P('p7', 'Rose one', 'rose'),
      P('p8', 'Slate one', 'slate'),
      P('p9', 'Old teal', 'teal'),
    ]),
  );
  fs.writeFileSync(
    path.join(dataDir, 'belific_lists.kv'),
    JSON.stringify([
      { key: 'lg', name: 'Games', emoji: '🎲', sortOrder: 0, createdAt: stamp, updatedAt: stamp },
      { key: 'ln', name: 'Plain list', sortOrder: 1, createdAt: stamp, updatedAt: stamp },
    ]),
  );

  const read = readKv(dataDir);
  const tasks = () => read('belific_tasks') || [];
  const byId = (id) => tasks().find((t) => t.id === id);
  const projects = () => read('belific_projects') || [];
  const labelNamed = (n) => projects().find((p) => p.name === n && !p.deletedAt);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1440, 900);
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await I.waitBody('Modal task', 20000);
  // 2.28.0: the app opens on the Calendar; these checks start on the Tasks view.
  await I.click(`document.querySelector('[aria-label="Show Tasks"]')`, 600);
  await C.sleep(1000);

  const card = (key, title) => `document.querySelector('[data-day-col="${key}"] [aria-label^="Task ${title}"]')`;
  const panel = `document.querySelector('[data-detail-panel]')`;
  const modalOpen = () => I.exists(panel);
  const openModal = async (title) => {
    await I.click(`${card(today, title)}.querySelector('[aria-label="Title ${title}"]')`, 600);
    await C.waitFor(() => modalOpen(), 4000).catch(() => {});
  };
  const closeModal = async () => {
    await I.blur();
    await I.key('Escape');
    await C.waitFor(async () => !(await modalOpen()), 3000).catch(() => {});
  };

  // ======== 1. A compact details modal, no lines ========
  await openModal('Modal task');
  const rows = await I.js(`[...${panel}.querySelectorAll('[data-detail-row]')].map((r) => { const s = getComputedStyle(r); const b = r.getBoundingClientRect(); return { name: r.dataset.detailRow, h: Math.round(b.height), lines: parseFloat(s.borderTopWidth) + parseFloat(s.borderBottomWidth) }; })`);
  check('1: the rows keep their order', rows.slice(0, 6).map((r) => r.name).join('|') === 'Task date|Estimated time|Actual time|Label|Must do|Repeats', JSON.stringify(rows.map((r) => r.name)));
  check('1: every row is one compact line (at most 36 px)', rows.length >= 7 && rows.every((r) => r.h <= 36), JSON.stringify(rows));
  check('1: no row has a divider line', rows.every((r) => r.lines === 0), JSON.stringify(rows));
  const lined = await I.js(`[...${panel}.querySelectorAll('*')].filter((e) => { if (e.tagName === 'INPUT' || e.tagName === 'SELECT' || e.tagName === 'TEXTAREA') return false; const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return r.width > 120 && ((parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none' && s.borderTopColor !== 'rgba(0, 0, 0, 0)') || (parseFloat(s.borderBottomWidth) > 0 && s.borderBottomStyle !== 'none' && s.borderBottomColor !== 'rgba(0, 0, 0, 0)')); }).length`);
  check('1: nothing wide in the modal draws a line', lined === 0, String(lined));
  const label = await I.js(`(() => { const r = ${panel}.querySelector('[data-detail-row="Label"]'); const n = r.firstElementChild.getBoundingClientRect(); const v = r.lastElementChild.getBoundingClientRect(); return { sameLine: Math.abs((n.top + n.height / 2) - (v.top + v.height / 2)) < 6, nameLeft: n.right <= v.left }; })()`);
  check('1: the name is on the left and the value on the right, on the same line', label.sameLine && label.nameLeft, JSON.stringify(label));
  const tall = await I.js(`Math.round(${panel}.getBoundingClientRect().height)`);
  check('1: the whole modal is short (under 640 px with notes and two subtasks)', tall < 640, String(tall));
  await I.shot('p11-01-modal');
  await closeModal();
  // A card has no line inside it (only the label's colour edge on the left).
  const cardLines = await I.js(`(() => { const c = ${card(today, 'Modal task')}; const all = [c, ...c.querySelectorAll('*')]; return all.filter((e) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return r.width > 60 && ['Top', 'Bottom', 'Right'].some((k) => parseFloat(s['border' + k + 'Width']) > 0 && s['border' + k + 'Style'] !== 'none'); }).length; })()`);
  check('1: a card has no lines separating its parts', cardLines === 0, String(cardLines));
  // A short window: nothing is cut off, the modal scrolls inside itself.
  win.setSize(1100, 480);
  await C.sleep(600);
  await openModal('Modal task');
  const fit = await I.js(`(() => { const p = ${panel}; const r = p.getBoundingClientRect(); const sc = [...p.querySelectorAll('div')].find((d) => d.scrollHeight > d.clientHeight + 4 && getComputedStyle(d).overflowY !== 'visible'); return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, scrolls: !!sc }; })()`);
  check('1: in a short window the modal fits and scrolls inside itself', fit.top >= 0 && fit.bottom <= fit.vh && fit.scrolls, JSON.stringify(fit));
  await I.js(`(() => { const p = ${panel}; const sc = [...p.querySelectorAll('div')].find((d) => d.scrollHeight > d.clientHeight + 4 && getComputedStyle(d).overflowY !== 'visible'); if (sc) sc.scrollTop = sc.scrollHeight; })()`);
  await C.sleep(300);
  const lastSeen = await I.js(`(() => { const el = ${panel}.querySelector('[aria-label="Add subtask to Modal task"]'); const r = el.getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0; })()`);
  check('1: the last field (Add subtask) can be scrolled into view', lastSeen);
  await closeModal();
  win.setSize(1440, 900);
  await C.sleep(600);

  // ======== 2. The time drop-downs ========
  const pop = (name) => `document.querySelector('[data-popover][aria-label=${JSON.stringify(name)}]')`;
  const dd = (name) => `${panel}.querySelector('[data-duration-select="${name}"]')`;
  const ddText = (expr) => I.js(`(${expr}).querySelector('[data-duration-value]').textContent.trim()`);
  await openModal('Plain task');
  check('2: Estimated and Actual time are small drop-downs (no chips, no typing boxes)', (await I.exists(dd('Estimated time'))) && (await I.exists(dd('Actual time'))) && !(await I.exists(`${panel}.querySelector('[aria-pressed], input[aria-label="Custom estimate"], input[aria-label="Set the actual time"]')`)));
  // Keyboard: focus the button, Enter opens it, Down moves, Enter chooses.
  await I.js(`${dd('Estimated time')}.focus()`);
  await I.enter([], 500);
  check('2: Enter opens the list', await I.exists(pop('Estimated time')));
  const items = await I.js(`[...${pop('Estimated time')}.querySelectorAll('[role="button"]')].map((b) => b.getAttribute('aria-label').replace('Estimated time ', ''))`);
  check('2: the list: 5, 10, 15, 20, 30, 45 min, 1 h to 4 h by 15 minutes, 5, 6, 8 h, then Custom', JSON.stringify(items) === JSON.stringify(['5 min', '10 min', '15 min', '20 min', '30 min', '45 min', '1 h', '1 h 15', '1 h 30', '1 h 45', '2 h', '2 h 15', '2 h 30', '2 h 45', '3 h', '3 h 15', '3 h 30', '3 h 45', '4 h', '5 h', '6 h', '8 h', 'Custom estimated time']), JSON.stringify(items));
  check('2: focus starts on the first length', (await I.activeLabel()) === 'Estimated time 5 min', String(await I.activeLabel()));
  for (let i = 0; i < 3; i++) await I.key('Down', [], 120);
  check('2: Down moves through the list', (await I.activeLabel()) === 'Estimated time 20 min', String(await I.activeLabel()));
  await I.enter([], 600);
  await C.waitFor(() => byId('t2').durationMinutes === 20, 4000).catch(() => {});
  check('2: Enter chooses it: stored as 20 minutes in the same field', byId('t2').durationMinutes === 20 && !(await I.exists(pop('Estimated time'))));
  check('2: the value shows as short text ("20 min")', (await ddText(dd('Estimated time'))) === '20 min');
  // Opening again starts at the current value.
  await I.click(dd('Estimated time'), 500);
  check('2: it opens again at the current value', (await I.activeLabel()) === 'Estimated time 20 min', String(await I.activeLabel()));
  await I.click(`${pop('Estimated time')}.querySelector('[aria-label="Custom estimated time"]')`, 300);
  check('2: Custom shows a field to type in', (await I.activeLabel()) === 'Custom estimated time');
  await I.type('1:45');
  await I.enter([], 600);
  await C.waitFor(() => byId('t2').durationMinutes === 105, 4000).catch(() => {});
  check('2: Custom accepts hours and minutes (1:45 is 105 minutes, shown "1 h 45")', byId('t2').durationMinutes === 105 && (await ddText(dd('Estimated time'))) === '1 h 45');
  await I.click(dd('Estimated time'), 400);
  await I.click(`${pop('Estimated time')}.querySelector('[aria-label="Custom estimated time"]')`, 300);
  await I.type('90');
  await I.enter([], 600);
  await C.waitFor(() => byId('t2').durationMinutes === 90, 4000).catch(() => {});
  check('2: Custom accepts plain minutes (90)', byId('t2').durationMinutes === 90);
  await I.click(dd('Estimated time'), 400);
  await I.click(`${pop('Estimated time')}.querySelector('[aria-label="Custom estimated time"]')`, 300);
  await I.type('soon');
  await I.enter([], 400);
  check('2: Custom refuses text that is not a time, and says so', byId('t2').durationMinutes === 90 && (await I.textOf(pop('Estimated time'))).includes('Not a time'));
  await I.key('Escape');
  await C.sleep(300);
  check('2: Escape closes the list and leaves the details open', !(await I.exists(pop('Estimated time'))) && (await modalOpen()));
  await I.click(dd('Estimated time'), 400);
  await I.click(`${pop('Estimated time')}.querySelector('[aria-label="Clear estimated time"]')`, 600);
  await C.waitFor(() => byId('t2').durationMinutes === undefined, 4000).catch(() => {});
  check('2: Clear empties it', byId('t2').durationMinutes === undefined && (await ddText(dd('Estimated time'))) === 'Click to set');
  // Actual time: the same drop-down.
  await I.click(dd('Actual time'), 400);
  await I.click(`${pop('Actual time')}.querySelector('[aria-label="Actual time 30 min"]')`, 600);
  await C.waitFor(() => byId('t2').actualMinutes === 30, 4000).catch(() => {});
  check('2: Actual time uses the same drop-down (30 min stored in actualMinutes)', byId('t2').actualMinutes === 30 && (await ddText(dd('Actual time'))) === '30 min');
  check('2: the timer is still there beside it', await I.exists(`${panel}.querySelector('[aria-label="Start the timer"]')`));
  await I.click(dd('Actual time'), 400);
  await I.click(`${pop('Actual time')}.querySelector('[aria-label="Clear actual time"]')`, 600);
  await C.waitFor(() => !byId('t2').actualMinutes, 4000).catch(() => {});
  check('2: Clear empties the actual time', !byId('t2').actualMinutes);
  await I.shot('p11-02-dropdown');
  await closeModal();
  // The Add a task box.
  const box = `document.querySelector('[data-add-box="${today}"]')`;
  await I.click(I.byLabel(`Add a task on ${today}`), 200);
  await I.type('Estimated new');
  await C.sleep(200);
  check('2: the Add a task box has the drop-down once you type', await I.exists(`${box}.querySelector('[data-duration-select]')`));
  await I.click(`${box}.querySelector('[data-duration-select]')`, 400);
  await I.click(`document.querySelector('[data-popover] [aria-label="Estimated time for the new task 1 h 30"]')`, 400);
  check('2: the box shows the chosen length', (await ddText(`${box}.querySelector('[data-duration-select]')`)) === '1 h 30');
  await I.click(I.byLabel(`Add a task on ${today}`), 200);
  await I.enter([], 800);
  await C.waitFor(() => tasks().some((t) => t.title === 'Estimated new'), 4000).catch(() => {});
  const added = tasks().find((t) => t.title === 'Estimated new');
  check('2: the new task is stored with 90 minutes', !!added && added.durationMinutes === 90, JSON.stringify(added));
  // The details of a new typed task open by themselves (2.27.0): close them.
  if (await modalOpen()) await closeModal();
  await I.blur();
  // The Planning flow: an estimate is a draft until Finish.
  const inFlow = (l) => `document.querySelector('[data-flow] [aria-label=${JSON.stringify(l)}]')`;
  await I.key('P', ['control', 'shift']);
  await C.waitFor(() => I.exists(`document.querySelector('[data-flow]')`), 4000).catch(() => {});
  await I.click(inFlow('Next step'), 500);
  const flowDd = `document.querySelector('[data-flow] [data-duration-select="Estimated time for Plain task"]')`;
  check('2: Planning has the same drop-down on each task for today', await I.exists(flowDd));
  await I.click(flowDd, 400);
  await I.click(`document.querySelector('[data-popover] [aria-label="Estimated time for Plain task 45 min"]')`, 400);
  check('2: in Planning it is a draft (nothing stored yet)', byId('t2').durationMinutes === undefined && (await ddText(flowDd)) === '45 min');
  await I.click(flowDd, 400);
  await I.key('Escape');
  await C.sleep(300);
  check('2: Escape in the drop-down closes only the drop-down, not the flow', (await I.exists(`document.querySelector('[data-flow]')`)) && !(await I.exists('document.querySelector("[data-popover]")')));
  await I.click(inFlow('Next step'), 500);
  await I.click(inFlow('Next step'), 500);
  await I.click(inFlow('Finish'), 1000);
  await C.waitFor(() => byId('t2').durationMinutes === 45, 4000).catch(() => {});
  check('2: Finish stores it (45 minutes)', byId('t2').durationMinutes === 45);

  // ======== 3. The list's emoji on the card ========
  const metaOf = (expr) => I.js(`(() => { const m = (${expr}).querySelector('[data-card-meta]'); if (!m) return null; return { first: m.firstElementChild && m.firstElementChild.dataset.cardListEmoji ? m.firstElementChild.textContent : null, emoji: (m.querySelector('[data-card-list-emoji]') || {}).textContent || null, chip: (m.querySelector('[data-card-label]') || {}).textContent || null, order: [...m.children].map((c) => c.dataset.cardListEmoji ? 'list' : c.dataset.cardLabel ? 'label' : 'other') }; })()`);
  const m1 = await metaOf(card(today, 'Modal task'));
  check('3: a card in a list with an emoji shows it first on the meta line, before the label chip', !!m1 && m1.first === '🎲' && m1.order.indexOf('list') === 0 && m1.order.indexOf('label') === 1, JSON.stringify(m1));
  check('3: the label is a coloured chip with its emoji and name', !!m1 && m1.chip === '💼 Work' && (await I.js(`getComputedStyle(${card(today, 'Modal task')}.querySelector('[data-card-label] div')).backgroundColor`)) === 'rgb(111, 143, 126)', JSON.stringify(m1));
  const m4 = await metaOf(card(today, 'No emoji list'));
  check('3: a list with no emoji shows nothing (not the default list emoji)', !!m4 && m4.emoji === null && m4.chip === 'Home', JSON.stringify(m4));
  check('3: a task with no list shows nothing', !(await I.exists(`${card(today, 'Plain task')}.querySelector('[data-card-list-emoji]')`)));
  const emojiSize = await I.js(`parseFloat(getComputedStyle(${card(today, 'Modal task')}.querySelector('[data-card-list-emoji]')).fontSize)`);
  check('3: it is small', emojiSize <= 12, String(emojiSize));
  // The left pane: the Games list.
  await I.click(`document.querySelector('[aria-label^="List: "][aria-label$="Change list"]')`, 400);
  await I.click(I.byLabel('Show list Games'), 600);
  await C.waitFor(() => I.exists(`document.querySelector('[aria-label="Task Brain item"]')`), 4000).catch(() => {});
  const mLeft = await metaOf(`document.querySelector('[aria-label="Task Brain item"]')`);
  check('3: the left pane cards show it too', !!mLeft && mLeft.first === '🎲', JSON.stringify(mLeft));
  await I.click(`document.querySelector('[aria-label^="List: "][aria-label$="Change list"]')`, 400);
  await I.click(I.byLabel('Show Brain Dump'), 400);
  // The Timebox block.
  const tbEmoji = await I.js(`(() => { const b = document.querySelector('[data-block-id="t3"]'); const e = b && b.querySelector('[data-block-list-emoji]'); return e ? e.textContent.trim() : null; })()`);
  check('3: a Timebox block tall enough shows it on its time line', tbEmoji === '🎲', String(tbEmoji));
  // The Calendar block.
  await I.click(I.byLabel('Show the Calendar'), 800);
  await C.waitFor(() => I.exists(`document.querySelector('[data-cal-block$="t3"]')`), 4000).catch(() => {});
  const calEmoji = await I.js(`(() => { const b = document.querySelector('[data-cal-block$="t3"]'); const e = b && b.querySelector('[data-block-list-emoji]'); return e ? e.textContent.trim() : null; })()`);
  check('3: a Calendar block with room shows it', calEmoji === '🎲', String(calEmoji));
  await I.click(I.byLabel('Show Tasks'), 800);
  // The List row of the details.
  await openModal('Modal task');
  const listRow = await I.js(`(() => { const s = ${panel}.querySelector('select[aria-label="List"]'); return s.options[s.selectedIndex].text; })()`);
  check('3: the details List row shows the list with its emoji', listRow === '🎲 Games', listRow);
  await closeModal();
  await openModal('No emoji list');
  const listRow2 = await I.js(`(() => { const s = ${panel}.querySelector('select[aria-label="List"]'); return s.options[s.selectedIndex].text; })()`);
  check('3: and a list with no emoji by its name only', listRow2 === 'Plain list', listRow2);
  await closeModal();
  await I.shot('p11-03-list-emoji');

  // ======== 4. Labels: the colour is always there ========
  const lp = `document.querySelector('[data-popover]')`;
  await openModal('Modal task');
  const lbl = await I.js(`(() => { const b = ${panel}.querySelector('[data-detail-label]'); return b ? { text: b.textContent.trim(), dot: !!b.querySelector('div') } : null; })()`);
  check('4: the details Label row shows the label with its colour dot, emoji and name', !!lbl && lbl.text === '💼 Work' && lbl.dot, JSON.stringify(lbl));
  await I.click(`${panel}.querySelector('[data-detail-label]')`, 500);
  check('4: it opens the label menu', await I.exists(`${lp}.querySelector('[aria-label="Search labels"]')`));
  const workRow = await I.js(`(() => { const r = ${lp}.querySelector('[data-label-row="pw"]'); return r ? { dot: !!r.querySelector('[data-label-dot]'), text: r.textContent } : null; })()`);
  check('4: each label shows its colour dot, emoji and name', !!workRow && workRow.dot && workRow.text.includes('💼') && workRow.text.includes('Work'), JSON.stringify(workRow));
  check('4: the menu has New label, Edit labels and Remove label', (await I.exists(`${lp}.querySelector('[aria-label="New label"]')`)) && (await I.exists(`${lp}.querySelector('[aria-label="Edit labels"]')`)) && (await I.exists(`${lp}.querySelector('[aria-label="Remove label"]')`)));
  await I.click(`${lp}.querySelector('[aria-label="New label"]')`, 500);
  const form = await I.js(`(() => { const f = ${lp}.querySelector('[data-new-label-form]'); if (!f) return null; const r = f.getBoundingClientRect(); return { name: !!f.querySelector('[aria-label="New label name"]'), emoji: !!f.querySelector('[aria-label="New label emoji"]'), swatches: f.querySelectorAll('[data-swatch]').length, inView: r.top >= 0 && r.top < innerHeight - 100 }; })()`);
  check('4: New label opens one small form with name, emoji and colour together, in view', !!form && form.name && form.emoji && form.swatches === 21 && form.inView, JSON.stringify(form));
  const locks = await I.js(`(() => { const f = ${lp}.querySelector('[data-new-label-form]'); const locked = [...f.querySelectorAll('[data-swatch][data-locked]')]; return { n: locked.length, icons: locked.filter((s) => s.textContent.length > 0).length, title: locked[0] && locked[0].closest('[data-swatch-tip]').getAttribute('title'), note: f.textContent.includes('The last 12 colours and the colour wheel need it'), classicLocked: [...f.querySelectorAll('[data-swatch]')].slice(0, 8).some((s) => s.hasAttribute('data-locked')) }; })()`);
  check('4: before the tick the 12 new colours and the wheel show locked, each with a lock and a reason', locks.n === 13 && locks.icons === 13 && /locked until every computer runs Belific 2\.27/.test(locks.title || '') && locks.note && !locks.classicLocked, JSON.stringify(locks));
  check('4: the 8 original colours are never locked by the tick', !locks.classicLocked);
  check('4: with every original colour taken, it says so (not silently dimmed)', (await I.exists(`${lp}.querySelector('[data-no-free-colour]')`)) && (await I.textOf(lp)).includes('All 8 original colours are in use'));
  await I.type('Gaming');
  await I.click(`${lp}.querySelector('[aria-label="Create the new label"]')`, 600);
  check('4: no colour is pre-picked when none is free', (await I.js(`${lp}.querySelectorAll('[data-new-label-form] [data-swatch][aria-pressed="true"]').length`)) === 0);
  check('4: two labels never share a colour: Create is refused while no colour is free', !labelNamed('Gaming') && /Pick a colour first/.test(await I.textOf(lp)), await I.textOf(lp));
  await I.click(`${lp}.querySelector('[aria-label="Every computer runs Belific 2.27 or later"]')`, 300);
  check('4: the tick unlocks the new colours', (await I.js(`${lp}.querySelectorAll('[data-new-label-form] [data-swatch][data-locked]').length`)) === 0);
  await I.click(`${lp}.querySelector('[data-new-label-form] [data-swatch="orange"]')`, 300);
  check('4: the chosen colour is marked', (await I.js(`${lp}.querySelector('[data-swatch="orange"]').getAttribute('aria-pressed')`)) === 'true');
  await I.click(`${lp}.querySelector('[aria-label="Create the new label"]')`, 800);
  await C.waitFor(() => !!labelNamed('Gaming'), 4000).catch(() => {});
  check('4: Create makes it with that colour and puts it on the task', labelNamed('Gaming')?.colorKey === 'orange' && byId('t1').projectKey === labelNamed('Gaming')?.key, JSON.stringify(labelNamed('Gaming')));
  await I.shot('p11-04-new-label');
  // Edit an existing label from before this version (a 2.26 colour) from the menu.
  await I.click(`${panel}.querySelector('[data-detail-label]')`, 500);
  await I.click(`${lp}.querySelector('[aria-label="Edit label Old teal"]')`, 500);
  const ef = await I.js(`(() => { const f = ${lp}.querySelector('[data-edit-label-form]'); return f ? { name: f.querySelector('[aria-label="Rename Old teal"]').value, emoji: !!f.querySelector('[aria-label="Emoji for Old teal"]'), swatches: f.querySelectorAll('[data-swatch]').length, note: f.textContent.includes('a 2.26 colour') } : null; })()`);
  check('4: editing a label shows name, emoji and colour together', !!ef && ef.name === 'Old teal' && ef.emoji && ef.swatches === 21 && ef.note, JSON.stringify(ef));
  await I.click(`${lp}.querySelector('[data-edit-label-form] [data-swatch="cyan"]')`, 700);
  await C.waitFor(() => labelNamed('Old teal')?.colorKey === 'cyan', 4000).catch(() => {});
  check('4: changing the colour of a label made before this version works', labelNamed('Old teal')?.colorKey === 'cyan', JSON.stringify(labelNamed('Old teal')));
  await I.key('Escape');
  await C.sleep(300);
  await closeModal();
  // The Add a task box: its label menu has the same form.
  await I.click(`document.querySelector('[data-add-box="${today}"] [data-ctl="addLabel"]')`, 500);
  await I.click(`${lp}.querySelector('[aria-label="New label"]')`, 400);
  check('4: the Add a task box label menu opens the same form', (await I.exists(`${lp}.querySelector('[data-new-label-form] [aria-label="New label name"]')`)) && (await I.js(`${lp}.querySelectorAll('[data-new-label-form] [data-swatch]').length`)) === 21);
  await I.key('Escape');
  await C.sleep(300);
  // Enter on a new name opens the form too (never a label made blind).
  await I.click(`document.querySelector('[data-add-box="${today}"] [data-ctl="addLabel"]')`, 500);
  await I.type('Reading');
  await I.enter([], 500);
  check('4: Enter on a new name opens the form with that name, nothing made yet', !labelNamed('Reading') && (await I.js(`(${lp}.querySelector('[aria-label="New label name"]') || {}).value`)) === 'Reading');
  await I.key('Escape');
  await C.sleep(300);
  // The Labels page: the colour, emoji or name opens the same form; adding shows all three.
  await I.click(`document.querySelector('[data-add-box="${today}"] [data-ctl="addLabel"]')`, 500);
  await I.click(`${lp}.querySelector('[aria-label="Edit labels"]')`, 800);
  await C.waitFor(() => I.exists(I.dialog('Labels')), 4000).catch(() => {});
  check('4: the Labels page Add shows name, emoji and colour together', (await I.exists(`document.querySelector('[data-new-label-form="page"] [aria-label="New label name"]')`)) && (await I.exists(`${I.dialog('Labels')}.querySelector('[aria-label="New label emoji"]')`)) && (await I.js(`${I.dialog('Labels')}.querySelectorAll('[data-swatch]').length`)) === 21);
  await I.click(I.byLabel('Colour of Home'), 500);
  check('4: a label\'s colour on the Labels page opens name, emoji and colour together', (await I.exists(`${lp}.querySelector('[aria-label="Rename Home"]')`)) && (await I.exists(`${lp}.querySelector('[aria-label="Emoji for Home"]')`)) && (await I.js(`${lp}.querySelectorAll('[data-swatch]').length`)) === 21);
  await I.click(`${lp}.querySelector('[data-swatch="blue"]')`, 700);
  await C.waitFor(() => labelNamed('Home')?.colorKey === 'blue', 4000).catch(() => {});
  check('4: and changing it there works', labelNamed('Home')?.colorKey === 'blue', JSON.stringify(labelNamed('Home')));
  await I.click(`${lp}.querySelector('[data-swatch="orange"]')`, 500);
  check('4: a colour another label has (Gaming, orange) cannot be picked', labelNamed('Home')?.colorKey === 'blue' && (await I.js(`${lp}.querySelector('[data-swatch="orange"]').getAttribute('data-taken')`)) === 'Gaming');
  await I.shot('p11-04-labels-page');
  await I.key('Escape');
  await C.sleep(300);
  await I.key('Escape');
  await C.sleep(400);

  // ======== 5. One emoji picker everywhere ========
  const picker = `document.querySelector('[data-emoji-picker]')`;
  const strip = (e) => String(e || '').replace(/️/g, '');
  await openModal('Plain task');
  await I.click(I.byLabel('More task actions'), 400);
  await I.click(I.byLabel('Task emoji'), 500);
  check('5: the emoji button opens the picker with its search box ready', (await I.exists(picker)) && (await I.activeLabel()) === 'Search emoji for Task emoji', String(await I.activeLabel()));
  const tabs = await I.js(`[...${picker}.querySelectorAll('[role="tab"]')].map((t) => t.getAttribute('aria-label'))`);
  check('5: category tabs', JSON.stringify(tabs) === JSON.stringify(['Smileys and emotion', 'People and body', 'Animals and nature', 'Food and drink', 'Travel and places', 'Activities', 'Objects', 'Symbols', 'Flags']), JSON.stringify(tabs));
  await I.type('game');
  await C.sleep(300);
  const found = await I.js(`[...${picker}.querySelectorAll('[data-emoji-cell]')].map((b) => b.getAttribute('aria-label'))`);
  check('5: typing "game" finds the controller (video game)', found.includes('video game'), JSON.stringify(found.slice(0, 12)));
  const font = await I.js(`getComputedStyle(${picker}.querySelector('[data-emoji-cell]')).fontFamily`);
  check('5: drawn with the system emoji font', /Segoe UI Emoji/.test(font), font);
  // Keyboard only: Down into the grid, the arrows, Enter.
  await I.js(`(() => { const i = ${picker}.querySelector('input'); i.select(); })()`);
  await I.type('video game');
  await C.sleep(300);
  await I.key('Down', [], 200);
  check('5: Down from the search box goes into the grid', (await I.activeLabel()) === 'video game', String(await I.activeLabel()));
  await I.key('Right', [], 150);
  const right = await I.activeLabel();
  await I.key('Left', [], 150);
  check('5: the arrows move in the grid (and the menu does not take them)', right !== 'video game' && (await I.activeLabel()) === 'video game' && (await I.exists(picker)), String(right));
  await I.enter([], 600);
  await C.waitFor(() => strip(byId('t2').emoji) === '🎮', 4000).catch(() => {});
  check('5: Enter chooses it: the task has the controller', strip(byId('t2').emoji) === '🎮', JSON.stringify(byId('t2').emoji));
  check('5: the picker closes and focus goes back to the emoji button', !(await I.exists(picker)) && (await I.activeLabel()) === 'Task emoji', String(await I.activeLabel()));
  await I.click(I.byLabel('Task emoji'), 500);
  const recent = await I.js(`[...${picker}.querySelectorAll('[data-emoji-recent] button')].map((b) => b.textContent)`);
  check('5: a recently used row (the controller first)', recent.length > 0 && strip(recent[0]) === '🎮', JSON.stringify(recent));
  await I.click(`${picker}.querySelector('[data-emoji-tab="animals"]')`, 300);
  check('5: a category tab shows that category', (await I.js(`[...${picker}.querySelectorAll('[data-emoji-cell]')].some((b) => b.getAttribute('aria-label') === 'dog face')`)) && (await I.js(`${picker}.querySelector('[data-emoji-tab="animals"]').getAttribute('aria-selected')`)) === 'true');
  await I.js(`${picker}.querySelector('[data-emoji-tab="animals"]').focus()`);
  await I.key('Escape', [], 300);
  check('5: Escape closes the picker only (the menu stays open)', !(await I.exists(picker)) && (await I.exists(`document.querySelector('[data-popover]')`)));
  await I.key('Escape', [], 300);
  await closeModal();
  // Labels and lists use the same picker.
  await I.click(`document.querySelector('[data-add-box="${today}"] [data-ctl="addLabel"]')`, 500);
  await I.click(`${lp}.querySelector('[aria-label="New label"]')`, 400);
  await I.click(`${lp}.querySelector('[aria-label="New label emoji"]')`, 400);
  check('5: the label form uses the same picker', await I.exists(`${lp}.querySelector('[data-emoji-picker]')`));
  await I.type('🎮');
  await C.sleep(300);
  check('5: a typed or pasted emoji is taken as it is', strip(await I.js(`${lp}.querySelector('[aria-label="New label emoji"]').textContent`)) === '🎮');
  await I.key('Escape', [], 300);
  await I.click(`document.querySelector('[aria-label^="List: "][aria-label$="Change list"]')`, 400);
  await I.click(`document.querySelector('[data-popover] [aria-label="Emoji for Games"], [data-popover] [aria-label="New list emoji"]')`, 400);
  check('5: the list menu uses the same picker', await I.exists(`document.querySelector('[data-popover] [data-emoji-picker]')`));
  await I.key('Escape', [], 300);
  await I.key('Escape', [], 300);
  const net = await I.js(`performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /^https?:/.test(n))`);
  check('5: no network calls (the data is bundled)', net.length === 0, JSON.stringify(net));
  await I.shot('p11-05-picker');

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
