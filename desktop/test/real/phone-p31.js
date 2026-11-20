'use strict';
// @real-input: quiet
// Real touch check for the 3.64.0 Calendar shells (phone only) at 390 x 844: the Day view draws a shift as a wide shell with
// the blocks inside it on top, at real size (full width of the shell when they do not overlap, sharing the shell when
// they do), while blocks that overlap outside a shift stay side by side; a tap on an inside block opens it, a tap on the
// shell opens the shift; light and dark.
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
  const task = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, dueDate: day(0), ...extra });
  write('belific_tasks', [
    task('shift', 'Day shift', { startTime: '09:00', durationMinutes: 360 }),
    task('a', 'Block A', { startTime: '10:00', durationMinutes: 60 }),
    task('b', 'Block B', { startTime: '12:00', durationMinutes: 60 }),
    task('x', 'Outside X', { startTime: '18:00', durationMinutes: 60 }),
    task('y', 'Outside Y', { startTime: '18:30', durationMinutes: 60 }),
  ]);
  const read = (k) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dataDir, `${k}.kv`), 'utf8'));
    } catch {
      return [];
    }
  };

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
  const has = (sel) => P.js(`!!document.querySelector(${JSON.stringify(sel)})`);
  const box = (id) => P.js(`(() => { const e = document.querySelector('[data-phone-block="task:${id}"]'); if (!e) return null; const r = e.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom), w: Math.round(r.width) }; })()`);

  await P.finger.tap(tab('Calendar'), 1800);
  await P.js(`(() => { const e = document.querySelector('[data-phone-block="task:a"]'); if (e) e.scrollIntoView({ block: 'center' }); })()`);
  await C.sleep(600);
  const shell = await box('shift');
  const a = await box('a');
  const b = await box('b');
  const x = await box('x');
  const y = await box('y');
  check('the shift is drawn as a shell (marked) in a full lane', (await has('[data-phone-block="task:shift"][data-shell="1"]')) && !!shell && shell.w > 280, JSON.stringify(shell));
  check('Block A is inside the shell, on top, at its full width (less the shell edge)', !!a && !!shell && a.l > shell.l && a.r < shell.r && a.t >= shell.t && a.b <= shell.b && shell.w - a.w <= 16 && shell.w - a.w >= 4, JSON.stringify([shell, a]));
  check('Block B too, at the same width (not a thin column beside the shift)', !!b && !!a && Math.abs(b.w - a.w) <= 2 && b.t > a.b, JSON.stringify([a, b]));
  check('blocks that overlap outside a shift stay side by side', !!x && !!y && x.w < 200 && y.w < 200 && y.l >= x.r - 4 && Math.abs(x.w - y.w) <= 3, JSON.stringify([x, y]));
  await shot('phone-p31-day');
  // A tap on the inside block opens it; the shell opens the shift.
  await P.finger.tap(`document.querySelector('[data-block-tap="task:a"]')`, 1500);
  check('a tap on Block A opens Block A', (await P.js(`document.body.innerText`)).includes('Block A') && (await has('[data-details-done]')));
  await P.finger.tap(`document.querySelector('[data-details-done]')`, 1200);
  // The shell outside the inside blocks (the part of it below Block B): the shift opens.
  const sb = await box('shift');
  const bb = await box('b');
  await P.finger.tapAt(sb.l + 40, Math.round((bb.b + sb.b) / 2), 1500);
  check('a tap on the shell outside the inside blocks opens the shift', (await P.js(`document.body.innerText`)).includes('Day shift') && (await has('[data-details-done]')), (await P.js(`document.body.innerText`)).slice(0, 120));
  await P.finger.tap(`document.querySelector('[data-details-done]')`, 1200);

  // overlapping inside blocks share the shell
  const tasks = read('belific_tasks');
  tasks.push(task('c', 'Block C', { startTime: '10:30', durationMinutes: 60 }));
  write('belific_tasks', tasks);
  win.webContents.reload();
  await C.sleep(3500);
  await P.finger.tap(tab('Calendar'), 1800);
  await P.js(`(() => { const e = document.querySelector('[data-phone-block="task:a"]'); if (e) e.scrollIntoView({ block: 'center' }); })()`);
  await C.sleep(600);
  const a2 = await box('a');
  const c2 = await box('c');
  const sh2 = await box('shift');
  check('overlapping inside blocks share the shell (each about half its width) and stay inside it', !!a2 && !!c2 && !!sh2 && a2.w < sh2.w * 0.6 && c2.w < sh2.w * 0.6 && c2.l >= a2.r - 4 && c2.r < sh2.r, JSON.stringify([sh2, a2, c2]));
  await shot('phone-p31-day-overlap');

  // dark
  await P.finger.tap(tab('Today'), 1200);
  await P.finger.tap(`document.querySelector('[data-profile-avatar]')`, 1300);
  await P.finger.tap(`document.querySelector('[data-profile-settings]')`, 1700);
  await P.js(`document.querySelector('[data-phone-theme] [data-seg="dark"]').scrollIntoView({ block: 'center' })`);
  await P.finger.tap(`document.querySelector('[data-phone-theme] [data-seg="dark"]')`, 900);
  await P.finger.tap(`document.querySelector('[aria-label="Back"]')`, 1200);
  await P.finger.tap(tab('Calendar'), 1800);
  await P.js(`(() => { const e = document.querySelector('[data-phone-block="task:a"]'); if (e) e.scrollIntoView({ block: 'center' }); })()`);
  await C.sleep(500);
  const shellBg = await P.js(`getComputedStyle(document.querySelector('[data-phone-block="task:shift"] [role="button"], [data-phone-block="task:shift"] div')).backgroundColor`);
  check('dark: the shell is still drawn with its blocks inside it', (await has('[data-phone-block="task:shift"][data-shell="1"]')) && !!(await box('a')), String(shellBg));
  await shot('phone-p31-day-dark');

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
