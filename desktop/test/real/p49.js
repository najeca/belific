'use strict';
// Real check for the Calendar Day view break chips (3.28.0), on real shaped data since 3.29.1: a repeating
// "Short break" of 20 minutes (one line, about 19 px high) at 11:00 with an extra time at 15:00, a Must do with a
// label; today's day of it stored, tomorrow's projected. A 7 hour repeating task under both, cut by them, and a Long
// Break. Hosted: today at 11:00 "Apply to 1 application" (10m, itself a Break) and "Put laundry in washing machine"
// (5m), both starting with the break; at 15:00 "Eat banana and do running pre warm up exercises" (10m). Tomorrow
// (projected): at 11:00 a task with a very long title and a 10 minute one; at 15:00 five short tasks.
// At window widths 1440, 1100, 900 and 760, Vibrant colours on, light and dark (P49_DARK):
//   - shown chips + N = the hosted tasks, in order; a narrower block never shows more;
//   - a chip is never cut short while it would fit whole: only a chip wider than its whole line is, and then to at
//     least 72 px, keeping room for "+N";
//   - a chip goes to "+N" only when the free room left on the line is less than it needs;
//   - nothing overlaps or sticks out of the block, nothing covers the break's title;
//   - the "⋯" of a chip shows only on hover or focus (it read as a title cut short);
//   - the week view keeps its old layout (one chip, "+N").
// Real app, isolated data folder, in process fake Supabase. BELIFIC_SHOTS: screenshots.
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

async function run() {
  const { check, summary } = C.makeChecker();
  app.whenReady().then(() => {
    const fake = C.installFakeSupabase();
    fake.store = { tables: {} };
  });
  const dk = dayKeyFrom(new Date());
  const today = dk(0);
  const tomorrow = dk(1);
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const wd = (s) => WD[new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + s).getDay()];
  // Today and tomorrow are always in the rule (as Mon to Thu are for Jethro).
  const rule = { recurrence: 'weekly', recurrenceDays: [wd(0), wd(1), wd(2), wd(3)] };
  const brk = { ...rule, startTime: '11:00', durationMinutes: 20, extraTimes: ['15:00'], cutsBelow: true, priority: 'high', projectKey: 'rest', reminders: [0, 5] };
  const LONG = 'Write the long weekly review of every application sent, every reply received and every interview booked, with notes for next week';
  const FIVE = ['Drink water', 'Stretch the legs', 'Text Sam back', 'Tidy the desk', 'Check the post'];
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      T('brk', 'Short break', { ...brk, dueDate: dk(-14) }),
      // Today's day of the break is stored (as when a task was moved into it); tomorrow's is projected.
      T(`brk:${today}`, 'Short break', { ...brk, dueDate: today, updatedAt: '2026-09-02T07:00:00.000Z' }),
      T('camp', 'Online boot camp session', { ...rule, dueDate: dk(-13), startTime: '09:30', durationMinutes: 420 }),
      T('long', 'Long Break', { ...rule, dueDate: dk(-12), startTime: '12:30', durationMinutes: 60, cutsBelow: true }),
      T('apply1', 'Apply to 1 application', { dueDate: today, startTime: '11:00', durationMinutes: 10, cutsBelow: true, projectKey: 'work' }),
      T('laundry', 'Put laundry in washing machine', { dueDate: today, startTime: '11:00', durationMinutes: 5, projectKey: 'home' }),
      T('banana', 'Eat banana and do running pre warm up exercises', { dueDate: today, startTime: '15:00', durationMinutes: 10, cutsBelow: true, projectKey: 'health' }),
      T('longtitle', LONG, { dueDate: tomorrow, startTime: '11:00', durationMinutes: 10, projectKey: 'work' }),
      T('short1', 'Reply to Sam', { dueDate: tomorrow, startTime: '11:10', durationMinutes: 5 }),
      ...FIVE.map((t, i) => T(`f${i + 1}`, t, { dueDate: tomorrow, startTime: `15:${String(i * 3).padStart(2, '0')}`, durationMinutes: 5 })),
    ]),
  );
  fs.writeFileSync(
    path.join(dataDir, 'belific_projects.kv'),
    JSON.stringify([
      { key: 'work', name: 'Work', colorKey: '#8B4FC9', createdAt: stamp, updatedAt: stamp },
      { key: 'rest', name: 'Rest', colorKey: 'sage', createdAt: stamp, updatedAt: stamp },
      { key: 'home', name: 'Home', colorKey: 'sky', createdAt: stamp, updatedAt: stamp },
      { key: 'health', name: 'Health', colorKey: 'rose', createdAt: stamp, updatedAt: stamp },
    ]),
  );
  fs.writeFileSync(path.join(dataDir, 'belific_desktop_settings.kv'), JSON.stringify({ vibrantColours: true }));

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1440, 900);
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await C.sleep(3500);
  const mode = process.env.P49_DARK ? 'dark' : 'light';
  if (mode === 'dark') {
    const ic = (await I.exists(I.byLabel('Profile and account'))) ? 'Profile and account' : 'Profile, not signed in';
    await I.click(I.byLabel(ic));
    await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 700);
    await I.waitBody('POWER FEATURES', 8000);
    await I.click(`document.querySelector('[data-theme-setting] [data-theme-mode="dark"]')`, 900);
    await I.click(I.byLabel('Back'), 900);
  }
  await I.click(I.byLabel('Show the Calendar'), 800).catch(() => {});
  await I.key('d');
  await C.sleep(800);

  // What a break block shows: its chips (in order), +N, cut titles, free room, and whether anything overlaps.
  const read = (key) =>
    I.js(`(() => {
      const b = [...document.querySelectorAll('[data-cal-block="${key}"]')].find((e) => e.getBoundingClientRect().width > 0);
      if (!b) return null;
      const s = document.querySelector('[data-cal-scroller]');
      if (s) s.scrollTop += b.getBoundingClientRect().top - s.getBoundingClientRect().top - 160;
      const box = b.getBoundingClientRect();
      const chips = [...b.querySelectorAll('[data-host-chip]')].filter((e) => e.getBoundingClientRect().width > 0);
      const more = b.querySelector('[data-host-more]');
      const title = b.querySelector('[data-host-title]');
      const row = b.querySelector('[data-host-row]');
      const line = b.querySelector('[data-host-chips]');
      const natural = [...(b.querySelector('[data-host-measure]') || { children: [] }).children].map((e) => e.getBoundingClientRect().width);
      const R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width }; };
      const parts = [title, ...chips, more].filter(Boolean).map(R).filter((r) => r.w > 0);
      let overlap = false;
      for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
        const a = parts[i], c = parts[j];
        if (Math.min(a.r, c.r) - Math.max(a.l, c.l) > 0.5 && Math.min(a.b, c.b) - Math.max(a.t, c.t) > 0.5) overlap = true;
      }
      const outside = parts.some((p) => p.l < box.left - 0.5 || p.r > box.right + 0.5 || p.t < box.top - 0.5 || p.b > box.bottom + 0.5);
      // A chip whose title shows an ellipsis.
      const cut = chips.map((c) => { const t = c.children[1]; return !!t && t.scrollWidth > t.clientWidth + 1; });
      // The title is whole or keeps at least its own short text ("☕ Short break" is never covered).
      const titleWhole = !!title && title.scrollWidth <= title.clientWidth + 1;
      const last = chips[chips.length - 1];
      const L = line ? R(line) : null;
      const free = L ? L.r - (last ? last.getBoundingClientRect().right + 4 : L.l) : 0;
      const menus = chips.map((c) => getComputedStyle(c.querySelector('[data-host-menu]')).opacity);
      return {
        layout: row ? row.getAttribute('data-host-row') : null,
        shown: chips.map((c) => c.getAttribute('data-host-chip').replace(/^task:/, '')),
        widths: chips.map((c) => Math.round(c.getBoundingClientRect().width)),
        texts: chips.map((c) => c.innerText.replace(/\\s+/g, ' ').trim()),
        natural: natural.map(Math.round),
        lineW: L ? Math.round(L.w) : 0,
        free: Math.round(free),
        cut,
        titleWhole,
        menus,
        more: more ? Number(more.getAttribute('data-host-more')) : 0,
        overlap,
        outside,
        width: Math.round(box.width),
      };
    })()`);

  const widths = [1440, 1100, 900, 760];
  // The window really takes the width (a maximized or snapped window ignores setSize): asked again until it does.
  const size = async (w) => {
    if (win.isMaximized()) win.unmaximize();
    for (let i = 0; i < 6; i++) {
      win.setSize(w, 900);
      await C.sleep(500);
      if (Math.abs(win.getSize()[0] - w) <= 2 && (await I.js('window.innerWidth')) <= w) return true;
    }
    return false;
  };
  const breaks = [
    { day: 0, key: `cal${today}:brk:${today}`, name: 'today 11:00 (stored)', want: ['apply1', 'laundry'] },
    { day: 0, key: `cal${today}:brk:${today}@15:00`, name: 'today 15:00 (extra time)', want: ['banana'] },
    { day: 1, key: `cal${tomorrow}:brk:${tomorrow}`, name: 'tomorrow 11:00 (projected, a very long title)', want: ['longtitle', 'short1'] },
    { day: 1, key: `cal${tomorrow}:brk:${tomorrow}@15:00`, name: 'tomorrow 15:00 (projected, five tasks)', want: FIVE.map((_, i) => `f${i + 1}`) },
  ];
  let at = 0;
  let cutSeen = false;
  for (const day of [0, 1]) {
    if (day !== at) {
      await I.click(I.byLabel('Calendar next day'), 800);
      at = day;
    }
    for (const bk of breaks.filter((x) => x.day === day)) {
      let prev = Infinity;
      let prevW = Infinity;
      for (const w of widths) {
        const sized = await size(w);
        await C.sleep(400);
        if (!sized) check(`${mode} ${bk.name}: the window takes the width ${w}`, false, String(win.getSize()));
        const r = await read(bk.key);
        const tag = `${mode} ${bk.name} at ${w}`;
        if (!r) {
          check(`${tag}: the block is there`, false);
          continue;
        }
        const n = bk.want.length;
        check(`${tag}: the wide layout (${r.layout})`, r.layout === 'flow-inline', String(r.layout));
        check(`${tag}: shown ${r.shown.length} + "+${r.more}" = ${n}, in order (block ${r.width} px)`, r.shown.length + r.more === n && JSON.stringify(r.shown) === JSON.stringify(bk.want.slice(0, r.shown.length)), JSON.stringify(r));
        check(`${tag}: never more than in a wider block`, r.width > prevW || r.shown.length <= prev, `${r.shown.length} > ${prev}`);
        prev = r.shown.length;
        prevW = r.width;
        check(`${tag}: nothing overlaps, nothing sticks out, the break title is whole`, !r.overlap && !r.outside && r.titleWhole, JSON.stringify(r));
        // Only a chip wider than its whole line is cut, and then to at least 72 px.
        const badCut = r.cut.map((c, i) => c && !(r.natural[i] > r.lineW + 1 && r.widths[i] >= 71)).some(Boolean);
        check(`${tag}: no chip is cut short while it would fit whole`, !badCut, JSON.stringify({ cut: r.cut, natural: r.natural, widths: r.widths, lineW: r.lineW }));
        // "+N" only when the next chip truly does not fit what is left.
        if (r.more > 0) {
          const next = r.natural[r.shown.length];
          check(`${tag}: "+${r.more}" only because the next chip (${next} px) does not fit the ${r.free} px left`, next > r.free + 0.5 && (next <= r.lineW || r.free < 72), JSON.stringify(r));
        }
        check(`${tag}: each chip shows a title and a length`, r.texts.every((t) => /\d+m/.test(t) && t.length > 4), JSON.stringify(r.texts));
        check(`${tag}: the "⋯" is hidden until hover or focus`, r.menus.every((o) => o === '0'), JSON.stringify(r.menus));
        // The real data's expectations.
        if (bk.name.startsWith('today') && w >= 1100) check(`${tag}: every chip whole at a wide window`, r.more === 0 && r.cut.every((c) => !c), JSON.stringify(r));
        // The very long title (about 680 px): whole where the line has room, cut to the line where it has not,
        // never "+N" for it.
        if (bk.name.includes('long title')) {
          check(`${tag}: the very long title shows, ${r.natural[0] > r.lineW ? 'cut to its line' : 'whole'}, not "+N"`, r.shown[0] === 'longtitle' && r.cut[0] === r.natural[0] > r.lineW + 1, JSON.stringify(r));
          if (r.natural[0] > r.lineW + 1) cutSeen = true;
        }
        if (w === 1440 || w === 900 || w === 760) await I.shot(`p49-${mode}-${bk.key.replace(/^cal\d{4}-\d\d-\d\d:/, '').replace(/[^a-z0-9@]+/gi, '-')}-${w}`);
      }
    }
    await size(1440);
    await C.sleep(400);
  }
  check(`${mode}: at some width the very long title was wider than its line (and shown cut)`, cutSeen);
  // Hover shows the "⋯".
  const hoverId = `task:short1`;
  await I.js(`(() => { const b = document.querySelector('[data-cal-block="cal${tomorrow}:brk:${tomorrow}"]'); const s = document.querySelector('[data-cal-scroller]'); if (b && s) s.scrollTop += b.getBoundingClientRect().top - s.getBoundingClientRect().top - 160; })()`);
  await C.sleep(400);
  const hc = await I.js(`(() => { const c = document.querySelector('[data-cal-block="cal${tomorrow}:brk:${tomorrow}"] [data-host-chip="${hoverId}"]'); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (hc) {
    win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(hc.x), y: Math.round(hc.y) });
    await C.sleep(400);
  }
  const shown = await I.js(`(() => { const m = document.querySelector('[data-cal-block="cal${tomorrow}:brk:${tomorrow}"] [data-host-menu="${hoverId}"]'); return m ? getComputedStyle(m).opacity : null; })()`);
  check(`${mode}: hovering a chip shows its "⋯"`, shown === '1', String(shown));
  await I.shot(`p49-${mode}-hover`);
  win.webContents.sendInputEvent({ type: 'mouseMove', x: 5, y: 5 });

  // The week view keeps its old layout.
  await I.blur();
  await I.click(I.byLabel('Calendar previous day'), 800);
  await I.key('w');
  await C.sleep(900);
  const wk = await read(`cal${today}:brk:${today}`);
  check(`${mode}: the week view keeps its old layout (not "flow")`, !!wk && !/^flow/.test(wk.layout || ''), JSON.stringify(wk));
  await I.shot(`p49-${mode}-week`);

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
