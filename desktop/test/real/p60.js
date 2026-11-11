'use strict';
// @real-input: quiet
// Real check for F5 of PLAN_daily_flow (3.44.0): Plan week, on a FIXED CLOCK (the page's Date is replaced before the app
// loads, so a Monday morning and a Sunday evening can be tested on any day).
//   - the Plan button: "Plan week" on Monday 09:00 and Sunday 17:00, "Wrap up" on Sunday 15:00 and Monday 14:30, "Plan
//     my day" on Tuesday 09:00; the menu always lists Plan my day, Wrap up and Plan week;
//   - Plan week opens on one screen (one main button, Done; no Cancel) in place of the left pane and the centre; the
//     week is Monday 16 to Sunday 22 Nov (from Sunday 17:00 too: next week); seven days with their totals;
//   - a shift is one line on its day and counts once in the day total (11h = the 10h shift with a block inside it, and a
//     1h task);
//   - click a task, then a day: it goes there at once, untimed, its row folds with an Undo; Ctrl+Z puts it back;
//   - drag a task onto a day: it goes there untimed; drag a timed task from one day to another: it keeps its time; Ctrl+Z;
//   - "2 from last week" is one folded line that opens Earlier (Tomorrow, Back to its list, Let go) and closing it comes
//     back to Plan week;
//   - Done closes and the panes come back; nothing red, words 14 px or more.
// Runs quiet.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const C = require('./common');
const { makeInput, readKv } = require('./input');

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
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      T('shift', 'Shift', { dueDate: '2026-11-16', startTime: '08:00', durationMinutes: 600 }),
      T('brief', 'Briefing', { dueDate: '2026-11-16', startTime: '09:00', durationMinutes: 30 }),
      T('read', 'Read', { dueDate: '2026-11-16', durationMinutes: 60 }),
      T('dentist', 'Dentist', { dueDate: '2026-11-17', startTime: '14:00', durationMinutes: 30 }),
      T('mum', 'Call Mum', { durationMinutes: 30 }),
      T('oven', 'Clean the oven', { durationMinutes: 45 }),
      T('shed', 'Tidy the shed', { listKey: 'home' }),
      T('old1', 'Old one', { dueDate: '2026-11-12' }),
      T('old2', 'Old two', { dueDate: '2026-11-13', startTime: '10:00', durationMinutes: 30 }),
    ]),
  );
  fs.writeFileSync(path.join(dataDir, 'belific_lists.kv'), JSON.stringify([{ key: 'home', name: 'House jobs', emoji: '🏠', sortOrder: 0, createdAt: stamp, updatedAt: stamp }]));
  const read = readKv(dataDir);
  const raw = () => read('belific_tasks') || [];
  const live = (id) => raw().find((t) => t.id === id && !t.deletedAt);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1700, 1000);
  win.show();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');

  // ---- the fixed clock: the page's Date, replaced before any page script runs ----
  const dbg = win.webContents.debugger;
  dbg.attach('1.3');
  await dbg.sendCommand('Page.enable');
  let scriptId = null;
  const clockSource = (ms) => `(() => { const R = Date; const start = R.now(); const base = ${ms};
    class D extends R { constructor(...a) { if (a.length === 0) super(base + (R.now() - start)); else super(...a); } static now() { return base + (R.now() - start); } }
    window.Date = D; })()`;
  const setClock = async (y, m, d, h, min) => {
    const ms = new Date(y, m - 1, d, h, min, 0, 0).getTime();
    if (scriptId) await dbg.sendCommand('Page.removeScriptToEvaluateOnNewDocument', { identifier: scriptId });
    scriptId = (await dbg.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: clockSource(ms) })).identifier;
    win.webContents.reload();
    await C.sleep(2500);
    await C.waitFor(() => I.exists(`document.querySelector('[data-plan-button]')`), 20000);
    await C.sleep(900);
  };
  const button = () => I.js(`(() => { const b = document.querySelector('[data-plan-button]'); return b ? [b.getAttribute('data-plan-button'), b.innerText.trim()] : null; })()`);
  const menuText = async () => {
    await I.click(`document.querySelector('[data-plan-menu]')`, 500);
    const t = await I.js(`[...document.querySelectorAll('[data-popover] [role="button"]')].map((b) => b.getAttribute('aria-label')).join('|')`);
    await I.key('Escape', [], 400);
    return t;
  };

  // ---- the Plan button on a Monday morning, a Sunday evening and the others ----
  await setClock(2026, 11, 16, 9, 0);
  let b = await button();
  check('Monday 09:00: the Plan button says "Plan week"', !!b && b[0] === 'week' && b[1].includes('Plan week'), JSON.stringify(b));
  const menu = await menuText();
  check('the menu always lists Plan my day, Wrap up and Plan week, Plan week first', menu.indexOf('Plan week from the menu') === 0 && menu.includes('Plan my day from the menu') && menu.includes('Wrap up from the menu'), menu);

  await I.click(I.byLabel('Show Tasks'), 800).catch(() => {});
  const weekOpen = () => I.exists(`document.querySelector('[data-plan-week]')`);
  const shown = (sel) => I.js(`(() => { const e = document.querySelector('${sel}'); return !!e && e.getBoundingClientRect().width > 0; })()`);
  await I.click(`document.querySelector('[data-plan-button]')`, 1200);
  check('a press opens Plan week on one screen: one main button (Done), no Cancel, no steps', (await weekOpen()) && (await I.exists(`document.querySelector('[data-plan-done]')`)) && !(await I.exists(I.byLabel('Cancel and change nothing'))) && !/Step \d of/.test(await I.body()));
  check('it takes the place of the left pane and the centre', !(await shown('[data-pane="left"]')) && !(await shown('[data-pane="center"]')));
  const days = await I.js(`[...document.querySelectorAll('[data-week-day]')].map((d) => d.getAttribute('data-week-day'))`);
  check('the week is Monday 16 to Sunday 22 November: seven days', JSON.stringify(days) === JSON.stringify(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']), JSON.stringify(days));
  check('the heading says the week plainly', (await I.body()).includes('Plan week · 16 to 22 November'));
  await I.shot('p60-plan-week');

  const total = (d) => I.textOf(`document.querySelector('[data-week-total="${d}"]')`);
  const items = (d) => I.js(`[...document.querySelectorAll('[data-week-day="${d}"] [data-week-item]')].map((e) => e.getAttribute('data-week-item'))`);
  check('a shift is one line on its day (the block inside it is not listed)', JSON.stringify(await items('2026-11-16')) === JSON.stringify(['shift', 'read']), JSON.stringify(await items('2026-11-16')));
  check('and counts once in the day total: 11h (the 10h shift, the 1h task, nothing added for the block inside it)', (await total('2026-11-16')) === '11h', await total('2026-11-16'));
  check('a day with nothing has a dash; Tuesday shows its 30 minutes', (await total('2026-11-18')) === '—' && (await total('2026-11-17')) === '30m', `${await total('2026-11-18')} / ${await total('2026-11-17')}`);
  check('nothing is red and every word is 14 px or more', (await I.js(`![...document.querySelectorAll('[data-plan-week] *')].some((e) => { const m = /rgb\\((\\d+), (\\d+), (\\d+)/.exec(getComputedStyle(e).color); return m && +m[1] > 180 && +m[2] < 110 && +m[3] < 110; })`)) && (await I.js(`[...document.querySelectorAll('[data-plan-week] *')].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 14).map((e) => e.textContent.trim().slice(0, 20))`)).length === 0);

  // ---- click a task, then a day ----
  const folded = (key) => I.js(`document.querySelector('[data-plan-week] [data-wrap-row="${key}"]')?.getAttribute('data-wrap-decided') ?? null`);
  const ctrlZ = async () => {
    await I.blur();
    await I.key('Z', ['control'], 1600);
  };
  check('Brain Dump is the first list, with its tasks', (await I.exists(`document.querySelector('[data-week-task="mum"]')`)) && !(await I.exists(`document.querySelector('[data-week-task="shed"]')`)));
  check('no "Put here" button until a task is chosen', !(await I.exists(`document.querySelector('[data-week-put]')`)));
  await I.click(`document.querySelector('[data-week-task="mum"]')`, 500);
  check('clicking a task chooses it: "Choose a day", and each day offers "Put here"', (await I.exists(`document.querySelector('[data-week-chosen]')`)) && (await I.body()).includes('Choose a day') && (await I.js(`document.querySelectorAll('[data-week-put]').length`)) === 7);
  await I.click(`document.querySelector('[data-week-put="2026-11-18"]')`, 1500);
  check('then a day: it is on that day at once, untimed', live('mum').dueDate === '2026-11-18' && !live('mum').startTime);
  check('the row folds to "Put on a day" with its own Undo; Wednesday shows it and 30m', (await folded('mum')) === 'put' && (await I.exists(`document.querySelector('[data-wrap-undo="mum"]')`)) && JSON.stringify(await items('2026-11-18')) === JSON.stringify(['mum']) && (await total('2026-11-18')) === '30m');
  await I.click(`document.querySelector('[data-wrap-undo="mum"]')`, 1500);
  check('its Undo takes it back off the day', !live('mum').dueDate && (await total('2026-11-18')) === '—' && (await I.exists(`document.querySelector('[data-week-task="mum"]')`)));
  await I.click(`document.querySelector('[data-week-task="mum"]')`, 400);
  await I.click(`document.querySelector('[data-week-put="2026-11-19"]')`, 1500);
  await ctrlZ();
  check('Ctrl+Z puts a placed task back too', !live('mum').dueDate);

  // ---- drag onto a day ----
  const dragTo = (srcExpr, dstExpr) =>
    I.js(`(async () => {
      const el = ${srcExpr}; const dst = ${dstExpr};
      if (!el || !dst) return null;
      const r = el.getBoundingClientRect(); const t = dst.getBoundingClientRect();
      const x0 = r.left + r.width / 2, y0 = r.top + r.height / 2, x1 = t.left + t.width / 2, y1 = t.top + Math.min(60, t.height / 2);
      const o = (x, y) => ({ bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0, buttons: 1, pointerId: 7, pointerType: 'mouse', isPrimary: true });
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      el.dispatchEvent(new PointerEvent('pointerdown', o(x0, y0)));
      for (let i = 1; i <= 8; i++) { window.dispatchEvent(new PointerEvent('pointermove', o(x0 + ((x1 - x0) * i) / 8, y0 + ((y1 - y0) * i) / 8))); await wait(40); }
      await wait(250);
      window.dispatchEvent(new PointerEvent('pointermove', o(x1, y1)));
      await wait(60);
      window.dispatchEvent(new PointerEvent('pointerup', o(x1, y1)));
      return true;
    })()`);
  await dragTo(`document.querySelector('[data-week-task="oven"]')`, `document.querySelector('[data-week-day="2026-11-20"]')`);
  await C.waitFor(() => live('oven').dueDate === '2026-11-20', 4000).catch(() => {});
  check('a task dragged onto a day goes there, untimed', live('oven').dueDate === '2026-11-20' && !live('oven').startTime && (await total('2026-11-20')) === '45m', JSON.stringify(live('oven')));
  await ctrlZ();
  check('Ctrl+Z takes the drop back', !live('oven').dueDate);
  await dragTo(`document.querySelector('[data-week-day="2026-11-17"] [data-week-item="dentist"]')`, `document.querySelector('[data-week-day="2026-11-21"]')`);
  await C.waitFor(() => live('dentist').dueDate === '2026-11-21', 4000).catch(() => {});
  check('a timed task dragged to another day keeps its time', live('dentist').dueDate === '2026-11-21' && live('dentist').startTime === '14:00', JSON.stringify(live('dentist')));
  await ctrlZ();
  check('Ctrl+Z puts it back on its day and time', live('dentist').dueDate === '2026-11-17' && live('dentist').startTime === '14:00');

  // ---- a list, and last week's leftovers ----
  await I.js(`(() => { const s = document.querySelector('[data-plan-list]'); const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, 'home'); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await C.sleep(900);
  check('the picker shows a list\'s tasks', (await I.exists(`document.querySelector('[data-week-task="shed"]')`)) && !(await I.exists(`document.querySelector('[data-week-task="mum"]')`)));
  const line = await I.textOf(`document.querySelector('[data-week-earlier]')`);
  check('last week\'s leftovers are one folded line, "2 from last week" (never "missed")', line.includes('2 from last week') && !/missed|overdue/i.test(await I.textOf(`document.querySelector('[data-plan-week]')`)), line);
  await I.click(`document.querySelector('[data-week-earlier]')`, 1000);
  check('it opens Earlier, with the three buttons of Wrap up on each row', (await I.exists(`document.querySelector('[data-earlier]')`)) && (await I.exists(`document.querySelector('[data-earlier] [data-wrap-for="old1"][data-wrap-btn="tomorrow"]')`)) && (await I.exists(`document.querySelector('[data-earlier] [data-wrap-for="old1"][data-wrap-btn="list"]')`)) && (await I.exists(`document.querySelector('[data-earlier] [data-wrap-for="old1"][data-wrap-btn="letgo"]')`)));
  await I.click(`document.querySelector('[data-earlier] [data-wrap-for="old1"][data-wrap-btn="list"]')`, 1200);
  check('Back to its list works there and saves at once', !live('old1').dueDate);
  await ctrlZ();
  check('Ctrl+Z in Earlier puts it back', live('old1').dueDate === '2026-11-12');
  await I.key('Escape', [], 1000);
  check('closing Earlier comes back to Plan week', (await weekOpen()) && !(await I.exists(`document.querySelector('[data-earlier]')`)));

  // ---- Done ----
  await I.click(`document.querySelector('[data-plan-done]')`, 900);
  check('Done closes, and the panes come back', !(await weekOpen()) && (await shown('[data-pane="center"]')));

  // ---- the Plan button on other days and hours ----
  await setClock(2026, 11, 15, 17, 0);
  b = await button();
  check('Sunday 17:00: "Plan week" again', !!b && b[0] === 'week', JSON.stringify(b));
  await I.click(`document.querySelector('[data-plan-button]')`, 1200);
  const sundayDays = await I.js(`[...document.querySelectorAll('[data-week-day]')].map((d) => d.getAttribute('data-week-day'))`);
  check('and it plans NEXT week: Monday 16 to Sunday 22', sundayDays[0] === '2026-11-16' && sundayDays[6] === '2026-11-22', JSON.stringify(sundayDays));
  await I.click(`document.querySelector('[data-plan-done]')`, 700);
  await setClock(2026, 11, 15, 15, 0);
  b = await button();
  check('Sunday 15:00: "Wrap up" (Plan week starts at 16:00), and the menu still has all three', !!b && b[0] === 'shutdown' && (await menuText()).includes('Plan week from the menu'), JSON.stringify(b));
  await setClock(2026, 11, 16, 14, 30);
  b = await button();
  check('Monday 14:30: back to "Wrap up"', !!b && b[0] === 'shutdown', JSON.stringify(b));
  await setClock(2026, 11, 17, 9, 0);
  b = await button();
  check('Tuesday 09:00: "Plan my day"', !!b && b[0] === 'planning', JSON.stringify(b));

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
