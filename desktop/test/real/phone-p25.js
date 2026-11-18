'use strict';
// @real-input: quiet
// Real touch check for 3.59.0 (PLAN_phone_stepflow phase 1) at 390 x 844: the round + opens the step by step add flow.
//   - "What's on your mind?": the box focused, Step 1 of 5, Next off while empty; Next stores the task at once (no Day);
//   - "When do you want it done by?": Today suggested on Today, Skip, Back, Tomorrow, Pick a date;
//   - "What time?": only with a Day; a time, a length, Just a reminder (0 minutes, only with a time);
//   - "Which list or label?"; "Anything else to add?": notes and a smaller task, Done;
//   - each answer updates the stored task; closing at any point keeps it; closing with no Day says where it is, and the
//     Tasks tab shows it at the top of Brain Dump; closing an empty first screen stores nothing;
//   - a phrase ("Dentist tomorrow 3pm 30m") answers its screens; the Tasks tab's + fills in the list shown;
//   - no priority anywhere in the flow; Back, Skip, Next and the close button are 44 pt or more.
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
  write('belific_tasks', [{ id: 'old', title: 'Older thought', completed: false, createdAt: stamp, updatedAt: stamp }]);
  write('belific_lists', [{ key: 'LW', name: 'Work', sortOrder: 0, emoji: '💼', createdAt: stamp, updatedAt: stamp }]);
  write('belific_projects', [{ key: 'LH', name: 'Health', emoji: '💪', colorKey: 'sage', createdAt: stamp, updatedAt: stamp }]);
  const read = (k) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dataDir, `${k}.kv`), 'utf8'));
    } catch {
      return [];
    }
  };
  const live = () => read('belific_tasks').filter((t) => !t.deletedAt);
  const byTitle = (t) => live().find((x) => x.title === t);

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
  const typeText = async (t) => {
    await win.webContents.insertText(t);
    await C.sleep(400);
  };
  const step = () => P.js(`(() => { const e = document.querySelector('[data-step-add]'); return e ? e.getAttribute('data-step-add') : null; })()`);
  const flowText = () => P.js(`(() => { const e = document.querySelector('[data-step-add]'); return e ? e.innerText.replace(/\\s+/g, ' ') : ''; })()`);
  const dots = () => P.js(`(() => { const e = document.querySelector('[data-step-dots]'); return e ? e.getAttribute('data-step-dots') : null; })()`);
  const bar = () => P.js(`(document.querySelector('[data-undo-bar]') || {}).innerText || ''`);
  const tap = (sel, ms = 900) => P.finger.tap(visible(sel), ms);
  const plus = async (where = 'Today') => {
    await P.finger.tap(tab(where), 1000);
    await tap('[data-add-button]', 1200);
  };
  const next = () => tap('[data-step-next]', 1200);
  const box = (sel) => P.js(`(() => { const e = ${visible(sel)}; if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })()`);
  const setTime = async (hm) => {
    await P.finger.tap(visible('input[aria-label="Time"]'), 300);
    await typeText(hm);
    await P.js(`document.activeElement.blur()`);
    await C.sleep(900);
  };

  // ---- screen 1 ----
  await plus();
  const first = await P.js(`(() => { const a = document.activeElement; return { label: a && a.getAttribute('aria-label') }; })()`);
  check('+ opens the flow on "What\'s on your mind?" with the box focused', (await step()) === 'what' && (await flowText()).includes("What's on your mind?") && first.label === "What's on your mind?", JSON.stringify(first));
  check('small progress dots say Step 1 of 5', (await dots()) === 'Step 1 of 5');
  check('Next is off while the box is empty', await P.js(`(() => { const e = ${visible('[data-step-next]')}; return !!e && e.getAttribute('aria-disabled') === 'true'; })()`));
  const closeBox = await box('[data-step-close]');
  const nextBox = await box('[data-step-next]');
  check('the close button and Next are 44 pt or more', closeBox[0] >= 44 && closeBox[1] >= 44 && nextBox[1] >= 44, JSON.stringify([closeBox, nextBox]));
  await shot('phone-p25-what');
  await tap('[data-step-close]', 1200);
  check('closing an empty first screen stores nothing and closes', live().length === 1 && !(await step()));

  // ---- Next stores at once; closing on screen 2 keeps it in Brain Dump and says so ----
  await plus();
  await typeText('Call the dentist');
  await next();
  const dentist = byTitle('Call the dentist');
  check('Next stores the task at once: a title, no Day, no list', !!dentist && !dentist.dueDate && !dentist.listKey && !dentist.startTime, JSON.stringify(dentist));
  check('then "When do you want it done by?", Step 2 of 5', (await step()) === 'when' && (await dots()) === 'Step 2 of 5');
  const whenText = await flowText();
  check('Today, Tomorrow and Pick a date, with Today suggested', /Today/.test(whenText) && /Tomorrow/.test(whenText) && /Pick a date/.test(whenText) && (await P.js(`(${visible('[data-step-choice="today"]')} || {}).innerText || ''`)).includes('Suggested'), whenText);
  const backBox = await box('[data-step-back]');
  const skipBox = await box('[data-step-skip]');
  check('Back and Skip are there, 44 pt or more', !!backBox && !!skipBox && backBox[1] >= 44 && skipBox[1] >= 44, JSON.stringify([backBox, skipBox]));
  await shot('phone-p25-when');
  await tap('[data-step-close]', 1200);
  check('closing keeps the task as it is (no Day)', !!byTitle('Call the dentist') && !byTitle('Call the dentist').dueDate && !(await step()));
  check('the screen says where it is: "Saved in Brain Dump on the Tasks tab"', /Saved in Brain Dump on the Tasks tab: Call the dentist/.test(await bar()), await bar());
  await P.finger.tap(tab('Tasks'), 1200);
  const rows = await P.js(`[...document.querySelectorAll('[data-task-row]')].map((e) => e.getAttribute('data-task-row'))`);
  check('the Tasks tab shows it at the top of Brain Dump', rows[0] === 'Call the dentist' && rows.includes('Older thought'), JSON.stringify(rows));

  // ---- the whole flow, each answer stored as it is given ----
  await plus();
  await typeText('Swim');
  await next();
  await tap('[data-step-choice="today"]', 1200);
  check('Today stores today\'s Day and goes on to "What time?" (Step 3 of 5)', byTitle('Swim').dueDate === day(0) && (await step()) === 'time' && (await dots()) === 'Step 3 of 5', JSON.stringify(byTitle('Swim')));
  await setTime('07:00');
  check('a time is stored at once', byTitle('Swim').startTime === '07:00', JSON.stringify(byTitle('Swim')));
  await tap('[data-step-length="60"]', 900);
  check('a length is stored at once', byTitle('Swim').durationMinutes === 60, JSON.stringify(byTitle('Swim')));
  await shot('phone-p25-time');
  await next();
  check('then "Which list or label?" (Step 4 of 5)', (await step()) === 'where' && (await dots()) === 'Step 4 of 5');
  await tap('[data-step-list="Work"]', 900);
  await tap('[data-step-label="Health"]', 900);
  check('a list and a label are stored at once', byTitle('Swim').listKey === 'LW' && byTitle('Swim').projectKey === 'LH', JSON.stringify(byTitle('Swim')));
  await shot('phone-p25-where');
  await next();
  check('then "Anything else to add?" (Step 5 of 5) with Notes and Smaller tasks', (await step()) === 'more' && (await dots()) === 'Step 5 of 5' && /Notes/i.test(await flowText()) && /Smaller tasks/i.test(await flowText()));
  await P.finger.tap(visible('[data-step-notes]'), 300);
  await typeText('Bring goggles');
  await P.finger.tap(visible('[data-step-part-input]'), 400);
  await typeText('Pack the bag');
  await tap('[data-step-add-part]', 1200);
  const swim = byTitle('Swim');
  const part = byTitle('Pack the bag');
  check('a smaller task is added under it', !!part && part.parentId === swim.id, JSON.stringify(part));
  check('the notes were stored when the box was left', swim.notes === 'Bring goggles', JSON.stringify(swim));
  await shot('phone-p25-more');
  check('the last screen says Done', (await P.js(`(${visible('[data-step-next]')} || {}).innerText || ''`)).trim() === 'Done');
  await next();
  const after = { step: await step(), bar: await bar() };
  check('Done closes; a task with a Day gets no note about Brain Dump', !after.step && !/Saved in .*Swim/.test(after.bar), JSON.stringify(after));
  check('no priority anywhere in the flow (the task has none)', !byTitle('Swim').priority);

  // ---- Skip and Back; What time? needs a Day; Just a reminder ----
  await plus();
  await typeText('Read a book');
  await next();
  await tap('[data-step-skip]', 1000);
  check('Skip with no Day passes over "What time?" to "Which list or label?"', (await step()) === 'where', await step());
  await tap('[data-step-back]', 1000);
  check('Back goes to "When do you want it done by?"', (await step()) === 'when');
  await tap('[data-step-back]', 1000);
  check('Back again reaches the first screen, with the title kept', (await step()) === 'what' && (await P.js(`(${visible('[data-step-text]')} || {}).value`)) === 'Read a book');
  await next();
  await tap('[data-step-choice="tomorrow"]', 1200);
  check('Tomorrow stores tomorrow\'s Day', byTitle('Read a book').dueDate === day(1), JSON.stringify(byTitle('Read a book')));
  check('Just a reminder is off until there is a time', await P.js(`(() => { const e = ${visible('[data-step-reminder]')}; return !!e && e.getAttribute('aria-disabled') === 'true'; })()`));
  await setTime('18:00');
  await tap('[data-step-reminder]', 900);
  check('Just a reminder stores 0 minutes (a quick reminder)', byTitle('Read a book').durationMinutes === 0 && byTitle('Read a book').startTime === '18:00', JSON.stringify(byTitle('Read a book')));
  check('the flow never shows the word priority', !/priority/i.test(await flowText()));
  await tap('[data-step-close]', 1200);
  check('closing on "What time?" keeps every answer', byTitle('Read a book').durationMinutes === 0 && !(await step()));

  // ---- a phrase answers its screens ----
  await plus();
  await typeText('Dentist tomorrow 3pm 30m');
  check('the phrase shows its chips on the first screen', !!(await P.js(`!!document.querySelector('[data-phrase-chips]')`)));
  await next();
  const d2 = byTitle('Dentist');
  check('Next stores "Dentist" for tomorrow at 15:00, 30 minutes', !!d2 && d2.dueDate === day(1) && d2.startTime === '15:00' && d2.durationMinutes === 30, JSON.stringify(d2));
  check('the screens it answered are passed over: straight to "Which list or label?"', (await step()) === 'where', await step());
  await tap('[data-step-close]', 1200);

  // ---- closing on the first screen with words typed keeps them ----
  await plus();
  await typeText('Typed then closed');
  await tap('[data-step-close]', 1200);
  check('closing with words typed stores them, with no Day', !!byTitle('Typed then closed') && !byTitle('Typed then closed').dueDate);
  check('and says where it is', /Saved in Brain Dump on the Tasks tab: Typed then closed/.test(await bar()), await bar());

  // ---- the Tasks tab's + fills in the list shown ----
  await P.finger.tap(tab('Tasks'), 1000);
  await P.js(`document.querySelector('[data-list-chip="LW"]').scrollIntoView({ inline: 'center', block: 'nearest' })`);
  await C.sleep(300);
  await tap('[data-list-chip="LW"]', 900);
  await tap('[data-add-button]', 1200);
  await typeText('Send the invoice');
  await next();
  check('the + on a list stores the task in that list', byTitle('Send the invoice') && byTitle('Send the invoice').listKey === 'LW', JSON.stringify(byTitle('Send the invoice')));
  await tap('[data-step-close]', 1200);
  check('closing says it is in Work', /Saved in Work on the Tasks tab: Send the invoice/.test(await bar()), await bar());

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
