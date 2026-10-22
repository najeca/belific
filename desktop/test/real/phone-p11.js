'use strict';
// Real touch check for PLAN_phone P11 (2.59.0): every phone screen in Light and in Dark at 390 x 844.
// The Theme setting (Settings, On this iPhone: Light, Dark, Match system) switches the whole app at
// once; each screen is audited like the desktop's p23: no corner radius outside the scale (4, 6, 8, 10,
// 16, round) and every line of text at least 4.5:1 on its real background. Screenshots per screen.
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
    T('a', 'Standup', { startTime: '09:00', durationMinutes: 30, projectKey: 'w', listKey: 'L1', notes: 'Bring the numbers', subtasks: [{ id: 's1', title: 'Check the board', done: false }, { id: 's2', title: 'Share', done: true }] }),
    T('b', 'Pay rent', { priority: 'high' }),
    T('c', 'Done already', { completed: true, completedAt: new Date().toISOString() }),
    T('d', 'A thought', { dueDate: undefined }),
    T('e', 'Long session', { startTime: '10:00', durationMinutes: 180 }),
    T('f', 'Short break', { startTime: '11:00', durationMinutes: 20, cutsBelow: true }),
    T('g', 'Stretch', { dueDate: day(-3), recurrence: 'daily' }),
  ]);
  write('belific_projects', [{ key: 'w', name: 'Work', colorKey: 'sage', createdAt: stamp, updatedAt: stamp }]);
  write('belific_lists', [{ key: 'L1', name: 'Office', emoji: '🏢', sortOrder: 0, createdAt: stamp, updatedAt: stamp }]);
  write('belific_custom_events', [{ id: 'ev1', title: 'Gym class', category: 'health', icon: '🏋️', start: '13:00', end: '14:00', notes: '', date: today, createdAt: stamp, updatedAt: stamp }]);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.show();
  await C.sleep(2500);
  const P = await phoneWindow(win);
  const shotsDir = process.env.BELIFIC_SHOTS;
  const shot = async (name) => {
    if (!shotsDir) return;
    fs.mkdirSync(shotsDir, { recursive: true });
    fs.writeFileSync(path.join(shotsDir, `${name}.png`), (await win.webContents.capturePage()).toPNG());
  };
  const tabEls = `[...document.querySelectorAll('a, [role="tab"], [role="button"], [role="link"]')].filter((e) => { const r = e.getBoundingClientRect(); return r.top > 760 && r.height > 20 && r.width > 40 && r.width < 200; })`;
  const tab = (name) => `${tabEls}.find((e) => e.textContent.replace(/[^ -~]/g, '').trim() === '${name}')`;
  const visible = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].reverse().find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left >= -1 && r.left < innerWidth && r.top < innerHeight && r.bottom > 0; })`;

  // The desktop p23 audit: radii on the scale, text 4.5:1 on its real background (translucent layers included).
  const audit = () =>
    P.js(`(() => {
      const scale = new Set([0, 4, 6, 8, 10, 16]);
      const bad = [];
      const parse = (s) => (s.match(/[\\d.]+/g) || []).map(Number);
      const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
      const lowText = [];
      const all = [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; });
      for (const e of all) {
        const cs = getComputedStyle(e);
        const r = e.getBoundingClientRect();
        for (const k of ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius']) {
          const v = parseFloat(cs[k]);
          const half = Math.min(r.width, r.height) / 2;
          if (!(scale.has(v) || v >= half - 0.6 || String(cs[k]).includes('%'))) bad.push(e.tagName + ' ' + (e.getAttribute('aria-label') || e.textContent.trim().slice(0, 18)) + ' ' + cs[k]);
        }
        if (e.children.length === 0 && /[A-Za-z0-9]/.test(e.textContent) && e.textContent.trim().length > 0) {
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
          let op = 1;
          for (let n = e; n; n = n.parentElement) op *= Number(getComputedStyle(n).opacity);
          if (ratio < 4.5 && op >= 0.99 && !e.closest('[disabled],[aria-disabled="true"],input,select,option,textarea')) lowText.push(e.textContent.trim().slice(0, 28) + ' ' + ratio.toFixed(2) + ' <' + (e.closest('[aria-label]') ? e.closest('[aria-label]').getAttribute('aria-label').slice(0, 30) : '') + '> bg=' + bg.map(Math.round).join(',') + ' fg=' + fg.join(','));
        }
      }
      return { radii: [...new Set(bad)].slice(0, 12), lowText: [...new Set(lowText)].slice(0, 12) };
    })()`);

  const done = () => P.finger.tap(visible('[aria-label="Done"]'), 800).catch(() => {});
  const cancel = () => P.finger.tap(visible('[aria-label="Cancel"]'), 800).catch(() => {});
  const screens = [
    ['today', async () => P.finger.tap(tab('Today'), 1000), async () => {}],
    ['today-open', async () => P.finger.tap(`[...document.querySelectorAll('[data-today-row="Standup"] [data-today-body]')][0]`, 800), async () => P.finger.tap(`[...document.querySelectorAll('[data-today-row="Standup"] [data-today-body]')][0]`, 600)],
    ['today-menu', async () => P.finger.hold(`[...document.querySelectorAll('[data-today-row="Pay rent"] [data-today-body]')][0]`, 480, 800), cancel],
    ['quick-add', async () => P.finger.tap(visible('[data-add-button]'), 900), async () => P.finger.tap(visible('[aria-label="Cancel adding"]'), 700)],
    ['tasks', async () => P.finger.tap(tab('Tasks'), 1000), async () => {}],
    ['details', async () => P.finger.tap(`[...document.querySelectorAll('[data-task-row="A thought"] [data-task-body]')][0]`, 1200), done],
    ['list-edit', async () => P.finger.hold(visible('[data-list-chip="L1"]'), 480, 900), async () => P.finger.tap(visible('[aria-label="Cancel list edit"]'), 700)],
    ['repeating', async () => P.finger.tap(visible('[data-list-chip="__repeating__"]'), 900), async () => P.finger.tap(visible('[data-list-chip="dump"]'), 700)],
    ['calendar-day', async () => P.finger.tap(tab('Calendar'), 1200), async () => {}],
    ['calendar-week', async () => P.finger.tap(visible('[data-seg="week"]'), 900), async () => {}],
    ['calendar-month', async () => P.finger.tap(visible('[data-seg="month"]'), 900), async () => P.finger.tap(visible('[data-seg="day"]'), 700)],
    ['settings', async () => P.finger.tap(visible('[data-profile-avatar]'), 1200), async () => P.finger.tap(visible('[aria-label="Back"]'), 900)],
  ];

  const tour = async (themeName) => {
    for (const [name, open, close] of screens) {
      try {
        await open();
        await C.sleep(300);
        await shot(`phone-p11-${themeName}-${name}`);
        const a = await audit();
        check(`${themeName}: ${name}: radii on the scale (4, 6, 8, 10, 16 or round)`, a.radii.length === 0, JSON.stringify(a.radii));
        check(`${themeName}: ${name}: every line of text at least 4.5:1`, a.lowText.length === 0, JSON.stringify(a.lowText));
        await close();
      } catch (e) {
        check(`${themeName}: ${name}: opened`, false, String(e.message || e).slice(0, 300));
      }
    }
  };

  const bodyBg = () => P.js(`getComputedStyle([...document.querySelectorAll('[data-profile-avatar]')].pop().closest('[style]').parentElement).backgroundColor`).catch(() => '');
  await tour('light');

  // The Theme setting.
  await P.finger.tap(tab('Today'), 900);
  await P.finger.tap(visible('[data-profile-avatar]'), 1200);
  check('Settings has the Theme setting: Light, Dark, Match system', JSON.stringify(await P.js(`[...document.querySelectorAll('[data-phone-theme] [role="tab"]')].map((e) => e.textContent.trim())`)) === JSON.stringify(['Light', 'Dark', 'Match system']));
  await P.finger.tap(visible('[data-phone-theme] [data-seg="dark"]'), 900);
  check('Dark is stored on this phone only', /dark/.test(fs.readFileSync(path.join(dataDir, 'belific_phone_theme_mode.kv'), 'utf8')));
  const darkBg = await P.js(`getComputedStyle(document.querySelector('[data-phone-theme]').closest('[data-phone-theme]').parentElement).backgroundColor`);
  check('the screen turns dark at once', /\(\s*40, 40, 40|\(\s*18, 18, 18|\(\s*26, 26, 26/.test(darkBg), darkBg);
  await P.finger.tap(visible('[aria-label="Back"]'), 900);
  await tour('dark');
  void bodyBg;

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
