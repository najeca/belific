'use strict';
// Real pointer and keyboard check for 2.13.0 (checkpoint 8.3): the duration chip
// and dropdown, Estimated and Actual with the timer, forgotten timers, and a
// timer that survives a relaunch. Real mouse and key events into the real app
// on an isolated data folder asserted NOT to be the real one.
//
// BELIFIC_PHASE: "1" the interaction check (leaves a timer running on Runner),
// "2" relaunch on the same folder, "3" a timer left running over 12 hours and
// answered with Add, "4" the same answered with a typed time, "5" startup with
// stored timers whose tasks are gone or completed. BELIFIC_SHOTS: screenshots.
const fs = require('node:fs');
const path = require('node:path');
const { app, shell } = require('electron');
const C = require('./common');

process.env.BELIFIC_NO_PROTOCOL_REGISTER = '1';
const userData = C.isolate();
const PHASE = process.env.BELIFIC_PHASE || '1';
const SHOTS = process.env.BELIFIC_SHOTS || '';
const pad = (n) => String(n).padStart(2, '0');
console.log(`USERDATA ${userData}`);

run().catch((err) => {
  console.log(`FAIL harness error: ${err.stack || err}`);
  app.exit(1);
});

async function run() {
  const { check, summary } = C.makeChecker();
  shell.openExternal = async () => {};
  const now = new Date();
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const t = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: '2026-10-06T08:00:00.000Z', updatedAt: '2026-10-06T08:00:00.000Z', ...extra });
  const timerFile = path.join(dataDir, 'belific_timer.kv');
  const storedTimer = () => {
    try {
      return JSON.parse(fs.readFileSync(timerFile, 'utf8'));
    } catch {
      return null;
    }
  };
  const read = (key) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dataDir, `${key}.kv`), 'utf8'));
    } catch {
      return [];
    }
  };
  const taskNamed = (title) => read('belific_tasks').find((x) => x.title === title && !x.deletedAt);
  const taskById = (id) => read('belific_tasks').find((x) => x.id === id);

  if (PHASE === '1') {
    fs.writeFileSync(
      path.join(dataDir, 'belific_tasks.kv'),
      JSON.stringify([
        t('fresh', 'Fresh', { dueDate: today }),
        t('placed', 'Placed', { dueDate: today, startTime: '09:30', durationMinutes: 15 }),
        t('second', 'Second', { dueDate: today }),
        t('deleter', 'Deleter', { dueDate: today }),
        t('runner', 'Runner', { dueDate: today }),
      ]),
    );
  } else if (PHASE === '3' || PHASE === '4') {
    fs.writeFileSync(path.join(dataDir, 'belific_tasks.kv'), JSON.stringify([t('forgot', 'Forgot', { dueDate: today }), t('other', 'Other', { dueDate: today })]));
    // Started 14 hours 20 minutes ago.
    fs.writeFileSync(timerFile, JSON.stringify({ taskId: 'forgot', startedAt: Date.now() - (14 * 3600 + 20 * 60) * 1000 }));
  } else if (PHASE === '5') {
    fs.writeFileSync(
      path.join(dataDir, 'belific_tasks.kv'),
      JSON.stringify([t('live', 'Live', { dueDate: today }), t('done', 'Done', { dueDate: today, completed: true }), t('tomb', 'Tomb', { deletedAt: '2026-10-06T09:00:00.000Z' })]),
    );
    fs.writeFileSync(timerFile, JSON.stringify({ taskId: 'done', startedAt: Date.now() - 60000 }));
  }

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  const js = (code) => win.webContents.executeJavaScript(code, true);
  win.show();
  win.focus();
  win.webContents.focus();
  const body = () => js('document.body.innerText');
  const first = { 1: 'Fresh', 2: 'Runner', 3: 'Forgot', 4: 'Forgot', 5: 'Live' }[PHASE];
  await C.waitFor(async () => (await body()).includes(first), 20000);

  const rectOf = (expr) =>
    js(`(() => { const el = ${expr}; if (!el) return null; el.scrollIntoView({ block: 'center', inline: 'center' }); const r = el.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
  const click = async (expr, wait = 200) => {
    const firstRect = await rectOf(expr);
    if (!firstRect) throw new Error(`no element for ${expr}`);
    win.webContents.sendInputEvent({ type: 'mouseMove', x: firstRect.x, y: firstRect.y });
    await C.sleep(250);
    let r = await rectOf(expr);
    for (let i = 0; i < 10; i++) {
      win.webContents.sendInputEvent({ type: 'mouseMove', x: r.x, y: r.y });
      await C.sleep(150);
      const again = await rectOf(expr);
      const same = again && again.x === r.x && again.y === r.y;
      r = again || r;
      if (same) break;
    }
    win.webContents.sendInputEvent({ type: 'mouseDown', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    win.webContents.sendInputEvent({ type: 'mouseUp', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    await C.sleep(wait);
  };
  const enter = async () => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
    win.webContents.sendInputEvent({ type: 'char', keyCode: String.fromCharCode(13) });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
    await C.sleep(150);
  };
  const press = async (keyCode) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode });
    await C.sleep(100);
  };
  // Real typing: key down, char and key up for every character (spaces too).
  const type = async (text) => {
    for (const ch of text) {
      const keyCode = ch === ' ' ? 'Space' : ch;
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode });
      win.webContents.sendInputEvent({ type: 'char', keyCode: ch });
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode });
      await C.sleep(15);
    }
    await C.sleep(150);
  };
  const q = (sel) => `document.querySelector(${JSON.stringify(sel)})`;
  const cardSel = (title) => `[aria-label="Task ${title}"]:not([data-block-id])`;
  const inCard = (title, inner) => q(`${cardSel(title)} ${inner}`);
  const exists = (expr) => js(`!!${expr}`);
  const popover = () => exists(q('[data-popover]'));
  const inPopover = (inner) => q(`[data-popover] ${inner}`);
  const activeValue = () => js('document.activeElement && document.activeElement.value');
  const activeLabel = () => js(`document.activeElement && document.activeElement.getAttribute('aria-label')`);
  const cardText = (title) => js(`(() => { const el = ${q(cardSel(title))}; return el ? el.innerText : ''; })()`);
  const chipText = (title) => js(`(() => { const el = ${inCard(title, '[aria-label^="Duration of"]')}; return el ? el.innerText.trim() : null; })()`);
  const chipLabel = (title) => js(`(() => { const el = ${inCard(title, '[aria-label^="Duration of"]')}; return el ? el.getAttribute('aria-label') : null; })()`);
  const expanded = (title) => exists(inCard(title, '[aria-label^="Add subtask to"]'));
  const expand = async (title) => {
    if (!(await expanded(title))) await click(inCard(title, '[aria-label^="Subtasks"]'));
    await C.waitFor(() => expanded(title), 5000);
  };
  const shot = async (name) => {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(SHOTS, `${name}.png`), img.toPNG());
  };
  const overlays = () =>
    js(`(() => {
      const out = [];
      for (const el of document.querySelectorAll('*')) {
        const s = getComputedStyle(el);
        if (s.position !== 'fixed' && s.position !== 'absolute') continue;
        const r = el.getBoundingClientRect();
        if (r.width < innerWidth * 0.9 || r.height < innerHeight * 0.9) continue;
        const bg = s.backgroundColor;
        const visible = bg && bg !== 'transparent' && !/rgba\\(\\s*\\d+,\\s*\\d+,\\s*\\d+,\\s*0\\s*\\)/.test(bg);
        if (visible) out.push(el.tagName + ':' + (el.getAttribute('aria-label') || el.className).toString().slice(0, 30));
      }
      return out;
    })()`);
  const baseline = new Set(await overlays());
  const noNewOverlay = async () => (await overlays()).filter((o) => !baseline.has(o)).length === 0;
  const waitFile = (pred, ms = 8000) => C.waitFor(() => pred(), ms);

  // ============================================================== phase 1
  if (PHASE === '1') {
    // ---- the chip ----
    check('chip: a new task shows 0:00 (not None)', (await chipText('Fresh')) === '0:00', String(await chipText('Fresh')));
    check('chip: a placed task shows its duration as H:MM', (await chipText('Placed')) === '0:15', String(await chipText('Placed')));
    const startTimeText = await js(`(() => { const el = Array.from(document.querySelectorAll(${JSON.stringify(cardSel('Placed') + ' *')})).find((e) => e.children.length === 0 && e.textContent === '09:30'); return el ? el.textContent : null; })()`);
    check('chip: the start time of a placed task is its own small text, not inside the chip', startTimeText === '09:30' && !(await chipLabel('Placed')).includes('·') && (await chipText('Placed')) === '0:15');
    await shot('cp8f-chip');

    // ---- the dropdown ----
    await click(inCard('Fresh', '[aria-label^="Duration of"]'));
    check('the chip opens a small dropdown', await popover());
    check('the field is focused, placeholder "45m, 1h 30m, 130..."', (await activeLabel()) === 'Duration' && (await js(`document.activeElement.placeholder`)) === '45m, 1h 30m, 130...');
    const pr = await js(`(() => { const r = ${q('[data-popover]')}.getBoundingClientRect(); return { w: r.width, h: r.height, vw: innerWidth, vh: innerHeight }; })()`);
    check('the dropdown is small and inside the window', pr.w < 400 && pr.h <= 330 && pr.w < pr.vw / 2 && pr.h < pr.vh / 2 && pr.h > 100);
    check('no full viewport overlay while it is open', await noNewOverlay());
    const labels = await js(`Array.from(document.querySelectorAll('[data-popover] [role="button"]')).map((e) => e.getAttribute('aria-label'))`);
    check(
      'the presets are listed in order, with "No duration" first',
      JSON.stringify(labels) === JSON.stringify(['No duration', '5 min', '10 min', '15 min', '20 min', '30 min', '45 min', '1h', '1h 30m', '2h', '3h', '4h']),
      JSON.stringify(labels),
    );
    check('the preset list scrolls inside the dropdown', await js(`(() => { let e = ${inPopover('[aria-label="4h"]')}; while (e && e.getAttribute('data-popover') === null) { if (getComputedStyle(e).overflowY === 'auto' && e.scrollHeight > e.clientHeight) return true; e = e.parentElement; } return false; })()`));
    await C.sleep(400);
    await shot('cp8f-dropdown');
    await press('Escape');
    check('Escape closes the dropdown', !(await popover()));

    // ---- pick a preset ----
    await click(inCard('Fresh', '[aria-label^="Duration of"]'));
    await click(inPopover('[aria-label="15 min"]'));
    await waitFile(() => taskNamed('Fresh').durationMinutes === 15);
    check('picking "15 min" saves 15 and closes the dropdown', taskNamed('Fresh').durationMinutes === 15 && !(await popover()));
    await C.waitFor(async () => (await chipText('Fresh')) === '0:15', 5000).catch(() => {});
    check('the chip now shows 0:15', (await chipText('Fresh')) === '0:15', String(await chipText('Fresh')));
    await click(inCard('Fresh', '[aria-label^="Duration of"]'));
    const ticked = (label) => js(`(() => { const e = ${q(`[data-popover] [aria-label="${label}"]`)}; return e ? e.children.length : -1; })()`);
    check('the current preset has a tick (an extra check mark beside the label) and the others do not', (await ticked('15 min')) === 2 && (await ticked('30 min')) === 1);

    // ---- type "1h 30m" (real keys, with the space) ----
    await type('1h 30m');
    check('typed text is exact, spaces included', (await activeValue()) === '1h 30m', String(await activeValue()));
    check('typing does not close the dropdown', await popover());
    await enter();
    await waitFile(() => taskNamed('Fresh').durationMinutes === 90);
    check('"1h 30m" + Enter saves 90 and closes', taskNamed('Fresh').durationMinutes === 90 && !(await popover()));
    await C.waitFor(async () => (await chipText('Fresh')) === '1:30', 5000).catch(() => {});
    check('the chip shows 1:30', (await chipText('Fresh')) === '1:30', String(await chipText('Fresh')));

    // ---- type "130" ----
    await click(inCard('Fresh', '[aria-label^="Duration of"]'));
    await type('130');
    await enter();
    await waitFile(() => taskNamed('Fresh').durationMinutes === 130);
    check('"130" (bare number = minutes) saves 130', taskNamed('Fresh').durationMinutes === 130);

    // ---- invalid input applies nothing and shows a quiet hint ----
    await click(inCard('Fresh', '[aria-label^="Duration of"]'));
    await type('soon');
    await enter();
    check('invalid text: the dropdown stays open with a hint, nothing applied', (await popover()) && (await js(`${q('[data-popover]')}.innerText`)).includes('Not a duration') && taskNamed('Fresh').durationMinutes === 130);
    await press('Escape');
    for (const bad of ['0', '1441']) {
      await click(inCard('Fresh', '[aria-label^="Duration of"]'));
      await type(bad);
      await enter();
      check(`"${bad}" is rejected, nothing applied`, (await popover()) && taskNamed('Fresh').durationMinutes === 130);
      await press('Escape');
    }
    await click(inCard('Fresh', '[aria-label^="Duration of"]'));
    await type('1.5h');
    await enter();
    await waitFile(() => taskNamed('Fresh').durationMinutes === 90);
    check('"1.5h" saves 90', taskNamed('Fresh').durationMinutes === 90);
    await click(inCard('Fresh', '[aria-label^="Duration of"]'));
    await type('1:30');
    await enter();
    await C.sleep(300);
    check('"1:30" saves 90', taskNamed('Fresh').durationMinutes === 90 && !(await popover()));

    // ---- No duration ----
    await click(inCard('Fresh', '[aria-label^="Duration of"]'));
    await click(inPopover('[aria-label="No duration"]'));
    await waitFile(() => taskNamed('Fresh').durationMinutes === undefined);
    await C.waitFor(async () => (await chipText('Fresh')) === '0:00', 5000).catch(() => {});
    check('"No duration" clears it and the chip shows 0:00 again', taskNamed('Fresh').durationMinutes === undefined && (await chipText('Fresh')) === '0:00');
    check('there is no old Custom hours and minutes picker', !(await exists(`document.querySelector('select[aria-label="Hours"]')`)));

    // ---- Estimated and Actual ----
    await click(inCard('Fresh', '[aria-label^="Duration of"]'));
    await click(inPopover('[aria-label="1h 30m"]'));
    await waitFile(() => taskNamed('Fresh').durationMinutes === 90);
    await expand('Fresh');
    const txt = await cardText('Fresh');
    check('expanded: "Actual 0h 0m" and "Estimated 1h 30m" are shown', txt.includes('Actual 0h 0m') && txt.includes('Estimated 1h 30m'), txt);
    check('the play button is there', await exists(inCard('Fresh', '[aria-label="Start timer for Fresh"]')));
    await shot('cp8f-expanded');
    await click(inCard('Fresh', '[aria-label^="Estimated time"]'));
    check('clicking Estimated opens the same dropdown', (await popover()) && (await activeLabel()) === 'Duration');
    await press('Escape');

    // ---- the timer: start, wait, stop ----
    await click(inCard('Fresh', '[aria-label="Start timer for Fresh"]'));
    await waitFile(() => storedTimer() && storedTimer().taskId === 'fresh');
    check('start: the timer is stored with a timestamp, in the main process store', storedTimer().taskId === 'fresh' && typeof storedTimer().startedAt === 'number');
    check('a running card shows the quiet running dot and the pause button', (await exists(inCard('Fresh', '[aria-label="Timer running"]'))) && (await exists(inCard('Fresh', '[aria-label="Stop timer for Fresh"]'))));
    await shot('cp8f-running');
    await C.sleep(2500);
    await click(inCard('Fresh', '[aria-label="Stop timer for Fresh"]'));
    await waitFile(() => storedTimer() === null);
    await waitFile(() => taskNamed('Fresh').actualSeconds !== undefined);
    const secs = taskNamed('Fresh').actualSeconds;
    check('stop: Actual is stored in whole seconds (about 2.5 s here)', Number.isInteger(secs) && secs >= 2 && secs <= 8, String(secs));
    check('stop: the timer is cleared and the dot is gone', storedTimer() === null && !(await exists(inCard('Fresh', '[aria-label="Timer running"]'))));
    check('the saved task keeps its estimate', taskNamed('Fresh').durationMinutes === 90);

    // ---- only one timer runs ----
    await expand('Second');
    await click(inCard('Fresh', '[aria-label="Start timer for Fresh"]'));
    await waitFile(() => storedTimer() && storedTimer().taskId === 'fresh');
    await C.sleep(1500);
    await click(inCard('Second', '[aria-label="Start timer for Second"]'));
    await waitFile(() => storedTimer() && storedTimer().taskId === 'second');
    check('starting another stops the first and saves its time', taskNamed('Fresh').actualSeconds >= secs + 1, `${taskNamed('Fresh').actualSeconds} vs ${secs}`);
    check('only one timer is stored, for the second task', storedTimer().taskId === 'second');
    check('only one running dot on screen', (await js(`document.querySelectorAll('[aria-label="Timer running"]').length`)) >= 1 && !(await exists(inCard('Fresh', '[aria-label="Timer running"]'))));

    // ---- completing stops the timer ----
    await C.sleep(1500);
    await click(inCard('Second', '[aria-label="Mark Second complete"]'));
    await waitFile(() => storedTimer() === null);
    await waitFile(() => taskNamed('Second') && taskNamed('Second').completed);
    check('completing the task stops its timer and keeps the time', storedTimer() === null && taskNamed('Second').actualSeconds >= 1, String(taskNamed('Second').actualSeconds));

    // ---- correct Actual by typing ----
    await click(inCard('Fresh', '[aria-label^="Actual time"]'));
    check('clicking Actual shows a field', (await activeLabel()) === 'Actual time for Fresh');
    const before = taskNamed('Fresh').actualSeconds;
    await type('nope');
    await enter();
    check('an invalid Actual shows a hint and changes nothing', (await cardText('Fresh')).includes('Not a time') && taskNamed('Fresh').actualSeconds === before);
    await js(`document.activeElement.select()`);
    await type('1h 30m');
    await enter();
    await waitFile(() => taskNamed('Fresh').actualSeconds === 5400);
    check('typing "1h 30m" sets Actual to 5400 seconds', taskNamed('Fresh').actualSeconds === 5400);
    await C.waitFor(async () => (await cardText('Fresh')).includes('Actual 1h 30m'), 5000).catch(() => {});
    check('the card shows Actual 1h 30m', (await cardText('Fresh')).includes('Actual 1h 30m'), await cardText('Fresh'));

    // ---- deleting a task with a running timer ----
    await expand('Deleter');
    await click(inCard('Deleter', '[aria-label="Start timer for Deleter"]'));
    await waitFile(() => storedTimer() && storedTimer().taskId === 'deleter');
    await C.sleep(1200);
    await click(inCard('Deleter', '[aria-label="More actions for Deleter"]'));
    await click(inPopover('[aria-label="Delete task"]'));
    await click(inPopover('[aria-label="Confirm delete task"]'));
    await waitFile(() => storedTimer() === null);
    check('deleting a task with a running timer clears the timer', storedTimer() === null);
    check('no time was added to the deleted task', taskById('deleter').deletedAt && taskById('deleter').actualSeconds === undefined);

    // ---- leave a timer running for the relaunch check ----
    await expand('Runner');
    await click(inCard('Runner', '[aria-label="Start timer for Runner"]'));
    await waitFile(() => storedTimer() && storedTimer().taskId === 'runner');
    await C.sleep(2500);
    check('Runner is running when the app closes', storedTimer().taskId === 'runner');
    check('no full viewport overlay at any point', await noNewOverlay());
    app.exit(summary() ? 1 : 0);
    return;
  }

  // ============================================================== phase 2
  if (PHASE === '2') {
    check('relaunch: the stored timer is still there', storedTimer() && storedTimer().taskId === 'runner');
    await C.waitFor(async () => (await exists(inCard('Runner', '[aria-label="Timer running"]'))), 8000).catch(() => {});
    check('relaunch: Runner still shows the running dot', await exists(inCard('Runner', '[aria-label="Timer running"]')));
    await expand('Runner');
    check('relaunch: the card offers Stop', await exists(inCard('Runner', '[aria-label="Stop timer for Runner"]')));
    await shot('cp8f-relaunch');
    await click(inCard('Runner', '[aria-label="Stop timer for Runner"]'));
    await waitFile(() => storedTimer() === null);
    await waitFile(() => taskNamed('Runner').actualSeconds !== undefined);
    check('stopping after the relaunch counts the time from before it (more than 4 s)', taskNamed('Runner').actualSeconds >= 4, String(taskNamed('Runner').actualSeconds));
    check('no full viewport overlay', await noNewOverlay());
    app.exit(summary() ? 1 : 0);
    return;
  }

  // ============================================================== phases 3 and 4
  if (PHASE === '3' || PHASE === '4') {
    check('the stored timer (14h 20m old) survived startup: the task is live', storedTimer() && storedTimer().taskId === 'forgot');
    await expand('Forgot');
    await click(inCard('Forgot', '[aria-label="Stop timer for Forgot"]'));
    const text = await C.waitFor(async () => {
      const x = await cardText('Forgot');
      return x.includes('Add it, or enter a different time?') ? x : null;
    }, 6000).catch(() => '');
    check('stopping asks inline: "That\'s 14h 20m. Add it, or enter a different time?"', /That's 14h 20m\. Add it, or enter a different time\?/.test(text), text);
    check('nothing was added automatically and the timer still runs', taskNamed('Forgot').actualSeconds === undefined && storedTimer() && storedTimer().taskId === 'forgot');
    check('the prompt is on the card: no modal, no dropdown, no overlay', !(await popover()) && (await noNewOverlay()));
    await shot(`cp8f-forgot-${PHASE}`);
    if (PHASE === '3') {
      await click(inCard('Forgot', '[aria-label="Add the time"]'));
      await waitFile(() => storedTimer() === null);
      await waitFile(() => taskNamed('Forgot').actualSeconds !== undefined);
      const s = taskNamed('Forgot').actualSeconds;
      check('Add: the 14h 20m is added (51600 seconds)', s >= 51600 && s <= 51660, String(s));
    } else {
      await click(inCard('Forgot', '[aria-label="A different time"]'));
      await type('1h 30m');
      await enter();
      await waitFile(() => storedTimer() === null);
      await waitFile(() => taskNamed('Forgot').actualSeconds !== undefined);
      check('typed "1h 30m": exactly 5400 seconds are added instead', taskNamed('Forgot').actualSeconds === 5400, String(taskNamed('Forgot').actualSeconds));
    }
    check('the prompt closes and the timer is stopped', !(await cardText('Forgot')).includes('Add it, or enter') && storedTimer() === null);
    app.exit(summary() ? 1 : 0);
    return;
  }

  // ============================================================== phase 5
  if (PHASE === '5') {
    await C.waitFor(() => storedTimer() === null, 8000).catch(() => {});
    check('startup drops a stored timer whose task is completed', storedTimer() === null);
    check('no time was added to it', taskById('done').actualSeconds === undefined);
    check('no running dot on any card', !(await exists(`document.querySelector('[aria-label="Timer running"]')`)));
    app.exit(summary() ? 1 : 0);
  }
}
