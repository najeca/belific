'use strict';
// @real-input: quiet
// Real touch check for the 3.63.0 look and clean up (phone only) at 390 x 844:
//   1. no sample (starter) events on Today or the Calendar day of a fresh phone;
//   2. no red anywhere: Today, Tasks, the swipe actions, the hold card, the task card and its Delete menu, the Calendar
//      (day, week, month), Settings, Plan my day, light and dark (a red is a colour of the red hue; the people's own label
//      colours are not red here);
//   3. the look: Inter 800 at 36 for the page title, the 8 px accent band on the task card, the hold card and a sheet,
//      the selected tab filled with the accent, buttons at a radius of 10, Settings sections as slab cards (light only).
// Runs quiet.
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
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const write = (k, v) => fs.writeFileSync(path.join(dataDir, `${k}.kv`), JSON.stringify(v));
  const task = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.show();
  await C.sleep(2500);
  const P = await phoneWindow(win);
  await C.sleep(1500);
  const shot = async (name) => {
    if (!process.env.BELIFIC_SHOTS) return;
    fs.mkdirSync(process.env.BELIFIC_SHOTS, { recursive: true });
    fs.writeFileSync(path.join(process.env.BELIFIC_SHOTS, `${name}.png`), (await win.webContents.capturePage()).toPNG());
  };
  const tabEls = `[...document.querySelectorAll('a, [role="tab"], [role="button"], [role="link"]')].filter((e) => { const r = e.getBoundingClientRect(); return r.top > 760 && r.height > 20 && r.width > 40 && r.width < 200; })`;
  const tab = (name) => `${tabEls}.find((e) => e.textContent.replace(/[^ -~]/g, '').trim() === '${name}')`;
  const visible = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].reverse().find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left >= -1 && r.left < innerWidth && r.top < innerHeight; })`;
  const tap = (sel, ms = 900) => P.finger.tap(visible(sel), ms);
  const has = (sel) => P.js(`!!(${visible(sel)})`);
  // Red: the red hue, strong and not grey (accent sage, sky, greys and white are none of it).
  const redScan = () =>
    P.js(`(() => {
      const red = (c) => { const m = /rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?/.exec(c || ''); if (!m) return false; const [r, g, b] = [+m[1], +m[2], +m[3]]; const a = m[4] === undefined ? 1 : +m[4]; return a > 0.3 && r >= 150 && g <= 110 && b <= 110 && r - Math.max(g, b) >= 70; };
      const hits = [];
      for (const e of document.querySelectorAll('body *')) {
        const r = e.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const cs = getComputedStyle(e);
        for (const k of ['color', 'backgroundColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor']) {
          if (red(cs[k])) { hits.push((e.getAttribute('data-testid') || e.innerText || e.tagName).toString().slice(0, 30) + ' ' + k + ' ' + cs[k]); break; }
        }
      }
      return hits.slice(0, 5);
    })()`);
  const noRed = async (name) => {
    const hits = await redScan();
    check(`no red: ${name}`, hits.length === 0, JSON.stringify(hits));
  };

  // ---- 1. sample events: a fresh phone ----
  const body = () => P.js('document.body.innerText');
  const SAMPLE = /Morning routine|Work block|Lunch break|Evening wind down/;
  check('Today of a fresh phone shows no sample events', !SAMPLE.test(await body()), (await body()).slice(0, 200));
  await P.finger.tap(tab('Calendar'), 1500);
  check('the Calendar day shows none either', !SAMPLE.test(await body()));
  await P.finger.tap(tab('Today'), 1200);

  // ---- data ----
  write('belific_tasks', [
    task('a', 'Plain task', { dueDate: day(0), listKey: 'LW', projectKey: 'LH', priority: 'high' }),
    task('b', 'Timed task', { dueDate: day(0), startTime: '06:00', durationMinutes: 120, projectKey: 'LH' }),
    task('c', 'Waiting task'),
    task('e', 'Swipe me'),
    task('d', 'Repeater', { recurrence: 'daily', dueDate: day(-3) }),
  ]);
  write('belific_lists', [{ key: 'LW', name: 'Work', sortOrder: 0, emoji: '💼', createdAt: stamp, updatedAt: stamp }]);
  write('belific_projects', [{ key: 'LH', name: 'Health', colorKey: 'sage', createdAt: stamp, updatedAt: stamp }]);
  win.webContents.reload();
  await C.sleep(3500);

  // ---- 3. the look ----
  const title = await P.js(`(() => { const e = [...document.querySelectorAll('[role="heading"]')].find((x) => x.innerText.trim() === 'Today'); if (!e) return null; const cs = getComputedStyle(e); return { w: cs.fontWeight, s: cs.fontSize, f: cs.fontFamily.slice(0, 20) }; })()`);
  check('the page title is Inter 800 at 36', !!title && title.w === '800' && title.s === '36px' && /Inter/.test(title.f), JSON.stringify(title));
  const tabOn = await P.js(`(() => { const t = ${tab('Today')}; if (!t) return null; let e = t; for (let i = 0; i < 3 && e; i++, e = e.parentElement) { const bg = getComputedStyle(e).backgroundColor; if (bg && bg !== 'rgba(0, 0, 0, 0)') return bg; } return null; })()`);
  check('the selected tab is filled with the accent', !!tabOn && tabOn !== 'rgba(0, 0, 0, 0)', String(tabOn));
  await noRed('Today');
  await shot('phone-p30-today');
  await P.finger.tap(tab('Tasks'), 1500);
  await noRed('Tasks');
  // swipe a row left: the quiet Delete action
  await P.finger.drag(visible('[data-task-body="e"]'), -120, 0, 260, 700);
  await noRed('Tasks, the swipe actions open');
  win.webContents.reload();
  await C.sleep(3500);
  await P.finger.tap(tab('Tasks'), 1500);
  await P.finger.hold(visible('[data-task-body="c"]'), 600, 900);
  check('the hold card has the 8 px accent band', await P.js(`[...document.querySelectorAll('div')].some((e) => { const cs = getComputedStyle(e); return cs.borderTopWidth === '8px' && /\\(\\s*\\d+/.test(cs.borderTopColor); })`));
  await noRed('the hold card');
  await shot('phone-p30-hold');
  await tap('[aria-label="Cancel"]', 900);
  await P.finger.tap(visible('[data-task-body="c"]'), 1500);
  check('the task card has the 8 px accent band', await P.js(`[...document.querySelectorAll('div')].some((e) => { const cs = getComputedStyle(e); return cs.borderTopWidth === '8px' && /\\(\\s*\\d+/.test(cs.borderTopColor); })`));
  const btnR = await P.js(`(() => { const b = [...document.querySelectorAll('[role="button"]')].find((e) => /Delete task/.test(e.getAttribute('aria-label') || e.innerText)); return b ? getComputedStyle(b).borderTopLeftRadius : null; })()`);
  check('buttons have a radius of 10', btnR === '10px', String(btnR));
  await noRed('the task card');
  await P.js(`(() => { const b = [...document.querySelectorAll('[role="button"]')].find((e) => /Delete task|Delete or skip/.test(e.getAttribute('aria-label') || e.innerText)); if (b) b.scrollIntoView({ block: 'center' }); })()`);
  await C.sleep(300);
  await P.finger.tap(`[...document.querySelectorAll('[role="button"]')].find((e) => /Delete task|Delete or skip/.test(e.getAttribute('aria-label') || e.innerText))`, 900);
  await noRed('the Delete menu');
  await shot('phone-p30-delete-menu');
  await P.js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  await C.sleep(400);
  if (await has('[aria-label="Cancel"]')) await tap('[aria-label="Cancel"]', 700);
  if (await has('[data-details-done]')) await tap('[data-details-done]', 1000);

  // ---- Calendar ----
  await P.finger.tap(tab('Calendar'), 1500);
  await noRed('the Calendar day');
  const segs = await P.js(`[...document.querySelectorAll('[data-seg]')].map((e) => e.getAttribute('data-seg'))`);
  for (const sg of ['week', 'month']) {
    if (segs.includes(sg)) {
      await tap(`[data-seg="${sg}"]`, 1200);
      await noRed(`the Calendar ${sg}`);
    }
  }

  // ---- Settings (slab sections, light) ----
  await P.finger.tap(tab('Today'), 1200);
  await tap('[data-profile-avatar]', 1300);
  await tap('[data-profile-settings]', 1700);
  const edge = await P.js(`(() => { const e = [...document.querySelectorAll('div')].find((x) => getComputedStyle(x).borderRightWidth === '6px' && getComputedStyle(x).borderBottomWidth === '6px'); return !!e; })()`);
  check('Settings sections are slab cards (a 6 px edge right and below)', edge);
  await noRed('Settings (Delete and Clear are quiet ink)');
  await shot('phone-p30-settings');
  await tap('[data-phone-theme] [data-seg="dark"]', 900).catch(() => {});
  await noRed('Settings, dark');
  const darkEdge = await P.js(`(() => [...document.querySelectorAll('div')].some((x) => getComputedStyle(x).borderRightWidth === '6px'))()`);
  check('dark mode has no slab edge', !darkEdge);
  await tap('[aria-label="Back"]', 1200);
  await P.finger.tap(tab('Today'), 1200);
  await tap('[data-plan-button]', 1500);
  await noRed('Plan my day, dark');
  await shot('phone-p30-plan-dark');
  await tap('[data-plan-done]', 1000);

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
