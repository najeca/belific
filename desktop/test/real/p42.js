'use strict';
// @real-input: quiet
// Real check for 3.22.0 (step 3): dragging a Split task into another Split task. Real app on an isolated data folder
// (in process fake Supabase). A Split task held over a break for about a second outlines it with "Drop inside" and the
// drop hosts it there; dropped without the pause it is placed as before; one longer than the break shows "Longer than
// the break (1 h 30 min)" and is not highlighted; leaving the break cancels the pause. Light and dark, and the Calendar.
// 3.35.0 (PLAN_breaks_as_gaps): rewritten for gaps. Every break is a gap (it was a block with chips); a hosted break is a
// second gap inside the first (it was a chip); gaps move in 5 minute steps. Drags are events dispatched in the page, so
// it runs quiet. BELIFIC_SHOTS: a folder for screenshots.
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
  const at = (id, title, start, len, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, dueDate: TODAY, startTime: start, durationMinutes: len, ...extra });
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      at('lunch', 'Lunch', '12:00', 90, { cutsBelow: true }),
      at('focus', 'Focus', '09:00', 30, { cutsBelow: true }),
      at('deep', 'Deep work', '15:00', 180, { cutsBelow: true }),
      at('free', 'Free task', '17:00', 30),
      at('quick', 'Quick call', '07:00', 20, { cutsBelow: true }),
    ]),
  );
  fs.writeFileSync(path.join(dataDir, 'belific_desktop_panes.kv'), JSON.stringify({ leftCollapsed: false, rightCollapsed: false, center: 'kanban', calendar: 'day' }));
  const read = readKv(dataDir);
  const byId = (id) => (read('belific_tasks') || []).find((t) => t.id === id);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1440, 900);
  win.show();
  win.focus();
  win.webContents.focus();
  // The pause (1 s) is timed by the page: an inactive window's timers must not be slowed down.
  win.webContents.setBackgroundThrottling(false);
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  // A break with a time has no card and its gap no text (3.33.0, 3.34.0): wait for a plain task.
  await I.waitBody('Free task', 20000);
  await I.click(I.byLabel('Show Tasks'), 800).catch(() => {});
  await C.sleep(1200);

  const V = (sel) => `[...document.querySelectorAll('${sel}')].find((e) => e.getBoundingClientRect().width > 0)`;
  // 3.35.0: a break is a gap (data-gap, with the old data-block-id); a break inside a longer one is a second gap in it.
  const TB = '[data-timebox-grid]';
  const gapOf = (id, root = TB) => V(`${root} [data-gap="${id}"]`);
  const rectOf = (expr) => I.js(`(() => { const e = ${expr}; if (!e) return null; const r = e.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height }; })()`);
  const scrollLunch = async () => {
    await I.js(`(() => { const b = ${gapOf('lunch')}; if (b) b.scrollIntoView({ block: 'center' }); })()`);
    await C.sleep(500);
  };
  const state = () =>
    I.js(`(() => { const d = document.querySelector('[data-drop-inside]'); const l = document.querySelector('[data-lifted-card]'); return { outline: d ? { label: d.innerText.trim(), id: d.getAttribute('data-drop-inside') } : null, lifted: l ? l.innerText.replace(/\\s+/g, ' ').trim() : '' }; })()`);
  const minOf = (id) => Number(byId(id).startTime.slice(0, 2)) * 60 + Number(byId(id).startTime.slice(3));
  const LUNCH = 12 * 60;
  // With the button still down (I.drag with release false): the pointer to `min` on the grid, then held `ms`.
  const moveTo = (gridSel, min, ms) =>
    I.js(`(async () => {
      const grid = [...document.querySelectorAll(${JSON.stringify(gridSel)})].find((e) => e.getBoundingClientRect().width > 0);
      const o = { ...window.__belificDragAt, clientY: grid.getBoundingClientRect().top + (${min} / 60) * 56 };
      window.dispatchEvent(new PointerEvent('pointermove', o));
      window.__belificDragAt = o;
      await new Promise((r) => setTimeout(r, ${ms}));
      return true;
    })()`);
  const inside = (a, b) => !!a && !!b && a.top >= b.top - 1 && a.bottom <= b.bottom + 1;

  async function passDwell(mode, id) {
    await scrollLunch();
    // ---- held for 1.4 s near the bottom of Lunch ----
    // Grabbed 25 minutes into it, so the press and the drop are always far enough apart to be a drag.
    await I.drag(gapOf(id), TB, minOf(id) + 25, LUNCH + 83, { holdMs: 1400, release: false });
    const s = await state();
    check(`${mode}: held over Lunch for a moment, the break is outlined "Drop inside"`, !!s.outline && s.outline.label === 'Drop inside' && s.outline.id === 'task:lunch', JSON.stringify(s));
    check(`${mode}: and the lifted card says so`, /Drop inside Lunch/.test(s.lifted), s.lifted);
    const o = await I.js(`(() => { const d = document.querySelector('[data-drop-inside]'); const b = ${gapOf('lunch')}; if (!d || !b) return null; const a = d.getBoundingClientRect(); const c = b.getBoundingClientRect(); return { dl: Math.round(a.left - c.left), dt: Math.round(a.top - c.top), dw: Math.round(a.width - c.width), dh: Math.round(a.height - c.height) }; })()`);
    check(`${mode}: the outline sits on Lunch's gap`, !!o && Math.abs(o.dl) <= 4 && Math.abs(o.dt) <= 4 && Math.abs(o.dw - 4) <= 3 && Math.abs(o.dh - 4) <= 3, JSON.stringify(o));
    await I.shot(`p42-drop-inside-${mode}`);
    await I.dragRelease();
    await C.sleep(1000);
    const t = byId(id);
    // 5 minute steps: the dropped slot (13:00 to 13:30) fits, so it stays there, inside Lunch.
    check(`${mode}: the drop hosts it inside Lunch (13:00, it fits from the dropped slot)`, t.startTime === '13:00' && t.dueDate === TODAY, JSON.stringify(t));
    await scrollLunch();
    check(`${mode}: it is a gap inside Lunch's gap (its own Break ignored there)`, inside(await rectOf(gapOf(id)), await rectOf(gapOf('lunch'))), JSON.stringify([await rectOf(gapOf(id)), await rectOf(gapOf('lunch'))]));
    await I.shot(`p42-hosted-${mode}`);
  }

  // ---- A: dropped without the pause: placed as before (two breaks side by side) ----
  await scrollLunch();
  await I.drag(gapOf('focus'), TB, minOf('focus') + 5, LUNCH + 83, { holdMs: 400, release: false });
  const sa = await state();
  check('A: before the pause there is no outline and no "Drop inside"', sa.outline === null && !/Drop inside/.test(sa.lifted), JSON.stringify(sa));
  await I.dragRelease();
  await C.sleep(900);
  const placed = byId('focus');
  check('A: dropped without the pause it is placed at the slot (5 minute steps), not moved to the break\'s start', placed.startTime === '13:20', JSON.stringify(placed));
  await scrollLunch();
  check('A: and it is not hosted (it runs past Lunch: two gaps side by side)', !inside(await rectOf(gapOf('focus')), await rectOf(gapOf('lunch'))));

  // ---- B: with the pause: hosted ----
  await passDwell('light', 'focus');

  // ---- C: longer than the break: the note, no outline, placed as usual ----
  await scrollLunch();
  const deepBefore = byId('deep').startTime;
  await I.drag(gapOf('deep'), TB, minOf('deep') + 5, LUNCH + 43, { holdMs: 1400, release: false });
  const sc = await state();
  check('C: longer than the break: the note says so, with the break\'s length', /Longer than the break \(1 h 30 min\)/.test(sc.lifted), JSON.stringify(sc));
  check('C: and the break is not outlined', sc.outline === null, JSON.stringify(sc));
  await I.shot('p42-longer-light');
  await I.dragRelease();
  await C.sleep(900);
  check('C: nothing is refused: it is placed where it was dropped (side by side)', byId('deep').startTime !== deepBefore, `${deepBefore} -> ${byId('deep').startTime}`);

  // ---- D: leaving the break cancels the pause ----
  await scrollLunch();
  await I.drag(gapOf('free') || V('[data-block-id="free"]'), TB, minOf('free') + 5, LUNCH + 32, { holdMs: 700, release: false });
  await moveTo(TB, LUNCH - 150, 800);
  const d1 = await state();
  await moveTo(TB, LUNCH + 32, 500);
  const d2 = await state();
  check('D: 0.7 s over the break, away for 0.8 s, back for 0.5 s: no pause completes, nothing is outlined', d1.outline === null && d2.outline === null, JSON.stringify([d1, d2]));
  await I.dragRelease();
  await C.sleep(800);

  // ---- the details say the Split is ignored ----
  await scrollLunch();
  await I.click(gapOf('focus'), 900).catch(() => {});
  await C.waitFor(() => I.exists(`document.querySelector('[data-detail-panel]')`), 6000).catch(() => {});
  const note = await I.js(`(() => { const n = document.querySelector('[data-detail-panel] [data-split-ignored]'); return n ? n.innerText.trim() : null; })()`);
  check('the details of a hosted Split task say its Break is ignored', note === 'Its Break is ignored while it is inside Lunch.', String(note));
  await I.shot('p42-details-light');
  await I.key('Escape', [], 600);

  // ---- Dark: the same pause again ----
  const icon = (await I.exists(I.byLabel('Profile and account'))) ? 'Profile and account' : 'Profile, not signed in';
  await I.click(I.byLabel(icon));
  await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 700);
  await I.waitBody('POWER FEATURES', 8000);
  await I.click(`document.querySelector('[data-theme-setting] [data-theme-mode="dark"]')`, 900);
  await I.click(I.byLabel('Back'), 900);
  await I.click(I.byLabel('Show Tasks'), 800).catch(() => {});
  await C.sleep(900);
  // Focus dragged out of Lunch first (a normal move), then back in with the pause.
  await scrollLunch();
  await I.drag(gapOf('focus'), TB, minOf('focus') + 5, LUNCH - 115, { holdMs: 300 });
  await C.sleep(900);
  check('dark: a gap dragged out of Lunch is a normal move (no longer inside it)', byId('focus').startTime === '10:00', JSON.stringify(byId('focus')));
  await passDwell('dark', 'focus');

  // ---- The Calendar draws the same pause ----
  await I.click(I.byLabel('Show the Calendar'), 1200).catch(() => I.click(I.byLabel('Show Calendar'), 1200));
  await C.sleep(900);
  await I.js(`(() => { const s = document.querySelector('[data-cal-scroller]'); if (s) s.scrollTop = 6.4 * 56; })()`);
  await C.sleep(500);
  const COL = `[data-cal-col="${TODAY}"]`;
  if ((await rectOf(gapOf('lunch', COL))) && (await rectOf(gapOf('quick', COL)))) {
    await I.drag(gapOf('quick', COL), '[data-calendar-grid]', minOf('quick') + 5, LUNCH + 21, { holdMs: 1400, release: false });
    const se = await state();
    check('E: in the Calendar too, held over Lunch the break is outlined "Drop inside"', !!se.outline && se.outline.label === 'Drop inside', JSON.stringify(se));
    await I.shot('p42-calendar-drop-inside');
    await I.dragRelease();
    await C.sleep(1000);
    const q = byId('quick');
    // 5 minute steps: it fits from the dropped slot (12:15), so it stays there, inside Lunch.
    check('E: and the drop hosts it inside Lunch', q.startTime === '12:15', JSON.stringify(q));
  } else {
    check('E: the Calendar shows Lunch and the quick call', false);
  }

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
