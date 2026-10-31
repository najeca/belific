'use strict';
// Real check for 3.24.0: middle mouse drag pans the Calendar and the Timebox like a hand. Synthetic middle button
// events (mouseDown / mouseMove with the middle button held / mouseUp) into the real app: the Calendar week strip moves
// through the days sideways and the hours scroll up and down; a grabbing cursor while it pans; the press is cancelled
// (no Windows autoscroll circle) and never starts a task drag or opens a task; Escape puts the view back; the left
// button's drag is untouched. BELIFIC_SHOTS: screenshots.
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
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  const tasks = [];
  for (let d = 1; d <= 12; d++) tasks.push(T(`k${d}`, `Block ${d}`, { dueDate: day(d), startTime: '10:00', durationMinutes: 90 }));
  fs.writeFileSync(path.join(dataDir, 'belific_tasks.kv'), JSON.stringify(tasks));
  fs.writeFileSync(path.join(dataDir, 'belific_desktop_panes.kv'), JSON.stringify({ leftCollapsed: false, rightCollapsed: false, center: 'calendar', calendar: 'week' }));
  const read = readKv(dataDir);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1440, 900);
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await I.waitBody('Block 1', 20000);
  await C.sleep(800);

  const send = (e) => win.webContents.sendInputEvent(e);
  const mid = {
    down: async (x, y) => {
      send({ type: 'mouseMove', x, y });
      await C.sleep(80);
      send({ type: 'mouseDown', x, y, button: 'middle', clickCount: 1 });
      await C.sleep(120);
    },
    move: async (x, y) => {
      send({ type: 'mouseMove', x, y, modifiers: ['middleButtonDown'] });
      await C.sleep(120);
    },
    up: async (x, y) => {
      send({ type: 'mouseUp', x, y, button: 'middle', clickCount: 1 });
      await C.sleep(250);
    },
  };
  const pos = (sel) => I.js(`(() => { const s = document.querySelector(${JSON.stringify(sel)}); if (!s) return null; let p = s; if ('${sel}' === '[data-timebox-grid]') { while (p && p.scrollHeight <= p.clientHeight + 2) p = p.parentElement; } return p ? { left: Math.round(p.scrollLeft), top: Math.round(p.scrollTop), maxLeft: p.scrollWidth - p.clientWidth, maxTop: p.scrollHeight - p.clientHeight } : null; })()`);
  // A block that is really on screen inside the Calendar's scroller.
  const visibleBlock = `(() => { const s = document.querySelector('[data-cal-scroller]'); const sr = s.getBoundingClientRect(); return [...document.querySelectorAll('[data-cal-block]')].find((b) => { const r = b.getBoundingClientRect(); const cx = r.x + r.width / 2, cy = r.y + Math.min(r.height / 2, 30); return cx > sr.left + 60 && cx < sr.right - 20 && cy > sr.top + 60 && cy < sr.bottom - 20; }); })()`;
  const centre = (expr) => I.js(`(() => { const e = ${expr}; if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + Math.min(r.height / 2, 30)) }; })()`);
  const panning = () => I.js(`!!document.getElementById('belific-pan-cursor')`);
  const cursorAt = (x, y) => I.js(`(() => { const e = document.elementFromPoint(${x}, ${y}); return e ? getComputedStyle(e).cursor : null; })()`);
  // Records whether the press was cancelled (a listener added after the app's own, on the same window phase).
  await I.js(`window.__down = []; window.addEventListener('mousedown', (e) => window.__down.push({ b: e.button, prevented: e.defaultPrevented }), true);`);
  const downs = () => I.js('window.__down');

  // ======== The Calendar week ========
  const cal = '[data-cal-scroller]';
  const calInfo = await pos(cal);
  check('the Calendar is open in week view with a strip that scrolls sideways and hours that scroll', !!calInfo && calInfo.maxLeft > 100 && calInfo.maxTop > 100, JSON.stringify(calInfo));
  await I.js(`(() => { const s = document.querySelector('${cal}'); s.scrollTop = 400; })()`);
  await C.sleep(300);
  const before = await pos(cal);
  const tasksBefore = JSON.stringify(read('belific_tasks'));
  const blockPt = await centre(`${visibleBlock}`);
  check('a block is on screen to grab', !!blockPt, JSON.stringify(blockPt));
  const startX = 700;
  const startY = 450;

  await mid.down(blockPt.x, blockPt.y);
  check('the middle press is cancelled (no Windows autoscroll circle)', (await downs()).some((d) => d.b === 1 && d.prevented), JSON.stringify(await downs()));
  await mid.move(blockPt.x - 120, blockPt.y - 60);
  await mid.move(blockPt.x - 260, blockPt.y - 140);
  const during = await pos(cal);
  check('dragging left scrolls the strip right (more days), dragging up scrolls the hours down', during.left > before.left + 150 && during.top > before.top + 80, JSON.stringify([before, during]));
  check('the cursor is a grabbing hand while it pans, everywhere', (await panning()) && (await cursorAt(blockPt.x - 260, blockPt.y - 140)) === 'grabbing' && (await cursorAt(900, 300)) === 'grabbing', String(await cursorAt(900, 300)));
  await I.shot('p45-pan-calendar');
  await mid.up(blockPt.x - 260, blockPt.y - 140);
  const after = await pos(cal);
  check('letting go keeps the new place and ends the pan (cursor back)', after.left === during.left && after.top === during.top && !(await panning()), JSON.stringify([during, after]));
  check('no task drag started and no task changed or opened', JSON.stringify(read('belific_tasks')) === tasksBefore && !(await I.exists(`document.querySelector('[data-detail-panel]')`)) && !(await I.exists(`document.querySelector('[data-drag-ghost], [data-dragging]')`)));

  // dragging right and down goes back
  const back = await centre(`${visibleBlock}`);
  await mid.down(back.x, back.y);
  await mid.move(back.x + 300, back.y + 200);
  const back2 = await pos(cal);
  check('dragging right and down scrolls back', back2.left < after.left && back2.top < after.top && back2.left >= 0 && back2.top >= 0, JSON.stringify([after, back2]));
  await mid.move(back.x + 5000, back.y + 5000);
  const clamped = await pos(cal);
  check('far down stops at the top of the hours, never past it (the day strip is a very long one and keeps going)', clamped.top === 0 && clamped.left >= 0 && clamped.left < back2.left, JSON.stringify(clamped));
  await mid.up(back.x + 5000, back.y + 5000);

  // ---- Escape cancels ----
  await I.js(`(() => { const s = document.querySelector('${cal}'); s.scrollLeft = ${before.left} + 200; s.scrollTop = 150; })()`);
  await C.sleep(300);
  const e0 = await pos(cal);
  const ep = await centre(`${visibleBlock}`);
  await mid.down(ep.x, ep.y);
  await mid.move(ep.x - 150, ep.y - 90);
  const e1 = await pos(cal);
  check('mid pan the view has moved', e1.left !== e0.left || e1.top !== e0.top, JSON.stringify([e0, e1]));
  await I.key('Escape', [], 300);
  const e2 = await pos(cal);
  check('Escape puts the view back where it was and ends the grab', e2.left === e0.left && e2.top === e0.top && !(await panning()), JSON.stringify([e0, e2]));
  await mid.move(ep.x - 300, ep.y - 200);
  const e3 = await pos(cal);
  check('moving on after Escape does not pan again', e3.left === e0.left && e3.top === e0.top, JSON.stringify(e3));
  await mid.up(ep.x - 300, ep.y - 200);

  // ---- the left button is not touched ----
  const leftBefore = (await downs()).length;
  send({ type: 'mouseDown', x: startX, y: startY, button: 'left', clickCount: 1 });
  send({ type: 'mouseUp', x: startX, y: startY, button: 'left', clickCount: 1 });
  await C.sleep(300);
  const leftDown = (await downs()).slice(leftBefore).find((d) => d.b === 0);
  check('a left press is not cancelled by the pan', !!leftDown && leftDown.prevented === false, JSON.stringify(leftDown));
  await I.key('Escape', [], 300);

  // ---- a middle press on a field or in the details does nothing ----
  await I.click(`document.querySelector('[aria-label="Search tasks"], [data-add-box="left"] input')`, 400);
  const field = await centre(`document.activeElement`);
  const fb = await pos(cal);
  await mid.down(field.x, field.y);
  await mid.move(field.x - 100, field.y - 100);
  await mid.up(field.x - 100, field.y - 100);
  const fa = await pos(cal);
  check('a middle press outside the Calendar and the Timebox does not pan', fa.left === fb.left && fa.top === fb.top && !(await panning()), JSON.stringify([fb, fa]));

  // ======== The Timebox ========
  await I.js('document.activeElement && document.activeElement.blur()');
  await I.click(`document.querySelector('[aria-label="Show Tasks"]')`, 900);
  await I.click(`document.querySelector('[aria-label="Next day"]')`, 800);
  const tb = '[data-timebox-grid]';
  const t0info = await pos(tb);
  check('the Timebox has hours that scroll', !!t0info && t0info.maxTop > 100, JSON.stringify(t0info));
  await I.js(`(() => { const g = document.querySelector('${tb}'); let p = g; while (p && p.scrollHeight <= p.clientHeight + 2) p = p.parentElement; if (p) p.scrollTop = 150; })()`);
  await C.sleep(300);
  const t0 = await pos(tb);
  const tbPt = await I.js(`(() => { const g = document.querySelector('${tb}'); let p = g; while (p && p.scrollHeight <= p.clientHeight + 2) p = p.parentElement; const r = p.getBoundingClientRect(); return { x: Math.round(r.x + r.width * 0.6), y: Math.round(r.y + r.height / 2) }; })()`);
  await mid.down(tbPt.x, tbPt.y);
  await mid.move(tbPt.x - 40, tbPt.y - 120);
  const t1 = await pos(tb);
  check('Timebox: dragging up scrolls the hours down', t1.top > t0.top + 80, JSON.stringify([t0, t1]));
  check('Timebox: a sideways drag does not move it sideways (nothing scrolls that way)', t1.left === t0.left, JSON.stringify([t0, t1]));
  check('Timebox: the grabbing cursor shows', await panning());
  await I.shot('p45-pan-timebox');
  await mid.up(tbPt.x - 40, tbPt.y - 120);
  check('Timebox: no task changed', JSON.stringify(read('belific_tasks')) === tasksBefore);

  app.exit(summary() === 0 ? 0 : 1);
}
