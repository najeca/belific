'use strict';
// Real touch check for PLAN_phone P7 (2.55.0): Repeat, times a day and reminders in the phone's task
// details at 390 x 844, and the phone's "Remind me on this device" switch. (Notifications arriving on
// an iPhone cannot be shown here: the web export schedules none; see the hand test list.)
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
  // A Wednesday two weeks ahead, so "Weekly on Mon and Wed" keeps or moves the day predictably.
  const ahead = (() => {
    for (let i = 7; i < 21; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      if (d.getDay() === 3) return day(i);
    }
    return day(14);
  })();
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([{ id: 'gym', title: 'Gym', completed: false, createdAt: stamp, updatedAt: stamp, dueDate: ahead, startTime: '07:00', durationMinutes: 60, listKey: 'L1' }]),
  );
  fs.writeFileSync(path.join(dataDir, 'belific_lists.kv'), JSON.stringify([{ key: 'L1', name: 'Health', emoji: '💪', sortOrder: 0, createdAt: stamp, updatedAt: stamp }]));
  const tasks = () => JSON.parse(fs.readFileSync(path.join(dataDir, 'belific_tasks.kv'), 'utf8'));
  const gym = () => tasks().find((t) => t.id === 'gym');

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.show();
  await C.sleep(2500);
  const P = await phoneWindow(win);
  const shot = async (name) => {
    if (!process.env.BELIFIC_SHOTS) return;
    fs.mkdirSync(process.env.BELIFIC_SHOTS, { recursive: true });
    fs.writeFileSync(path.join(process.env.BELIFIC_SHOTS, `${name}.png`), (await win.webContents.capturePage()).toPNG());
  };
  const tabEls = `[...document.querySelectorAll('a, [role="tab"], [role="button"], [role="link"]')].filter((e) => { const r = e.getBoundingClientRect(); return r.top > 760 && r.height > 20 && r.width > 40 && r.width < 200; })`;
  const tab = (name) => `${tabEls}.find((e) => e.textContent.replace(/[^ -~]/g, '').trim() === '${name}')`;
  const visible = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].reverse().find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left >= -1 && r.left < innerWidth && r.top < innerHeight && r.bottom > 0; })`;
  const inSheet = (sel) => `(() => { const root = document.querySelector('[data-task-details]'); const sheet = root && root.parentElement; return sheet ? [...sheet.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.getBoundingClientRect().height > 0) : null; })()`;
  const tapIn = async (sel, wait = 800) => {
    await P.js(`(() => { const e = ${inSheet(sel)}; if (e) e.scrollIntoView({ block: 'center' }); })()`);
    await C.sleep(250);
    await P.finger.tap(inSheet(sel), wait);
  };
  const sheetText = () => P.js(`(document.querySelector('[data-task-details]') || {}).parentElement?.innerText || ''`);

  await P.finger.tap(tab('Tasks'), 1000);
  await P.finger.tap(visible('[data-list-chip="L1"]'), 900);
  await P.finger.tap(`[...document.querySelectorAll('[data-task-row="Gym"] [data-task-body]')][0]`, 1200);
  check('the details open', await P.js(`!!document.querySelector('[data-task-details="gym"]')`));

  // Repeat: Weekly on Monday and Wednesday.
  await tapIn('[data-detail-row="repeat"]');
  await tapIn('[aria-label="Repeat Weekly"]');
  const weekday = await sheetText();
  check('Weekly starts from the weekday of its date (Wed)', /Repeats every Wed/.test(weekday), weekday.slice(0, 600));
  await tapIn('[aria-label="Mon"]');
  check('the summary says what will happen', /Repeats every Mon and Wed|Repeats every Mon, Wed/.test(await sheetText()), (await sheetText()).slice(0, 800));
  await shot('phone-p7-repeat');
  await tapIn('[aria-label="Apply repeat"]');
  const g1 = gym();
  check('Apply stores a weekly repeat on Mon and Wed (the desktop\'s fields)', g1.recurrence === 'weekly' && JSON.stringify(g1.recurrenceDays) === '["Mon","Wed"]', JSON.stringify(g1));

  // Times a day.
  await tapIn('[data-detail-row="times"]');
  await tapIn('[aria-label="Add another time"]');
  check('Add another time adds the suggested time after the last (8:00, one hour later)', JSON.stringify(gym().extraTimes) === '["08:00"]', JSON.stringify(gym()));
  await tapIn('[aria-label="Add another time"]');
  check('a second one too', JSON.stringify(gym().extraTimes) === '["08:00","09:00"]', JSON.stringify(gym().extraTimes));
  await shot('phone-p7-times');
  await tapIn('[aria-label="Remove the time 9:00am"]');
  check('a time is removed', JSON.stringify(gym().extraTimes) === '["08:00"]', JSON.stringify(gym().extraTimes));

  // Reminders.
  await tapIn('[data-detail-row="reminders"]');
  await tapIn('[aria-label="Remind 10 minutes before"]');
  check('a lead is added to the default (at the start and 10 minutes before)', JSON.stringify(gym().reminders) === '[0,10]' && gym().reminderMinutes === 0, JSON.stringify(gym()));
  check('it says the reminders apply to each time', /each time/i.test(await sheetText()));
  await tapIn('[aria-label="No reminders"]');
  check('None stores an empty list', JSON.stringify(gym().reminders) === '[]' && gym().reminderMinutes === -1);
  await tapIn('[aria-label="Reminders default"]');
  check('Default goes back to the default', gym().reminders === undefined && gym().reminderMinutes === undefined, JSON.stringify(gym()));
  await shot('phone-p7-reminders');
  check('nothing else was lost on the way', gym().listKey === 'L1' && gym().durationMinutes === 60 && gym().recurrence === 'weekly');
  await P.finger.tap(visible('[aria-label="Done"]'), 900);

  // This phone's own switch.
  await P.finger.tap(visible('[data-profile-avatar]'), 1200);
  check('Settings has "Remind me on this device", on by default', await P.js(`(() => { const s = document.querySelector('[data-phone-remind] [role="switch"]'); return !!s && (s.getAttribute('aria-checked') === 'true' || s.checked === true); })()`));
  await P.finger.tap(visible('[data-phone-remind] [role="switch"]'), 700);
  const stored = fs.readFileSync(path.join(dataDir, 'belific_phone_remind_tasks.kv'), 'utf8');
  check('switching it off is stored on this phone only (kv, never synced)', /0/.test(stored), stored);
  await shot('phone-p7-settings');

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
