'use strict';
// @real-input: quiet
// Real check for 3.55.0 (PLAN_phone_parity phase 3), desktop: the example lists.
//   - the list switcher's New list shows Home, Work, Shopping (14 px or more); one tap makes the list with its emoji and
//     chooses it; the one made is no longer offered; nothing is made without a tap.
// The label menu's Health, Money, Family are checked on the phone (phone-p21) and in presets.test.ts.
// Runs quiet.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const C = require('./common');
const { makeInput, readKv } = require('./input');

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
  const stamp = '2026-11-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'belific_tasks.kv'), JSON.stringify([{ id: 'rent', title: 'Pay rent', completed: false, createdAt: stamp, updatedAt: stamp }]));
  const read = readKv(dataDir);
  const lists = () => (read('belific_lists') || []).filter((l) => !l.deletedAt);

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1700, 1000);
  win.show();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await C.sleep(2500);
  await I.waitBody('Pay rent', 20000);
  await I.click(I.byLabel('Show Tasks'), 900).catch(() => {});
  await C.sleep(900);

  await I.click(`document.querySelector('[data-ctl="lists"]')`, 900);
  const offered = await I.js(`[...document.querySelectorAll('[data-list-presets] [aria-label^="Add list"]')].map((e) => e.getAttribute('aria-label'))`);
  check('New list offers Home, Work and Shopping', JSON.stringify(offered) === '["Add list Home","Add list Work","Add list Shopping"]', JSON.stringify(offered));
  check('nothing was made without a tap', lists().length === 0);
  const fonts = await I.js(`[...document.querySelectorAll('[data-list-presets] *')].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).map((e) => parseFloat(getComputedStyle(e).fontSize))`);
  check('the preset text is 14 px or more', fonts.length > 0 && Math.min(...fonts) >= 14, JSON.stringify(fonts));
  check('the one line hint is there', (await I.body()).includes('Tap one to add it.'));
  await I.shot('p69-presets');
  await I.click(I.byLabel('Add list Work'), 1500);
  check('one tap on Work makes the list with its emoji', lists().length === 1 && lists()[0].name === 'Work' && lists()[0].emoji === '💼', JSON.stringify(lists()));

  await I.click(`document.querySelector('[data-ctl="lists"]')`, 900);
  const left = await I.js(`[...document.querySelectorAll('[data-list-presets] [aria-label^="Add list"]')].map((e) => e.getAttribute('aria-label'))`);
  check('Work is no longer offered', JSON.stringify(left) === '["Add list Home","Add list Shopping"]', JSON.stringify(left));

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
