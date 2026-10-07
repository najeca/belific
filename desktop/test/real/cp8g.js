'use strict';
// Real pointer and keyboard check for checkpoint 8.4 (2.14.0): the 24 hour
// Timebox, "My day starts at", overnight blocks and their continuation, column
// order (part A and D), and repeating series with projected occurrences (part C).
// Real mouse and key events into the real app on an isolated data folder
// asserted NOT to be the real one. BELIFIC_SHOTS: a folder for screenshots.
const fs = require('node:fs');
const path = require('node:path');
const { app, shell } = require('electron');
const C = require('./common');

process.env.BELIFIC_NO_PROTOCOL_REGISTER = '1';
const userData = C.isolate();
const SHOTS = process.env.BELIFIC_SHOTS || '';
const pad = (n) => String(n).padStart(2, '0');
const PX = 56; // PX_PER_HOUR
console.log(`USERDATA ${userData}`);

run().catch((err) => {
  console.log(`FAIL harness error: ${err.stack || err}`);
  app.exit(1);
});

async function run() {
  const { check, summary } = C.makeChecker();
  shell.openExternal = async () => {};
  const now = new Date();
  const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = keyOf(now);
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const t = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: '2026-10-06T08:00:00.000Z', updatedAt: '2026-10-06T08:00:00.000Z', ...extra });
  const tasks = [
    t('night', 'Night shift', { durationMinutes: 480, createdAt: '2026-10-06T07:00:00.000Z' }),
    t('ua', 'Col untimed A', { dueDate: today, createdAt: '2026-10-06T08:00:00.000Z' }),
    t('ub', 'Col untimed B', { dueDate: today, createdAt: '2026-10-06T08:30:00.000Z' }),
    t('t14', 'Col timed 1400', { dueDate: today, startTime: '14:00', durationMinutes: 30, createdAt: '2026-10-06T08:05:00.000Z' }),
    t('t09', 'Col timed 0930', { dueDate: today, startTime: '09:30', durationMinutes: 30, createdAt: '2026-10-06T08:10:00.000Z' }),
  ];
  fs.writeFileSync(path.join(dataDir, 'belific_tasks.kv'), JSON.stringify(tasks));
  const read = (key) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dataDir, `${key}.kv`), 'utf8'));
    } catch {
      return [];
    }
  };
  const taskNamed = (title) => read('belific_tasks').find((x) => x.title === title && !x.deletedAt);
  const settingsFile = () => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dataDir, 'belific_desktop_settings.kv'), 'utf8'));
    } catch {
      return null;
    }
  };

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  const js = (code) => win.webContents.executeJavaScript(code, true);
  win.show();
  win.focus();
  win.webContents.focus();
  const body = () => js('document.body.innerText');
  await C.waitFor(async () => (await body()).includes('Night shift'), 20000);

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
  const clickAt = async (x, y, wait = 250) => {
    win.webContents.sendInputEvent({ type: 'mouseMove', x, y });
    await C.sleep(100);
    mouse('mouseDown', x, y);
    mouse('mouseUp', x, y);
    await C.sleep(wait);
  };
  const press = async (keyCode, wait = 60) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode });
    await C.sleep(wait);
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

  // ---- Timebox helpers ----
  const GRID = `document.querySelector('[data-timebox-grid]')`;
  const SCROLLER = `(() => { let e = ${GRID}; while (e && !(['auto', 'scroll'].includes(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight)) e = e.parentElement; return e; })()`;
  const scrollTop = () => js(`(() => { const s = ${SCROLLER}; return s ? s.scrollTop : -1; })()`);
  const setScroll = (y) => js(`(() => { const s = ${SCROLLER}; s.scrollTop = ${y}; return s.scrollTop; })()`);
  const gridRect = () => js(`(() => { const r = ${GRID}.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: r.height }; })()`);
  const paneRect = () => js(`(() => { const r = ${SCROLLER}.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; })()`);
  const yFor = async (min) => (await gridRect()).top + (min / 60) * PX;
  const dayLabel = () => js(`(() => { const b = ${q('[aria-label="Choose a date"]')}; return b ? b.innerText.trim() : ''; })()`);
  const blockSel = (id) => `document.querySelector('[data-block-id="${id}"]:not([data-continuation])')`;
  const contSel = `document.querySelector('[data-continuation]')`;
  const near = (a, b, tol = 3) => Math.abs(a - b) <= tol;
  // Drags with the real mouse: press, move in steps, hold, release.
  const dragTo = async (fromExpr, to, { hold = 150, release = true } = {}) => {
    const a = await rectOf(fromExpr);
    if (!a) throw new Error(`no drag source ${fromExpr}`);
    win.webContents.sendInputEvent({ type: 'mouseMove', x: a.x, y: a.y });
    await C.sleep(120);
    mouse('mouseDown', a.x, a.y);
    for (let i = 1; i <= 14; i++) {
      win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(a.x + ((to.x - a.x) * i) / 14), y: Math.round(a.y + ((to.y - a.y) * i) / 14), modifiers: ['leftButtonDown'] });
      await C.sleep(18);
    }
    await C.sleep(hold);
    if (release) {
      mouse('mouseUp', to.x, to.y);
      await C.sleep(500);
    }
  };

  // ============================================================ A: 24 hours
  const labels = await js(`Array.from(document.querySelectorAll('[data-timebox-grid] *')).filter((e) => e.children.length === 0 && /^\\d\\d:00$/.test(e.textContent)).map((e) => e.textContent)`);
  check('the Timebox has hourly labels from 00:00 to 24:00 (25 of them)', labels.length === 25 && labels[0] === '00:00' && labels[24] === '24:00' && labels[12] === '12:00', JSON.stringify(labels));
  const g0 = await gridRect();
  check('the grid is 24 hours tall (56px an hour)', near(g0.h, 24 * PX + 16, 2), String(g0.h));

  // ---- "My day starts at": the default is 05:00 ----
  await click(q('[aria-label="Next day"]'));
  await C.waitFor(async () => near(await scrollTop(), 5 * PX, 2), 5000).catch(() => {});
  check('with the default 05:00 another day opens with 05:00 at the top', near(await scrollTop(), 5 * PX, 2), String(await scrollTop()));
  await click(q('[aria-label="Go to today"]'));
  const openingFor = (startMin) => {
    const n = new Date();
    const nowMin = n.getHours() * 60 + n.getMinutes();
    const ahead = Math.max(0, nowMin - 60);
    return nowMin >= startMin ? Math.max(startMin, ahead) : ahead;
  };
  await C.sleep(400);
  const todayTop = await scrollTop();
  check('today opens about an hour before now (never before the day start)', Math.abs(todayTop - (openingFor(300) / 60) * PX) <= 20, `${todayTop} vs ${(openingFor(300) / 60) * PX}`);

  // ---- an overnight block: drag the thought to 22:00 ----
  await setScroll(22 * PX - 200);
  await C.sleep(200);
  const y22 = await yFor(22 * 60 + 8);
  const gx = (await gridRect()).left + 200;
  await dragTo(q('[aria-label="Task Night shift"]:not([data-block-id]) [aria-label="Title Night shift"]'), { x: Math.round(gx), y: Math.round(y22) }, { release: false });
  mouse('mouseUp', Math.round(gx), Math.round(y22));
  await C.sleep(500);
  await C.waitFor(() => taskNamed('Night shift') && taskNamed('Night shift').startTime, 8000).catch(() => {});
  const night = taskNamed('Night shift');
  check('dropping at 22:00 places the task today at 22:00 and keeps its 8 hour estimate', night.startTime === '22:00' && night.dueDate === today && night.durationMinutes === 480, JSON.stringify(night));
  await C.sleep(300);
  const gr = await gridRect();
  const blk = await rectOf(blockSel('night'));
  check('the block runs from 22:00 to the bottom of the day (24:00)', near(blk.top, gr.top + 22 * PX, 3) && near(blk.bottom, gr.top + 24 * PX, 4), `${blk.top - gr.top} .. ${blk.bottom - gr.top}`);
  check('the block shows it continues', await exists(q('[aria-label="Continues after 24:00"]')));
  check('the card chip still shows the full 8:00', (await js(`(() => { const el = ${q('[aria-label="Task Night shift"]:not([data-block-id]) [aria-label^="Duration of"]')}; return el ? el.innerText.trim() : null; })()`)) === '8:00');
  await shot('cp8g-overnight-day');

  // ---- next day: "Continues from yesterday" until 06:00 ----
  await click(q('[aria-label="Next day"]'));
  await C.waitFor(() => exists(contSel), 5000).catch(() => {});
  check('the next day shows a "Continues from yesterday" block', await exists(contSel));
  await setScroll(0);
  await C.sleep(250);
  const gn = await gridRect();
  const cont = await rectOf(contSel);
  check('it starts at 00:00 and ends at 06:00', near(cont.top, gn.top, 3) && near(cont.bottom, gn.top + 6 * PX, 4), `${cont.top - gn.top} .. ${cont.bottom - gn.top}`);
  check('it is labelled "Continues from yesterday" with the task name', ((await body()).includes('Continues from yesterday')) && (await js(`${contSel}.getAttribute('aria-label')`)) === 'Continues from yesterday: Night shift');
  check('it is lighter than a normal block', (await js(`parseFloat(getComputedStyle(${contSel}.parentElement.parentElement).opacity || '1') < 1 || parseFloat(getComputedStyle(${contSel}).opacity) < 1`)));
  check('the original block is not drawn on this day, and nothing is stored for the continuation', !(await exists(blockSel('night'))) && read('belific_tasks').length === tasks.length);
  await shot('cp8g-overnight-next');
  await click(contSel);
  check('clicking the continuation opens the same task popover (not a modal)', (await exists(q('[data-popover]'))) && (await noNewOverlay()));
  check('the popover is for the same task (its rename field holds the title, and it shows the full 8 hour estimate)', (await exists(q('[data-popover] [aria-label="Rename Night shift"]'))) && (await js(`${q('[data-popover]')}.innerText`)).includes('8:00'));
  await press('Escape');
  await click(q('[aria-label="Next day"]'));
  await C.sleep(300);
  check('the day after has no continuation', !(await exists(contSel)));

  // ---- resize from the original block, past midnight ----
  await click(q('[aria-label="Go to today"]'));
  await C.sleep(300);
  await setScroll(99999);
  await C.sleep(250);
  const h = await rectOf(q('[aria-label="Resize Night shift"]'));
  win.webContents.sendInputEvent({ type: 'mouseMove', x: h.x, y: h.y });
  await C.sleep(120);
  mouse('mouseDown', h.x, h.y);
  // The handle sits at 24:00 (the drawn end of the block); 8 hours further down is 08:00 the next day.
  for (let i = 1; i <= 16; i++) {
    win.webContents.sendInputEvent({ type: 'mouseMove', x: h.x, y: h.y + Math.round((8 * PX * i) / 16), modifiers: ['leftButtonDown'] });
    await C.sleep(25);
  }
  await C.sleep(150);
  mouse('mouseUp', h.x, h.y + 8 * PX);
  await C.waitFor(() => taskNamed('Night shift').durationMinutes === 600, 6000).catch(() => {});
  check('resizing the original block past midnight (dragging its bottom edge to 08:00 next day) makes it 10 hours', taskNamed('Night shift').durationMinutes === 600, String(taskNamed('Night shift').durationMinutes));
  await click(q('[aria-label="Next day"]'));
  await C.waitFor(() => exists(contSel), 5000).catch(() => {});
  await setScroll(0);
  await C.sleep(250);
  const gn2 = await gridRect();
  const cont2 = await rectOf(contSel);
  check('the continuation now runs until 08:00', near(cont2.bottom, gn2.top + 8 * PX, 4), `${cont2.bottom - gn2.top}`);
  check('the stored task is unchanged apart from its estimate (derived, never stored)', taskNamed('Night shift').startTime === '22:00' && taskNamed('Night shift').dueDate === today);
  await click(q('[aria-label="Go to today"]'));

  // ---- column order: untimed first, then timed by time ----
  const order = await js(`(() => {
    const ua = ${q('[aria-label="Task Col untimed A"]:not([data-block-id])')};
    const left = Math.round(ua.getBoundingClientRect().left);
    return Array.from(document.querySelectorAll('[data-task-card]'))
      .filter((e) => Math.round(e.getBoundingClientRect().left) === left)
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
      .map((e) => e.getAttribute('aria-label').replace('Task ', ''));
  })()`);
  check('column order: untimed first, then timed by start time (09:30, 14:00, 22:00)', JSON.stringify(order) === JSON.stringify(['Col untimed A', 'Col untimed B', 'Col timed 0930', 'Col timed 1400', 'Night shift']), JSON.stringify(order));
  await shot('cp8g-column-order');

  // ---- "My day starts at" in Settings ----
  await click(q('[aria-label="Account and sync settings"]'));
  await C.waitFor(() => exists(q('select[aria-label="My day starts at"]')), 5000).catch(() => {});
  check('Settings has "My day starts at", default 05:00', (await js(`${q('select[aria-label="My day starts at"]')}.value`)) === '05:00');
  check('it offers 48 times in 30 minute steps', (await js(`${q('select[aria-label="My day starts at"]')}.options.length`)) === 48);
  await js(`${q('select[aria-label="My day starts at"]')}.focus()`);
  for (let i = 0; i < 30; i++) await press('Down', 30);
  await C.sleep(300);
  check('arrow keys change it to 20:00', (await js(`${q('select[aria-label="My day starts at"]')}.value`)) === '20:00', String(await js(`${q('select[aria-label="My day starts at"]')}.value`)));
  await C.waitFor(() => settingsFile() && settingsFile().dayStart === '20:00', 6000).catch(() => {});
  check('it is stored in the main process settings, not in the tasks', settingsFile() && settingsFile().dayStart === '20:00' && !JSON.stringify(read('belific_tasks')).includes('20:00"}'));
  await clickAt(6, 6);
  await C.sleep(300);
  check('the Settings modal closed', !(await exists(q('select[aria-label="My day starts at"]'))));
  await C.sleep(500);
  const todayTop2 = await scrollTop();
  check('today now opens by the new rule (before 20:00 it is an hour before now)', Math.abs(todayTop2 - (openingFor(20 * 60) / 60) * PX) <= 20, `${todayTop2} vs ${(openingFor(20 * 60) / 60) * PX}`);
  await click(q('[aria-label="Next day"]'));
  await C.waitFor(async () => near(await scrollTop(), 20 * PX, 2), 5000).catch(() => {});
  check('with 20:00 another day opens with 20:00 at the top', near(await scrollTop(), 20 * PX, 2), String(await scrollTop()));
  await click(q('[aria-label="Next day"]'));
  await C.waitFor(async () => near(await scrollTop(), 20 * PX, 2), 5000).catch(() => {});
  check('and so does the day after', near(await scrollTop(), 20 * PX, 2), String(await scrollTop()));
  await shot('cp8g-daystart-2000');
  await click(q('[aria-label="Go to today"]'));

  // ---- pane scroll and edge dwell keep working with the taller Timebox ----
  const before = await scrollTop();
  const pr = await paneRect();
  win.webContents.sendInputEvent({ type: 'mouseWheel', x: Math.round((pr.left + pr.right) / 2), y: Math.round((pr.top + pr.bottom) / 2), deltaX: 0, deltaY: -240 });
  await C.sleep(400);
  check('the mouse wheel scrolls the taller Timebox', (await scrollTop()) !== before, `${before} -> ${await scrollTop()}`);
  // Drag to the bottom edge of the Timebox pane: it scrolls on its own.
  await setScroll(0);
  await C.sleep(200);
  const pr2 = await paneRect();
  await dragTo(q('[aria-label="Task Col untimed A"]:not([data-block-id]) [aria-label="Title Col untimed A"]'), { x: Math.round((pr2.left + pr2.right) / 2), y: Math.round(pr2.bottom - 8) }, { hold: 900, release: false });
  const auto = await scrollTop();
  check('holding a drag near the bottom of the Timebox scrolls it', auto > 40, String(auto));
  await press('Escape');
  mouse('mouseUp', Math.round((pr2.left + pr2.right) / 2), Math.round(pr2.bottom - 8));
  await C.sleep(400);
  check('Escape cancelled that drag: the card did not move', taskNamed('Col untimed A').dueDate === today && !taskNamed('Col untimed A').startTime);
  const weekLabel = () => js(`(() => { const b = ${q('[aria-label="Jump to week"]')}; return b ? b.innerText.trim() : ''; })()`);
  const w0 = await weekLabel();
  const board = await js(`(() => { const e = ${q('[aria-label="Task Col untimed B"]:not([data-block-id])')}; let b = e; while (b && !(b.scrollWidth > b.clientWidth + 1 && getComputedStyle(b).overflowX !== 'visible')) b = b.parentElement; if (!b) b = e.parentElement; const r = b.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; })()`);
  const from = await rectOf(q('[aria-label="Task Col untimed B"]:not([data-block-id]) [aria-label="Title Col untimed B"]'));
  win.webContents.sendInputEvent({ type: 'mouseMove', x: from.x, y: from.y });
  await C.sleep(100);
  mouse('mouseDown', from.x, from.y);
  const ex = Math.round(board.right - 12);
  const ey = Math.round(board.top + 120);
  for (let i = 1; i <= 14; i++) {
    win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(from.x + ((ex - from.x) * i) / 14), y: Math.round(from.y + ((ey - from.y) * i) / 14), modifiers: ['leftButtonDown'] });
    await C.sleep(18);
  }
  let changed = false;
  for (let i = 0; i < 40 && !changed; i++) {
    win.webContents.sendInputEvent({ type: 'mouseMove', x: ex, y: ey + (i % 2), modifiers: ['leftButtonDown'] });
    await C.sleep(120);
    changed = (await weekLabel()) !== w0;
  }
  await press('Escape');
  mouse('mouseUp', ex, ey);
  await C.sleep(400);
  check('holding a drag at the right edge of the board still changes the week', changed, `${w0} -> ${await weekLabel()}`);
  check('no full viewport overlay at any point', await noNewOverlay());
  app.exit(summary() ? 1 : 0);
}
