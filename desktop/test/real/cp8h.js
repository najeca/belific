'use strict';
// Real pointer and keyboard check for checkpoint 8.4 part C (2.14.0): repeating
// tasks as series with projected occurrences. A daily routine shows on every
// day from today without being stored; ticking, skipping, editing, dragging to
// the Timebox, deleting and ending a series, the label filter. Real mouse and
// key events into the real app on an isolated data folder asserted NOT to be
// the real one. BELIFIC_SHOTS: a folder for screenshots.
const fs = require('node:fs');
const path = require('node:path');
const { app, shell } = require('electron');
const C = require('./common');

process.env.BELIFIC_NO_PROTOCOL_REGISTER = '1';
const userData = C.isolate();
const SHOTS = process.env.BELIFIC_SHOTS || '';
const pad = (n) => String(n).padStart(2, '0');
const PX = 56;
console.log(`USERDATA ${userData}`);

run().catch((err) => {
  console.log(`FAIL harness error: ${err.stack || err}`);
  app.exit(1);
});

async function run() {
  const { check, summary } = C.makeChecker();
  shell.openExternal = async () => {};
  const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const shift = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const now = new Date();
  const today = keyOf(now);
  const yesterday = keyOf(shift(now, -1));
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const t = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: '2026-10-01T08:00:00.000Z', updatedAt: '2026-10-01T08:00:00.000Z', ...extra });
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      t('rt', 'Daily walk', { dueDate: today, recurrence: 'daily', durationMinutes: 30 }),
      t('dm', 'Doomed', { dueDate: yesterday, recurrence: 'daily', completed: true, completedAt: `${yesterday}T10:00:00.000Z` }),
      t(`dm:${today}`, 'Doomed', { dueDate: today, recurrence: 'daily' }),
      t('rv', 'Review', { dueDate: yesterday, recurrence: 'weekly', recurrenceDays: ['Fri'], projectKey: 'work', completed: true, completedAt: `${yesterday}T10:00:00.000Z` }),
      t('th', 'Plain thought'),
      t('tt', 'Today tick', { dueDate: today, recurrence: 'daily' }),
      t('ms', 'Missed', { dueDate: yesterday, recurrence: 'daily' }),
      t('nr', 'Night routine', { dueDate: keyOf(shift(now, -2)), recurrence: 'daily', completed: true, completedAt: `${yesterday}T01:00:00.000Z`, startTime: '22:00', durationMinutes: 480 }),
    ]),
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
  const rows = () => read('belific_tasks');
  const rootRows = (root) => rows().filter((r) => r.id === root || r.id.startsWith(`${root}:`));
  const rowById = (id) => rows().find((r) => r.id === id);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  const js = (code) => win.webContents.executeJavaScript(code, true);
  win.show();
  win.focus();
  win.webContents.focus();
  const body = () => js('document.body.innerText');
  await C.waitFor(async () => (await body()).includes('Daily walk'), 20000);

  const rectOf = (expr) =>
    js(`(() => { const el = ${expr}; if (!el) return null; el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = el.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: r.width, h: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right }; })()`);
  const mouse = (type, x, y, extra = {}) => win.webContents.sendInputEvent({ type, x, y, button: 'left', clickCount: 1, ...extra });
  const click = async (expr, wait = 250) => {
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
    mouse('mouseDown', r.x, r.y);
    mouse('mouseUp', r.x, r.y);
    await C.sleep(wait);
  };
  const press = async (keyCode, wait = 80) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode });
    await C.sleep(wait);
  };
  const enter = async () => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
    win.webContents.sendInputEvent({ type: 'char', keyCode: String.fromCharCode(13) });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
    await C.sleep(150);
  };
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
  const exists = (expr) => js(`!!${expr}`);
  const shot = async (name) => {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(SHOTS, `${name}.png`), img.toPNG());
  };
  const overlays = () =>
    js(`(() => {
      const out = [];
      for (const el of document.querySelectorAll('*')) {
        const s = getComputedStyle(el);
        if (s.position !== 'fixed' && s.position !== 'absolute') continue;
        const r = el.getBoundingClientRect();
        if (r.width < innerWidth * 0.9 || r.height < innerHeight * 0.9) continue;
        const bg = s.backgroundColor;
        const visible = bg && bg !== 'transparent' && !/rgba\\(\\s*\\d+,\\s*\\d+,\\s*\\d+,\\s*0\\s*\\)/.test(bg);
        if (visible) out.push(el.tagName + ':' + (el.getAttribute('aria-label') || el.className).toString().slice(0, 30));
      }
      return out;
    })()`);
  const baseline = new Set(await overlays());
  const noNewOverlay = async () => (await overlays()).filter((o) => !baseline.has(o)).length === 0;

  // ---- cards, left to right ----
  const cardsExpr = (title) => `Array.from(document.querySelectorAll(${JSON.stringify(`[aria-label="Task ${title}"]:not([data-block-id])`)})).filter((c) => c.closest('[data-task-card], [data-projected]') || true).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)`;
  const nth = (title, i) => `(${cardsExpr(title)})[${i}]`;
  const inNth = (title, i, inner) => `(() => { const c = ${nth(title, i)}; return c ? c.querySelector(${JSON.stringify(inner)}) : null; })()`;
  const countCards = (title) => js(`${cardsExpr(title)}.length`);
  const projectedFlags = (title) => js(`${cardsExpr(title)}.map((c) => c.hasAttribute('data-projected'))`);
  const cardTexts = (title) => js(`${cardsExpr(title)}.map((c) => c.innerText.replace(/\\s+/g, ' '))`);
  const chip = (title, i) => js(`(() => { const c = ${nth(title, i)}; const e = c && c.querySelector('[aria-label^="Duration of"]'); return e ? e.innerText.trim() : null; })()`);
  const waitCards = (title, n) => C.waitFor(async () => (await countCards(title)) === n, 8000).catch(() => {});
  const popover = () => exists(q('[data-popover]'));

  // ================================================== 1. every visible day
  const n = await countCards('Daily walk');
  const flags = await projectedFlags('Daily walk');
  check('the current week shows the daily routine on every visible day', n >= 1 && n === flags.length, `n=${n}`);
  check('today is the stored occurrence and every later day is projected', flags[0] === false && flags.slice(1).every((f) => f === true), JSON.stringify(flags));
  check('nothing was stored for the projected days', rootRows('rt').length === 1, JSON.stringify(rootRows('rt').map((r) => r.id)));
  check('a projected card still has all its controls', (await exists(inNth('Daily walk', Math.min(1, n - 1), '[aria-label^="Repeat"]'))) && (await exists(inNth('Daily walk', Math.min(1, n - 1), '[aria-label^="Duration of"]'))) && (await exists(inNth('Daily walk', Math.min(1, n - 1), '[aria-label^="Mark Daily walk"]'))));
  check('the left list is not touched by the routine (only the plain thought is there)', (await body()).includes('Plain thought'));
  await shot('cp8h-week-daily');

  // the routine is a lighter card
  if (n > 1) {
    const op = await js(`parseFloat(getComputedStyle(${nth('Daily walk', 1)}).opacity)`);
    check('a projected card is a little lighter than a stored one', op < 1 && (await js(`parseFloat(getComputedStyle(${nth('Daily walk', 0)}).opacity)`)) === 1, String(op));
  }

  // ---- an unfinished past occurrence is not carried forward ----
  const missedTexts = await cardTexts('Missed');
  check('a daily routine missed yesterday shows once a day from today, not as an overdue card', missedTexts.length === n && !missedTexts.some((tx) => tx.includes('from ')), JSON.stringify(missedTexts.slice(0, 2)));
  check('and today is its projection, nothing was stored for it', (await projectedFlags('Missed'))[0] === true && rootRows('ms').length === 1);

  // ---- completing today's occurrence does not create the next day ----
  const rowsAtTick = rows().length;
  await click(inNth('Today tick', 0, '[aria-label="Mark Today tick complete"]'));
  await C.waitFor(() => rowById('tt') && rowById('tt').completed, 8000).catch(() => {});
  await waitCards('Today tick', n - 1); // the completed card leaves the column: wait for the layout to settle
  await C.sleep(500);
  check('ticking today stores nothing for the following day', rowById('tt').completed === true && rows().length === rowsAtTick && rootRows('tt').length === 1, JSON.stringify(rootRows('tt').map((r) => r.id)));
  check('the following days still show it, projected, once each', n === 1 || ((await countCards('Today tick')) === n - 1 && (await projectedFlags('Today tick')).every(Boolean)));

  // ================================================== 2. delete a repeating task
  const doomedBefore = await countCards('Doomed');
  check('the second routine shows too (stored today, projected after)', doomedBefore === n, `${doomedBefore} vs ${n}`);
  const doomedIdx = Math.min(1, n - 1);
  await click(inNth('Doomed', doomedIdx, `[aria-label="More actions for Doomed"]`));
  await C.waitFor(() => popover(), 4000).catch(() => {});
  const menu = await js(`${q('[data-popover]')} ? ${q('[data-popover]')}.innerText : ''`);
  check('the overflow menu of a repeating card offers Skip this day and Delete repeating task (and no plain Delete task)', menu.includes('Skip this day') && menu.includes('Delete repeating task') && !/Delete task/.test(menu), menu);
  await click(q('[data-popover] [aria-label="Delete repeating task"]'));
  check('Delete repeating task asks inline: "Delete this repeating task? Yes / No"', (await js(`${q('[data-popover]')}.innerText`)).includes('Delete this repeating task?') && (await noNewOverlay()));
  await click(q('[data-popover] [aria-label="Cancel delete repeating task"]'));
  check('No keeps the series', (await countCards('Doomed')) === n && rootRows('dm').every((r) => !r.deletedAt));
  await click(q('[data-popover] [aria-label="Delete repeating task"]'));
  await click(q('[data-popover] [aria-label="Confirm delete repeating task"]'));
  await C.waitFor(() => rowById(`dm:${today}`) && rowById(`dm:${today}`).deletedAt, 8000).catch(() => {});
  const dm = rootRows('dm');
  check('Yes: the open row is tombstoned, the completed history stays but stops repeating', !!rowById(`dm:${today}`).deletedAt && !rowById('dm').deletedAt && rowById('dm').completed === true && dm.every((r) => !r.recurrence), JSON.stringify(dm));
  await waitCards('Doomed', 0);
  check('no occurrence of it is left on the board', (await countCards('Doomed')) === 0);
  await click(q('[aria-label="Next week"]'));
  await C.sleep(300);
  check('nor in the next week', (await countCards('Doomed')) === 0);
  await click(q('[aria-label="Go to this week"]'));

  // ================================================== 3. the next week: all projected
  await click(q('[aria-label="Next week"]'));
  await waitCards('Daily walk', 7);
  const nextFlags = await projectedFlags('Daily walk');
  check('the next week shows the routine on all seven days, all projected', nextFlags.length === 7 && nextFlags.every(Boolean), JSON.stringify(nextFlags));
  check('the labelled weekly Review shows on its Friday only (one card in the week)', (await countCards('Review')) === 1);
  const rowsBefore = rows().length;

  // ---- drag a projected card to the Timebox at 05:00: the whole series gets a start time ----
  const GRID = `document.querySelector('[data-timebox-grid]')`;
  const SCROLLER = `(() => { let e = ${GRID}; while (e && !(['auto', 'scroll'].includes(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight)) e = e.parentElement; return e; })()`;
  const setScroll = (y) => js(`(() => { const s = ${SCROLLER}; s.scrollTop = ${y}; return s.scrollTop; })()`);
  const gridRect = () => js(`(() => { const r = ${GRID}.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; })()`);
  await setScroll(5 * PX - 150);
  await C.sleep(250);
  const gr = await gridRect();
  const from = await rectOf(inNth('Daily walk', 0, '[aria-label="Title Daily walk"]'));
  const to = { x: Math.round(gr.left + 200), y: Math.round(gr.top + 5 * PX + 8) };
  win.webContents.sendInputEvent({ type: 'mouseMove', x: from.x, y: from.y });
  await C.sleep(120);
  mouse('mouseDown', from.x, from.y);
  for (let i = 1; i <= 14; i++) {
    win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(from.x + ((to.x - from.x) * i) / 14), y: Math.round(from.y + ((to.y - from.y) * i) / 14), modifiers: ['leftButtonDown'] });
    await C.sleep(18);
  }
  await C.sleep(200);
  mouse('mouseUp', to.x, to.y);
  await C.waitFor(() => rowById('rt') && rowById('rt').startTime === '05:00', 8000).catch(() => {});
  check('dropping a projected card on the Timebox at 05:00 sets the start time of the series', rowById('rt').startTime === '05:00', JSON.stringify(rowById('rt')));
  check('no row was added and no Day changed (nothing is stored for the projected days)', rows().length === rowsBefore && rowById('rt').dueDate === today);
  await C.waitFor(async () => (await cardTexts('Daily walk')).every((t) => t.includes('05:00')), 6000).catch(() => {});
  const timesNext = await cardTexts('Daily walk');
  check('every day of the next week now reads 05:00', timesNext.length === 7 && timesNext.every((tx) => tx.includes('05:00')), JSON.stringify(timesNext.slice(0, 2)));
  await click(q('[aria-label="Go to this week"]'));
  await C.sleep(300);
  const afterUntimed = await js(`${cardsExpr('Daily walk')}.every((c) => { const left = Math.round(c.getBoundingClientRect().left); return Array.from(document.querySelectorAll('[data-task-card], [data-projected]')).filter((o) => Math.round(o.getBoundingClientRect().left) === left && !/\\d\\d:\\d\\d/.test(o.innerText)).every((o) => o.getBoundingClientRect().top < c.getBoundingClientRect().top); })`);
  check('in every column the timed routine sits after the tasks without a time', afterUntimed);
  const timesNow = await cardTexts('Daily walk');
  await shot('cp8h-week-daily-timed');
  check('and this week too, including today', timesNow.length === n && timesNow.every((tx) => tx.includes('05:00')));

  // ---- the Timebox shows it at 05:00 on each day ----
  const blockTop = async (day) => js(`(() => { const b = Array.from(document.querySelectorAll('[data-block-id]:not([data-continuation])')).find((e) => e.getAttribute('aria-label') === 'Task Daily walk'); if (!b) return null; const g = ${GRID}.getBoundingClientRect(); return { top: Math.round(b.getBoundingClientRect().top - g.top), op: parseFloat(getComputedStyle(b).opacity) }; })()`);
  await click(q('[aria-label="Go to today"]'));
  await C.sleep(300);
  const b0 = await blockTop();
  check('the Timebox shows the routine at 05:00 today', b0 && Math.abs(b0.top - 5 * PX) <= 3, JSON.stringify(b0));
  const contLabel = () => js(`(() => { const c = document.querySelector('[data-continuation]'); return c ? c.getAttribute('aria-label') : null; })()`);
  check('today starts with the rest of the overnight routine (yesterday was only ever projected)', (await contLabel()) === 'Continues from yesterday: Night routine', String(await contLabel()));
  const dayBlocks = [];
  for (let i = 1; i <= 3; i++) {
    await click(q('[aria-label="Next day"]'));
    await C.sleep(350);
    dayBlocks.push(await blockTop());
  }
  check('and each next day continues the projected overnight routine from the day before', (await contLabel()) === 'Continues from yesterday: Night routine');
  check('and at 05:00 on each of the next days (projected, a little lighter)', dayBlocks.every((b) => b && Math.abs(b.top - 5 * PX) <= 3 && b.op < 1), JSON.stringify(dayBlocks));
  await shot('cp8h-timebox-daily');
  await click(q('[aria-label="Go to today"]'));

  // ================================================== 4. a projected card cannot go to another Day or the left list
  await click(q('[aria-label="Next week"]'));
  await waitCards('Daily walk', 7);
  const src = await rectOf(inNth('Daily walk', 1, '[aria-label="Title Daily walk"]'));
  const col2 = await rectOf(inNth('Daily walk', 2, '[aria-label="Title Daily walk"]'));
  win.webContents.sendInputEvent({ type: 'mouseMove', x: src.x, y: src.y });
  await C.sleep(120);
  mouse('mouseDown', src.x, src.y);
  for (let i = 1; i <= 12; i++) {
    win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(src.x + ((col2.x - src.x) * i) / 12), y: Math.round(src.y + ((col2.y + 40 - src.y) * i) / 12), modifiers: ['leftButtonDown'] });
    await C.sleep(18);
  }
  await C.sleep(700);
  const lifted = await body();
  check('over another Day column a projected card says it cannot go there (and there is no "Add as subtask")', lifted.includes('Does not repeat') && !lifted.includes('Add as subtask'));
  const highlighted = await js(`Array.from(document.querySelectorAll('*')).some((e) => { const s = getComputedStyle(e); return s.outlineStyle === 'solid' && s.outlineWidth === '1px' && e.getBoundingClientRect().height > 300 && e.getBoundingClientRect().width < 300; })`);
  check('no Day column is highlighted as a drop target', !highlighted);
  mouse('mouseUp', col2.x, col2.y + 40);
  await C.sleep(500);
  check('releasing there changes nothing', rows().length === rowsBefore && (await countCards('Daily walk')) === 7);
  const left = await rectOf(q('[aria-label="Task Plain thought"]'));
  win.webContents.sendInputEvent({ type: 'mouseMove', x: src.x, y: src.y });
  await C.sleep(120);
  mouse('mouseDown', src.x, src.y);
  for (let i = 1; i <= 12; i++) {
    win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(src.x + ((left.x - src.x) * i) / 12), y: Math.round(src.y + ((left.y - src.y) * i) / 12), modifiers: ['leftButtonDown'] });
    await C.sleep(18);
  }
  await C.sleep(400);
  check('over the left list it says the same', (await body()).includes('Does not repeat'));
  mouse('mouseUp', left.x, left.y);
  await C.sleep(500);
  check('and releasing there changes nothing', rows().length === rowsBefore && rootRows('rt').length === 1 && (await countCards('Daily walk')) === 7);

  // ================================================== 5. tick one day
  // A completed task is hidden unless Show complete is on (as for any task); turn it on so the ticked day stays on the board.
  await click(q('[aria-label="Filter"]'));
  await click(q('[data-popover] [aria-label="Show complete"]'));
  await press('Escape');
  await C.sleep(300);
  await click(inNth('Daily walk', 2, '[aria-label="Mark Daily walk complete"]'));
  await C.waitFor(() => rows().length === rowsBefore + 1, 8000).catch(() => {});
  const added = rows().filter((r) => !['rt', 'dm', `dm:${today}`, 'rv', 'th', 'tt', 'ms', 'nr'].includes(r.id));
  check('ticking one projected card stores exactly that day as a real task with the occurrence id', added.length === 1 && /^rt:\d{4}-\d{2}-\d{2}$/.test(added[0].id) && added[0].completed === true && !!added[0].completedAt, JSON.stringify(added));
  const tickedKey = added[0].id.slice(3);
  check('the stored day keeps the series time and rule, and nothing else was stored', added[0].startTime === '05:00' && added[0].recurrence === 'daily' && added[0].dueDate === tickedKey && rows().length === rowsBefore + 1);
  await waitCards('Daily walk', 7);
  const afterTick = await projectedFlags('Daily walk');
  check('that column still shows one card, now the stored one; the other six stay projected', afterTick.length === 7 && afterTick[2] === false && afterTick.filter(Boolean).length === 6, JSON.stringify(afterTick));
  check('only that day is completed', (await js(`${cardsExpr('Daily walk')}.filter((c) => c.querySelector('[aria-label="Mark Daily walk incomplete"]')).length`)) === 1);

  // ================================================== 6. skip this day
  await click(inNth('Daily walk', 3, '[aria-label="More actions for Daily walk"]'));
  await click(q('[data-popover] [aria-label="Skip this day"]'));
  await C.waitFor(() => rows().some((r) => r.deletedAt && r.id.startsWith('rt:')), 8000).catch(() => {});
  const skipped = rows().find((r) => r.deletedAt && r.id.startsWith('rt:'));
  check('Skip this day writes a tombstone with that day\'s occurrence id', !!skipped && skipped.recurrence === 'daily' && skipped.completed === false, JSON.stringify(skipped));
  await waitCards('Daily walk', 6);
  check('that day no longer shows the routine, the other six days do', (await countCards('Daily walk')) === 6);
  await shot('cp8h-skip-and-tick');

  // ================================================== 7. edit on a projected card applies to every day
  await click(inNth('Daily walk', 4, '[aria-label^="Subtasks"]'));
  check('an expanded projected card says "Repeating: changes apply to every day"', (await cardTexts('Daily walk')).some((tx) => tx.includes('Repeating: changes apply to every day')));
  await click(inNth('Daily walk', 4, '[aria-label^="Duration of"]'));
  await click(q('[data-popover] [aria-label="45 min"]'));
  await C.waitFor(async () => (await chip('Daily walk', 0)) === '0:45', 8000).catch(() => {});
  const chips = [];
  const total = await countCards('Daily walk');
  for (let i = 0; i < total; i++) chips.push(await chip('Daily walk', i));
  check('a duration change on one projected card shows on every day', chips.every((c) => c === '0:45'), JSON.stringify(chips));
  const stored = rows().filter((r) => r.id.startsWith('rt') && !r.deletedAt);
  check('it was written to the template and the open stored rows, with no new row', rows().length === rowsBefore + 2 && stored.every((r) => r.completed || r.durationMinutes === 45) && stored.find((r) => r.id === `rt:${tickedKey}`).durationMinutes === 45);
  check('the ticked day is still completed with its completion time', rowById(`rt:${tickedKey}`).completed === true && !!rowById(`rt:${tickedKey}`).completedAt);
  // rename from a projected card
  await click(inNth('Daily walk', 4, '[aria-label="Title Daily walk"]'));
  await C.sleep(200);
  await type('Daily stroll');
  await enter();
  await C.waitFor(() => rowById('rt').title === 'Daily stroll', 8000).catch(() => {});
  await waitCards('Daily stroll', total);
  check('renaming a projected card renames the routine on every open day', (await countCards('Daily stroll')) === total && (await countCards('Daily walk')) === 0, `${await countCards('Daily stroll')} stroll, ${await countCards('Daily walk')} walk`);
  check('the ticked day is still completed after the rename', rowById(`rt:${tickedKey}`).completed === true);

  // ================================================== 8. the label filter applies to projected cards
  await click(q('[aria-label="Filter (1)"]'));
  await click(q('[data-popover] [aria-label="Filter label Work"]'));
  await C.sleep(400);
  check('with the label Work ticked, the unlabelled routine is hidden on every day', (await countCards('Daily stroll')) === 0);
  check('and the labelled weekly Review shows on its Friday', (await countCards('Review')) === 1);
  await press('Escape');
  await click(q('[aria-label="Filter (2)"]'));
  await click(q('[data-popover] [aria-label="Filter label Work"]'));
  await press('Escape');
  await C.sleep(300);
  check('unticking the label brings the routine back', (await countCards('Daily stroll')) === total);

  // ================================================== 9. Does not repeat ends the series
  await click(inNth('Daily stroll', 5, '[aria-label^="Repeat"]'));
  await click(q('[data-popover] [aria-label="Repeat Does not repeat"]'));
  await click(q('[data-popover] [aria-label="Apply repeat"]'));
  await C.waitFor(() => rootRows('rt').every((r) => !r.recurrence), 8000).catch(() => {});
  check('Does not repeat clears the rule on EVERY stored row of the series', rootRows('rt').length > 0 && rootRows('rt').every((r) => !r.recurrence && !r.recurrenceDays), JSON.stringify(rootRows('rt').map((r) => [r.id, r.recurrence])));
  await C.sleep(400);
  const remaining = await countCards('Daily stroll');
  check('the projections are gone: only the stored days remain', remaining >= 1 && remaining <= 2 && (await projectedFlags('Daily stroll')).every((f) => !f), String(remaining));
  await click(q('[aria-label="Next week"]'));
  await C.sleep(300);
  check('and the following week shows none', (await countCards('Daily stroll')) === 0);
  check('no full viewport overlay at any point', await noNewOverlay());
  app.exit(summary() ? 1 : 0);
}
