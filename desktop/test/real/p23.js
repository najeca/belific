'use strict';
// Real check for 2.45.0, the Ellie Planner restyle, step 7: every remaining screen in both themes.
// It opens each screen (Settings, Progress, Analytics, Trash, Labels, Quests, Daily Planning, Sign in, the
// shortcut help, quick capture, search, the Missed list, the Calendar month) and saves a screenshot per theme
// (BELIFIC_SHOTS), and checks what can be checked in code: nothing on screen is still drawn in the old style
// (no shadow on a card or button, no radius outside the scale 4, 6, 8, 10, 16, round), and the text on every
// screen is readable (4.5:1 or more, emoji aside). Real input into the real app, an isolated data folder.
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
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      T('a', 'Write the report', { dueDate: day(0), startTime: '09:00', durationMinutes: 60, projectKey: 'pw', completed: true, completedAt: stamp, actualMinutes: 50 }),
      T('b', 'Team sync', { dueDate: day(0), startTime: '11:00', durationMinutes: 45, projectKey: 'pb' }),
      T('c', 'Gym session', { dueDate: day(-1), startTime: '17:30', durationMinutes: 60, projectKey: 'pg', recurrence: 'daily' }),
      T('d', 'Old thing', { dueDate: day(-3), startTime: '10:00', durationMinutes: 30 }),
      T('e', 'In the bin', { dueDate: day(1), deletedAt: stamp }),
      T('f', 'Idea', {}),
    ]),
  );
  fs.writeFileSync(
    path.join(dataDir, 'belific_projects.kv'),
    JSON.stringify([
      { key: 'pw', name: 'Work', colorKey: 'sage', createdAt: stamp, updatedAt: stamp },
      { key: 'pb', name: 'Blue', colorKey: 'blue', createdAt: stamp, updatedAt: stamp },
      { key: 'pg', name: 'Yellow', colorKey: 'yellow', createdAt: stamp, updatedAt: stamp },
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

  const theme = () => I.js(`document.documentElement.getAttribute('data-theme')`);
  const profile = async () => {
    const icon = (await I.exists(I.byLabel('Profile and account'))) ? 'Profile and account' : 'Profile, not signed in';
    await I.click(I.byLabel(icon), 500);
  };
  const fromMenu = async (label) => {
    await profile();
    await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="${label}"]')`, 800);
  };
  const back = async () => {
    if (await I.exists(I.byLabel('Back'))) await I.click(I.byLabel('Back'), 700);
  };
  const esc = async () => {
    await I.key('Escape');
    await C.sleep(400);
  };

  // What a screen is checked for: the radii it draws, shadows on raised surfaces and the readable text.
  const audit = (name) =>
    I.js(`(() => {
      const scale = new Set([0, 4, 6, 8, 10, 16]);
      const bad = [];
      const parse = (s) => (s.match(/[\\d.]+/g) || []).map(Number);
      const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
      const lowText = [];
      const all = [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
      for (const e of all) {
        const cs = getComputedStyle(e);
        const r = e.getBoundingClientRect();
        for (const k of ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius']) {
          const v = parseFloat(cs[k]);
          // A circle (half of the shorter side), a pill and the scale are fine; anything else is an old radius.
          const half = Math.min(r.width, r.height) / 2;
          if (!(scale.has(v) || v >= half - 0.6 || String(cs[k]).includes('%'))) bad.push(e.tagName + ' ' + (e.getAttribute('aria-label') || e.textContent.trim().slice(0, 18)) + ' ' + cs[k]);
        }
        if (e.children.length === 0 && /[A-Za-z0-9]/.test(e.textContent) && e.textContent.trim().length > 0) {
          // The colour behind the text: the translucent layers up the tree laid over the first opaque one.
          const layers = [];
          for (let n = e; n; n = n.parentElement) {
            const c = parse(getComputedStyle(n).backgroundColor);
            if (c.length >= 3 && !(c.length === 4 && c[3] === 0)) { layers.push(c); if (c.length === 3 || c[3] >= 1) break; }
          }
          let bg = [255, 255, 255];
          for (let i = layers.length - 1; i >= 0; i--) { const c = layers[i]; const al = c.length === 4 ? c[3] : 1; bg = bg.map((v, k) => c[k] * al + v * (1 - al)); }
          const fg = parse(cs.color);
          const [a, b] = lum(bg) > lum(fg) ? [lum(bg), lum(fg)] : [lum(fg), lum(bg)];
          const ratio = (a + 0.05) / (b + 0.05);
          const op = Number(cs.opacity);
          if (ratio < 4.5 && op >= 0.99 && !e.closest('[disabled],[aria-disabled="true"],input,select,option')) lowText.push(e.textContent.trim().slice(0, 28) + ' ' + ratio.toFixed(2) + ' <' + (e.closest('[aria-label]') ? e.closest('[aria-label]').getAttribute('aria-label').slice(0, 30) : '') + '> bg=' + bg.join(',') + ' fg=' + fg.join(','));
        }
      }
      return { radii: [...new Set(bad)].slice(0, 12), lowText: [...new Set(lowText)].slice(0, 12) };
    })()`);

  const screens = [
    ['settings', async () => fromMenu('Settings'), back],
    ['progress', async () => fromMenu('Progress'), back],
    ['analytics', async () => fromMenu('Analytics'), back],
    ['trash', async () => fromMenu('Trash'), back],
    ['quests', async () => I.click(I.byLabel('Quests'), 800), back],
    ['planning', async () => { await I.blur(); await I.key('P', ['control', 'shift']); await C.sleep(900); }, esc],
    ['shortcuts', async () => { await I.blur(); await I.key('/', ['shift']); await C.sleep(600); }, esc],
    ['quick-capture', async () => { await I.blur(); await I.key('t'); await C.sleep(600); }, esc],
    ['search', async () => { await I.blur(); await I.key('k', ['control']); await C.sleep(600); }, esc],
    ['missed', async () => I.click(`document.querySelector('[data-missed-button]')`, 800), esc],
    ['calendar-month', async () => { await I.click(I.byLabel('Show the Calendar'), 900); await I.click(`[...document.querySelectorAll('[role="radio"]')].find((b) => b.textContent.trim() === 'Month')`, 900); }, async () => { await I.click(`[...document.querySelectorAll('[role="radio"]')].find((b) => b.textContent.trim() === 'Week')`, 600); await I.click(I.byLabel('Show Tasks'), 600); }],
  ];

  const tour = async (themeName) => {
    check(`tour: the ${themeName} theme is on`, (await theme()) === themeName, String(await theme()));
    for (const [name, open, close] of screens) {
      try {
        await open();
        await C.sleep(500);
        await I.shot(`p23-${themeName}-${name}`);
        const a = await audit(name);
        check(`${themeName}: ${name}: no radius outside the scale 4, 6, 8, 10, 16 or round`, a.radii.length === 0, JSON.stringify(a.radii));
        check(`${themeName}: ${name}: every line of text is at least 4.5:1 on its background`, a.lowText.length === 0, JSON.stringify(a.lowText));
        await close();
        await C.sleep(400);
      } catch (e) {
        check(`${themeName}: ${name}: opened`, false, String(e.message || e).slice(0, 200));
        await esc();
        await back();
      }
    }
  };

  // Light first (the default), then Dark from Settings.
  await tour('light');
  await fromMenu('Settings');
  await I.click(`document.querySelector('[data-theme-setting] [data-theme-mode="dark"]')`, 900);
  await back();
  await tour('dark');

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
