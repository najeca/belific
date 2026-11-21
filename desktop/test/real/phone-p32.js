'use strict';
// @real-input: quiet
// Real touch check for the 3.64.1 fix pack (phone only) at 390 x 844: the Today Now marker text is 4.5:1 in light mode (when the
// marker is on screen); Plan my day, Not today on a repeat that has never started does not delete the series; Delete label in
// the label sheet (a confirm, the label comes off its tasks, the tasks stay). Runs quiet.
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
  const task = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  const stamp2 = new Date().toISOString();
  write('belific_tasks', [
    task('rep', 'Daily thing', { recurrence: 'daily', dueDate: day(0) }),
    task('a', 'Buy stamps', { projectKey: 'LM' }),
    task('b', 'Pay rent', { projectKey: 'LM', dueDate: day(3) }),
    task('c', 'Keep me', { projectKey: 'LH' }),
  ]);
  write('belific_lists', []);
  write('belific_projects', [
    { key: 'LH', name: 'Health', emoji: '💪', colorKey: 'sage', createdAt: stamp, updatedAt: stamp },
    { key: 'LM', name: 'Money', colorKey: 'sky', createdAt: stamp, updatedAt: stamp },
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
  const visible = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].reverse().find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left >= -1 && r.left < innerWidth && r.top < innerHeight; })`;
  const tap = (sel, ms = 900) => P.finger.tap(visible(sel), ms);
  const has = (sel) => P.js(`!!(${visible(sel)})`);
  const text = (sel) => P.js(`((${visible(sel)}) || {}).innerText || ''`);
  const typeText = async (t) => {
    await win.webContents.insertText(t);
    await C.sleep(500);
  };
  const chipTap = async (attr) => {
    await P.js(`document.querySelector('[${attr}]').scrollIntoView({ inline: 'center', block: 'nearest' })`);
    await C.sleep(300);
    await tap(`[${attr}]`, 1000);
  };
  await P.finger.tap(tab('Tasks'), 800);
  await P.finger.tap(tab('Today'), 1200);

  // ---- 1. the Now marker ----
  const mk = await P.js(`(() => { const m = document.querySelector('[data-now-marker="line"]'); if (!m) return null; const t = [...m.querySelectorAll('*')].reverse().find((e) => /^Now /.test(e.innerText || '')); if (!t) return null; const cs = getComputedStyle(t); const lum = (c) => { const [r, g, b] = c.match(/\d+/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }; const bg = getComputedStyle(document.body).backgroundColor; const a = lum(cs.color), b = lum(/rgba\(0, 0, 0, 0\)/.test(bg) ? 'rgb(250, 247, 240)' : bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); })()`);
  check('light: the Now marker text is at least 4.5:1 (or the marker is off screen at this hour)', mk === null || mk >= 4.5, String(mk));

  // ---- 2. Plan my day: Not today on a repeat that never started ----
  await tap('[data-plan-menu]', 800);
  await tap('[aria-label="Plan my day"]', 1500);
  const cur = () => P.js(`(document.querySelector('[data-plan-task]') || { getAttribute: () => null }).getAttribute('data-plan-task')`);
  check('Plan my day opens on the repeat (due today, never started)', (await cur()) === 'Daily thing', String(await cur()));
  await tap('[data-plan-answer="notToday"]', 1300);
  const rep = read('belific_tasks').filter((t) => t.id.split(':')[0] === 'rep');
  check('Not today does not delete the series (the template is still live)', rep.some((t) => t.id === 'rep' && !t.deletedAt), JSON.stringify(rep.map((t) => [t.id, !!t.deletedAt])));
  check('and it says why, and still asks that task', /hasn't started yet/.test(await P.js(`document.body.innerText`)) && (await cur()) === 'Daily thing');
  await tap('[data-plan-done]', 1200);

  // ---- 3. Delete label ----
  await P.finger.tap(tab('Tasks'), 1500);
  await P.js(`document.querySelector('[data-label-filter="Money"]').scrollIntoView({ inline: 'center', block: 'nearest' })`);
  await C.sleep(300);
  await P.finger.hold(visible('[data-label-filter="Money"]'), 700, 1000);
  check('hold on the Money chip opens its edit sheet', await has('[data-label-sheet="LM"]'));
  await P.js(`(() => { const b = document.querySelector('[aria-label="Delete label Money"]'); if (b) b.scrollIntoView({ block: 'center' }); })()`);
  await C.sleep(300);
  check('the sheet has Delete label', await has('[aria-label="Delete label Money"]'));
  await tap('[aria-label="Delete label Money"]', 700);
  const conf = await P.js(`(document.querySelector('[data-label-delete-confirm]') || { innerText: '' }).innerText`);
  check('the confirm says 2 tasks will lose the label', /Delete the label Money\? Its 2 tasks will lose the label/.test(conf), conf);
  await shot('phone-p32-delete-confirm');
  await tap('[aria-label="Keep the label"]', 700);
  check('Keep changes nothing', !read('belific_projects').find((p) => p.key === 'LM').deletedAt);
  await P.js(`document.querySelector('[aria-label="Delete label Money"]').scrollIntoView({ block: 'center' })`);
  await tap('[aria-label="Delete label Money"]', 700);
  await tap('[aria-label="Confirm delete label Money"]', 1500);
  const money = read('belific_projects').find((p) => p.key === 'LM');
  check('Delete tombstones the label', !!money && !!money.deletedAt);
  const ta = read('belific_tasks').filter((t) => t.id === 'a' || t.id === 'b');
  check('its tasks stay, with no label', ta.length === 2 && ta.every((t) => !t.deletedAt && !t.projectKey), JSON.stringify(ta));
  check('the other label is untouched', read('belific_tasks').find((t) => t.id === 'c').projectKey === 'LH');
  check('the sheet is closed and the chip is gone', !(await has('[data-label-sheet]')) && !(await has('[data-label-filter="Money"]')));

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
