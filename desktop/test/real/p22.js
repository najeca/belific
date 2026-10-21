'use strict';
// Real check for 2.39.0, the Ellie Planner restyle (tokens, light and dark): real input into the real app
// on an isolated data folder, Supabase is the in process fake (signed out). One pass in the default
// theme, one after choosing Dark in Settings, one for Match system. For each theme it saves screenshots
// of the Calendar Week, Tasks, the task details and Settings (BELIFIC_SHOTS: a folder), and checks the
// colours that are actually drawn, not only the setting.
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
  const today = day(0);
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      T('w1', 'Write the report', { dueDate: today, startTime: '09:00', durationMinutes: 60, projectKey: 'pw', listKey: 'le', priority: 'high' }),
      T('w2', 'Team sync', { dueDate: today, startTime: '11:00', durationMinutes: 45, projectKey: 'pb' }),
      T('w3', 'Gym session', { dueDate: today, startTime: '17:30', durationMinutes: 60, projectKey: 'pg', recurrence: 'daily' }),
      T('brk', 'Lunch break', { dueDate: today, startTime: '12:30', durationMinutes: 30, cutsBelow: true }),
      T('plain', 'Plain task', { dueDate: today, startTime: '14:00', durationMinutes: 30 }),
      T('t1', 'Buy stamps', { dueDate: today, durationMinutes: 15, projectKey: 'pw', subtasks: [{ id: 's1', title: 'First', done: true }, { id: 's2', title: 'Second', done: false }] }),
      T('t2', 'Call the bank', { dueDate: today, projectKey: 'pb' }),
      T('t3', 'Tidy the desk', { dueDate: day(1), durationMinutes: 30 }),
      T('t4', 'Done thing', { dueDate: today, completed: true, completedAt: stamp }),
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
  fs.writeFileSync(path.join(dataDir, 'belific_lists.kv'), JSON.stringify([{ key: 'le', name: 'Errands', emoji: '🛒', sortOrder: 0, createdAt: stamp, updatedAt: stamp }]));
  const read = readKv(dataDir);

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
  const rgb = (expr) => I.js(`getComputedStyle(${expr}).backgroundColor`);
  const pageBg = () => I.js(`getComputedStyle(document.body).backgroundColor`);
  const stored = () => (read('belific_desktop_settings') || {}).theme;
  const goSettings = async () => {
    const icon = (await I.exists(I.byLabel('Profile and account'))) ? 'Profile and account' : 'Profile, not signed in';
    await I.click(I.byLabel(icon));
    await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 700);
    await I.waitBody('POWER FEATURES', 8000);
  };
  const contrastIn = (expr) =>
    I.js(`(() => {
      const el = ${expr};
      if (!el) return null;
      const parse = (s) => (s.match(/[\\d.]+/g) || []).map(Number);
      const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
      let bgEl = el, bg = parse(getComputedStyle(bgEl).backgroundColor);
      while ((bg.length === 4 && bg[3] === 0) && bgEl.parentElement) { bgEl = bgEl.parentElement; bg = parse(getComputedStyle(bgEl).backgroundColor); }
      const texts = []; // emoji glyphs are colour pictures: their text colour is not drawn, so only letters and figures count
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      window.__why = [];
      for (let n = w.nextNode(); n; n = w.nextNode()) if (/[A-Za-z0-9]/.test(n.textContent)) { const c = parse(getComputedStyle(n.parentElement).color); texts.push(c); window.__why.push(n.textContent.trim().slice(0, 18) + '@' + c.join(',')); }
      const l1 = lum(bg);
      return texts.map((t) => { const l2 = lum(t); const [a, b] = l1 > l2 ? [l1, l2] : [l2, l1]; return Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100; });
    })()`);

  const pass = async (name, expectTheme, expectBg) => {
    check(`${name}: the page is drawn in the ${expectTheme} theme`, (await theme()) === expectTheme, String(await theme()));
    check(`${name}: the page colour is ${expectBg}`, (await pageBg()) === expectBg, String(await pageBg()));
    // Calendar Week (the screen the app opens on).
    await I.js(`(() => { const s = document.querySelector('[data-cal-scroller]'); if (s) s.scrollTop = 8 * 56 - 20; })()`);
    await C.sleep(400);
    check(`${name}: the app opens on the Calendar Week`, await I.exists(`document.querySelector('[data-cal-scroller]')`));
    await I.shot(`p22-${name}-1-calendar-week`);
    const blocks = ['w1', 'w2', 'w3', 'brk', 'plain'];
    for (const id of blocks) {
      const ratios = await contrastIn(`document.querySelector('[data-cal-block$=":${id}"]')`);
      check(`${name}: block ${id} text is readable on its own colour (every line at least 4.5:1)`, !!ratios && ratios.length > 0 && ratios.every((r) => r >= 4.5), JSON.stringify(ratios) + (await I.js('JSON.stringify(window.__why)')));
    }
    // Tasks.
    await I.click(I.byLabel('Show Tasks'), 1000);
    await I.shot(`p22-${name}-2-tasks`);
    const cardRatios = await contrastIn(`document.querySelector('[data-day-col="${today}"] [aria-label^="Task Write the report"]')`);
    check(`${name}: a labelled card's text is readable on its colour`, !!cardRatios && cardRatios.every((r) => r >= 4.5), JSON.stringify(cardRatios) + (await I.js('JSON.stringify(window.__why)')));
    // The task details.
    await I.click(`document.querySelector('[data-day-col="${today}"] [aria-label^="Task Write the report"]')`, 900);
    await C.waitFor(() => I.exists(`document.querySelector('[data-task-detail]') || document.querySelector('[role="dialog"]')`), 4000).catch(() => {});
    await I.shot(`p22-${name}-3-task-details`);
    await I.key('Escape');
    await C.sleep(500);
    // Settings.
    await goSettings();
    await I.shot(`p22-${name}-4-settings`);
  };

  // ======== 0. Fonts (step 2): Inter for the UI, Newsreader for the name and big titles, offline from the app files ========
  const fontOf = (expr) => I.js(`(() => { const e = ${expr}; return e ? getComputedStyle(e).fontFamily : null; })()`);
  const wordmark = `[...document.querySelectorAll('div,span')].find((e) => e.children.length === 0 && e.textContent === 'Belific' && getComputedStyle(e).fontFamily.startsWith('Newsreader'))`;
  check('fonts: the Belific name is set in Newsreader', await I.exists(wordmark), String(await fontOf(wordmark)));
  const loaded = await I.js(`Promise.all([document.fonts.load('700 18px Newsreader'), document.fonts.load('500 14px Inter')]).then(() => [document.fonts.check('700 18px Newsreader'), document.fonts.check('500 14px Inter'), [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family + f.weight).join(',')])`);
  check('fonts: Newsreader and Inter are loaded from the app files (the page allows only itself)', loaded[0] === true && loaded[1] === true, JSON.stringify(loaded));
  const body = await fontOf(`document.querySelector('[aria-label="Show Tasks"] div, [aria-label="Show Tasks"] span')`);
  check('fonts: the interface is Inter', /^Inter|Segoe UI|-apple-system/.test(String(body)), String(body));

  // ======== 1. The default: light ========
  await pass('light', 'light', 'rgb(250, 247, 240)');
  check('light: nothing is stored until the setting is changed (the default is light)', stored() === undefined || stored() === 'light');

  // ======== 2. Dark, chosen in Settings ========
  const toCalendar = async () => {
    await I.click(I.byLabel('Back'), 900);
    await I.click(I.byLabel('Show the Calendar'), 1200);
  };
  const choose = async (mode) => {
    await I.click(`document.querySelector('[data-theme-setting] [data-theme-mode="${mode}"]')`, 900);
  };
  check('Settings, Appearance offers Light, Dark and Match system, Light chosen', JSON.stringify(await I.js(`[...document.querySelectorAll('[data-theme-setting] [data-theme-mode]')].map((b) => b.getAttribute('data-theme-mode') + ':' + b.getAttribute('aria-checked'))`)) === JSON.stringify(['light:true', 'dark:false', 'system:false']));
  await choose('dark');
  check('dark: choosing Dark repaints at once', (await theme()) === 'dark' && (await pageBg()) === 'rgb(18, 18, 18)');
  await C.waitFor(async () => stored() === 'dark', 4000).catch(() => {});
  check('dark: the choice is saved on this computer (main process settings)', stored() === 'dark', String(stored()));
  check('dark: Dark is the chosen button', (await I.js(`document.querySelector('[data-theme-setting] [data-theme-mode="dark"]').getAttribute('aria-checked')`)) === 'true');
  await I.shot('p22-dark-0-settings-after-switch');
  await toCalendar();
  await pass('dark', 'dark', 'rgb(18, 18, 18)');
  // Vibrant task colours in dark keep their white text at 4.5:1 or more (the 6:1 rule is in vibrant.test.ts).
  await I.click(`document.querySelector('[data-vibrant-setting] [role="switch"]')`, 700);
  await toCalendar();
  const vib = await contrastIn(`document.querySelector('[data-cal-block$=":w2"]')`);
  check('dark: Vibrant task colours still gives white text at 4.5:1 or more', !!vib && vib.every((r) => r >= 4.5), JSON.stringify(vib));
  await I.shot('p22-dark-5-vibrant');
  await goSettings();
  await I.click(`document.querySelector('[data-vibrant-setting] [role="switch"]')`, 700);

  // ======== 3. Match system ========
  await choose('system');
  const sysDark = await I.js(`window.matchMedia('(prefers-color-scheme: dark)').matches`);
  check('system: Match system follows the computer (' + (sysDark ? 'dark' : 'light') + ' now)', (await theme()) === (sysDark ? 'dark' : 'light'));
  await C.waitFor(async () => stored() === 'system', 4000).catch(() => {});
  check('system: saved as system', stored() === 'system', String(stored()));
  await choose('light');
  check('light again: back to the default colours', (await theme()) === 'light' && (await pageBg()) === 'rgb(250, 247, 240)');

  summary();
  app.exit(0);
}
