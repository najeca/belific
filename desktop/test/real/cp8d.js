'use strict';
// Real pointer check for 2.12.2: "Daily" in the Repeat dropdown. Real mouse input
// into the real app on an isolated data folder asserted NOT to be the real one.
const fs = require('node:fs');
const path = require('node:path');
const { app, shell } = require('electron');
const C = require('./common');

process.env.BELIFIC_NO_PROTOCOL_REGISTER = '1';
const userData = C.isolate();
const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

run().catch((err) => {
  console.log(`FAIL harness error: ${err.stack || err}`);
  app.exit(1);
});

async function run() {
  const { check, summary } = C.makeChecker();
  shell.openExternal = async () => {};
  const now = new Date();
  const today = keyOf(now);
  const tomorrow = keyOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const t = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: '2026-10-06T08:00:00.000Z', updatedAt: '2026-10-06T08:00:00.000Z', ...extra });
  fs.writeFileSync(path.join(dataDir, 'belific_tasks.kv'), JSON.stringify([t('a', 'Alpha', { dueDate: today }), t('b', 'Bravo', { dueDate: today })]));
  const tasks = () => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dataDir, 'belific_tasks.kv'), 'utf8'));
    } catch {
      return [];
    }
  };
  const taskNamed = (title) => tasks().find((x) => x.title === title && !x.deletedAt);

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
  const q = (sel) => `document.querySelector(${JSON.stringify(sel)})`;
  const inCard = (title, inner) => q(`[aria-label="Task ${title}"]:not([data-block-id]) ${inner}`);
  const inPopover = (inner) => q(`[data-popover] ${inner}`);
  const exists = (expr) => js(`!!${expr}`);
  const text = (expr) => js(`(${expr} || {}).innerText || ''`);
  const selected = (expr) => js(`(${expr} || { getAttribute: () => null }).getAttribute('aria-pressed')`);

  // ---- Alpha: pick Daily, apply, complete, next occurrence is tomorrow ----
  await click(inCard('Alpha', '[aria-label^="Repeat"]'));
  const labels = await js(`Array.from(document.querySelectorAll('[data-popover] [aria-label^="Repeat "]')).map((e) => e.getAttribute('aria-label')).filter((l) => l !== 'Repeat summary')`);
  check('options in order: Does not repeat, Daily, Weekly, Every 2 weeks, Monthly', labels.join('|') === 'Repeat Does not repeat|Repeat Daily|Repeat Weekly|Repeat Every 2 weeks|Repeat Monthly', labels.join('|'));
  await click(inPopover('[aria-label="Repeat Daily"]'));
  check('Daily shows the summary "Repeats every day."', (await text(inPopover('[aria-label="Repeat summary"]'))) === 'Repeats every day.');
  check('no day chips are shown for Daily', !(await exists(inPopover('[aria-label="Weekdays"]'))));
  await click(inPopover('[aria-label="Apply repeat"]'));
  await C.waitFor(() => taskNamed('Alpha').recurrence === 'daily', 8000);
  const a = taskNamed('Alpha');
  check('Daily stores recurrence daily with no days or month day', a.recurrence === 'daily' && a.recurrenceDays === undefined && a.recurrenceMonthDay === undefined && a.dueDate === today);
  await C.sleep(400);
  check('the card shows the repeat mark with "Every day"', await exists(inCard('Alpha', '[aria-label="Repeat: Every day"]')));
  await click(inCard('Alpha', '[aria-label="Mark Alpha complete"]'));
  await C.waitFor(() => tasks().some((x) => x.id === `a:${tomorrow}`), 8000).catch(() => {});
  const next = tasks().find((x) => x.id === `a:${tomorrow}`);
  check('completing it creates the next occurrence on the following day', !!next && next.dueDate === tomorrow && next.recurrence === 'daily' && !next.completed);
  check('the original is completed', taskNamed('Alpha') === undefined || taskNamed('Alpha').completed === true);

  // ---- Bravo: Weekly with all seven days switches to Daily ----
  await click(inCard('Bravo', '[aria-label^="Repeat"]'));
  await click(inPopover('[aria-label="Repeat Weekly"]'));
  await click(inPopover('[aria-label="Weekdays"]'));
  check('Weekly with the weekdays stays Weekly', (await selected(inPopover('[aria-label="Repeat Weekly"]'))) === 'true');
  await click(inPopover('[aria-label="Sat"]'));
  await click(inPopover('[aria-label="Sun"]'));
  check('all seven days ticked switches the selection to Daily', (await selected(inPopover('[aria-label="Repeat Daily"]'))) === 'true' && (await selected(inPopover('[aria-label="Repeat Weekly"]'))) !== 'true');
  check('and shows the Daily summary with no day chips', (await text(inPopover('[aria-label="Repeat summary"]'))) === 'Repeats every day.' && !(await exists(inPopover('[aria-label="Weekdays"]'))));
  await click(inPopover('[aria-label="Apply repeat"]'));
  await C.waitFor(() => taskNamed('Bravo').recurrence === 'daily', 8000);
  check('Bravo is stored as daily with no days', taskNamed('Bravo').recurrence === 'daily' && taskNamed('Bravo').recurrenceDays === undefined);
  // reopening a stored daily task opens on Daily
  await C.sleep(400);
  await click(inCard('Bravo', '[aria-label^="Repeat"]'));
  check('a stored daily task opens the dropdown on Daily', (await selected(inPopover('[aria-label="Repeat Daily"]'))) === 'true');

  const failed = summary();
  app.exit(failed ? 1 : 0);
}
