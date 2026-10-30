'use strict';
// Real check for 3.18.1 (step 7): dragging a repeating task from the left list onto the Calendar or the Timebox.
// "Zone 2" repeats Mon and Thu and has an empty date. REPRODUCED first on 3.18.0: the drop preview said
// "16:30 to 18:00" but nothing was written. Fixed: a drop on a day that matches the repeat rule sets that day's
// time (this day only; since 3.20.0 the FIRST time of a series goes to every repeat day, with no question), a drop on a day that is not a
// repeat day is refused with a hint, and the empty Task date of a repeating task defaults to its first matching
// repeat day. BELIFIC_SHOTS: a folder for screenshots.
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
  const now = new Date();
  const day = dayKeyFrom(now);
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const wdOf = (shift) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + shift).getDay();
  // The next Thursday (today when it is one) and the next day that is neither Monday nor Thursday.
  let thu = 0;
  while (wdOf(thu) !== 4) thu += 1;
  let off = 1;
  while ([1, 4].includes(wdOf(off))) off += 1;
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  const zone = { recurrence: 'weekly', recurrenceDays: ['Mon', 'Thu'] };
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      T('z', 'Zone 2', { ...zone, durationMinutes: 90 }),
      T('zt', 'Zone timed', { ...zone, durationMinutes: 60, startTime: '08:00' }),
      T('za', 'Zone all', { ...zone, durationMinutes: 60 }),
      T('zo', 'Zone off', { ...zone, durationMinutes: 60 }),
      T('zb', 'Zone box', { ...zone, durationMinutes: 60 }),
      T('pl', 'Plain one'),
      T('anchor', 'Anchor', { dueDate: day(0), startTime: '07:00', durationMinutes: 30 }),
    ]),
  );
  fs.writeFileSync(path.join(dataDir, 'belific_desktop_panes.kv'), JSON.stringify({ leftCollapsed: false, rightCollapsed: false, center: 'calendar', calendar: 'week' }));
  const read = readKv(dataDir);
  const rows = (root) => (read('belific_tasks') || []).filter((t) => t.id === root || t.id.startsWith(`${root}:`));
  const brief = (list) => JSON.stringify(list.map((r) => [r.id, r.dueDate, r.startTime, !!r.deletedAt]));

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1440, 900);
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await I.waitBody('Zone 2', 20000);
  await C.sleep(1000);

  const yAt = (hhmm) => I.js(`(() => { const g = document.querySelector('[data-calendar-grid]').getBoundingClientRect(); const [h, m] = '${hhmm}'.split(':').map(Number); return Math.round(g.top + (h + m / 60) * 56); })()`);
  const colX = (key) => I.js(`(() => { const c = document.querySelector('[data-cal-col="${key}"]'); if (!c) return null; const r = c.getBoundingClientRect(); return Math.round(r.left + r.width / 2); })()`);
  const scrollGridTo = (hhmm) => I.js(`(() => { const s = document.querySelector('[data-cal-scroller]'); const [h] = '${hhmm}'.split(':').map(Number); s.scrollTop = Math.max(0, h * 56 - 120); return s.scrollTop; })()`);
  const cardPoint = (title) => I.js(`(() => { const e = [...document.querySelectorAll('[aria-label="Task ${title}"][data-task-card]')].find((x) => x.getBoundingClientRect().width > 0 && x.getBoundingClientRect().left < 300); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + 90), y: Math.round(r.top + 18) }; })()`);
  const pointerDrag = async (from, to, { hold = 350, release = true } = {}) => {
    win.webContents.sendInputEvent({ type: 'mouseMove', x: from.x, y: from.y });
    await C.sleep(80);
    win.webContents.sendInputEvent({ type: 'mouseDown', x: from.x, y: from.y, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 14; i++) {
      win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(from.x + ((to.x - from.x) * i) / 14), y: Math.round(from.y + ((to.y - from.y) * i) / 14), modifiers: ['leftButtonDown'] });
      await C.sleep(25);
    }
    await C.sleep(hold);
    if (release) {
      win.webContents.sendInputEvent({ type: 'mouseUp', x: to.x, y: to.y, button: 'left', clickCount: 1 });
      await C.sleep(700);
    }
  };
  const bodyText = () => I.js('document.body.innerText');
  const hintNow = () => I.js(`(document.querySelector('[data-lifted-card]') || {}).innerText || ''`);
  const toThu = async (hhmm) => ({ x: await colX(day(thu)), y: (await yAt(hhmm)) + 8 });
  await scrollGridTo('16:00');
  await C.sleep(300);
  await I.shot('p37-before');

  // ======== A: Zone 2 (no time yet) onto Thursday 16:30 -> the first time: every repeat day, no question ========
  // CAUSE (reproduced on 3.18.0): the drop preview said "16:30 to 18:00" but nothing was written. The drop took the
  // "a day of a repeating task moves that day only" path (3.2.0, DragProvider.commitDrop -> write -> seriesActions.moveDay)
  // because the task has a repeat rule and the target day differs from its (empty) Day. moveDay needs a Day to move
  // from (ownDay is undefined for a task with no Day) and returns null without a word.
  let from = await cardPoint('Zone 2');
  check('A: Zone 2 is a card in the left list', !!from, JSON.stringify(from));
  await pointerDrag(from, await toThu('16:30'), { release: false, hold: 450 });
  const prev = await I.js(`(document.querySelector('[data-cal-col="${day(thu)}"] [data-slot-preview]') || {}).innerText || ''`);
  console.log('INFO preview', JSON.stringify(prev), 'lifted', JSON.stringify(await hintNow()), 'previews', await I.js(`document.querySelectorAll('[data-slot-preview]').length`));
  check('A: while dragging, the Thursday column shows the slot 16:30 to 18:00', prev.includes('16:30') && prev.includes('18:00'), prev);
  const upA = await toThu('16:30');
  win.webContents.sendInputEvent({ type: 'mouseUp', x: upA.x, y: upA.y, button: 'left', clickCount: 1 });
  await C.sleep(700);
  check('A: nothing is asked (no popup)', !(await I.exists(`document.querySelector('[data-scope-prompt]')`)));
  await C.sleep(900);
  const za = rows('z');
  const dayRow = za.find((r) => r.dueDate === day(thu) && r.startTime === '16:30');
  check('A: Thursday has 16:30 (90 minutes) and the task now has a Day', !!dayRow && dayRow.durationMinutes === 90 && !dayRow.deletedAt, brief(za));
  check('A: it is the series\' own time (the template), so every repeat day has it', za.length === 1 && dayRow.id === 'z' && dayRow.recurrence === 'weekly', brief(za));
  check('A: the card left the list (it has a Day)', !(await cardPoint('Zone 2')));
  const calText = await I.js(`[...document.querySelectorAll('[data-cal-col="${day(thu)}"] [aria-label^="Calendar block Zone 2"]')].map((e) => e.innerText.replace(/\\s+/g, ' ')).join(' | ')`);
  check('A: the Calendar shows the block on Thursday', /Zone 2/.test(calText), calText);
  await I.shot('p37-placed');
  // The bug found in 3.18.1: the other repeat day showed as an untimed all day chip. Next week both Mon and Thu are timed.
  await I.click(I.byLabel('Calendar next week'), 900);
  await C.sleep(500);
  const nextWeek = await I.js(`[...document.querySelectorAll('[aria-label^="Calendar block Zone 2"]')].map((e) => e.innerText.replace(/\s+/g, ' ').trim())`);
  console.log('INFO next week blocks', JSON.stringify(nextWeek));
  check('A: next week the Monday and the Thursday of Zone 2 are both timed blocks at 16:30', nextWeek.length >= 2 && nextWeek.every((l) => /16:30/.test(l) || /4:30/.test(l)), JSON.stringify(nextWeek));
  const untimed = await I.js(`[...document.querySelectorAll('[aria-label*="Zone 2"]')].filter((e) => !/Calendar block/.test(e.getAttribute('aria-label') || '') && /all day|untimed|Anytime/i.test(e.getAttribute('aria-label') || '')).length`);
  check('A: and none of Zone 2 is an untimed chip', untimed === 0, String(untimed));
  await I.shot('p37-next-week');
  await I.click(I.byLabel('Calendar previous week'), 900);
  await C.sleep(400);

  // ======== B: Zone timed (the series has 08:00) onto Thursday 18:30 -> no question, this day only ========
  from = await cardPoint('Zone timed');
  await pointerDrag(from, await toThu('18:30'));
  await C.sleep(600);
  check('B: a series that has a time is not asked', !(await I.exists(`document.querySelector('[data-scope-prompt]')`)));
  const zt = rows('zt');
  check('B: that Thursday is at 18:30, the series keeps 08:00', zt.some((r) => r.dueDate === day(thu) && r.startTime === '18:30') && zt.some((r) => r.startTime === '08:00' && !r.deletedAt), brief(zt));

  // ======== C: Zone all (no time yet either) -> the series gets 20:00 and starts on Thursday ========
  from = await cardPoint('Zone all');
  await pointerDrag(from, await toThu('19:00'));
  await C.sleep(900);
  const za2 = rows('za');
  check('C: the series gets 19:00 and starts on Thursday', za2.some((r) => r.dueDate === day(thu) && r.startTime === '19:00' && !r.deletedAt), brief(za2));

  // ======== D: a day that is not a repeat day: refused, with the hint, nothing written ========
  from = await cardPoint('Zone off');
  const offTo = { x: await colX(day(off)), y: (await yAt('16:30')) + 8 };
  await pointerDrag(from, offTo, { release: false, hold: 450 });
  const hint = await hintNow();
  check('D: over a non repeat day (' + WD[wdOf(off)] + ') the card says "Drop on a repeat day (Mon, Thu) or change the repeat"', hint.includes('Drop on a repeat day (Mon, Thu) or change the repeat'), hint);
  check('D: and no slot is drawn there', !(await I.exists(`document.querySelector('[data-cal-col="${day(off)}"] [data-slot-preview]')`)));
  await I.shot('p37-refused');
  win.webContents.sendInputEvent({ type: 'mouseUp', x: offTo.x, y: offTo.y, button: 'left', clickCount: 1 });
  await C.sleep(900);
  const zo = rows('zo');
  check('D: nothing was written (still no Day, no time)', zo.length === 1 && !zo[0].dueDate && !zo[0].startTime, brief(zo));
  check('D: a note says why', ((await bodyText()) || '').includes('Drop on a repeat day (Mon, Thu) or change the repeat'));
  check('D: the card is still in the list', !!(await cardPoint('Zone off')));

  // ======== E: the Timebox (when today is a Thursday) ========
  if (thu === 0) {
    await I.click(I.byLabel('Show Tasks'), 900).catch(() => {});
    await C.sleep(500);
    await I.js(`(() => { const g = document.querySelector('[data-timebox-grid]'); let p = g; while (p && p.scrollHeight <= p.clientHeight + 2) p = p.parentElement; if (p) p.scrollTop = 14 * 56; })()`);
    await C.sleep(400);
    const tb = await I.js(`(() => { const g = document.querySelector('[data-timebox-grid]').getBoundingClientRect(); return { x: Math.round(g.left + g.width / 2), top: Math.round(g.top) }; })()`);
    from = await cardPoint('Zone box');
    console.log('INFO timebox', JSON.stringify(tb), JSON.stringify(from));
    await pointerDrag(from, { x: tb.x, y: tb.top + Math.round(16.5 * 56) + 8 }, { release: false, hold: 450 });
    console.log('INFO tb lifted', JSON.stringify(await hintNow()));
    win.webContents.sendInputEvent({ type: 'mouseUp', x: tb.x, y: tb.top + Math.round(16.5 * 56) + 8, button: 'left', clickCount: 1 });
    await C.sleep(800);
    await I.shot('p37-timebox');
    await C.sleep(900);
    check('E: dropped on the Timebox the same way: Thursday 16:30 for the series', rows('zb').some((r) => r.dueDate === day(0) && r.startTime === '16:30'), brief(rows('zb')));
  } else {
    console.log('INFO today is not a Thursday: the Timebox drop (E) is covered by the Calendar drops above');
  }

  // ======== F: the empty Task date of a repeating task defaults to the first matching repeat day ========
  await I.click(I.byLabel('Show Tasks'), 800).catch(() => {});
  await I.click(I.byLabel('Title Plain one'), 900);
  await C.waitFor(() => I.exists(`document.querySelector('[data-detail-panel]')`), 6000);
  await I.click(`document.querySelector('[data-detail-panel] [aria-label^="Repeat:"]')`, 600);
  await I.click(`document.querySelector('[data-popover] [aria-label="Repeat Weekly"]')`, 400);
  await I.click(`document.querySelector('[data-popover] [aria-label="Mon"]')`, 250);
  await I.click(`document.querySelector('[data-popover] [aria-label="Thu"]')`, 250);
  await I.click(`document.querySelector('[data-popover] [aria-label="Apply repeat"]')`, 900);
  const plain = (read('belific_tasks') || []).find((t) => t.id === 'pl');
  let firstDay = 0;
  while (![1, 4].includes(wdOf(firstDay))) firstDay += 1;
  check('F: making a task with no date repeat Mon and Thu gives it a start: the first Mon or Thu from today (' + day(firstDay) + ')', !!plain && plain.recurrence === 'weekly' && plain.dueDate === day(firstDay), JSON.stringify(plain));
  const removeShown = await I.exists(`[...document.querySelectorAll('[data-detail-panel] [aria-label="Remove the day"]')][0]`);
  check('F: a repeating task has no Remove date (it keeps a Day)', removeShown === false, String(removeShown));
  await I.shot('p37-repeat-default');
  await I.key('Escape', [], 500);

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
