'use strict';
// Screenshots for the Mini Motorways restyle (docs/design/motorways/BUILD_PROMPT.md), the same set before and after
// each phase so they can be compared pixel for pixel. Not a check: it only records. The page clock is fixed (Monday
// 9 Nov 2026, 10:20 local, then running), so the now line, "Today" and the seeded days are the same on every run.
//   MW_THEME=light|dark  MW_PHONE=1 (390 x 844)  BELIFIC_SHOTS=<folder>
// Desktop: week board, Day view with a break and its chips, task details, Settings, a popover (Filter).
// Phone: Today, Calendar, Tasks, details.
// Real app, isolated data folder, in process fake Supabase.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const C = require('./common');
const { makeInput } = require('./input');
const { phoneWindow } = require('./phone-common');

process.env.BELIFIC_NO_PROTOCOL_REGISTER = '1';
const userData = C.isolate();
console.log(`USERDATA ${userData}`);

const THEME = process.env.MW_THEME === 'dark' ? 'dark' : 'light';
const PHONE = process.env.MW_PHONE === '1';
const OUT = process.env.BELIFIC_SHOTS || '';
// Monday 9 Nov 2026, 10:20 local.
const FIXED = new Date(2026, 10, 9, 10, 20, 0).getTime();

run().catch((err) => {
  console.log(`FAIL harness error: ${err.stack || err}`);
  app.exit(1);
});

// The page's clock starts at FIXED and runs from there (timers keep working).
const CLOCK = `(() => {
  const base = ${FIXED}; const real = Date.now.bind(Date); const t0 = real(); const R = Date;
  const now = () => base + (real() - t0);
  function D(...a) { return a.length ? new R(...a) : new R(now()); }
  D.prototype = R.prototype; D.now = now; D.parse = R.parse; D.UTC = R.UTC;
  Object.setPrototypeOf(D, R);
  globalThis.Date = D;
})();`;

async function run() {
  app.whenReady().then(() => {
    const fake = C.installFakeSupabase();
    fake.store = { tables: {} };
  });
  const pad = (n) => String(n).padStart(2, '0');
  const dk = (shift) => {
    const d = new Date(2026, 10, 9 + shift);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const today = dk(0);
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  const write = (k, v) => fs.writeFileSync(path.join(dataDir, `${k}.kv`), JSON.stringify(v));
  write('belific_tasks', [
    // Brain Dump (no day).
    T('b1', 'Book dentist'),
    T('b2', 'Cancel old gym trial'),
    T('b3', 'Clean room'),
    T('b4', 'Cook rice', { projectKey: 'home' }),
    // Today.
    T('plan', 'Plan the week', { dueDate: today, durationMinutes: 30, completed: true, completedAt: stamp }),
    T('report', 'Write report', { dueDate: today, startTime: '09:00', durationMinutes: 90, projectKey: 'work', priority: 'high', notes: 'Section two first.', steps: [{ id: 's1', title: 'Outline', done: true }, { id: 's2', title: 'Draft', done: false }] }),
    T('lunch', 'Lunch', { dueDate: today, startTime: '12:00', durationMinutes: 60, cutsBelow: true, projectKey: 'food' }),
    T('sam', 'Reply to Sam', { dueDate: today, startTime: '12:00', durationMinutes: 10 }),
    T('water', 'Water plants', { dueDate: today, startTime: '12:15', durationMinutes: 5, projectKey: 'home' }),
    T('bills', 'Pay the bills', { dueDate: today, startTime: '12:25', durationMinutes: 15 }),
    T('gym', 'Gym, push day', { dueDate: today, startTime: '17:00', durationMinutes: 60, projectKey: 'health' }),
    // Later this week.
    T('jobs', 'Apply to two jobs', { dueDate: dk(1), durationMinutes: 60, projectKey: 'work' }),
    T('laundry', 'Laundry', { dueDate: dk(1), startTime: '18:00', durationMinutes: 20, projectKey: 'home' }),
    T('run', 'Morning run', { dueDate: dk(3), startTime: '07:00', durationMinutes: 30, recurrence: 'weekly', recurrenceDays: ['Thu'] }),
  ]);
  write('belific_projects', [
    { key: 'work', name: 'Work', colorKey: 'sage', createdAt: stamp, updatedAt: stamp },
    { key: 'home', name: 'Home', colorKey: 'sky', createdAt: stamp, updatedAt: stamp },
    { key: 'food', name: 'Food', colorKey: 'clay', createdAt: stamp, updatedAt: stamp },
    { key: 'health', name: 'Health', colorKey: 'rose', createdAt: stamp, updatedAt: stamp },
  ]);
  write('belific_desktop_settings', { vibrantColours: false, theme: THEME });
  // kv keeps a plain string as it is (no JSON quotes).
  if (PHONE) fs.writeFileSync(path.join(dataDir, 'belific_phone_theme_mode.kv'), THEME);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  const dbg = win.webContents.debugger;
  if (!dbg.isAttached()) dbg.attach('1.3');
  await dbg.sendCommand('Page.enable');
  await dbg.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: CLOCK });
  win.setSize(1440, 900);
  win.show();
  win.focus();
  win.webContents.reload();
  await C.sleep(3500);
  const I = makeInput(win, OUT);
  // A covered window drops the mouse (cp8h): raised and waited for until the page is visible.
  win.setAlwaysOnTop(true);
  win.moveTop();
  win.focus();
  await C.waitFor(() => I.js('document.visibilityState === "visible"'), 10000).catch(() => console.log('INFO the page stayed hidden'));
  const tag = (name) => `${PHONE ? 'phone' : 'desktop'}-${name}-${THEME}`;
  // Nothing hovered, no caret blinking into a shot.
  const settle = async (ms = 700) => {
    win.webContents.sendInputEvent({ type: 'mouseMove', x: 2, y: 2 });
    await C.sleep(ms);
  };
  const shot = async (name) => {
    await settle();
    await I.shot(tag(name));
    console.log(`SHOT ${tag(name)}`);
  };
  const clock = await I.js('new Date().toString()');
  console.log(`CLOCK ${clock}`);

  if (!PHONE) {
    await I.waitBody('Write report', 15000);
    // The Tasks board with the Timebox shown (a new data folder opens on the Calendar, Timebox folded).
    const board = I.visible(`[data-day-col="${today}"]`);
    for (let i = 0; i < 5 && !(await I.exists(board)); i++) {
      await I.click(I.byLabel('Show Tasks'), 900).catch((e) => console.log(`INFO ${e.message}`));
    }
    if (await I.exists(I.byLabel('Show Timebox'))) await I.click(I.byLabel('Show Timebox'), 900);
    console.log(`BOARD ${await I.exists(board)} TIMEBOX-BUTTON ${await I.exists(I.byLabel('Show Timebox'))}`);
    await shot('week-board');

    await I.click(I.byLabel('Filter'), 600);
    await shot('popover-filter');
    await I.key('Escape', [], 500);

    await I.click(I.visible(`[data-day-col="${today}"] [aria-label="Task Write report"]`), 900);
    await C.waitFor(() => I.exists(`document.querySelector('[data-detail-panel]')`), 8000).catch(() => console.log('INFO no details panel'));
    await I.blur();
    await shot('task-details');
    await I.key('Escape', [], 600);

    await I.click(I.byLabel('Show the Calendar'), 900).catch(() => console.log('INFO no Show the Calendar'));
    await I.key('d');
    await C.sleep(900);
    await I.js(`(() => { const s = document.querySelector('[data-cal-scroller]'); const b = [...document.querySelectorAll('[data-cal-block]')].find((e) => /Lunch/.test(e.innerText)); if (s && b) s.scrollTop += b.getBoundingClientRect().top - s.getBoundingClientRect().top - 220; })()`);
    await shot('day-view-break');

    const ic = (await I.exists(I.byLabel('Profile and account'))) ? 'Profile and account' : 'Profile, not signed in';
    await I.click(I.byLabel(ic), 600);
    await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 900);
    await I.waitBody('POWER FEATURES', 8000).catch(() => console.log('INFO Settings not seen'));
    await shot('settings');
    app.exit(0);
    return;
  }

  const P = await phoneWindow(win);
  await C.sleep(1800);
  const tabEls = `[...document.querySelectorAll('a, [role="tab"], [role="button"], [role="link"]')].filter((e) => { const r = e.getBoundingClientRect(); return r.top > 760 && r.height > 20 && r.width > 40 && r.width < 200; })`;
  const tab = (name) => `${tabEls}.find((e) => e.textContent.replace(/[^ -~]/g, '').trim() === '${name}')`;
  await shot('today');
  await P.finger.tap(tab('Calendar'), 1200).catch((e) => console.log(`INFO ${e.message}`));
  await shot('calendar');
  await P.finger.tap(tab('Tasks'), 1200).catch((e) => console.log(`INFO ${e.message}`));
  await shot('tasks');
  await P.finger.tap(tab('Today'), 1200).catch((e) => console.log(`INFO ${e.message}`));
  try {
    await P.finger.tap(`[...document.querySelectorAll('[data-today-row="Write report"] [data-today-body]')][0]`, 700);
    await P.finger.tap(`[...document.querySelectorAll('[data-today-expanded] [aria-label="Edit Write report"]')][0]`, 1400);
  } catch (e) {
    console.log(`INFO details: ${e.message}`);
  }
  await shot('details');
  app.exit(0);
}
