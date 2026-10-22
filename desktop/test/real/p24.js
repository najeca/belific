'use strict';
// Real check for 2.47.0: small Calendar and Timebox blocks never overlap their own text.
// Blocks of 15, 20, 30, 45, 60 and 90 minutes (and three narrow side by side 20 minute blocks), each with a
// long title, a repeat, a top priority mark and a list emoji, in light and in dark, on the Calendar's day
// view and on the Timebox. For every block: no two text boxes inside it intersect, every text box is
// inside the block (nothing painted outside), and the tooltip still has the whole title and time.
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
  const TITLE = 'Leep Talent Online Boot Camp Session';
  const dow = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getDay()];
  const T = (id, hhmm, mins) => ({
    id,
    title: TITLE,
    completed: false,
    createdAt: stamp,
    updatedAt: stamp,
    dueDate: today,
    startTime: hhmm,
    durationMinutes: mins,
    priority: 'high',
    recurrence: 'weekly',
    recurrenceDays: [dow],
    listKey: 'L1',
  });
  const tasks = [
    T('m15', '06:00', 15),
    T('m20', '07:00', 20),
    T('m30', '08:00', 30),
    T('m45', '09:00', 45),
    T('m60', '10:00', 60),
    T('m90', '12:00', 90),
    T('n1', '15:00', 20),
    T('n2', '15:00', 20),
    T('n3', '15:00', 20),
  ];
  fs.writeFileSync(path.join(dataDir, 'belific_tasks.kv'), JSON.stringify(tasks));
  fs.writeFileSync(path.join(dataDir, 'belific_lists.kv'), JSON.stringify([{ key: 'L1', name: 'Work', emoji: '💼', sortOrder: 0, createdAt: stamp, updatedAt: stamp }]));
  fs.writeFileSync(path.join(dataDir, 'belific_desktop_panes.kv'), JSON.stringify({ leftCollapsed: true, rightCollapsed: false, center: 'kanban', calendar: 'day' }));

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1440, 900);
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await C.sleep(3500);

  // One report per block: its text boxes (every text node, plus icons) against its own rectangle and each other.
  const measure = (selector) =>
    I.js(`(() => {
      const blocks = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((b) => b.getBoundingClientRect().width > 0);
      return blocks.map((b) => {
        const br = b.getBoundingClientRect();
        const boxes = [];
        const walker = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = walker.nextNode())) {
          if (!n.textContent.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(n);
          const r = range.getBoundingClientRect();
          if (!(r.width > 0 && r.height > 0)) continue;
          // What is painted: the text box cut by every overflow hidden box between it and the block (an
          // ellipsis cuts the width on purpose; a cut at the top or bottom is a clipped line).
          let vis = { l: r.left, t0: r.top, r: r.right, b: r.bottom };
          for (let e = n.parentElement; e; e = e.parentElement) {
            const cs = getComputedStyle(e);
            if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
              const c = e.getBoundingClientRect();
              vis = { l: Math.max(vis.l, c.left), t0: Math.max(vis.t0, c.top), r: Math.min(vis.r, c.right), b: Math.min(vis.b, c.bottom) };
            }
            if (e === b) break;
          }
          const cutY = vis.t0 > r.top + 0.5 || vis.b < r.bottom - 0.5;
          if (vis.r > vis.l && vis.b > vis.t0) boxes.push({ t: n.textContent.trim().slice(0, 24), l: vis.l, t0: vis.t0, r: vis.r, b: vis.b, cutY });
        }
        for (const ic of b.querySelectorAll('[aria-label="Repeats"] svg, [aria-label="Repeats"]')) {
          const r = ic.getBoundingClientRect();
          if (r.width > 0 && r.height > 0 && !boxes.some((x) => Math.abs(x.l - r.left) < 1 && Math.abs(x.t0 - r.top) < 1)) boxes.push({ t: 'repeat', l: r.left, t0: r.top, r: r.right, b: r.bottom });
        }
        const hit = [];
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], c = boxes[j];
          const w = Math.min(a.r, c.r) - Math.max(a.l, c.l), h = Math.min(a.b, c.b) - Math.max(a.t0, c.t0);
          if (w > 0.5 && h > 0.5) hit.push([a.t, c.t]);
        }
        const out = boxes.filter((x) => x.cutY || x.l < br.left - 0.5 || x.r > br.right + 0.5 || x.t0 < br.top - 0.5 || x.b > br.bottom + 0.5).map((x) => x.t);
        const title = [...b.querySelectorAll('div,span')].find((e) => e.childElementCount === 0 && e.textContent.includes('Leep'));
        return {
          id: b.getAttribute('data-block-task'),
          h: Math.round(br.height),
          w: Math.round(br.width),
          texts: boxes.map((x) => x.t),
          hit,
          out,
          hasTitle: !!title,
          tip: b.getAttribute('title') || '',
        };
      });
    })()`);

  const inspect = async (label, selector, expectTip) => {
    const rows = await measure(selector);
    const ids = ['m15', 'm20', 'm30', 'm45', 'm60', 'm90', 'n1', 'n2', 'n3'];
    check(`${label}: all nine blocks are drawn`, ids.every((id) => rows.some((r) => r.id === id)), JSON.stringify(rows.map((r) => r.id)));
    for (const r of rows) {
      check(`${label}: ${r.id} (${r.h}px x ${r.w}px): the text boxes do not intersect`, r.hit.length === 0, JSON.stringify(r));
      check(`${label}: ${r.id}: nothing is painted outside the block`, r.out.length === 0, JSON.stringify(r));
      check(`${label}: ${r.id}: the title is in the block`, r.hasTitle, JSON.stringify(r));
      if (expectTip(r)) check(`${label}: ${r.id}: the tooltip has the whole title, the time and Repeats`, r.tip.includes(TITLE) && /\d/.test(r.tip) && r.tip.includes('Repeats'), r.tip);
    }
    return rows;
  };
  const tipExpected = (r) => r.h < 54;

  const scrollTo = (selector) => I.js(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.getBoundingClientRect().width > 0); if (b) b.scrollIntoView({ block: 'start' }); })()`);

  const theme = () => I.js(`document.documentElement.getAttribute('data-theme')`);
  const profile = async () => {
    const icon = (await I.exists(I.byLabel('Profile and account'))) ? 'Profile and account' : 'Profile, not signed in';
    await I.click(I.byLabel(icon), 500);
  };
  const tour = async (themeName) => {
    check(`the ${themeName} theme is on`, (await theme()) === themeName, String(await theme()));
    // The Calendar, Day view.
    await I.click(`document.querySelector('[aria-label="Show the Calendar"]')`, 800);
    await I.click(`document.querySelector('[aria-label="Day view"]')`, 800);
    const cal = '[data-cal-block]';
    await scrollTo('[data-cal-block$="m15"]');
    await C.sleep(500);
    const rows = await inspect(`${themeName} Calendar`, cal, tipExpected);
    // Heights are the true scale (56px an hour, never under 20).
    const h = Object.fromEntries(rows.map((r) => [r.id, r.h]));
    check(`${themeName} Calendar: heights follow the minutes`, h.m15 >= 19 && h.m20 >= 19 && h.m45 > 38 && h.m60 > 52 && h.m90 > 80, JSON.stringify(h));
    await I.shot(`p24-${themeName}-calendar-top`);
    await scrollTo('[data-cal-block$="m90"]');
    await C.sleep(400);
    await I.shot(`p24-${themeName}-calendar-bottom`);
    // The Timebox.
    await I.click(`document.querySelector('[aria-label="Show Tasks"]')`, 900);
    await scrollTo('[data-block-id="m15"]');
    await C.sleep(500);
    await inspect(`${themeName} Timebox`, '[data-block-id]', tipExpected);
    await I.shot(`p24-${themeName}-timebox-top`);
    await scrollTo('[data-block-id="m90"]');
    await C.sleep(400);
    await I.shot(`p24-${themeName}-timebox-bottom`);
  };

  // The full layout is kept for a tall block: its time line still has the list emoji and the length.
  await I.click(`document.querySelector('[aria-label="Show the Calendar"]')`, 800);
  await I.click(`document.querySelector('[aria-label="Day view"]')`, 800);
  const tall = await I.js(`(() => { const b = document.querySelector('[data-cal-block$="m90"]'); return { text: b.innerText.replace(/\\s+/g, ' '), emoji: !!b.querySelector('[data-block-list-emoji]') }; })()`);
  check('tier 3: a 90 minute block keeps the full layout (time, length, list emoji)', /\d{1,2}:\d\d/.test(tall.text) && /1h 30m/.test(tall.text) && tall.emoji, JSON.stringify(tall));
  const one = await I.js(`(() => { const b = document.querySelector('[data-cal-block$="m20"]'); return { text: b.innerText.replace(/\\s+/g, ' '), emoji: !!b.querySelector('[data-block-list-emoji]'), repeat: !!b.querySelector('[aria-label="Repeats"]') }; })()`);
  check('tier 1: a 20 minute block has no list emoji and no repeat icon', !one.emoji && !one.repeat, JSON.stringify(one));
  await I.click(`document.querySelector('[aria-label="Show Tasks"]')`, 800);

  await tour('light');
  await profile();
  await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 800);
  await I.click(`document.querySelector('[data-theme-setting] [data-theme-mode="dark"]')`, 900);
  if (await I.exists(I.byLabel('Back'))) await I.click(I.byLabel('Back'), 700);
  await tour('dark');

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
