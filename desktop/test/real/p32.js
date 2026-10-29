'use strict';
// Real check for 3.15.1 (step 2): the task details' List row is the app's own themed popover list (emoji, name,
// a tick on the chosen one, "New list" at the bottom), no native select; the native selects that remain (Settings)
// take the theme: color-scheme on <html> and option colours from the tokens. Light and dark.
// BELIFIC_SHOTS: a folder for screenshots.
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
  const day = dayKeyFrom(new Date());
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const L = (key, name, sortOrder, extra = {}) => ({ key, name, sortOrder, createdAt: stamp, updatedAt: stamp, ...extra });
  fs.writeFileSync(path.join(dataDir, 'belific_tasks.kv'), JSON.stringify([{ id: 'a', title: 'List task', completed: false, createdAt: stamp, updatedAt: stamp, dueDate: day(0), startTime: '10:00', durationMinutes: 60 }]));
  fs.writeFileSync(path.join(dataDir, 'belific_lists.kv'), JSON.stringify([L('LG', 'Games', 0, { emoji: '🎮' }), L('LP', 'Plain', 1)]));
  fs.writeFileSync(path.join(dataDir, 'belific_desktop_panes.kv'), JSON.stringify({ leftCollapsed: false, rightCollapsed: false, center: 'kanban', calendar: 'day' }));
  const read = readKv(dataDir);
  const stored = () => (read('belific_tasks').find((t) => t.id === 'a') || {}).listKey;

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.setSize(1440, 900);
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await I.waitBody('List task', 20000);

  const lum = (rgb) => {
    const m = String(rgb).match(/\d+(\.\d+)?/g) || [0, 0, 0];
    const [r, g, b] = m.slice(0, 3).map((v) => { const c = Number(v) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const openDetails = async () => {
    await I.click(I.byLabel('Show Tasks'), 900).catch(() => {});
    await I.click(I.byLabel('Title List task'), 900);
    await C.waitFor(() => I.exists(`document.querySelector('[data-list-pick]')`), 8000);
  };
  const pickText = async () => String(await I.js(`document.querySelector('[data-list-pick]').innerText`)).replace(/[\uFE0F\uE000-\uF8FF]/g, '').replace(/\s+/g, ' ').trim();
  const openPick = () => I.click(`document.querySelector('[data-list-pick]')`, 600);
  const rows = () =>
    I.js(`(() => { const p = document.querySelector('[data-popover]'); if (!p) return null; return [...p.querySelectorAll('[role="button"]')].map((r) => ({ label: r.getAttribute('aria-label'), text: r.innerText.replace(/\\s+/g, ' ').trim(), selected: /[\uE000-\uF8FF]/.test(r.innerText) ? 'true' : 'false', color: getComputedStyle([...r.querySelectorAll('div')].find((d) => d.children.length === 0 && /[A-Za-z]/.test(d.textContent)) || r).color })); })()`);
  const popBg = () => I.js(`getComputedStyle(document.querySelector('[data-popover]')).backgroundColor`);

  async function pass(mode) {
    await openDetails();
    check(`${mode}: no native select in the details`, !(await I.exists(`document.querySelector('[data-detail-panel] select')`)));
    check(`${mode}: the List row shows the list with its emoji (Brain Dump now)`, (await pickText()) === '🧠 Brain Dump', await pickText());
    await openPick();
    const r = await rows();
    check(`${mode}: the list popover opens`, !!r, JSON.stringify(r));
    const labels = (r || []).map((x) => x.label);
    const want = ['Move to Brain Dump', 'Move to list Games', 'Move to list Plain', ...(mode === 'dark' ? ['Move to list Errands'] : []), 'New list'];
    check(`${mode}: rows are Brain Dump, then the lists, then New list at the bottom`, JSON.stringify(labels) === JSON.stringify(want), JSON.stringify(labels));
    check(`${mode}: each row has its emoji and name`, r[0].text.replace(/️/g, '').includes('🧠') && r[1].text.includes('🎮') && r[1].text.includes('Games') && r[2].text.includes('Plain'), JSON.stringify(r.map((x) => x.text)));
    check(`${mode}: the chosen one carries the tick (selected)`, r[0].selected === 'true' && r[1].selected === 'false' && r[2].selected === 'false', JSON.stringify(r.map((x) => x.selected)));
    const bg = await popBg();
    check(`${mode}: names read at 4.5:1 or more on the popover (${bg})`, r.every((x) => ratio(x.color, bg) >= 4.5), JSON.stringify(r.map((x) => [x.label, x.color, ratio(x.color, bg).toFixed(2)])));
    check(`${mode}: the popover is ${mode === 'dark' ? 'dark' : 'light'}`, mode === 'dark' ? lum(bg) < 0.2 : lum(bg) > 0.5, bg);
    await I.shot(`p32-list-popover-${mode}`);
    await I.click(`document.querySelector('[aria-label="Move to list Games"]')`, 700);
    check(`${mode}: choosing Games stores it and shows 🎮 Games`, stored() === 'LG' && (await pickText()) === '🎮 Games', `${stored()} / ${await pickText()}`);
    await openPick();
    const r2 = await rows();
    check(`${mode}: the tick moved to Games`, r2[1].selected === 'true' && r2[0].selected === 'false');
    await I.click(`document.querySelector('[aria-label="Move to Brain Dump"]')`, 700);
    check(`${mode}: choosing Brain Dump clears the list`, stored() === undefined && (await pickText()) === '🧠 Brain Dump', `${stored()} / ${await pickText()}`);
  }

  await pass('light');

  // ---- New list, at the bottom of the popover ----
  await openPick();
  await I.click(`document.querySelector('[aria-label="New list"]')`, 500);
  check('New list asks for a name with a Create list button, off while empty', (await I.js(`(() => { const b = document.querySelector('[data-popover] [aria-label="Create list"]'); return b ? b.getAttribute('data-create-list') : null; })()`)) === 'off');
  await I.type('Plain');
  check('a duplicate name keeps it off and says why', ((await I.js(`document.querySelector('[data-popover]').innerText`)) || '').includes('Another list has that name'));
  await I.js(`(() => { const i = document.querySelector('[data-popover] [aria-label="New list name"]'); i.focus(); i.select(); })()`);
  await I.type('Errands');
  await I.enter();
  await C.waitFor(async () => !!read('belific_lists').find((l) => l.name === 'Errands'), 5000).catch(() => {});
  const errands = read('belific_lists').find((l) => l.name === 'Errands');
  check('Enter creates the list and chooses it for the task', !!errands && stored() === errands.key && (await pickText()).includes('Errands'), `${JSON.stringify(errands)} ${stored()} ${await pickText()}`);
  await openPick();
  await I.click(`document.querySelector('[aria-label="Move to Brain Dump"]')`, 700);
  await I.key('Escape', [], 400);

  // ---- Dark ----
  const icon = (await I.exists(I.byLabel('Profile and account'))) ? 'Profile and account' : 'Profile, not signed in';
  await I.click(I.byLabel(icon));
  await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 700);
  await I.waitBody('POWER FEATURES', 8000);
  await I.click(`document.querySelector('[data-theme-setting] [data-theme-mode="dark"]')`, 900);
  // The native selects that remain take the theme.
  const nat = await I.js(`(() => { const s = document.querySelector('select[aria-label="My day starts at"]'); const o = s.options[1]; return { scheme: getComputedStyle(document.documentElement).colorScheme, selScheme: getComputedStyle(s).colorScheme, optBg: getComputedStyle(o).backgroundColor, optColor: getComputedStyle(o).color, selColor: getComputedStyle(s).color, page: getComputedStyle(document.body).backgroundColor }; })()`);
  check('dark: color-scheme is dark on the page and on a native select', nat.scheme === 'dark' && nat.selScheme === 'dark', JSON.stringify(nat));
  check('dark: a native option is dark with light text (4.5:1 or more)', lum(nat.optBg) < 0.2 && ratio(nat.optColor, nat.optBg) >= 4.5, JSON.stringify(nat));
  await I.shot('p32-settings-select-dark');
  const sels = await I.js(`[...document.querySelectorAll('select')].map((s) => ({ label: s.getAttribute('aria-label'), bg: getComputedStyle(s.options[0]).backgroundColor, color: getComputedStyle(s.options[0]).color }))`);
  check('dark: every native select on the page has readable options', sels.length >= 2 && sels.every((s) => ratio(s.color, s.bg) >= 4.5 && lum(s.bg) < 0.2), JSON.stringify(sels));
  await I.click(I.byLabel('Back'), 900);
  await pass('dark');

  // ---- Back to light: the native options follow ----
  await I.key('Escape', [], 400);
  await I.click(I.byLabel(icon));
  await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Settings"]')`, 700);
  await I.waitBody('POWER FEATURES', 8000);
  await I.click(`document.querySelector('[data-theme-setting] [data-theme-mode="light"]')`, 900);
  const lightSel = await I.js(`(() => { const s = document.querySelector('select[aria-label="My day starts at"]'); const o = s.options[1]; return { scheme: getComputedStyle(document.documentElement).colorScheme, optBg: getComputedStyle(o).backgroundColor, optColor: getComputedStyle(o).color }; })()`);
  check('light: color-scheme is light and the option is light with dark text', lightSel.scheme === 'light' && lum(lightSel.optBg) > 0.5 && ratio(lightSel.optColor, lightSel.optBg) >= 4.5, JSON.stringify(lightSel));
  await I.shot('p32-settings-select-light');

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
