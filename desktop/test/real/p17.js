'use strict';
// Real check for 2.34.0: (1) the List row of a repeating task's projected day, (2) the list
// emoji on the time line of blocks and cards, (3) readable "Vibrant task colours" text.
// Real mouse and key input into the real app, isolated data folder, in process fake Supabase.
// BELIFIC_SHOTS: a folder for screenshots. BELIFIC_TAG: "before" or "after" (names the
// side by side shots; "before" is run against the previous build).
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const C = require('./common');
const { makeInput, dayKeyFrom } = require('./input');

process.env.BELIFIC_NO_PROTOCOL_REGISTER = '1';
const userData = C.isolate();
console.log(`USERDATA ${userData}`);
const TAG = process.env.BELIFIC_TAG || 'after';

run().catch((err) => {
  console.log(`FAIL harness error: ${err.stack || err}`);
  app.exit(1);
});

function lum(rgb) {
  const [r, g, b] = rgb.match(/\d+/g).slice(0, 3).map((v) => {
    const s = Number(v) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

async function run() {
  const { check, summary } = C.makeChecker();
  app.whenReady().then(() => {
    const fake = C.installFakeSupabase();
    fake.store = { tables: {} };
  });

  const day = dayKeyFrom(new Date());
  // Tomorrow is the test day (no block is faded as late); the repeating task is stored today.
  const today = day(0);
  const D = day(1);
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  const BOOT = 'Leep Talent Online Boot Camp session';
  const OCC = `boot:${D}`; // the id of tomorrow's projected occurrence
  const seed = [
    // Stored today, repeating daily: tomorrow's block is a projection. In the list "Leep Talent Boot Camp".
    T('boot', BOOT, { dueDate: today, startTime: '09:30', durationMinutes: 420, recurrence: 'daily', projectKey: 'pb', listKey: 'camp' }),
    T('brk', 'Short Break', { dueDate: D, startTime: '11:00', durationMinutes: 20, cutsBelow: true }),
    T('morn', 'Morning Routine', { dueDate: D, startTime: '05:00', durationMinutes: 45, projectKey: 'pg', listKey: 'camp' }),
    T('tiny', 'Tiny task', { dueDate: D, startTime: '08:00', durationMinutes: 15, projectKey: 'pg', listKey: 'camp' }),
    T('noemoji', 'Plain list task', { dueDate: D, startTime: '18:00', durationMinutes: 60, projectKey: 'pr', listKey: 'plain', priority: 'high' }),
    T('allday', 'All day camp', { dueDate: D, projectKey: 'po', listKey: 'camp' }),
  ];
  fs.writeFileSync(path.join(dataDir, 'belific_tasks.kv'), JSON.stringify(seed));
  const label = (key, name, colorKey) => ({ key, name, colorKey, createdAt: stamp, updatedAt: stamp });
  fs.writeFileSync(path.join(dataDir, 'belific_projects.kv'), JSON.stringify([label('pb', 'Blue', 'sky'), label('pg', 'Green', 'green'), label('pr', 'Red', 'red'), label('po', 'Orange', 'orange')]));
  const list = (key, name, emoji, order) => ({ key, name, ...(emoji ? { emoji } : {}), sortOrder: order, createdAt: stamp, updatedAt: stamp });
  fs.writeFileSync(path.join(dataDir, 'belific_lists.kv'), JSON.stringify([list('camp', 'Leep Talent Boot Camp', '🎓', 1), list('plain', 'No emoji list', '', 2)]));
  // Vibrant task colours on from the start (the setting itself is checked in p16).
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

  const cal = (dayKey, id) => `document.querySelector('[data-cal-block="cal${dayKey}:${id}"]')`;
  const blk = (id) => `document.querySelector('[data-block-id="${id}"]')`;
  const scrollTo = (hour) => I.js(`(() => { const s = document.querySelector('[data-cal-scroller]'); if (s) s.scrollTop = ${hour} * 56 - 20; })()`);
  const scrollBox = (hour) => I.js(`(() => { const g = document.querySelector('[data-timebox-grid]'); let p = g; while (p && p.scrollHeight <= p.clientHeight + 2) p = p.parentElement; if (p) p.scrollTop = ${hour} * 56 - 20; })()`);
  // The block's own box, its title and its time line (the leaf text with a clock time), with fonts.
  const info = (expr) =>
    I.js(`(() => { const e = ${expr}; if (!e) return null; const r = e.getBoundingClientRect(); const bg = getComputedStyle(e).backgroundColor;
      const leaves = []; const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) { const t = n.textContent.trim(); if (t && !n.parentElement.closest('[data-priority-mark],[data-late-move],[aria-label="Repeats"],[data-block-list-emoji]')) { const cs = getComputedStyle(n.parentElement); leaves.push({ t, el: n.parentElement, fw: cs.fontWeight, ff: cs.fontFamily, ls: cs.letterSpacing, lh: cs.lineHeight, color: cs.color, ts: cs.textShadow, stroke: cs.webkitTextStrokeWidth, mono: !!n.parentElement.closest('[data-mono]') }); } }
      const title = leaves[0];       const timeEl = (() => { const cand = [...e.querySelectorAll('*')].filter((x) => x.children.length >= 0 && /\\d{1,2}:\\d{2}(am|pm)/.test(x.innerText || '') && !(x.innerText || '').includes('\\n') && x !== e); return cand.length ? cand[cand.length - 1] : null; })();
      const em = e.querySelector('[data-block-list-emoji]'); const er = em ? em.getBoundingClientRect() : null;
      const tcs = timeEl ? getComputedStyle(timeEl) : null;
      return { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), bg,
        title: title && { t: title.t, fw: title.fw, color: title.color, ts: title.ts },
        time: timeEl && { t: timeEl.innerText.replace(/\\s+/g, ' ').trim(), fw: tcs.fontWeight, ff: tcs.fontFamily, ls: tcs.letterSpacing, lh: tcs.lineHeight, color: tcs.color, ts: tcs.textShadow, mono: !!timeEl.closest('[data-mono]') || timeEl.hasAttribute('data-mono') },
        emoji: em ? { t: em.innerText, title: em.getAttribute('title'), top: Math.round(er.top - r.top), bottom: Math.round(r.bottom - er.bottom), left: Math.round(er.left - r.left), right: Math.round(r.right - er.right) } : null,
        markBg: (() => { const m = e.querySelector('[data-priority-mark]'); return m ? getComputedStyle(m).backgroundColor : null; })(),
        tip: e.getAttribute('title') }; })()`);
  const rectOf = (expr) => I.js(`(() => { const e = ${expr}; if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; })()`);
  const rects = {};

  // ======== Part 1: the List row of a repeating task ========
  await scrollTo(8);
  await C.sleep(400);
  await I.click(`${cal(D, OCC)}`, 800);
  await C.waitFor(() => I.exists(`document.querySelector('[data-detail-panel]')`), 4000);
  const projected = await I.js(`(() => { const s = document.querySelector('[data-detail-panel] select[aria-label="List"]'); return s ? { text: s.selectedOptions[0].textContent, value: s.value } : null; })()`);
  check('P1: a projected day of the repeating task shows its own list in the details, not Brain Dump', !!projected && projected.value === 'camp' && projected.text.includes('Leep Talent Boot Camp') && !projected.text.includes('Brain Dump'), JSON.stringify(projected));
  await I.blur();
  await I.key('Escape');
  await C.sleep(400);
  await I.click(cal(today, 'boot'), 800).catch(() => {});
  const stored = await I.js(`(() => { const s = document.querySelector('[data-detail-panel] select[aria-label="List"]'); return s ? { text: s.selectedOptions[0].textContent, value: s.value } : null; })()`);
  check('P1: the stored occurrence (today) shows the same list', !!stored && stored.value === 'camp', JSON.stringify(stored));
  await I.blur();
  await I.key('Escape');
  await C.sleep(400);

  // ======== Part 2: the list emoji on the time line (vibrant ON) ========
  await scrollTo(4);
  await C.sleep(300);
  // Day view for the shots and the readable text.
  await I.click(`document.querySelector('[data-cal-head="${D}"]')`, 900).catch(async () => {
    await I.click(`document.querySelector('[aria-label="Next day"]')`, 700);
  });
  await I.click(`document.querySelector('[aria-label="Day view"]')`, 900).catch(() => {});
  await scrollTo(4);
  await C.sleep(500);
  const morn = await info(cal(D, 'morn'));
  rects.short = await rectOf(cal(D, 'morn'));
  await I.shot(`p17-${TAG}-day-early`);
  await scrollTo(9);
  await C.sleep(500);
  const p1 = await info(cal(D, OCC));
  const brk = await info(cal(D, 'brk'));
  const p2 = await info(cal(D, `${OCC}~2`));
  rects.tall = await rectOf(cal(D, `${OCC}~2`));
  rects.split = { x: p1 && p1.l, y: p1 && p1.t, w: p1 && p1.w, h: p2 && p1 ? Math.min(p2.t + 120 - p1.t, 330) : 0 };
  await I.shot(`p17-${TAG}-day-split`);
  fs.writeFileSync(path.join(process.env.BELIFIC_SHOTS || userData, `p17-${TAG}-rects.json`), JSON.stringify(rects));

  check('P2: the first piece says "9:30am 7h" and then the list emoji, in that order', !!p1 && !!p1.time && /9:30am 7h\s*🎓$/.test(p1.time.t) && !!p1.emoji, JSON.stringify(p1 && p1.time));
  check('P2: the later piece says its start and the time left, then the emoji', !!p2 && /11:20am 5h 10m left\s*🎓$/.test(p2.time.t), JSON.stringify(p2 && p2.time));
  check('P2: a short block with a time line shows it after "5:00am 45m"', !!morn && /5:00am 45m\s*🎓$/.test(morn.time.t), JSON.stringify(morn && morn.time));
  check('P2: the hover tooltip on the emoji is the list name', !!p1 && !!p1.emoji && p1.emoji.title === 'Leep Talent Boot Camp', JSON.stringify(p1 && p1.emoji));
  check('P2: it is on the time line near the top, never in a bottom corner (tall piece too)', !!p2 && !!p2.emoji && p2.emoji.top < 40 && p2.emoji.bottom > 100 && !!p1.emoji && p1.emoji.top < 40, JSON.stringify([p1 && p1.emoji, p2 && p2.emoji]));
  const tiny = await info(cal(D, 'tiny'));
  check('P2: a block too short for its time line shows no emoji', !!tiny && tiny.emoji === null, JSON.stringify(tiny));
  const noEmoji = await info(cal(D, 'noemoji'));
  check('P2: a list with no emoji shows nothing', !!noEmoji && noEmoji.emoji === null && !/🎓/.test(noEmoji.time ? noEmoji.time.t : ''), JSON.stringify(noEmoji && noEmoji.time));
  check('P2: the break (no list) shows nothing', !!brk && brk.emoji === null);

  // Sizes did not change: the emoji is inline in the time line. Compare with the same block without a list later (OFF mode below).
  // All-day chip and month chip.
  const chip = await I.js(`(() => { const c = document.querySelector('[aria-label="All day task All day camp"]'); const em = c && c.querySelector('[data-block-list-emoji]'); return em ? { t: em.innerText, title: em.getAttribute('title') } : null; })()`);
  check('P2: the all-day chip has the emoji with the list name as its tooltip', !!chip && chip.t === '🎓' && chip.title === 'Leep Talent Boot Camp', JSON.stringify(chip));
  await I.click(`document.querySelector('[aria-label="Week view"]')`, 800);
  await I.click(`document.querySelector('[aria-label="Month view"]')`, 1000);
  const mchip = await I.js(`(() => { const c = document.querySelector('[aria-label="Calendar task Morning Routine"]'); const em = c && c.querySelector('[data-block-list-emoji]'); return em ? { t: em.innerText, title: em.getAttribute('title') } : null; })()`);
  check('P2: and so does the month chip', !!mchip && mchip.t === '🎓' && mchip.title === 'Leep Talent Boot Camp', JSON.stringify(mchip));
  await I.click(`document.querySelector('[aria-label="Week view"]')`, 800);

  // ======== Part 3: readable text in vibrant mode ========
  const W = 'rgb(255, 255, 255)';
  const shadowOk = (ts) => typeof ts === 'string' && ts !== 'none' && /rgba\(0, 0, 0, 0?\.\d+\)/.test(ts) && Number((ts.match(/rgba\(0, 0, 0, ([\d.]+)\)/) || [0, 1])[1]) <= 0.35 && /\b[0-3]px\b/.test(ts.replace(/rgba\([^)]*\)/, ''));
  for (const [name, x] of [['short block', morn], ['first piece', p1], ['later piece', p2]]) {
    check(`P3: ${name}: the title is bold white`, !!x && x.title.color === W && Number(x.title.fw) >= 700, JSON.stringify(x && x.title));
    const meta = x && x.time;
    check(`P3: ${name}: the time line is medium weight (500), white, in a proportional font (not the fixed width one), with extra letter spacing`, !!meta && meta.color === W && meta.fw === '500' && !/mono/i.test(meta.ff) && !meta.mono && parseFloat(meta.ls) > 0, JSON.stringify(meta));
    check(`P3: ${name}: the text has a subtle dark shadow, no outline`, !!x && shadowOk(x.title.ts) && shadowOk(meta && meta.ts), JSON.stringify([x && x.title.ts, meta && meta.ts]));
    check(`P3: ${name}: white on its background is at least 6:1`, !!x && ratio(W, x.bg) >= 6, `${x && x.bg} ${x && ratio(W, x.bg).toFixed(2)}`);
  }
  check('P3: the break is the slate grey at 6:1 or better', !!brk && ratio(W, brk.bg) >= 6, `${brk && brk.bg} ${brk && ratio(W, brk.bg).toFixed(2)}`);
  check('P3: the time line is taller than before (more line height)', !!morn && parseFloat(morn.time.lh) >= 14, String(morn && morn.time.lh));
  const hi = await info(cal(D, 'noemoji'));
  check('P3: the red ❗ keeps its white chip', !!hi && hi.markBg === W, String(hi && hi.markBg));

  // Timebox: the emoji after the duration and the same readable text.
  await I.click(`document.querySelector('[aria-label="Show Tasks"]')`, 900);
  await I.click(`document.querySelector('[aria-label="Next day"]')`, 700);
  await scrollBox(8);
  await C.sleep(400);
  const tb1 = await info(blk(OCC));
  const tb2 = await info(blk(`${OCC}~2`));
  check('P2: the Timebox card has the emoji after the duration too (both pieces)', !!tb1 && !!tb2 && /9:30am 7h\s*🎓$/.test(tb1.time.t) && /5h 10m left\s*🎓$/.test(tb2.time.t) && tb1.emoji.title === 'Leep Talent Boot Camp', JSON.stringify([tb1 && tb1.time, tb2 && tb2.time]));
  check('P3: the Timebox card has the readable text', !!tb1 && tb1.title.color === W && Number(tb1.title.fw) >= 700 && tb1.time.fw === '500' && !tb1.time.mono, JSON.stringify(tb1 && [tb1.title, tb1.time]));
  await I.shot(`p17-${TAG}-timebox`);

  // ======== Normal mode: the emoji is there, the look is as before ========
  const profile = (await I.exists(I.byLabel('Profile and account'))) ? 'Profile and account' : 'Profile, not signed in';
  await I.click(I.byLabel(profile));
  await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 700);
  await I.waitBody('POWER FEATURES', 8000);
  const before = { p1: { l: p1 && p1.l, w: p1 && p1.w, h: p1 && p1.h }, p2: { h: p2 && p2.h, t: p2 && p2.t } };
  await I.click(`document.querySelector('[data-vibrant-setting] [role="switch"]')`, 700).catch(() => {});
  await C.waitFor(() => JSON.parse(fs.readFileSync(path.join(dataDir, 'belific_desktop_settings.kv'), 'utf8')).vibrantColours === false, 5000).catch(() => {});
  await I.click(I.byLabel('Back'), 900);
  await I.click(`document.querySelector('[aria-label="Show the Calendar"]')`, 900);
  // The Calendar comes back as the week: open tomorrow's day again, as the measurements were.
  if (await I.exists(`document.querySelector('[data-cal-head="${D}"]')`)) await I.click(`document.querySelector('[data-cal-head="${D}"]')`, 900);
  await scrollTo(9);
  await C.sleep(500);
  const n1 = await info(cal(D, OCC));
  const n2 = await info(cal(D, `${OCC}~2`));
  const nm = await info(cal(D, 'morn'));
  check('Normal mode: the emoji is on the time line after the duration', !!n1 && /9:30am 7h\s*🎓$/.test(n1.time.t) && /5h 10m left\s*🎓$/.test(n2.time.t), JSON.stringify([n1 && n1.time, n2 && n2.time]));
  check('Normal mode: the old look is untouched (soft tint, dark text, fixed width time, normal weight)', !!n1 && n1.bg === 'rgb(233, 239, 244)' && n1.title.color !== W && n1.time.mono && n1.time.fw !== '500' && n1.time.ts === 'none', JSON.stringify(n1 && [n1.bg, n1.time]));
  check('Normal mode: sizes and positions are the same as in vibrant mode', !!n1 && n1.l === before.p1.l && n1.w === before.p1.w && n1.h === before.p1.h && n2.h === before.p2.h, JSON.stringify([before, n1 && [n1.l, n1.w, n1.h], n2 && n2.h]));
  void nm;

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
