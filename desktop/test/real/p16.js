'use strict';
// Real check for 2.33.0: the "Split" wording and "Vibrant task colours" (Settings, Appearance).
// Real mouse and key input into the real app, isolated data folder, in process fake Supabase.
// OFF (the default) must look exactly as before: colours, sizes and positions are recorded,
// the setting is turned ON (everything gets the vibrant colours and white bold text, the
// layout and tooltips do not move) and OFF again (back to exactly the first record).
// BELIFIC_SHOTS: a folder for screenshots.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const C = require('./common');
const { makeInput, dayKeyFrom } = require('./input');

process.env.BELIFIC_NO_PROTOCOL_REGISTER = '1';
const userData = C.isolate();
console.log(`USERDATA ${userData}`);

run().catch((err) => {
  console.log(`FAIL harness error: ${err.stack || err}`);
  app.exit(1);
});

// WCAG contrast of two "rgb(r, g, b)" strings.
function lum(rgb) {
  const [r, g, b] = rgb.match(/\d+/g).slice(0, 3).map((v) => {
    const s = Number(v) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

async function run() {
  const { check, summary } = C.makeChecker();
  app.whenReady().then(() => {
    const fake = C.installFakeSupabase();
    fake.store = { tables: {} };
  });

  const day = dayKeyFrom(new Date());
  // Tomorrow is the test day, so no block is faded as late; today carries the overnight task's rest.
  const today = day(1);
  const yest = day(0);
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  const BOOT = 'Leep Talent Online Boot Camp Session';
  const seed = [
    T('boot', BOOT, { dueDate: today, startTime: '09:30', durationMinutes: 420, projectKey: 'pb' }),
    T('brk', 'Short Break', { dueDate: today, startTime: '11:00', durationMinutes: 20, cutsBelow: true }),
    T('red', 'Red urgent', { dueDate: today, startTime: '07:00', durationMinutes: 60, projectKey: 'pr', priority: 'high' }),
    T('yel', 'Yellow repeat', { dueDate: today, startTime: '17:30', durationMinutes: 60, projectKey: 'py', recurrence: 'daily' }),
    T('plain', 'Plain no label', { dueDate: today, startTime: '19:00', durationMinutes: 60 }),
    T('allday', 'Orange all day', { dueDate: today, projectKey: 'po', priority: 'high' }),
    T('night', 'Lime overnight', { dueDate: yest, startTime: '23:00', durationMinutes: 180, projectKey: 'pl' }),
  ];
  fs.writeFileSync(path.join(dataDir, 'belific_tasks.kv'), JSON.stringify(seed));
  const label = (key, name, colorKey) => ({ key, name, colorKey, createdAt: stamp, updatedAt: stamp });
  fs.writeFileSync(
    path.join(dataDir, 'belific_projects.kv'),
    JSON.stringify([label('pb', 'Blue', 'sky'), label('pr', 'Red', 'red'), label('py', 'Yellow', 'yellow'), label('po', 'Orange', 'orange'), label('pl', 'Lime', 'lime')]),
  );

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1440, 900);
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await C.sleep(3500);

  const settingsFile = () => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dataDir, 'belific_desktop_settings.kv'), 'utf8'));
    } catch {
      return {};
    }
  };
  const cal = (dayKey, id) => `document.querySelector('[data-cal-block="cal${dayKey}:${id}"]')`;
  const blk = (id) => `document.querySelector('[data-block-id="${id}"]')`;
  // Everything a person sees of one element: its box, its background and every text node's colour and weight.
  const look = (expr) =>
    I.js(`(() => { const e = ${expr}; if (!e) return null; const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
      const texts = []; const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) { const t = n.textContent.trim(); if (t && !n.parentElement.closest('[data-priority-mark],[data-late-move],[aria-label="Repeats"]')) { const cs = getComputedStyle(n.parentElement); texts.push({ t, color: cs.color, fw: cs.fontWeight }); } }
      const icon = e.querySelector('[aria-label="Repeats"]'); const mark = e.querySelector('[data-priority-mark]');
      const anchor = e.closest('[data-cal-col],[data-timebox-grid],[data-cal-day],[data-all-day-cell]') || e.parentElement; const ar = anchor.getBoundingClientRect();
      return { l: Math.round(r.left - ar.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), bg: s.backgroundColor, bl: s.borderLeftColor, title: e.getAttribute('title'),
        texts, repeatColor: icon ? getComputedStyle(icon).color : null, markBg: mark ? getComputedStyle(mark).backgroundColor : null, markTip: mark ? mark.getAttribute('title') : null }; })()`);
  const geom = (x) => x && [x.l, x.t, x.w, x.h].join(',');
  const scrollTo = (hour) => I.js(`(() => { const s = document.querySelector('[data-cal-scroller]'); if (s) s.scrollTop = ${hour} * 56 - 20; })()`);
  const scrollBox = (hour) => I.js(`(() => { const g = document.querySelector('[data-timebox-grid]'); let p = g; while (p && p.scrollHeight <= p.clientHeight + 2) p = p.parentElement; if (p) p.scrollTop = ${hour} * 56 - 20; })()`);
  // All text is white; the title (the first text) is bold, the lines under it medium weight (2.34.0).
  const whiteBold = (x) => x && x.texts.length > 0 && x.texts.every((n) => n.color === 'rgb(255, 255, 255)') && Number(x.texts[0].fw) >= 700;
  const goSettings = async () => {
    const icon = (await I.exists(I.byLabel('Profile and account'))) ? 'Profile and account' : 'Profile, not signed in';
    await I.click(I.byLabel(icon));
    await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 700);
    await I.waitBody('POWER FEATURES', 8000);
  };
  const toggleSwitch = () => I.click(`document.querySelector('[data-vibrant-setting] [role="switch"]')`, 700);
  const switchState = () => I.js(`(() => { const s = document.querySelector('[data-vibrant-setting] [role="switch"]'); return s ? s.getAttribute('aria-checked') || String(s.checked) : null; })()`);

  // ======== The wording: Split (details and Settings), nothing says cut ========
  await scrollTo(9);
  await C.sleep(300);
  await I.click(cal(today, 'brk'), 800);
  await C.waitFor(() => I.exists(`document.querySelector('[data-detail-panel]')`), 4000);
  const row = await I.js(`(() => { const r = document.querySelector('[data-detail-row="Split"]'); return r ? r.innerText.replace(/\\s+/g, ' ').trim() : null; })()`);
  check('Split: the details row is called "Split" with the plain description', !!row && row.includes('Split') && row.includes('Splits the tasks it overlaps, so you still see them before and after it.'), String(row));
  const sw = await I.js(`(() => { const s = document.querySelector('[data-cut-switch]'); return s ? [s.getAttribute('aria-label'), s.getAttribute('aria-checked')] : null; })()`);
  check('Split: the switch has the accessible name "Split" and is on for the break', !!sw && sw[0] === 'Split' && sw[1] === 'true', JSON.stringify(sw));
  const rowTip = await I.js(`(() => { const r = document.querySelector('[data-detail-row="Split"] [role="heading"], [data-detail-row="Split"] [aria-label]'); return r ? [r.getAttribute('title'), r.getAttribute('aria-label')] : null; })()`);
  check('Split: its tooltip is "Split"', !!rowTip && rowTip.every((v) => v === 'Split' || v === null) && rowTip.some((v) => v === 'Split'), JSON.stringify(rowTip));
  const detailText = await I.js(`document.querySelector('[data-detail-panel]').innerText`);
  check('Split: no "Cut" wording is left in the details', !/\bcut/i.test(detailText), detailText.split('\n').filter((l) => /cut/i.test(l)).join(' | '));
  await I.blur();
  await I.key('Escape');
  await C.sleep(400);

  // ======== OFF (the default): record everything ========
  check('OFF: the setting is off by default (nothing stored yet or false)', settingsFile().vibrantColours !== true, JSON.stringify(settingsFile()));
  const ids = [['boot', 'p1'], ['brk', 'brk'], ['boot~2', 'p2'], ['red', 'red'], ['yel', 'yel'], ['plain', 'plain'], ['night', 'night']];
  const week = async () => {
    const out = {};
    for (const [id, k] of ids) out[k] = await look(cal(today, id));
    out.cont = await look(`document.querySelector('[data-cal-block="cal${today}:night"]')`);
    out.chip = await look(`document.querySelector('[aria-label="All day task Orange all day"]')`);
    return out;
  };
  await scrollTo(6);
  await C.sleep(400);
  const offWeek = await week();
  check('OFF: the blocks use the soft label tints and dark text as before (blue tint, orange chip)', offWeek.p1.bg === 'rgb(233, 239, 244)' && offWeek.chip.bg === 'rgb(255, 235, 220)' && offWeek.p1.texts.every((n) => n.color !== 'rgb(255, 255, 255)'), JSON.stringify([offWeek.p1.bg, offWeek.chip.bg]));
  check('OFF: the priority mark has no chip', offWeek.red.markBg === 'rgba(0, 0, 0, 0)', String(offWeek.red.markBg));
  await I.shot('p16-WEEK-off');

  // Day view, a split day.
  await I.click(`document.querySelector('[data-cal-head="${today}"]')`, 900);
  await scrollTo(9);
  await C.sleep(400);
  const offDay = {};
  for (const id of ['boot', 'brk', 'boot~2']) offDay[id] = await look(cal(today, id));
  await I.shot('p16-DAY-off');
  await I.click(`document.querySelector('[aria-label="Week view"]')`, 800);

  // Month chip.
  await I.click(`document.querySelector('[aria-label="Month view"]')`, 900);
  const offMonth = await look(`document.querySelector('[aria-label="Calendar task Red urgent"]')`);
  check('OFF: the month chip is the soft red tint with dark text', !!offMonth && offMonth.bg === 'rgb(255, 234, 234)' && !whiteBold(offMonth), JSON.stringify(offMonth && [offMonth.bg, offMonth.texts]));
  await I.click(`document.querySelector('[aria-label="Week view"]')`, 800);

  // Timebox panel and a card in the list.
  await I.click(`document.querySelector('[aria-label="Show Tasks"]')`, 900);
  await I.click(`document.querySelector('[aria-label="Next day"]')`, 700);
  await scrollBox(6);
  await C.sleep(400);
  const tbIds = [['boot', 'p1'], ['brk', 'brk'], ['boot~2', 'p2'], ['red', 'red'], ['yel', 'yel']];
  const timebox = async () => {
    const out = {};
    for (const [id, k] of tbIds) out[k] = await look(blk(id));
    out.cont = await look(`document.querySelector('[data-block-id="night"][data-continuation]')`);
    return out;
  };
  const offBox = await timebox();
  const offCard = await look(`document.querySelector('[data-task-card="plain"]')`);
  const offCardBlue = await look(`document.querySelector('[data-task-card="boot"]')`);
  await I.shot('p16-TIMEBOX-off');

  // ======== Settings: the wording and the new switch (Appearance) ========
  await goSettings();
  const settingsText = await I.js(`document.body.innerText`);
  check('Split: Settings says "Smallest piece when a break splits a task" and its note says "Split"', settingsText.includes('Smallest piece when a break splits a task') && settingsText.includes('A task with "Split" on'), '');
  check('Split: nothing in Settings says cut', !/\bcuts?\b|cutting/i.test(settingsText), settingsText.split('\n').filter((l) => /\bcut/i.test(l)).join(' | '));
  check('Settings: an Appearance section has "Vibrant task colours", off', settingsText.includes('APPEARANCE') && settingsText.includes('Vibrant task colours') && (await switchState()) === 'false', String(await switchState()));
  await toggleSwitch();
  await C.waitFor(() => settingsFile().vibrantColours === true, 5000).catch(() => {});
  check('Settings: turning it on is saved per computer in the desktop settings', settingsFile().vibrantColours === true, JSON.stringify(settingsFile()));
  const others = fs.readdirSync(dataDir).filter((f) => f !== 'belific_desktop_settings.kv').filter((f) => /vibrant/i.test(fs.readFileSync(path.join(dataDir, f), 'utf8')));
  check('Settings: it is stored nowhere else (no synced row, no task or label field)', others.length === 0, others.join(','));
  check('Settings: the switch reads on', (await switchState()) === 'true');
  await I.shot('p16-settings');
  await I.click(I.byLabel('Back'), 900);
  await C.sleep(500);

  // ======== ON: the Timebox first (the Tasks view is showing) ========
  await scrollBox(6);
  await C.sleep(400);
  const onBox = await timebox();
  const names = { p1: 'boot piece', brk: 'break', p2: 'second piece', red: 'red', yel: 'yellow' };
  for (const k of Object.keys(names)) {
    const x = onBox[k];
    check(`ON Timebox: ${names[k]} is white bold text on a vibrant background with at least 6:1`, !!x && whiteBold(x) && ratio('rgb(255, 255, 255)', x.bg) >= 6, x && JSON.stringify([x.bg, x.texts.map((n) => [n.color, n.fw]), x.bg && ratio('rgb(255, 255, 255)', x.bg).toFixed(2)]));
  }
  check('ON Timebox: the break is a mid slate grey (83, 96, 112)', onBox.brk.bg === 'rgb(83, 96, 112)', onBox.brk.bg);
  check('ON Timebox: the repeat icon is white', onBox.yel.repeatColor === 'rgb(255, 255, 255)', String(onBox.yel.repeatColor));
  check('ON Timebox: the ❗ sits on a small white rounded chip', onBox.red.markBg === 'rgb(255, 255, 255)', String(onBox.red.markBg));
  check('ON Timebox: the pieces of one task share one colour', onBox.p1.bg === onBox.p2.bg && onBox.p1.bg !== offBox.p1.bg, JSON.stringify([onBox.p1.bg, onBox.p2.bg]));
  check('ON Timebox: the later piece still says "left" in white', onBox.p2.texts.some((n) => n.t.includes('left') && n.color === 'rgb(255, 255, 255)'), JSON.stringify(onBox.p2.texts));
  check('ON Timebox: the continuation card (the rest of yesterday) is vibrant too', !!onBox.cont && whiteBold(onBox.cont) && ratio('rgb(255, 255, 255)', onBox.cont.bg) >= 6, JSON.stringify(onBox.cont && [onBox.cont.bg, onBox.cont.texts]));
  const sameBox = Object.keys(offBox).every((k) => geom(offBox[k]) === geom(onBox[k]) && offBox[k].title === onBox[k].title && offBox[k].markTip === onBox[k].markTip);
  check('ON Timebox: sizes, positions and tooltips did not change', sameBox, JSON.stringify(Object.keys(offBox).filter((k) => geom(offBox[k]) !== geom(onBox[k])).map((k) => [k, geom(offBox[k]), geom(onBox[k])])));
  const onCard = await look(`document.querySelector('[data-task-card="plain"]')`);
  const onCardBlue = await look(`document.querySelector('[data-task-card="boot"]')`);
  check('ON: the left pane task cards are not changed', geom(onCard) === geom(offCard) && onCard.bg === offCard.bg && onCardBlue.bg === offCardBlue.bg && !whiteBold(onCardBlue), JSON.stringify([onCardBlue.bg, offCardBlue.bg]));
  await I.shot('p16-TIMEBOX-on');

  // ======== ON: the Calendar week ========
  await I.click(`document.querySelector('[aria-label="Show the Calendar"]')`, 900);
  await scrollTo(6);
  await C.sleep(400);
  const onWeek = await week();
  const wk = { p1: 'boot piece', brk: 'break', p2: 'second piece', red: 'red', yel: 'yellow' };
  for (const k of Object.keys(wk)) {
    const x = onWeek[k];
    check(`ON Week: ${wk[k]} is white bold text on a vibrant background with at least 6:1`, !!x && whiteBold(x) && ratio('rgb(255, 255, 255)', x.bg) >= 6, x && JSON.stringify([x.bg, x.texts.map((n) => [n.color, n.fw])]));
  }
  check('ON Week: the break is the mid slate grey', onWeek.brk.bg === 'rgb(83, 96, 112)', onWeek.brk.bg);
  check('ON Week: the unlabelled task keeps its plain block (white text would not show on it)', onWeek.plain.bg === offWeek.plain.bg && !whiteBold(onWeek.plain), onWeek.plain.bg);
  check('ON Week: the all-day chip is vibrant with white bold text', whiteBold(onWeek.chip) && ratio('rgb(255, 255, 255)', onWeek.chip.bg) >= 6 && onWeek.chip.bg !== offWeek.chip.bg, JSON.stringify([onWeek.chip.bg, onWeek.chip.texts]));
  check('ON Week: the ❗ is on a white chip (all-day chip and red block)', onWeek.chip.markBg === 'rgb(255, 255, 255)' && onWeek.red.markBg === 'rgb(255, 255, 255)', JSON.stringify([onWeek.chip.markBg, onWeek.red.markBg]));
  check('ON Week: the repeat icon is white', onWeek.yel.repeatColor === 'rgb(255, 255, 255)', String(onWeek.yel.repeatColor));
  check('ON Week: the continued block (the rest of yesterday) is vibrant with white text', !!onWeek.cont && whiteBold(onWeek.cont) && ratio('rgb(255, 255, 255)', onWeek.cont.bg) >= 6, JSON.stringify(onWeek.cont && [onWeek.cont.bg, onWeek.cont.texts]));
  const sameWeek = Object.keys(offWeek).every((k) => geom(offWeek[k]) === geom(onWeek[k]) && offWeek[k].title === onWeek[k].title && offWeek[k].markTip === onWeek[k].markTip);
  check('ON Week: sizes, positions and tooltips did not change', sameWeek, JSON.stringify(Object.keys(offWeek).filter((k) => geom(offWeek[k]) !== geom(onWeek[k])).map((k) => [k, geom(offWeek[k]), geom(onWeek[k])])));
  await I.shot('p16-WEEK-on');

  // Day view: the split day.
  await I.click(`document.querySelector('[data-cal-head="${today}"]')`, 900);
  await scrollTo(9);
  await C.sleep(400);
  const onDay = {};
  for (const id of ['boot', 'brk', 'boot~2']) onDay[id] = await look(cal(today, id));
  check('ON Day: the split day (piece, break, piece) is vibrant, white and bold, same geometry as OFF', ['boot', 'brk', 'boot~2'].every((id) => whiteBold(onDay[id]) && ratio('rgb(255, 255, 255)', onDay[id].bg) >= 6 && geom(onDay[id]) === geom(offDay[id])), JSON.stringify(onDay));
  await I.shot('p16-DAY-on');
  await I.click(`document.querySelector('[aria-label="Week view"]')`, 800);

  // Month chip.
  await I.click(`document.querySelector('[aria-label="Month view"]')`, 900);
  const onMonth = await look(`document.querySelector('[aria-label="Calendar task Red urgent"]')`);
  check('ON Month: the chip is vibrant red with bold white text and the ❗ on a white chip', !!onMonth && whiteBold(onMonth) && ratio('rgb(255, 255, 255)', onMonth.bg) >= 6 && onMonth.bg !== offMonth.bg && onMonth.markBg === 'rgb(255, 255, 255)', JSON.stringify(onMonth && [onMonth.bg, onMonth.markBg]));
  check('ON Month: the chip is the same size and place', geom(onMonth) === geom(offMonth), `${geom(offMonth)} vs ${geom(onMonth)}`);
  await I.click(`document.querySelector('[aria-label="Week view"]')`, 800);

  // ======== It survives a restart of the view and turns OFF at once ========
  await goSettings();
  check('ON: Settings shows the switch on after coming back', (await switchState()) === 'true');
  await toggleSwitch();
  await C.waitFor(() => settingsFile().vibrantColours === false, 5000).catch(() => {});
  check('OFF again: saved as false', settingsFile().vibrantColours === false, JSON.stringify(settingsFile()));
  await I.click(I.byLabel('Back'), 900);
  await scrollTo(6);
  await C.sleep(500);
  const backWeek = await week();
  const same = Object.keys(offWeek).every((k) => JSON.stringify(offWeek[k]) === JSON.stringify(backWeek[k]));
  check('OFF again: the Calendar week is exactly as it was before (colours, text, sizes, tooltips)', same, JSON.stringify(Object.keys(offWeek).filter((k) => JSON.stringify(offWeek[k]) !== JSON.stringify(backWeek[k]))));

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
