'use strict';
// Real check for 3.23.0, step 2: the meta line of a left pane task card. Two lines: line 1 the list emoji, the label
// dot and the label NAME (an ellipsis only when the name truly cannot fit); line 2 the day and time and the Must do
// mark. Window sizes 1024 (the narrowest), 1440 and 1920 wide, light and dark. BELIFIC_SHOTS: screenshots.
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
  const w = (k, v) => fs.writeFileSync(path.join(dataDir, `${k}.kv`), typeof v === 'string' ? v : JSON.stringify(v));
  w('belific_lists', [{ key: 'LG', name: 'Games', sortOrder: 0, emoji: '🎮', createdAt: stamp, updatedAt: stamp }]);
  w('belific_desktop_list', 'LG');
  w('belific_projects', [
    { key: 'LB', name: 'Quarterly planning', colorKey: 'sage', createdAt: stamp, updatedAt: stamp },
    { key: 'LL', name: 'A very long label name that can never fit a narrow left pane at all', colorKey: 'clay', createdAt: stamp, updatedAt: stamp },
  ]);
  w('belific_tasks', [
    T('a', 'Write the quarterly report', { listKey: 'LG', projectKey: 'LB', dueDate: day(1), startTime: '09:30', durationMinutes: 90, priority: 'high' }),
    T('b', 'Long label task', { listKey: 'LG', projectKey: 'LL', dueDate: day(1), startTime: '14:00', durationMinutes: 30 }),
  ]);
  w('belific_desktop_panes', { leftCollapsed: false, rightCollapsed: false, center: 'kanban', calendar: 'day' });
  readKv(dataDir);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  win.setSize(1440, 900);
  await I.waitBody('Write the quarterly report', 20000);
  await I.click(I.byLabel('Show Tasks'), 800).catch(() => {});
  await C.sleep(600);

  // The left pane's card for a title: its meta lines.
  const probe = (title) =>
    I.js(`(() => {
      const pane = document.querySelector('[data-add-box="left"]').closest('[data-pane], div');
      const cards = [...document.querySelectorAll('[data-card-meta]')].map((m) => m.parentElement).filter((c) => c.innerText.includes(${JSON.stringify(title)}));
      const card = cards.find((c) => c.getBoundingClientRect().left < 330);
      if (!card) return null;
      const meta = card.querySelector('[data-card-meta]');
      const l1 = meta.querySelector('[data-card-meta-line="1"]');
      const l2 = meta.querySelector('[data-card-meta-line="2"]');
      const lab = card.querySelector('[data-card-label]');
      const labText = lab && lab.lastElementChild;
      const day = card.querySelector('[data-card-day]');
      const r = (e) => e && e.getBoundingClientRect();
      const cr = r(card), m = r(meta);
      return {
        l1: l1 ? l1.innerText : null, l2: l2 ? l2.innerText : null,
        l1Bottom: l1 && Math.round(r(l1).bottom), l2Top: l2 && Math.round(r(l2).top),
        labCut: labText ? labText.scrollWidth > labText.clientWidth + 1 : null,
        labW: labText && Math.round(r(labText).width),
        dayCut: day ? day.scrollWidth > day.clientWidth + 1 : null,
        metaOverflow: meta.scrollWidth > meta.clientWidth + 1,
        inCard: m.bottom <= cr.bottom + 1 && m.right <= cr.right + 1,
        cardW: Math.round(cr.width),
      };
    })()`);

  async function pass(mode) {
    for (const [wd, ht] of [[1024, 720], [1440, 900], [1920, 1080]]) {
      win.setSize(wd, ht);
      await C.sleep(900);
      const a = await probe('Write the quarterly report');
      const tag = `${mode} ${wd}`;
      check(`${tag}: card found`, !!a, JSON.stringify(a));
      if (!a) continue;
      check(`${tag}: line 1 has the list emoji and the label NAME (not just a dot)`, /🎮/.test(a.l1 || '') && /Quarterly planning/.test(a.l1 || '') && !a.labCut, JSON.stringify(a));
      check(`${tag}: line 2 has the day, the time and the Must do mark, on its own line below`, /\d/.test(a.l2 || '') && /09:30|9:30/.test(a.l2 || '') && /❗/.test(a.l2 || '') && a.l2Top >= a.l1Bottom - 1, JSON.stringify(a));
      check(`${tag}: the day and time are not cut and nothing spills out of the card`, a.dayCut === false && !a.metaOverflow && a.inCard, JSON.stringify(a));
      const b = await probe('Long label task');
      check(`${tag}: a very long label name still shows (ellipsis only because it truly cannot fit) and line 2 is intact`, !!b && b.labW >= 60 && /14:00|2:00/.test(b.l2 || '') && b.l2Top >= b.l1Bottom - 1 && !b.metaOverflow, JSON.stringify(b));
      await I.shot(`p43-left-${mode}-${wd}`);
    }
  }

  await pass('light');
  win.setSize(1440, 900);
  await C.sleep(500);
  const icon = (await I.exists(I.byLabel('Profile and account'))) ? 'Profile and account' : 'Profile, not signed in';
  await I.click(I.byLabel(icon));
  await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 700);
  await I.waitBody('POWER FEATURES', 8000);
  await I.click(`document.querySelector('[data-theme-setting] [data-theme-mode="dark"]')`, 900);
  await I.click(I.byLabel('Back'), 900);
  await I.click(I.byLabel('Show Tasks'), 800).catch(() => {});
  await C.sleep(600);
  await pass('dark');

  app.exit(summary() === 0 ? 0 : 1);
}
