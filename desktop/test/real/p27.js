'use strict';
// Real check for 3.6.0: a task during a break (lib/hosting.ts). Real mouse input into the real app on an
// isolated data folder; Supabase is the in process fake (signed out, nothing leaves the machine).
// Today has four breaks (tasks with Split on): 20 minutes with one and with three tasks inside it, and
// 60 minutes with one and with three. Each hosted task is a chip in its break's block (no block of its
// own, no lane beside it), with no text overlapping, in the Timebox and the Calendar, light and dark.
// Then: the tooltip lists everything, a chip opens its task, its dot ticks it, the task is still a card
// in Tasks, a drag onto a break starts the task inside it, a longer one is refused ("Longer than the
// break") and drops as before, and the ⋮ menu's "Do during a break" puts a task inside the chosen break.
// BELIFIC_SHOTS: a folder for screenshots.
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
  const TODAY = day(0);
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, dueDate: TODAY, ...extra });
  const B = (id, title, start, len) => T(id, title, { startTime: start, durationMinutes: len, cutsBelow: true });
  const at = (id, title, start, len, extra = {}) => T(id, title, { startTime: start, durationMinutes: len, ...extra });
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      B('tea1', 'Tea break', '09:00', 20),
      at('stretch', 'Stretch the back and the shoulders properly', '09:05', 10, { projectKey: 'work' }),
      B('tea3', 'Coffee', '10:00', 20),
      at('w1', 'Water the plants', '10:00', 5),
      at('w2', 'Check the post', '10:05', 5, { projectKey: 'work' }),
      at('w3', 'Text Mum', '10:10', 10),
      B('lunch1', 'Lunch', '12:00', 60),
      at('pod', 'Listen to a podcast episode', '12:10', 30, { projectKey: 'work' }),
      B('lunch3', 'Long lunch', '14:00', 60),
      at('e1', 'Reply to Sam', '14:00', 15),
      at('e2', 'Call the bank', '14:15', 20, { projectKey: 'work' }),
      at('e3', 'Read a chapter', '14:30', 25),
      // Partly over Long lunch: Split cuts it as before (one piece, 15:00 to 15:30).
      at('part', 'Partly over', '14:50', 40),
      // For the drags: a break of its own (the four above stay as seeded), one task that fits it, one longer.
      B('nap', 'Nap', '16:00', 60),
      at('fits', 'Fits in the nap', '18:00', 30),
      at('long', 'Too long task', '19:30', 90),
      // For the menu: 25 minutes, no time.
      T('plain', 'Plan the week', { durationMinutes: 25 }),
    ]),
  );
  fs.writeFileSync(path.join(dataDir, 'belific_projects.kv'), JSON.stringify([{ key: 'work', name: 'Work', colorKey: 'sky', createdAt: stamp, updatedAt: stamp }]));
  fs.writeFileSync(path.join(dataDir, 'belific_desktop_panes.kv'), JSON.stringify({ leftCollapsed: false, rightCollapsed: false, center: 'kanban', calendar: 'day' }));

  const read = readKv(dataDir);
  const tasks = () => read('belific_tasks') || [];
  const byId = (id) => tasks().find((t) => t.id === id);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1440, 900);
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await I.waitBody('Plan the week', 20000);
  await I.click(`document.querySelector('[aria-label="Show Tasks"]')`, 600);
  await C.sleep(1200);
  if (process.env.P27_DEBUG) {
    await I.shot('p27-00-start');
    console.log('DEBUG', JSON.stringify(await I.js(`[...document.querySelectorAll('[data-block-id]')].map((b) => [b.getAttribute('data-block-id'), Math.round(b.getBoundingClientRect().width), Math.round(b.getBoundingClientRect().height)])`)));
    console.log('DEBUG', JSON.stringify(await I.js(`[...document.querySelectorAll('[aria-label]')].map((b) => b.getAttribute('aria-label')).filter((l) => /Timebox|Show|Hide/.test(l))`)));
  }

  // `sel` is a block: Timebox [data-block-id="id"], Calendar [data-cal-block$="id"].
  // The first visible match (a hidden pane may hold the same element).
  const V = (sel) => `[...document.querySelectorAll('${sel}')].find((e) => e.getBoundingClientRect().width > 0)`;
  const tbSel = (id) => `[data-block-id="${id}"]`;
  const calSel = (id) => `[data-cal-block$=":${id}"]`;
  const scrollTo = (sel) => I.js(`(() => { const b = ${V(sel)}; if (b) b.scrollIntoView({ block: 'center' }); return !!b; })()`);
  // Everything inside a break's block: its rect, the title, the time, each chip and the "+N".
  const layoutOf = (sel) =>
    I.js(`(() => {
      const b = ${V(sel)};
      if (!b) return null;
      const r = (e) => { const x = e.getBoundingClientRect(); return { l: x.left, t: x.top, r: x.right, b: x.bottom, w: x.width, h: x.height }; };
      const parts = [];
      const title = b.querySelector('[data-host-title]');
      if (title) parts.push({ k: 'title', ...r(title), text: title.innerText });
      for (const c of b.querySelectorAll('[data-host-chip]')) parts.push({ k: 'chip', id: c.getAttribute('data-host-chip'), ...r(c), text: c.innerText, overflow: c.scrollWidth > c.clientWidth + 1 });
      const more = b.querySelector('[data-host-more]');
      if (more) parts.push({ k: 'more', n: more.getAttribute('data-host-more'), ...r(more) });
      const row = b.querySelector('[data-host-row]');
      for (const t of row ? row.querySelectorAll(':scope > div[dir="auto"]:not([data-host-title])') : []) parts.push({ k: 'time', ...r(t), text: t.innerText });
      return { block: r(b), mode: row && row.getAttribute('data-host-row'), count: b.getAttribute('data-host-count'), tip: b.getAttribute('title') || '', parts };
    })()`);
  const overlaps = (L) => {
    const bad = [];
    const vis = L.parts.filter((p) => p.w > 0.5 && p.h > 0.5);
    for (let i = 0; i < vis.length; i++) {
      const a = vis[i];
      if (a.l < L.block.l - 0.5 || a.r > L.block.r + 0.5 || a.t < L.block.t - 0.5 || a.b > L.block.b + 0.5) bad.push(`${a.k} outside the block`);
      for (let j = i + 1; j < vis.length; j++) {
        const b = vis[j];
        const ix = Math.min(a.r, b.r) - Math.max(a.l, b.l);
        const iy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
        if (ix > 0.5 && iy > 0.5) bad.push(`${a.k}/${b.k}`);
      }
    }
    return bad;
  };
  const chipsOf = (L) => L.parts.filter((p) => p.k === 'chip');
  const moreOf = (L) => (L.parts.find((p) => p.k === 'more') || {}).n || '0';

  // The four breaks, in one place (`where` names the view and the theme).
  // `four`: after the menu put Plan the week in Long lunch too.
  const checkBreaks = async (where, sel, { narrow = false, four = false } = {}) => {
    const expect = {
      tea1: { mode: 'inline', chips: narrow ? 0 : 1, more: narrow ? '1' : '0', titles: ['Stretch'] },
      tea3: { mode: 'inline', chips: narrow ? 0 : 1, more: narrow ? '3' : '2', titles: ['Water the plants', 'Check the post', 'Text Mum'] },
      lunch1: { mode: 'stack', chips: 1, more: '0', titles: ['Listen to a podcast'] },
      lunch3: { mode: 'stack', chips: 2, more: four ? '2' : '1', titles: ['Reply to Sam', 'Call the bank', 'Read a chapter', ...(four ? ['Plan the week'] : [])] },
    };
    for (const [id, e] of Object.entries(expect)) {
      await scrollTo(sel(id));
      await C.sleep(250);
      const L = await layoutOf(sel(id));
      if (!L) {
        check(`${where}: ${id} is drawn`, false);
        continue;
      }
      check(`${where}: ${id} hosts ${e.titles.length} (${e.mode}: ${e.chips} chip${e.chips === 1 ? '' : 's'}, +${e.more})`, L.mode === e.mode && L.count === String(e.titles.length) && chipsOf(L).length === e.chips && moreOf(L) === e.more, JSON.stringify({ mode: L.mode, count: L.count, chips: chipsOf(L).map((c) => c.text), more: moreOf(L), w: L.block.w, h: L.block.h }));
      const bad = overlaps(L);
      check(`${where}: ${id} has no text overlapping, all inside its block`, bad.length === 0, bad.join(', ') + ' ' + JSON.stringify(L.parts));
      check(`${where}: ${id}'s tooltip lists everything during it`, e.titles.every((t) => L.tip.includes(t)), L.tip);
    }
  };
  const ownBlocks = (sel) => I.js(`['stretch','w1','w2','w3','pod','e1','e2','e3'].filter((id) => [...document.querySelectorAll('${sel('ID')}'.replace('ID', id))].some((e) => e.getBoundingClientRect().width > 0))`);

  // ======== Timebox, light ========
  check('Timebox: no hosted task has a block of its own', (await ownBlocks(tbSel)).length === 0, JSON.stringify(await ownBlocks(tbSel)));
  await checkBreaks('Timebox light', tbSel);
  const part = await I.js(`[...document.querySelectorAll('[data-block-task="part"]')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.getAttribute('data-piece') + '/' + b.getAttribute('data-piece-count'))`);
  check('a task only partly over a break is still cut by Split as before', JSON.stringify(part) === '["1/1"]', JSON.stringify(part));
  await scrollTo(tbSel('tea3'));
  await I.shot('p27-01-timebox-light-20min');
  await scrollTo(tbSel('lunch3'));
  await I.shot('p27-02-timebox-light-60min');
  check('the hosted tasks are still cards in Tasks', await I.exists(`document.querySelector('[data-day-col="${TODAY}"] [aria-label="Task Stretch the back and the shoulders properly"]')`) && (await I.exists(`document.querySelector('[data-day-col="${TODAY}"] [aria-label="Task Reply to Sam"]')`)));

  // A chip opens its task; its dot ticks it.
  await scrollTo(tbSel('lunch1'));
  await I.click(`${V(`${tbSel('lunch1')} [data-host-chip="task:pod"]`)}`, 800);
  const detail = await I.js(`[...document.querySelectorAll('[data-detail-panel] input, [data-detail-panel] textarea')].map((e) => e.value).join('|')`);
  check('clicking a chip opens that task', detail.includes('Listen to a podcast episode'), detail.slice(0, 120));
  await I.key('Escape', [], 600);
  if (await I.exists(`document.querySelector('[data-detail-panel]')`)) await I.click(`document.querySelector('[aria-label="Close the task details"]')`, 600);
  await I.click(`${V(`${tbSel('lunch1')} [data-host-tick="task:pod"]`)}`, 900);
  check('ticking the chip ticks the task (and only it)', byId('pod').completed === true && !byId('lunch1').completed, JSON.stringify([byId('pod').completed, byId('lunch1').completed]));
  check('with Show complete off the ticked task leaves the break, as a ticked block leaves the grid', !(await I.exists(V(`${tbSel('lunch1')} [data-host-chip="task:pod"]`))));
  await I.click(V('[aria-label="Filter"]'), 500);
  await I.click(V('[aria-label="Show complete"]'), 700);
  await I.key('Escape', [], 400);
  check('with Show complete on it is back in its break, ticked', (await I.js(`(${V(`${tbSel('lunch1')} [data-host-tick="task:pod"]`)} || {}).getAttribute?.('aria-checked')`)) === 'true');
  await I.click(`${V(`${tbSel('lunch1')} [data-host-tick="task:pod"]`)}`, 900);
  check('ticking again reopens it', byId('pod').completed === false);

  // ======== Drag onto a break ========
  const dragBlockTo = async (id, toSel, fracY, { release = true } = {}) => {
    await scrollTo(tbSel(id));
    await C.sleep(400);
    const a = await I.js(`(() => { const r = ${V(tbSel(id))}.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 6) }; })()`);
    // Bring the target into view by wheel while holding: simpler to scroll the pane so both are visible.
    win.webContents.sendInputEvent({ type: 'mouseMove', x: a.x, y: a.y });
    await C.sleep(80);
    win.webContents.sendInputEvent({ type: 'mouseDown', x: a.x, y: a.y, button: 'left', clickCount: 1 });
    win.webContents.sendInputEvent({ type: 'mouseMove', x: a.x, y: a.y + 12, modifiers: ['leftButtonDown'] });
    await C.sleep(100);
    await I.js(`${V(toSel)}.scrollIntoView({ block: 'center' })`);
    await C.sleep(400);
    const b = await I.js(`(() => { const r = ${V(toSel)}.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height * ${fracY}) }; })()`);
    for (let i = 1; i <= 10; i++) {
      win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(a.x + ((b.x - a.x) * i) / 10), y: Math.round(b.y - 30 + (30 * i) / 10), modifiers: ['leftButtonDown'] });
      await C.sleep(30);
    }
    await C.sleep(300);
    const hint = await I.textOf(`document.querySelector('[data-lifted-card]')`);
    if (release) {
      win.webContents.sendInputEvent({ type: 'mouseUp', x: b.x, y: b.y, button: 'left', clickCount: 1 });
      await C.sleep(900);
    }
    return hint;
  };
  const hint2 = await dragBlockTo('long', tbSel('nap'), 0.5);
  check('a task longer than the break is refused: "Longer than the break"', /Longer than the break/.test(hint2), hint2);
  const long = byId('long');
  check('and it drops as before (a time on the grid, not hosted; the break splits it as before)', long.startTime && long.startTime !== '19:30' && (await I.exists(V('[data-block-task="long"]'))) && (await I.exists(V(`${tbSel('nap')}:not([data-host-count])`))), JSON.stringify(long));
  const hint1 = await dragBlockTo('fits', tbSel('nap'), 0.6);
  check('over a break the lifted card says it goes inside it', /During Nap/.test(hint1), hint1);
  const fits = byId('fits');
  check('dropped on the Nap it starts inside it (the dropped slot, it fits) and keeps its length', fits.startTime >= '16:00' && fits.startTime <= '16:30' && fits.durationMinutes === 30 && fits.dueDate === TODAY, JSON.stringify(fits));
  check('it is now a chip of the Nap, not a block', !(await I.exists(V(tbSel('fits')))) && (await I.exists(V(`${tbSel('nap')}[data-host-count="1"] [data-host-chip="task:fits"]`))));
  await I.shot('p27-03-dragged-in');
  // The break moved two hours later: the task no longer fits inside it and is a block again at once.
  await scrollTo(tbSel('nap'));
  await C.sleep(400);
  const n0 = await I.js(`(() => { const r = ${V(tbSel('nap'))}.getBoundingClientRect(); return { x: Math.round(r.left + 30), y: Math.round(r.top + 8) }; })()`);
  win.webContents.sendInputEvent({ type: 'mouseMove', x: n0.x, y: n0.y });
  await C.sleep(80);
  win.webContents.sendInputEvent({ type: 'mouseDown', x: n0.x, y: n0.y, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 10; i++) {
    win.webContents.sendInputEvent({ type: 'mouseMove', x: n0.x, y: n0.y + Math.round((112 * i) / 10), modifiers: ['leftButtonDown'] });
    await C.sleep(30);
  }
  await C.sleep(250);
  win.webContents.sendInputEvent({ type: 'mouseUp', x: n0.x, y: n0.y + 112, button: 'left', clickCount: 1 });
  await C.sleep(900);
  check('the Nap moved to 18:00', byId('nap').startTime === '18:00', JSON.stringify(byId('nap')));
  check('moved out of the break, the task is a block again', await I.exists(V(tbSel('fits'))), JSON.stringify(byId('fits')));
  await I.shot('p27-03-dragged');

  // ======== The ⋮ menu: Do during a break ========
  await I.click(V(`[data-day-col="${TODAY}"] [aria-label="More actions for Plan the week"]`), 700);
  const menu = await I.textOf(`document.querySelector('[data-popover]')`);
  check('the ⋮ menu offers Do during a break', menu.includes('Do during a break'), menu);
  await I.click(`document.querySelector('[data-popover] [aria-label="Do during a break"]')`, 900);
  const pick = await I.textOf(`document.querySelector('[data-popover]')`);
  check('it lists today\'s breaks long enough for 25 minutes (Lunch, Long lunch)', pick.includes('Lunch') && pick.includes('Long lunch') && !/Tea break\n/.test(pick.split('Longer than the break')[0]), pick);
  check('and says the shorter ones are shorter than the task', /Longer than the break: .*Tea break/.test(pick) && /Coffee/.test(pick), pick);
  await I.shot('p27-04-menu');
  await I.click(`document.querySelector('[data-popover] [aria-label^="Do during Long lunch"]')`, 900);
  const plain = byId('plain');
  check('choosing Long lunch puts the task at its start, today', plain.startTime === '14:00' && plain.dueDate === TODAY, JSON.stringify(plain));
  await scrollTo(tbSel('lunch3'));
  check('and it is hosted by Long lunch (now four)', (await I.js(`(${V(tbSel('lunch3'))} || {}).getAttribute?.('data-host-count')`)) === '4');

  // ======== Calendar (day), light ========
  await I.click(`document.querySelector('[aria-label="Show the Calendar"]') || document.querySelector('[aria-label="Show Calendar"]')`, 1200);
  await C.waitFor(() => I.exists(V(calSel('lunch1'))), 6000).catch(() => {});
  const calEx = await I.js(`['stretch','w1','w2','w3','pod','e1','e2','e3'].filter((id) => [...document.querySelectorAll('[data-cal-block$=":' + id + '"]')].some((e) => e.getBoundingClientRect().width > 0))`);
  check('Calendar: no hosted task has a block of its own', calEx.length === 0, JSON.stringify(calEx));
  const lunch3Cal = await layoutOf(calSel('lunch3'));
  check('Calendar: Long lunch hosts four now (2 chips, +2), nothing overlapping', !!lunch3Cal && lunch3Cal.count === '4' && chipsOf(lunch3Cal).length === 2 && moreOf(lunch3Cal) === '2' && overlaps(lunch3Cal).length === 0, JSON.stringify(lunch3Cal && { c: lunch3Cal.count, chips: chipsOf(lunch3Cal).length, more: moreOf(lunch3Cal), bad: overlaps(lunch3Cal) }));
  for (const id of ['tea1', 'tea3', 'lunch1']) {
    await scrollTo(calSel(id));
    const L = await layoutOf(calSel(id));
    check(`Calendar light: ${id} has chips or +N and nothing overlapping`, !!L && (chipsOf(L).length > 0 || moreOf(L) !== '0') && overlaps(L).length === 0, JSON.stringify(L && { mode: L.mode, chips: chipsOf(L).length, more: moreOf(L), bad: overlaps(L) }));
  }
  await scrollTo(calSel('tea3'));
  await I.shot('p27-05-calendar-light-20min');
  await scrollTo(calSel('lunch3'));
  await I.shot('p27-06-calendar-light-60min');
  // The week: narrow columns, one line breaks show only "+N".
  await I.click(`document.querySelector('[aria-label="Week view"]') || [...document.querySelectorAll('[role="button"]')].find((b) => b.innerText === 'Week')`, 1200);
  await C.waitFor(() => I.exists(V(calSel('tea3'))), 6000).catch(() => {});
  await scrollTo(calSel('tea3'));
  const weekTea = await layoutOf(calSel('tea3'));
  check('Calendar week (narrow): a 20 minute break shows "+3" instead of a chip, nothing overlapping', !!weekTea && (weekTea.block.w < 150 ? chipsOf(weekTea).length === 0 && moreOf(weekTea) === '3' : chipsOf(weekTea).length === 1) && overlaps(weekTea).length === 0, JSON.stringify(weekTea && { w: weekTea.block.w, chips: chipsOf(weekTea).length, more: moreOf(weekTea) }));
  await I.shot('p27-07-calendar-week-light');
  await I.click(`document.querySelector('[aria-label="Day view"]') || [...document.querySelectorAll('[role="button"]')].find((b) => b.innerText === 'Day')`, 1000);

  // ======== Dark ========
  await I.click(`document.querySelector('[aria-label="Profile and account"]') || document.querySelector('[aria-label="Profile, not signed in"]')`, 500);
  await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 800);
  await I.click(`document.querySelector('[data-theme-setting] [data-theme-mode="dark"]')`, 900);
  if (await I.exists(I.byLabel('Back'))) await I.click(I.byLabel('Back'), 700);
  check('the dark theme is on', (await I.js(`document.documentElement.getAttribute('data-theme')`)) === 'dark');
  await I.click(`document.querySelector('[aria-label="Show Tasks"]')`, 900);
  await checkBreaks('Timebox dark', tbSel, { four: true });
  const chipColors = await I.js(`(() => { const c = ${V('[data-host-chip]')}; const t = c.querySelector('div[dir="auto"]'); return { bg: getComputedStyle(c).backgroundColor, fg: getComputedStyle(t).color }; })()`);
  check('dark: the chip is light with dark text', chipColors.bg === 'rgb(236, 236, 236)' && chipColors.fg === 'rgb(18, 18, 18)', JSON.stringify(chipColors));
  await scrollTo(tbSel('tea3'));
  await I.shot('p27-08-timebox-dark-20min');
  await scrollTo(tbSel('lunch3'));
  await I.shot('p27-09-timebox-dark-60min');
  await I.click(`document.querySelector('[aria-label="Show the Calendar"]') || document.querySelector('[aria-label="Show Calendar"]')`, 1200);
  await C.waitFor(() => I.exists(V(calSel('lunch1'))), 6000).catch(() => {});
  await checkBreaks('Calendar dark', calSel, { four: true });
  await scrollTo(calSel('tea3'));
  await I.shot('p27-10-calendar-dark-20min');
  await scrollTo(calSel('lunch3'));
  await I.shot('p27-11-calendar-dark-60min');

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
