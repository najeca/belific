'use strict';
// Real pointer check for 2.12.3: nothing in a task card moves when the pointer
// arrives or leaves (the hover icons reserve their space). Real mouse movement
// into the real app on an isolated data folder asserted NOT to be the real one.
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
  const long = 'A rather long task title that is certain to wrap onto two or even three lines in a narrow column';
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      t('a', 'Short', { dueDate: today, projectKey: 'work', durationMinutes: 90, recurrence: 'daily', priority: 'high' }),
      t('b', long, { dueDate: today, projectKey: 'home', subtasks: [{ id: 's1', title: 'sub one', done: false }] }),
      t('c', 'Placed with a time', { dueDate: today, startTime: '09:30', durationMinutes: 60 }),
      t('d', 'Left list task', {}),
      t('e', 'Another quite long title for the left list that will wrap as well, surely', {}),
    ]),
  );
  fs.writeFileSync(
    path.join(dataDir, 'belific_projects.kv'),
    JSON.stringify([
      { key: 'work', name: 'Work', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', colorKey: 'sage' },
      { key: 'home', name: 'Home', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', colorKey: 'clay' },
    ]),
  );

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  const js = (code) => win.webContents.executeJavaScript(code, true);
  await C.waitFor(async () => (await js('document.body.innerText')).includes('Short'), 20000);
  // 2.28.0: the app opens on the Calendar; this check starts on the Tasks view.
  {
    const pt = await win.webContents.executeJavaScript(`(() => { const e = document.querySelector('[aria-label="Show Tasks"]'); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }; })()`, true);
    if (pt) for (const type of ['mouseMove', 'mouseDown', 'mouseUp']) win.webContents.sendInputEvent({ type, x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
    await C.sleep(700);
  }

  // Two small moves, as a real pointer sends, so the page sees it arrive.
  // Hover events only reach a window that has focus.
  win.show();
  win.focus();
  win.webContents.focus();
  const move = async (x, y, wait = 350) => {
    win.webContents.sendInputEvent({ type: 'mouseMove', x: x - 1, y: y - 1 });
    await C.sleep(60);
    win.webContents.sendInputEvent({ type: 'mouseMove', x, y });
    await C.sleep(wait);
  };
  const q = (sel) => `document.querySelector(${JSON.stringify(sel)})`;
  const cardSel = (title) => `[aria-label="Task ${title}"]:not([data-block-id])`;
  // Every element inside the card (and the card itself): its rounded rectangle.
  const measure = (title) =>
    js(`(() => {
      const card = ${q(cardSel(title))};
      if (!card) return null;
      const all = [card, ...card.querySelectorAll('*')];
      return all.map((el) => { const r = el.getBoundingClientRect(); return [el.tagName, el.getAttribute('aria-label') || '', Math.round(r.x * 10) / 10, Math.round(r.y * 10) / 10, Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10]; });
    })()`);
  const center = (title) =>
    js(`(() => { const el = ${q(cardSel(title))}; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: Math.round(r.x + 24), y: Math.round(r.y + Math.min(r.height / 2, 40)) }; })()`);
  const iconOpacity = (title) =>
    // 2.26.0: the hover controls (Move to day among them) fade in as one row.
    js(`(() => { const row = ${q(`${cardSel(title)} [data-card-controls]`)}; return row ? getComputedStyle(row).opacity : null; })()`);
  // Moves the pointer onto the card until the page has seen it arrive (an
  // injected move is sometimes not turned into a hover on the first try).
  const hoverOn = async (title, c) => {
    for (let i = 0; i < 12; i++) {
      win.webContents.focus();
      await move(4, 4, 150);
      await move(c.x + 3 * (i % 4), c.y + (i % 3), 400);
      if ((await iconOpacity(title)) === '1') return true;
    }
    return false;
  };
  const diff = (a, b) => {
    if (!a || !b || a.length !== b.length) return [`element count ${a && a.length} vs ${b && b.length}`];
    const out = [];
    a.forEach((row, i) => {
      if (row.join('|') !== b[i].join('|')) out.push(`${row[0]} "${row[1]}" ${row.slice(2).join(',')} -> ${b[i].slice(2).join(',')}`);
    });
    return out;
  };

  for (const title of ['Short', long, 'Placed with a time', 'Left list task', 'Another quite long title for the left list that will wrap as well, surely']) {
    const short = title.length > 24 ? `${title.slice(0, 24)}...` : title;
    await C.sleep(200);
    const c = await center(title);
    await C.sleep(300);
    // away from every card: the top left corner of the window
    await move(4, 4);
    const before = await measure(title);
    const hiddenOpacity = await iconOpacity(title);
    // the hover icons show once React has seen the pointer: measure after that
    await hoverOn(title, c);
    const during = await measure(title);
    const shownOpacity = await iconOpacity(title);
    await move(4, 4);
    await C.waitFor(async () => (await iconOpacity(title)) === '0', 4000).catch(() => {});
    const after = await measure(title);
    check(`"${short}": nothing moves or resizes when the pointer arrives (${before ? before.length : 0} elements)`, diff(before, during).length === 0, diff(before, during).slice(0, 3).join(' ; '));
    check(`"${short}": nothing moves or resizes when the pointer leaves`, diff(during, after).length === 0, diff(during, after).slice(0, 3).join(' ; '));
    check(`"${short}": the hover icons are transparent away and shown on hover`, hiddenOpacity === '0' && shownOpacity === '1', `${hiddenOpacity} / ${shownOpacity}`);
  }

  // 2.27.0: a click on a card opens the details modal; the card itself never
  // expands and nothing on it moves.
  const card = 'Short';
  await center(card);
  await move(4, 4);
  const b2 = await measure(card);
  const tp = await js(`(() => { const el = ${q(`${cardSel(card)} [aria-label="Title ${card}"]`)}; const r = el.getBoundingClientRect(); return { x: Math.round(r.x + 10), y: Math.round(r.y + r.height / 2) }; })()`);
  await move(tp.x, tp.y, 200);
  win.webContents.sendInputEvent({ type: 'mouseDown', x: tp.x, y: tp.y, button: 'left', clickCount: 1 });
  win.webContents.sendInputEvent({ type: 'mouseUp', x: tp.x, y: tp.y, button: 'left', clickCount: 1 });
  await C.sleep(600);
  check('a click on the card opens the details', await js(`!!document.querySelector('[role="dialog"][aria-label="Task details"]')`));
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await C.sleep(400);
  await move(4, 4);
  await C.waitFor(async () => (await iconOpacity(card)) === '0', 4000).catch(() => {});
  const a2 = await measure(card);
  check('after the details close, the card is exactly as before (it never expanded)', diff(b2, a2).length === 0, diff(b2, a2).slice(0, 3).join(' ; '));

  const failed = summary();
  app.exit(failed ? 1 : 0);
}
