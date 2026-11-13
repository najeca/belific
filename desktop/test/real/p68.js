'use strict';
// @real-input: quiet
// Real check for 3.53.2: the sync line is always on screen. Signed out (a fresh computer, the fake server answering):
//   - desktop at 1700 x 1000: "Not signed in" sits in the top bar, left of the profile avatar, inside the window and on
//     one line, in the secondary text colour (not the warning colour);
//   - the phone at 390 x 844: the same line sits under the screen title on Today, inside the header and the window.
// The signed in wording ("Synced just now", "Sync failed: reason") is pinned by syncText.test.ts and the engine
// tests (syncEngine.test.ts, 3.53.2); this check is that the line is drawn where a person sees it.
// Runs quiet.
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
  fs.mkdirSync(path.join(userData, 'data'), { recursive: true });

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1700, 1000);
  win.show();
  const js = (code) => win.webContents.executeJavaScript(code, true);
  const badge = `(() => {
    const b = document.querySelector('[data-sync-badge]');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    const a = document.querySelector('[aria-label="Profile, not signed in"], [aria-label="Profile and account"], [aria-label="Profile and settings"]');
    const ar = a ? a.getBoundingClientRect() : null;
    return { text: b.innerText.trim(), left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height,
      color: getComputedStyle(b).color, avatarLeft: ar ? ar.left : null, avatarTop: ar ? ar.top : null, avatarBottom: ar ? ar.bottom : null,
      w: innerWidth, h: innerHeight };
  })()`;

  await C.waitFor(() => js(badge), 20000).catch(() => null);
  const d = await js(badge);
  check('desktop: the sync line is on screen', !!d, JSON.stringify(d));
  check('desktop: signed out it reads "Not signed in"', d && d.text === 'Not signed in', d && d.text);
  check('desktop: it sits left of the profile avatar, level with it', d && d.avatarLeft !== null && d.right <= d.avatarLeft && d.top >= d.avatarTop - 4 && d.bottom <= d.avatarBottom + 4, JSON.stringify(d));
  check('desktop: inside the window, on one line', d && d.left >= 0 && d.right <= d.w && d.top >= 0 && d.height < 24, JSON.stringify(d));
  const dangerish = (c) => /rgb\((\d+), (\d+), (\d+)\)/.exec(c || '');
  const m = d && dangerish(d.color);
  check('desktop: in a quiet colour, not the warning red', !!m && !(Number(m[1]) > 150 && Number(m[2]) < 110 && Number(m[3]) < 110), d && d.color);

  await phoneWindow(win);
  await C.sleep(1500);
  await C.waitFor(() => js(`!!document.querySelector('[data-sync-badge]')`), 15000).catch(() => null);
  const p = await js(badge);
  check('phone: the sync line is on screen', !!p, JSON.stringify(p));
  check('phone: signed out it reads "Not signed in"', p && p.text === 'Not signed in', p && p.text);
  check('phone: under the title, inside the header (above the avatar bottom + a line), inside the window', p && p.left >= 0 && p.right <= p.w && p.top > 0 && p.bottom <= (p.avatarBottom ?? 0) + 30, JSON.stringify(p));
  check('phone: the Today title is still there above it', await js(`[...document.querySelectorAll('[role="heading"]')].some((h) => h.innerText.trim() === 'Today' && h.getBoundingClientRect().bottom <= ${p ? p.top + 1 : 0})`));

  if (process.env.BELIFIC_SHOTS) {
    fs.mkdirSync(process.env.BELIFIC_SHOTS, { recursive: true });
    fs.writeFileSync(path.join(process.env.BELIFIC_SHOTS, 'p68-phone.png'), (await win.webContents.capturePage()).toPNG());
  }
  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
