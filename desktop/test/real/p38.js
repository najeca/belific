'use strict';
// Real check for 3.19.0 (step 8): the defaults for a NEW user (no settings ever saved): Vibrant task colours ON and
// Theme Light (not Match system). Nothing is stored until something is changed; changing another setting keeps
// them. Existing saved settings are not changed (see p39). BELIFIC_SHOTS: a folder for screenshots.
const fs = require('node:fs');
const path = require('node:path');
process.env.BELIFIC_TEST_NEW_USER = '1';
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
  const settingsPath = path.join(dataDir, 'belific_desktop_settings.kv');
  check('a new user: no settings file exists at the start', !fs.existsSync(settingsPath));
  fs.writeFileSync(path.join(dataDir, 'belific_tasks.kv'), JSON.stringify([{ id: 'boot', title: 'Blue session', completed: false, createdAt: stamp, updatedAt: stamp, dueDate: day(0), startTime: '09:30', durationMinutes: 120, projectKey: 'pb' }]));
  fs.writeFileSync(path.join(dataDir, 'belific_projects.kv'), JSON.stringify([{ key: 'pb', name: 'Blue', colorKey: 'sky', createdAt: stamp, updatedAt: stamp }]));
  fs.writeFileSync(path.join(dataDir, 'belific_desktop_panes.kv'), JSON.stringify({ leftCollapsed: false, rightCollapsed: false, center: 'kanban', calendar: 'day' }));

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1440, 900);
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await I.waitBody('Blue session', 20000);
  await I.click(I.byLabel('Show Tasks'), 800).catch(() => {});
  await C.sleep(1200);

  const settingsFile = () => {
    try {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch {
      return null;
    }
  };
  const blockText = (sel) =>
    I.js(`(() => { const b = document.querySelector('${sel}'); if (!b) return null; const els = [...b.querySelectorAll('div[dir="auto"]')].filter((e) => e.children.length === 0 && e.innerText.trim()); return { bg: getComputedStyle(b).backgroundColor, colors: els.map((e) => getComputedStyle(e).color), fw: els.map((e) => getComputedStyle(e).fontWeight) }; })()`);
  const goSettings = async () => {
    const icon = (await I.exists(I.byLabel('Profile and account'))) ? 'Profile and account' : 'Profile, not signed in';
    await I.click(I.byLabel(icon));
    await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 700);
    await I.waitBody('POWER FEATURES', 8000);
  };

  // ---- Vibrant: ON on the first run ----
  const tb = await blockText('[data-block-id="boot"]');
  check('Vibrant is on from the start: the Timebox card has bold white text', !!tb && tb.colors.length > 0 && tb.colors.every((c) => c === 'rgb(255, 255, 255)') && Number(tb.fw[0]) >= 700, JSON.stringify(tb));
  await I.shot('p38-new-user-timebox');
  await I.click(I.byLabel('Show the Calendar'), 900);
  const cb = await blockText('[data-cal-block$="boot"]');
  check('and so does the Calendar block', !!cb && cb.colors.length > 0 && cb.colors.every((c) => c === 'rgb(255, 255, 255)'), JSON.stringify(cb));
  await I.shot('p38-new-user-calendar');
  check('still nothing stored (a default is not a saved setting)', settingsFile() === null);

  // ---- Settings: Theme is Light, Vibrant is on ----
  await goSettings();
  const theme = await I.js(`[...document.querySelectorAll('[data-theme-setting] [data-theme-mode]')].map((b) => [b.getAttribute('data-theme-mode'), b.getAttribute('aria-checked')])`);
  check('Theme: Light is chosen (not Match system)', JSON.stringify(theme) === JSON.stringify([['light', 'true'], ['dark', 'false'], ['system', 'false']]), JSON.stringify(theme));
  check('the page is light (cream)', (await I.js('getComputedStyle(document.body).backgroundColor')) === 'rgb(250, 247, 240)' && (await I.js('document.documentElement.getAttribute("data-theme")')) === 'light');
  const sw = await I.js(`(() => { const s = document.querySelector('[data-vibrant-setting] [role="switch"]'); return s ? s.getAttribute('aria-checked') : null; })()`);
  check('Vibrant task colours reads ON in Settings', sw === 'true', String(sw));
  await I.shot('p38-new-user-settings');

  // ---- Changing something else keeps the new defaults, and now they are saved ----
  await I.click(`document.querySelector('[data-theme-setting] [data-theme-mode="dark"]')`, 900);
  await C.waitFor(async () => (settingsFile() || {}).theme === 'dark', 4000).catch(() => {});
  check('after a change the whole settings are saved, Vibrant still on', !!settingsFile() && settingsFile().theme === 'dark' && settingsFile().vibrantColours === true, JSON.stringify(settingsFile()));
  await I.click(`document.querySelector('[data-theme-setting] [data-theme-mode="light"]')`, 900);
  await I.shot('p38-after-change');

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
