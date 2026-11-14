'use strict';
// @real-input: quiet
// Real touch check for 3.56.0 (PLAN_phone_parity phase 4) at 390 x 844: the + opens the whole task card.
//   - Today's +: the card with Cancel, "New task" and Done, "Goes to: Today", the title focused, and every row from the start
//     (Length, Repeat, Reminders, Label, List, Smaller tasks, Notes);
//   - "Dentist tomorrow 3pm 30m": chips Tomorrow, 3:00pm, 30m (14 px or more) under the title, nothing stored yet;
//     Done stores "Dentist" for tomorrow at 15:00 for 30 minutes;
//   - "Keep it as plain text" stores the words as typed;
//   - Cancel after the title was stored throws the task away (to the Trash);
//   - once it has a name a task can take a smaller task before Done.
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
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const read = (k) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dataDir, `${k}.kv`), 'utf8'));
    } catch {
      return [];
    }
  };
  const all = () => read('belific_tasks');
  const live = () => all().filter((t) => !t.deletedAt);

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
  const open = () => P.js(`!!document.querySelector('[data-task-details]')`);
  const sheetText = () => P.js(`(() => { const r = document.querySelector('[data-task-details]'); return r && r.parentElement ? r.parentElement.innerText.replace(/\\s+/g, ' ') : ''; })()`);
  const plus = async () => {
    await P.finger.tap(tab('Today'), 1000);
    await P.finger.tap(visible('[data-add-button]'), 1200);
  };

  // ---- the card ----
  await plus();
  const head = await P.js(`(() => { const a = document.activeElement; const h = document.querySelector('[data-task-details]'); return { open: !!h, label: a && a.getAttribute('aria-label'), head: h ? h.innerText.replace(/\\s+/g, ' ') : '' }; })()`);
  check('+ opens the whole task card: Cancel, New task, Done, the title focused', head.open && head.label === 'Task title' && /Cancel/.test(head.head) && /New task/.test(head.head) && /Done/.test(head.head), JSON.stringify(head));
  const text0 = await sheetText();
  check('it says where the task goes ("Goes to: Today")', text0.includes('Goes to: Today'), text0.slice(0, 200));
  check('every row is there from the start: Length, Repeat, Reminders, Label, List, Smaller tasks, Notes', ['Length', 'Repeat', 'Reminders', 'Label', 'List', 'SMALLER TASKS', 'NOTES'].every((w) => text0.toUpperCase().includes(w.toUpperCase())), text0);
  check('Smaller tasks says to name the task first', text0.includes('Give the task a name first, then add smaller tasks.'));
  await shot('phone-p22-card');
  const cancelBox = await P.js(`(() => { const e = ${visible('[aria-label="Cancel new task"]')}; const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })()`);
  const doneBox = await P.js(`(() => { const e = ${visible('[data-details-done]')}; const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })()`);
  check('Cancel and Done are 44 high or more', cancelBox[1] >= 44 && doneBox[1] >= 44, JSON.stringify([cancelBox, doneBox]));

  // ---- a phrase ----
  await typeText('Dentist tomorrow 3pm 30m');
  const chips = await P.js(`(() => { const box = document.querySelector('[data-phrase-chips]'); if (!box) return null; return [...box.querySelectorAll('div')].filter((e) => e.children.length === 0 && e.innerText.trim() && e.parentElement.getBoundingClientRect().height >= 40 && !e.closest('[aria-label]')).map((e) => ({ t: e.innerText.trim(), h: Math.round(e.parentElement.getBoundingClientRect().height), f: parseFloat(getComputedStyle(e).fontSize) })); })()`);
  const names = (chips || []).map((c) => c.t).join('|');
  check('chips under the title say what was understood: Tomorrow, 3:00pm, 30m', /Tomorrow/.test(names) && /3:00\s?pm/i.test(names) && /30\s?m/.test(names), JSON.stringify(chips));
  check('the chips are 14 px or more', !!chips && chips.length > 0 && chips.every((c) => c.f >= 14), JSON.stringify(chips));
  check('nothing is stored while typing', live().length === 0);
  await shot('phone-p22-chips');
  await P.finger.tap(visible('[data-details-done]'), 1500);
  const dentist = live().find((t) => /Dentist/.test(t.title));
  const tomorrow = day(1);
  check('Done stores "Dentist" for tomorrow at 15:00, 30 minutes', !!dentist && dentist.title === 'Dentist' && dentist.dueDate === tomorrow && dentist.startTime === '15:00' && dentist.durationMinutes === 30, JSON.stringify(dentist));
  check('Done closed the card', !(await open()));

  // ---- keep it as plain text ----
  await plus();
  await typeText('Lunch with Sam tomorrow');
  await P.finger.tap(visible('[data-keep-plain]'), 700);
  check('Keep it as plain text hides the chips', !(await P.js(`!!document.querySelector('[data-phrase-chips]')`)));
  await P.finger.tap(visible('[data-details-done]'), 1500);
  const lunch = live().find((t) => t.title === 'Lunch with Sam tomorrow');
  check('the words are stored exactly as typed, with only the place (today)', !!lunch && lunch.dueDate === day(0) && !lunch.startTime, JSON.stringify(lunch));

  // ---- cancel after the title was stored; a smaller task once it has a name ----
  await plus();
  await typeText('Throw away');
  await P.js(`document.activeElement.blur()`);
  await C.sleep(900);
  check('leaving the title stores it', live().some((t) => t.title === 'Throw away'));
  check('and then it can take a smaller task', (await sheetText()).includes('Add a smaller task'));
  await P.finger.tap(visible('[aria-label="Cancel new task"]'), 1200);
  check('Cancel throws it away: the task is in the Trash, the card is closed', !live().some((t) => t.title === 'Throw away') && all().some((t) => t.title === 'Throw away' && t.deletedAt) && !(await open()));

  await plus();
  await typeText('Real one');
  await P.js(`document.activeElement.blur()`);
  await C.sleep(900);
  await P.js(`(() => { const e = document.querySelector('[data-part-input]'); let a = e && e.parentElement; while (a && !(a.scrollHeight > a.clientHeight + 5 && /(auto|scroll)/.test(getComputedStyle(a).overflowY))) a = a.parentElement; if (a) a.scrollTop = a.scrollHeight; return !!a; })()`);
  await C.sleep(300);
  await P.finger.tap(visible('[data-part-input]'), 400);
  await typeText('Step one');
  await P.finger.tap(visible('[data-add-part]'), 1000);
  const real = live().find((t) => t.title === 'Real one');
  const part = live().find((t) => t.title === 'Step one');
  check('a smaller task is added before Done', !!real && !!part && part.parentId === real.id, JSON.stringify([real && real.id, part]));
  await P.finger.tap(visible('[data-details-done]'), 1200);
  check('Done keeps both', live().some((t) => t.title === 'Real one') && live().some((t) => t.title === 'Step one'));

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
