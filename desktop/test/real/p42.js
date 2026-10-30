'use strict';
// Real check for 3.22.0 (step 3): dragging a Split task into another Split task. Real mouse input into the real app on an
// isolated data folder (in process fake Supabase). A Split task held over a break for about a second outlines it with
// "Drop inside" and the drop hosts it there (a chip, its own Split ignored); dropped without the pause it is placed as
// before; one longer than the break shows "Longer than the break (1 h 30 min)" and is not highlighted; leaving the
// break cancels the pause. Light and dark. BELIFIC_SHOTS: a folder for screenshots.
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
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await I.waitBody('Lunch', 20000);
  await I.click(I.byLabel('Show Tasks'), 800).catch(() => {});
  await C.sleep(1200);

  const V = (sel) => `[...document.querySelectorAll('${sel}')].find((e) => e.getBoundingClientRect().width > 0)`;
  const block = (id) => V(`[data-block-id="${id.replace(/^task:/, '')}"]`);
  const chip = (blockId) => V(`[data-host-chip="${blockId}"]`);
  const rectOf = (expr) => I.js(`(() => { const e = ${expr}; if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top), left: r.left, top: r.top, w: r.width, h: r.height, bottom: r.bottom }; })()`);
  const scrollLunch = async () => {
    await I.js(`(() => { const b = ${block('task:lunch')}; if (b) b.scrollIntoView({ block: 'center' }); })()`);
    await C.sleep(500);
  };
  const state = () =>
    I.js(`(() => { const d = document.querySelector('[data-drop-inside]'); const l = document.querySelector('[data-lifted-card]'); return { outline: d ? { label: d.innerText.trim(), id: d.getAttribute('data-drop-inside') } : null, lifted: l ? l.innerText.replace(/\\s+/g, ' ').trim() : '' }; })()`);
  const mouse = (type, x, y, mods) => win.webContents.sendInputEvent({ type, x, y, ...(type === 'mouseMove' ? {} : { button: 'left', clickCount: 1 }), ...(mods ? { modifiers: mods } : {}) });
  // Presses the block's top, drags to (x, y) and holds `hold` ms; the button stays down when release is false.
  const dragTo = async (fromExpr, to, { hold = 400, release = true, grabDy = 8, grabLeft } = {}) => {
    const r = await rectOf(fromExpr);
    if (!r) throw new Error('no element to drag: ' + fromExpr.slice(0, 90));
    const from = { x: grabLeft ? Math.round(r.left + grabLeft) : r.x, y: Math.round(r.top + grabDy) };
    mouse('mouseMove', from.x, from.y);
    await C.sleep(80);
    mouse('mouseDown', from.x, from.y);
    for (let i = 1; i <= 12; i++) {
      mouse('mouseMove', Math.round(from.x + ((to.x - from.x) * i) / 12), Math.round(from.y + ((to.y - from.y) * i) / 12), ['leftButtonDown']);
      await C.sleep(22);
    }
    await C.sleep(hold);
    if (release) {
      mouse('mouseUp', to.x, to.y);
      await C.sleep(900);
    }
  };
  const lunchPoint = async (dy) => {
    const r = await rectOf(block('task:lunch'));
    if (!r) throw new Error('no Lunch block');
    return { x: r.x, y: Math.round(r.top + dy) };
  };

  async function passDwell(mode, sourceBlock, id) {
    await scrollLunch();
    // ---- held for 1.3 s near the bottom of Lunch ----
    const to = await lunchPoint(78);
    await dragTo(sourceBlock, to, { hold: 1400, release: false });
    const s = await state();
    check(`${mode}: held over Lunch for a moment, the break is outlined "Drop inside"`, !!s.outline && s.outline.label === 'Drop inside' && s.outline.id === 'task:lunch', JSON.stringify(s));
    check(`${mode}: and the lifted card says so`, /Drop inside Lunch/.test(s.lifted), s.lifted);
    const o = await I.js(`(() => { const d = document.querySelector('[data-drop-inside]'); const b = ${block('task:lunch')}; if (!d || !b) return null; const a = d.getBoundingClientRect(); const c = b.getBoundingClientRect(); return { dl: Math.round(a.left - c.left), dt: Math.round(a.top - c.top), dw: Math.round(a.width - c.width), dh: Math.round(a.height - c.height) }; })()`);
    check(`${mode}: the outline sits on Lunch's block`, !!o && Math.abs(o.dl) <= 4 && Math.abs(o.dt) <= 4 && Math.abs(o.dw - 4) <= 3 && Math.abs(o.dh - 4) <= 3, JSON.stringify(o));
    await I.shot(`p42-drop-inside-${mode}`);
    mouse('mouseUp', to.x, to.y);
    await C.sleep(1000);
    check(`${mode}: the drop hosts it inside Lunch (it starts at the break's start, 12:00)`, byId(id).startTime === '12:00' && byId(id).dueDate === TODAY, JSON.stringify(byId(id)));
    await scrollLunch();
    check(`${mode}: it is a chip in Lunch, its own Split ignored`, (await I.exists(chip(`task:${id}`))) && (await I.exists(`document.querySelector('[data-host-chip="task:${id}"][data-split-ignored]')`)));
    check(`${mode}: and Lunch counts it inside`, (await I.js(`(${block('task:lunch')} || {}).getAttribute?.('data-host-count')`)) === '1');
    await I.shot(`p42-hosted-${mode}`);
  }

  // ---- A: dropped without the pause: placed as before (side by side, Split cut) ----
  await scrollLunch();
  const toA = await lunchPoint(78);
  await dragTo(block('task:focus'), toA, { hold: 400, release: false });
  const sa = await state();
  check('A: before the pause there is no outline and no "Drop inside"', sa.outline === null && !/Drop inside/.test(sa.lifted), JSON.stringify(sa));
  mouse('mouseUp', toA.x, toA.y);
  await C.sleep(900);
  const placed = byId('focus');
  check('A: dropped without the pause it is placed at the slot, not moved to the break\'s start', !!placed.startTime && placed.startTime !== '12:00' && placed.startTime !== '09:00', JSON.stringify(placed));
  await scrollLunch();
  check('A: and it is not hosted (it partly overlaps Lunch: two breaks side by side)', !(await I.exists(chip('task:focus'))));

  // ---- B: with the pause: hosted ----
  await passDwell('light', block('task:focus'), 'focus');

  // ---- C: longer than the break: the note, no outline, placed as usual ----
  await scrollLunch();
  const toC = await lunchPoint(40);
  const deepBefore = byId('deep').startTime;
  await dragTo(block('task:deep'), toC, { hold: 1400, release: false });
  const sc = await state();
  check('C: longer than the break: the note says so, with the break\'s length', /Longer than the break \(1 h 30 min\)/.test(sc.lifted), JSON.stringify(sc));
  check('C: and the break is not outlined', sc.outline === null, JSON.stringify(sc));
  await I.shot('p42-longer-light');
  mouse('mouseUp', toC.x, toC.y);
  await C.sleep(900);
  check('C: nothing is refused: it is placed where it was dropped (side by side)', byId('deep').startTime !== deepBefore, `${deepBefore} -> ${byId('deep').startTime}`);

  // ---- D: leaving the break cancels the pause ----
  await scrollLunch();
  const toD1 = await lunchPoint(30);
  await dragTo(block('task:deep'), toD1, { hold: 700, release: false });
  const outPt = { x: toD1.x, y: toD1.y - 200 };
  for (let i = 1; i <= 8; i++) {
    mouse('mouseMove', toD1.x, Math.round(toD1.y + ((outPt.y - toD1.y) * i) / 8), ['leftButtonDown']);
    await C.sleep(20);
  }
  await C.sleep(800);
  const d1 = await state();
  const r2 = await lunchPoint(30);
  for (let i = 1; i <= 6; i++) {
    mouse('mouseMove', r2.x, Math.round(outPt.y + ((r2.y - outPt.y) * i) / 6), ['leftButtonDown']);
    await C.sleep(20);
  }
  await C.sleep(500);
  const d2 = await state();
  check('D: 0.7 s over the break, away for 0.8 s, back for 0.5 s: no pause completes, nothing is outlined', d1.outline === null && d2.outline === null, JSON.stringify([d1, d2]));
  mouse('mouseUp', r2.x, r2.y);
  await C.sleep(800);

  // ---- the details say the Split is ignored ----
  await I.click(chip('task:focus'), 900).catch(() => {});
  await C.waitFor(() => I.exists(`document.querySelector('[data-detail-panel]')`), 6000).catch(() => {});
  const note = await I.js(`(() => { const n = document.querySelector('[data-detail-panel] [data-split-ignored]'); return n ? n.innerText.trim() : null; })()`);
  check('the details of a hosted Split task say its Split is ignored', note === 'Its Split is ignored while it is during Lunch.', String(note));
  await I.shot('p42-details-light');
  await I.key('Escape', [], 600);

  // ---- Dark: the same pause with the other task ----
  const icon = (await I.exists(I.byLabel('Profile and account'))) ? 'Profile and account' : 'Profile, not signed in';
  await I.click(I.byLabel(icon));
  await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 700);
  await I.waitBody('POWER FEATURES', 8000);
  await I.click(`document.querySelector('[data-theme-setting] [data-theme-mode="dark"]')`, 900);
  await I.click(I.byLabel('Back'), 900);
  await I.click(I.byLabel('Show Tasks'), 800).catch(() => {});
  await C.sleep(900);
  // Put the Split task "Free task" (a normal one) aside and use Deep work shortened: its length is changed in the data
  // is not possible from here, so the dark pass uses Focus again: drag its chip out, then back in with the pause.
  await scrollLunch();
  const out = await rectOf(block('task:lunch'));
  await dragTo(chip('task:focus'), { x: out.x, y: Math.round(out.top - 110) }, { hold: 300, grabLeft: 45, grabDy: 7 });
  check('dark: a chip dragged out is a normal move (no longer hosted)', byId('focus').startTime !== '12:00' || (await I.exists(block('task:focus'))), JSON.stringify(byId('focus')));
  await C.sleep(600);
  await passDwell('dark', block('task:focus'), 'focus');

  // ---- The Calendar draws the same pause (its blocks are found by data-cal-block) ----
  await I.click(I.byLabel('Show the Calendar'), 1200).catch(() => I.click(I.byLabel('Show Calendar'), 1200));
  await C.sleep(900);
  const cal = (id) => V(`[data-cal-block$=":${id}"]`);
  const scrollCal = async () => {
    await I.js(`(() => { const s = document.querySelector('[data-cal-scroller]'); if (s) s.scrollTop = 6.4 * 56; })()`);
    await C.sleep(500);
  };
  await scrollCal();
  const lr = await rectOf(cal('lunch'));
  if (lr && (await rectOf(cal('quick')))) {
    await dragTo(cal('quick'), { x: lr.x, y: Math.round(lr.top + 20) }, { hold: 1400, release: false });
    const se = await state();
    check('E: in the Calendar too, held over Lunch the break is outlined "Drop inside"', !!se.outline && se.outline.label === 'Drop inside', JSON.stringify(se));
    await I.shot('p42-calendar-drop-inside');
    mouse('mouseUp', lr.x, Math.round(lr.top + 20));
    await C.sleep(1000);
    check('E: and the drop hosts it (the break start)', byId('quick').startTime === '12:00', JSON.stringify(byId('quick')));
  } else {
    check('E: the Calendar shows Lunch and the quick call', false, JSON.stringify([lr]));
  }

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
