'use strict';
// Real keyboard and pointer check for build plan phase 3 (desktop layout).
// Real key and mouse input into the real app, on an isolated data folder
// asserted NOT to be the real one. Supabase is the in process fake from
// common.js: signed out, so nothing leaves the machine. Covers: collapsing
// either pane or both (the centre still works), the layout remembered across a
// reload (user_settings plus the local copy), V between Kanban and Calendar
// (Tab left alone), D, W and M, the all day row, the current time line, the
// 24 hour grid, a block opening the task menu, show only today, quick capture
// (Q, T, Shift+Enter, with a pane hidden), search (Ctrl+K) and showing a result.
// BELIFIC_SHOTS: a folder for screenshots.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const C = require('./common');

process.env.BELIFIC_NO_PROTOCOL_REGISTER = '1';
const userData = C.isolate();
const SHOTS = process.env.BELIFIC_SHOTS || '';
const pad = (n) => String(n).padStart(2, '0');
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

  const now = new Date();
  const dayKey = (shift) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + shift);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const today = dayKey(0);
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      T('a1', 'Alpha today', { dueDate: today, startTime: '10:00', durationMinutes: 60 }),
      T('a2', 'Beta all day', { dueDate: today }),
      T('a3', 'Gamma tomorrow', { dueDate: dayKey(1) }),
      T('a4', 'Delta waiting'),
      T('a5', 'Searchable thing', { notes: 'call the plumber about the tap' }),
      T('a6', 'Far future task', { dueDate: dayKey(21) }),
      T('a7', 'Book in list', { listKey: 'l1' }),
    ]),
  );
  fs.writeFileSync(path.join(dataDir, 'belific_lists.kv'), JSON.stringify([{ key: 'l1', name: 'Reading', sortOrder: 0, createdAt: stamp, updatedAt: stamp }]));
  const read = (key) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dataDir, `${key}.kv`), 'utf8'));
    } catch {
      return null;
    }
  };
  const readText = (key) => {
    try {
      return fs.readFileSync(path.join(dataDir, `${key}.kv`), 'utf8');
    } catch {
      return null;
    }
  };
  const tasks = () => read('belific_tasks') || [];
  const byTitle = (title) => tasks().filter((t) => t.title === title && !t.deletedAt);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  const js = (code) => win.webContents.executeJavaScript(code, true);
  win.show();
  win.focus();
  win.webContents.focus();
  const body = () => js('document.body.innerText');
  const waitBody = (text, ms = 15000) => C.waitFor(async () => (await body()).includes(text), ms);
  await waitBody('Delta waiting', 20000);

  const visible = (sel) => `Array.from(document.querySelectorAll(${JSON.stringify(sel)})).find((e) => e.getBoundingClientRect().width > 0)`;
  const byLabel = (label) => visible(`[aria-label=${JSON.stringify(label)}]`);
  const rectOf = (expr) =>
    js(`(() => { const el = ${expr}; if (!el) return null; el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = el.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
  const click = async (expr, wait = 300) => {
    let r = await rectOf(expr);
    if (!r) throw new Error(`no element for ${expr}`);
    for (let i = 0; i < 10; i++) {
      win.webContents.sendInputEvent({ type: 'mouseMove', x: r.x, y: r.y });
      await C.sleep(120);
      const again = await rectOf(expr);
      const same = again && again.x === r.x && again.y === r.y;
      r = again || r;
      if (same) break;
    }
    win.webContents.sendInputEvent({ type: 'mouseDown', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    win.webContents.sendInputEvent({ type: 'mouseUp', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    await C.sleep(wait);
  };
  const key = async (keyCode, modifiers = [], wait = 250) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    await C.sleep(wait);
  };
  const enter = async (modifiers = [], wait = 400) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return', modifiers });
    win.webContents.sendInputEvent({ type: 'char', keyCode: String.fromCharCode(13), modifiers });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return', modifiers });
    await C.sleep(wait);
  };
  const type = async (text, wait = 150) => {
    await win.webContents.insertText(text);
    await C.sleep(wait);
  };
  const exists = (expr) => js(`!!${expr}`);
  const activeLabel = () => js(`document.activeElement && document.activeElement.getAttribute('aria-label')`);
  const blur = () => js('document.activeElement && document.activeElement.blur()');
  const width = (sel) => js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? Math.round(e.getBoundingClientRect().width) : -1; })()`);
  const calView = () => js(`(() => { const e = Array.from(document.querySelectorAll('[data-calendar]')).find((x) => x.getBoundingClientRect().width > 0); return e ? e.getAttribute('data-calendar') : null; })()`);
  const kanbanShown = () => exists(visible('[aria-label="Jump to date"]'));
  const dialog = (name) => `document.querySelector('[role="dialog"][aria-label=${JSON.stringify(name)}]')`;
  const shot = async (name) => {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    fs.writeFileSync(path.join(SHOTS, `${name}.png`), (await win.webContents.capturePage()).toPNG());
  };
  const panesState = () => {
    const rows = read('belific_user_settings') || [];
    const row = rows.find((r) => r.key === 'ui.panes');
    return { setting: row ? JSON.parse(row.value) : null, local: (() => { try { return JSON.parse(readText('belific_desktop_panes')); } catch { return null; } })() };
  };

  // ======== 1. The default layout ========
  check('all three panes are showing, Tasks (the board) in the centre', (await width('[data-pane="left"]')) > 100 && (await width('[data-pane="center"]')) > 100 && (await width('[data-pane="right"]')) > 100 && (await kanbanShown()));
  check('no calendar yet', (await calView()) === null);
  await shot('p3-01-default');
  const centerWide0 = await width('[data-pane="center"]');

  // ======== 2. Collapsing the panes ========
  await click(byLabel('Hide sidebar'));
  check('the left pane is hidden and a show button sits at the left of the centre top row', (await width('[data-pane="left"]')) <= 0 && (await exists(byLabel('Show sidebar'))));
  check('the centre is wider for it', (await width('[data-pane="center"]')) > centerWide0);
  check('the board still works with the left pane hidden', (await body()).includes('Alpha today'));
  await key('[');
  check('[ brings the left pane back', (await width('[data-pane="left"]')) > 100 && !(await exists(byLabel('Show sidebar'))));
  await key(']');
  check('] hides the right pane; its show button appears at the right of the centre top row', (await width('[data-pane="right"]')) <= 0 && (await exists(byLabel('Show Timebox'))));
  await key('[');
  check('both hidden: the centre has the screen and still shows the board', (await width('[data-pane="left"]')) <= 0 && (await width('[data-pane="right"]')) <= 0 && (await width('[data-pane="center"]')) > centerWide0 && (await body()).includes('Alpha today'));
  await shot('p3-02-both-hidden');
  // the layout is remembered: the setting and the local copy
  const saved = panesState();
  check('the layout is saved in user_settings (ui.panes) and in the local copy', saved.setting && saved.setting.leftCollapsed === true && saved.setting.rightCollapsed === true && saved.local && saved.local.leftCollapsed === true, JSON.stringify(saved));
  await win.webContents.reload();
  await waitBody('Alpha today', 20000);
  await C.sleep(600);
  check('after a reload (a restart of the screen) both panes are still hidden', (await width('[data-pane="left"]')) <= 0 && (await width('[data-pane="right"]')) <= 0);
  await click(byLabel('Show sidebar'));
  await click(byLabel('Show Timebox'));
  check('the show buttons bring the panes back', (await width('[data-pane="left"]')) > 100 && (await width('[data-pane="right"]')) > 100);

  // ======== 3. V switches Kanban and Calendar, Tab does not ========
  await blur();
  await key('v');
  check('V shows the Calendar and hides the Kanban board', (await calView()) === 'week' && !(await kanbanShown()));
  await key('v');
  check('V again shows the Kanban board', (await calView()) === null && (await kanbanShown()));
  await key('Tab');
  await key('Tab');
  check('Tab only moves the keyboard focus: the centre did not change', (await calView()) === null && (await kanbanShown()));
  // typing a V into a box is text
  await click(byLabel('Capture a thought'));
  await type('vwdm');
  check('V, W, D and M typed in a box stay text', (await js(`${byLabel('Capture a thought')}.value`)) === 'vwdm' && (await calView()) === null);
  await js(`(() => { const i = ${byLabel('Capture a thought')}; i.select(); })()`);
  await key('Delete');
  await blur();

  // ======== 4. Day, week and month ========
  await key('d');
  check('D opens the Calendar in the day view', (await calView()) === 'day');
  check('the day view has the all day row with the all day task', await exists(byLabel('All day task Beta all day')));
  check('and the timed task as a block on the hour grid', await exists(byLabel('Calendar block Alpha today')));
  check('and the current time line', await exists(`document.querySelector('[data-calendar] [data-now-line]')`));
  const gridH = await js(`(() => { const g = document.querySelector('[data-calendar-grid]'); return g ? Math.round(g.getBoundingClientRect().height) : 0; })()`);
  check('the grid is the whole 24 hours (24 hours of 56px)', gridH >= 24 * 56, String(gridH));
  const hasHours = await js(`(() => { const t = document.querySelector('[data-calendar-grid]').innerText; return t.includes('00:00') && t.includes('12:00') && t.includes('24:00'); })()`);
  check('00:00 to 24:00 are all on it', hasHours);
  await shot('p3-03-day');
  await key('w');
  // 2.26.0: the week is a rolling strip of days; count the headings on screen.
  check('W is the week view with seven day headings', (await calView()) === 'week' && (await js(`(() => { const sc = document.querySelector('[data-cal-scroller]').getBoundingClientRect(); return Array.from(document.querySelectorAll('[data-calendar] [aria-label]')).filter((e) => { const r = e.getBoundingClientRect(); return /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \\d+$/.test(e.getAttribute('aria-label')) && r.width > 0 && r.left >= sc.left + 40 && r.right <= sc.right + 2; }).length; })()`)) === 7);
  // 2.26.0: the week starts today, so tomorrow is always in it.
  check('the week view shows the all day tasks of its days', (await exists(byLabel('All day task Beta all day'))) && (await exists(byLabel('All day task Gamma tomorrow'))));
  await shot('p3-04-week');
  await key('m');
  check('M is the month view', (await calView()) === 'month');
  check('the month lists a day\'s tasks', await exists(byLabel('Calendar task Alpha today')));
  await shot('p3-05-month');
  // a day with nothing in it (a click on a task chip would open that task)
  await click(`Array.from(document.querySelectorAll('[data-cal-day]')).find((e) => e.getBoundingClientRect().width > 0 && e.innerText.trim().length <= 2)`);
  check('a day in the month opens that day', (await calView()) === 'day');

  // a block opens the task menu (back to today first)
  await click(byLabel('Calendar go to today'));
  await C.sleep(400);
  await click(byLabel('Calendar block Alpha today'));
  // 2.27.0: a block opens the task details modal, as a card and a Timebox block do.
  await C.waitFor(() => exists(dialog('Task details')), 3000).catch(() => {});
  check('a block opens the task details, the same as the Timebox', await exists(dialog('Task details')));
  await key('Escape');
  await C.sleep(300);
  check('Escape closes it', !(await exists(dialog('Task details'))));
  // the calendar has its own filter button and moves by week
  check('the calendar has a filter', (await body()).includes('Filter'));
  await key('w');
  const calTitle = () => js(`(Array.from(document.querySelectorAll('[data-calendar] [role="heading"]')).find((e) => e.getBoundingClientRect().width > 0) || {}).innerText || ''`);
  const titleBefore = await calTitle();
  await click(byLabel('Calendar next week'));
  const titleNext = await calTitle();
  check('Next goes to the next week (the title changes)', !!titleBefore && !!titleNext && titleNext !== titleBefore, `${titleBefore} / ${titleNext}`);
  await click(byLabel('Calendar go to today'));
  check('Today comes back', (await calTitle()) === titleBefore);

  // ======== 5. Show only today ========
  await key('v');
  check('back on the board', await kanbanShown());
  check('the board shows the days (tomorrow is a column)', await exists(`document.querySelector('[data-day-col="${dayKey(1)}"]')`));
  await key('F', ['shift']);
  check('Shift+F: the board shows only today', !(await body()).includes('Tomorrow') && (await body()).includes('Alpha today'));
  check('the Calendar shows today only too', (await (async () => { await key('d'); return (await body()).includes('Showing only today'); })()));
  await key('F', ['shift']);
  await key('v');
  check('Shift+F again shows everything', await exists(`document.querySelector('[data-day-col="${dayKey(1)}"]')`));

  // ======== 6. Quick capture ========
  await blur();
  await key('q');
  check('Q opens quick capture', await exists(dialog('Quick capture')));
  await type('qtvdwm?');
  check('letters typed in quick capture are text', (await js(`document.activeElement.value`)) === 'qtvdwm?');
  await js(`document.activeElement.select()`);
  await key('Delete');
  await type('Captured by Q');
  await enter();
  await C.waitFor(() => byTitle('Captured by Q').length === 1, 8000);
  check('Enter made a Brain Dump task and closed the box', byTitle('Captured by Q').length === 1 && !byTitle('Captured by Q')[0].dueDate && !byTitle('Captured by Q')[0].listKey && !(await exists(dialog('Quick capture'))));
  await blur();
  await key('t');
  check('T opens quick capture for today', (await body()).includes('Quick capture to 📅 Today'));
  await type('Captured today');
  await enter();
  await C.waitFor(() => byTitle('Captured today').length === 1, 8000);
  check('T made a task planned for today', byTitle('Captured today')[0].dueDate === today);
  await blur();
  await key('q');
  await type('First of two');
  await enter(['shift'], 500);
  check('Shift+Enter adds it and keeps the box open', byTitle('First of two').length === 1 && (await exists(dialog('Quick capture'))));
  await type('Second of two');
  await enter();
  await C.waitFor(() => byTitle('Second of two').length === 1, 8000);
  check('and Enter adds the next and closes it', byTitle('Second of two').length === 1 && !(await exists(dialog('Quick capture'))));
  // with the left pane hidden, capture still works and goes to the list shown
  await key('[');
  await key('q');
  await type('Captured with pane hidden');
  await enter();
  await C.waitFor(() => byTitle('Captured with pane hidden').length === 1, 8000);
  check('capture works with the left pane hidden', byTitle('Captured with pane hidden').length === 1);
  await key('[');

  // ======== 7. Search ========
  await blur();
  await key('K', ['control']);
  check('Ctrl+K opens search', await exists(dialog('Search tasks')));
  await type('vqt');
  check('letters typed in search are text', (await js(`document.activeElement.value`)) === 'vqt');
  await js(`document.activeElement.select()`);
  await key('Delete');
  await type('plumber');
  await C.sleep(300);
  check('a word from the notes finds the task', await exists(byLabel('Show Searchable thing')));
  await shot('p3-06-search');
  await enter();
  await C.sleep(700);
  check('Enter shows the task: its card has the keyboard', (await activeLabel()) === 'Task Searchable thing', String(await activeLabel()));
  await blur();
  await key('K', ['control']);
  await type('far future');
  await C.sleep(300);
  await enter();
  await C.sleep(900);
  check('a task three weeks away: the board moved to its week and the card has the keyboard', (await activeLabel()) === 'Task Far future task', String(await activeLabel()));
  await blur();
  await key('K', ['control']);
  await type('book');
  await C.sleep(300);
  await enter();
  await C.sleep(900);
  check('a task in a list: the list was shown and the card has the keyboard', (await activeLabel()) === 'Task Book in list', String(await activeLabel()));
  await blur();
  await key('K', ['control']);
  await type('zzzz nothing');
  await C.sleep(300);
  check('no match says so', (await body()).includes('Nothing found'));
  await key('Escape');
  check('Escape closes search', !(await exists(dialog('Search tasks'))));

  // ======== 2.26.0: the breakpoint. The desktop layout at every window size ========
  const pageWidth = () => js('window.innerWidth');
  const phoneLayout = async () => (await body()).includes('Top 3 tasks') || (await exists(byLabel('Today tab')));
  // A hidden window gets no resize events; make sure it is showing (and each
  // resize below also sends the event itself, for a window the system hides).
  win.show();
  win.focus();
  await C.sleep(300);
  win.setSize(1440, 900);
  await js('window.dispatchEvent(new Event("resize")); 1');
  await C.sleep(700);
  check('1440 wide: the list, the centre and the Timebox side by side', (await width('[data-pane="left"]')) > 200 && (await width('[data-pane="right"]')) > 200);
  win.setSize(1100, 860);
  await js('window.dispatchEvent(new Event("resize")); 1');
  await C.sleep(700);
  check('1100 wide: the Timebox folds away by itself, the list stays', (await width('[data-pane="left"]')) > 200 && (await width('[data-pane="right"]')) <= 0 && (await exists(byLabel('Show Timebox'))));
  check('the remembered layout is not changed by the width', panesState().setting && panesState().setting.rightCollapsed === false);
  win.setSize(860, 860);
  await js('window.dispatchEvent(new Event("resize")); 1');
  await C.sleep(700);
  check('860 wide: the list folds away too, the board still has the centre', (await width('[data-pane="left"]')) <= 0 && (await width('[data-pane="center"]')) > 500 && (await exists(byLabel('Show sidebar'))), JSON.stringify({ left: await width('[data-pane="left"]'), centre: await width('[data-pane="center"]'), page: await js('innerWidth'), labels: await js(`Array.from(document.querySelectorAll('[aria-label]')).filter((e) => e.getBoundingClientRect().width > 0).slice(0, 12).map((e) => e.getAttribute('aria-label'))`) }));
  await click(byLabel('Show sidebar'));
  check('Show sidebar opens the list over the board', (await width('[data-pane="left"]')) > 200 && (await exists(`document.querySelector('[data-sidebar="overlay"]')`)));
  await key('Escape');
  await C.sleep(300);
  check('Escape closes it again', (await width('[data-pane="left"]')) <= 0);
  win.setSize(700, 800);
  await js('window.dispatchEvent(new Event("resize")); 1');
  await C.sleep(800);
  const narrow = await pageWidth();
  check(`at the smallest window (page ${narrow} px wide) it is still the desktop layout, never the phone's Today page`, narrow >= 640 && !(await phoneLayout()) && (await width('[data-pane="center"]')) > 300, String(narrow));
  win.setSize(1440, 900);
  await js('window.dispatchEvent(new Event("resize")); 1');
  await C.sleep(500);

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
