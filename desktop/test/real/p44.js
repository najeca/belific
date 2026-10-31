'use strict';
// Real check for 3.23.2: with "Vibrant task colours" on, a grey label (Work) is not the same blue as Study. Real
// blocks on the Timebox, their computed colours read back, light and dark. BELIFIC_SHOTS: screenshots.
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

const rgb = (s) => s.match(/\d+/g).slice(0, 3).map(Number);
const sat = (s) => {
  const [r, g, b] = rgb(s).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === min ? 0 : (max - min) / (1 - Math.abs(max + min - 1));
};
const dist = (a, b) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));

async function run() {
  const { check, summary } = C.makeChecker();
  app.whenReady().then(() => {
    const fake = C.installFakeSupabase();
    fake.store = { tables: {} };
  });
  const day = dayKeyFrom(new Date());
  const D = day(1);
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  const w = (k, v) => fs.writeFileSync(path.join(dataDir, `${k}.kv`), JSON.stringify(v));
  w('belific_projects', [
    { key: 'work', name: 'Work', colorKey: 'slate', createdAt: stamp, updatedAt: stamp },
    { key: 'study', name: 'Study', colorKey: 'sky', createdAt: stamp, updatedAt: stamp },
    { key: 'errands', name: 'Errands', colorKey: 'stone', createdAt: stamp, updatedAt: stamp },
    { key: 'gym', name: 'Gym', colorKey: 'charcoal', createdAt: stamp, updatedAt: stamp },
    { key: 'blue', name: 'Blue', colorKey: 'blue', createdAt: stamp, updatedAt: stamp },
  ]);
  w('belific_tasks', [
    T('t1', 'Work block', { dueDate: D, startTime: '08:00', durationMinutes: 60, projectKey: 'work' }),
    T('t2', 'Study block', { dueDate: D, startTime: '09:30', durationMinutes: 60, projectKey: 'study' }),
    T('t3', 'Errands block', { dueDate: D, startTime: '11:00', durationMinutes: 60, projectKey: 'errands' }),
    T('t4', 'Gym block', { dueDate: D, startTime: '12:30', durationMinutes: 60, projectKey: 'gym' }),
    T('t5', 'Blue block', { dueDate: D, startTime: '14:00', durationMinutes: 60, projectKey: 'blue' }),
  ]);
  w('belific_desktop_settings', { vibrantColours: true });

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1440, 900);
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await C.sleep(3500);
  await I.click(`document.querySelector('[aria-label="Show Tasks"]')`, 900).catch(() => {});
  await I.click(`document.querySelector('[aria-label="Next day"]')`, 800).catch(() => {});
  const scrollBox = (hour) => I.js(`(() => { const g = document.querySelector('[data-timebox-grid]'); let p = g; while (p && p.scrollHeight <= p.clientHeight + 2) p = p.parentElement; if (p) p.scrollTop = ${hour} * 56 - 20; })()`);
  const bg = (id) => I.js(`(() => { const e = document.querySelector('[data-block-id="${id}"]'); return e ? getComputedStyle(e).backgroundColor : null; })()`);

  async function pass(mode) {
    await scrollBox(7);
    await C.sleep(500);
    const colours = {};
    for (const id of ['t1', 't2', 't3', 't4', 't5']) colours[id] = await bg(id);
    check(`${mode}: all five blocks are drawn in vibrant colours`, Object.values(colours).every((c) => c && c !== 'rgba(0, 0, 0, 0)'), JSON.stringify(colours));
    check(`${mode}: the grey Work is not the blue of Study or Blue (far apart)`, dist(colours.t1, colours.t2) > 60 && dist(colours.t1, colours.t5) > 60, JSON.stringify([colours.t1, colours.t2, colours.t5]));
    check(`${mode}: Work, Errands and Gym stay quiet greys (low saturation)`, [colours.t1, colours.t3, colours.t4].every((c) => sat(c) < 0.36), JSON.stringify([colours.t1, colours.t3, colours.t4].map(sat)));
    const ids = Object.keys(colours);
    let worst = 999;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) worst = Math.min(worst, dist(colours[ids[i]], colours[ids[j]]));
    check(`${mode}: no two of the five labels share a colour (closest pair ${Math.round(worst)} apart)`, worst > 25, String(worst));
    await I.shot(`p44-vibrant-${mode}`);
  }

  await pass('light');
  const icon = (await I.exists(I.byLabel('Profile and account'))) ? 'Profile and account' : 'Profile, not signed in';
  await I.click(I.byLabel(icon));
  await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 700);
  await I.waitBody('POWER FEATURES', 8000);
  await I.click(`document.querySelector('[data-theme-setting] [data-theme-mode="dark"]')`, 900);
  await I.click(I.byLabel('Back'), 900);
  await I.click(`document.querySelector('[aria-label="Show Tasks"]')`, 800).catch(() => {});
  await C.sleep(600);
  await pass('dark');

  app.exit(summary() === 0 ? 0 : 1);
}
