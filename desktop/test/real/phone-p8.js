'use strict';
// Real touch check for PLAN_phone P8 (2.56.0): the Calendar's Day view at 390 x 844. Day is chosen;
// blocks for timed tasks (a break splits the long task under it into pieces), a projected repeating
// day, an old event in grey, the all day row, the red now line; text in a block never runs over other
// text or out of the block; a tap on a block opens it; a tap on an empty slot opens the quick add with
// that quarter hour (Cancel is one tap; Add stores it there); the arrows and Today move the day.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const C = require('./common');
const { dayKeyFrom } = require('./input');
const { phoneWindow } = require('./phone-common');

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
  const today = day(0);
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, dueDate: today, ...extra });
  const write = (k, v) => fs.writeFileSync(path.join(dataDir, `${k}.kv`), JSON.stringify(v));
  write('belific_tasks', [
    T('standup', 'Standup with a rather long title', { startTime: '09:00', durationMinutes: 30, projectKey: 'w', priority: 'high' }),
    T('camp', 'Boot camp session', { startTime: '09:30', durationMinutes: 420, listKey: 'L1' }),
    T('brk', 'Short break', { startTime: '11:00', durationMinutes: 20, cutsBelow: true }),
    T('tiny', 'Tiny task with a long name', { startTime: '15:00', durationMinutes: 15 }),
    T('allday', 'All day thing'),
    T('walk', 'Morning walk', { dueDate: day(-3), startTime: '07:00', durationMinutes: 30, recurrence: 'daily' }),
  ]);
  write('belific_projects', [{ key: 'w', name: 'Work', colorKey: 'sage', createdAt: stamp, updatedAt: stamp }]);
  write('belific_lists', [{ key: 'L1', name: 'Camp', emoji: '🎓', sortOrder: 0, createdAt: stamp, updatedAt: stamp }]);
  write('belific_custom_events', [{ id: 'ev1', title: 'Gym class', category: 'health', icon: '🏋️', start: '13:00', end: '14:00', notes: '', date: today, createdAt: stamp, updatedAt: stamp }]);
  const tasks = () => JSON.parse(fs.readFileSync(path.join(dataDir, 'belific_tasks.kv'), 'utf8'));

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.show();
  await C.sleep(2500);
  const P = await phoneWindow(win);
  const shot = async (name) => {
    if (!process.env.BELIFIC_SHOTS) return;
    fs.mkdirSync(process.env.BELIFIC_SHOTS, { recursive: true });
    fs.writeFileSync(path.join(process.env.BELIFIC_SHOTS, `${name}.png`), (await win.webContents.capturePage()).toPNG());
  };
  const tabEls = `[...document.querySelectorAll('a, [role="tab"], [role="button"], [role="link"]')].filter((e) => { const r = e.getBoundingClientRect(); return r.top > 760 && r.height > 20 && r.width > 40 && r.width < 200; })`;
  const tab = (name) => `${tabEls}.find((e) => e.textContent.replace(/[^ -~]/g, '').trim() === '${name}')`;
  const visible = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].reverse().find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left >= -1 && r.left < innerWidth && r.top < innerHeight && r.bottom > 0; })`;
  const blockIds = () => P.js(`[...document.querySelectorAll('[data-phone-block]')].map((e) => e.getAttribute('data-phone-block'))`);
  // Scrolls the timeline so that `hour` is near the top.
  const scrollToHour = (hour) =>
    P.js(`(() => { let e = document.querySelector('[data-empty-slots]'); while (e && !(e.scrollHeight > e.clientHeight + 4 && ['auto', 'scroll'].includes(getComputedStyle(e).overflowY))) e = e.parentElement; if (e) e.scrollTop = ${hour} * 56; return !!e; })()`);

  await P.finger.tap(tab('Calendar'), 1200);
  check('the Calendar opens on Day (the Day timeline is drawn)', await P.js(`!!document.querySelector('[data-day-view="${today}"]')`));
  await C.waitFor(async () => (await blockIds()).length >= 5, 6000).catch(() => {});
  const ids = await blockIds();
  check('timed tasks, the projected repeating day and the old event are blocks', ids.includes('task:standup') && ids.includes(`task:walk:${today}`) && ids.includes('event:ev1') && ids.includes('task:tiny'), JSON.stringify(ids));
  check('the break splits the long task under it into pieces', ids.filter((i) => i.startsWith('task:camp#')).length === 2 && ids.includes('task:brk'), JSON.stringify(ids));
  check('the untimed task is in the all day row', await P.js(`!!document.querySelector('[data-all-day-chip="All day thing"]')`));
  check('the red now line is drawn on today', await P.js(`!!document.querySelector('[data-now-line]')`));

  // Text never runs over text or out of its block (the 2.47.0 rule, on the phone).
  await scrollToHour(8);
  await C.sleep(400);
  const overlap = await P.js(`(() => {
    const bad = [];
    for (const b of document.querySelectorAll('[data-phone-block]')) {
      const br = b.getBoundingClientRect();
      const boxes = [];
      const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = w.nextNode())) {
        if (!n.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const r = range.getBoundingClientRect();
        let vis = { l: r.left, t: r.top, r: r.right, b: r.bottom };
        for (let e = n.parentElement; e && e !== b.parentElement; e = e.parentElement) {
          const cs = getComputedStyle(e);
          if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
            const c = e.getBoundingClientRect();
            vis = { l: Math.max(vis.l, c.left), t: Math.max(vis.t, c.top), r: Math.min(vis.r, c.right), b: Math.min(vis.b, c.bottom) };
          }
        }
        if (vis.r > vis.l && vis.b > vis.t) boxes.push({ s: n.textContent.trim().slice(0, 16), ...vis, cut: vis.t > r.top + 0.5 || vis.b < r.bottom - 0.5 });
      }
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], c = boxes[j];
        if (Math.min(a.r, c.r) - Math.max(a.l, c.l) > 0.5 && Math.min(a.b, c.b) - Math.max(a.t, c.t) > 0.5) bad.push([b.getAttribute('data-phone-block'), a.s, c.s]);
      }
      for (const x of boxes) if (x.cut || x.l < br.left - 0.5 || x.r > br.right + 0.5) bad.push([b.getAttribute('data-phone-block'), 'out', x.s]);
    }
    return bad;
  })()`);
  check('no text in a block overlaps other text or is cut outside the block', overlap.length === 0, JSON.stringify(overlap));
  await shot('phone-p8-day');

  // A tap on a block opens it.
  await P.finger.tap(visible('[data-block-tap="task:standup"]'), 1200);
  check('a tap on a block opens its details', await P.js(`!!document.querySelector('[data-task-details="standup"]')`));
  await P.finger.tap(visible('[aria-label="Done"]'), 900);

  // A tap on an empty slot: 16:15.
  await scrollToHour(15);
  await C.sleep(500);
  const slot = await P.point(`document.querySelector('[data-empty-slots]')`);
  await P.finger.tapAt(slot.left + slot.w * 0.7, slot.top + 16.25 * 56 + 8, 900);
  const label = await P.js(`(() => { const e = document.querySelector('[data-quick-add]'); return e ? e.getAttribute('data-quick-add') : null; })()`);
  check('a tap on an empty slot opens the quick add with that quarter hour', !!label && /4:15pm/.test(label), String(label));
  await shot('phone-p8-quickadd');
  await P.finger.tap(visible('[data-quick-add] [aria-label="Cancel adding"]'), 700);
  check('Cancel closes it in one tap, nothing stored', !(await P.js(`!!document.querySelector('[data-quick-add]')`)) && tasks().length === 6);
  await P.finger.tapAt(slot.left + slot.w * 0.7, slot.top + 16.25 * 56 + 8, 900);
  await P.finger.tap(visible('[aria-label="New task title"]'), 300);
  await win.webContents.insertText('Call the dentist');
  await C.sleep(300);
  await P.finger.tap(visible('[aria-label="Add task"]'), 1200);
  const added = tasks().find((t) => t.title === 'Call the dentist');
  check('Add stores the task on that day at that time, 30 minutes', !!added && added.dueDate === today && added.startTime === '16:15' && added.durationMinutes === 30, JSON.stringify(added));
  check('the new task is drawn as a block', (await blockIds()).includes(`task:${added && added.id}`));

  // The all day chip opens.
  await P.finger.tap(visible('[data-all-day-chip="All day thing"]'), 1200);
  check('an all day chip opens its details', await P.js(`!!document.querySelector('[data-task-details="allday"]')`));
  await P.finger.tap(visible('[aria-label="Done"]'), 900);

  // The arrows and Today.
  await P.finger.tap(visible('[aria-label="Next day"]'), 800);
  check('Next day moves one day', await P.js(`!!document.querySelector('[data-cal-title="${day(1)}"]')`));
  check('another day has no now line', !(await P.js(`!!document.querySelector('[data-now-line]')`)));
  await P.finger.tap(visible('[aria-label="Go to today"]'), 800);
  check('Today comes back', await P.js(`!!document.querySelector('[data-cal-title="${today}"]')`));

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
