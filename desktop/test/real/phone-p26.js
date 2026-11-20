'use strict';
// @real-input: quiet
// Real touch check for the 3.59.1 fix pack (phone only) at 390 x 844:
//   1. the task card's Label row is one line (dot, emoji, name; a long name ends in …), the List row too, light and dark;
//   2. "Which list or label?": + New list (a name and an emoji, the shared name rules) and + New label (a name and a
//      colour); the new one is stored and chosen at once;
//   3. Earlier: one off tasks of earlier days that are not ticked are not on Today or in their list (nor its count); one
//      Earlier pill on Today and Tasks opens the desktop's rules: Tomorrow, Back to its list, Let go (the Trash, never
//      done), the steps left, Tick all (done on their own days), Today before 14:00, and an Undo per answer;
//   4. the card's Smaller tasks line and the Checklist line, with a rule between the two sections;
//   5. the avatar opens Profile: a preset picture, initials on a colour (one synced user_settings row), and Settings;
//   6. Settings, Convert routines: the routines land in a list called Routines (made), and the notice names them and
//      says where they are.
// Runs quiet.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const C = require('./common');
const { dayKeyFrom } = require('./input');
const { phoneWindow } = require('./phone-common');

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
  const day = dayKeyFrom(new Date());
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const write = (k, v) => fs.writeFileSync(path.join(dataDir, `${k}.kv`), JSON.stringify(v));
  const task = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
  const LONG = 'A very long label name that cannot fit on one line of the card';
  write('belific_tasks', [
    task('card', 'Card task', { listKey: 'LW', projectKey: 'LP' }),
    task('long', 'Long label task', { projectKey: 'LL' }),
    task('parts', 'Parts task', { dueDate: day(0), startTime: '23:00', durationMinutes: 60, subtasks: [{ id: 's1', title: 'Old step', done: false }] }),
    task('part1', 'Part one', { parentId: 'parts', durationMinutes: 15 }),
    task('today', 'Today task', { dueDate: day(0) }),
    task('old1', 'Old one', { dueDate: day(-2), listKey: 'LW' }),
    task('old2', 'Old two', { dueDate: day(-3), startTime: '09:00', durationMinutes: 30 }),
    task('old3', 'Old three', { dueDate: day(-1), subtasks: [{ id: 'a', title: 'Done step', done: true }, { id: 'b', title: 'Open step', done: false }] }),
    task('old4', 'Old four', { dueDate: day(-4), listKey: 'LW' }),
    task('oldDone', 'Old done', { dueDate: day(-2), completed: true, completedAt: stamp }),
  ]);
  write('belific_lists', [{ key: 'LW', name: 'Work', sortOrder: 0, emoji: '💼', createdAt: stamp, updatedAt: stamp }]);
  write('belific_projects', [
    { key: 'LP', name: 'Personal', emoji: '🏠', colorKey: 'sage', createdAt: stamp, updatedAt: stamp },
    { key: 'LL', name: LONG, emoji: '🌿', colorKey: 'sky', createdAt: stamp, updatedAt: stamp },
  ]);
  write('belific_routines', [
    { id: 'r1', title: 'Morning stretch', timeOfDay: 'morning', createdAt: stamp, updatedAt: stamp },
    { id: 'r2', title: 'Evening walk', timeOfDay: 'evening', createdAt: stamp, updatedAt: stamp },
  ]);
  const read = (k) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dataDir, `${k}.kv`), 'utf8'));
    } catch {
      return [];
    }
  };
  const byId = (id) => read('belific_tasks').find((x) => x.id === id);
  const byTitle = (t) => read('belific_tasks').find((x) => x.title === t && !x.deletedAt);
  const setting = (k) => (read('belific_user_settings').find((s) => s.key === k && !s.deletedAt) || {}).value;

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.show();
  await C.sleep(2500);
  const P = await phoneWindow(win);
  await C.sleep(1500);
  const shot = async (name) => {
    if (!process.env.BELIFIC_SHOTS) return;
    fs.mkdirSync(process.env.BELIFIC_SHOTS, { recursive: true });
    fs.writeFileSync(path.join(process.env.BELIFIC_SHOTS, `${name}.png`), (await win.webContents.capturePage()).toPNG());
  };
  const tabEls = `[...document.querySelectorAll('a, [role="tab"], [role="button"], [role="link"]')].filter((e) => { const r = e.getBoundingClientRect(); return r.top > 760 && r.height > 20 && r.width > 40 && r.width < 200; })`;
  const tab = (name) => `${tabEls}.find((e) => e.textContent.replace(/[^ -~]/g, '').trim() === '${name}')`;
  const visible = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].reverse().find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left >= -1 && r.left < innerWidth && r.top < innerHeight && r.bottom > 0; })`;
  const tap = (sel, ms = 900) => P.finger.tap(visible(sel), ms);
  const has = (sel) => P.js(`!!(${visible(sel)})`);
  const text = (sel) => P.js(`((${visible(sel)}) || {}).innerText || ''`);
  const bar = () => P.js(`[...document.querySelectorAll('[data-undo-bar]')].map((e) => e.innerText).join(' | ')`);
  const typeText = async (t) => {
    await win.webContents.insertText(t);
    await C.sleep(400);
  };
  const box = (sel) => P.js(`(() => { const e = ${visible(sel)}; if (!e) return null; const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) }; })()`);
  const pillCount = (screen) => P.js(`(() => { const e = [...document.querySelectorAll('[data-earlier-pill]')].find((p) => { let a = p; while (a.parentElement && !a.querySelector('[role="heading"]')) a = a.parentElement; const h = a.querySelector('[role="heading"]'); return !!h && h.innerText.trim() === ${JSON.stringify(screen)}; }); return e ? Number(e.getAttribute('data-earlier-pill')) : 0; })()`);
  const scrollTo = (sel) => P.js(`(() => { const e = ${visible(sel)} || document.querySelector(${JSON.stringify(sel)}); if (e) e.scrollIntoView({ block: 'center' }); return !!e; })()`);
  const todayRows = () => P.js(`[...document.querySelectorAll('[data-today-row]')].map((e) => e.getAttribute('data-today-row'))`);
  const taskRows = () => P.js(`[...document.querySelectorAll('[data-task-row]')].map((e) => e.getAttribute('data-task-row'))`);
  const chip = async (key) => {
    await P.js(`document.querySelector('[data-list-chip="${key}"]').scrollIntoView({ inline: 'center', block: 'nearest' })`);
    await C.sleep(300);
    await tap(`[data-list-chip="${key}"]`, 900);
  };
  // The label and list values on the open card: one line each (a line of the 15 px value is under 26 px high).
  const values = () =>
    P.js(`(() => {
      const one = (sel) => { const e = document.querySelector(sel); if (!e) return null; const t = e.getAttribute('dir') === 'auto' ? e : (e.querySelector('[dir="auto"]') || e); const r = t.getBoundingClientRect(); return { text: e.innerText.trim(), h: Math.round(r.height), clipped: t.scrollWidth > t.clientWidth + 1 }; };
      return { label: one('[data-label-value]'), list: one('[data-list-value]') };
    })()`);

  // ---- 3. Earlier: not on Today, not in the list, one pill ----
  const hour = new Date().getHours();
  const todayShown = hour >= 4 && hour < 14;
  check('Today does not show the unticked tasks of earlier days', JSON.stringify(await todayRows()).includes('Today task') && !(await todayRows()).some((t) => /^Old/.test(t)), JSON.stringify(await todayRows()));
  check('Today has one Earlier pill with how many wait (4; a done one is not counted)', (await pillCount('Today')) === 4, String(await pillCount('Today')));
  check('the pill is 44 pt high and says Earlier, calmly', ((await box('[data-earlier-pill]')) || {}).h >= 44 && /Earlier\s*4$/.test((await text('[data-earlier-pill]')).trim()), JSON.stringify(await box('[data-earlier-pill]')));
  await shot('phone-p26-today-earlier');
  await P.finger.tap(tab('Tasks'), 1200);
  check('the Tasks tab has the pill too', (await pillCount('Tasks')) === 4);
  await chip('LW');
  const workRows = await taskRows();
  check('the Work list leaves out its earlier unticked tasks', workRows.includes('Card task') && !workRows.includes('Old one') && !workRows.includes('Old four'), JSON.stringify(workRows));
  check('and so does its count (1: Card task)', /1/.test(await P.js(`document.querySelector('[data-list-chip="LW"]').innerText`)), await P.js(`document.querySelector('[data-list-chip="LW"]').innerText`));

  await tap('[data-earlier-pill]', 1400);
  const rowsIn = () => P.js(`[...document.querySelectorAll('[data-earlier-row]')].map((e) => e.getAttribute('data-earlier-row'))`);
  check('the pill opens Earlier with the four, oldest day first', JSON.stringify(await rowsIn()) === JSON.stringify(['Old four', 'Old two', 'Old one', 'Old three']), JSON.stringify(await rowsIn()));
  const oneBtns = await P.js(`[...document.querySelectorAll('[data-earlier-btn]')].map((e) => e.getAttribute('data-earlier-btn')).filter((b) => b.endsWith(':Old one'))`);
  check(`each row has Tomorrow, Back to its list, Let go${todayShown ? ' and Today (before 14:00)' : ' (no Today after 14:00)'}`, JSON.stringify(oneBtns) === JSON.stringify([...(todayShown ? ['today:Old one'] : []), 'tomorrow:Old one', 'list:Old one', 'letGo:Old one']), JSON.stringify(oneBtns));
  check('a task with some steps ticked offers "Only the 1 step left to tomorrow"', await P.js(`!!document.querySelector('[data-earlier-btn="steps:Old three"]')`));
  check('Tick all 4 is there', (await text('[data-earlier-tick-all]')).trim() === 'Tick all 4');
  check('no red in the sheet (Let go is plain)', !(await P.js(`[...document.querySelectorAll('[data-earlier-sheet] *')].some((e) => /rgb\\(168, 64, 47\\)|rgb\\(226, 59, 59\\)/.test(getComputedStyle(e).color))`)));
  await shot('phone-p26-earlier');

  await tap('[data-earlier-btn="tomorrow:Old one"]', 1400);
  check('Tomorrow moves it to tomorrow, its row goes', byId('old1').dueDate === day(1) && !(await rowsIn()).includes('Old one'), JSON.stringify(byId('old1')));
  check('with an Undo bar: "Tomorrow: Old one"', /Tomorrow: Old one/.test(await bar()), await bar());
  await P.finger.tap(`[...document.querySelectorAll('[data-undo-bar] [aria-label="Undo"]')].pop()`, 1400);
  check('Undo puts it back on its own day and in the sheet', byId('old1').dueDate === day(-2) && (await rowsIn()).includes('Old one'), JSON.stringify(byId('old1')));
  await tap('[data-earlier-btn="letGo:Old two"]', 1400);
  check('Let go puts it in the Trash and never counts it as done', !!byId('old2').deletedAt && !byId('old2').completed, JSON.stringify(byId('old2')));
  await tap('[data-earlier-btn="list:Old one"]', 1400);
  check('Back to its list clears its Day (it stays in Work)', !byId('old1').dueDate && byId('old1').listKey === 'LW' && !byId('old1').completed, JSON.stringify(byId('old1')));
  check('Tick all now says 2', (await text('[data-earlier-tick-all]')).trim() === 'Tick all 2');
  await tap('[data-earlier-tick-all]', 1400);
  const o3 = byId('old3');
  const o4 = byId('old4');
  const noon = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, 12).toISOString(); };
  check('Tick all marks them done on their own days (and the steps)', o3.completed && o4.completed && o3.completedAt === noon(day(-1)) && o4.completedAt === noon(day(-4)) && o3.subtasks.every((s) => s.done), JSON.stringify([o3.completedAt, o4.completedAt]));
  check('the sheet then says nothing is waiting', /Nothing waiting from earlier days/.test(await text('[data-earlier-sheet]')));
  await tap('[data-earlier-close]', 1200);
  check('the pill is gone, and Old one is back in Work (no Day)', (await pillCount('Tasks')) === 0 && (await taskRows()).includes('Old one'), JSON.stringify(await taskRows()));
  await P.finger.tap(tab('Today'), 1400);
  check('Today\'s pill is gone too when it shows again', (await pillCount('Today')) === 0);
  await P.finger.tap(tab('Tasks'), 1200);

  // ---- 1. the card's Label and List rows: one line ----
  await P.finger.tap(visible('[data-task-body="card"]'), 1500);
  await scrollTo('[data-detail-row="label"]');
  await C.sleep(400);
  let v = await values();
  check('Label: "🏠 Personal" on one line beside its dot', !!v.label && v.label.text === '🏠 Personal' && v.label.h < 26 && !v.label.clipped, JSON.stringify(v));
  check('List: "💼 Work" on one line', !!v.list && v.list.text === '💼 Work' && v.list.h < 26, JSON.stringify(v));
  const rowH = await box('[data-detail-row="label"]');
  check('the Label row keeps its one line height (52 pt)', rowH && rowH.h <= 54, JSON.stringify(rowH));
  await shot('phone-p26-label-row');
  await tap('[data-details-done]', 1200);
  await chip('dump');
  await P.finger.tap(visible('[data-task-body="long"]'), 1500);
  await scrollTo('[data-detail-row="label"]');
  await C.sleep(400);
  v = await values();
  check('a long label name stays on one line and ends in …', !!v.label && v.label.h < 26 && v.label.clipped && v.label.text.startsWith('🌿 A very long'), JSON.stringify(v));
  const labelWord = await P.js(`(() => { const r = document.querySelector('[data-detail-row="label"]'); const t = [...r.querySelectorAll('div')].find((e) => e.innerText.trim() === 'Label'); const b = t.getBoundingClientRect(); return Math.round(b.width); })()`);
  check('the word Label keeps its room beside it', labelWord >= 40, String(labelWord));
  await shot('phone-p26-label-long');
  await tap('[data-details-done]', 1200);

  // ---- 4. Smaller tasks and Checklist on the card ----
  await P.finger.tap(tab('Today'), 1200);
  // 3.60.0 (on purpose): a tap on a Today row opens the task card itself.
  await scrollTo('[data-today-body="parts"]');
  await C.sleep(300);
  await P.finger.tap(visible('[data-today-body="parts"]'), 1500);
  await scrollTo('[data-parts-hint]');
  await C.sleep(400);
  check('Smaller tasks: "Their own times and lengths, shown inside this block"', (await P.js(`document.querySelector('[data-parts-hint]').innerText`)).trim() === 'Their own times and lengths, shown inside this block');
  check('Checklist: "Quick tick boxes, no times"', (await P.js(`(document.querySelector('[data-checklist-hint]') || {}).innerText || ''`)).trim() === 'Quick tick boxes, no times');
  const order = await P.js(`['[data-parts-card]', '[data-checklist-rule]', '[data-checklist-head]', '[data-checklist-hint]'].map((s) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().top) : null; })`);
  check('the two sections are apart: Smaller tasks, a rule, then Checklist', order.every((x) => x !== null) && order[0] < order[1] && order[1] < order[2] && order[2] < order[3] && order[2] - order[1] >= 16, JSON.stringify(order));
  const addPart = await P.js(`(() => { const b = document.querySelector('[data-add-part]').getBoundingClientRect(); const c = document.querySelector('[data-parts-card]').getBoundingClientRect(); return [Math.round(b.right), Math.round(c.right)]; })()`);
  check('"Add a smaller task" fits inside its card', addPart[0] <= addPart[1], JSON.stringify(addPart));
  await shot('phone-p26-sections');
  await tap('[data-details-done]', 1200);

  // ---- 2. + New list and + New label on "Which list or label?" ----
  await tap('[data-add-button]', 1200);
  await typeText('Flow task');
  await tap('[data-step-next]', 1200);
  await tap('[data-step-skip]', 1200);
  check('"Which list or label?" ends each group with + New list and + New label', (await P.js(`(document.querySelector('[data-step-add]') || {}).getAttribute && document.querySelector('[data-step-add]').getAttribute('data-step-add')`)) === 'where' && (await has('[data-step-new="list"]')) && (await has('[data-step-new="label"]')));
  const longChip = await P.js(`(() => { const e = document.querySelector('[data-step-label="${LONG}"]'); const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), innerWidth]; })()`);
  check('a long label name stays on the screen (it ends in …)', longChip[0] >= 0 && longChip[1] <= longChip[2], JSON.stringify(longChip));
  const newBox = await box('[data-step-new="list"]');
  check('the chips are 44 pt high', newBox && newBox.h >= 44, JSON.stringify(newBox));
  await tap('[data-step-new="list"]', 900);
  check('+ New list opens a small form (a name and the emoji picker)', (await has('[data-step-make="list"]')) && (await has('[data-step-make="list"] [data-emoji-pick]')));
  await typeText('Work');
  check('a name another list has is refused, with the reason', (await P.js(`(${visible('[data-step-make-add="list"]')}).getAttribute('aria-disabled')`)) === 'true' && (await has('[data-step-make-note]')), await text('[data-step-make-note]'));
  await P.js(`(() => { const e = ${visible('[data-step-make-name="list"]')}; e.focus(); e.select(); })()`);
  await typeText('Garden');
  console.log(`INFO name ${await P.js(`(${visible('[data-step-make-name="list"]')}).value`)}`);
  await P.js(`document.querySelector('[data-step-make="list"] [data-emoji-cell]:not([data-emoji-taken])').scrollIntoView({ block: 'center' })`);
  await C.sleep(300);
  await P.finger.tap(`document.querySelector('[data-step-make="list"] [data-emoji-cell]:not([data-emoji-taken])')`, 600);
  const pickedEmoji = await P.js(`document.querySelector('[data-step-make="list"] [data-emoji-large]').getAttribute('data-emoji-large')`);
  await scrollTo('[data-step-make-add="list"]');
  await C.sleep(300);
  await tap('[data-step-make-add="list"]', 1400);
  const garden = read('belific_lists').find((l) => l.name === 'Garden');
  check('Add list stores the list with its emoji', !!garden && !!pickedEmoji && garden.emoji === pickedEmoji, JSON.stringify(garden));
  check('and the task is in it at once, its chip chosen', byTitle('Flow task').listKey === (garden || {}).key && (await has('[data-step-list="Garden"]')), JSON.stringify(byTitle('Flow task')));
  await tap('[data-step-new="label"]', 900);
  check('+ New label opens a small form (a name and the colours, one each)', (await has('[data-step-make="label"]')) && (await P.js(`document.querySelectorAll('[data-step-make="label"] [data-step-color]').length`)) === 20);
  check('a colour another label has is not offered (sage, sky)', (await P.js(`['sage', 'sky'].every((k) => document.querySelector('[data-step-color="' + k + '"]').getAttribute('aria-disabled') === 'true')`)));
  await typeText('Errands');
  await tap('[data-step-color="blue"]', 600);
  await shot('phone-p26-new-label');
  await P.js(`document.querySelector('[data-step-make-add="label"]').scrollIntoView({ block: 'center' })`);
  await C.sleep(300);
  await tap('[data-step-make-add="label"]', 1400);
  const errands = read('belific_projects').find((p) => p.name === 'Errands');
  check('Add label stores it with the colour chosen', !!errands && errands.colorKey === 'blue', JSON.stringify(errands));
  check('and the task has it at once', byTitle('Flow task').projectKey === (errands || {}).key, JSON.stringify(byTitle('Flow task')));
  await tap('[data-step-close]', 1200);

  // ---- 5. Profile: preset or initials, then Settings ----
  check('the avatar is the plain person to start with', (await P.js(`(${visible('[data-profile-avatar]')}).getAttribute('data-profile-avatar')`)) === 'none');
  await tap('[data-profile-avatar]', 1400);
  check('the avatar opens Profile (not Settings)', await has('[data-profile-sheet]'));
  await tap('[data-avatar-preset="fox"]', 900);
  check('a preset picture is stored in one synced setting', setting('profile.avatar') === 'preset:fox', setting('profile.avatar'));
  await P.finger.tap(visible('[data-avatar-initials]'), 400);
  await typeText('jc');
  check('initials are stored upper case, on the first colour', setting('profile.avatar') === 'initials:JC:sage', setting('profile.avatar'));
  await tap('[data-avatar-color="sky"]', 900);
  check('a colour tap changes the colour behind them', setting('profile.avatar') === 'initials:JC:sky', setting('profile.avatar'));
  const cells = await P.js(`[...document.querySelectorAll('[data-avatar-preset], [data-avatar-color]')].map((e) => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height); })`);
  check('every choice is 44 pt or more', cells.length === 20 && cells.every((x) => x >= 44), JSON.stringify(cells));
  await shot('phone-p26-profile');
  await tap('[data-profile-done]', 1200);
  check('the header shows the initials, and VoiceOver hears them', (await P.js(`(${visible('[data-profile-avatar]')}).innerText.trim()`)) === 'JC' && (await P.js(`(${visible('[data-profile-avatar]')}).getAttribute('aria-label')`)) === 'Profile, initials J C');
  await tap('[data-profile-avatar]', 1400);
  await tap('[data-profile-settings]', 1800);
  check('Profile, Settings opens Settings', await has('[data-phone-theme]'));

  // ---- 6. Convert routines: a Routines list, a notice that names them ----
  await scrollTo('[aria-label="Convert routines"]');
  await tap('[aria-label="Convert routines"]', 900);
  check('the confirmation says where they go', /in a list called Routines on the Tasks tab/.test(await text('[aria-label="Convert routines confirmation"]')), await text('[aria-label="Convert routines confirmation"]'));
  await tap('[aria-label="Convert"]', 2000);
  const routinesList = read('belific_lists').find((l) => l.name === 'Routines' && !l.deletedAt);
  check('a list called Routines is made', !!routinesList, JSON.stringify(read('belific_lists').map((l) => l.name)));
  const rs = ['rt_r1', 'rt_r2'].map(byId);
  check('both routines are daily repeating tasks in it', rs.every((t) => t && t.recurrence === 'daily' && t.listKey === (routinesList || {}).key), JSON.stringify(rs));
  await scrollTo('[data-routine-notice]');
  const notice = await text('[data-routine-notice]');
  check('the notice names them and says where: Tasks tab, Routines list', notice.trim() === '"Morning stretch" and "Evening walk" are now repeating tasks. Find them on the Tasks tab, in the Routines list.', notice);
  await shot('phone-p26-routines');

  // ---- dark: the Label row, Earlier and Profile ----
  await scrollTo('[data-phone-theme] [data-seg="dark"]');
  await tap('[data-phone-theme] [data-seg="dark"]', 900);
  await tap('[aria-label="Back"]', 1200);
  await P.finger.tap(tab('Tasks'), 1200);
  await chip('LW');
  await P.finger.tap(visible('[data-task-body="card"]'), 1500);
  await scrollTo('[data-detail-row="label"]');
  await C.sleep(400);
  v = await values();
  const dark = await P.js(`getComputedStyle(document.querySelector('[data-detail-row="label"]').parentElement).backgroundColor`);
  check('dark: the Label row is still one line', !!v.label && v.label.text === '🏠 Personal' && v.label.h < 26, JSON.stringify(v));
  check('dark: the card is dark', /\(\s*([0-5]?\d),\s*([0-5]?\d),\s*([0-5]?\d)/.test(dark), dark);
  await shot('phone-p26-label-dark');
  await tap('[data-details-done]', 1200);
  await chip((routinesList || {}).key || 'dump');
  check('the Tasks tab shows the Routines list with both', (await taskRows()).filter((t) => t === 'Morning stretch' || t === 'Evening walk').length === 2, JSON.stringify(await taskRows()));
  await tap('[data-profile-avatar]', 1400);
  const sheetBg = await P.js(`getComputedStyle(document.querySelector('[data-profile-sheet]')).backgroundColor`);
  check('dark: Profile is dark, the initials still read', /\(\s*([0-5]?\d),\s*([0-5]?\d),\s*([0-5]?\d)/.test(sheetBg), sheetBg);
  await shot('phone-p26-profile-dark');
  await tap('[data-profile-done]', 1000);

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
