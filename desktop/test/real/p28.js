'use strict';
// Real check for 3.9.0 to 3.11.0: a task during a break, follow up. Real mouse input into the real app on
// an isolated data folder; Supabase is the in process fake (signed out, nothing leaves the machine).
//  3.9.0: the chip's menu (right click or its small ⋯ button): "Move out of break" (right after the
//         break, same day, same length) and "Remove time" (Anytime that day), each with a 5 second Undo;
//         a task with several times moves only the time inside the break; a repeating day changes that day
//         only (no question since 3.20.0) and its Undo puts it back; a chip dragged out is a normal move.
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
  const TODAY = day(0);
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, dueDate: TODAY, ...extra });
  const at = (id, title, start, len, extra = {}) => T(id, title, { startTime: start, durationMinutes: len, ...extra });
  const seed = [
    at('tea', 'Tea break', '09:00', 20, { cutsBelow: true }),
    // A daily walk that started a week ago: today's is projected, inside the tea break.
    at('walk', 'Short walk', '09:05', 10, { dueDate: day(-7), recurrence: 'daily', completed: true, completedAt: stamp }),
    at('lunch', 'Lunch', '12:00', 90, { cutsBelow: true }),
    at('pod', 'Listen to a podcast', '12:10', 30, { projectKey: 'work' }),
    at('call', 'Call the bank', '12:15', 20),
    at('pill', 'Take a pill', '08:00', 10, { extraTimes: ['12:40'] }),
    // 3.11.0: one exactly as long as Lunch (90 min), one a minute longer than the tea break (21 min).
    at('exact', 'Exact fit', '19:00', 90),
    at('plus1', 'Plus one', '21:00', 21),
  ];
  fs.writeFileSync(path.join(dataDir, 'belific_tasks.kv'), JSON.stringify(seed));
  fs.writeFileSync(path.join(dataDir, 'belific_projects.kv'), JSON.stringify([{ key: 'work', name: 'Work', colorKey: 'sky', createdAt: stamp, updatedAt: stamp }]));
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
  await I.waitBody('Lunch', 20000);
  await I.click(`document.querySelector('[aria-label="Show Tasks"]')`, 600);
  await C.sleep(1200);

  const V = (sel) => `[...document.querySelectorAll('${sel}')].find((e) => e.getBoundingClientRect().width > 0)`;
  const tb = (id) => `[data-block-id="${id}"]`;
  const chip = (blockId) => V(`[data-host-chip="${blockId}"]`);
  const scrollTo = (expr) => I.js(`(() => { const b = ${expr}; if (b) b.scrollIntoView({ block: 'center' }); return !!b; })()`);
  const undoText = () => I.js(`(document.querySelector('[data-undo-bar]') || {}).innerText || ''`);
  const rightClick = async (expr) => {
    await scrollTo(expr);
    await C.sleep(300);
    const r = await I.js(`(() => { const e = ${expr}; const b = e.getBoundingClientRect(); return { x: Math.round(b.left + 20), y: Math.round(b.top + b.height / 2) }; })()`);
    win.webContents.sendInputEvent({ type: 'mouseMove', x: r.x, y: r.y });
    await C.sleep(80);
    win.webContents.sendInputEvent({ type: 'mouseDown', x: r.x, y: r.y, button: 'right', clickCount: 1 });
    win.webContents.sendInputEvent({ type: 'mouseUp', x: r.x, y: r.y, button: 'right', clickCount: 1 });
    await C.sleep(500);
  };
  const menuOf = (blockId) => `document.querySelector('[data-host-chip-menu="${blockId}"]')`;

  // ======== Right click: the menu ========
  await scrollTo(V(tb('lunch')));
  await C.sleep(300);
  check('Lunch hosts the podcast, the call and the pill\'s 12:40', (await I.js(`(${V(tb('lunch'))} || {}).getAttribute?.('data-host-count')`)) === '3');
  await rightClick(chip('task:pod'));
  const menu = await I.textOf(menuOf('task:pod'));
  check('a right click on a chip opens its menu: Open, Move out of break, Remove time', menu.includes('Move out of break') && menu.includes('Remove time') && menu.includes('Open'), menu);
  await I.shot('p28-01-chip-menu-light');
  await I.click(`${menuOf('task:pod')}.querySelector('[aria-label="Move out of break"]')`, 900);
  const pod = byId('pod');
  check('Move out of break: right after the break, the same day and length', pod.startTime === '13:30' && pod.dueDate === TODAY && pod.durationMinutes === 30, JSON.stringify(pod));
  check('it is a block of its own again', await I.exists(V(tb('pod'))));
  const u1 = await undoText();
  check('an Undo message says what happened', /Moved Listen to a podcast out of Lunch/.test(u1) && /Undo/.test(u1), u1);
  await I.shot('p28-02-moved-out-undo');
  await C.sleep(5600);
  check('the Undo message goes after 5 seconds', !(await undoText()));

  // ======== The small button: Remove time, then Undo ========
  await scrollTo(chip('task:call'));
  await I.click(V('[data-host-menu="task:call"]'), 500);
  check('the small ⋯ button opens the same menu', (await I.textOf(menuOf('task:call'))).includes('Remove time'));
  await I.click(`${menuOf('task:call')}.querySelector('[aria-label="Remove time"]')`, 900);
  const call = byId('call');
  check('Remove time: Anytime on the same day', !call.startTime && call.dueDate === TODAY && call.durationMinutes === 20, JSON.stringify(call));
  check('its Undo message', /Call the bank has no time now/.test(await undoText()));
  await I.click(`document.querySelector('[data-undo-bar] [aria-label="Undo"]')`, 1000);
  check('Undo puts the time back, and it is in the break again', byId('call').startTime === '12:15' && (await I.exists(chip('task:call'))), JSON.stringify(byId('call')));

  // ======== Several times: only the one inside the break ========
  await scrollTo(chip('task:pill@12:40'));
  await I.click(V('[data-host-menu="task:pill@12:40"]'), 500);
  await I.click(`${menuOf('task:pill@12:40')}.querySelector('[aria-label="Move out of break"]')`, 900);
  const pill = byId('pill');
  check('a task with several times moves only its time inside the break', pill.startTime === '08:00' && JSON.stringify(pill.extraTimes) === '["13:30"]', JSON.stringify(pill));
  await I.click(`document.querySelector('[data-undo-bar] [aria-label="Undo"]')`, 1000);
  check('and Undo puts that time back', JSON.stringify(byId('pill').extraTimes) === '["12:40"]', JSON.stringify(byId('pill')));

  // ======== A repeating day ========
  const walkId = `walk:${TODAY}`;
  await scrollTo(V(tb('tea')));
  await C.sleep(300);
  check('today\'s projected walk is a chip in the tea break', await I.exists(chip(`task:${walkId}`)));
  await I.click(V(`[data-host-menu="task:${walkId}"]`), 500);
  await I.click(`${menuOf(`task:${walkId}`)}.querySelector('[aria-label="Move out of break"]')`, 900);
  check('a day of a repeating task asks nothing', !(await I.exists(`document.querySelector('[data-scope-prompt]')`)));
  check('That day only: today\'s walk is stored at 09:20, the series keeps 09:05', byId(walkId)?.startTime === '09:20' && byId('walk').startTime === '09:05', JSON.stringify([byId(walkId), byId('walk')]));
  await C.waitFor(() => I.exists(`document.querySelector('[data-undo-bar]')`), 3000).catch(() => {});
  await I.click(`document.querySelector('[data-undo-bar] [aria-label="Undo"]')`, 1000);
  check('Undo puts today\'s walk back in the break', byId(walkId)?.startTime === '09:05' && byId('walk').startTime === '09:05' && (await I.exists(chip(`task:${walkId}`))), JSON.stringify(byId(walkId)));
  // Found by this check: the Undo once copied today onto the next day stored to carry the series.
  check('Undo leaves one walk today (the day stored to carry the series keeps its own day)', tasks().filter((t) => t.title === 'Short walk' && t.dueDate === TODAY && !t.deletedAt).length === 1, JSON.stringify(tasks().filter((t) => t.id.startsWith('walk')).map((t) => [t.id, t.dueDate, t.startTime])));

  // ======== Drag a chip out ========
  await scrollTo(chip('task:call'));
  await C.sleep(300);
  const a = await I.js(`(() => { const r = ${chip('task:call')}.getBoundingClientRect(); return { x: Math.round(r.left + 30), y: Math.round(r.top + r.height / 2) }; })()`);
  win.webContents.sendInputEvent({ type: 'mouseMove', x: a.x, y: a.y });
  await C.sleep(80);
  win.webContents.sendInputEvent({ type: 'mouseDown', x: a.x, y: a.y, button: 'left', clickCount: 1 });
  // Two hours down (56 px an hour), clear of the break.
  for (let i = 1; i <= 12; i++) {
    win.webContents.sendInputEvent({ type: 'mouseMove', x: a.x, y: a.y + Math.round((168 * i) / 12), modifiers: ['leftButtonDown'] });
    await C.sleep(30);
  }
  await C.sleep(300);
  const lifted = await I.textOf(`document.querySelector('[data-lifted-card]')`);
  check('a chip lifts like a block', lifted.includes('Call the bank'), lifted);
  win.webContents.sendInputEvent({ type: 'mouseUp', x: a.x, y: a.y + 168, button: 'left', clickCount: 1 });
  await C.sleep(900);
  const moved = byId('call');
  check('dropped outside the break it is a normal move: a block of its own, same length', moved.startTime >= '14:00' && moved.durationMinutes === 20 && (await I.exists(V(tb('call')))) && !(await I.exists(chip('task:call'))), JSON.stringify(moved));
  await I.shot('p28-03-dragged-out');

  // ======== 3.10.0: cards and details ========
  // Now: the tea break hosts today's walk (stored at 09:05 by the Undo), Lunch hosts the pill's 12:40.
  const col = `[data-day-col="${TODAY}"]`;
  const card = (title) => V(`${col} [aria-label="Task ${title}"]`);
  const pillOf = (title) => I.js(`(() => { const c = ${card(title)}; const p = c && c.querySelector('[data-host-pill]'); return p ? p.getAttribute('data-host-pill') + '|' + p.innerText : null; })()`);
  const captionOf = (title) => I.js(`(() => { const c = ${card(title)}; const p = c && c.querySelector('[data-host-caption]'); return p ? p.innerText : null; })()`);
  const cardChecks = async (theme) => {
    check(`${theme}: a break's card shows "1 inside"`, (await pillOf('Tea break')) === '1|1 inside' && (await pillOf('Lunch')) === '1|1 inside', JSON.stringify([await pillOf('Tea break'), await pillOf('Lunch')]));
    check(`${theme}: a hosted task's card says "During <break>"`, (await captionOf('Short walk')) === 'During Tea break' && (await captionOf('Take a pill')) === 'During Lunch', JSON.stringify([await captionOf('Short walk'), await captionOf('Take a pill')]));
    check(`${theme}: a task not in a break has neither`, (await captionOf('Call the bank')) === null && (await pillOf('Call the bank')) === null);
    check(`${theme}: Timebox blocks get no caption (no clutter on small blocks)`, !(await I.exists(`document.querySelector('[data-block-id] [data-host-caption], [data-block-id] [data-host-pill]')`)));
  };
  await I.js(`(() => { const s = document.querySelector('[data-strip]'); const c = document.querySelector('${col}'); if (s && c) s.scrollLeft += c.getBoundingClientRect().left - s.getBoundingClientRect().left; })()`);
  await C.sleep(500);
  await cardChecks('light');
  await I.shot('p28-04-cards-light');

  // A break's details: Inside this break.
  const detailText = () => I.textOf(`document.querySelector('[data-detail-panel]')`);
  const closeDetails = async () => {
    if (await I.exists(`document.querySelector('[data-detail-panel]')`)) await I.click(`document.querySelector('[aria-label="Close task details"]')`, 600);
  };
  await I.click(card('Lunch'), 900);
  const lunchD = await I.textOf(`document.querySelector('[data-inside-break]')`);
  check('the break\'s details list "Inside this break": title, time and length, tick and Move out', /Inside this break/i.test(lunchD) && lunchD.includes('Take a pill') && lunchD.includes('10m') && lunchD.includes('Move out') && (await I.exists(`document.querySelector('[data-inside-tick="task:pill@12:40"]')`)), lunchD);
  await I.shot('p28-05-break-details-light');
  await I.click(`document.querySelector('[data-inside-tick="task:pill@12:40"]')`, 900);
  check('ticking there ticks the pill\'s 12:40 only', JSON.stringify(byId('pill').timesDone || []) === '["12:40"]' && !byId('pill').completed, JSON.stringify(byId('pill')));
  await I.click(`document.querySelector('[data-inside-tick="task:pill@12:40"]')`, 900);
  check('and again unticks it', !(byId('pill').timesDone || []).includes('12:40'), JSON.stringify(byId('pill')));
  await I.click(`document.querySelector('[data-inside-open="task:pill@12:40"]')`, 900);
  check('its title opens that task', (await I.js(`[...document.querySelectorAll('[data-detail-panel] input')].map((e) => e.value).join('|')`)).includes('Take a pill'));
  check('a hosted task\'s details say "During: Lunch" with Move out', /During: Lunch/.test(await detailText()) && (await I.exists(`document.querySelector('[data-during-out]')`)), await detailText());
  await I.shot('p28-06-hosted-details-light');
  await I.click(`document.querySelector('[data-during-out]')`, 900);
  check('Move out from the details moves only that time out, with Undo', JSON.stringify(byId('pill').extraTimes) === '["13:30"]' && /Moved Take a pill out of Lunch/.test(await undoText()), JSON.stringify(byId('pill')));
  await I.click(`document.querySelector('[data-undo-bar] [aria-label="Undo"]')`, 1000);
  check('Undo from there puts it back', JSON.stringify(byId('pill').extraTimes) === '["12:40"]');
  await closeDetails();

  // ======== Dark ========
  await I.click(`document.querySelector('[aria-label="Profile and account"]') || document.querySelector('[aria-label="Profile, not signed in"]')`, 500);
  await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 800);
  await I.click(`document.querySelector('[data-theme-setting] [data-theme-mode="dark"]')`, 900);
  if (await I.exists(I.byLabel('Back'))) await I.click(I.byLabel('Back'), 700);
  await I.click(`document.querySelector('[aria-label="Show Tasks"]')`, 900);
  check('the dark theme is on', (await I.js(`document.documentElement.getAttribute('data-theme')`)) === 'dark');
  await cardChecks('dark');
  const pillColors = await I.js(`(() => { const p = ${card('Lunch')}.querySelector('[data-host-pill]'); return getComputedStyle(p).backgroundColor + ' ' + getComputedStyle(p.querySelector('div[dir="auto"]')).color; })()`);
  check('dark: the pill uses its own tokens', pillColors === 'rgb(44, 58, 49) rgb(207, 228, 214)', pillColors);
  await I.shot('p28-07-cards-dark');
  await I.click(card('Tea break'), 900);
  check('dark: the break\'s details list its task', (await I.textOf(`document.querySelector('[data-inside-break]')`)).includes('Short walk'));
  await I.shot('p28-08-break-details-dark');
  await closeDetails();
  await scrollTo(chip('task:pill@12:40'));
  await I.click(V('[data-host-menu="task:pill@12:40"]'), 500);
  await I.shot('p28-09-chip-menu-dark');
  await I.key('Escape', [], 400);

  // ======== 3.11.0: refuse, do not just warn (dark first, then light) ========
  const dragBlockTo = async (id, toExpr, fracY) => {
    await scrollTo(V(tb(id)));
    await C.sleep(400);
    const a = await I.js(`(() => { const r = ${V(tb(id))}.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 6) }; })()`);
    win.webContents.sendInputEvent({ type: 'mouseMove', x: a.x, y: a.y });
    await C.sleep(80);
    win.webContents.sendInputEvent({ type: 'mouseDown', x: a.x, y: a.y, button: 'left', clickCount: 1 });
    win.webContents.sendInputEvent({ type: 'mouseMove', x: a.x, y: a.y + 12, modifiers: ['leftButtonDown'] });
    await C.sleep(100);
    await I.js(`${toExpr}.scrollIntoView({ block: 'center' })`);
    await C.sleep(400);
    const b = await I.js(`(() => { const r = ${toExpr}.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height * ${fracY}) }; })()`);
    for (let i = 1; i <= 10; i++) {
      win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(a.x + ((b.x - a.x) * i) / 10), y: Math.round(b.y - 30 + (30 * i) / 10), modifiers: ['leftButtonDown'] });
      await C.sleep(30);
    }
    await C.sleep(300);
    const hint = await I.textOf(`document.querySelector('[data-lifted-card]')`);
    win.webContents.sendInputEvent({ type: 'mouseUp', x: b.x, y: b.y, button: 'left', clickCount: 1 });
    await C.sleep(900);
    return hint;
  };
  const noticeText = () => I.js(`(document.querySelector('[data-notice-bar]') || {}).innerText || ''`);
  await I.click(`document.querySelector('[data-notice-bar] [aria-label="Dismiss"]')`, 200).catch(() => {});

  const h1 = await dragBlockTo('plus1', V(tb('tea')), 0.5);
  check('dragging a task 1 minute longer than the break over it says "Longer than the break (20 min)"', /Longer than the break \(20 min\)/.test(h1), h1);
  check('and the drop snaps back: the task stays where it was', byId('plus1').startTime === '21:00', JSON.stringify(byId('plus1')));
  check('the note stays on screen after the drop', /Longer than the break \(20 min\)/.test(await noticeText()), await noticeText());
  await I.shot('p28-10-refused-drop-dark');
  await dragBlockTo('exact', V(tb('lunch')), 0.3);
  check('a task exactly as long as the break is hosted', byId('exact').startTime === '12:00' && (await I.js(`(${V(tb('lunch'))} || {}).getAttribute?.('data-host-count')`)) === '2', JSON.stringify(byId('exact')));

  // The details refuse a time that makes a hosted task stick out of its break.
  await scrollTo(chip('task:exact'));
  await I.click(`${chip('task:exact')}.querySelector('div[dir="auto"]')`, 900);
  await I.js(`(() => { const el = document.querySelector('[data-detail-panel] input[aria-label="Time"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, '12:30'); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await C.sleep(900);
  const tn = await I.textOf(`document.querySelector('[data-time-note]')`);
  check('the details refuse it: "Longer than the break. Shorten it or move it out."', tn === 'Longer than the break. Shorten it or move it out.' && byId('exact').startTime === '12:00', tn + ' ' + JSON.stringify(byId('exact')));
  check('the time field shows the old time again', (await I.js(`document.querySelector('[data-detail-panel] input[aria-label="Time"]').value`)) === '12:00');
  await I.shot('p28-11-refused-details-dark');
  await closeDetails();

  // "Do during a break" lists only the breaks the task fits in.
  await I.click(V(`${col} [aria-label="More actions for Plus one"]`), 600);
  await I.click(`document.querySelector('[data-popover] [aria-label="Do during a break"]')`, 900);
  const pick = await I.textOf(`document.querySelector('[data-popover]')`);
  const listed = pick.split('Longer than the break')[0];
  check('"Do during a break" lists Lunch and not the 20 minute tea break', listed.includes('Lunch') && !listed.includes('Tea break'), pick);
  await I.key('Escape', [], 400);

  // Light from here.
  await I.click(`document.querySelector('[aria-label="Profile and account"]') || document.querySelector('[aria-label="Profile, not signed in"]')`, 500);
  await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 800);
  await I.click(`document.querySelector('[data-theme-setting] [data-theme-mode="light"]')`, 900);
  if (await I.exists(I.byLabel('Back'))) await I.click(I.byLabel('Back'), 700);
  await I.click(`document.querySelector('[aria-label="Show Tasks"]')`, 900);

  // 3.12.0: shrinking a break by its resize handle, or by the keys, would take 'exact' out of it: refused,
  // snapped back, nothing written, with the note.
  await I.click(`document.querySelector('[data-notice-bar] [aria-label="Dismiss"]')`, 200).catch(() => {});
  await scrollTo(V(tb('lunch')));
  await C.sleep(400);
  const hnd = await I.js(`(() => { const r = ${V('[aria-label="Resize Lunch"]')}.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
  win.webContents.sendInputEvent({ type: 'mouseMove', x: hnd.x, y: hnd.y });
  await C.sleep(80);
  win.webContents.sendInputEvent({ type: 'mouseDown', x: hnd.x, y: hnd.y, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 8; i++) {
    win.webContents.sendInputEvent({ type: 'mouseMove', x: hnd.x, y: hnd.y - Math.round((28 * i) / 8), modifiers: ['leftButtonDown'] });
    await C.sleep(30);
  }
  await C.sleep(200);
  win.webContents.sendInputEvent({ type: 'mouseUp', x: hnd.x, y: hnd.y - 28, button: 'left', clickCount: 1 });
  await C.sleep(1000);
  const REFUSE = 'Longer than the break. Shorten it or move it out.';
  check('resize handle: the break stays 1 h 30 min', byId('lunch').durationMinutes === 90, JSON.stringify(byId('lunch')));
  check('resize handle: "Longer than the break. Shorten it or move it out."', (await noticeText()).includes(REFUSE), await noticeText());
  check('resize handle: the tasks are still chips inside it, nothing moved', (await I.exists(chip('task:exact'))) && (await I.exists(chip('task:pill@12:40'))) && byId('exact').startTime === '12:00');
  await I.shot('p28-12-resize-refused-light');
  // Keys: 30 minutes shorter, and 30 minutes later (the 12:00 task would stick out at the start).
  for (const [key, mods, label] of [['Up', ['shift'], 'shorter'], ['Down', [], 'later']]) {
    await I.click(`document.querySelector('[data-notice-bar] [aria-label="Dismiss"]')`, 200).catch(() => {});
    await I.js(`(() => { const b = ${V(tb('lunch'))}; b.focus(); return document.activeElement === b; })()`);
    await I.key(key, mods, 900);
    check(`key ${label}: refused with the note, the break unchanged`, (await noticeText()).includes(REFUSE) && byId('lunch').startTime === '12:00' && byId('lunch').durationMinutes === 90, (await noticeText()) + JSON.stringify(byId('lunch')));
  }
  // 30 minutes longer is fine: every task still fits.
  await I.js(`(() => { const b = ${V(tb('lunch'))}; b.focus(); })()`);
  await I.key('Down', ['shift'], 1200);
  check('key longer: allowed (2 h)', byId('lunch').durationMinutes === 120, JSON.stringify(byId('lunch')));

  // Split turned off: its tasks go back to normal blocks.
  await I.click(card('Tea break'), 900);
  await I.click(`document.querySelector('[data-detail-panel] [data-cut-switch]')`, 900);
  await closeDetails();
  check('Split off: the walk is a block of its own again, the tea break hosts nothing', (await I.exists(V(tb(walkId)))) && !(await I.js(`!!(${V(tb('tea'))} || {}).getAttribute?.('data-host-count')`)));
  // A break deleted: its tasks go back to normal blocks.
  await I.click(V(`${col} [aria-label="More actions for Lunch"]`), 600);
  await I.click(`document.querySelector('[data-popover] [aria-label="Delete task"]')`, 500);
  await I.click(`document.querySelector('[data-popover] [aria-label="Confirm delete task"]')`, 1000);
  check('the break deleted: the pill\'s 12:40 is a block again', !!byId('lunch').deletedAt && (await I.exists(V(tb('pill@12:40')))), JSON.stringify(byId('lunch')));
  await I.shot('p28-13-reverted-light');

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
