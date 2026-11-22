'use strict';
// @real-input: quiet
// Real touch check for the phone's Today redesign (3.60.0, PLAN_phone_stepflow section 2) at 390 x 844, on a FIXED
// CLOCK (Thursday 19 Nov 2026, 14:35):
//   - the Now card: what runs now with its range and time left, Next with "in", the label colour edge and pill, Free
//     time, the Done tick; it moves on with the minute;
//   - the timeline: bubbles in time order, height by length (44 to 160), the list emoji, the tick in the label colour,
//     the Now marker, a break as a gap, smaller tasks nested, a ticked item kept and struck through;
//   - Anytime: separate slab cards; press, hold and drag reorders them; the order is one user_settings row and stays
//     after a reload;
//   - the hours strip: one part per label in its colour, Sleep off by default, a reminder never counted, and the
//     Settings switch that takes a label out;
//   - no red priority mark anywhere and no Top priority switch; light and dark.
// Runs quiet.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const C = require('./common');
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
  const today = '2026-11-19';
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const write = (k, v) => fs.writeFileSync(path.join(dataDir, `${k}.kv`), JSON.stringify(v));
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  const at = (startTime, durationMinutes, extra = {}) => ({ dueDate: today, startTime, durationMinutes, ...extra });
  write('belific_tasks', [
    T('standup', 'Stand up', { ...at('09:00', 15), listKey: 'LW', projectKey: 'LM', completed: true, completedAt: '2026-11-19T09:15:00.000Z' }),
    T('deep', 'Deep work', { ...at('10:00', 120), listKey: 'LW', projectKey: 'LM' }),
    T('draft', 'Draft', { parentId: 'deep', durationMinutes: 30 }),
    T('lunch', 'Lunch', { ...at('12:00', 60), cutsBelow: true }),
    T('gym', 'Gym', { ...at('14:00', 60), projectKey: 'LH' }),
    T('call', 'Call Mum', at('15:30', 30)),
    T('ring', 'Ring the pharmacy', { ...at('16:00', 0), projectKey: 'LH' }),
    T('sleep', 'Sleep', { ...at('22:00', 480), projectKey: 'LS' }),
    T('stamps', 'Buy stamps', { dueDate: today, listKey: 'LW', createdAt: '2026-09-01T07:00:00.000Z' }),
    T('read', 'Read chapter 3', { dueDate: today, createdAt: '2026-09-02T07:00:00.000Z' }),
    T('parcel', 'Post parcel', { dueDate: today, projectKey: 'LH', priority: 'high', createdAt: '2026-09-03T07:00:00.000Z' }),
  ]);
  write('belific_lists', [{ key: 'LW', name: 'Work', sortOrder: 0, emoji: '💼', createdAt: stamp, updatedAt: stamp }]);
  write('belific_projects', [
    { key: 'LH', name: 'Health', emoji: '💪', colorKey: 'sage', createdAt: stamp, updatedAt: stamp },
    { key: 'LM', name: 'Money', emoji: '💷', colorKey: 'clay', createdAt: stamp, updatedAt: stamp },
    { key: 'LS', name: 'Sleep', emoji: '😴', colorKey: 'sky', createdAt: stamp, updatedAt: stamp },
  ]);
  const read = (k) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dataDir, `${k}.kv`), 'utf8'));
    } catch {
      return [];
    }
  };
  const byId = (id) => read('belific_tasks').find((x) => x.id === id);
  const setting = (k) => (read('belific_user_settings').find((s) => s.key === k && !s.deletedAt) || {}).value;

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.show();
  await C.sleep(2500);

  // A fixed clock, set before the page loads (phoneWindow reloads it), as in phone-p20.
  const dbg = win.webContents.debugger;
  if (!dbg.isAttached()) dbg.attach('1.3');
  await dbg.sendCommand('Page.enable');
  const clockSource = (ms) => `(() => { const R = Date; const start = R.now(); const base = ${ms};
    class D extends R { constructor(...a) { if (a.length === 0) super(base + (R.now() - start)); else super(...a); } static now() { return base + (R.now() - start); } }
    window.Date = D; })()`;
  let clockId = null;
  const setClock = async (h, m, s = 0) => {
    if (clockId) await dbg.sendCommand('Page.removeScriptToEvaluateOnNewDocument', { identifier: clockId });
    clockId = (await dbg.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: clockSource(new Date(2026, 10, 19, h, m, s, 0).getTime()) })).identifier;
  };
  await setClock(14, 35);
  let P = await phoneWindow(win);
  await C.sleep(1800);
  const reload = async () => {
    win.webContents.reload();
    await C.sleep(2500);
    P = await phoneWindow(win);
    await C.sleep(1500);
  };
  const shot = async (name) => {
    if (!process.env.BELIFIC_SHOTS) return;
    fs.mkdirSync(process.env.BELIFIC_SHOTS, { recursive: true });
    fs.writeFileSync(path.join(process.env.BELIFIC_SHOTS, `${name}.png`), (await win.webContents.capturePage()).toPNG());
  };
  const tabEls = `[...document.querySelectorAll('a, [role="tab"], [role="button"], [role="link"]')].filter((e) => { const r = e.getBoundingClientRect(); return r.top > 760 && r.height > 20 && r.width > 40 && r.width < 200; })`;
  const tab = (name) => `${tabEls}.find((e) => e.textContent.replace(/[^ -~]/g, '').trim() === '${name}')`;
  const visible = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].reverse().find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left >= -1 && r.left < innerWidth && r.top < innerHeight && r.bottom > 0; })`;
  const scrollTo = (sel) => P.js(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => x.getBoundingClientRect().height > 0); if (e) e.scrollIntoView({ block: 'center' }); return !!e; })()`);
  const tap = async (sel, ms = 900) => {
    await scrollTo(sel);
    await C.sleep(250);
    await P.finger.tap(visible(sel), ms);
  };
  const attr = (sel, name) => P.js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? e.getAttribute(${JSON.stringify(name)}) : null; })()`);
  const text = (sel) => P.js(`((${visible(sel)}) || document.querySelector(${JSON.stringify(sel)}) || {}).innerText || ''`);
  const all = (sel, name) => P.js(`[...document.querySelectorAll(${JSON.stringify(sel)})].filter((e) => e.getBoundingClientRect().height > 0).map((e) => e.getAttribute(${JSON.stringify(name)}))`);
  const rgb = (hex) => `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`;
  const SAGE = '#6F8F7E';
  const CLAY = '#B57A62';
  const SKY = '#6E8DA6';

  // ---- The Now card ----
  check('the Now card shows what runs now (Gym)', (await attr('[data-now-card]', 'data-now-card')) === 'now' && (await text('[data-now-title]')) === 'Gym', await text('[data-now-card]'));
  check('its range reads "NOW · 2:00pm to 3:00pm"', /NOW · 2:00pm to 3:00pm/.test(await text('[data-now-card]')), await text('[data-now-card]'));
  check('25 min left', (await attr('[data-now-left]', 'data-now-left')) === '25 min left');
  check('Next: Call Mum at 3:30pm, in 55 min', (await attr('[data-now-next]', 'data-now-next')) === 'Next: Call Mum at 3:30pm, in 55 min', await attr('[data-now-next]', 'data-now-next'));
  check('the pill names the label (💪 Health)', (await attr('[data-now-pill]', 'data-now-pill')) === '💪 Health');
  check('the edge on the left is the label colour (sage)', (await attr('[data-now-edge]', 'data-now-edge')) === SAGE && (await P.js(`getComputedStyle(document.querySelector('[data-now-edge]')).backgroundColor`)) === rgb(SAGE));
  check('the Now card has no old "Now / Next" text lines', !(await P.js(`!!document.querySelector('[data-now-next="1"]')`)));
  await shot('phone-p27-now');

  // ---- The timeline ----
  const rows = await all('[data-tl-row]', 'data-today-row');
  check('the timeline is in time order (the break is a gap, not a row)', JSON.stringify(rows) === JSON.stringify(['Stand up', 'Deep work', 'Gym', 'Call Mum', 'Ring the pharmacy', 'Sleep']), JSON.stringify(rows));
  const heights = await all('[data-bubble]', 'data-bubble');
  check('bubble heights follow the length: 15m 44, 2h 120, 1h 60, 30m 44, a reminder 44, 8h 160', JSON.stringify(heights) === JSON.stringify(['44', '120', '60', '44', '44', '160']), JSON.stringify(heights));
  const realH = await P.js(`[...document.querySelectorAll('[data-bubble]')].map((e) => Math.round(e.getBoundingClientRect().height))`);
  check('and are drawn at those heights', JSON.stringify(realH) === JSON.stringify([44, 120, 60, 44, 44, 160]), JSON.stringify(realH));
  check('a bubble is in its label colour (Gym: sage ring)', (await P.js(`getComputedStyle([...document.querySelectorAll('[data-bubble]')][2]).borderTopColor`)) === rgb(SAGE));
  check('a bubble holds the list emoji (Work 💼; Brain Dump 🧠 when none)', (await P.js(`[...document.querySelectorAll('[data-bubble]')].map((e) => e.innerText.trim()).join(' ')`)) === '💼 💼 🧠 🧠 🧠 🧠', await P.js(`[...document.querySelectorAll('[data-bubble]')].map((e) => e.innerText.trim()).join(' ')`));
  check('the break Lunch is a gap with its name, free time', /Lunch, free time · 12:00pm to 1:00pm/.test(await text('[data-today-gap="Lunch"]')), await text('[data-today-gap="Lunch"]'));
  check('the Now marker is inside the Gym bubble', (await attr('[data-now-marker]', 'data-now-marker')) === 'inside' && (await P.js(`(() => { const m = document.querySelector('[data-now-marker]').getBoundingClientRect(); const b = [...document.querySelectorAll('[data-bubble]')][2].getBoundingClientRect(); return m.top >= b.top && m.bottom <= b.bottom + 6; })()`)));
  check('the smaller task Draft is nested under Deep work', await P.js(`!!document.querySelector('[data-today-row="Deep work"] [data-card-part="Draft"]')`));
  check('the ticked Stand up stays on the timeline, struck through', (await attr('[data-today-row="Stand up"]', 'data-tl-row')) === 'done' && (await P.js(`getComputedStyle([...document.querySelectorAll('[data-today-row="Stand up"] div[dir="auto"]')][1] || document.body).textDecorationLine`)).includes('line-through'));
  check('the tick on the right is in the label colour (Gym: sage ring)', (await P.js(`getComputedStyle(document.querySelector('[data-tick="gym"]').firstElementChild).borderTopColor`)) === rgb(SAGE));
  check('every tick and bubble row is at least 44 pt', await P.js(`[...document.querySelectorAll('[data-tick]')].filter((e) => e.getBoundingClientRect().height > 0).every((e) => { const r = e.getBoundingClientRect(); return r.width >= 44 && r.height >= 44; })`));
  await shot('phone-p27-timeline');

  // ---- Anytime: slab cards, hold and drag to reorder ----
  const cards = () => all('[data-anytime-card]', 'data-anytime-card');
  check('Anytime has one card per untimed task (oldest first, no priority from 3.69.0)', JSON.stringify(await cards()) === JSON.stringify(['Buy stamps', 'Read chapter 3', 'Post parcel']), JSON.stringify(await cards()));
  const gaps = await P.js(`(() => { const r = [...document.querySelectorAll('[data-anytime-body]')].map((e) => e.parentElement.parentElement.getBoundingClientRect()); return r.slice(1).map((b, i) => Math.round(b.top - r[i].bottom)); })()`);
  check('the cards are separate, with a visible gap', gaps.every((g) => g >= 8), JSON.stringify(gaps));
  check('each card has its slab shape behind it (light mode)', (await P.js(`document.querySelectorAll('[data-anytime-card] [data-slab-shape]').length`)) === 3);
  check('a card shows its list and its label colour edge (Post parcel: sage)', /Brain Dump/.test(await text('[data-anytime-card="Post parcel"]')) && /Health/.test(await text('[data-anytime-card="Post parcel"]')) && (await attr('[data-anytime-card="Post parcel"] [data-slab-edge]', 'data-slab-edge')) === SAGE);
  check('the card ticks are 44 pt and in the label colour', (await P.js(`(() => { const e = document.querySelector('[data-tick="parcel"]'); const r = e.getBoundingClientRect(); return r.width >= 44 && r.height >= 44 && getComputedStyle(e.firstElementChild).borderTopColor; })()`)) === rgb(SAGE));
  await scrollTo('[data-anytime-card="Read chapter 3"]');
  await C.sleep(400);
  await shot('phone-p27-anytime');
  const cardH = await P.js(`Math.round(document.querySelector('[data-anytime-card="Read chapter 3"]').getBoundingClientRect().height)`);
  await P.finger.holdDrag(visible('[data-anytime-body="Read chapter 3"]'), 0, -Math.round(cardH * 1.2), 520, 600, 1400);
  check('hold and drag Read chapter 3 up one place: it is first', JSON.stringify(await cards()) === JSON.stringify(['Read chapter 3', 'Buy stamps', 'Post parcel']), JSON.stringify(await cards()));
  check('the order is one user_settings row for today', JSON.stringify(JSON.parse(setting('today.order.2026-11-19') || '[]')) === JSON.stringify(['read', 'stamps', 'parcel']), setting('today.order.2026-11-19'));
  check('no task row changed for the order (no new column)', read('belific_tasks').every((t) => !('dayOrder' in t) && !('day_order' in t)));
  await P.finger.hold(visible('[data-anytime-body="Buy stamps"]'), 560, 1000);
  check('a hold without moving still opens the hold card', await P.js(`!!document.querySelector('[data-hold-card="Buy stamps"]')`));
  check('and does not change the order', JSON.stringify(await cards()) === JSON.stringify(['Read chapter 3', 'Buy stamps', 'Post parcel']));
  await P.js(`(() => { const e = document.querySelector('[data-menu-scrim]'); if (e) e.click(); })()`);
  await C.sleep(900);
  await P.finger.tap(visible('[data-anytime-body="Buy stamps"]'), 1400);
  check('a tap opens the task card', /Buy stamps/.test(await P.js(`document.body.innerText`)) && (await P.js(`!!document.querySelector('[data-detail-row="date"]')`)));
  await P.js(`(() => { const b = [...document.querySelectorAll('[role="button"]')].find((e) => /^(Done|Close)$/.test(e.innerText.trim()) && e.getBoundingClientRect().height > 0); if (b) b.click(); })()`);
  await C.sleep(900);
  await reload();
  check('the order stays after a reload', JSON.stringify(await cards()) === JSON.stringify(['Read chapter 3', 'Buy stamps', 'Post parcel']), JSON.stringify(await cards()));

  // The Done tick on the Now card: Gym is done, stays struck through, the card moves to Free time.
  await tap('[data-now-done]', 1400);
  check('Done on the Now card ticks Gym (stored)', byId('gym').completed === true);
  check('Gym stays on the timeline, struck through', (await attr('[data-today-row="Gym"]', 'data-tl-row')) === 'done');
  check('the card now says Free time, Next: Call Mum', (await attr('[data-now-pill]', 'data-now-pill')) === 'Free time' && /Next: Call Mum/.test(await attr('[data-now-next]', 'data-now-next')));
  check('the Now marker is a line before Call Mum now', (await attr('[data-now-marker]', 'data-now-marker')) === 'line');
  // Undo the tick (the timeline's tick).
  await tap('[data-tick="gym"]', 1400);
  check('a tap on the timeline tick unticks it', byId('gym').completed === false);

  // The minute update: at 14:59:30 Gym has 1 min left; past 15:00 the card is Free time without a reload.
  await setClock(14, 59, 30);
  await reload();
  check('at 14:59 the card shows Gym, 1 min left', (await attr('[data-now-left]', 'data-now-left')) === '1 min left', await attr('[data-now-left]', 'data-now-left'));
  await C.sleep(62000);
  check('a minute later, with no reload, Gym is over: Free time, Next: Call Mum in 30 min', (await attr('[data-now-pill]', 'data-now-pill')) === 'Free time' && (await attr('[data-now-next]', 'data-now-next')) === 'Next: Call Mum at 3:30pm, in 30 min', await attr('[data-now-next]', 'data-now-next'));

  // ---- No red priority mark anywhere ----
  await setClock(14, 35);
  await reload();
  const noMark = () => P.js(`!document.body.innerText.includes('❗')`);

  // ---- The hours strip ----
  const parts = () => P.js(`[...document.querySelectorAll('[data-hours-part]')].filter((e) => e.getBoundingClientRect().height > 0).map((e) => e.getAttribute('data-hours-part') + ':' + e.getAttribute('data-hours-minutes'))`);
  check('the strip has one part per label, longest first: Money 2h 15m, Health 1h, No label 30m (Sleep off, the reminder and the break not counted)', JSON.stringify(await parts()) === JSON.stringify(['LM:135', 'LH:60', 'none:30']), JSON.stringify(await parts()));
  check('the parts are in the label colours (Money clay, Health sage), No label grey', (await P.js(`[...document.querySelectorAll('[data-hours-part]')].filter((e) => e.getBoundingClientRect().height > 0).map((e) => getComputedStyle(e).backgroundColor).slice(0, 2).join('|')`)) === `${rgb(CLAY)}|${rgb(SAGE)}`);
  check('the total reads 3h 45m and the legend names them', (await attr('[data-hours-strip]', 'data-hours-strip')) === '225' && /Hours today\s*3h 45m/.test(await text('[data-hours-strip]')) && /💷 Money 2h 15m/.test(await text('[data-hours-strip]')) && /No label 30m/.test(await text('[data-hours-strip]')), await text('[data-hours-strip]'));
  check('the old "planned" line is gone', !(await P.js(`!!document.querySelector('[data-today-planned]')`)));
  await shot('phone-p27-hours');
  // Settings, Daily hours: Sleep starts off; turning it on adds it; turning Health off takes it out.
  const openSettings = async () => {
    await P.finger.tap(visible('[data-profile-avatar]'), 1200);
    await tap('[data-profile-settings]', 1600);
  };
  const sw = (name) => P.js(`(() => { const e = document.querySelector('[data-toggle][aria-label="Count ${name} in daily hours"]'); return e ? e.getAttribute('aria-checked') : null; })()`);
  await openSettings();
  await scrollTo('[data-daily-hours]');
  await C.sleep(400);
  check('Settings has Daily hours with a switch per label', (await all('[data-hours-label]', 'data-hours-label')).join(',') === 'Health,Money,Sleep', JSON.stringify(await all('[data-hours-label]', 'data-hours-label')));
  check('Sleep is off by default, Health and Money on', (await sw('Sleep')) === 'false' && (await sw('Health')) === 'true' && (await sw('Money')) === 'true', `${await sw('Sleep')} ${await sw('Health')}`);
  await shot('phone-p27-settings-hours');
  await tap('[data-toggle][aria-label="Count Sleep in daily hours"]', 900);
  await tap('[data-toggle][aria-label="Count Health in daily hours"]', 900);
  check('the switches are stored as user_settings rows (synced, no database change)', setting('hours.count.LS') === 'on' && setting('hours.count.LH') === 'off', `${setting('hours.count.LS')} ${setting('hours.count.LH')}`);
  await tap('[aria-label="Back"]', 1400);
  await P.finger.tap(tab('Today'), 1400);
  check('back on Today: Sleep 8h is in the strip, Health is out', JSON.stringify(await parts()) === JSON.stringify(['LS:480', 'LM:135', 'none:30']), JSON.stringify(await parts()));
  check('Health\'s tasks still show on the timeline', (await all('[data-tl-row]', 'data-today-row')).includes('Gym'));
  check('no ❗ on Today (Post parcel has a priority)', await noMark());
  await P.finger.tap(tab('Tasks'), 1200);
  check('no ❗ on Tasks', await noMark());
  await P.finger.tap(tab('Calendar'), 1500);
  check('no ❗ on the Calendar', await noMark());
  await P.finger.tap(tab('Today'), 1200);
  await tap('[data-anytime-body="Post parcel"]', 1400);
  check('the card has no Top priority switch and no ❗', !(await P.js(`!!document.querySelector('[data-detail-row="priority"]') || document.body.innerText.includes('Top priority')`)) && (await noMark()));
  await P.js(`(() => { const b = [...document.querySelectorAll('[role="button"]')].find((e) => /^(Done|Close)$/.test(e.innerText.trim()) && e.getBoundingClientRect().height > 0); if (b) b.click(); })()`);
  await C.sleep(900);

  // ---- Dark ----
  await openSettings();
  await scrollTo('[data-phone-theme] [data-seg="dark"]');
  await tap('[data-phone-theme] [data-seg="dark"]', 900);
  await tap('[aria-label="Back"]', 1400);
  await P.finger.tap(tab('Today'), 1400);
  const bg = await P.js(`getComputedStyle(document.querySelector('[data-now-card]')).backgroundColor`);
  check('dark: the Now card is dark', /\(\s*([0-6]?\d),\s*([0-6]?\d),\s*([0-6]?\d)/.test(bg), bg);
  check('dark: no slab shapes (a dark shape reads as a smudge)', (await P.js(`document.querySelectorAll('[data-slab-shape]').length`)) === 0);
  check('dark: the bubbles keep the label edge (Gym sage)', (await P.js(`getComputedStyle([...document.querySelectorAll('[data-bubble]')][2].firstElementChild ? [...document.querySelectorAll('[data-bubble]')][2] : document.body).borderTopColor`)) === rgb(SAGE));
  check('dark: no ❗ anywhere', await noMark());
  await shot('phone-p27-dark');
  await scrollTo('[data-anytime-card="Buy stamps"]');
  await C.sleep(400);
  await shot('phone-p27-dark-anytime');

  console.log(summary());
  app.exit(0);
}
