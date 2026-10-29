'use strict';
// Real touch check for the 3.15.0 batch on the phone, 390 x 844. Sections are added step by step.
//  Step 4 (3.16.0): the Tasks tab's add row is a full width field whose placeholder is whole; the + button adds.
//  Step 3 (3.15.2): the bold figure on a row is the length; the start time is in the meta line only.
//  Step 1 (3.15.0): the shared switch (44 x 26, light knob, clear on and off tracks, light and dark) on the
//          phone's Settings and the task sheet's Top priority.
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
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  const write = (k, v) => fs.writeFileSync(path.join(dataDir, `${k}.kv`), JSON.stringify(v));
  write('belific_tasks', [T('sw', 'Switch thing', { dueDate: today, startTime: '10:00', durationMinutes: 60 }), T('lg', 'Long task', { dueDate: today, startTime: '06:00', durationMinutes: 180 }), T('ud', 'Undated length', { durationMinutes: 45 }), T('un', 'Undated nothing')]);
  write('belific_lists', []);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.show();
  await C.sleep(2500);
  const P = await phoneWindow(win);
  await C.sleep(1800);
  const shot = async (name) => {
    if (!process.env.BELIFIC_SHOTS) return;
    fs.mkdirSync(process.env.BELIFIC_SHOTS, { recursive: true });
    fs.writeFileSync(path.join(process.env.BELIFIC_SHOTS, `${name}.png`), (await win.webContents.capturePage()).toPNG());
  };
  const tabEls = `[...document.querySelectorAll('a, [role="tab"], [role="button"], [role="link"]')].filter((e) => { const r = e.getBoundingClientRect(); return r.top > 760 && r.height > 20 && r.width > 20; })`;
  const tab = (name) => `${tabEls}.find((e) => e.textContent.replace(/[^ -~]/g, '').trim() === '${name}')`;
  const visible = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left >= -1 && r.left < innerWidth; })`;
  const lum = (rgb) => {
    const m = String(rgb).match(/\d+(\.\d+)?/g) || [0, 0, 0];
    const [r, g, b] = m.slice(0, 3).map((v) => { const c = Number(v) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const switches = () =>
    P.js(`[...document.querySelectorAll('[data-toggle]')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => { const r = e.getBoundingClientRect(); const k = e.firstElementChild; return { label: e.getAttribute('aria-label'), checked: e.getAttribute('aria-checked'), w: Math.round(r.width), h: Math.round(r.height), track: getComputedStyle(e).backgroundColor, knob: getComputedStyle(k).backgroundColor, bg: getComputedStyle(document.body).backgroundColor }; })`);
  const audit = async (name, min) => {
    const s = await switches();
    check(`${name}: ${s.length} switches (at least ${min})`, s.length >= min, JSON.stringify(s.map((x) => x.label)));
    check(`${name}: each is 44 x 26 with a light knob`, s.every((x) => x.w === 44 && x.h === 26 && lum(x.knob) > 0.85), JSON.stringify(s.map((x) => [x.label, x.w, x.h, x.knob])));
    check(`${name}: tracks are 3:1 or more on the page, on unlike off`, s.every((x) => ratio(x.track, x.bg) >= 3) && (new Set(s.map((x) => x.checked)).size < 2 || new Set(s.map((x) => `${x.checked}${x.track}`)).size >= 2), JSON.stringify(s.map((x) => [x.label, x.checked, x.track])));
    return s;
  };

  // ======== Step 1: switches ========
  await P.finger.tap(visible('[data-profile-avatar]'), 1200);
  await audit('light settings', 3);
  await shot('phone-p16-switches-settings-light');
  await P.finger.tap(visible('[data-phone-theme] [data-seg="dark"]'), 900);
  await audit('dark settings', 3);
  await shot('phone-p16-switches-settings-dark');
  const before = await P.js(`document.querySelector('[data-phone-streaks] [data-toggle]').getAttribute('aria-checked')`);
  await P.finger.tap(visible('[data-phone-streaks] [data-toggle]'), 500);
  const after = await P.js(`document.querySelector('[data-phone-streaks] [data-toggle]').getAttribute('aria-checked')`);
  check('a tap flips the switch', before !== after, `${before} -> ${after}`);
  await P.finger.tap(visible('[data-phone-streaks] [data-toggle]'), 500);
  await P.finger.tap(visible('[aria-label="Back"]'), 900);
  await C.sleep(600);
  await P.finger.tap(`[...document.querySelectorAll('div, span')].find((e) => e.children.length === 0 && e.textContent.trim() === 'Switch thing')`, 900);
  await P.finger.tap(visible('[aria-label="Edit Switch thing"]'), 1400);
  await audit('dark task sheet', 1);
  check('the task sheet has Top priority', (await switches()).some((x) => x.label === 'Top priority'));
  await shot('phone-p16-switches-sheet-dark');
  await P.finger.tap(visible('[data-toggle][aria-label="Top priority"]'), 600);
  await shot('phone-p16-switches-sheet-dark-on');
  check('Top priority on: the switch reads on', (await switches()).some((x) => x.label === 'Top priority' && x.checked === 'true'));

  await P.finger.tap(visible('[aria-label="Done"]'), 900);

  // ======== Step 3: the length is the bold figure, the start time is in the meta line ========
  const todayRow = (title) => P.js(`(() => { const b = [...document.querySelectorAll('[data-today-body]')].find((e) => e.innerText.includes('${title}')); if (!b) return null; const l = b.querySelector('[data-today-length]'); const st = b.querySelector('[data-today-start]'); return { len: l ? l.innerText.trim() : null, start: st ? st.innerText.trim() : null, bold: l ? getComputedStyle(l).color : null }; })()`);
  const mode3 = async (mode) => {
    await P.finger.tap(tab('Today'), 1200);
    const lg = await todayRow('Long task');
    check(`${mode}: Today: Long task has the bold length 3h and its start 6:00am in the meta line`, !!lg && lg.len === '3h' && /6:00s*am/i.test(lg.start || ''), JSON.stringify(lg));
    const sw = await todayRow('Switch thing');
    check(`${mode}: Today: Switch thing has 1h and 10:00am`, !!sw && sw.len === '1h' && /10:00s*am/i.test(sw.start || ''), JSON.stringify(sw));
    await shot(`phone-p16-card-time-today-${mode}`);
    await P.finger.tap(tab('Tasks'), 1500);
    const ud = await P.js(`(() => { const r = document.querySelector('[data-task-row="Undated length"]'); if (!r) return null; const l = r.querySelector('[data-task-length]'); return { len: l ? l.innerText.trim() : null, text: r.innerText.replace(/\s+/g, ' ') }; })()`);
    check(`${mode}: Tasks: Undated length shows 45m once, at the right of the title`, !!ud && ud.len === '45m' && ud.text.split('45m').length === 2, JSON.stringify(ud));
    const un = await P.js(`(() => { const r = document.querySelector('[data-task-row="Undated nothing"]'); return r ? !!r.querySelector('[data-task-length]') : null; })()`);
    check(`${mode}: Tasks: a row with no length shows no figure`, un === false, String(un));
    await shot(`phone-p16-card-time-tasks-${mode}`);
  };
  await mode3('dark');
  await P.finger.tap(tab('Today'), 900);
  await P.finger.tap(visible('[data-profile-avatar]'), 1200);
  await P.finger.tap(visible('[data-phone-theme] [data-seg="light"]'), 900);
  await P.finger.tap(visible('[aria-label="Back"]'), 900);
  await mode3('light');

  // ======== Step 4: the Tasks tab's add row ========
  await P.finger.tap(tab('Tasks'), 1500);
  const addRow = await P.js(`(() => { const i = document.querySelector('input[placeholder^="Add to"]'); if (!i) return null; const cs = getComputedStyle(i); const c = document.createElement('canvas').getContext('2d'); c.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily; const w = c.measureText(i.placeholder).width; const r = i.getBoundingClientRect(); return { ph: i.placeholder, text: Math.ceil(w), room: Math.floor(i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)), left: Math.round(r.left), right: Math.round(r.right), planned: /planned/.test(i.parentElement.innerText) }; })()`);
  check('phone Tasks: the add row placeholder is whole (' + JSON.stringify(addRow) + ')', !!addRow && addRow.room >= addRow.text && !addRow.planned);
  await P.finger.tap(visible('input[placeholder^="Add to"]'), 400);
  await win.webContents.insertText('Phone added');
  await C.sleep(300);
  const addBtn = await P.js(`(() => { const b = document.querySelector('[aria-label="Add"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })()`);
  check('phone Tasks: the Add button is 44 pt or more', !!addBtn && addBtn.w >= 44 && addBtn.h >= 44, JSON.stringify(addBtn));
  await P.finger.tap(visible('[aria-label="Add"]'), 900);
  check('phone Tasks: the button adds the task', JSON.stringify(JSON.parse(fs.readFileSync(path.join(dataDir, 'belific_tasks.kv'), 'utf8')).map((t) => t.title)).includes('Phone added'));
  await shot('phone-p16-add-row');

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
