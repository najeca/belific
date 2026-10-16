'use strict';
// Real pointer and keyboard check for checkpoint 11 (2.17.0): streaks and the
// Progress page, derived from repeating series. Real mouse and key events into
// the real app on an isolated data folder asserted NOT to be the real one.
// Supabase is the in process fake from common.js with its in memory table store
// (a real PKCE sign in, nothing leaves the machine). Covers: the quiet line on
// today's card (only from 2, never a zero), the Progress page from the profile
// menu, the keyboard and File, Progress, Escape and Back returning focus, the
// week strip names, "Show streaks", Skip this day, ticking, Does not repeat,
// Delete repeating task, a tick that arrives from another device, and the
// banned wording over every page the feature draws.
// BELIFIC_SHOTS: a folder for screenshots.
const fs = require('node:fs');
const path = require('node:path');
const { app, shell, Menu } = require('electron');
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
  const opened = [];
  shell.openExternal = async (url) => {
    opened.push(url);
  };
  let fake = null;
  app.whenReady().then(() => {
    fake = C.installFakeSupabase();
    fake.logoutOnline = true;
    fake.store = { tables: {} };
  });

  const now = new Date();
  const dayKey = (shift) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + shift);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const dayName = (shift) => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(now.getFullYear(), now.getMonth(), now.getDate() + shift).getDay()];
  const weekdayShort = (shift) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(now.getFullYear(), now.getMonth(), now.getDate() + shift).getDay()];
  const today = dayKey(0);
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  // ---- the seed: one series for every case ----
  const T = (id, title, day, extra = {}) => ({ id, title, dueDate: day, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  const rows = [T('alpha', 'Alpha', today)];
  const dailySeries = (root, title, startShift, doneShifts, skippedShifts = [], rule = { recurrence: 'daily' }) => {
    const list = [T(root, title, dayKey(startShift), { ...rule, completed: doneShifts.includes(startShift), completedAt: doneShifts.includes(startShift) ? `${dayKey(startShift)}T09:00:00.000Z` : undefined })];
    for (const s of doneShifts) if (s !== startShift) list.push(T(`${root}:${dayKey(s)}`, title, dayKey(s), { ...rule, completed: true, completedAt: `${dayKey(s)}T09:00:00.000Z` }));
    for (const s of skippedShifts) list.push(T(`${root}:${dayKey(s)}`, title, dayKey(s), { ...rule, deletedAt: '2026-09-02T00:00:00.000Z' }));
    return list;
  };
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  // Daily walk: 12 days, one skipped (-6), 11 ticked, today open -> 11 days in a row
  rows.push(...dailySeries('dw', 'Daily walk', -12, range(-12, -1).filter((s) => s !== -6), [-6]));
  // Single tick: one tick yesterday -> a run of 1, no line
  rows.push(...dailySeries('st', 'Single tick', -1, [-1]));
  // Gap run: 4 ticked then 4 days not ticked, best 4, current 0
  rows.push(...dailySeries('br', 'Gap run', -8, range(-8, -5)));
  // Weekly plan: one weekday, ticked 3 weeks running (times, not days)
  rows.push(...dailySeries('wp', 'Weekly plan', -17, [-17, -10, -3], [], { recurrence: 'weekly', recurrenceDays: [weekdayShort(-3)] }));
  // A converted routine: nine old ticks (-10..-2) from routine_completions, then the series row (-1)
  rows.push(T('rt_cr1', 'Evening wind down', dayKey(-1), { recurrence: 'daily', reminderMinutes: -1, completed: true, completedAt: `${dayKey(-1)}T20:00:00.000Z` }));
  // Ended and deleted series: no streak at all
  rows.push(...range(-5, -1).map((s) => T(`en:${dayKey(s)}`, 'Ended habit', dayKey(s), { completed: true, completedAt: `${dayKey(s)}T09:00:00.000Z` })));
  rows.push(...range(-3, -1).map((s) => T(`de:${dayKey(s)}`, 'Deleted habit', dayKey(s), { deletedAt: '2026-09-03T00:00:00.000Z' })));
  // Fresh start: begins today, nothing done yet -> no "0" anywhere
  rows.push(T('fs', 'Fresh start', today, { recurrence: 'daily' }));
  // Phone ticked: 2 ticks so far, a third arrives from another device later
  rows.push(...dailySeries('pt', 'Phone ticked', -2, [-2, -1]));
  fs.writeFileSync(path.join(dataDir, 'belific_tasks.kv'), JSON.stringify(rows));
  fs.writeFileSync(path.join(dataDir, 'belific_routines.kv'), JSON.stringify([{ id: 'cr1', title: 'Evening wind down', timeOfDay: 'evening', createdAt: stamp, updatedAt: '2026-10-01T00:00:00.000Z', deletedAt: '2026-10-01T00:00:00.000Z' }]));
  fs.writeFileSync(path.join(dataDir, 'belific_routine_completions.kv'), JSON.stringify(range(-10, -2).map((s) => ({ routineId: 'cr1', date: dayKey(s), completedAt: `${dayKey(s)}T20:00:00.000Z` }))));
  const read = (key) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dataDir, `${key}.kv`), 'utf8'));
    } catch {
      return [];
    }
  };
  const tasks = () => read('belific_tasks');
  const settingsFile = () => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dataDir, 'belific_desktop_settings.kv'), 'utf8'));
    } catch {
      return {};
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
  await C.waitFor(async () => (await body()).includes('Daily walk'), 20000);

  // ---- real input helpers (as in cp9 and cp10) ----
  const visible = (sel) => `Array.from(document.querySelectorAll(${JSON.stringify(sel)})).find((e) => e.getBoundingClientRect().width > 0)`;
  const byLabel = (label) => visible(`[aria-label=${JSON.stringify(label)}]`);
  const rectOf = (expr) =>
    js(`(() => { const el = ${expr}; if (!el) return null; el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = el.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: r.width, h: r.height }; })()`);
  const mouse = (type, x, y) => win.webContents.sendInputEvent({ type, x, y, button: 'left', clickCount: 1 });
  const click = async (expr, wait = 300) => {
    let r = await rectOf(expr);
    if (!r) throw new Error(`no element for ${expr}`);
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
  const press = async (keyCode, wait = 120) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode });
    await C.sleep(wait);
  };
  const enter = async () => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
    win.webContents.sendInputEvent({ type: 'char', keyCode: String.fromCharCode(13) });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
    await C.sleep(250);
  };
  const exists = (expr) => js(`!!${expr}`);
  const activeLabel = () => js(`document.activeElement && document.activeElement.getAttribute('aria-label')`);
  const shot = async (name) => {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    fs.writeFileSync(path.join(SHOTS, `${name}.png`), (await win.webContents.capturePage()).toPNG());
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

  // Cards of a series (one per visible day) and the ones carrying the streak line.
  const cards = (title) => `Array.from(document.querySelectorAll('[aria-label=${JSON.stringify(`Task ${title}`)}]')).filter((e) => e.getBoundingClientRect().width > 0)`;
  const cardCount = (title) => js(`${cards(title)}.length`);
  const lineCards = (title) => js(`${cards(title)}.filter((c) => /in a row/.test(c.innerText)).length`);
  const lineCard = (title) => `${cards(title)}.find((c) => /in a row/.test(c.innerText))`;
  const lineText = (title) => js(`(() => { const c = ${lineCard(title)}; if (!c) return null; const m = /(\\d+ (?:days )?in a row)/.exec(c.innerText); return m ? m[1] : null; })()`);
  const BANNED = /\b(lost|lose|broke|broken|missed|behind|overdue|risk|warning|streak at risk)\b|\b0 (days|of)\b|\b0 in a row\b/i;
  const onProgress = async () => (await body()).includes('Your repeating tasks, over the last few days');
  const progressRow = (title) => js(`(() => { const r = document.querySelector('[aria-label=${JSON.stringify(`Progress for ${title}`)}]'); return r ? r.innerText : null; })()`);
  const stripLabels = (title) => js(`Array.from(document.querySelectorAll('[aria-label=${JSON.stringify(`Progress for ${title}`)}] [role="img"]')).map((e) => e.getAttribute('aria-label'))`);
  const openProgressByMouse = async () => {
    const icon = (await exists(byLabel('Profile and account'))) ? 'Profile and account' : 'Profile, not signed in';
    const open = await exists(`document.querySelector('[role="dialog"][aria-label="Profile menu"]')`);
    if (!open) await click(byLabel(icon));
    await click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Progress"]')`);
    await C.waitFor(onProgress, 8000);
  };
  const goBack = async () => {
    await click(byLabel('Back'));
    await C.waitFor(async () => (await cardCount('Alpha')) > 0, 8000);
  };

  // ======== 0. Nothing leaves the machine while signed out ========
  check('signed out: no network request since launch', fake.hosts.length === 0, JSON.stringify(fake.hosts));

  // ======== 1. The quiet line on today's card ========
  const dwCards = await cardCount('Daily walk');
  check('Daily walk shows on several days', dwCards >= 2, String(dwCards));
  check('only TODAY\'s Daily walk card carries the line, and it says "11 days in a row" (a skipped day does not end the run)', (await lineCards('Daily walk')) === 1 && (await lineText('Daily walk')) === '11 days in a row', `${await lineCards('Daily walk')} ${await lineText('Daily walk')}`);
  check('the converted routine\'s card says "10 days in a row" (9 old ticks plus the series day)', (await lineText('Evening wind down')) === '10 days in a row', String(await lineText('Evening wind down')));
  check('a run of 1 shows no line', (await lineCards('Single tick')) === 0);
  check('a broken run shows no line, no zero and no word about it', (await lineCards('Gap run')) === 0);
  check('a series that begins today shows no line', (await lineCards('Fresh start')) === 0);
  check('the weekly series shows no line on any card (today is not its day)', (await lineCards('Weekly plan')) === 0);
  check('an ended series and a deleted series have no card line', (await lineCards('Ended habit')) === 0 && (await lineCards('Deleted habit')) === 0);
  const homeText = await body();
  check('the board has no loss wording, warning or zero', !BANNED.test(homeText), (BANNED.exec(homeText) || [])[0]);
  const todayCard = `${lineCard('Daily walk')}`;
  check('the card with the line is a keyboard stop (tabIndex 0) and the line is part of its text', await js(`(() => { const c = ${todayCard}; return !!c && c.tabIndex === 0 && /11 days in a row/.test(c.innerText); })()`));
  await shot('cp11-board');

  // ======== 2. The Progress page, from the profile menu with the mouse ========
  await openProgressByMouse();
  check('Progress opens as a page inside the app (not an overlay), panes hidden', (await noNewOverlay()) && (await js(`(() => { const c = document.querySelector('[data-task-card]'); return !c || c.getBoundingClientRect().width === 0; })()`)));
  const page = await body();
  check('Progress has a heading and the plain intro', page.includes('Progress') && page.includes('Nothing here is stored'));
  check('every live series is listed', ['Daily walk', 'Single tick', 'Gap run', 'Weekly plan', 'Evening wind down', 'Fresh start', 'Phone ticked'].every((t) => page.includes(t)));
  check('the ended and the deleted series are not listed', !page.includes('Ended habit') && !page.includes('Deleted habit'));
  const dw = await progressRow('Daily walk');
  check('Daily walk: 11 days in a row, best 11, last 7 days 5 of 5, last 30 days 11 of 11', ['11 days in a row', 'Best: 11 days in a row', 'Last 7 days: 5 of 5', 'Last 30 days: 11 of 11'].every((l) => dw.includes(l)), dw);
  const st = await progressRow('Single tick');
  check('Single tick: no run line and no best line (a run of 1), but the counts show', !/in a row/.test(st) && st.includes('Last 7 days: 1 of 1') && st.includes('Last 30 days: 1 of 1'), st);
  const br = await progressRow('Gap run');
  check('Gap run: no run line, best 4 days in a row, 2 of 6 and 4 of 8', !/^\d+ days in a row/m.test(br) && br.includes('Best: 4 days in a row') && br.includes('Last 7 days: 2 of 6') && br.includes('Last 30 days: 4 of 8'), br);
  const wp = await progressRow('Weekly plan');
  check('Weekly plan counts occurrences: "3 in a row", best "3 in a row"', wp.includes('3 in a row') && wp.includes('Best: 3 in a row') && !wp.includes('days in a row'), wp);
  const ew = await progressRow('Evening wind down');
  check('the converted routine keeps its history: 10 days in a row', ew.includes('10 days in a row') && ew.includes('Best: 10 days in a row'), ew);
  const fsr = await progressRow('Fresh start');
  check('a series with nothing done has no zero anywhere (no "0 of", no "0 days")', !/\b0\b/.test(fsr.replace(/Fresh start/g, '')) && !/in a row|Last 7|Last 30|Best/.test(fsr), fsr);
  check('no loss wording, warning or zero anywhere on the Progress page', !BANNED.test(await body()), (BANNED.exec(await body()) || [])[0]);

  // Week strip: seven squares, each with a text name, in the right states.
  const dwLabels = await stripLabels('Daily walk');
  const expected = [];
  for (let s = -6; s <= 0; s++) expected.push(s === 0 ? 'Today, open' : `${dayName(s)}, ${s === -6 ? 'skipped' : 'done'}`);
  check('Daily walk strip: seven squares named like "Monday, done", the skipped day, and "Today, open"', JSON.stringify(dwLabels) === JSON.stringify(expected), JSON.stringify(dwLabels));
  const brLabels = await stripLabels('Gap run');
  const expectedBr = [];
  for (let s = -6; s <= 0; s++) expectedBr.push(s === 0 ? 'Today, open' : `${dayName(s)}, ${s <= -5 ? 'done' : 'not done'}`);
  check('Gap run strip: "not done" squares are named, not just coloured', JSON.stringify(brLabels) === JSON.stringify(expectedBr), JSON.stringify(brLabels));
  const wpLabels = await stripLabels('Weekly plan');
  check('Weekly plan strip: the other days are named "not scheduled"', wpLabels.filter((l) => /not scheduled/.test(l)).length >= 5 && wpLabels.every((l) => /, (done|not done|skipped|not scheduled|open)$/.test(l) || /^Today, /.test(l)), JSON.stringify(wpLabels));
  const shapes = await js(`(() => {
    const row = document.querySelector('[aria-label="Progress for Daily walk"]');
    const sq = Array.from(row.querySelectorAll('[role="img"]'));
    return sq.map((e) => ({ label: e.getAttribute('aria-label'), kids: e.children.length, dashed: getComputedStyle(e).borderStyle.includes('dashed') }));
  })()`);
  check('the states differ by shape as well as colour (a tick, a dash, a dashed outline)', shapes.filter((s) => /done/.test(s.label)).every((s) => s.kids >= 1) && shapes.find((s) => /skipped/.test(s.label)).kids >= 1 && shapes.find((s) => /^Today/.test(s.label)).dashed);
  await shot('cp11-progress');

  // ======== 3. Keyboard: Escape and Back return focus where it came from ========
  await press('Escape');
  await C.waitFor(async () => !(await onProgress()), 5000);
  check('Escape leaves the Progress page and returns focus to the profile icon (it opened from the profile menu)', (await activeLabel()) === 'Profile, not signed in', String(await activeLabel()));
  await click(byLabel('Profile, not signed in'));
  let reached = false;
  for (let i = 0; i < 8 && !reached; i++) {
    await press('Tab');
    reached = (await activeLabel()) === 'Progress';
  }
  check('Tab inside the profile menu reaches the Progress row', reached, String(await activeLabel()));
  await enter();
  await C.waitFor(onProgress, 8000);
  check('Enter on that row opens the Progress page', await onProgress());
  await press('Escape');
  await C.waitFor(async () => !(await onProgress()), 5000);
  check('Escape returns focus to the profile icon again', (await activeLabel()) === 'Profile, not signed in', String(await activeLabel()));

  // File, Progress (the real menu item), then Back to the card that had focus.
  await js(`(() => { const c = ${todayCard}; c.focus(); return document.activeElement === c; })()`);
  const fileMenu = Menu.getApplicationMenu().items.find((i) => i.label === 'File');
  const progressItem = fileMenu.submenu.items.find((i) => i.label === 'Progress');
  check('File has a Progress item', !!progressItem);
  progressItem.click();
  await C.waitFor(onProgress, 8000);
  check('File, Progress opens the same page', await onProgress());
  await click(byLabel('Back'));
  await C.waitFor(async () => !(await onProgress()), 5000);
  await C.sleep(300);
  check('Back returns to the three panes and focus goes back to the card that had it', await js(`(() => { const c = ${todayCard}; return !!c && document.activeElement === c; })()`));

  // Settings and Labels behave the same way (Escape and focus).
  await click(byLabel('Profile, not signed in'));
  await click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`);
  await C.waitFor(async () => (await body()).toUpperCase().includes('PLANNING'), 8000);
  await click(byLabel('Open Labels'));
  await C.waitFor(async () => (await exists(`document.querySelector('[role="dialog"][aria-label="Labels"]')`)), 8000);
  await press('Escape');
  await C.sleep(400);
  check('Escape on the Labels overlay closes it, Settings still showing, focus on the button that opened it', (await body()).toUpperCase().includes('PLANNING') && !(await exists(`document.querySelector('[role="dialog"][aria-label="Labels"]')`)) && (await activeLabel()) === 'Open Labels', String(await activeLabel()));

  // ======== 4. "Show streaks" ========
  check('Settings has "Show streaks", on by default, with its plain hint', (await body()).includes('Show streaks') && (await body()).includes('once it reaches 2'));
  const toggle = visible('[aria-label="Show streaks"]');
  await click(toggle);
  await C.waitFor(() => settingsFile().showStreaks === false, 5000);
  check('switching it off is saved in the desktop settings (not a synced row)', settingsFile().showStreaks === false);
  await press('Escape');
  await C.sleep(400);
  check('Escape on Settings returns to the panes', !(await body()).toUpperCase().includes('PLANNING') && (await cardCount('Alpha')) > 0);
  check('with it off, no card carries a streak line', (await lineCards('Daily walk')) === 0 && (await lineCards('Evening wind down')) === 0);
  await openProgressByMouse();
  check('the Progress page still shows the numbers with it off', (await progressRow('Daily walk')).includes('11 days in a row'));
  await press('Escape');
  await C.waitFor(async () => !(await onProgress()), 5000);
  await click(byLabel('Profile, not signed in'));
  await click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`);
  await C.waitFor(async () => (await body()).toUpperCase().includes('PLANNING'), 8000);
  await click(visible('[aria-label="Show streaks"]'));
  await C.waitFor(() => settingsFile().showStreaks === true, 5000);
  await press('Escape');
  await C.sleep(500);
  check('switched back on, the line returns on today\'s card', (await lineText('Daily walk')) === '11 days in a row', String(await lineText('Daily walk')));

  // ======== 5. Skip this day, ticking, Does not repeat, Delete repeating task ========
  await click(`${lineCard('Daily walk')}.querySelector('[aria-label="More actions for Daily walk"]')`);
  await click(`document.querySelector('[data-popover] [aria-label="Skip this day"]')`);
  await C.waitFor(() => tasks().some((r) => r.id === `dw:${today}` && r.deletedAt), 8000);
  await openProgressByMouse();
  const dwSkip = await progressRow('Daily walk');
  const skipLabels = await stripLabels('Daily walk');
  check('skipping today leaves the run at 11 days in a row', dwSkip.includes('11 days in a row'), dwSkip);
  check('and today\'s square is named "Today, skipped"', skipLabels[6] === 'Today, skipped', JSON.stringify(skipLabels));
  await press('Escape');
  await C.waitFor(async () => !(await onProgress()), 5000);

  await click(`${lineCard('Evening wind down')}.querySelector('[aria-label="Mark Evening wind down complete"]')`);
  await C.waitFor(() => tasks().some((r) => r.id === `rt_cr1:${today}` && r.completed), 8000);
  await openProgressByMouse();
  check('ticking today adds one: the converted routine is at 11 days in a row', (await progressRow('Evening wind down')).includes('11 days in a row'), await progressRow('Evening wind down'));
  await press('Escape');
  await C.waitFor(async () => !(await onProgress()), 5000);

  await click(`${cards('Single tick')}[0].querySelector('[aria-label^="Repeat"]')`);
  await click(`document.querySelector('[data-popover] [aria-label="Repeat Does not repeat"]')`);
  await click(`document.querySelector('[data-popover] [aria-label="Apply repeat"]')`);
  await C.waitFor(() => tasks().filter((r) => r.id === 'st' || r.id.startsWith('st:')).every((r) => !r.recurrence), 8000);
  await C.sleep(400);
  await click(`${cards('Gap run')}[0].querySelector('[aria-label="More actions for Gap run"]')`);
  await click(`document.querySelector('[data-popover] [aria-label="Delete repeating task"]')`);
  await click(`document.querySelector('[data-popover] [aria-label="Confirm delete repeating task"]')`);
  await C.waitFor(() => tasks().filter((r) => r.id === 'br' || r.id.startsWith('br:')).every((r) => !r.recurrence), 8000);
  await openProgressByMouse();
  const afterEnd = await body();
  check('Does not repeat takes the series off the Progress page', !afterEnd.includes('Single tick'));
  check('Delete repeating task takes its series off the Progress page too', !afterEnd.includes('Gap run'));
  check('the other series are still there', ['Daily walk', 'Weekly plan', 'Evening wind down', 'Phone ticked'].every((t) => afterEnd.includes(t)));
  await press('Escape');
  await C.waitFor(async () => !(await onProgress()), 5000);

  // ======== 6. A tick from another device (through the fake server) ========
  await click(byLabel('Profile, not signed in'));
  await click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Sign in"]')`);
  await click(byLabel('Continue with Apple'));
  await C.waitFor(() => opened.length === 1);
  const url = new URL(opened[0]);
  fake.challenge = url.searchParams.get('code_challenge');
  const flowId = new URL(url.searchParams.get('redirect_to')).searchParams.get('sb_flow_id');
  app.emit('second-instance', {}, [process.execPath, `belific://auth-callback?${flowId ? `sb_flow_id=${flowId}&` : ''}code=GOODCODE`], '');
  await C.waitFor(() => exists(byLabel('Profile and account')), 20000);
  await C.waitFor(() => (fake.store.tables.tasks || []).some((r) => r.id === 'pt'), 20000);
  check('the first sync uploaded the series rows', (fake.store.tables.tasks || []).some((r) => r.id === 'pt'));
  await openProgressByMouse();
  check('before the other device ticks: Phone ticked is at 2 days in a row', (await progressRow('Phone ticked')).includes('2 days in a row'), await progressRow('Phone ticked'));
  // The other device completes today's occurrence (a row the server holds).
  fake.store.tables.tasks.push({
    user_id: 'user-one-1111', id: `pt:${today}`, title: 'Phone ticked', due_date: today, completed: true, completed_at: `${today}T08:00:00.000Z`,
    created_at: stamp, updated_at: new Date().toISOString(), recurrence: 'daily', server_updated_at: new Date(Date.now() + 120000).toISOString(),
  });
  await click(byLabel('Profile and account'));
  await click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Sync now"]')`);
  await C.waitFor(() => tasks().some((r) => r.id === `pt:${today}` && r.completed), 20000);
  await C.waitFor(async () => ((await progressRow('Phone ticked')) || '').includes('3 days in a row'), 10000);
  check('after a sync the run is 3 days in a row, with nothing stored for it', ((await progressRow('Phone ticked')) || '').includes('3 days in a row'));
  check('no streak count is stored anywhere in the data folder', !fs.readdirSync(dataDir).some((f) => /streak/i.test(f)) && !JSON.stringify(tasks()).includes('streak'));
  check('the Progress page still has no loss wording, warning or zero', !BANNED.test(await body()));

  // ======== 7. Network ========
  check('only the fake Supabase host was contacted, nothing unexpected', fake.unexpected.length === 0 && fake.hosts.every((h) => h === C.SUPABASE_HOST), JSON.stringify([...new Set(fake.hosts)]));

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
