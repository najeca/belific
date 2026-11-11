'use strict';
// @real-input: quiet
// Real check for PLAN_shifts S2 (3.37.0): a shift draws with what is inside it. Today: the nurse's Shift 8:00 for 10 h
// with Briefing 8:30 30m, Teams press meeting 10:00 1h, Ring patients 11:00 2h, Lunch 13:00 30m and Ring other
// departments 14:00 1h inside it, and Handover 17:30 for 1 h, which starts inside the shift and ends after it.
//   - Calendar Day: the shift's header says "5h of 10h planned, 5h free" (14 px or more); the five are drawn inside the
//     shift's lane, right of its header, at their real size; Handover sits beside the shift (both count);
//   - Week: the shift shows "5h/10h" and the five inside it;
//   - the Timebox: its lane is narrow (Handover beside the shift), so the shift says "5h/10h" at 14 px under its title and
//     the five sit 8 px in, at their real size;
//   - Handover's details say "Starts inside Shift and ends after it" with "Fit inside", which moves it to 17:00;
//   - the Free time button says "Free time"; the desktop details have no Task | Break control.
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
  const T = (id, title, startTime, durationMinutes) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, dueDate: today, startTime, durationMinutes });
  const inside = [
    ['briefing', 'Briefing', '08:30', 30],
    ['teams', 'Teams press meeting', '10:00', 60],
    ['patients', 'Ring patients', '11:00', 120],
    ['lunch', 'Lunch', '13:00', 30],
    ['depts', 'Ring other departments', '14:00', 60],
  ];
  fs.writeFileSync(path.join(dataDir, 'belific_tasks.kv'), JSON.stringify([T('shift', 'Shift', '08:00', 600), ...inside.map((a) => T(...a)), T('handover', 'Handover', '17:30', 60)]));
  const read = readKv(dataDir);
  const byId = (id) => (read('belific_tasks') || []).find((t) => t.id === id);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1440, 900);
  win.show();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await I.waitBody('Ring patients', 20000);

  // The shell and what is drawn inside it, in one column (sel: the column; key: how a block is named there).
  const readShell = (col, attr, prefix) =>
    I.js(`(() => {
      const root = ${col};
      if (!root) return null;
      const shell = root.querySelector('[${attr}="${prefix}shift"][data-shell]');
      if (!shell) return null;
      const s = shell.getBoundingClientRect();
      const lane = root.querySelector('[data-shell-inner]');
      const ids = ${JSON.stringify(inside.map((a) => a[0]))};
      const inner = ids.map((id) => {
        const b = root.querySelector('[data-shell-inner] [${attr}="${prefix}' + id + '"]');
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { id, top: Math.round(r.top - s.top), h: Math.round(r.height), l: Math.round(r.left - s.left), r: Math.round(s.right - r.right) };
      });
      const hand = root.querySelector('[${attr}="${prefix}handover"]');
      const h = hand ? hand.getBoundingClientRect() : null;
      const sum = shell.querySelector('[data-shell-summary]');
      const short = shell.querySelector('[data-shell-short]');
      return {
        text: shell.getAttribute('data-shell'),
        sum: sum ? [sum.innerText, parseFloat(getComputedStyle(sum).fontSize), getComputedStyle(sum).color] : null,
        short: short ? short.innerText : null,
        w: Math.round(s.width),
        inner,
        handInLane: !!(hand && hand.closest('[data-shell-inner]')),
        side: h ? h.left >= s.right - 2 || h.right <= s.left + 2 : null,
        lane: !!lane,
      };
    })()`);
  // 56 px an hour, a 1 px gap under each block.
  const real = (inner) => inner.every((b, i) => b && Math.abs(b.h + 1 - (inside[i][3] / 60) * 56) <= 2);
  const atTimes = (inner) => inner.every((b, i) => b && Math.abs(b.top - ((Number(inside[i][2].slice(0, 2)) * 60 + Number(inside[i][2].slice(3)) - 480) / 60) * 56) <= 2);
  const notRed = (c) => {
    const m = /rgba?\((\d+), (\d+), (\d+)/.exec(c || '');
    return !!m && !(Number(m[1]) > 180 && Number(m[2]) < 110 && Number(m[3]) < 110);
  };

  // ---- Calendar, Day ----
  await I.click(I.byLabel('Show the Calendar'), 800).catch(() => {});
  await I.key('d');
  await C.sleep(900);
  await I.js(`(() => { const s = document.querySelector('[data-cal-scroller]'); if (s) s.scrollTop = 7.5 * 56; })()`);
  await C.sleep(400);
  const day = await readShell(`document.querySelector('[data-cal-col="${today}"]')`, 'data-cal-block', `cal${today}:`);
  check('Day: the shift says "5h of 10h planned, 5h free"', !!day && day.text === '5h of 10h planned, 5h free' && !!day.sum && day.sum[0] === day.text, JSON.stringify(day && [day.text, day.sum]));
  check('Day: its summary is at least 14 px and not red', !!day && !!day.sum && day.sum[1] >= 14 && notRed(day.sum[2]), JSON.stringify(day && day.sum));
  check('Day: the five are drawn inside the shift, right of its header', !!day && day.inner.every((b) => b && b.l >= day.w * 0.35 && b.r >= -1), JSON.stringify(day && day.inner));
  check('Day: each at its real time and size', !!day && real(day.inner) && atTimes(day.inner), JSON.stringify(day && day.inner));
  check('Day: Handover (starts inside, ends after) sits beside the shift, not inside it', !!day && day.side === true && !day.handInLane, JSON.stringify(day && [day.side, day.handInLane]));
  await I.shot('p53-day');

  // ---- Calendar, Week ----
  await I.key('w');
  await C.sleep(1000);
  const week = await readShell(`document.querySelector('[data-cal-col="${today}"]')`, 'data-cal-block', `cal${today}:`);
  check('Week: the shift shows "5h/10h" under its title, the five inside it', !!week && week.short === '5h/10h' && week.inner.every((b) => b && b.l >= 6 && b.r >= -1) && real(week.inner), JSON.stringify(week && [week.short, week.inner]));
  await I.shot('p53-week');

  // ---- The Timebox ----
  await I.click(I.byLabel('Show Tasks'), 900).catch(() => {});
  await C.sleep(800);
  await I.js(`(() => { const g = document.querySelector('[data-timebox-grid]'); const s = g && g.parentElement; let n = g; while (n && n.scrollHeight <= n.clientHeight) n = n.parentElement; if (n) n.scrollTop = 7.5 * 56; })()`);
  await C.sleep(300);
  const tb = await readShell(`[...document.querySelectorAll('[data-timebox-grid]')].find((e) => e.getBoundingClientRect().width > 0)`, 'data-block-id', '');
  const tbShort = await I.js(`(() => { const e = [...document.querySelectorAll('[data-timebox-grid] [data-shell-short]')].find((x) => x.getBoundingClientRect().width > 0); return e ? [e.innerText, parseFloat(getComputedStyle(e).fontSize)] : null; })()`);
  check('Timebox: a narrow lane: "5h/10h" at 14 px under the title, the five inside the shift at their real size', !!tb && tb.text === '5h of 10h planned, 5h free' && !!tbShort && tbShort[0] === '5h/10h' && tbShort[1] >= 14 && tb.inner.every((b) => b && b.l >= 6 && b.r >= -1) && real(tb.inner), JSON.stringify(tb && [tb.text, tbShort, tb.inner]));
  check('the Free time button says "Free time"', (await I.textOf(`document.querySelector('[data-blade-button]')`)).includes('Free time'));
  await I.shot('p53-timebox');

  // ---- Fit inside ----
  await I.click(`[...document.querySelectorAll('[aria-label="Task Handover"]')].find((e) => e.getBoundingClientRect().width > 0)`, 900);
  await C.waitFor(() => I.exists(`document.querySelector('[data-detail-panel]')`), 4000);
  const text = await I.js(`document.querySelector('[data-detail-panel]').innerText`);
  check('details: no Task | Break control', !(await I.exists(`document.querySelector('[data-detail-panel] [data-kind-choice]')`)));
  check('details: "Starts inside Shift and ends after it", with a visible "Fit inside"', text.includes('Starts inside Shift and ends after it') && (await I.exists(`document.querySelector('[data-detail-panel] [data-fit-inside]')`)), text);
  await I.shot('p53-fit');
  await I.click(`document.querySelector('[data-detail-panel] [data-fit-inside]')`, 900);
  await C.waitFor(() => byId('handover').startTime === '17:00', 4000).catch(() => {});
  check('Fit inside moves Handover to 17:00, the same length', byId('handover').startTime === '17:00' && byId('handover').durationMinutes === 60, JSON.stringify(byId('handover')));
  await I.blur();
  await I.key('Escape');
  await C.sleep(700);
  const after = await I.js(`!!document.querySelector('[data-shell-inner] [data-block-id="handover"]')`);
  check('and it is now drawn inside the shift: "6h of 10h planned, 4h free"', after && (await I.exists(`document.querySelector('[data-block-id="shift"][data-shell="6h of 10h planned, 4h free"]')`)));

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
