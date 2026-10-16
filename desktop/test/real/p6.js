'use strict';
// Real check for build plan phase 6 (Analytics, Trash, data export) on the
// desktop: real mouse and key input into the real app, on an isolated data
// folder asserted NOT to be the real one; Supabase is the in process fake (signed
// out, nothing leaves the machine). Downloads are saved to a temp folder through
// the session's will-download event, so the real files are read back.
// Covers: the cards and charts from seeded history, ranges (including a custom
// one and an empty one), hover and press readouts, the completed list and its
// CSV, the Trash (a plain delete, a deleted series as one entry, a merge shown
// with no Restore, a skipped day and an old delete not shown), Restore creating a
// new task with the same fields, and the JSON and CSV exports with their row
// counts and no secret in them.
// BELIFIC_SHOTS: a folder for screenshots.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, session } = require('electron');
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
  const downloads = fs.mkdtempSync(path.join(os.tmpdir(), 'belific-p6-downloads-'));
  const saved = [];
  app.whenReady().then(() => {
    const fake = C.installFakeSupabase();
    fake.store = { tables: {} };
    session.defaultSession.on('will-download', (_e, item) => {
      const file = path.join(downloads, item.getFilename());
      item.setSavePath(file);
      item.once('done', () => saved.push(file));
    });
  });

  const now = new Date();
  const dk = dayKeyFrom(now);
  const today = dk(0);
  const stamp = '2026-09-01T07:00:00.000Z';
  const hoursAgo = (h) => new Date(Date.now() - h * 3600000).toISOString();
  const daysAgo = (d) => hoursAgo(d * 24);
  const noonOf = (shift) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + shift, 12);
    return d.toISOString();
  };
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  const D = (id, title, shift, extra = {}) => T(id, title, { completed: true, completedAt: noonOf(shift), ...extra });
  const gone = (id, title, at, extra = {}) => T(id, title, { deletedAt: at, updatedAt: at, ...extra });
  const rows = [
    // completed: two yesterday, one 3 days ago, one 5 days ago (4 in the last 7 days); one 10 days ago; one 20 days ago
    D('c1', 'Write report', -1, { projectKey: 'work', durationMinutes: 60, actualMinutes: 45, emoji: '📝' }),
    D('c2', 'Call, the "bank"', -1, { projectKey: 'work', durationMinutes: 30, actualMinutes: 35 }),
    D('c3', '=HYPERLINK("x")', -3, { durationMinutes: 15 }),
    D('c4', 'Plain finished', -5, { projectKey: 'home' }),
    D('c5', 'Ten days ago', -10),
    D('c6', 'Twenty days ago', -20),
    // Brain Dump: two thoughts waiting
    T('b1', 'Old thought', { createdAt: daysAgo(10) }),
    T('b2', 'Newer thought', { createdAt: daysAgo(4) }),
    // the Trash
    gone('del1', 'Deleted plain task', daysAgo(2), { projectKey: 'work', durationMinutes: 45, actualMinutes: 20, notes: 'keep this', listKey: 'l1', emoji: '🧾', priority: 'high' }),
    gone('delold', 'Deleted long ago', daysAgo(40)),
    gone('ser', 'Deleted series', daysAgo(3), { dueDate: dk(-9) }),
    gone(`ser:${dk(-2)}`, 'Deleted series', daysAgo(3), { dueDate: dk(-2) }),
    gone(`ser:${dk(-1)}`, 'Deleted series', daysAgo(3), { dueDate: dk(-1) }),
    T(`sk:${dk(-1)}`, 'Skipped day', { dueDate: dk(-1), recurrence: 'daily', deletedAt: daysAgo(1), updatedAt: daysAgo(1) }),
    T('host', 'Plan trip', { dueDate: today, subtasks: [{ id: 's1', title: 'Merged item', done: false }], updatedAt: new Date().toISOString() }),
    gone('mg', 'Merged item', hoursAgo(0.01)),
  ];
  fs.writeFileSync(path.join(dataDir, 'belific_tasks.kv'), JSON.stringify(rows));
  fs.writeFileSync(
    path.join(dataDir, 'belific_projects.kv'),
    JSON.stringify([
      { key: 'work', name: 'Work', colorKey: 'sage', emoji: '💼', createdAt: stamp, updatedAt: stamp },
      { key: 'home', name: 'Home', colorKey: 'clay', createdAt: stamp, updatedAt: stamp },
    ]),
  );
  fs.writeFileSync(path.join(dataDir, 'belific_lists.kv'), JSON.stringify([{ key: 'l1', name: 'Reading', sortOrder: 0, createdAt: stamp, updatedAt: stamp }]));
  fs.writeFileSync(
    path.join(dataDir, 'belific_user_settings.kv'),
    JSON.stringify([
      { key: 'ui.panes', value: '{}', updatedAt: stamp },
      { key: 'auth.refresh_token', value: 'LEAKME-SECRET', updatedAt: stamp },
    ]),
  );
  const read = readKv(dataDir);
  const tasks = () => read('belific_tasks') || [];
  const byId = (id) => tasks().find((t) => t.id === id);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await I.waitBody('Plan trip', 20000);
  await C.sleep(600);
  const openFromMenu = async (label) => {
    const icon = (await I.exists(I.byLabel('Profile and account'))) ? 'Profile and account' : 'Profile, not signed in';
    await I.click(I.byLabel(icon));
    await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="${label}"]')`, 600);
  };
  const back = async () => {
    await I.click(I.byLabel('Back'));
    await I.waitBody('Plan trip', 8000);
  };
  const text = (label) => I.textOf(I.byLabel(label));

  // ======== 1. Analytics: cards ========
  await openFromMenu('Analytics');
  await I.waitBody('Worked out from the tasks on this computer', 8000);
  check('Analytics opens from the profile menu, on the last 7 days', (await I.body()).includes('Analytics') && (await I.exists(I.byLabel('Range Last 7 days'))));
  await C.waitFor(async () => (await text('Completed card')).includes('tasks completed'), 8000);
  const completedCard = await text('Completed card');
  check('Completed: 4 tasks, 3 more than the 7 days before', /\n4\n/.test(completedCard) && completedCard.includes('4 tasks completed, 3 more than the 7 days before'), completedCard);
  const timeCard = await text('Time card');
  check('Actual against estimated: 1:20 of 1:45 over 3 tasks with an estimate', timeCard.includes('1:20 / 1:45') && timeCard.includes('over 3 tasks with an estimate') && timeCard.includes('1 finished without one'), timeCard);
  const ageCard = await text('Brain Dump age card');
  check('Brain Dump age: 2 thoughts, 7 days on average, the oldest 10', ageCard.includes('2 thoughts waiting, 7 days old on average, the oldest 10 days'), ageCard);
  await I.shot('p6-01-analytics');

  // ======== 2. Charts: numbers visible, hover and press readouts ========
  const dayBar = `Array.from(document.querySelectorAll('[aria-label$=": 2 tasks, 1:20 spent"]')).find((e) => e.getBoundingClientRect().width > 0)`;
  check('time per day: yesterday\'s bar names its numbers (2 tasks, 1:20)', await I.exists(dayBar));
  check('every bar shows its value without a hover', (await I.textOf(I.byLabel('Time per day chart'))).includes('2'));
  const otherBar = `Array.from(document.querySelectorAll('[aria-label$=": 1 task, 0:00 spent"]')).find((e) => e.getBoundingClientRect().width > 0)`;
  await I.hover(otherBar);
  check('hover shows the numbers in the readout', /1 task, 0:00 spent/.test(await text('Time per day readout')), await text('Time per day readout'));
  await I.click(dayBar);
  check('press shows them too', /2 tasks, 1:20 spent/.test(await text('Time per day readout')), await text('Time per day readout'));
  await I.click(I.byLabel('By time'));
  check('"By time" redraws the same chart in minutes', (await I.textOf(I.byLabel('Time per day chart'))).includes('1:20'));
  const taskBar = I.byLabel('Write report: estimated 1:00, actual 0:45');
  check('estimated against actual: a bar per task with both numbers', await I.exists(taskBar));
  await I.hover(taskBar);
  check('its readout', /Write report: estimated 1:00, actual 0:45/.test(await text('Estimated against actual readout')));
  const share = await I.textOf(I.byLabel('Tasks by label chart')).catch(() => '');
  check('tasks by label: percentages that add to 100', await I.js(`(() => { const t = Array.from(document.querySelectorAll('[aria-label*="%"]')).filter((e) => e.getBoundingClientRect().width > 0 && /task/.test(e.getAttribute('aria-label'))).map((e) => Number(/(\\d+)%/.exec(e.getAttribute('aria-label'))[1])); return t.length >= 2 && t.reduce((a, b) => a + b, 0) === 100; })()`), share);
  check('Work is 50% (2 of 4)', await I.exists(I.byLabel('💼 Work: 2 tasks, 50%')));
  await I.shot('p6-02-charts');

  // ======== 3. Ranges ========
  await I.click(I.byLabel('Range Last 14 days'));
  const card14 = await text('Completed card');
  check('last 14 days: 5 tasks, 4 more than the 14 days before', card14.includes('5 tasks completed, 4 more than the 14 days before'), card14);
  await I.click(I.byLabel('Range Work week'));
  check('work week shows Monday to Friday', /to/.test(await text('Range shown')) && /5 days/.test(await text('Range shown')), await text('Range shown'));
  await I.click(I.byLabel('Range Custom'));
  const setDate = (label, value) =>
    I.js(`(() => { const i = ${I.byLabel(label)}; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(value)}); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await setDate('From', dk(-1));
  await setDate('To', dk(-1));
  await C.sleep(400);
  check('a custom range of one day: yesterday\'s 2 tasks', (await text('Completed card')).includes('2 tasks completed'), await text('Completed card'));
  await setDate('From', '2020-01-01');
  await setDate('To', '2020-01-02');
  await C.sleep(400);
  const emptyBody = await I.body();
  check('an empty range says what is missing', emptyBody.includes('No completed tasks in this range yet'), emptyBody.slice(0, 300));
  check('and uses no blame wording', !/behind|missed|lost|failed|overdue|worse|\bonly\b/i.test(emptyBody.slice(emptyBody.indexOf('Analytics'), emptyBody.indexOf('Completed tasks') + 80)));
  await I.click(I.byLabel('Range Last 7 days'));

  // ======== 4. The completed list and its CSV ========
  await I.click(I.byLabel('Group by day'));
  check('grouped by day', await I.exists(`Array.from(document.querySelectorAll('[aria-label^="Group "]')).find((e) => e.getBoundingClientRect().width > 0 && /2 · /.test(e.innerText))`));
  check('a finished task is listed with its numbers', (await text('Completed Write report')).includes('0:45 / 1:00'));
  await I.click(I.byLabel('Download completed tasks as CSV'));
  await C.waitFor(() => saved.some((f) => /belific-completed-/.test(f)), 8000);
  const csvFile = saved.find((f) => /belific-completed-/.test(f));
  const csv = fs.readFileSync(csvFile, 'utf8');
  check('the CSV download has a header, a group column and one row per task (BOM for spreadsheets)', csv.charCodeAt(0) === 0xfeff && csv.split('\r\n')[0].includes('Group,Completed on') && csv.trim().split('\r\n').length === 5, csv.slice(0, 200));
  check('cells with commas and quotes are quoted; a formula title is written as text', csv.includes('📝 Write report') && csv.includes('"Call, the ""bank"""') && csv.includes("'=HYPERLINK"), csv);
  await back();

  // ======== 5. Trash ========
  await openFromMenu('Trash');
  await I.waitBody('Tasks you deleted in the last 30 days', 8000);
  check('the Trash lists the plain delete, the series and the merge', (await I.exists(I.byLabel('Trash Deleted plain task'))) && (await I.exists(I.byLabel('Trash Deleted series'))) && (await I.exists(I.byLabel('Trash Merged item'))));
  check('an old delete (40 days) and a skipped day are not listed', !(await I.exists(I.byLabel('Trash Deleted long ago'))) && !(await I.exists(I.byLabel('Trash Skipped day'))));
  check('the series is ONE entry, with its days and the honest note', (await text('Trash Deleted series')).includes('3 days') && (await text('Trash Deleted series')).includes('set Repeat again'), await text('Trash Deleted series'));
  check('the merge has the note and NO Restore button', (await text('Trash Merged item')).includes('Merged into another task') && !(await I.exists(I.byLabel('Restore Merged item'))));
  check('the others have Restore', (await I.exists(I.byLabel('Restore Deleted plain task'))) && (await I.exists(I.byLabel('Restore Deleted series'))));
  await I.shot('p6-03-trash');
  const deletedBefore = byId('del1');
  await I.click(I.byLabel('Restore Deleted plain task'));
  await C.waitFor(() => byId('restored_del1'), 8000);
  const copy = byId('restored_del1');
  check('Restore made a NEW task with a new id and the same fields', copy && !copy.deletedAt && ['title', 'notes', 'priority', 'projectKey', 'listKey', 'emoji', 'durationMinutes', 'actualMinutes', 'createdAt'].every((k) => copy[k] === deletedBefore[k]), JSON.stringify(copy));
  check('the old tombstone stays, touched so it leaves the Trash', byId('del1').deletedAt === deletedBefore.deletedAt && byId('del1').updatedAt !== byId('del1').deletedAt);
  await C.waitFor(async () => !(await I.exists(I.byLabel('Trash Deleted plain task'))), 8000);
  check('the entry is gone from the Trash and a note says so', (await text('Trash note')).includes('Restored'));
  await I.click(I.byLabel('Restore Deleted series'));
  await C.waitFor(() => tasks().some((t) => t.id.startsWith('restored_ser_')), 8000);
  const sr = tasks().find((t) => t.id.startsWith('restored_ser_'));
  check('a deleted series comes back as ONE plain task from its latest day, with no repeat', tasks().filter((t) => t.id.startsWith('restored_') && !t.deletedAt).length === 2 && !sr.recurrence && sr.dueDate === dk(-1), JSON.stringify(sr));
  await back();
  // The plain task kept its list (Reading), so it is in that list, not Brain Dump; the series' one task has no list and an earlier Day, so it shows on the board.
  check('the restored series task is back on the board', (await I.body()).includes('Deleted series'));
  check('the restored task kept its list (it is not in Brain Dump)', !(await I.body()).includes('Deleted plain task'));

  // ======== 6. Export ========
  await openFromMenu('Settings');
  await I.waitBody('Export data', 8000);
  await I.click(I.byLabel('Export my data as JSON'));
  await C.waitFor(() => saved.some((f) => /belific-data-/.test(f)), 8000);
  await C.sleep(300);
  const jsonText = fs.readFileSync(saved.find((f) => /belific-data-/.test(f)), 'utf8');
  const exported = JSON.parse(jsonText);
  const liveTasks = tasks().filter((t) => !t.deletedAt).length;
  check('the JSON has every table and counts', exported.app === 'Belific' && exported.counts.tasks === liveTasks && exported.tables.tasks.length === liveTasks && exported.counts.labels === 2 && exported.counts.lists === 1, JSON.stringify(exported.counts));
  check('NO secret in the JSON: the token setting was left out', !jsonText.includes('LEAKME-SECRET') && !jsonText.includes('refresh_token'));
  check('deleted tasks are not exported', !jsonText.includes('Deleted long ago'));
  const note = await text('Export note');
  check('the message says how many rows, and that one entry was left out', new RegExp(`Exported ${exported.counts.tasks + exported.counts.labels + exported.counts.lists + exported.counts.settings + exported.counts.events + exported.counts.categories + exported.counts.routines + exported.counts.routineCompletions + exported.counts.brainDumpItems} rows`).test(note) && note.includes('1 secret-looking entry was left out'), note);
  await I.click(I.byLabel('Export my tasks as CSV'));
  await C.waitFor(() => saved.some((f) => /belific-tasks-/.test(f)), 8000);
  const tasksCsv = fs.readFileSync(saved.find((f) => /belific-tasks-/.test(f)), 'utf8');
  check('the tasks CSV has one row per live task', tasksCsv.trim().split('\r\n').length === liveTasks + 1 && !tasksCsv.includes('LEAKME'), `${tasksCsv.trim().split('\r\n').length} vs ${liveTasks + 1}`);
  check('its message says the tasks exported', (await text('Export note')).includes(`Exported ${liveTasks} tasks to CSV`), await text('Export note'));
  await I.shot('p6-04-export');

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
