'use strict';
// Real check for Part B, phases P1 and P2 (2.28.2 word breaking, 2.29.0 top priority
// first): real app, isolated data folder, in process fake Supabase.
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
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      // Three overlapping blocks: narrow lanes.
      T('o1', 'Leep Talent Online Boot Camp Session', { dueDate: today, startTime: '10:00', durationMinutes: 180 }),
      T('o2', 'Extraordinarily international collaboration', { dueDate: today, startTime: '10:30', durationMinutes: 120 }),
      T('o3', 'Representative documentation', { dueDate: today, startTime: '11:00', durationMinutes: 90 }),
      // Untimed tasks (P2): the top priority one is made last on purpose.
      T('u1', 'Untimed alpha', { dueDate: today, createdAt: '2026-09-01T07:00:01.000Z' }),
      T('u2', 'Untimed beta', { dueDate: today, createdAt: '2026-09-01T07:00:02.000Z' }),
      T('u3', 'Untimed urgent', { dueDate: today, createdAt: '2026-09-01T07:00:03.000Z', priority: 'high' }),
      // Overlap with a top priority block (P2): it must take the first lane and sit on top.
      T('p1', 'Low block', { dueDate: day(1), startTime: '09:00', durationMinutes: 120 }),
      T('p2', 'Urgent block', { dueDate: day(1), startTime: '09:30', durationMinutes: 60, priority: 'high' }),
    ]),
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

  // ======== P1. No word is split in a narrow lane ========
  const words = (sel) =>
    I.js(`(() => {
      const out = [];
      for (const b of document.querySelectorAll(${JSON.stringify(sel)})) {
        const walker = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = walker.nextNode())) {
          if (!n.textContent.trim() || !n.parentElement || n.parentElement.closest('[data-priority-mark]')) continue;
          const re = /\\S+/g; let m;
          while ((m = re.exec(n.textContent))) {
            const r = document.createRange(); r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length);
            const tops = [...r.getClientRects()].map((q) => Math.round(q.top));
            if (tops.length && Math.max(...tops) - Math.min(...tops) > 3) out.push(m[0]);
          }
        }
      }
      return out;
    })()`);
  const lane = await I.js(`Math.round(document.querySelector('[data-cal-block$=":o1"]').getBoundingClientRect().width)`);
  check('P1: the three overlapping blocks really are in narrow lanes', lane < 90, String(lane));
  const split = await words('[data-cal-block$=":o1"],[data-cal-block$=":o2"],[data-cal-block$=":o3"]');
  check('P1: no word is split across lines in a narrow lane', split.length === 0, JSON.stringify(split));
  const style = await I.js(`(() => { const b = document.querySelector('[data-cal-block$=":o1"]'); const t = [...b.querySelectorAll('div,span')].find((e) => e.textContent.trim().startsWith('Leep')); const s = getComputedStyle(t); return [s.overflowWrap, s.wordBreak]; })()`);
  check('P1: lines break at spaces only (overflow-wrap and word-break normal)', style[0] === 'normal' && style[1] === 'normal', JSON.stringify(style));
  const tip = await I.js(`document.querySelector('[data-cal-block$=":o2"]').getAttribute('title')`);
  check('P1: the tooltip still has the whole title', !!tip && tip.includes('Extraordinarily international collaboration'), String(tip));
  await I.shot('p13-P1-narrow');
  // A wide lane (Day view) shows everything on lines.
  await I.click(`document.querySelector('[aria-label="Day view"]')`, 600);
  const splitDay = await words('[data-cal-block$=":o1"]');
  check('P1: in Day view nothing is split either', splitDay.length === 0, JSON.stringify(splitDay));
  await I.click(`document.querySelector('[aria-label="Week view"]')`, 600);

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
