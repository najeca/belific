'use strict';
// Real touch check for PLAN_phone P2 (2.50.0): the phone's touch kit on the Brain Dump cards, at
// 390 x 844 with real touch events (phone-common.js). A short still tap opens a card; a finger that
// moves (a scroll) opens nothing; a slow lift opens nothing; a 450 ms hold opens the menu; a swipe
// to the left shows Delete, and Delete deletes. Isolated data folder; Supabase is the in process fake.
// BELIFIC_SHOTS: a folder for screenshots.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const C = require('./common');
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
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const tasks = Array.from({ length: 18 }, (_, i) => ({ id: `d${i}`, title: `Thought number ${i + 1}`, completed: false, createdAt: new Date(Date.parse(stamp) + i * 60000).toISOString(), updatedAt: stamp }));
  fs.writeFileSync(path.join(dataDir, 'belific_tasks.kv'), JSON.stringify(tasks));
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

  const width = await P.js('window.innerWidth');
  check('the page is phone sized (390 px wide)', width === 390, String(width));
  // Open Brain Dump from the tab bar.
  await P.finger.tap(`[...document.querySelectorAll('[role="tab"], a, [role="link"], [role="button"]')].find((e) => /Brain Dump/.test(e.textContent) && e.getBoundingClientRect().top > 700)`, 900);
  await C.waitFor(() => P.js(`!!document.querySelector('[data-dump-card]')`), 6000).catch(() => {});
  check('Brain Dump shows the cards', await P.js(`document.querySelectorAll('[data-dump-card]').length >= 10`));
  await shot('phone-p2-braindump');

  const card = (t) => `document.querySelector('[data-dump-card="${t}"]')`;
  const editOpen = () => P.js(`document.body.innerText.includes('Edit thought')`);
  const menuOpen = () => P.js(`!!document.querySelector('[data-action-menu]')`);
  const closeEdit = async () => {
    if (await editOpen()) await P.finger.tap(`[...document.querySelectorAll('[aria-label="Cancel"]')].pop()`, 800);
  };

  // A tap.
  await P.finger.tap(card('Thought number 18'), 900);
  check('tap: a quick still tap opens the card', await editOpen());
  await shot('phone-p2-tap');
  await closeEdit();
  check('the edit sheet closes', !(await editOpen()));

  // A scroll that starts on a card.
  const scroller = `(() => { let e = ${card('Thought number 14')}; while (e && !(e.scrollHeight > e.clientHeight + 4 && ['auto', 'scroll'].includes(getComputedStyle(e).overflowY))) e = e.parentElement; return e; })()`;
  const before = await P.js(`(${scroller} || {}).scrollTop || 0`);
  await P.finger.drag(card('Thought number 14'), 0, -160, 260, 700);
  const after = await P.js(`(${scroller} || {}).scrollTop || 0`);
  check('scroll: a finger that moves up the list opens nothing', !(await editOpen()) && !(await menuOpen()));
  check('scroll: the list actually scrolled', after > before + 40, `${before} -> ${after}`);
  await P.finger.drag(card('Thought number 10'), 0, 25, 160, 600);
  check('scroll: even a short 25 px move opens nothing', !(await editOpen()) && !(await menuOpen()));

  // A slow lift.
  await P.finger.slow(card('Thought number 12'), 320, 600);
  check('slow lift: too long for a tap, too short for a hold: nothing opens', !(await editOpen()) && !(await menuOpen()));

  // Press and hold.
  await P.finger.hold(card('Thought number 12'), 480, 700);
  check('hold: about 400 ms opens the quick menu', await menuOpen());
  const items = await P.js(`[...document.querySelectorAll('[data-action-menu] [role="button"]')].map((e) => e.getAttribute('aria-label'))`);
  check('hold: the menu has Edit, Delete and Cancel', JSON.stringify(items) === JSON.stringify(['Edit', 'Delete', 'Cancel']), JSON.stringify(items));
  await shot('phone-p2-hold');
  await P.finger.tap(`document.querySelector('[data-action-menu] [aria-label="Cancel"]')`, 700);
  check('hold: Cancel closes the menu in one tap', !(await menuOpen()));

  // Swipe left.
  await P.finger.drag(card('Thought number 12'), -170, 0, 260, 800, { x: 300, y: 20 });
  // Every row has its (hidden) Delete; the one on screen is the swiped row's.
  const shown = await P.js(`[...document.querySelectorAll('[data-swipe-action="Delete"]')].some((a) => { const r = a.getBoundingClientRect(); return r.width > 40 && r.left >= 0 && r.right <= innerWidth + 1; })`);
  check('swipe left: the Delete button shows', shown);
  check('swipe left: it did not open the card or the menu', !(await editOpen()) && !(await menuOpen()));
  await shot('phone-p2-swipe');
  const visibleDelete = `[...document.querySelectorAll('[data-swipe-action="Delete"]')].find((e) => { const r = e.getBoundingClientRect(); return r.width > 40 && r.left < innerWidth && r.right > 0; })`;
  if (shown) await P.finger.tap(visibleDelete, 900);
  await C.waitFor(() => stored().find((t) => t.id === 'd11').deletedAt, 5000).catch(() => {});
  check('swipe left then Delete: the thought is deleted (a tombstone), the others stay', !!stored().find((t) => t.id === 'd11').deletedAt && stored().filter((t) => !t.deletedAt).length === 17);

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
