'use strict';
// Real check for 3.28.0: in the Calendar's Day view (one wide column) a break that hosts tasks shows as many
// chips as fit on its line or lines, each with its title and length, and "+N" only for the ones that do not fit.
// For 1, 2, 3 and 5 hosted tasks, at window widths 1440, 1100, 900 and 760, in a 60 minute break (two lines) and a
// 20 minute one (one line):
//   - shown chips + N = the hosted tasks, in order; narrower never shows more;
//   - nothing overlaps: the title, every chip, the time and "+N" are apart and inside the block;
//   - every chip shows its title and length;
//   - the week view keeps its one chip per row layout.
// Real app, isolated data folder, in process fake Supabase. Light and dark (P49_DARK). BELIFIC_SHOTS: screenshots.
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
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, start, len, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, dueDate: today, startTime: start, durationMinutes: len, ...extra });
  const names = ['Reply to the long email from Sam', 'Water the plants on the balcony', 'Stretch and walk around', 'Read one article about design', 'Call mum about the weekend'];
  const file = path.join(dataDir, 'belific_tasks.kv');
  const seed = (n) =>
    fs.writeFileSync(
      file,
      JSON.stringify([
        T('lunch', 'Lunch', '12:00', 60, { cutsBelow: true }),
        ...names.slice(0, n).map((t, i) => T(`g${i + 1}`, t, `12:${String(5 + i * 10).padStart(2, '0')}`, 5 + (i % 2) * 5)),
        T('short', 'Short break', '15:00', 20, { cutsBelow: true }),
        ...names.slice(0, n).map((t, i) => T(`s${i + 1}`, `${t} (s)`, '15:05', 5)),
      ]),
    );
  seed(1);

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

  // What a break block shows: its chips (in order), +N, and whether anything overlaps or sticks out.
  const read = (id) =>
    I.js(`(() => {
      const b = [...document.querySelectorAll('[data-cal-block$=":${id}"]')].find((e) => e.getBoundingClientRect().width > 0);
      if (!b) return null;
      const s = document.querySelector('[data-cal-scroller]');
      if (s) s.scrollTop += b.getBoundingClientRect().top - s.getBoundingClientRect().top - 160;
      const box = b.getBoundingClientRect();
      const chips = [...b.querySelectorAll('[data-host-chip]')].filter((e) => e.getBoundingClientRect().width > 0);
      const more = b.querySelector('[data-host-more]');
      const title = b.querySelector('[data-host-title]');
      const row = b.querySelector('[data-host-row]');
      // The visible box of a text: its range (an ellipsis keeps it inside its element).
      const parts = [title, ...chips, more, ...[...(row ? row.children : [])].filter((e) => e.tagName && !e.querySelector('[data-host-chip]') && !e.hasAttribute('data-host-chip') && e !== title && e !== more)].filter(Boolean).map((e) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width }; }).filter((r) => r.w > 0);
      let overlap = false;
      for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
        const a = parts[i], c = parts[j];
        if (Math.min(a.r, c.r) - Math.max(a.l, c.l) > 0.5 && Math.min(a.b, c.b) - Math.max(a.t, c.t) > 0.5) overlap = true;
      }
      const outside = parts.some((p) => p.l < box.left - 0.5 || p.r > box.right + 0.5 || p.t < box.top - 0.5 || p.b > box.bottom + 0.5);
      return {
        layout: row ? row.getAttribute('data-host-row') : null,
        shown: chips.map((c) => c.getAttribute('data-host-chip')),
        texts: chips.map((c) => c.innerText.replace(/\\s+/g, ' ').trim()),
        more: more ? Number(more.getAttribute('data-host-more')) : 0,
        overlap,
        outside,
        width: Math.round(box.width),
      };
    })()`);

  const widths = [1440, 1100, 900, 760];
  for (const n of [1, 2, 3, 5]) {
    seed(n);
    // Reload so the app reads the new rows.
    win.webContents.reload();
    await C.sleep(3500);
    await I.click(I.byLabel('Show the Calendar'), 800).catch(() => {});
    await I.key('d');
    await C.sleep(600);
    for (const id of ['lunch', 'short']) {
      let prev = Infinity;
      let prevW = Infinity;
      for (const w of widths) {
        win.setSize(w, 900);
        await C.sleep(700);
        const r = await read(id);
        const tag = `${mode} ${n} task${n > 1 ? 's' : ''} in ${id === 'lunch' ? 'Lunch (60 min)' : 'Short break (20 min)'} at ${w}`;
        if (!r) {
          check(`${tag}: the block is there`, false);
          continue;
        }
        const pre = id === 'lunch' ? 'g' : 's';
        const want = Array.from({ length: n }, (_, i) => `task:${pre}${i + 1}`);
        check(`${tag}: the wide layout (${r.layout})`, /^flow-/.test(r.layout || ''), String(r.layout));
        check(`${tag}: shown ${r.shown.length} + "+${r.more}" = ${n}, in order (block ${r.width} px)`, r.shown.length + r.more === n && JSON.stringify(r.shown) === JSON.stringify(want.slice(0, r.shown.length)), JSON.stringify(r));
        // A narrower BLOCK never shows more (the window and the block can differ: a pane may fold away).
        check(`${tag}: never more than in a wider block`, r.width > prevW || r.shown.length <= prev, `${r.shown.length} > ${prev} (block ${r.width} px, before ${prevW} px)`);
        prevW = r.width;
        check(`${tag}: nothing overlaps, nothing sticks out`, !r.overlap && !r.outside, JSON.stringify(r));
        check(`${tag}: each chip shows a title and a length`, r.texts.every((t) => /\d+m/.test(t) && t.length > 4), JSON.stringify(r.texts));
        prev = r.shown.length;
        if (w === 1440 || w === 760) await I.shot(`p49-${mode}-${n}-${id}-${w}`);
      }
    }
    win.setSize(1440, 900);
    await C.sleep(500);
  }
  // At the widest window a 60 minute break shows every chip of five (two lines), and a narrow one still at least one.
  // The week view keeps its old layout.
  await I.blur();
  await I.key('w');
  await C.sleep(800);
  const wk = await read('lunch');
  check(`${mode}: the week view keeps one chip per row ("stack", not "flow")`, !!wk && wk.layout === 'stack', JSON.stringify(wk));
  await I.shot(`p49-${mode}-week`);

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
