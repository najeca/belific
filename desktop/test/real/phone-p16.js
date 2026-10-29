'use strict';
// Real touch check for the 3.15.0 batch on the phone, 390 x 844. Sections are added step by step.
//  Step 1 (3.15.0): the shared switch (44 x 26, light knob, clear on and off tracks, light and dark) on the
//          phone's Settings and the task sheet's Top priority.
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
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  const write = (k, v) => fs.writeFileSync(path.join(dataDir, `${k}.kv`), JSON.stringify(v));
  write('belific_tasks', [T('sw', 'Switch thing', { dueDate: today, startTime: '10:00', durationMinutes: 60 })]);
  write('belific_lists', []);

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
  const tabEls = `[...document.querySelectorAll('a, [role="tab"], [role="button"], [role="link"]')].filter((e) => { const r = e.getBoundingClientRect(); return r.top > 760 && r.height > 20 && r.width > 20; })`;
  const tab = (name) => `${tabEls}.find((e) => e.textContent.replace(/[^ -~]/g, '').trim() === '${name}')`;
  const visible = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left >= -1 && r.left < innerWidth; })`;
  const lum = (rgb) => {
    const m = String(rgb).match(/\d+(\.\d+)?/g) || [0, 0, 0];
    const [r, g, b] = m.slice(0, 3).map((v) => { const c = Number(v) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const switches = () =>
    P.js(`[...document.querySelectorAll('[data-toggle]')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => { const r = e.getBoundingClientRect(); const k = e.firstElementChild; return { label: e.getAttribute('aria-label'), checked: e.getAttribute('aria-checked'), w: Math.round(r.width), h: Math.round(r.height), track: getComputedStyle(e).backgroundColor, knob: getComputedStyle(k).backgroundColor, bg: getComputedStyle(document.body).backgroundColor }; })`);
  const audit = async (name, min) => {
    const s = await switches();
    check(`${name}: ${s.length} switches (at least ${min})`, s.length >= min, JSON.stringify(s.map((x) => x.label)));
    check(`${name}: each is 44 x 26 with a light knob`, s.every((x) => x.w === 44 && x.h === 26 && lum(x.knob) > 0.85), JSON.stringify(s.map((x) => [x.label, x.w, x.h, x.knob])));
    check(`${name}: tracks are 3:1 or more on the page, on unlike off`, s.every((x) => ratio(x.track, x.bg) >= 3) && (new Set(s.map((x) => x.checked)).size < 2 || new Set(s.map((x) => `${x.checked}${x.track}`)).size >= 2), JSON.stringify(s.map((x) => [x.label, x.checked, x.track])));
    return s;
  };

  // ======== Step 1: switches ========
  await P.finger.tap(visible('[data-profile-avatar]'), 1200);
  await audit('light settings', 3);
  await shot('phone-p16-switches-settings-light');
  await P.finger.tap(visible('[data-phone-theme] [data-seg="dark"]'), 900);
  await audit('dark settings', 3);
  await shot('phone-p16-switches-settings-dark');
  const before = await P.js(`document.querySelector('[data-phone-streaks] [data-toggle]').getAttribute('aria-checked')`);
  await P.finger.tap(visible('[data-phone-streaks] [data-toggle]'), 500);
  const after = await P.js(`document.querySelector('[data-phone-streaks] [data-toggle]').getAttribute('aria-checked')`);
  check('a tap flips the switch', before !== after, `${before} -> ${after}`);
  await P.finger.tap(visible('[data-phone-streaks] [data-toggle]'), 500);
  await P.finger.tap(visible('[aria-label="Back"]'), 900);
  await C.sleep(600);
  await P.finger.tap(`[...document.querySelectorAll('div, span')].find((e) => e.children.length === 0 && e.textContent.trim() === 'Switch thing')`, 900);
  await P.finger.tap(visible('[aria-label="Edit Switch thing"]'), 1400);
  await audit('dark task sheet', 1);
  check('the task sheet has Top priority', (await switches()).some((x) => x.label === 'Top priority'));
  await shot('phone-p16-switches-sheet-dark');
  await P.finger.tap(visible('[data-toggle][aria-label="Top priority"]'), 600);
  await shot('phone-p16-switches-sheet-dark-on');
  check('Top priority on: the switch reads on', (await switches()).some((x) => x.label === 'Top priority' && x.checked === 'true'));

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
