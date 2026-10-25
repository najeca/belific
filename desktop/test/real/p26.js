'use strict';
// Real check for 3.2.0 to 3.4.0: one day of a repeating task, this day only. Real mouse and key input into
// the real app on an isolated data folder; Supabase is the in process fake (signed out, nothing leaves
// the machine).
//  3.2.0: a projected (not yet stored) day dragged to another Day column moves that day only; "Move this
//         day" in the card's menu; the series' first row dragged to another day (its day skipped, a moved
//         copy stored); no "Does not repeat to move it" refusal any more.
// BELIFIC_SHOTS: a folder for screenshots.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const C = require('./common');
const { makeInput, dayKeyFrom, readKv } = require('./input');

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
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
  const wd = (k) => WEEKDAY[new Date(`${k}T12:00:00`).getDay()];
  // "The weekend": the days two and three from today, every week. It started a week ago and was done then.
  const SAT = day(2);
  const SUN = day(3);
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  const rule = { recurrence: 'weekly', recurrenceDays: [wd(SAT), wd(SUN)] };
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      T('shift', 'Weekend shift', { ...rule, dueDate: day(-5), completed: true, completedAt: stamp }),
      T('shift:' + day(-4), 'Weekend shift', { ...rule, dueDate: day(-4), completed: true, completedAt: stamp }),
      // A new series whose only row is its first row, on SAT.
      T('first', 'First shift', { recurrence: 'weekly', recurrenceDays: [wd(SAT)], dueDate: SAT }),
      T('plain', 'Plain task', { dueDate: day(0) }),
      // 3.3.0: days already moved onto today: one a full hour (a tall block), one 20 minutes (a short one).
      T('gym', 'Gym class', { recurrence: 'weekly', recurrenceDays: [wd(SAT)], dueDate: day(-5), completed: true, completedAt: stamp }),
      T('gym:' + SAT, 'Gym class', { recurrence: 'weekly', recurrenceDays: [wd(SAT)], dueDate: day(0), startTime: '10:00', durationMinutes: 60 }),
      T('call', 'Quick call', { recurrence: 'weekly', recurrenceDays: [wd(SUN)], dueDate: day(-4), completed: true, completedAt: stamp }),
      T('call:' + SUN, 'Quick call', { recurrence: 'weekly', recurrenceDays: [wd(SUN)], dueDate: day(0), startTime: '12:00', durationMinutes: 20 }),
      // 3.4.0: a weekly run on today's weekday at 07:00; today's run is projected (not stored).
      T('run', 'Morning run', { recurrence: 'weekly', recurrenceDays: [wd(day(0))], dueDate: day(-7), startTime: '07:00', durationMinutes: 60, completed: true, completedAt: stamp }),
    ]),
  );
  fs.writeFileSync(path.join(dataDir, 'belific_desktop_panes.kv'), JSON.stringify({ leftCollapsed: false, rightCollapsed: false, center: 'kanban', calendar: 'day' }));

  const read = readKv(dataDir);
  const tasks = () => read('belific_tasks') || [];
  const byId = (id) => tasks().find((t) => t.id === id);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1440, 900);
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await I.waitBody('Plain task', 20000);
  await I.click(`document.querySelector('[aria-label="Show Tasks"]')`, 600);
  await C.sleep(1000);

  const col = (key) => `document.querySelector('[data-day-col="${key}"]')`;
  const cardsIn = (key, title) => `Array.from((${col(key)} || document.createElement('div')).querySelectorAll('[aria-label="Task ${title}"]'))`;
  const countIn = (key, title) => I.js(`${cardsIn(key, title)}.length`);
  const projectedIn = (key, title) => I.js(`${cardsIn(key, title)}.filter((c) => c.getAttribute('data-projected') === '1').length`);
  const drag = async (fromExpr, toExpr, { release = true } = {}) => {
    // Today at the left edge of the strip (as when the app opens), so neither end of the drag is in the
    // board's edge auto scroll zone; measure only once it has settled.
    await I.js(`(() => { const s = document.querySelector('[data-strip]'); const c = ${col(day(0))}; s.scrollLeft += c.getBoundingClientRect().left - s.getBoundingClientRect().left; })()`);
    await C.sleep(600);
    const a = await I.js(`(() => { const e = ${fromExpr}; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + 60), y: Math.round(r.top + 14) }; })()`);
    const b = await I.js(`(() => { const e = ${toExpr}; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 140) }; })()`);
    win.webContents.sendInputEvent({ type: 'mouseMove', x: a.x, y: a.y });
    await C.sleep(80);
    win.webContents.sendInputEvent({ type: 'mouseDown', x: a.x, y: a.y, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 12; i++) {
      win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(a.x + ((b.x - a.x) * i) / 12), y: Math.round(a.y + ((b.y - a.y) * i) / 12), modifiers: ['leftButtonDown'] });
      await C.sleep(25);
    }
    await C.sleep(300);
    const lifted = await I.js(`(document.querySelector('[data-lifted-card]') || {}).innerText || ''`);
    if (process.env.P26_DEBUG) console.log('DRAG', JSON.stringify({ a, b, cols: await I.js(`[...document.querySelectorAll('[data-day-col]')].map((c) => [c.dataset.dayCol, Math.round(c.getBoundingClientRect().left), Math.round(c.getBoundingClientRect().width)])`), ph: await I.js(`[...document.querySelectorAll('[data-drop-placeholder]')].map((e) => e.dataset.dropPlaceholder)`) }));
    if (release) {
      win.webContents.sendInputEvent({ type: 'mouseUp', x: b.x, y: b.y, button: 'left', clickCount: 1 });
      await C.sleep(700);
    }
    return lifted;
  };

  // ======== 3.2.0: drag a projected day to another day ========
  check('Saturday shows the shift as a projected (not stored) card', (await projectedIn(SAT, 'Weekend shift')) === 1);
  check('Sunday too', (await projectedIn(SUN, 'Weekend shift')) === 1);
  await I.shot('p26-01-before');
  const lifted = await drag(`${cardsIn(SAT, 'Weekend shift')}[0]`, col(day(1)));
  check('no "Does not repeat to move it" refusal while it is over another day', !/Does not repeat/.test(lifted) && !/stays on a day/.test(lifted), lifted);
  await C.sleep(400);
  const moved = byId(`shift:${SAT}`);
  check('the day is stored with its own id, on the new Day, keeping its rule', !!moved && moved.dueDate === day(1) && moved.recurrence === 'weekly' && !moved.deletedAt && !moved.completed, JSON.stringify(moved));
  check('the moved day shows on the new Day as a stored card', (await countIn(day(1), 'Weekend shift')) === 1 && (await projectedIn(day(1), 'Weekend shift')) === 0);
  check('Saturday no longer shows the shift', (await countIn(SAT, 'Weekend shift')) === 0);
  check('Sunday still shows its own projected shift', (await projectedIn(SUN, 'Weekend shift')) === 1);
  check('nothing else was written (the root and last week unchanged)', tasks().filter((t) => t.id.startsWith('shift')).length === 3 && byId('shift').dueDate === day(-5));
  await I.shot('p26-02-dragged');

  // ======== 3.2.0: Move this day from the card's menu ========
  await I.click(`${cardsIn(SUN, 'Weekend shift')}[0].querySelector('[aria-label="More actions for Weekend shift"]')`);
  const menu = await I.js(`(document.querySelector('[data-popover]') || {}).innerText || ''`);
  check('the menu of a repeating card offers Move this day beside Skip this day', menu.includes('Move this day') && menu.includes('Skip this day'), menu);
  await I.click(`document.querySelector('[data-popover] [aria-label="Move this day"]')`);
  const picker = await I.js(`(document.querySelector('[data-popover]') || {}).innerText || ''`);
  check('the day picker says only this day moves, and has no Remove day', picker.includes('Only this day moves') && !picker.includes('Remove day'), picker);
  await I.click(`document.querySelector('[data-popover] [aria-label="Move to ${day(4)}"]')`);
  await C.sleep(600);
  const sun = byId(`shift:${SUN}`);
  check('Move this day stores Sunday on the chosen Day with its rule', !!sun && sun.dueDate === day(4) && sun.recurrence === 'weekly', JSON.stringify(sun));
  check('Sunday is empty now, the chosen day shows the moved card', (await countIn(SUN, 'Weekend shift')) === 0 && (await countIn(day(4), 'Weekend shift')) === 1);
  await I.shot('p26-03-menu-moved');

  // ======== 3.2.0: the series' first row ========
  check('the first row shows on its own day as a stored card', (await countIn(SAT, 'First shift')) === 1 && (await projectedIn(SAT, 'First shift')) === 0);
  await drag(`${cardsIn(SAT, 'First shift')}[0]`, col(day(1)));
  await C.sleep(400);
  const root = byId('first');
  const copy = byId(`first:${SAT}`);
  check('the first row is tombstoned keeping its rule (its day skipped)', !!root && !!root.deletedAt && root.recurrence === 'weekly', JSON.stringify(root));
  check('its day is stored as a moved copy on the new Day', !!copy && copy.dueDate === day(1) && copy.recurrence === 'weekly' && !copy.deletedAt, JSON.stringify(copy));
  check('the first row\'s own day does not come back (problem A)', (await countIn(SAT, 'First shift')) === 0);
  check('the moved copy shows on the new Day', (await countIn(day(1), 'First shift')) === 1);
  await I.shot('p26-04-first-row');

  // ======== 3.3.0: moved days say where they came from ========
  const satName = wd(SAT);
  const cardMoved = (key, title) => I.js(`(() => { const c = ${cardsIn(key, title)}[0]; const m = c && c.querySelector('[data-moved-from]'); return m ? { text: m.innerText, from: m.getAttribute('data-moved-from'), label: m.getAttribute('aria-label') } : null; })()`);
  const c1 = await cardMoved(day(1), 'Weekend shift');
  check('the moved card says "Moved from <its day>"', !!c1 && c1.text.includes(`Moved from ${satName}`) && c1.from === SAT, JSON.stringify(c1));
  check('its full caption says this day only', !!c1 && /this day only/.test(c1.label || ''), JSON.stringify(c1));
  check('a card that was not moved has no caption', !(await I.js(`!!${cardsIn(day(0), 'Plain task')}[0].querySelector('[data-moved-from]')`)));
  check('the moved first row\'s copy has the caption too', !!(await cardMoved(day(1), 'First shift')));
  const tb = (id) => `document.querySelector('[data-block-id="${id}"]')`;
  const tall = await I.js(`(() => { const b = ${tb(`gym:${SAT}`)}; return b ? { text: b.innerText, label: b.getAttribute('aria-label'), line: !!b.querySelector('[data-moved-from]') } : null; })()`);
  check('Timebox: a tall moved block shows the caption line', !!tall && tall.line && tall.text.includes(`Moved from ${satName}`), JSON.stringify(tall));
  check('Timebox: its label says it was moved', !!tall && /Moved from/.test(tall.label || ''), JSON.stringify(tall));
  const short = await I.js(`(() => { const b = ${tb(`call:${SUN}`)}; const i = b && b.querySelector('[data-moved-icon]'); return b ? { icon: !!i, iconLabel: i && i.getAttribute('aria-label'), line: !!b.querySelector('[data-moved-from]') } : null; })()`);
  check('Timebox: a short moved block shows the arrow (no room for the line)', !!short && short.icon && !short.line && /Moved from .* this day only/.test(short.iconLabel || ''), JSON.stringify(short));
  await I.shot('p26-05-captions-tasks');
  await I.click(`document.querySelector('[aria-label="Show the Calendar"]') || document.querySelector('[aria-label="Show Calendar"]')`, 1200);
  await C.waitFor(() => I.exists(`document.querySelector('[data-cal-block$="gym:${SAT}"]')`), 6000).catch(() => {});
  const cal = await I.js(`(() => { const b = document.querySelector('[data-cal-block$="gym:${SAT}"]'); return b ? { text: b.innerText, label: b.getAttribute('aria-label'), mark: !!b.querySelector('[data-moved-from], [data-moved-icon]') } : null; })()`);
  check('Calendar: the moved block shows the caption (line or arrow) and says so in its label', !!cal && cal.mark && /Moved from/.test(cal.label || ''), JSON.stringify(cal));
  await I.shot('p26-06-captions-calendar');

  // ======== 3.4.0: This day only / All days ========
  await I.click(`document.querySelector('[aria-label="Show Tasks"]')`, 900);
  const prompt = () => I.js(`(() => { const p = document.querySelector('[data-scope-prompt]'); return p ? { text: p.innerText, def: (p.querySelector('[data-scope-default="1"]') || {}).getAttribute?.('data-scope-choice') } : null; })()`);
  // Drags a Timebox block down by `min` minutes (56 px an hour) with the real mouse.
  const dragBlock = async (id, min) => {
    await I.js(`document.querySelector('[data-block-id="${id}"]').scrollIntoView({ block: 'center' })`);
    await C.sleep(500);
    const a = await I.js(`(() => { const r = document.querySelector('[data-block-id="${id}"]').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 10) }; })()`);
    const dy = Math.round((min / 60) * 56);
    win.webContents.sendInputEvent({ type: 'mouseMove', x: a.x, y: a.y });
    await C.sleep(80);
    win.webContents.sendInputEvent({ type: 'mouseDown', x: a.x, y: a.y, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 10; i++) {
      win.webContents.sendInputEvent({ type: 'mouseMove', x: a.x, y: a.y + Math.round((dy * i) / 10), modifiers: ['leftButtonDown'] });
      await C.sleep(30);
    }
    await C.sleep(250);
    win.webContents.sendInputEvent({ type: 'mouseUp', x: a.x, y: a.y + dy, button: 'left', clickCount: 1 });
    await C.sleep(700);
  };
  const runToday = `run:${day(0)}`;
  check('today\'s run is a projected block on the Timebox', await I.exists(`document.querySelector('[data-block-id="${runToday}"]')`) && !byId(runToday));
  await dragBlock(runToday, 60);
  const p1 = await prompt();
  check('moving a projected repeating block asks This day only / All days', !!p1 && p1.text.includes('This day only') && p1.text.includes('All days'), JSON.stringify(p1));
  check('the default (a projected day) is All days, as before', !!p1 && p1.def === 'all', JSON.stringify(p1));
  await I.shot('p26-07-scope-prompt');
  await I.key('Escape', [], 700);
  check('Escape dismisses it and does what the app did before: the whole series moves to 08:00', byId('run').startTime === '08:00' && !byId(runToday) && !(await prompt()), JSON.stringify(byId('run')));
  await dragBlock(runToday, 60);
  await I.click(`document.querySelector('[data-scope-prompt] [data-scope-choice="day"]')`, 800);
  const stored = byId(runToday);
  check('This day only stores today at 09:00 with its rule', !!stored && stored.startTime === '09:00' && stored.dueDate === day(0) && stored.recurrence === 'weekly', JSON.stringify(stored));
  const carrier = byId(`run:${day(7)}`);
  check('the series keeps 08:00 (next week\'s day carries it)', byId('run').startTime === '08:00' && !!carrier && carrier.startTime === '08:00' && !carrier.completed, JSON.stringify(carrier));
  // A stored, moved day: the default is This day only.
  await dragBlock(`gym:${SAT}`, 60);
  const p2 = await prompt();
  check('a stored day asks too, with This day only as the default', !!p2 && p2.def === 'day', JSON.stringify(p2));
  await I.click(`document.querySelector('[data-scope-prompt] [data-scope-choice="all"]')`, 800);
  check('All days changes the series and that day', byId('gym').startTime === '11:00' && byId(`gym:${SAT}`).startTime === '11:00' && byId(`gym:${SAT}`).dueDate === day(0), JSON.stringify([byId('gym'), byId(`gym:${SAT}`)]));
  check('no prompt is left open', !(await prompt()));

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
