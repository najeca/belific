'use strict';
// Real keyboard and pointer check for build plan phase 2 (task model and timer).
// Real key and text input into the real app, on an isolated data folder asserted
// NOT to be the real one. Supabase is the in process fake from common.js: signed
// out, so nothing leaves the machine. Covers: the shortcut help and its typing
// guard, a task made, estimated, labelled, timed, given an actual time,
// duplicated, completed and deleted from the keyboard, the details panel, lists,
// the day totals, and the floating timer (found again after a "restart", and the
// question for a timer left running for over a day).
// BELIFIC_SHOTS: a folder for screenshots.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
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
  let fake = null;
  app.whenReady().then(() => {
    fake = C.installFakeSupabase();
    fake.store = { tables: {} };
  });

  const now = new Date();
  const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const stamp = '2026-09-01T07:00:00.000Z';
  const ago = (ms) => new Date(Date.now() - ms).toISOString();
  const MIN = 60000;
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      T('seed1', 'Seed task'),
      // Running when the app starts: a timer found again after a restart.
      T('run1', 'Running task', { timerStartedAt: ago(10 * MIN + 20000), actualMinutes: 5 }),
      // Left running for over a day.
      T('stale1', 'Forgotten task', { timerStartedAt: ago(30 * 60 * MIN) }),
      // A planned task for the day totals.
      T('plan1', 'Planned task', { dueDate: todayKey, durationMinutes: 60, actualMinutes: 25, projectKey: 'work' }),
    ]),
  );
  fs.writeFileSync(path.join(dataDir, 'belific_projects.kv'), JSON.stringify([{ key: 'work', name: 'Work', colorKey: 'sage', emoji: '💼', createdAt: stamp, updatedAt: stamp }]));
  const read = (key) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dataDir, `${key}.kv`), 'utf8'));
    } catch {
      return [];
    }
  };
  const tasks = () => read('belific_tasks');
  const byId = (id) => tasks().find((t) => t.id === id);
  const byTitle = (title) => tasks().filter((t) => t.title === title && !t.deletedAt);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  const js = (code) => win.webContents.executeJavaScript(code, true);
  win.show();
  win.focus();
  win.webContents.focus();
  const body = () => js('document.body.innerText');
  const waitBody = (text, ms = 15000) => C.waitFor(async () => (await body()).includes(text), ms);
  const waitGone = (text, ms = 8000) => C.waitFor(async () => !(await body()).includes(text), ms);
  await waitBody('Seed task', 20000);

  // ---- input helpers ----
  const visible = (sel) => `Array.from(document.querySelectorAll(${JSON.stringify(sel)})).find((e) => e.getBoundingClientRect().width > 0)`;
  const byLabel = (label) => visible(`[aria-label=${JSON.stringify(label)}]`);
  const rectOf = (expr) =>
    js(`(() => { const el = ${expr}; if (!el) return null; el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = el.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
  const click = async (expr, wait = 300) => {
    let r = await rectOf(expr);
    if (!r) throw new Error(`no element for ${expr}`);
    for (let i = 0; i < 10; i++) {
      win.webContents.sendInputEvent({ type: 'mouseMove', x: r.x, y: r.y });
      await C.sleep(120);
      const again = await rectOf(expr);
      const same = again && again.x === r.x && again.y === r.y;
      r = again || r;
      if (same) break;
    }
    win.webContents.sendInputEvent({ type: 'mouseDown', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    win.webContents.sendInputEvent({ type: 'mouseUp', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    await C.sleep(wait);
  };
  const key = async (keyCode, modifiers = [], wait = 200) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    await C.sleep(wait);
  };
  const enter = async (wait = 350) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
    win.webContents.sendInputEvent({ type: 'char', keyCode: String.fromCharCode(13) });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
    await C.sleep(wait);
  };
  const type = async (text, wait = 150) => {
    await win.webContents.insertText(text);
    await C.sleep(wait);
  };
  const exists = (expr) => js(`!!${expr}`);
  const activeLabel = () => js(`document.activeElement && document.activeElement.getAttribute('aria-label')`);
  const shot = async (name) => {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    fs.writeFileSync(path.join(SHOTS, `${name}.png`), (await win.webContents.capturePage()).toPNG());
  };
  const card = (title) => `Array.from(document.querySelectorAll('[aria-label=${JSON.stringify(`Task ${title}`)}]')).find((e) => e.getBoundingClientRect().width > 0)`;
  const focusCard = async (title) => {
    await js(`(() => { const c = ${card(title)}; if (c) c.focus(); })()`);
    await C.sleep(150);
  };
  const dialog = (name) => `document.querySelector('[role="dialog"][aria-label=${JSON.stringify(name)}]')`;
  const popoverOpen = () => exists(`document.querySelector('[role="dialog"]')`);
  const blur = () => js('document.activeElement && document.activeElement.blur()');

  // ======== 1. The timer found again after a restart ========
  check('a timer left running is found on launch: the floating timer shows its task', await exists(byLabel('Timer running for Running task')));
  // 2.27.0: the card face carries no timer line; the floating timer is the one place.
  check('its card stays a plain face (no timer line on it)', !(await js(`(${card('Running task')} || {}).innerText || ''`)).includes('Timer active'));
  await shot('p2-01-launch');

  // ======== 2. Stopping from the floating timer adds whole minutes ========
  await click(byLabel('Stop the timer for Running task'));
  await C.waitFor(() => byId('run1') && !byId('run1').timerStartedAt, 8000);
  check('stop: 10 whole minutes (and some seconds, dropped) added to the 5 already there', byId('run1').actualMinutes === 15, JSON.stringify(byId('run1')));
  check('stop: the timer start is cleared', !('timerStartedAt' in byId('run1')) || byId('run1').timerStartedAt === undefined);

  // ======== 3. A timer left over a day asks, and nothing is added silently ========
  await C.waitFor(async () => exists(byLabel('Timer running for Forgotten task')), 8000);
  await click(byLabel('Stop the timer for Forgotten task'));
  await waitBody('That is over a day');
  check('over 24 hours: the floating timer asks what to add', (await body()).includes('has been running for 30:00'), (await body()).slice(0, 200));
  check('over 24 hours: nothing was written yet', byId('stale1').timerStartedAt && !byId('stale1').actualMinutes);
  await shot('p2-02-stale-question');
  await click(byLabel('Minutes to add'));
  await type('abc');
  await enter();
  check('a bad answer is refused with a quiet hint and writes nothing', (await body()).includes('Not a time') && !!byId('stale1').timerStartedAt);
  await js(`(() => { const i = ${byLabel('Minutes to add')}; i.select(); })()`);
  await type('90m');
  await enter(500);
  await C.waitFor(() => byId('stale1') && !byId('stale1').timerStartedAt, 8000);
  check('the chosen 90 minutes were added and the timer stopped', byId('stale1').actualMinutes === 90, JSON.stringify(byId('stale1')));
  check('no timer is showing now', !(await exists(`document.querySelector('[aria-label^="Timer running"]')`)));

  // ======== 4. Shortcut help, and the typing guard ========
  await blur();
  await key('/', ['shift']);
  check('Shift+/ opens the keyboard shortcut help', (await body()).includes('Keyboard shortcuts') && (await body()).includes('Start or stop the timer'));
  await shot('p2-03-help');
  await key('Escape');
  check('Escape closes the help', !(await body()).includes('Open the details (notes and subtasks)'));
  // Typing letters that are shortcuts into a box does nothing but type.
  await click(byLabel('Capture a thought'));
  await type('qcsod? ');
  check('letters and ? typed in the capture box are text, not shortcuts', (await js(`${byLabel('Capture a thought')}.value`)) === 'qcsod? ' && !(await body()).includes('Open the details (notes and subtasks)'));
  await js(`(() => { const i = ${byLabel('Capture a thought')}; i.select(); })()`);
  await key('Delete');

  // ======== 5. A task made, estimated, labelled, timed and completed from the keyboard ========
  await blur();
  await key('q');
  // Phase 2: Q went to the pane's capture box. Phase 3 made it the quick capture box. Either is a box ready to type in.
  check('Q goes to a capture box', ['Capture a thought', 'Quick capture task'].includes(await activeLabel()), `${await activeLabel()} ${await js(`JSON.stringify({ pop: !!document.querySelector('[data-popover]'), modal: [...document.querySelectorAll('[aria-modal="true"]')].map((e) => e.getAttribute('aria-label')), help: document.body.innerText.includes('Open the details (notes and subtasks)') })`)}`);
  await type('Keyboard task');
  await enter();
  await C.waitFor(() => byTitle('Keyboard task').length === 1, 8000);
  check('Enter made the task, in Brain Dump (no list, no day)', byTitle('Keyboard task').length === 1 && !byTitle('Keyboard task')[0].dueDate && !byTitle('Keyboard task')[0].listKey);
  await waitBody('Keyboard task');
  await blur();
  await focusCard('Keyboard task');
  const id = () => byTitle('Keyboard task')[0].id;

  // 2.27.0: Ctrl+E and Ctrl+B open the details modal at the estimate or actual
  // field; 2.27.1: that is the time drop-down, opened, worked with the keys.
  await key('E', ['control']);
  await C.waitFor(() => exists(dialog('Estimated time')), 4000).catch(() => {});
  await C.sleep(200);
  check('Ctrl+E opens the details with the estimate drop-down open', (await exists(dialog('Task details'))) && (await exists(dialog('Estimated time'))) && (await activeLabel()) === 'Estimated time 5 min', String(await activeLabel()));
  for (let i = 0; i < 5; i++) await key('Down', [], 120);
  check('Down moves through the list (to 45 min)', (await activeLabel()) === 'Estimated time 45 min', String(await activeLabel()));
  await enter(500);
  await key('Escape');
  await C.sleep(300);
  await C.waitFor(() => byTitle('Keyboard task')[0].durationMinutes === 45, 8000);
  check('the estimate is 45 minutes', byTitle('Keyboard task')[0].durationMinutes === 45);

  await focusCard('Keyboard task');
  await key('L', ['control']);
  check('Ctrl+L opens the label box', await exists(dialog('Task options')));
  await type('Errands');
  await enter(600);
  await C.waitFor(() => byTitle('Keyboard task')[0].projectKey, 8000);
  const labels = read('belific_projects');
  const errands = labels.find((l) => l.name === 'Errands');
  check('a label was created and chosen', !!errands && byTitle('Keyboard task')[0].projectKey === errands.key);

  await focusCard('Keyboard task');
  await key('Return', ['control', 'shift']);
  await C.waitFor(() => byTitle('Keyboard task')[0].timerStartedAt, 8000);
  check('Ctrl+Shift+Enter started the timer', !!byTitle('Keyboard task')[0].timerStartedAt);
  check('the floating timer shows it', await exists(byLabel('Timer running for Keyboard task')));
  await shot('p2-04-timer-running');
  await focusCard('Keyboard task');
  await key('Return', ['control', 'shift']);
  await C.waitFor(() => !byTitle('Keyboard task')[0].timerStartedAt, 8000);
  check('the same keys stopped it: under a minute adds 0', (byTitle('Keyboard task')[0].actualMinutes ?? 0) === 0);

  await focusCard('Keyboard task');
  await key('B', ['control']);
  await C.waitFor(() => exists(dialog('Actual time')), 4000).catch(() => {});
  check('Ctrl+B opens the details with the actual time drop-down open', (await exists(dialog('Task details'))) && (await exists(dialog('Actual time'))));
  await click(`document.querySelector('[data-popover] [aria-label="Custom actual time"]')`, 300);
  await type('20m');
  await enter(500);
  await key('Escape');
  await C.sleep(300);
  await C.waitFor(() => byTitle('Keyboard task')[0].actualMinutes === 20, 8000);
  check('the actual time is 20 minutes', byTitle('Keyboard task')[0].actualMinutes === 20);

  await focusCard('Keyboard task');
  await key('c');
  await C.waitFor(() => byTitle('Keyboard task')[0].completed, 8000);
  check('C completed the task', byTitle('Keyboard task')[0].completed === true);

  // ======== 6. Duplicate, details, delete ========
  await C.waitFor(async () => exists(card('Keyboard task')), 8000).catch(() => {});
  // A completed task leaves the list; show it again through "Done today" is not needed:
  // work on the seed task for the rest.
  await focusCard('Seed task');
  await key('D', ['control', 'shift']);
  await C.waitFor(() => byTitle('Seed task').length === 2, 8000);
  const copy = byTitle('Seed task').find((t) => t.id !== 'seed1');
  check('Ctrl+Shift+D duplicated the task', byTitle('Seed task').length === 2);
  check('the copy has no progress and its own id', copy && !copy.completed && !copy.actualMinutes && !copy.timerStartedAt && copy.id !== 'seed1');

  await focusCard('Seed task');
  await key('o');
  await C.waitFor(async () => exists(byLabel('Task details')), 8000);
  check('O opens the details panel', await exists(byLabel('Task details')));
  await shot('p2-05-details');
  // 2.27.1: the estimate is the time drop-down.
  await click(`document.querySelector('[aria-label="Task details"] [data-duration-select="Estimated time"]')`);
  await click(`document.querySelector('[data-popover] [aria-label="Estimated time 1 h"]')`);
  await C.waitFor(() => tasks().some((t) => t.title === 'Seed task' && t.durationMinutes === 60), 8000);
  check('the panel set a 1h estimate', tasks().some((t) => t.title === 'Seed task' && t.durationMinutes === 60));
  // 2.26.0: Priority was removed from the interface.
  check('the details have no Priority row', !(await exists(`document.querySelector('[aria-label="Task details"] [aria-label="High"]')`)) && !(await js(`document.querySelector('[data-detail-panel]').innerText.includes('Priority')`)));
  // 2.26.0: the emoji is in the details modal's ⋮ menu.
  await click(byLabel('More task actions'));
  await click(byLabel('Task emoji'));
  await type('📚');
  await C.waitFor(() => tasks().some((t) => t.title === 'Seed task' && t.emoji === '📚'), 8000);
  check('the panel set an emoji, and the card shows it before the title', tasks().some((t) => t.title === 'Seed task' && t.emoji === '📚') && (await body()).includes('📚 Seed task'));
  await blur();
  await key('Escape'); // closes the ⋮ menu
  await C.sleep(200);
  await key('Escape');
  await C.sleep(200);
  check('Escape closed the panel', !(await exists(byLabel('Task details'))));

  // delete: Ctrl+Delete asks, Yes soft deletes
  await focusCard('Seed task');
  const target = byId(await js(`${card('Seed task')}.getAttribute('data-task-card')`));
  await key('Delete', ['control']);
  check('Ctrl+Delete asks "Delete?" and deletes nothing yet', (await body()).includes('Delete?') && !byId(target.id).deletedAt);
  await click(byLabel('Confirm delete task'));
  await C.waitFor(() => byId(target.id).deletedAt, 8000);
  check('Yes soft deletes: the row stays, marked deleted', !!byId(target.id).deletedAt && byId(target.id).title === 'Seed task');

  // ======== 7. Lists ========
  await blur();
  await click(byLabel('List: Brain Dump. Change list'));
  check('the lists switcher opens', await exists(dialog('Lists')));
  await click(byLabel('New list name'));
  await type('Reading');
  await enter(600);
  const lists = read('belific_lists');
  check('a list was created and shown', lists.length === 1 && lists[0].name === 'Reading' && (await body()).includes('Reading'), JSON.stringify(lists));
  await click(byLabel('Capture a thought'));
  await type('Read a book');
  await enter();
  await C.waitFor(() => byTitle('Read a book').length === 1, 8000);
  check('a task added while the list is shown belongs to it', byTitle('Read a book')[0].listKey === lists[0].key);
  await click(byLabel('List: Reading. Change list'));
  await click(byLabel('Show Brain Dump'));
  await C.sleep(400);
  check('Brain Dump does not show the list\'s task', !(await body()).includes('Read a book'));
  await click(byLabel('List: Brain Dump. Change list'));
  await click(byLabel('Show list Reading'));
  await C.sleep(400);
  check('the list shows it again', (await body()).includes('Read a book'));
  await shot('p2-06-list');
  // deleting the list sends its tasks back to Brain Dump
  await click(byLabel('List: Reading. Change list'));
  await click(byLabel('Delete list Reading'));
  await click(byLabel('Confirm delete list'));
  await C.waitFor(() => !byTitle('Read a book')[0].listKey, 8000);
  check('deleting the list kept its task and sent it to Brain Dump', byTitle('Read a book').length === 1 && !byTitle('Read a book')[0].listKey);
  check('the list row is a tombstone', !!read('belific_lists')[0].deletedAt);
  await waitBody('Read a book');

  // ======== 8. Day totals ========
  check('the day shows actual against estimated (0:25 / 1:00)', (await body()).includes('0:25 / 1:00'));

  // ======== 9. Emoji ========
  check('a label with an emoji shows it on its card', (await js(`(${card('Planned task')} || {}).innerText || ''`)).includes('💼'));

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
