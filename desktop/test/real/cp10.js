'use strict';
// Real pointer check for checkpoint 10 (2.16.0): routines from the iPhone become
// repeating tasks. Real mouse events into the real app on an isolated data
// folder asserted NOT to be the real one. Supabase is the in process fake from
// common.js with its in memory table store (a real PKCE sign in, nothing leaves
// the machine). Covers: the quiet line, the dry run, the exact warning, the
// disabled Convert until the backup folder exists, convert, undo, re-run (never a
// double conversion), completions untouched, and that a stale copy of a
// tombstoned row coming back from the server does not resurrect anything.
// BELIFIC_SHOTS: a folder for screenshots.
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
  const opened = [];
  shell.openExternal = async (url) => {
    opened.push(url);
  };
  let fake = null;
  app.whenReady().then(() => {
    fake = C.installFakeSupabase();
    fake.logoutOnline = true;
    fake.store = { tables: {} };
  });

  const now = new Date();
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const dayKey = (shift) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + shift);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const stamp = '2026-09-01T07:00:00.000Z';
  const routine = (id, title, timeOfDay) => ({ id, title, timeOfDay, createdAt: stamp, updatedAt: stamp });
  const completion = (routineId, date) => ({ routineId, date, completedAt: `${date}T08:15:00.000Z` });
  const completionsSeed = [completion('r1', dayKey(-1)), completion('r1', dayKey(-2)), completion('r2', dayKey(-1))];
  fs.writeFileSync(path.join(dataDir, 'belific_routines.kv'), JSON.stringify([routine('r1', 'Morning stretch', 'morning'), routine('r2', 'Wind down', 'evening')]));
  const completionsText = JSON.stringify(completionsSeed);
  fs.writeFileSync(path.join(dataDir, 'belific_routine_completions.kv'), completionsText);
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([{ id: 'a', title: 'Alpha', completed: false, dueDate: today, createdAt: stamp, updatedAt: stamp }]),
  );
  const read = (key) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dataDir, `${key}.kv`), 'utf8'));
    } catch {
      return [];
    }
  };
  const routines = () => read('belific_routines');
  const tasks = () => read('belific_tasks');
  const completions = () => read('belific_routine_completions');
  const liveSeries = () => tasks().filter((t) => t.id.startsWith('rt_') && !t.id.includes(':') && !t.deletedAt && t.recurrence);
  const server = (table) => (fake.store.tables[table] = fake.store.tables[table] || []);
  const serverRow = (table, id) => server(table).find((r) => r.id === id);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  const js = (code) => win.webContents.executeJavaScript(code, true);
  win.show();
  win.focus();
  win.webContents.focus();
  const body = () => js('document.body.innerText');
  await C.waitFor(async () => (await body()).includes('Alpha'), 20000);

  // ---- real input helpers (same as cp9) ----
  const visible = (sel) => `Array.from(document.querySelectorAll(${JSON.stringify(sel)})).find((e) => e.getBoundingClientRect().width > 0)`;
  const byLabel = (label) => visible(`[aria-label=${JSON.stringify(label)}]`);
  const byText = (text) =>
    `Array.from(document.querySelectorAll('[role="button"],button,[aria-label]')).find((e) => (e.innerText || '').trim() === ${JSON.stringify(text)} && e.getBoundingClientRect().width > 0)`;
  const rectOf = (expr) =>
    js(`(() => { const el = ${expr}; if (!el) return null; el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = el.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: r.width, h: r.height, top: r.top, left: r.left, right: r.right }; })()`);
  const mouse = (type, x, y) => win.webContents.sendInputEvent({ type, x, y, button: 'left', clickCount: 1 });
  const click = async (expr, wait = 300) => {
    let r = await rectOf(expr);
    if (!r) throw new Error(`no element for ${expr}`);
    for (let i = 0; i < 8; i++) {
      win.webContents.sendInputEvent({ type: 'mouseMove', x: r.x, y: r.y });
      await C.sleep(120);
      const again = await rectOf(expr);
      const same = again && again.x === r.x && again.y === r.y;
      r = again || r;
      if (same) break;
    }
    mouse('mouseDown', r.x, r.y);
    mouse('mouseUp', r.x, r.y);
    await C.sleep(wait);
  };
  const exists = (expr) => js(`!!${expr}`);
  const textOf = (expr) => js(`(() => { const el = ${expr}; return el ? el.innerText : null; })()`);
  const isDisabled = (expr) => js(`(() => { const el = ${expr}; return !!el && el.getAttribute('aria-disabled') === 'true'; })()`);
  const countCards = (title) =>
    js(`Array.from(document.querySelectorAll('[aria-label=${JSON.stringify(`Task ${title}`)}]')).filter((e) => e.getBoundingClientRect().width > 0).length`);
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
  const syncNow = async () => {
    const before = fake.restCalls;
    await click(byText('Sync now'));
    await C.waitFor(() => fake.restCalls > before + 2, 15000);
    await C.sleep(1500);
  };
  const openSettings = async () => {
    const open = await exists(`document.querySelector('[role="dialog"][aria-label="Profile menu"]')`);
    if (!open) await click(byLabel('Profile and account'));
    await click(byLabel('Settings'));
    await C.waitFor(async () => (await body()).toUpperCase().includes('PLANNING'), 8000);
  };
  const backToPanes = async () => {
    await click(byLabel('Back'));
    await C.waitFor(async () => (await countCards('Alpha')) > 0, 8000);
  };
  const dataText = () => js(`(() => { const s = document.querySelector('[aria-label="Data settings"]'); return s ? s.innerText : ''; })()`);

  // ======== 0. Signed out: nothing leaves the machine, no routine UI on the board ========
  check('signed out: no network request since launch', fake.hosts.length === 0, JSON.stringify(fake.hosts));
  check('the board shows no routine (there is no routine UI on the desktop)', !(await body()).includes('Morning stretch') && !(await body()).includes('Wind down'));

  // ======== 1. Sign in (real PKCE against the fake) and let the first sync upload the seed ========
  await click(byLabel('Profile, not signed in'));
  await click(byLabel('Sign in'));
  await click(byLabel('Continue with Apple'));
  await C.waitFor(() => opened.length === 1);
  const url = new URL(opened[0]);
  fake.challenge = url.searchParams.get('code_challenge');
  const flowId = new URL(url.searchParams.get('redirect_to')).searchParams.get('sb_flow_id');
  app.emit('second-instance', {}, [process.execPath, `belific://auth-callback?${flowId ? `sb_flow_id=${flowId}&` : ''}code=GOODCODE`], '');
  await C.waitFor(() => exists(byLabel('Profile and account')), 20000);
  await C.waitFor(() => server('routines').length === 2 && server('routine_completions').length === 3, 20000);
  check('the first sync uploaded the 2 routines and 3 completions to the fake server', server('routines').length === 2 && server('routine_completions').length === 3);

  // ======== 2. Settings, Data: the quiet line and the button ========
  await openSettings();
  const data0 = await dataText();
  check('Settings, Data shows the quiet line "2 routines from your iPhone"', data0.includes('2 routines from your iPhone'), data0);
  check('the Convert button is there', await exists(byLabel('Convert routines from your iPhone')));
  check('no routine titles or other routine UI on the page before the confirmation step', !data0.includes('Morning stretch') && !data0.includes('Wind down'));

  // ======== 3. The confirmation step: dry run, warning, backup gate ========
  await click(byLabel('Convert routines from your iPhone'));
  const panel = `document.querySelector('[aria-label="Convert routines"]')`;
  const panelText = (await textOf(panel)) || '';
  check('the dry run lists each routine with its title and time of day', panelText.includes('Morning stretch · Morning') && panelText.includes('Wind down · Evening'), panelText);
  check('the dry run says nothing has changed yet', panelText.includes('Nothing has changed yet.'));
  check('the warning is shown word for word', panelText.includes('Your iPhone will stop showing these routines until the next iPhone update. Only convert when you are ready. You can undo this.'), panelText);
  check('the confirmation is inline, not a full viewport overlay', await noNewOverlay());
  check('Convert is disabled until the backup exists', await isDisabled(byLabel('Convert')));
  await click(byLabel('Convert'));
  check('pressing the disabled Convert changes nothing', routines().every((r) => !r.deletedAt) && tasks().length === 1);
  check('the dry run itself changed nothing', routines().length === 2 && tasks().length === 1 && JSON.stringify(completions()) === completionsText);
  await shot('cp10-confirm');
  await click(byLabel('Cancel conversion'));
  check('Cancel closes the step and changes nothing', !(await exists(panel)) && routines().every((r) => !r.deletedAt));
  await click(byLabel('Convert routines from your iPhone'));
  const backupsDir = path.join(userData, 'backups');
  const convertBackups = () => (fs.existsSync(backupsDir) ? fs.readdirSync(backupsDir).filter((n) => /routine-convert/.test(n) && !n.endsWith('.partial')) : []);
  check('no routine-convert backup exists yet', convertBackups().length === 0);
  await click(byLabel('Back up first'));
  await C.waitFor(async () => ((await textOf(byLabel('Backup status'))) || '').includes('Backup saved'), 8000);
  check('a routine-convert backup folder now exists on disk', convertBackups().length === 1, JSON.stringify(convertBackups()));
  const b1 = path.join(backupsDir, convertBackups()[0], 'belific_routines.kv');
  check('the backup holds both routines, not yet converted', fs.existsSync(b1) && JSON.parse(fs.readFileSync(b1, 'utf8')).length === 2 && JSON.parse(fs.readFileSync(b1, 'utf8')).every((r) => !r.deletedAt));
  check('Convert is enabled after the backup', !(await isDisabled(byLabel('Convert'))));

  // ======== 4. Convert ========
  await click(byLabel('Convert'));
  await C.waitFor(() => routines().every((r) => !!r.deletedAt) && liveSeries().length === 2, 10000);
  const rs = routines();
  check('both routines are tombstoned in place (same ids, titles, time of day)', ['r1', 'r2'].every((id) => rs.find((r) => r.id === id && r.deletedAt)) && rs.find((r) => r.id === 'r1').title === 'Morning stretch' && rs.find((r) => r.id === 'r2').timeOfDay === 'evening');
  const s1 = tasks().find((t) => t.id === 'rt_r1');
  const s2 = tasks().find((t) => t.id === 'rt_r2');
  check('rt_r1 and rt_r2 are daily series starting today', s1 && s2 && s1.recurrence === 'daily' && s2.recurrence === 'daily' && s1.dueDate === today && s2.dueDate === today);
  check('the series are untimed with reminder off, no label, no priority, no steps', [s1, s2].every((s) => s.reminderMinutes === -1 && s.startTime === undefined && s.projectKey === undefined && s.priority === undefined && s.subtasks === undefined && s.completed === false));
  check('titles carry over', s1.title === 'Morning stretch' && s2.title === 'Wind down');
  check('routine_completions are byte for byte what they were', JSON.stringify(completions()) === completionsText);
  const data1 = await dataText();
  check('the page says the routines are now repeating tasks and offers Undo, no Convert', data1.includes('2 routines from your iPhone are now repeating tasks') && (await exists(byLabel('Undo conversion'))) && !(await exists(byLabel('Convert routines from your iPhone'))), data1);
  check('a note says 2 routines were converted', (await textOf(byLabel('Conversion note')) || '').includes('Converted 2 routines'));
  await shot('cp10-converted');

  // ======== 5. Sync: the server sees the tombstones, the series and untouched completions ========
  await syncNow();
  await C.waitFor(() => serverRow('routines', 'r1') && serverRow('routines', 'r1').deleted_at && serverRow('tasks', 'rt_r1'), 20000);
  check('the server has both routines tombstoned', !!serverRow('routines', 'r1').deleted_at && !!serverRow('routines', 'r2').deleted_at);
  const sv = serverRow('tasks', 'rt_r1');
  check('the server has the series with the daily rule, reminder off, no start time', sv.recurrence === 'daily' && sv.reminder_minutes === -1 && !sv.start_time && sv.due_date === today);
  check('the 3 completions on the server are untouched', server('routine_completions').length === 3 && server('routine_completions').every((c) => c.routine_id === 'r1' || c.routine_id === 'r2'));

  // ======== 6. The board shows the routines as repeating tasks, ticking works per day ========
  await backToPanes();
  const morning = await countCards('Morning stretch');
  const wind = await countCards('Wind down');
  check('Morning stretch and Wind down now show on the board on more than one day', morning >= 2 && wind >= 2, `${morning} / ${wind}`);
  await shot('cp10-board');
  const tickLast = `Array.from(document.querySelectorAll('[aria-label="Mark Morning stretch complete"]')).filter((e) => e.getBoundingClientRect().width > 0).pop()`;
  await click(tickLast);
  await C.waitFor(() => tasks().some((t) => /^rt_r1:\d{4}-\d{2}-\d{2}$/.test(t.id) && t.completed), 8000);
  const occ = tasks().filter((t) => /^rt_r1:/.test(t.id));
  check('ticking one day stores exactly that day as a completed occurrence', occ.length === 1 && occ[0].completed === true && !!occ[0].completedAt, JSON.stringify(occ.map((o) => o.id)));
  check('the completions file is still untouched after ticking', JSON.stringify(completions()) === completionsText);

  // ======== 7. A stale copy of a tombstoned routine coming back must not resurrect ========
  const r1Server = serverRow('routines', 'r1');
  r1Server.deleted_at = null; // as if an old client re-sent the row live
  r1Server.server_updated_at = new Date(Date.now() + 60000).toISOString();
  await openSettings();
  await syncNow();
  await C.waitFor(() => !!serverRow('routines', 'r1').deleted_at, 20000);
  check('the stale live routine from the server did not come back: the tombstone was pushed again', !!serverRow('routines', 'r1').deleted_at);
  check('and locally the routine stays tombstoned, with no Convert offered for it', !!routines().find((r) => r.id === 'r1').deletedAt && !(await exists(byLabel('Convert routines from your iPhone'))));

  // ======== 8. Undo ========
  await click(byLabel('Undo conversion'));
  await C.waitFor(() => routines().filter((r) => !r.deletedAt).length === 2, 10000);
  const live = routines().filter((r) => !r.deletedAt);
  check('undo gives the routines back as 2 new rows with the same titles and time of day', live.length === 2 && live.some((r) => r.title === 'Morning stretch' && r.timeOfDay === 'morning') && live.some((r) => r.title === 'Wind down' && r.timeOfDay === 'evening') && live.every((r) => r.id !== 'r1' && r.id !== 'r2'));
  check('the old routine rows are still tombstoned (a tombstone is never cleared)', !!routines().find((r) => r.id === 'r1').deletedAt && !!routines().find((r) => r.id === 'r2').deletedAt);
  check('the series are ended: no live series with a rule', liveSeries().length === 0 && tasks().filter((t) => t.id.startsWith('rt_') && !t.completed && !t.deletedAt).length === 0);
  const kept = tasks().find((t) => /^rt_r1:/.test(t.id));
  check('the day that was ticked is kept, finished, and no longer repeats', kept && kept.completed === true && !kept.deletedAt && !kept.recurrence);
  const cs = completions();
  const newMorning = live.find((r) => r.title === 'Morning stretch').id;
  const newWind = live.find((r) => r.title === 'Wind down').id;
  check('the 3 original completions are still there, unchanged', completionsSeed.every((c) => cs.some((x) => x.routineId === c.routineId && x.date === c.date && x.completedAt === c.completedAt)));
  check('they are copied to the new routines with the same dates and times', cs.length === 6 && cs.filter((c) => c.routineId === newMorning).length === 2 && cs.filter((c) => c.routineId === newWind).length === 1 && cs.filter((c) => c.routineId === newMorning).every((c) => completionsSeed.some((o) => o.routineId === 'r1' && o.date === c.date && o.completedAt === c.completedAt)));
  check('the note says the routines are back', ((await textOf(byLabel('Conversion note'))) || '').includes('Undone'));
  await backToPanes();
  check('the board no longer shows the routines', (await countCards('Morning stretch')) === 0 && (await countCards('Wind down')) === 0);
  await openSettings();
  await syncNow();
  await C.waitFor(() => server('routines').filter((r) => !r.deleted_at).length === 2 && server('routine_completions').length === 6, 20000);
  check('the server has the 2 new routines live, the old 2 tombstoned, and 6 completions', server('routines').length === 4 && server('routine_completions').length === 6);

  // ======== 9. A stale series from the server must not restart it ========
  const staleSeries = serverRow('tasks', 'rt_r1');
  staleSeries.deleted_at = null;
  staleSeries.recurrence = 'daily';
  staleSeries.completed = false;
  staleSeries.server_updated_at = new Date(Date.now() + 60000).toISOString();
  await syncNow();
  await C.waitFor(() => !!serverRow('tasks', 'rt_r1').deleted_at, 20000);
  check('a stale live copy of the old series is tombstoned again, not restarted', !!serverRow('tasks', 'rt_r1').deleted_at && liveSeries().length === 0);

  // ======== 10. Re-run: converts the 2 new routines once, never the old ones ========
  check('the quiet line is back for the 2 restored routines', (await dataText()).includes('2 routines from your iPhone'));
  await click(byLabel('Convert routines from your iPhone'));
  await click(byLabel('Back up first'));
  await C.waitFor(async () => ((await textOf(byLabel('Backup status'))) || '').includes('Backup saved'), 8000);
  check('a second backup folder was made (never replaced)', convertBackups().length === 2, JSON.stringify(convertBackups()));
  await click(byLabel('Convert'));
  await C.waitFor(() => liveSeries().length === 2, 10000);
  const roots = liveSeries().map((t) => t.id).sort();
  check('exactly one live series per restored routine, none for the old ids', JSON.stringify(roots) === JSON.stringify([`rt_${newMorning}`, `rt_${newWind}`].sort()), JSON.stringify(roots));
  check('all 4 routine rows are now tombstoned and there is nothing left to convert', routines().length === 4 && routines().every((r) => !!r.deletedAt) && !(await exists(byLabel('Convert routines from your iPhone'))));
  check('the completions are still the 6 rows', completions().length === 6);
  await syncNow();
  await backToPanes();
  check('the board shows the routines again on more than one day', (await countCards('Morning stretch')) >= 2 && (await countCards('Wind down')) >= 2);

  // ======== 11. Network ========
  check('only the fake Supabase host was contacted, nothing unexpected', fake.unexpected.length === 0 && fake.hosts.every((h) => h === C.SUPABASE_HOST), JSON.stringify([...new Set(fake.hosts)]));

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
