'use strict';
// Real touch check for 3.7.0 on the phone at 390 x 844: a task during a break in the Calendar's Day view.
// A 20 minute break with two tasks inside it shows a "+2" badge (no room for chips); a 60 minute one
// with one task shows its chip; a 90 minute one with three shows three chips. The hosted tasks have no
// block of their own and no text overlaps. A tap on a break with tasks opens a sheet listing them; a
// row opens that task; "Open <break>" opens the break. Today's list is unchanged. Light and dark.
// BELIFIC_SHOTS: a folder for screenshots.
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
  const T = (id, title, start, len, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, dueDate: today, startTime: start, durationMinutes: len, ...extra });
  const write = (k, v) => fs.writeFileSync(path.join(dataDir, `${k}.kv`), JSON.stringify(v));
  write('belific_tasks', [
    T('tea', 'Tea', '09:00', 20, { cutsBelow: true }),
    T('t1', 'Water the plants', '09:00', 5),
    T('t2', 'Text Mum', '09:10', 10, { projectKey: 'work' }),
    T('lunch', 'Lunch', '11:00', 60, { cutsBelow: true }),
    T('pod', 'Listen to a podcast episode', '11:10', 30, { projectKey: 'work' }),
    T('long', 'Long lunch', '13:00', 90, { cutsBelow: true }),
    T('e1', 'Reply to Sam', '13:00', 15),
    T('e2', 'Call the bank', '13:20', 20, { projectKey: 'work' }),
    T('e3', 'Read a chapter', '13:45', 30),
  ]);
  write('belific_projects', [{ key: 'work', name: 'Work', colorKey: 'sky', createdAt: stamp, updatedAt: stamp }]);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.show();
  await C.sleep(2500);
  const P = await phoneWindow(win);
  await C.sleep(1800);
  const shot = async (name) => {
    if (!process.env.BELIFIC_SHOTS) return;
    fs.mkdirSync(process.env.BELIFIC_SHOTS, { recursive: true });
    fs.writeFileSync(path.join(process.env.BELIFIC_SHOTS, `${name}.png`), (await win.webContents.capturePage()).toPNG());
  };
  const tabEls = `[...document.querySelectorAll('a, [role="tab"], [role="button"], [role="link"]')].filter((e) => { const r = e.getBoundingClientRect(); return r.top > 760 && r.height > 20 && r.width > 40 && r.width < 200; })`;
  const tab = (name) => `${tabEls}.find((e) => e.textContent.replace(/[^ -~]/g, '').trim() === '${name}')`;
  const visible = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].reverse().find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left >= -1 && r.left < innerWidth && r.top < innerHeight && r.bottom > 0; })`;
  const blockIds = () => P.js(`[...document.querySelectorAll('[data-phone-block]')].map((e) => e.getAttribute('data-phone-block'))`);
  const scrollToHour = (hour) =>
    P.js(`(() => { let e = document.querySelector('[data-empty-slots]'); while (e && !(e.scrollHeight > e.clientHeight + 4 && ['auto', 'scroll'].includes(getComputedStyle(e).overflowY))) e = e.parentElement; if (e) e.scrollTop = ${hour} * 56; return !!e; })()`);
  // A break block: its host count, the chips, the "+N", and whether anything overlaps or leaves the block.
  const breakOf = (id) =>
    P.js(`(() => {
      const w = document.querySelector('[data-phone-block="task:${id}"]');
      const b = w && w.querySelector('[data-host-count]');
      if (!b) return null;
      const br = b.getBoundingClientRect();
      const box = (e, k) => { const r = e.getBoundingClientRect(); return { k, l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
      const parts = [box(b.querySelector('[data-host-title]'), 'title')];
      for (const c of b.querySelectorAll('[data-host-chip]')) parts.push(box(c, 'chip'));
      const m = b.querySelector('[data-host-more]');
      if (m) parts.push(box(m, 'more'));
      const bad = [];
      for (let i = 0; i < parts.length; i++) {
        const a = parts[i];
        if (a.h > 0.5 && (a.l < br.left - 0.5 || a.r > br.right + 0.5 || a.t < br.top - 0.5 || a.b > br.bottom + 0.5)) bad.push(a.k + ' out');
        for (let j = i + 1; j < parts.length; j++) {
          const c = parts[j];
          if (Math.min(a.r, c.r) - Math.max(a.l, c.l) > 0.5 && Math.min(a.b, c.b) - Math.max(a.t, c.t) > 0.5) bad.push(a.k + '/' + c.k);
        }
      }
      return { count: b.getAttribute('data-host-count'), chips: b.querySelectorAll('[data-host-chip]').length, more: m ? m.getAttribute('data-host-more') : '0', bad, label: (w.querySelector('[data-block-tap]') || {}).getAttribute?.('aria-label') || '' };
    })()`);
  const menuText = () => P.js(`(document.querySelector('[data-action-menu]') || {}).innerText || ''`);

  const tour = async (theme) => {
    await P.finger.tap(tab('Calendar'), 1200);
    await C.waitFor(async () => (await blockIds()).includes('task:long'), 6000).catch(() => {});
    const ids = await blockIds();
    check(`${theme}: hosted tasks have no block of their own; the breaks are blocks`, ['tea', 'lunch', 'long'].every((i) => ids.includes(`task:${i}`)) && !['t1', 't2', 'pod', 'e1', 'e2', 'e3'].some((i) => ids.includes(`task:${i}`)), JSON.stringify(ids));
    await scrollToHour(8);
    await C.sleep(400);
    const tea = await breakOf('tea');
    check(`${theme}: the 20 minute break shows "+2" and no chips (no room)`, !!tea && tea.count === '2' && tea.chips === 0 && tea.more === '2' && tea.bad.length === 0, JSON.stringify(tea));
    check(`${theme}: its label names what is during it`, !!tea && /during it: Water the plants, Text Mum/.test(tea.label), tea && tea.label);
    const lunch = await breakOf('lunch');
    check(`${theme}: the 60 minute break shows its one chip, nothing overlapping`, !!lunch && lunch.count === '1' && lunch.chips === 1 && lunch.more === '0' && lunch.bad.length === 0, JSON.stringify(lunch));
    await shot(`phone-p13-${theme}-1`);
    await scrollToHour(11);
    await C.sleep(400);
    const long = await breakOf('long');
    check(`${theme}: the 90 minute break shows three chips, nothing overlapping`, !!long && long.count === '3' && long.chips === 3 && long.more === '0' && long.bad.length === 0, JSON.stringify(long));
    await shot(`phone-p13-${theme}-2`);
  };

  await tour('light');
  const chipBg = await P.js(`getComputedStyle(document.querySelector('[data-host-chip]')).backgroundColor`);
  check('light: the chip is light (white)', chipBg === 'rgb(255, 255, 255)', chipBg);

  // A tap on the short break opens the sheet of its tasks.
  await scrollToHour(8);
  await C.sleep(400);
  await P.finger.tap(visible('[data-block-tap="task:tea"]'), 1000);
  const m1 = await menuText();
  check('a tap on a break with tasks opens a sheet listing them, and Open Tea', /During Tea/.test(m1) && m1.includes('Water the plants') && m1.includes('Text Mum') && m1.includes('Open Tea'), m1);
  check('the tap did not open the break itself', !(await P.js(`!!document.querySelector('[data-task-details]')`)));
  await shot('phone-p13-sheet');
  await P.finger.tap(visible('[data-action-menu] [aria-label^="Text Mum"]'), 1200);
  const d1 = await P.js(`(document.querySelector('[data-task-details]') || {}).parentElement?.innerText || ''`);
  const v1 = await P.js(`[...document.querySelectorAll('input, textarea')].filter((e) => e.getBoundingClientRect().height > 0).map((e) => e.value).join('|')`);
  check('a row opens that task', (d1 + v1).includes('Text Mum'), (d1 + '|' + v1).slice(0, 160));
  await shot('phone-p13-details');
  // Closing the details: Done or a swipe down; use the Done button.
  if (await P.js(`!!(${visible('[aria-label="Done"]')})`)) await P.finger.tap(visible('[aria-label="Done"]'), 900);
  else if (await P.js(`!!(${visible('[aria-label="Close"]')})`)) await P.finger.tap(visible('[aria-label="Close"]'), 900);
  await C.sleep(400);
  await P.finger.tap(visible('[data-block-tap="task:tea"]'), 1000);
  await P.finger.tap(visible('[data-action-menu] [aria-label="Open Tea"]'), 1200);
  const v2 = await P.js(`[...document.querySelectorAll('input, textarea')].filter((e) => e.getBoundingClientRect().height > 0).map((e) => e.value).join('|')`);
  const d2 = await P.js(`(document.querySelector('[data-task-details]') || {}).parentElement?.innerText || ''`);
  check('"Open Tea" opens the break itself', (d2 + v2).includes('Tea'), (d2 + '|' + v2).slice(0, 160));
  if (await P.js(`!!(${visible('[aria-label="Done"]')})`)) await P.finger.tap(visible('[aria-label="Done"]'), 900);
  else if (await P.js(`!!(${visible('[aria-label="Close"]')})`)) await P.finger.tap(visible('[aria-label="Close"]'), 900);
  await C.sleep(400);
  // A break with no task inside opens as before: Lunch has one, so check a plain block instead later.

  // Today is unchanged: every task is its own row.
  await P.finger.tap(tab('Today'), 1200);
  const todayText = await P.js('document.body.innerText');
  check('Today still lists every task on its own (nothing changes there)', ['Tea', 'Water the plants', 'Text Mum', 'Lunch', 'Listen to a podcast episode', 'Long lunch', 'Reply to Sam', 'Call the bank', 'Read a chapter'].every((t) => todayText.includes(t)), todayText.slice(0, 300));

  // Dark.
  await P.finger.tap(visible('[data-profile-avatar]'), 1200);
  await P.finger.tap(visible('[data-phone-theme] [data-seg="dark"]'), 900);
  if (await P.js(`!!(${visible('[aria-label="Back"]')})`)) await P.finger.tap(visible('[aria-label="Back"]'), 900);
  else if (await P.js(`!!(${visible('[aria-label="Done"]')})`)) await P.finger.tap(visible('[aria-label="Done"]'), 900);
  await tour('dark');
  const chipDark = await P.js(`(() => { const c = document.querySelector('[data-host-chip]'); const t = c.querySelector('div[dir="auto"]'); return getComputedStyle(c).backgroundColor + ' ' + getComputedStyle(t).color; })()`);
  check('dark: the chip stays light with dark text', chipDark === 'rgb(236, 236, 236) rgb(18, 18, 18)', chipDark);
  await scrollToHour(8);
  await C.sleep(300);
  await P.finger.tap(visible('[data-block-tap="task:tea"]'), 1000);
  await shot('phone-p13-dark-sheet');

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
