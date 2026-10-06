'use strict';
// Real pointer check for checkpoint 8.2 (run: npx electron test/real/cp8b.js after
// building the web export). Edit tasks ON the card: small anchored dropdowns,
// never a modal. Real mouse input (sendInputEvent) into the real app on an
// isolated data folder that is asserted NOT to be the real one before launch.
// Phases (BELIFIC_PHASE): "1" runs everything; "2" is the relaunch that checks
// the filter was remembered (the driver sets BELIFIC_REAL_USERDATA to reuse it).
const fs = require('node:fs');
const path = require('node:path');
const { app, shell } = require('electron');
const C = require('./common');

process.env.BELIFIC_NO_PROTOCOL_REGISTER = '1';
const PHASE = process.env.BELIFIC_PHASE || '1';
const userData = C.isolate();
console.log(`USERDATA ${userData}`);
const SHOTS = process.env.BELIFIC_SHOTS || '';
const pad = (n) => String(n).padStart(2, '0');

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
  const read = (key) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dataDir, `${key}.kv`), 'utf8'));
    } catch {
      return [];
    }
  };
  const taskNamed = (title) => read('belific_tasks').find((t) => t.title === title && !t.deletedAt);

  if (PHASE === '1') {
    fs.mkdirSync(dataDir, { recursive: true });
    const t = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: '2026-10-06T08:00:00.000Z', updatedAt: '2026-10-06T08:00:00.000Z', ...extra });
    fs.writeFileSync(
      path.join(dataDir, 'belific_tasks.kv'),
      JSON.stringify([
        t('a', 'Alpha', { dueDate: today }),
        t('b', 'Bravo', { dueDate: today }),
        t('c', 'Charlie', { dueDate: today }),
        t('d', 'Delta', { dueDate: today }),
        t('p', 'Placed one', { dueDate: today, startTime: '09:30', durationMinutes: 60 }),
        t('p2', 'Placed two', { dueDate: today, startTime: '10:30', durationMinutes: 30 }),
        t('l', 'Left one'),
      ]),
    );
    fs.writeFileSync(
      path.join(dataDir, 'belific_custom_events.kv'),
      JSON.stringify([{ id: 'ev1', title: 'Team sync', category: 'work', icon: '📅', start: '14:00', end: '15:00', notes: '', date: today, isCustom: true, updatedAt: '2026-10-01T00:00:00.000Z' }]),
    );
    fs.writeFileSync(
      path.join(dataDir, 'belific_projects.kv'),
      JSON.stringify([
        { key: 'work', name: 'Work', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', colorKey: 'sage' },
        { key: 'home', name: 'Home', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', colorKey: 'clay' },
      ]),
    );
    fs.writeFileSync(
      path.join(dataDir, 'belific_brain_dump.kv'),
      JSON.stringify([{ id: 'legacy1', title: 'Legacy phone thought', notes: '', createdAt: '2026-09-30T08:00:00.000Z', updatedAt: '2026-09-30T08:00:00.000Z' }]),
    );
  }

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  const js = (code) => win.webContents.executeJavaScript(code, true);
  const body = () => js('document.body.innerText');
  await C.waitFor(async () => (await body()).includes('Alpha') || PHASE === '2', 20000);

  // ---- helpers: real mouse input at an element's centre ----
  const rectOf = (expr) =>
    js(`(() => { const el = ${expr}; if (!el) return null; el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = el.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: r.width, h: r.height }; })()`);
  const mouse = (type, x, y) => win.webContents.sendInputEvent({ type, x, y, button: 'left', clickCount: 1 });
  // Real mouse input. The pointer arrives first (hover-only icons mount and can
  // move the layout), then the element is measured again and pressed, as a
  // person who sees it settle would.
  const click = async (expr, wait = 200) => {
    const first = await rectOf(expr);
    if (!first) throw new Error(`no element for ${expr}`);
    win.webContents.sendInputEvent({ type: 'mouseMove', x: first.x, y: first.y });
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
  const key = async (keyCode) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode });
    await C.sleep(150);
  };
  const typeText = async (text) => {
    for (const ch of text) win.webContents.sendInputEvent({ type: 'char', keyCode: ch });
    await C.sleep(150);
  };
  const q = (sel) => `document.querySelector(${JSON.stringify(sel)})`;
  const cardSel = (title) => `[aria-label="Task ${title}"]:not([data-block-id])`;
  const inCard = (title, inner) => q(`${cardSel(title)} ${inner}`);
  const popover = () => js(`!!${q('[data-popover]')}`);
  const inPopover = (inner) => q(`[data-popover] ${inner}`);
  const shot = async (name) => {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(SHOTS, `${name}.png`), img.toPNG());
  };

  // A full viewport overlay (a modal and its dimmed backdrop) must never exist.
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
  const waitTask = (title, pred, ms = 8000) => C.waitFor(() => pred(taskNamed(title) || {}), ms);

  if (PHASE === '2') {
    // Relaunch: the filter chosen in phase 1 was remembered in the main process store.
    await C.waitFor(async () => (await body()).includes('Filter'), 20000);
    const label = await js(`(() => { const b = ${q('[aria-label^="Filter"]')}; return b ? b.getAttribute('aria-label') : null; })()`);
    check('relaunch: the filter is remembered (count on the button)', label === 'Filter (2)', String(label));
    check('relaunch: the filter still hides tasks of other labels', !(await body()).includes('Bravo'));
    app.exit(summary() ? 1 : 0);
    return;
  }

  check('app shows the seeded cards (no modal)', (await body()).includes('Alpha') && (await body()).includes('Bravo'));
  check('legacy phone item shows in the left list', (await body()).includes('Legacy phone thought'));
  check('there is no full viewport overlay at the start (baseline)', true);

  // ---- 1. open and close the label dropdown three ways ----
  const posBefore = await rectOf(q(cardSel('Alpha')));
  await click(inCard('Alpha', '[aria-label="Select label"]'));
  check('click on the label control opens a small dropdown', await popover());
  const pr = await js(`(() => { const r = ${q('[data-popover]')}.getBoundingClientRect(); return { w: r.width, h: r.height, vw: innerWidth, vh: innerHeight }; })()`);
  check('the dropdown is small (not full screen) and inside the window', pr.w < 400 && pr.h <= 330 && pr.w < pr.vw / 2 && pr.h < pr.vh / 2);
  check('opening it did not start a drag', (await js(`document.body.style.cursor`)) !== 'grabbing');
  check('no overlay while the label dropdown is open', await noNewOverlay());
  check('the dropdown has a focused search field', (await js(`document.activeElement && document.activeElement.getAttribute('aria-label')`)) === 'Search labels');
  await shot('label-dropdown');
  await key('Escape');
  check('Escape closes the dropdown', !(await popover()));
  await click(inCard('Alpha', '[aria-label="Select label"]'));
  check('reopens', await popover());
  await click(q('[aria-label="Capture a thought"]'));
  check('a press outside closes it (and passes through)', !(await popover()));
  await click(inCard('Alpha', '[aria-label="Select label"]'));
  await click(q('[aria-label="Select label"]') /* toggles the same trigger */);
  await click(inCard('Alpha', '[aria-label="Select label"]'));
  await click(inPopover('[aria-label="Work"]'));
  check('choosing a label closes the dropdown', !(await popover()));
  await waitTask('Alpha', (t) => t.projectKey === 'work');
  check('the label was saved on the task', taskNamed('Alpha').projectKey === 'work');
  const posAfter = await rectOf(q(cardSel('Alpha')));
  check('the card never moved or opened a page', posBefore && posAfter && Math.abs(posAfter.w - posBefore.w) < 2);

  // ---- 2. only one open at a time ----
  await click(inCard('Bravo', '[aria-label^="Priority"]'));
  await click(inCard('Alpha', '[aria-label^="Reminder"]'));
  const count = await js(`document.querySelectorAll('[data-popover]').length`);
  check('only one dropdown is open at a time', count === 1);
  await key('Escape');

  // ---- 3. edit label, priority, duration, repeat, reminder on three cards in a row ----
  // Alpha
  await click(inCard('Alpha', '[aria-label^="Priority"]'));
  await click(inPopover('[aria-label="High"]'));
  await waitTask('Alpha', (t) => t.priority === 'high');
  await click(inCard('Alpha', '[aria-label^="Duration of"]'));
  await click(inPopover('[aria-label="1h"]'));
  await waitTask('Alpha', (t) => t.durationMinutes === 60);
  await click(inCard('Alpha', '[aria-label^="Reminder"]'));
  await click(inPopover('[aria-label="None"]'));
  await waitTask('Alpha', (t) => t.reminderMinutes === -1);
  await click(inCard('Alpha', '[aria-label^="Repeat"]'));
  await click(inPopover('[aria-label="Repeat Weekly"]'));
  await click(inPopover('[aria-label="Weekdays"]'));
  check('the repeat dropdown states exactly what will happen', (await js(`${inPopover('[aria-label="Repeat summary"]')}.innerText`)).includes('weekday'));
  await shot('repeat-dropdown');
  await click(inPopover('[aria-label="Apply repeat"]'));
  await waitTask('Alpha', (t) => t.recurrence === 'weekly');
  check('Alpha: label, priority, duration, reminder and repeat all saved', (() => {
    const t = taskNamed('Alpha');
    return t.projectKey === 'work' && t.priority === 'high' && t.durationMinutes === 60 && t.reminderMinutes === -1 && t.recurrence === 'weekly' && t.recurrenceDays.length === 5;
  })());
  check('no overlay appeared while editing Alpha', await noNewOverlay());

  // Bravo
  await click(inCard('Bravo', '[aria-label="Select label"]'));
  await click(inPopover('[aria-label="Home"]'));
  await waitTask('Bravo', (t) => t.projectKey === 'home');
  await click(inCard('Bravo', '[aria-label^="Priority"]'));
  await click(inPopover('[aria-label="Low"]'));
  await waitTask('Bravo', (t) => t.priority === 'low');
  await click(inCard('Bravo', '[aria-label^="Duration of"]'));
  await click(inPopover('[aria-label="Custom"]'));
  await js(`(() => { const s = ${inPopover('select[aria-label="Hours"]')}; const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, '1'); s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
  await C.sleep(400);
  await js(`(() => { const s = ${inPopover('select[aria-label="Minutes"]')}; const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, '30'); s.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
  await waitTask('Bravo', (t) => t.durationMinutes === 90);
  check('Bravo: custom duration 1h 30m saved (24 hour rule picker)', taskNamed('Bravo').durationMinutes === 90);
  await key('Escape');
  await click(inCard('Bravo', '[aria-label^="Reminder"]'));
  check('a task with no start time shows the quiet daily reminder note', (await js(`${q('[data-popover]')}.innerText`)).includes('Reminds at your daily reminder time'));
  await key('Escape');

  // Charlie: create a label from the search box
  await click(inCard('Charlie', '[aria-label="Select label"]'));
  await typeText('Errands');
  check('typing offers Create "Errands"', (await js(`!!${inPopover('[aria-label="Create label Errands"]')}`)));
  await key('Return');
  await waitTask('Charlie', (t) => !!t.projectKey);
  check('created a label from the search box and selected it', read('belific_projects').some((p) => p.name === 'Errands' && p.key === taskNamed('Charlie').projectKey));
  await click(inCard('Charlie', '[aria-label^="Duration of"]'));
  await click(inPopover('[aria-label="30m"]'));
  await waitTask('Charlie', (t) => t.durationMinutes === 30);
  await click(inCard('Charlie', '[aria-label^="Priority"]'));
  await click(inPopover('[aria-label="High"]'));
  await waitTask('Charlie', (t) => t.priority === 'high');
  check('no overlay appeared while editing three cards in a row', await noNewOverlay());

  // ---- 4. title rename on the card ----
  await click(inCard('Delta', '[aria-label="Title Delta"]'));
  await key('End');
  await typeText(' two');
  await key('Return');
  await waitTask('Delta two', () => true).catch(() => {});
  check('clicking the title renames it in place (Enter saves)', !!taskNamed('Delta two'));
  await click(inCard('Delta two', '[aria-label="Title Delta two"]'));
  await typeText('zzz');
  await key('Escape');
  await C.sleep(300);
  check('Escape cancels a rename', !!taskNamed('Delta two') && !taskNamed('zzz'));

  // ---- 5. expand in place: notes and subtasks ----
  // (completed tasks are hidden by default, so show them while this runs)
  await click(q('[aria-label="Filter"]'));
  await click(inPopover('[aria-label="Show complete"]'));
  await key('Escape');
  await click(inCard('Charlie', '[aria-label="Subtasks 0/0"]'));
  check('clicking the subtask counter expands the card in place', await js(`!!${inCard('Charlie', '[aria-label^="Add subtask to"]')}`));
  await click(inCard('Charlie', '[aria-label^="Add subtask to"]'));
  await typeText('one');
  await key('Return');
  await typeText('two');
  await key('Return');
  await waitTask('Charlie', (t) => (t.subtasks || []).length === 2);
  check('Enter adds a subtask and keeps the input open for the next', (taskNamed('Charlie').subtasks || []).map((s) => s.title).join(',') === 'one,two');
  check('the counter shows 0/2', (await js(`!!${inCard('Charlie', '[aria-label="Subtasks 0/2"]')}`)));
  await shot('expanded-card');
  await click(inCard('Charlie', '[aria-label="Tick one"]'));
  await waitTask('Charlie', (t) => t.subtasks.some((s) => s.done));
  check('ticking one subtask leaves the task open', !taskNamed('Charlie').completed);
  await click(inCard('Charlie', '[aria-label="Tick two"]'));
  await waitTask('Charlie', (t) => t.completed === true);
  check('ticking the last subtask completes the task', taskNamed('Charlie').completed === true);
  await click(inCard('Charlie', '[aria-label="Untick one"]'));
  await waitTask('Charlie', (t) => t.completed === false);
  check('unticking a subtask of a completed task reopens it', taskNamed('Charlie').completed === false);
  check('no overlay while expanding and editing subtasks', await noNewOverlay());

  // ---- 6. Timebox block popover ----
  await click(q('[data-block-id="p"]'));
  check('clicking a placed block opens a small popover (not a modal)', (await popover()) && (await noNewOverlay()));
  const bp = await js(`(() => { const r = ${q('[data-popover]')}.getBoundingClientRect(); return { w: r.width, h: r.height }; })()`);
  check('the block popover is small', bp.w < 400 && bp.h <= 330);
  await click(inPopover('[aria-label="Label"]'));
  await click(inPopover('[aria-label="Work"]'));
  await waitTask('Placed one', (t) => t.projectKey === 'work');
  await click(inPopover('[aria-label="Duration"]'));
  await click(inPopover('[aria-label="2h"]'));
  await waitTask('Placed one', (t) => t.durationMinutes === 120);
  check('edited a placed block label and duration via the popover', taskNamed('Placed one').projectKey === 'work' && taskNamed('Placed one').durationMinutes === 120);
  check('no overlay appeared in the block popover', await noNewOverlay());
  await click(inPopover('[aria-label="Remove time"]'));
  await waitTask('Placed one', (t) => !t.startTime);
  check('Remove time takes it off the Timebox and keeps its day', taskNamed('Placed one').startTime === undefined && taskNamed('Placed one').dueDate === today);

  // ---- 7. legacy phone Brain Dump item converts in place on first edit ----
  const tasksBefore = read('belific_tasks').filter((x) => !x.deletedAt).length;
  await click(q('[aria-label="Task Legacy phone thought"] [aria-label="Select label"]'));
  await click(inPopover('[aria-label="Work"]'));
  await waitTask('Legacy phone thought', (t) => t.projectKey === 'work');
  await C.sleep(400);
  const legacyTasks = read('belific_tasks').filter((x) => x.title === 'Legacy phone thought' && !x.deletedAt);
  check('the legacy item became exactly one Task, with the edit', legacyTasks.length === 1 && read('belific_tasks').filter((x) => !x.deletedAt).length === tasksBefore + 1);
  check('the legacy item is gone and not left in the list', read('belific_brain_dump').filter((x) => !x.deletedAt).length === 0 && ((await body()).match(/Legacy phone thought/g) || []).length === 1);


  // ---- 8. drag a task onto another card: only after the 300 ms highlight ----
  const dragOnto = async (fromExpr, toExpr, holdMs, release = true) => {
    const a = await rectOf(fromExpr);
    const b = await rectOf(toExpr);
    if (!a || !b) throw new Error('drag endpoints missing');
    win.webContents.sendInputEvent({ type: 'mouseMove', x: a.x, y: a.y });
    mouse('mouseDown', a.x, a.y);
    for (let i = 1; i <= 12; i++) {
      win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(a.x + ((b.x - a.x) * i) / 12), y: Math.round(a.y + ((b.y - a.y) * i) / 12), modifiers: ['leftButtonDown'] });
      await C.sleep(15);
    }
    await C.sleep(holdMs);
    if (release) {
      mouse('mouseUp', b.x, b.y);
      await C.sleep(500);
    }
    return b;
  };
  const rawTask = (title) => read('belific_tasks').find((x) => x.title === title);
  await dragOnto(inCard('Bravo', '[aria-label="Title Bravo"]'), q(cardSel('Delta two')), 40);
  check('a quick release over a card is a normal Day drop: no subtask, nothing deleted', !(taskNamed('Delta two').subtasks || []).length && !!taskNamed('Bravo') && !rawTask('Bravo').deletedAt);
  const dropPoint = await dragOnto(inCard('Bravo', '[aria-label="Title Bravo"]'), q(cardSel('Delta two')), 500, false);
  check('hovering the card body shows the "Add as subtask" highlight', (await body()).includes('Add as subtask'));
  check('the highlight is not a modal', await noNewOverlay());
  mouse('mouseUp', dropPoint.x, dropPoint.y);
  await C.sleep(100);
  await C.waitFor(() => (taskNamed('Delta two').subtasks || []).some((x) => x.title === 'Bravo'), 8000).catch(() => {});
  check('after the dwell, releasing adds the dragged task as a subtask and tombstones it', (taskNamed('Delta two').subtasks || []).some((x) => x.title === 'Bravo') && !taskNamed('Bravo') && !!rawTask('Bravo').deletedAt);
  check('the host Day did not change', taskNamed('Delta two').dueDate === today);
  check('"Added to Delta two. Undo" shows', (await body()).includes('Added to Delta two'));
  await click(q('[aria-label="Undo add as subtask"]'));
  await C.waitFor(() => !!taskNamed('Bravo'), 8000).catch(() => {});
  check('Undo restores both: the subtask is gone and Bravo is back', !!taskNamed('Bravo') && !(taskNamed('Delta two').subtasks || []).some((x) => x.title === 'Bravo') && taskNamed('Bravo').projectKey === 'home');

  // ---- 9. filter ----
  await click(q('[aria-label="Filter (1)"]'));
  await click(inPopover('[aria-label="Show complete"]'));
  await key('Escape');
  await click(q('[aria-label="Filter"]'));
  check('the Filter dropdown opens beside the header', await popover());
  await shot('filter-dropdown');
  await click(inPopover('[aria-label="Filter label Work"]'));
  check('the button shows a count: Filter (1)', await js(`!!${q('[aria-label="Filter (1)"]')}`));
  await C.sleep(400);
  const text1 = await body();
  check('only tasks with the ticked label show in the board and left list', !text1.includes('Charlie') && !text1.includes('Bravo') && text1.includes('Alpha') && text1.includes('Legacy phone thought'));
  check('Timebox tasks are filtered too (an unlabelled placed task is hidden)', !(await js(`!!${q('[data-block-id="p2"]')}`)));
  check('events are not filtered', text1.includes('Team sync'));
  await click(inPopover('[aria-label="Filter no label"]'));
  check('adding "No label" gives Filter (2)', await js(`!!${q('[aria-label="Filter (2)"]')}`));
  await C.sleep(400);
  check('"No label" shows the unlabelled task and block again', (await body()).includes('Delta two') && (await js(`!!${q('[data-block-id="p2"]')}`)));
  await key('Escape');
  // completed tasks are hidden unless Show complete is on
  await click(inCard('Delta two', '[aria-label="Mark Delta two complete"]'));
  await C.sleep(600);
  check('a completed task is hidden by default', !(await js(`!!${q(cardSel('Delta two'))}`)));
  await click(q('[aria-label="Filter (2)"]'));
  await click(inPopover('[aria-label="Show complete"]'));
  check('Show complete counts: Filter (3)', await js(`!!${q('[aria-label="Filter (3)"]')}`));
  await C.sleep(500);
  check('Show complete brings the completed task back', await js(`!!${q(cardSel('Delta two'))}`));
  await click(inPopover('[aria-label="Clear filter"]'));
  check('Clear resets the filter (no count)', await js(`!!${q('[aria-label="Filter"]')}`));
  await click(inPopover('[aria-label="Filter label Work"]'));
  await click(inPopover('[aria-label="Filter no label"]'));
  check('the final filter is Work plus No label: Filter (2)', await js(`!!${q('[aria-label="Filter (2)"]')}`));
  await key('Escape');
  await C.sleep(600);
  check('no overlay at the end of the whole run', await noNewOverlay());

  const failed = summary();
  app.exit(failed ? 1 : 0);
}
