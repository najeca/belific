'use strict';
// Real check for 3.19.0 (step 8): a person with settings saved BEFORE the change keeps them. Here the saved file has
// no vibrant key (it was written when Vibrant was off by default) and Theme Dark: after the update Vibrant is still
// off, Theme still Dark, Match system untouched. (The unit tests cover the other saved shapes.)
// BELIFIC_SHOTS: a folder for screenshots.
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
  const before = { dailyTime: '08:30', theme: 'dark', showStreaks: false };
  fs.writeFileSync(settingsPath, JSON.stringify(before));
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

  check('the page is dark, as saved', (await I.js('document.documentElement.getAttribute("data-theme")')) === 'dark');
  const tb = await I.js(`(() => { const b = document.querySelector('[data-block-id="boot"]'); if (!b) return null; const els = [...b.querySelectorAll('div[dir="auto"]')].filter((e) => e.children.length === 0 && e.innerText.trim()); return { colors: els.map((e) => getComputedStyle(e).color), fw: els.map((e) => getComputedStyle(e).fontWeight) }; })()`);
  check('Vibrant stayed off: the Timebox card is not bold white', !!tb && !(tb.colors.every((c) => c === 'rgb(255, 255, 255)') && Number(tb.fw[0]) >= 700), JSON.stringify(tb));
  const icon = (await I.exists(I.byLabel('Profile and account'))) ? 'Profile and account' : 'Profile, not signed in';
  await I.click(I.byLabel(icon));
  await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 700);
  await I.waitBody('POWER FEATURES', 8000);
  const sw = await I.js(`(() => { const s = document.querySelector('[data-vibrant-setting] [role="switch"]'); return s ? s.getAttribute('aria-checked') : null; })()`);
  check('Settings reads Vibrant task colours OFF', sw === 'false', String(sw));
  const theme = await I.js(`[...document.querySelectorAll('[data-theme-setting] [data-theme-mode]')].map((b) => [b.getAttribute('data-theme-mode'), b.getAttribute('aria-checked')])`);
  check('Theme: Dark is still chosen', JSON.stringify(theme) === JSON.stringify([['light', 'false'], ['dark', 'true'], ['system', 'false']]), JSON.stringify(theme));
  await I.shot('p39-existing-user-settings');
  // The file is not rewritten by opening the app and the settings (nothing was changed).
  check('the saved file was not touched', JSON.stringify(JSON.parse(fs.readFileSync(settingsPath, 'utf8'))) === JSON.stringify(before), fs.readFileSync(settingsPath, 'utf8'));

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
