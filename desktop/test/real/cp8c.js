'use strict';
// Real keyboard and pointer check for 2.12.1: typing (including spaces and Enter)
// in any field inside a card or popover must never reach the card (no collapse,
// no drag). Real key events (keyDown, char, keyUp) and real mouse clicks into the
// real app on an isolated data folder asserted NOT to be the real one.
const fs = require('node:fs');
const path = require('node:path');
const { app, shell } = require('electron');
const C = require('./common');

process.env.BELIFIC_NO_PROTOCOL_REGISTER = '1';
const userData = C.isolate();
const pad = (n) => String(n).padStart(2, '0');

run().catch((err) => {
  console.log(`FAIL harness error: ${err.stack || err}`);
  app.exit(1);
});

async function run() {
  const { check, summary } = C.makeChecker();
  shell.openExternal = async () => {};
  const now = new Date();
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const t = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: '2026-10-06T08:00:00.000Z', updatedAt: '2026-10-06T08:00:00.000Z', ...extra });
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([t('a', 'Alpha', { dueDate: today, subtasks: [{ id: 's1', title: 'first sub', done: false }] }), t('b', 'Bravo', { dueDate: today })]),
  );
  fs.writeFileSync(
    path.join(dataDir, 'belific_projects.kv'),
    JSON.stringify([{ key: 'work', name: 'Work', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', colorKey: 'sage' }]),
  );
  const read = (key) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dataDir, `${key}.kv`), 'utf8'));
    } catch {
      return [];
    }
  };
  const taskNamed = (title) => read('belific_tasks').find((x) => x.title === title && !x.deletedAt);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  const js = (code) => win.webContents.executeJavaScript(code, true);
  await C.waitFor(async () => (await js('document.body.innerText')).includes('Alpha'), 20000);

  const rectOf = (expr) =>
    js(`(() => { const el = ${expr}; if (!el) return null; el.scrollIntoView({ block: 'center', inline: 'center' }); const r = el.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
  // Real mouse input. The pointer arrives first (hover-only icons mount and can
  // move the layout), then the element is measured again and pressed, as a
  // person who sees it settle would.
  const click = async (expr, wait = 200) => {
    const first = await rectOf(expr);
    if (!first) throw new Error(`no element for ${expr}`);
    win.webContents.sendInputEvent({ type: 'mouseMove', x: first.x, y: first.y });
    await C.sleep(250);
    let r = await rectOf(expr);
    for (let i = 0; i < 10; i++) {
      win.webContents.sendInputEvent({ type: 'mouseMove', x: r.x, y: r.y });
      await C.sleep(150);
      const again = await rectOf(expr);
      const same = again && again.x === r.x && again.y === r.y;
      r = again || r;
      if (same) break;
    }
    win.webContents.sendInputEvent({ type: 'mouseDown', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    win.webContents.sendInputEvent({ type: 'mouseUp', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    await C.sleep(wait);
  };
  const enter = async () => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
    win.webContents.sendInputEvent({ type: 'char', keyCode: String.fromCharCode(13) });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
    await C.sleep(80);
  };
  const focused = (label) => C.waitFor(async () => (await js(`document.activeElement && document.activeElement.getAttribute('aria-label')`)) === label, 5000);
  const press = async (keyCode) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode });
    await C.sleep(60);
  };
  // Real typing: a key down, a char and a key up for every character, so any
  // key handler up the tree sees what a person's keyboard would send.
  const type = async (text) => {
    for (const ch of text) {
      const keyCode = ch === ' ' ? 'Space' : ch;
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode });
      win.webContents.sendInputEvent({ type: 'char', keyCode: ch });
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode });
      await C.sleep(15);
    }
    await C.sleep(150);
  };
  const q = (sel) => `document.querySelector(${JSON.stringify(sel)})`;
  const cardSel = (title) => `[aria-label="Task ${title}"]:not([data-block-id])`;
  const inCard = (title, inner) => q(`${cardSel(title)} ${inner}`);
  const exists = (expr) => js(`!!${expr}`);
  const activeValue = () => js('document.activeElement && document.activeElement.value');
  const noDrag = () => js(`document.body.style.cursor !== 'grabbing'`);
  const textInCard = (title, text) =>
    `Array.from(document.querySelectorAll(${JSON.stringify(cardSel(title) + ' *')})).find((e) => e.children.length === 0 && e.textContent === ${JSON.stringify(text)})`;
  const NOTES = 'hello world with spaces';
  const expanded = (title) => exists(inCard(title, '[aria-label^="Add subtask to"]'));

  // ---- Notes ----
  await click(inCard('Alpha', '[aria-label="Subtasks 0/1"]'));
  check('the card expands', await expanded('Alpha'));
  await click(inCard('Alpha', '[aria-label="Notes for Alpha"]'));
  await type(NOTES);
  check('Notes: the card is still expanded after typing spaces', await expanded('Alpha'));
  check('Notes: the value is exact', (await activeValue()) === NOTES, String(await activeValue()));
  await enter();
  await type('next line');
  check('Notes: Enter inserts a new line and the card stays open', (await activeValue()) === `${NOTES}\nnext line` && (await expanded('Alpha')), JSON.stringify(await activeValue()));
  await press('Backspace');
  await press('Left');
  check('Notes: Backspace and arrows behave normally', (await activeValue()) === `${NOTES}\nnext lin`, JSON.stringify(await activeValue()));
  await press('Escape');
  check('Escape in Notes blurs the field and does not collapse the card', (await expanded('Alpha')) && !(await js(`document.activeElement && document.activeElement.tagName === 'TEXTAREA'`)));
  await C.waitFor(() => taskNamed('Alpha').notes === `${NOTES}\nnext lin`, 6000).catch(() => {});
  check('Notes saved on blur', taskNamed('Alpha').notes === `${NOTES}\nnext lin`, JSON.stringify(taskNamed('Alpha').notes));
  check('no drag started while typing', await noDrag());
  await press('Escape');
  check('a second Escape (on the card) collapses it', !(await expanded('Alpha')));
  await click(inCard('Alpha', '[aria-label="Subtasks 0/1"]'));
  check('the card expands again', await expanded('Alpha'));

  // ---- Add subtask: spaces and Enter ----
  await click(inCard('Alpha', '[aria-label^="Add subtask to"]'));
  await type('second subtask here');
  check('Add subtask: spaces typed, card still expanded', (await activeValue()) === 'second subtask here' && (await expanded('Alpha')));
  await press('Return');
  await C.waitFor(() => (taskNamed('Alpha').subtasks || []).length === 2, 6000).catch(() => {});
  check('Add subtask: Enter still adds it and keeps the input open', (taskNamed('Alpha').subtasks || []).map((s) => s.title).join('|') === 'first sub|second subtask here' && (await expanded('Alpha')));

  // ---- Subtask title edit ----
  await click(textInCard('Alpha', 'first sub'));
  check('subtask title editing starts', (await js(`document.activeElement && document.activeElement.getAttribute('aria-label')`)) === 'Edit subtask first sub');
  await js('document.activeElement.select()');
  await type('edited subtask with spaces');
  check('Subtask edit: spaces typed, value exact, card still expanded', (await activeValue()) === 'edited subtask with spaces' && (await expanded('Alpha')), String(await activeValue()));
  await press('Return');
  await C.waitFor(() => (taskNamed('Alpha').subtasks || [])[0].title === 'edited subtask with spaces', 6000).catch(() => {});
  check('Subtask edit: Enter saves it', (taskNamed('Alpha').subtasks || [])[0].title === 'edited subtask with spaces');

  // ---- Title rename ----
  await click(inCard('Alpha', '[aria-label="Title Alpha"]'));
  await js('document.activeElement.select()');
  await type('Alpha renamed with spaces');
  check('Title rename: spaces typed, value exact, card still expanded', (await activeValue()) === 'Alpha renamed with spaces' && (await expanded('Alpha')), String(await activeValue()));
  await press('Return');
  await C.waitFor(() => !!taskNamed('Alpha renamed with spaces'), 6000).catch(() => {});
  check('Title rename: Enter still saves it', !!taskNamed('Alpha renamed with spaces'));
  await C.waitFor(() => exists(q(cardSel('Alpha renamed with spaces'))), 6000).catch(() => {});
  check('the card is still expanded after the rename', await expanded('Alpha renamed with spaces'));

  // ---- Label search (popover) ----
  await click(inCard('Bravo', '[aria-label="Select label"]'));
  await focused('Search labels');
  await type('new label name');
  check('Label search: spaces typed, value exact, popover still open', (await activeValue()) === 'new label name' && (await exists(q('[data-popover]'))), String(await activeValue()));
  check('Label search: the card did not expand', !(await expanded('Bravo')));
  await press('Escape');

  // ---- Filter search (popover) ----
  await click(q('[aria-label="Filter"]'));
  await focused('Search filter labels');
  await type('some words here');
  check('Filter search: spaces typed, value exact, popover still open', (await activeValue()) === 'some words here' && (await exists(q('[data-popover]'))), String(await activeValue()));
  await press('Escape');

  // ---- Repeat day of month field ----
  await click(inCard('Bravo', '[aria-label^="Repeat"]'));
  await click(q('[data-popover] [aria-label="Repeat Monthly"]'));
  await click(q('[data-popover] [aria-label="Day of the month"]'));
  await js('document.activeElement.select()');
  await type('15');
  check('Repeat day of month: typing works and the popover stays open', (await activeValue()) === '15' && (await exists(q('[data-popover]'))), String(await activeValue()));
  await press('Escape');

  // ---- Duration field: spaces and arrows inside the popover ----
  await click(inCard('Bravo', '[aria-label^="Duration of"]'));
  await focused('Duration');
  await type('1h 30m');
  check('Duration field: spaces typed, value exact, popover open, card not expanded', (await activeValue()) === '1h 30m' && (await exists(q('[data-popover]'))) && !(await expanded('Bravo')), String(await activeValue()));
  await press('Escape');

  check('no drag ever started', await noDrag());
  const failed = summary();
  app.exit(failed ? 1 : 0);
}
