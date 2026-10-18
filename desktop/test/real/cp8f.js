'use strict';
// Real pointer and keyboard check for the duration chip and dropdown (2.13.0)
// and the removal of Actual time (2.14.0, decision 022 superseded). Real mouse
// and key events into the real app on an isolated data folder asserted NOT to
// be the real one.
const fs = require('node:fs');
const path = require('node:path');
const { app, shell } = require('electron');
const C = require('./common');

process.env.BELIFIC_NO_PROTOCOL_REGISTER = '1';
const userData = C.isolate();
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
  const read = (key) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dataDir, `${key}.kv`), 'utf8'));
    } catch {
      return [];
    }
  };
  const taskNamed = (title) => read('belific_tasks').find((x) => x.title === title && !x.deletedAt);
  const taskById = (id) => read('belific_tasks').find((x) => x.id === id);

  {
    fs.writeFileSync(
      path.join(dataDir, 'belific_tasks.kv'),
      JSON.stringify([
        t('fresh', 'Fresh', { dueDate: today }),
        t('placed', 'Placed', { dueDate: today, startTime: '09:30', durationMinutes: 15 }),
        // A task stored by 2.13.0 with Actual time: it is stripped on load.
        t('legacy', 'Legacy', { dueDate: today, actualSeconds: 5400 }),
        t('th1', 'Thought one'),
        t('th2', 'Thought two'),
        t('th3', 'Thought three'),
      ]),
    );
  }

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  const js = (code) => win.webContents.executeJavaScript(code, true);
  win.show();
  win.focus();
  win.webContents.focus();
  const body = () => js('document.body.innerText');
  await C.waitFor(async () => (await body()).includes('Fresh'), 20000);

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

  {
    // ---- the card's time figure (2.27.0: a face, not a control) ----
    // The estimate (or, for a placed task, its start time) is plain text; a click
    // anywhere on the card opens the details, where the estimate is set.
    const modal = '[role="dialog"][aria-label="Task details"]';
    const inModal = (inner) => q(`${modal} ${inner}`);
    const modalOpen = () => exists(q(modal));
    const openModal = async (title) => {
      // The time figure sits under the hover icons; the title is the usual place to click.
      await click(inCard(title, `[aria-label="Title ${title}"]`), 500);
      await C.waitFor(() => modalOpen(), 4000).catch(() => {});
    };
    const closeModal = async () => {
      await press('Escape');
      await C.waitFor(async () => !(await modalOpen()), 3000).catch(() => {});
    };
    const custom = async (text) => {
      await click(inModal('[aria-label="Custom estimate"]'), 150);
      await js('document.activeElement.select && document.activeElement.select()');
      await type(text);
      await enter();
    };
    const timeText = (title) => js(`(() => { const el = ${inCard(title, '[data-card-time]')}; return el ? el.innerText.trim() : null; })()`);
    check('card: a new task shows 0:00 (not None)', (await timeText('Fresh')) === '0:00', String(await timeText('Fresh')));
    check('card: a placed task shows its start time', (await timeText('Placed')) === '09:30', String(await timeText('Placed')));
    await shot('cp8f-chip');

    // ---- the estimate in the details ----
    await openModal('Fresh');
    check('a click on the card opens the details (the time figure is not a control of its own)', (await modalOpen()) && !(await popover()) && (await js(`${inCard('Fresh', '[data-card-time]')}.getAttribute('role')`)) !== 'button');
    const labels = await js(`Array.from(document.querySelectorAll('${modal} [data-detail-row="Estimated time"] [aria-pressed]')).map((e) => e.getAttribute('aria-label'))`);
    check(
      'the presets are listed in order, with "None" first',
      JSON.stringify(labels) === JSON.stringify(['None', '5 min', '10 min', '15 min', '30 min', '45 min', '1h', '1h 30m', '2h']),
      JSON.stringify(labels),
    );
    check('the custom field reads "Custom: 45m, 1h 30m, 130"', (await js(`${inModal('[aria-label="Custom estimate"]')}.placeholder`)) === 'Custom: 45m, 1h 30m, 130');
    await shot('cp8f-dropdown');

    // ---- pick a preset ----
    await click(inModal('[aria-label="15 min"]'));
    await waitFile(() => taskNamed('Fresh').durationMinutes === 15);
    check('picking "15 min" saves 15', taskNamed('Fresh').durationMinutes === 15);
    await C.waitFor(async () => (await timeText('Fresh')) === '0:15', 5000).catch(() => {});
    check('the card now shows 0:15', (await timeText('Fresh')) === '0:15', String(await timeText('Fresh')));
    check('the current preset is marked and the others are not', (await js(`${inModal('[aria-label="15 min"]')}.getAttribute('aria-pressed')`)) === 'true' && (await js(`${inModal('[aria-label="30 min"]')}.getAttribute('aria-pressed')`)) === 'false');

    // ---- type "1h 30m" (real keys, with the space) ----
    await click(inModal('[aria-label="Custom estimate"]'), 150);
    await type('1h 30m');
    check('typed text is exact, spaces included', (await activeValue()) === '1h 30m', String(await activeValue()));
    await enter();
    await waitFile(() => taskNamed('Fresh').durationMinutes === 90);
    check('"1h 30m" + Enter saves 90', taskNamed('Fresh').durationMinutes === 90);
    await C.waitFor(async () => (await timeText('Fresh')) === '1:30', 5000).catch(() => {});
    check('the card shows 1:30', (await timeText('Fresh')) === '1:30', String(await timeText('Fresh')));

    // ---- type "130" ----
    await custom('130');
    await waitFile(() => taskNamed('Fresh').durationMinutes === 130);
    check('"130" (bare number = minutes) saves 130', taskNamed('Fresh').durationMinutes === 130);

    // ---- invalid input applies nothing and shows a quiet hint ----
    await custom('soon');
    check('invalid text: a quiet hint, nothing applied', (await js(`${q(modal)}.innerText`)).includes('Not a time') && taskNamed('Fresh').durationMinutes === 130);
    for (const bad of ['0', '1441']) {
      await custom(bad);
      await C.sleep(300);
      check(`"${bad}" is rejected, nothing applied`, taskNamed('Fresh').durationMinutes === 130);
    }
    await custom('1.5h');
    await waitFile(() => taskNamed('Fresh').durationMinutes === 90);
    check('"1.5h" saves 90', taskNamed('Fresh').durationMinutes === 90);
    await custom('1:30');
    await C.sleep(300);
    check('"1:30" saves 90', taskNamed('Fresh').durationMinutes === 90);

    // ---- None ----
    await click(inModal('[aria-label="None"]'));
    await waitFile(() => taskNamed('Fresh').durationMinutes === undefined);
    await C.waitFor(async () => (await timeText('Fresh')) === '0:00', 5000).catch(() => {});
    check('"None" clears it and the card shows 0:00 again', taskNamed('Fresh').durationMinutes === undefined && (await timeText('Fresh')) === '0:00');
    check('there is no old Custom hours and minutes picker', !(await exists(`document.querySelector('select[aria-label="Hours"]')`)));
    await closeModal();

    // ---- spacing (2.14.0): about 12px between cards, about 10px between left rows ----
    const gaps = (sel) => js(`(() => {
      const els = Array.from(document.querySelectorAll(${JSON.stringify(sel)})).map((e) => e.getBoundingClientRect()).sort((a, b) => a.top - b.top);
      const out = [];
      for (let i = 1; i < els.length; i++) out.push(Math.round((els[i].top - els[i - 1].bottom) * 10) / 10);
      return out;
    })()`);
    const colGaps = await js(`(() => {
      const cols = {};
      for (const el of document.querySelectorAll('[data-task-card]:not([aria-label^="Task Thought"])')) {
        const r = el.getBoundingClientRect();
        (cols[Math.round(r.left)] = cols[Math.round(r.left)] || []).push(r);
      }
      const out = {};
      for (const k of Object.keys(cols)) {
        const l = cols[k].sort((a, b) => a.top - b.top);
        out[k] = l.slice(1).map((r, i) => Math.round((r.top - l[i].bottom) * 10) / 10);
      }
      return out;
    })()`);
    const sameColumn = Object.values(colGaps).flat();
    // 2.26.0: 10 px, the reference's measured gap between cards.
    check('spacing: cards in a column are about 10px apart', sameColumn.length > 0 && sameColumn.every((g) => g >= 9 && g <= 11), JSON.stringify(colGaps));
    const rowGaps = await js(`(() => {
      const rows = Array.from(document.querySelectorAll('[aria-label^="Task Thought"]')).map((e) => e.getBoundingClientRect()).sort((a, b) => a.top - b.top);
      return rows.slice(1).map((r, i) => Math.round((r.top - rows[i].bottom) * 10) / 10);
    })()`);
    check('spacing: left list rows are about 10px apart', rowGaps.length === 2 && rowGaps.every((g) => g >= 9 && g <= 11), JSON.stringify(rowGaps));
    await shot('cp8f-spacing');

    // ---- Actual time (build plan phase 2, decision 028): the timer is in the details ----
    await openModal('Fresh');
    check('the details have the timer button (build plan phase 2)', await exists(inModal('[aria-label="Start the timer"]')));
    check('the stored task has no actualSeconds field', !('actualSeconds' in taskNamed('Fresh')));
    await closeModal();
    // A task stored by 2.13.0 with Actual time: any save of it rewrites it without the field.
    await openModal('Legacy');
    await click(inModal('[aria-label="30 min"]'));
    await waitFile(() => taskNamed('Legacy').durationMinutes === 30);
    check('a legacy actualSeconds in the stored data is stripped when the task is next saved', !('actualSeconds' in taskNamed('Legacy')) && taskNamed('Legacy').durationMinutes === 30);
    await closeModal();
    check('no full viewport overlay is left once the details are closed', await noNewOverlay());
    app.exit(summary() ? 1 : 0);
  }
}
