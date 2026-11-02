'use strict';
// Real check for 3.27.0: "Task or Break" replaces the Split switch in the details.
//   1. a plain task's details: Task | Break with Task chosen, an icon each, and the Task line,
//   2. choosing Break stores cutsBelow true (nothing else), shows the Break line, the card gets a "☕ Break" tag
//      and the Calendar block title a ☕; choosing Task clears it,
//   3. a Task placed over a Break says "Shows inside <break>" in its details; a Task over a Task shows nothing new,
//   4. no "Split" anywhere in the details, the card or Settings.
// Real mouse and key input into the real app, isolated data folder, in process fake Supabase. Light and dark (P48_DARK).
// BELIFIC_SHOTS: screenshots.
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
  const T = (id, title, extra = {}) => ({ id, title, completed: false, createdAt: stamp, updatedAt: stamp, dueDate: today, ...extra });
  const seed = [
    T('plain', 'Plan the week', { startTime: '09:00', durationMinutes: 30 }),
    T('lunch', 'Lunch', { startTime: '12:00', durationMinutes: 60, cutsBelow: true }),
    T('note', 'Quick note', { startTime: '12:10', durationMinutes: 10 }),
    T('a', 'Deep work', { startTime: '14:00', durationMinutes: 60 }),
    T('b', 'Email', { startTime: '14:15', durationMinutes: 15 }),
  ];
  fs.writeFileSync(path.join(dataDir, 'belific_tasks.kv'), JSON.stringify(seed));
  const read = readKv(dataDir);
  const byId = (id) => (read('belific_tasks') || []).find((t) => t.id === id);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1440, 900);
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await C.sleep(3500);
  const mode = process.env.P48_DARK ? 'dark' : 'light';
  const settings = async () => {
    const ic = (await I.exists(I.byLabel('Profile and account'))) ? 'Profile and account' : 'Profile, not signed in';
    await I.click(I.byLabel(ic));
    await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 700);
    await I.waitBody('POWER FEATURES', 8000);
  };
  if (mode === 'dark') {
    await settings();
    await I.click(`document.querySelector('[data-theme-setting] [data-theme-mode="dark"]')`, 900);
    await I.click(I.byLabel('Back'), 900);
  }
  await I.click(I.byLabel('Show Tasks'), 800).catch(() => {});
  await C.sleep(600);
  const panel = `document.querySelector('[data-detail-panel]')`;
  const card = (title) => `Array.from(document.querySelectorAll('[aria-label="Task ${title}"]')).find((e) => e.getBoundingClientRect().width > 0)`;
  const openCard = async (title) => {
    await I.click(card(title), 900);
    await C.waitFor(() => I.exists(panel), 4000);
    await C.sleep(300);
  };
  const close = async () => {
    await I.blur();
    await I.key('Escape');
    await C.sleep(500);
  };
  const panelText = () => I.js(`(${panel} || {}).innerText || ''`);
  const choice = () => I.js(`(() => { const s = ${panel}.querySelector('[data-kind-choice]'); return s ? s.getAttribute('data-kind-choice') : null; })()`);

  // ======== 1. A plain task ========
  await openCard('Plan the week');
  check(`${mode} 1: Task | Break, Task chosen`, (await choice()) === 'task' && (await I.js(`${panel}.querySelector('[data-kind="task"]').getAttribute('aria-checked')`)) === 'true');
  check(`${mode} 1: an icon on each option`, await I.js(`[...${panel}.querySelectorAll('[data-kind]')].every((o) => !!o.querySelector('svg, [class*="icon"], div[style*="font-family"]') || o.children.length >= 2)`));
  check(`${mode} 1: the Task line`, (await panelText()).includes('A normal task. If you place it inside a break it shows as a chip in that break.'));
  await I.shot(`p48-1-task-${mode}`);

  // ======== 2. Break, then Task again ========
  await I.click(`${panel}.querySelector('[data-kind="break"]')`, 700);
  await C.waitFor(() => byId('plain').cutsBelow === true, 4000).catch(() => {});
  const p = byId('plain');
  check(`${mode} 2: Break stores cutsBelow true and nothing else changes`, p.cutsBelow === true && p.startTime === '09:00' && p.durationMinutes === 30 && p.title === 'Plan the week', JSON.stringify(p));
  check(`${mode} 2: the Break line`, (await panelText()).includes('Cuts the tasks it overlaps into pieces and can hold other tasks inside it.'));
  await I.shot(`p48-2-break-${mode}`);
  await close();
  const tag = await I.js(`(() => { const t = (${card('Plan the week')} || document).querySelector('[data-break-tag]'); return t ? t.innerText : null; })()`);
  check(`${mode} 2: the card has a "☕ Break" tag`, tag === '☕ Break', String(tag));
  check(`${mode} 2: a plain task's card has none`, !(await I.js(`!!(${card('Deep work')} || document.body).querySelector('[data-break-tag]')`)));
  await I.shot(`p48-2-card-${mode}`);
  await I.click(I.byLabel('Show the Calendar'), 800).catch(() => {});
  await I.key('d');
  await C.sleep(700);
  await I.js(`(() => { const s = document.querySelector('[data-cal-scroller]'); if (s) s.scrollTop = 8.5 * 60 * (s.scrollHeight / 1440); })()`);
  await C.sleep(400);
  const cup = await I.js(`(() => { const b = document.querySelector('[data-cal-block="cal${today}:plain"]'); return b ? [!!b.querySelector('[data-break-cup]'), b.innerText.split('\\n')[0]] : null; })()`);
  check(`${mode} 2: the Calendar block title starts with a ☕`, !!cup && cup[0] && cup[1].startsWith('☕'), JSON.stringify(cup));
  const plainCup = await I.js(`!!document.querySelector('[data-cal-block="cal${today}:a"] [data-break-cup]')`);
  check(`${mode} 2: a plain task's block has no cup`, !plainCup);
  await I.shot(`p48-2-calendar-${mode}`);
  await I.click(`document.querySelector('[data-cal-block="cal${today}:plain"]')`, 900);
  await C.waitFor(() => I.exists(panel), 4000);
  await I.click(`${panel}.querySelector('[data-kind="task"]')`, 700);
  await C.waitFor(() => byId('plain').cutsBelow === undefined, 4000).catch(() => {});
  check(`${mode} 2: Task clears it`, byId('plain').cutsBelow === undefined && (await choice()) === 'task', JSON.stringify(byId('plain')));
  await close();

  // ======== 3. Shows inside, and nothing new for a Task over a Task ========
  await I.click(I.byLabel('Show Tasks'), 800).catch(() => {});
  await C.sleep(500);
  await openCard('Quick note');
  check(`${mode} 3: a Task over a Break says "Shows inside Lunch"`, /Shows inside Lunch/.test(await panelText()), await panelText());
  await I.shot(`p48-3-inside-${mode}`);
  await close();
  await openCard('Email');
  const emailText = await panelText();
  check(`${mode} 3: a Task over a Task shows nothing new`, !/Shows inside|Break is ignored|Inside this break/.test(emailText), emailText);
  check(`${mode} 4: no "Split" in the details`, !/split/i.test(emailText));
  await close();
  check(`${mode} 4: no "Split" on the board`, !/split/i.test(await I.body()));
  await settings();
  check(`${mode} 4: Settings says "Minimum piece size when a Break cuts a task" and no "Split"`, (await I.body()).includes('Minimum piece size when a Break cuts a task') && !/split/i.test(await I.body()));
  await I.click(I.byLabel('Back'), 900);

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
