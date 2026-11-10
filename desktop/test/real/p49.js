'use strict';
// @real-input: quiet
// Real check for PLAN_breaks_as_gaps P2 and P3 (3.34.0): a Break is drawn as a free gap. Until 3.33.0 this file
// checked the Calendar Day view's break chips (3.28.0 to 3.29.1); the chips are gone, so it checks the plan's own
// example instead (section 6): Boot Camp 9:30 for 7 h, repeating; Short break 11:00 (20 min), Long break 12:30 (1 h)
// and Short break 15:00 (20 min), repeating with it. Today four tasks were dropped into the gaps: Get changed and warm
// up (11:00, 20 min), Run (12:30, 30 min), Lunch (13:00, 30 min), Shower (15:00, 20 min). Tomorrow has one 10 minute
// task at 11:00 and otherwise empty gaps.
//   - Day view: three gaps at their real times, hatched with a dashed outline, no ☕, no chip, no break block; Boot
//     Camp in four pieces; the four tasks as full width blocks at their real times inside the gaps;
//   - the 10 minute task is 10 px high and ends inside its gap; the free part of the gap shows (hatched);
//   - hover text "Short break · 20 min"; a click on a gap opens the break's details;
//   - Week view and the Timebox draw the same; the Timebox says Scheduled 7h today and 5h 30m tomorrow (5h 20m of
//     Boot Camp and the 10 minute task);
//   - D5: Boot Camp moved 30 minutes later on tomorrow (the Down key on its block) takes tomorrow's three gaps along,
//     today's stay; one Ctrl+Z puts all four back;
//   - a block in a gap has a menu (right click): Move out of break puts it right after the break.
// Real app, isolated data folder, in process fake Supabase. Keys and clicks only (sendInputEvent), so it runs quiet.
// BELIFIC_SHOTS: screenshots.
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
  const dk = dayKeyFrom(new Date());
  const today = dk(0);
  const tomorrow = dk(1);
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const wd = (s) => WD[new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + s).getDay()];
  // Today and tomorrow are always in the rule (as Mon to Fri are in the plan).
  const rule = { recurrence: 'weekly', recurrenceDays: [wd(-1), wd(0), wd(1), wd(2)] };
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      T('camp', 'Boot Camp', { ...rule, dueDate: dk(-7), startTime: '09:30', durationMinutes: 420 }),
      T('short1', 'Short break', { ...rule, dueDate: dk(-7), startTime: '11:00', durationMinutes: 20, cutsBelow: true }),
      T('long', 'Long break', { ...rule, dueDate: dk(-7), startTime: '12:30', durationMinutes: 60, cutsBelow: true }),
      T('short2', 'Short break', { ...rule, dueDate: dk(-7), startTime: '15:00', durationMinutes: 20, cutsBelow: true }),
      T('warm', 'Get changed and warm up', { dueDate: today, startTime: '11:00', durationMinutes: 20, projectKey: 'health' }),
      T('run', 'Run', { dueDate: today, startTime: '12:30', durationMinutes: 30, projectKey: 'health' }),
      T('lunch', 'Lunch', { dueDate: today, startTime: '13:00', durationMinutes: 30 }),
      T('shower', 'Shower', { dueDate: today, startTime: '15:00', durationMinutes: 20 }),
      T('apply', 'Apply to 1 application', { dueDate: tomorrow, startTime: '11:00', durationMinutes: 10, projectKey: 'work' }),
    ]),
  );
  fs.writeFileSync(
    path.join(dataDir, 'belific_projects.kv'),
    JSON.stringify([
      { key: 'work', name: 'Work', colorKey: '#8B4FC9', createdAt: stamp, updatedAt: stamp },
      { key: 'health', name: 'Health', colorKey: 'rose', createdAt: stamp, updatedAt: stamp },
    ]),
  );
  const read = readKv(dataDir);
  const byId = (id) => (read('belific_tasks') || []).find((t) => t.id === id);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1440, 900);
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await C.sleep(3500);
  await I.click(I.byLabel('Show the Calendar'), 800).catch(() => {});
  await I.key('d');
  await C.sleep(800);

  // One day column as drawn: its gaps and its blocks, in px from the column's top (56 px an hour).
  const colOf = (day) => `[...document.querySelectorAll('[data-cal-col="${day}"]')].find((e) => e.getBoundingClientRect().width > 0)`;
  const readCol = (day) =>
    I.js(`(() => {
      const col = ${colOf(day)};
      if (!col) return null;
      const cr = col.getBoundingClientRect();
      const R = (e) => { const r = e.getBoundingClientRect(); return { top: Math.round((r.top - cr.top) * 10) / 10, h: Math.round(r.height * 10) / 10, w: Math.round(r.width), l: Math.round(r.left - cr.left) }; };
      const gaps = [...col.querySelectorAll('[data-gap]')].map((g) => { const cs = getComputedStyle(g); return { id: g.getAttribute('data-gap'), ...R(g), hatch: cs.backgroundImage, border: cs.borderTopStyle, tip: g.getAttribute('title') || '', text: g.innerText.trim() }; });
      const blocks = [...col.querySelectorAll('[data-cal-block]:not([data-gap])')].map((b) => ({ id: b.getAttribute('data-cal-block').replace(/^cal[0-9-]+:/, ''), piece: b.getAttribute('data-piece'), inGap: b.getAttribute('data-in-gap'), ...R(b.parentElement.parentElement) }));
      return { colW: Math.round(cr.width), gaps, blocks, cups: col.querySelectorAll('[data-break-cup]').length, chips: col.querySelectorAll('[data-host-chip]').length, counts: col.querySelectorAll('[data-host-count]').length };
    })()`);
  const scrollTo = (min) => I.js(`(() => { const s = document.querySelector('[data-cal-scroller]'); if (s) s.scrollTop = ${(min / 60) * 56}; })()`);
  await scrollTo(10 * 60 + 30);
  await C.sleep(400);
  const px = (min) => Math.round(((min / 60) * 56) * 10) / 10;
  const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;
  const m = (h, mm = 0) => h * 60 + mm;

  // ---- Day view, today: the four tasks fill the three gaps ----
  const d0 = await readCol(today);
  check('Day today: the column is drawn', !!d0, JSON.stringify(d0));
  if (d0) {
    const g = (id) => d0.gaps.find((x) => x.id === `${id}:${today}`);
    check('Day today: three gaps, nothing else drawn for the breaks (no ☕, no chip, no break block, no "inside" count)', d0.gaps.length === 3 && d0.cups === 0 && d0.chips === 0 && d0.counts === 0 && !d0.blocks.some((b) => /^(short1|long|short2)/.test(b.id)), JSON.stringify(d0));
    for (const [id, s, len] of [['short1', m(11), 20], ['long', m(12, 30), 60], ['short2', m(15), 20]]) {
      const x = g(id);
      check(`Day today: the ${id} gap at its real times`, !!x && near(x.top, px(s)) && near(x.h, px(len)), JSON.stringify(x));
      check(`Day today: the ${id} gap is hatched with a dashed outline and has no text`, !!x && /repeating-linear-gradient/.test(x.hatch) && x.border === 'dashed' && x.text === '', JSON.stringify(x));
      check(`Day today: the ${id} gap is the full column width`, !!x && x.w >= d0.colW - 4, JSON.stringify(x));
    }
    check('Day today: the hover text says the name and the length', g('short1')?.tip === 'Short break · 20 min' && g('long')?.tip === 'Long break · 1 h', JSON.stringify(d0.gaps.map((x) => x.tip)));
    const pieces = d0.blocks.filter((b) => b.id.startsWith(`camp:${today}`));
    check('Day today: Boot Camp is four pieces around the gaps', pieces.length === 4 && near(pieces[0].top, px(m(9, 30))) && near(pieces[1].top, px(m(11, 20))) && near(pieces[2].top, px(m(13, 30))) && near(pieces[3].top, px(m(15, 20))), JSON.stringify(pieces));
    for (const [id, s, len, gap] of [['warm', m(11), 20, 'Short break'], ['run', m(12, 30), 30, 'Long break'], ['lunch', m(13), 30, 'Long break'], ['shower', m(15), 20, 'Short break']]) {
      const b = d0.blocks.find((x) => x.id === id);
      check(`Day today: ${id} is a block in its gap at its real time and size`, !!b && b.inGap === gap && near(b.top, px(s)) && near(b.h, px(len)), JSON.stringify(b));
      check(`Day today: ${id} is full width (not a chip, not a lane)`, !!b && b.w >= d0.colW - 4 && b.l <= 1, JSON.stringify(b));
    }
  }
  await I.shot('p49-day-today');

  // ---- tomorrow: empty gaps show; the 10 minute task is 10 px and stays in its gap ----
  await I.click(I.byLabel('Calendar next day'), 800);
  await scrollTo(10 * 60 + 30);
  await C.sleep(400);
  const d1 = await readCol(tomorrow);
  if (d1) {
    const apply = d1.blocks.find((b) => b.id === 'apply');
    const short1 = d1.gaps.find((x) => x.id === `short1:${tomorrow}`);
    check('Day tomorrow: three gaps', d1.gaps.length === 3, JSON.stringify(d1.gaps));
    check('Day tomorrow: the 10 minute task is 10 px high (not 20) and ends inside its 20 minute gap', !!apply && !!short1 && near(apply.h, 10, 0.6) && apply.top + apply.h <= short1.top + short1.h + 0.5, JSON.stringify({ apply, short1 }));
  } else check('Day tomorrow: the column is drawn', false);
  const free = await I.js(`(() => {
    const out = {};
    for (const id of ['short1', 'long', 'short2']) {
      const g = document.querySelector('[data-gap="' + id + ':${tomorrow}"]');
      if (!g) { out[id] = null; continue; }
      const r = g.getBoundingClientRect();
      // Above the bottom edge strip (6 px, 4 under 24 px).
      const at = document.elementFromPoint(r.left + r.width / 2, r.bottom - (r.height >= 24 ? 6 : 4) - 1.5);
      out[id] = !!at && !!at.closest('[data-gap]');
    }
    return out;
  })()`);
  check('Day tomorrow: the free part of each gap shows (nothing covers it)', !!free && free.short1 && free.long && free.short2, JSON.stringify(free));
  await I.shot('p49-day-tomorrow');
  // A click on a gap opens the break's details.
  const panel = `document.querySelector('[data-detail-panel]')`;
  await I.click(`document.querySelector('[data-gap="long:${tomorrow}"]')`, 900);
  await C.waitFor(() => I.exists(panel), 4000).catch(() => {});
  const ptitle = await I.js(`[...(${panel} || document).querySelectorAll('input, textarea')].map((e) => e.value).join('|')`);
  check('a click on the Long break gap opens its details', (await I.exists(panel)) && ptitle.split('|').includes('Long break'), ptitle);
  await I.key('Escape', [], 600);

  // ---- D5: Boot Camp 30 minutes later, tomorrow only; its gaps follow; one Ctrl+Z puts everything back ----
  const gapTops = async (day) => {
    const c = await readCol(day);
    return c ? Object.fromEntries(c.gaps.map((x) => [x.id.replace(/:.*/, ''), x.top])) : null;
  };
  const before1 = await gapTops(tomorrow);
  await I.js(`(() => { const b = document.querySelector('[data-cal-block="cal${tomorrow}:camp:${tomorrow}"]'); if (b) b.focus(); })()`);
  await C.sleep(200);
  await I.key('Down', [], 1500);
  const after1 = await gapTops(tomorrow);
  const shifted = !!before1 && !!after1 && ['short1', 'long', 'short2'].every((id) => near(after1[id], before1[id] + 28));
  check('D5: Boot Camp moved 30 minutes later takes its three gaps along (tomorrow)', shifted, JSON.stringify({ before1, after1 }));
  const campTop = await I.js(`(() => { const b = document.querySelector('[data-cal-block="cal${tomorrow}:camp:${tomorrow}"]'); const c = ${colOf(tomorrow)}; return b && c ? Math.round(b.getBoundingClientRect().top - c.getBoundingClientRect().top) : null; })()`);
  check('D5: and Boot Camp starts at 10:00 there', near(campTop, px(m(10)), 3), String(campTop));
  await I.shot('p49-d5-moved');
  await I.blur();
  await I.key('Z', ['control'], 1500);
  const undone1 = await gapTops(tomorrow);
  check('D5: one Ctrl+Z puts Boot Camp and its three gaps back', !!undone1 && !!before1 && ['short1', 'long', 'short2'].every((id) => near(undone1[id], before1[id])), JSON.stringify({ before1, undone1 }));
  await I.click(I.byLabel('Calendar previous day'), 800);
  await scrollTo(10 * 60 + 30);
  await C.sleep(300);
  const t0 = await gapTops(today);
  check('D5: today\'s gaps did not move (that day only)', !!t0 && near(t0.short1, px(m(11))) && near(t0.long, px(m(12, 30))) && near(t0.short2, px(m(15))), JSON.stringify(t0));

  // ---- Week view: the same drawing in narrow columns ----
  await I.key('w');
  await C.sleep(900);
  await scrollTo(10 * 60 + 30);
  await C.sleep(300);
  const w0 = await readCol(today);
  const w1 = await readCol(tomorrow);
  check('Week: three gaps in each of the two days, no chips', !!w0 && !!w1 && w0.gaps.length === 3 && w1.gaps.length === 3 && w0.chips + w1.chips === 0, JSON.stringify([w0 && w0.gaps.length, w1 && w1.gaps.length]));
  const wl = w0 && w0.blocks.find((b) => b.id === 'lunch');
  check('Week today: Lunch is a full width block in its gap', !!wl && wl.inGap === 'Long break' && wl.w >= w0.colW - 4, JSON.stringify(wl));
  await I.shot('p49-week');
  await I.key('d');
  await C.sleep(700);

  // ---- the Timebox (in the Tasks view) ----
  await I.click(I.byLabel('Show Tasks'), 900).catch(() => {});
  await C.sleep(600);
  // ---- the Timebox (today) draws the same and counts 7h ----
  const tb = await I.js(`(() => {
    const grid = [...document.querySelectorAll('[data-timebox-grid]')].find((e) => e.getBoundingClientRect().width > 0);
    if (!grid) return null;
    return { gaps: grid.querySelectorAll('[data-gap]').length, warm: !!grid.querySelector('[data-block-id="warm"][data-in-gap]'), lunch: !!grid.querySelector('[data-block-id="lunch"][data-in-gap]'), chips: grid.querySelectorAll('[data-host-chip]').length };
  })()`);
  check('Timebox today: three gaps, the tasks in them as blocks, no chips', !!tb && tb.gaps === 3 && tb.warm && tb.lunch && tb.chips === 0, JSON.stringify(tb));
  check('Timebox today: Scheduled 7h (Boot Camp\'s 5h 20m and the four tasks)', (await I.body()).includes('Scheduled 7h'), '');

  // ---- the Timebox tomorrow: 5h 20m ----
  await I.click(I.byLabel('Next day'), 800);
  // Boot Camp's 5h 20m (the gaps are not work) and the 10 minute task in a gap.
  check('Timebox tomorrow: Scheduled 5h 30m', (await I.body()).includes('Scheduled 5h 30m'), '');
  await I.click(I.byLabel('Previous day'), 800);

  // ---- a block in a gap: right click, Move out of break ----
  await I.click(I.byLabel('Show the Calendar'), 900).catch(() => {});
  await scrollTo(10 * 60 + 30);
  await C.sleep(500);
  await I.js(`(() => { const b = document.querySelector('[data-cal-block="cal${today}:shower"]'); if (b) b.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 })); })()`);
  await C.sleep(500);
  const menu = `document.querySelector('[data-host-block-menu="task:shower"]')`;
  check('a block in a gap has a menu with Move out of break', (await I.textOf(menu)).includes('Move out of break'), await I.textOf(menu));
  await I.click(`[...${menu}.querySelectorAll('[role="button"]')].find((e) => e.innerText.includes('Move out of break'))`, 1200);
  check('Move out of break puts Shower right after the break (15:20)', byId('shower')?.startTime === '15:20', JSON.stringify(byId('shower')));

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
