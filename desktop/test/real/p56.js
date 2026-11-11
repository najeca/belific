'use strict';
// @real-input: quiet
// Real check for F1 of PLAN_daily_flow (3.40.0): the Plan button, the Free time line setting and the list on cards.
//   - the top bar has a Plan button next to the avatar: "Plan my day" before 14:00 (from 04:00), "Wrap up" after; its small
//     chevron menu lists both; a press opens that flow (Wrap up is the old Shut down my day, titled "Wrap up");
//   - an "Analytics" text button sits beside it; the avatar menu has no Plan my day, Shut down my day, Wrap up or Analytics;
//   - on a narrow window (1000 px), or when the three panes squeeze the centre (1440 px), Analytics moves into the Plan
//     menu and the avatar is never clipped;
//   - the "Free time" line at the foot of a day is off by default (the gap on the Calendar stays); Settings has a switch
//     that turns it on, saved as the user setting board.free_time_line;
//   - a card on the board shows its list (emoji and name) on line 1 with a dot in the label's colour; no label name.
// Runs quiet.
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
  const dk = dayKeyFrom(new Date());
  const today = dk(0);
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, dueDate: today, ...extra });
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      T('boot', 'Boot Camp', { startTime: '09:00', durationMinutes: 240 }),
      T('tea', 'Tea', { startTime: '15:00', durationMinutes: 30, cutsBelow: true }),
      T('card', 'Games night', { listKey: 'lg', projectKey: 'pw', durationMinutes: 30 }),
      T('plain', 'Plain task'),
    ]),
  );
  fs.writeFileSync(path.join(dataDir, 'belific_lists.kv'), JSON.stringify([{ key: 'lg', name: 'Games', emoji: '🎲', sortOrder: 0, createdAt: stamp, updatedAt: stamp }]));
  fs.writeFileSync(path.join(dataDir, 'belific_projects.kv'), JSON.stringify([{ key: 'pw', name: 'Work', colorKey: 'sage', emoji: '💼', createdAt: stamp, updatedAt: stamp }]));
  const read = readKv(dataDir);
  const setting = (key) => (read('belific_user_settings') || []).find((s) => s.key === key && !s.deletedAt);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  // 1920 wide: the centre pane has room for Analytics beside the Plan button (at 1440 with all three panes it does not).
  win.setSize(1920, 1000);
  win.show();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await I.waitBody('Games night', 20000);
  await I.click(I.byLabel('Show Tasks'), 900).catch(() => {});
  await C.sleep(700);

  const hour = new Date().getHours();
  const flow = hour >= 4 && hour < 14 ? 'planning' : 'shutdown';
  const word = flow === 'planning' ? 'Plan my day' : 'Wrap up';
  const other = flow === 'planning' ? 'Wrap up' : 'Plan my day';
  const profileIcon = async () => ((await I.exists(I.byLabel('Profile and account'))) ? 'Profile and account' : 'Profile, not signed in');
  const profileHas = async (label) => {
    await I.click(I.byLabel(await profileIcon()), 500);
    const has = await I.exists(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="${label}"]')`);
    await I.key('Escape', [], 300);
    return has;
  };

  // ---- the Plan button ----
  const btn = await I.js(`(() => { const b = document.querySelector('[data-plan-button]'); const a = document.querySelector('[data-analytics-button]'); const ch = document.querySelector('[data-plan-menu]'); if (!b) return null; const fs = (e) => { const t = [...e.querySelectorAll('*')].concat([e]).find((x) => [...x.childNodes].some((n) => n.nodeType === 3 && /^[A-Za-z ]+$/.test(n.textContent.trim()))); return parseFloat(getComputedStyle(t).fontSize); }; return { flow: b.getAttribute('data-plan-button'), text: b.innerText.replace(/\\s+/g, ' ').trim(), analytics: a ? a.innerText.trim() : null, chevron: !!ch, size: fs(b), asize: a ? fs(a) : null }; })()`);
  check(`the Plan button reads "${word}" at this time of day, with a chevron menu and a text "Analytics" button beside it`, !!btn && btn.flow === flow && btn.text.endsWith(word) && btn.chevron && btn.analytics === 'Analytics', JSON.stringify(btn));
  check('its text is at least 14 px', !!btn && btn.size >= 14 && btn.asize >= 14, JSON.stringify(btn));
  await I.shot('p56-plan-button');
  await I.click(`document.querySelector('[data-plan-menu]')`, 600);
  const menu = await I.textOf(`document.querySelector('[data-popover="plan-menu"]')`);
  check('the menu lists both, Plan my day and Wrap up, and no Analytics (the window is wide)', menu.includes('Plan my day') && menu.includes('Wrap up') && !menu.includes('Analytics'), menu);
  await I.click(`document.querySelector('[data-popover] [aria-label="${other} from the menu"]')`, 900);
  const otherSteps = flow === 'planning' ? 'Step 1 of 2' : 'Step 1 of 4';
  const body = await I.body();
  check(`the other one is one press away: ${other} opens (${otherSteps})`, (await I.exists(`document.querySelector('[data-flow]')`)) && body.includes(otherSteps) && (other !== 'Wrap up' || body.includes('Wrap up')), body.slice(0, 120));
  check('Wrap up is not called "Daily Shutdown" or "Shut down"', !/Daily Shutdown|Shut down/.test(body));
  await I.shot('p56-flow');
  await I.key('Escape', [], 700);
  await I.click(`document.querySelector('[data-plan-button]')`, 900);
  const own = await I.body();
  check(`a press on the button opens ${word}`, (await I.exists(`document.querySelector('[data-flow="${flow}"]')`)) && (flow === 'planning' ? own.includes('Step 1 of 4') : own.includes('Wrap up')), own.slice(0, 100));
  await I.key('Escape', [], 700);

  // ---- the avatar menu ----
  check('the avatar menu has no Plan my day, Shut down my day, Wrap up or Analytics', !(await profileHas('Plan my day')) && !(await profileHas('Shut down my day')) && !(await profileHas('Wrap up')) && !(await profileHas('Analytics')));
  // 3.41.0 (F2, changed on purpose): the avatar menu is only the account and Settings; Trash and Quick capture are links in Settings.
  check('and still has Settings (Trash and Quick capture are in Settings since 3.41.0)', (await profileHas('Settings')) && !(await profileHas('Trash')) && !(await profileHas('Quick capture')));

  // ---- Analytics from its button ----
  await I.click(`document.querySelector('[data-analytics-button]')`, 900);
  check('the Analytics button opens Analytics', (await I.body()).includes('Completed tasks') || (await I.exists(I.byLabel('Range Last 7 days'))));
  await I.click(I.byLabel('Back'), 800);

  // ---- a narrow window: Analytics moves into the Plan menu ----
  win.setSize(1000, 800);
  await C.sleep(900);
  const narrow = await I.js(`!!document.querySelector('[data-plan-button]') && !document.querySelector('[data-analytics-button]')`);
  await I.click(`document.querySelector('[data-plan-menu]')`, 600);
  const nmenu = await I.textOf(`document.querySelector('[data-popover="plan-menu"]')`);
  check('under 1100 px the Analytics button is gone and the Plan menu has Analytics', narrow && nmenu.includes('Analytics'), JSON.stringify([narrow, nmenu]));
  await I.click(`document.querySelector('[data-popover] [aria-label="Analytics from the menu"]')`, 900);
  check('and it opens Analytics from there', (await I.body()).includes('Completed tasks') || (await I.exists(I.byLabel('Range Last 7 days'))));
  await I.click(I.byLabel('Back'), 800);
  win.setSize(1440, 900);
  await C.sleep(1000);
  const squeezed = await I.js(`(() => { const a = document.querySelector('[data-analytics-button]'); const av = [...document.querySelectorAll('[aria-label="Profile and account"], [aria-label="Profile, not signed in"]')].find((e) => e.getBoundingClientRect().width > 0); const pane = document.querySelector('[data-pane="center"]'); const r = av && av.getBoundingClientRect(); const pr = pane && pane.getBoundingClientRect(); return { analytics: !!a, avatarInside: !!r && !!pr && r.right <= pr.right + 1 && r.right <= window.innerWidth }; })()`);
  await I.click(`document.querySelector('[data-plan-menu]')`, 600);
  const smenu = await I.textOf(`document.querySelector('[data-popover="plan-menu"]')`);
  await I.key('Escape', [], 300);
  check('1440 px with all three panes: the centre is squeezed, so Analytics is in the Plan menu and the avatar is fully visible', !squeezed.analytics && squeezed.avatarInside && smenu.includes('Analytics'), JSON.stringify([squeezed, smenu]));
  await I.shot('p56-1440');

  // ---- the list on the card ----
  const cardMeta = await I.js(`(() => { const c = [...document.querySelectorAll('[data-day-col="${today}"] [data-task-card="card"]')][0]; if (!c) return null; const m = c.querySelector('[data-card-meta-line="1"]'); const e = m.querySelector('[data-card-list-emoji]'); const n = m.querySelector('[data-card-list-name]'); const l = m.querySelector('[data-card-label]'); const d = l && l.firstElementChild; return { emoji: e && e.textContent, name: n && n.textContent, size: n && parseFloat(getComputedStyle(n).fontSize), labelText: l ? l.textContent : null, dot: d ? getComputedStyle(d).backgroundColor : null, band: !!c.querySelector('[data-card-band="sage"]'), text: m.innerText.replace(/\\s+/g, ' ').trim() }; })()`);
  check('a card shows its list: the emoji and "Games", at least 14 px, and not the label name "Work"', !!cardMeta && cardMeta.emoji === '🎲' && cardMeta.name === 'Games' && cardMeta.size >= 14 && !/Work/.test(cardMeta.text), JSON.stringify(cardMeta));
  check('the dot and the band keep the label colour (sage)', !!cardMeta && cardMeta.dot === 'rgb(111, 143, 126)' && cardMeta.band && cardMeta.labelText === '', JSON.stringify(cardMeta));
  const plain = await I.js(`(() => { const c = document.querySelector('[data-day-col="${today}"] [data-task-card="plain"]'); const n = c && c.querySelector('[data-card-list-name]'); return n ? n.textContent : null; })()`);
  check('a task in Brain Dump shows "Brain Dump"', plain === 'Brain Dump', String(plain));
  await I.shot('p56-card');

  // ---- the Free time line is off by default; the gap stays ----
  check('the Free time line is not at the foot of the day (off by default)', !(await I.exists(`document.querySelector('[data-day-col="${today}"] [data-break-line]')`)));
  await I.click(I.byLabel('Show the Calendar'), 900).catch(() => {});
  await I.key('d');
  await C.sleep(900);
  check('the Calendar still shows the break as a gap', await I.exists(`document.querySelector('[data-cal-block="cal${today}:tea"][data-gap]')`));
  await I.click(I.byLabel('Show Tasks'), 800).catch(() => {});
  await C.sleep(500);
  await I.click(I.byLabel(await profileIcon()), 500);
  await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 700);
  await I.waitBody('POWER FEATURES', 8000);
  const sw = await I.js(`(() => { const s = document.querySelector('[data-free-time-setting] [role="switch"]'); return s ? [s.getAttribute('aria-checked') || String(s.checked), s.closest('[data-free-time-setting]').innerText] : null; })()`);
  check('Settings has "Show free time at the foot of each day", off', !!sw && sw[0] === 'false' && sw[1].includes('Show free time at the foot of each day'), JSON.stringify(sw));
  await I.click(`document.querySelector('[data-free-time-setting] [role="switch"]')`, 800);
  await C.waitFor(() => !!setting('board.free_time_line') && setting('board.free_time_line').value === 'true', 6000).catch(() => {});
  check('turning it on is saved as the user setting board.free_time_line = true', !!setting('board.free_time_line') && setting('board.free_time_line').value === 'true', JSON.stringify(setting('board.free_time_line')));
  await I.click(I.byLabel('Back'), 900);
  await C.sleep(700);
  const line = await I.js(`(() => { const l = document.querySelector('[data-day-col="${today}"] [data-break-line]'); return l ? l.innerText : null; })()`);
  check('the line is back: "☕ Free time · 30m"', line === '☕ Free time · 30m', String(line));

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
