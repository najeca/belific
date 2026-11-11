'use strict';
// @real-input: quiet
// Real check for 3.6.0: a task during a break (lib/hosting.ts). Real input into the real app on an isolated data
// folder; Supabase is the in process fake (signed out, nothing leaves the machine).
// Today has five breaks (tasks with Split on): 20 minutes with one and with three tasks inside it, 60 minutes with one
// and with three, and a Nap for the drags. 3.35.0 (PLAN_breaks_as_gaps), rewritten for gaps: each break is a gap and
// each task inside it a block in the gap at its real time and size (no chip, no "+N"), nothing overlapping, in the
// Timebox and the Calendar (day and week), light and dark. Then: a block in a gap opens its task, the task is still a
// card in Tasks, a drag onto a break starts the task inside it, a longer one is refused ("Longer than the break"), a
// break moved away lets its task go, and the ⋮ menu's "Do during a break" puts a task inside the chosen break.
// Drags are events dispatched in the page, so it runs quiet.
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
      // P1 of PLAN_breaks_as_gaps: a Break with no time keeps its card, with no tick box.
      T('freebrk', 'Quiet break', { durationMinutes: 15, cutsBelow: true }),
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
  const TB = '[data-timebox-grid]';
  const COL = `[data-cal-col="${TODAY}"]`;
  const inGap = (root, title) => I.js(`(() => { const r = ${V(root)}; return r ? [...r.querySelectorAll('[data-in-gap="${title}"]')].map((e) => e.getAttribute('data-block-task')) : null; })()`);

  // 3.34.0 (PLAN_breaks_as_gaps P2), changed on purpose: a break is a gap (hatched, dashed outline, no text, its name
  // and length on hover) and each task inside it is a block in the gap at its real time and size (data-in-gap), not a
  // chip. Two that overlap share the gap in lanes; nothing overlaps, nothing sticks out of its gap.
  const gapCheck = async (where, root, { four = false } = {}) => {
    const expect = [
      ['tea1', 'Tea break', ['stretch']],
      ['tea3', 'Coffee', ['w1', 'w2', 'w3']],
      ['lunch1', 'Lunch', ['pod']],
      ['lunch3', 'Long lunch', ['e1', 'e2', 'e3', ...(four ? ['plain'] : [])]],
    ];
    for (const [brk, title, guests] of expect) {
      await I.js(`(() => { const g = ${V(`${root} [data-gap="${brk}"]`)}; if (g) g.scrollIntoView({ block: 'center' }); })()`);
      await C.sleep(250);
      const L = await I.js(`(() => {
        const root = ${V(root)};
        const g = root && root.querySelector('[data-gap="${brk}"]');
        if (!g) return null;
        const R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; };
        const blocks = ${JSON.stringify(guests)}.map((id) => {
          const b = [...root.querySelectorAll('[data-in-gap]')].find((e) => e.getAttribute('data-block-task') === id);
          return b ? { id, inGap: b.getAttribute('data-in-gap'), ...R(b.parentElement.parentElement) } : { id, missing: true };
        });
        const cs = getComputedStyle(g);
        return { gap: R(g), blocks, tip: g.getAttribute('title') || '', text: g.innerText.trim(), hatch: cs.backgroundImage, border: cs.borderTopStyle };
      })()`);
      if (!L) {
        check(`${where}: ${brk} is drawn as a gap`, false);
        continue;
      }
      check(`${where}: ${brk} is a gap (hatched, dashed, no text, "${title} · …" on hover)`, /repeating-linear-gradient/.test(L.hatch) && L.border === 'dashed' && L.text === '' && L.tip.startsWith(`${title} · `), JSON.stringify({ tip: L.tip, text: L.text, border: L.border }));
      check(`${where}: ${brk} holds ${guests.length} task block(s), each in it`, L.blocks.every((b) => !b.missing && b.inGap === title), JSON.stringify(L.blocks));
      const g = L.gap;
      const outside = L.blocks.filter((b) => !b.missing && (b.t < g.t - 1 || b.b > g.b + 1 || b.l < g.l - 1 || b.r > g.r + 3)).map((b) => b.id);
      const over = [];
      const bs = L.blocks.filter((b) => !b.missing);
      for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i], c = bs[j];
        if (Math.min(a.r, c.r) - Math.max(a.l, c.l) > 1 && Math.min(a.b, c.b) - Math.max(a.t, c.t) > 1) over.push(`${a.id}/${c.id}`);
      }
      check(`${where}: ${brk}'s blocks stay inside it and do not overlap`, outside.length === 0 && over.length === 0, JSON.stringify({ outside, over, gap: g, blocks: L.blocks }));
    }
  };

  // ======== Timebox, light ========
  check('Timebox: no break is a block, no chip, no ☕', !(await I.exists(`document.querySelector('${TB} [data-host-chip], ${TB} [data-break-cup], ${TB} [data-host-count]')`)));
  await gapCheck('Timebox light', TB);
  const part = await I.js(`[...document.querySelectorAll('[data-block-task="part"]')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.getAttribute('data-piece') + '/' + b.getAttribute('data-piece-count'))`);
  check('a task only partly over a break is still cut by Split as before', JSON.stringify(part) === '["1/1"]', JSON.stringify(part));
  await scrollTo(tbSel('tea3'));
  await I.shot('p27-01-timebox-light-20min');
  await scrollTo(tbSel('lunch3'));
  await I.shot('p27-02-timebox-light-60min');
  check('the hosted tasks are still cards in Tasks', await I.exists(`document.querySelector('[data-day-col="${TODAY}"] [aria-label="Task Stretch the back and the shoulders properly"]')`) && (await I.exists(`document.querySelector('[data-day-col="${TODAY}"] [aria-label="Task Reply to Sam"]')`)));

  // A block in a gap opens its task.
  await scrollTo(tbSel('lunch1'));
  await I.click(V(`${TB} [data-block-task="pod"][data-in-gap]`), 800);
  const detail = await I.js(`[...document.querySelectorAll('[data-detail-panel] input, [data-detail-panel] textarea')].map((e) => e.value).join('|')`);
  check('clicking a block in a gap opens that task', detail.includes('Listen to a podcast episode'), detail.slice(0, 120));
  await I.key('Escape', [], 600);
  if (await I.exists(`document.querySelector('[data-detail-panel]')`)) await I.click(`document.querySelector('[aria-label="Close the task details"]')`, 600);

  // ======== Drag onto a break (events dispatched in the page) ========
  const minOf = (id) => Number(byId(id).startTime.slice(0, 2)) * 60 + Number(byId(id).startTime.slice(3));
  const dragBlockTo = async (id, toMin) => {
    await scrollTo(tbSel('nap'));
    await C.sleep(400);
    const hint = await I.drag(V(tbSel(id)), TB, minOf(id) + 5, toMin);
    await C.sleep(900);
    return hint || '';
  };
  const hint2 = await dragBlockTo('long', 16 * 60 + 30);
  check('a task longer than the break is refused: "Longer than the break"', /Longer than the break/.test(hint2), hint2);
  const long = byId('long');
  // Changed on purpose in 3.11.0: refused, not warned: the drop snaps back (before, it went through).
  check('and the drop snaps back: it stays where it was, the break hosts nothing', long.startTime === '19:30' && (await I.exists(V('[data-block-task="long"]'))) && ((await inGap(TB, 'Nap')) || []).length === 0, JSON.stringify(long));
  const hint1 = await dragBlockTo('fits', 16 * 60 + 35);
  check('over a break the lifted card says it goes inside it', /During Nap/.test(hint1), hint1);
  const fits = byId('fits');
  check('dropped on the Nap it starts inside it (the dropped slot, it fits) and keeps its length', fits.startTime >= '16:00' && fits.startTime <= '16:30' && fits.durationMinutes === 30 && fits.dueDate === TODAY, JSON.stringify(fits));
  check('it is now a block in the Nap\'s gap', JSON.stringify(await inGap(TB, 'Nap')) === '["fits"]', JSON.stringify(await inGap(TB, 'Nap')));
  await I.shot('p27-03-dragged-in');
  // The break moved two hours later (by its body, 5 minute steps): the task no longer fits inside it and is a block of
  // its own again at once.
  const grab = fits.startTime === '16:00' ? 16 * 60 + 40 : 16 * 60 + 10;
  await I.drag(`document.querySelector('${TB} [data-gap="nap"]')`, TB, grab, grab + 120);
  await C.sleep(900);
  check('the Nap moved to 18:00', byId('nap').startTime === '18:00', JSON.stringify(byId('nap')));
  check('moved out of the break, the task is a block of its own again', (await I.exists(V(`${TB} [data-block-task="fits"]:not([data-in-gap])`))), JSON.stringify(byId('fits')));
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
  check('and it is a block in Long lunch\'s gap (now four)', ((await inGap(TB, 'Long lunch')) || []).length === 4, JSON.stringify(await inGap(TB, 'Long lunch')));

  // ======== Calendar (day), light ========
  await I.click(`document.querySelector('[aria-label="Show the Calendar"]') || document.querySelector('[aria-label="Show Calendar"]')`, 1200);
  await C.waitFor(() => I.exists(V(calSel('lunch1'))), 6000).catch(() => {});
  check('Calendar: no break is a block, no chip', !(await I.exists(`document.querySelector('${COL} [data-host-chip], ${COL} [data-break-cup], ${COL} [data-host-count]')`)));
  await gapCheck('Calendar light', COL, { four: true });
  await scrollTo(calSel('tea3'));
  await I.shot('p27-05-calendar-light-20min');
  await scrollTo(calSel('lunch3'));
  await I.shot('p27-06-calendar-light-60min');
  // The week: narrow columns draw the same gaps.
  await I.click(`document.querySelector('[aria-label="Week view"]') || [...document.querySelectorAll('[role="button"]')].find((b) => b.innerText === 'Week')`, 1200);
  await C.waitFor(() => I.exists(V(calSel('tea3'))), 6000).catch(() => {});
  await gapCheck('Calendar week (narrow)', COL, { four: true });
  await I.shot('p27-07-calendar-week-light');
  await I.click(`document.querySelector('[aria-label="Day view"]') || [...document.querySelectorAll('[role="button"]')].find((b) => b.innerText === 'Day')`, 1000);

  // ======== Dark ========
  await I.click(`document.querySelector('[aria-label="Profile and account"]') || document.querySelector('[aria-label="Profile, not signed in"]')`, 500);
  await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 800);
  await I.click(`document.querySelector('[data-theme-setting] [data-theme-mode="dark"]')`, 900);
  if (await I.exists(I.byLabel('Back'))) await I.click(I.byLabel('Back'), 700);
  check('the dark theme is on', (await I.js(`document.documentElement.getAttribute('data-theme')`)) === 'dark');
  await I.click(`document.querySelector('[aria-label="Show Tasks"]')`, 900);
  await gapCheck('Timebox dark', TB, { four: true });
  const gapLine = await I.js(`getComputedStyle(${V(`${TB} [data-gap="lunch1"]`)}).borderTopColor`);
  check('dark: the gap\'s outline is the dark gapLine', gapLine === 'rgb(110, 110, 110)', String(gapLine));
  await scrollTo(tbSel('tea3'));
  await I.shot('p27-08-timebox-dark-20min');
  await scrollTo(tbSel('lunch3'));
  await I.shot('p27-09-timebox-dark-60min');
  await I.click(`document.querySelector('[aria-label="Show the Calendar"]') || document.querySelector('[aria-label="Show Calendar"]')`, 1200);
  await C.waitFor(() => I.exists(V(calSel('lunch1'))), 6000).catch(() => {});
  await gapCheck('Calendar dark', COL, { four: true });
  await scrollTo(calSel('tea3'));
  await I.shot('p27-10-calendar-dark-20min');
  await scrollTo(calSel('lunch3'));
  await I.shot('p27-11-calendar-dark-60min');

  // ======== P1 of PLAN_breaks_as_gaps: breaks are free gaps, not work ========
  // Today's work: Stretch 10, Water 5, Post 5, Text Mum 10, Podcast 30, Reply 15, Call 20, Read 25 (all inside a break, full
  // length), Partly over 40 less the 10 minutes Long lunch cuts away = 30, Fits 30, Too long 90, Plan the week 25
  // = 295 (4:55). The Timebox's Scheduled has no unplaced task, and Call the bank and Read a chapter overlap by 5 minutes (counted once): 265 (4h 25m). The five breaks (220 minutes) count in neither.
  await I.click(`document.querySelector('[aria-label="Show Tasks"]')`, 900);
  const mins = (t) => { const h = /(\d+)h/.exec(t); const m = /(\d+)m/.exec(t); return (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0); };
  // 3.26.0: the day total is the estimate alone ("Estimated for the day: 1:30").
  const clock = (t) => { const m = /: (\d+):(\d\d)$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : NaN; };
  const figures = async () => ({
    scheduled: mins(await I.js(`([...document.querySelectorAll('div')].find((d) => /^Scheduled /.test(d.innerText || '') && ![...d.children].some((c) => c.tagName === 'DIV')) || {}).innerText || ''`)),
    estimate: clock(await I.js(`(${V(`[data-day-col="${TODAY}"] [aria-label^="Estimated for the day"]`)} || {}).getAttribute?.('aria-label')`)),
  });
  const fig = await figures();
  check("the day's estimate leaves the breaks out and cuts Partly over to its piece: 4:55", fig.estimate === 295, JSON.stringify(fig));
  check("the Timebox's Scheduled leaves the gaps out and counts the tasks inside them at their length: 4h 25m", fig.scheduled === 265, JSON.stringify(fig));
  check('a Break with a time is not a card in its day column', !(await I.exists(`document.querySelector('[data-day-col="${TODAY}"] [data-task-card="tea1"]')`)));
  const line = await I.js(`(() => { const l = document.querySelector('[data-break-line="${TODAY}"]'); return l ? l.innerText : null; })()`);
  check('the column ends with one quiet line: "☕ Free time · 3h 40m" (3.37.0 wording)', line === '☕ Free time · 3h 40m', String(line));
  await I.click(`document.querySelector('[data-break-line="${TODAY}"]')`, 600);
  const listed = await I.js(`[...document.querySelectorAll('[role="dialog"] [role="button"], [role="dialog"] [role="menuitem"]')].map((e) => e.innerText.split('\\n')[0]).filter(Boolean)`);
  check('pressing the line lists the five breaks', ['Tea break', 'Coffee', 'Lunch', 'Long lunch', 'Nap'].every((t) => listed.includes(t)), JSON.stringify(listed));
  await I.key('Escape');
  await C.sleep(300);
  const quiet = `Array.from(document.querySelectorAll('[aria-label="Task Quiet break"]')).find((e) => e.getBoundingClientRect().width > 0)`;
  check('a Break with no time keeps a card with no tick box', (await I.exists(quiet)) && !(await I.js(`!!(${quiet}).querySelector('[aria-label^="Mark Quiet break"]')`)));
  await I.shot('p27-12-breaks-quiet-line');
  await I.click(`document.querySelector('[aria-label="Profile and account"]') || document.querySelector('[aria-label="Profile, not signed in"]')`, 500);
  await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 800);
  check('Settings no longer has "Count minutes done during a break twice"; a note says breaks are not counted', !(await I.js(`!!document.querySelector('[data-break-twice-setting]')`)) && (await I.js(`!!document.querySelector('[data-breaks-not-counted]')`)));
  if (await I.exists(I.byLabel('Back'))) await I.click(I.byLabel('Back'), 700);

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
