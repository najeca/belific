'use strict';
// Real touch check for PLAN_phone P3 (2.51.0): the phone shell at 390 x 844. Three tabs (Today,
// Calendar, Tasks); the avatar opens Settings on every tab; the round + opens the quick add with the
// place filled in, Cancel is one tap, Add stores the task there; Tasks holds Brain Dump, All and
// Repeating, so nothing the old four tabs did is lost.
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
  const today = dayKeyFrom(new Date())(0);
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const dow = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date().getDay()];
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      { id: 'dump1', title: 'A loose thought', completed: false, createdAt: stamp, updatedAt: stamp },
      { id: 'rep', title: 'Stretch', completed: false, createdAt: stamp, updatedAt: stamp, dueDate: today, recurrence: 'weekly', recurrenceDays: [dow] },
    ]),
  );
  const stored = () => JSON.parse(fs.readFileSync(path.join(dataDir, 'belific_tasks.kv'), 'utf8'));

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
  const text = () => P.js('document.body.innerText');
  const tabEls = `[...document.querySelectorAll('a, [role="tab"], [role="button"], [role="link"]')].filter((e) => { const r = e.getBoundingClientRect(); return r.top > 760 && r.height > 20 && r.width > 40 && r.width < 200; })`;
  const tab = (name) => `${tabEls}.find((e) => e.textContent.replace(/[^ -~]/g, '').trim() === '${name}')`;
  const visible = (sel) => `[...document.querySelectorAll('${sel}')].find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left >= 0 && r.left < innerWidth; })`;
  const typeText = async (t) => {
    await win.webContents.insertText(t);
    await C.sleep(250);
  };

  // The tab text also holds the icon font's glyph: keep the plain letters only.
  const names = await P.js(`${tabEls}.map((e) => e.textContent.replace(/[^ -~]/g, '').trim())`);
  check('three tabs: Today, Calendar, Tasks', JSON.stringify(names) === JSON.stringify(['Today', 'Calendar', 'Tasks']), JSON.stringify(names));
  check('no Brain Dump, Quests or Settings tab', !names.some((n) => /Brain Dump|Quests|Settings/.test(n)));
  await shot('phone-p3-today');

  // The avatar opens Settings from every tab.
  for (const t of ['Today', 'Calendar', 'Tasks']) {
    await P.finger.tap(tab(t), 900);
    await P.finger.tap(visible('[data-profile-avatar]'), 1200);
    const on = (await text()).includes('Notifications') && (await text()).includes('Account');
    check(`${t}: the avatar opens Settings`, on);
    if (on) await P.finger.tap(visible('[aria-label="Back"]'), 900);
  }

  // Today: + adds for today.
  await P.finger.tap(tab('Today'), 900);
  await P.finger.tap(visible('[data-add-button]'), 900);
  const sheet = await P.js(`(() => { const e = document.querySelector('[data-quick-add]'); return e ? e.getAttribute('data-quick-add') : null; })()`);
  check('Today: + opens the quick add for "Today"', sheet === 'Today', String(sheet));
  await shot('phone-p3-quickadd');
  await P.finger.tap(visible('[data-quick-add] [aria-label="Cancel adding"]'), 700);
  check('Cancel closes it in one tap', !(await P.js(`!!document.querySelector('[data-quick-add]')`)));
  await P.finger.tap(visible('[data-add-button]'), 900);
  await P.finger.tap(visible('[aria-label="New task title"]'), 300);
  await typeText('Call the bank');
  await P.finger.tap(visible('[aria-label="Add task"]'), 900);
  const bank = stored().find((t) => t.title === 'Call the bank');
  check('Add stores the task for today', !!bank && bank.dueDate === today && !bank.listKey, JSON.stringify(bank));

  // Calendar: + adds on the chosen day.
  await P.finger.tap(tab('Calendar'), 900);
  await P.finger.tap(visible('[data-add-button]'), 900);
  await P.finger.tap(visible('[aria-label="New task title"]'), 300);
  await typeText('Dentist');
  await P.finger.tap(visible('[aria-label="Add task"]'), 900);
  const dentist = stored().find((t) => t.title === 'Dentist');
  check('Calendar: + stores the task on the chosen day (today)', !!dentist && dentist.dueDate === today, JSON.stringify(dentist));

  // Tasks: Brain Dump, All, Repeating.
  await P.finger.tap(tab('Tasks'), 1000);
  check('Tasks: Brain Dump shows the loose thought', (await text()).includes('A loose thought'));
  await shot('phone-p3-tasks');
  await P.finger.tap(visible('[data-seg="all"]'), 900);
  check('Tasks: All lists every task', (await text()).includes('Call the bank') && (await text()).includes('Dentist'));
  await P.finger.tap(visible('[data-seg="repeating"]'), 900);
  check('Tasks: Repeating shows the repeating task (the old Quests)', (await text()).includes('Stretch'));
  await shot('phone-p3-repeating');
  await P.finger.tap(visible('[data-seg="dump"]'), 900);
  await P.finger.tap(visible('[data-add-button]'), 900);
  await P.finger.tap(visible('[aria-label="New task title"]'), 300);
  await typeText('Idea for the garden');
  await P.finger.tap(visible('[aria-label="Add task"]'), 900);
  const idea = stored().find((t) => t.title === 'Idea for the garden');
  check('Tasks: + in Brain Dump stores a task with no day and no list', !!idea && !idea.dueDate && !idea.listKey, JSON.stringify(idea));
  check('Tasks: it shows in Brain Dump at once', (await text()).includes('Idea for the garden'));

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
