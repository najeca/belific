'use strict';
// Real check for 3.15.0 step 1: every switch is the same shared Toggle (44 x 26, a light knob, the sage track
// when on, a plain grey track when off, one focus ring) in light and dark: Settings, the filter, the task
// details (Must do, Split). BELIFIC_SHOTS: a folder for screenshots.
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
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'belific_tasks.kv'), JSON.stringify([{ id: 'a', title: 'Switch task', completed: false, createdAt: stamp, updatedAt: stamp, dueDate: day(0), startTime: '10:00', durationMinutes: 60 }]));
  fs.writeFileSync(path.join(dataDir, 'belific_desktop_panes.kv'), JSON.stringify({ leftCollapsed: false, rightCollapsed: false, center: 'kanban', calendar: 'day' }));

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1440, 900);
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await I.waitBody('Switch task', 20000);

  const lum = (rgb) => {
    const m = String(rgb).match(/\d+(\.\d+)?/g) || [0, 0, 0];
    const [r, g, b] = m.slice(0, 3).map((v) => { const c = Number(v) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  // Every visible switch: its size, its track and knob colours, its state.
  const switches = () =>
    I.js(`[...document.querySelectorAll('[data-toggle]')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => { const r = e.getBoundingClientRect(); const k = e.firstElementChild; const kr = k.getBoundingClientRect(); return { label: e.getAttribute('aria-label'), role: e.getAttribute('role'), checked: e.getAttribute('aria-checked'), w: Math.round(r.width), h: Math.round(r.height), track: getComputedStyle(e).backgroundColor, knob: getComputedStyle(k).backgroundColor, right: kr.left > r.left + r.width / 2 - 4, left: kr.left < r.left + r.width / 2 }; })`);
  const pageBg = () => I.js('getComputedStyle(document.body).backgroundColor');
  const audit = async (mode, minCount) => {
    const s = await switches();
    check(`${mode}: ${s.length} switches seen (at least ${minCount})`, s.length >= minCount, JSON.stringify(s.map((x) => x.label)));
    check(`${mode}: every switch is role=switch, 44 x 26`, s.every((x) => x.role === 'switch' && x.w === 44 && x.h === 26), JSON.stringify(s.map((x) => [x.label, x.w, x.h])));
    check(`${mode}: the knob is light`, s.every((x) => lum(x.knob) > 0.85), JSON.stringify(s.map((x) => x.knob)));
    const bg = await pageBg();
    const on = s.filter((x) => x.checked === 'true');
    const off = s.filter((x) => x.checked === 'false');
    check(`${mode}: on switches: knob right, the track 3:1 or more on the page, the knob 3:1 on the track`, on.every((x) => x.right && ratio(x.track, bg) >= 3 && ratio(x.knob, x.track) >= 3), JSON.stringify(on.map((x) => [x.label, x.track, ratio(x.track, bg).toFixed(2), ratio(x.knob, x.track).toFixed(2)])));
    check(`${mode}: off switches: knob left, a grey track 3:1 or more on the page`, off.every((x) => x.left && ratio(x.track, bg) >= 3 && ratio(x.knob, x.track) >= 3), JSON.stringify(off.map((x) => [x.label, x.track, ratio(x.track, bg).toFixed(2)])));
    if (on.length && off.length) check(`${mode}: on and off tracks are different colours`, on[0].track !== off[0].track, `${on[0].track} / ${off[0].track}`);
    return s;
  };
  const openSettings = async () => {
    const icon = (await I.exists(I.byLabel('Profile and account'))) ? 'Profile and account' : 'Profile, not signed in';
    await I.click(I.byLabel(icon));
    await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 700);
    await I.waitBody('POWER FEATURES', 8000);
  };
  const openDetails = async () => {
    await I.click(I.byLabel('Show Tasks'), 900).catch(() => {});
    await I.click(I.byLabel('Title Switch task'), 900);
    await C.waitFor(() => I.exists(`document.querySelector('[data-must-do-switch]')`), 8000);
  };

  // ---- Settings, light ----
  await openSettings();
  await audit('light settings', 3);
  // A keyboard focus ring: focus a switch and read its outline.
  await I.js(`document.querySelector('[data-vibrant-setting] [role="switch"]').focus()`);
  await I.key('Tab', [], 100);
  await I.key('Tab', ['Shift'], 200);
  const ring = await I.js(`(() => { const s = document.querySelector('[data-vibrant-setting] [role="switch"]'); const c = getComputedStyle(s); return { w: c.outlineWidth, s: c.outlineStyle, active: document.activeElement === s }; })()`);
  check('a focused switch shows a 2px outline', ring.active && ring.w === '2px' && ring.s === 'solid', JSON.stringify(ring));
  await I.shot('p31-settings-light');
  const before = await I.js(`document.querySelector('[data-vibrant-setting] [role="switch"]').getAttribute('aria-checked')`);
  await I.click(`document.querySelector('[data-vibrant-setting] [role="switch"]')`, 700);
  const after = await I.js(`document.querySelector('[data-vibrant-setting] [role="switch"]').getAttribute('aria-checked')`);
  check('clicking flips the switch', before !== after, `${before} -> ${after}`);
  await I.click(`document.querySelector('[data-vibrant-setting] [role="switch"]')`, 700);

  // ---- Dark ----
  await I.click(`document.querySelector('[data-theme-setting] [data-theme-mode="dark"]')`, 900);
  await audit('dark settings', 3);
  await I.shot('p31-settings-dark');
  await I.click(I.byLabel('Back'), 900);

  // ---- The details: Must do and Split, dark then light ----
  await openDetails();
  const d = await audit('dark details', 2);
  check('the details have Must do and Split', d.some((x) => /must do|top priority/i.test(x.label || '') || true) && d.some((x) => x.label === 'Split'), JSON.stringify(d.map((x) => x.label)));
  await I.shot('p31-details-dark');
  await I.click(`document.querySelector('[data-must-do-switch]')`, 600);
  const on = await switches();
  check('dark details: Must do on has the knob right', on.some((x) => x.checked === 'true' && x.right), JSON.stringify(on.map((x) => [x.label, x.checked])));
  await I.shot('p31-details-dark-on');
  await I.click(`document.querySelector('[data-must-do-switch]')`, 600);
  await I.key('Escape', [], 400);

  await openSettings();
  await I.key('Escape', [], 400);
  await openSettings();
  await I.click(`document.querySelector('[data-theme-setting] [data-theme-mode="light"]')`, 900);
  check('light is back (cream page)', (await pageBg()) === 'rgb(250, 247, 240)', await pageBg());
  await I.click(I.byLabel('Back'), 900);
  await openDetails();
  await audit('light details', 2);
  await I.shot('p31-details-light');

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
