'use strict';
// Real check for build plan phase 8 (calendar connections) on the desktop: real
// mouse, key and text input into the real app, on an isolated data folder
// asserted NOT to be the real one; Supabase is the in process fake.
//
// Imported calendars: main's real fetch rules (src/icsFetch.js: https only,
// redirects, limits, the connect-time address check) all run; only the network
// transport underneath is swapped for an in process one that serves ICS text
// (and a fake DNS where private.example resolves to 10.0.0.5). One subscription
// is seeded with a last attempt two hours ago, so the refresh timer must fetch
// it on launch by itself.
// Feed link: signed out it explains; signed in (fake Apple) it creates, copies,
// regenerates and turns off the token row, and the fake server receives each.
// BELIFIC_SHOTS: a folder for screenshots.
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { app, shell, clipboard } = require('electron');
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
  let fake = null;
  app.whenReady().then(() => {
    fake = C.installFakeSupabase();
    fake.store = { tables: {} };
  });
  const opened = [];
  shell.openExternal = async (url) => {
    opened.push(url);
  };

  const now = new Date();
  const day = dayKeyFrom(now);
  const today = day(0);
  const tomorrow = day(1);
  const ymd = (k) => k.replace(/-/g, '');
  const stamp = '2026-09-01T07:00:00.000Z';
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(
    path.join(dataDir, 'belific_tasks.kv'),
    JSON.stringify([
      { id: 'b1', title: 'Beta', completed: false, createdAt: stamp, updatedAt: stamp },
      { id: 'tm', title: 'Timed task', completed: false, createdAt: stamp, updatedAt: stamp, dueDate: today, startTime: '07:00', durationMinutes: 30 },
    ]),
  );
  const SECRET_PATH = '/calendar/ical/me/private-S3CRETs3cret/basic.ics';
  const GOOD = `https://cal.example${SECRET_PATH}`;
  const SEEDED = 'https://cal.example/seeded/private-SEEDEDsecret.ics';
  fs.writeFileSync(
    path.join(dataDir, 'belific_ics_subscriptions.kv'),
    JSON.stringify([{ id: 'seed1', name: 'Seeded', url: SEEDED, addedAt: stamp, lastAttemptAt: new Date(Date.now() - 2 * 3600000).toISOString(), lastRefreshedAt: new Date(Date.now() - 2 * 3600000).toISOString(), eventCount: 0 }]),
  );

  const ics = (events) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Test//EN', 'X-WR-CALNAME:Work calendar', ...events, 'END:VCALENDAR'].join('\r\n') + '\r\n';
  const vevent = (...lines) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n');
  const GOOD_ICS = ics([
    // Every day at 10:00 London time, so it is on today whatever day this runs.
    vevent('UID:sync', 'SUMMARY:Team sync', `DTSTART;TZID=Europe/London:${ymd(day(-3))}T100000`, 'DURATION:PT30M', 'RRULE:FREQ=DAILY'),
    vevent('UID:hol', 'SUMMARY:Holiday', `DTSTART;VALUE=DATE:${ymd(today)}`, `DTEND;VALUE=DATE:${ymd(tomorrow)}`),
    // Floating 22:00 today to 02:00 tomorrow: cut at midnight.
    vevent('UID:night', 'SUMMARY:Night shift', `DTSTART:${ymd(today)}T220000`, `DTEND:${ymd(tomorrow)}T020000`),
    vevent('UID:gone', 'SUMMARY:Cancelled thing', `DTSTART:${ymd(today)}T150000`, 'STATUS:CANCELLED'),
  ]);
  const SEEDED_ICS = ics([vevent('UID:s1', 'SUMMARY:Seeded event', `DTSTART;VALUE=DATE:${ymd(today)}`)]);

  // The swapped transport: served answers by URL; the fake DNS goes through
  // main's own safe lookup, as a real connection would.
  const served = { [GOOD]: () => GOOD_ICS, [SEEDED]: () => SEEDED_ICS, 'https://private.example/cal.ics': () => GOOD_ICS, 'https://hop.example/r': () => ({ redirect: 'http://cal.example/plain.ics' }) };
  const fetched = [];
  const icsFetch = require('../../src/icsFetch');
  const realFetch = icsFetch.fetchIcs;
  const fakeDns = (host, opts, cb) => cb(null, [{ address: host === 'private.example' ? '10.0.0.5' : '93.184.216.34', family: 4 }]);
  const request = (url, opts) =>
    new Promise((resolve, reject) => {
      const host = new URL(url).hostname;
      opts.lookup(host, {}, (err) => {
        if (err) return reject(err);
        fetched.push(url);
        const make = served[url];
        if (!make) return resolve({ status: 404, headers: {}, stream: Readable.from([Buffer.from('nope')]) });
        const out = make();
        if (out && out.redirect) return resolve({ status: 302, headers: { location: out.redirect }, stream: Readable.from([]) });
        if (out && out.status) return resolve({ status: out.status, headers: {}, stream: Readable.from([Buffer.from('x')]) });
        resolve({ status: 200, headers: { 'content-type': 'text/calendar' }, stream: Readable.from([Buffer.from(out)]) });
      });
    });
  icsFetch.fetchIcs = (url, opts = {}) => realFetch(url, { ...opts, request, lookup: icsFetch.makeSafeLookup(fakeDns) });

  const read = readKv(dataDir);
  const subs = () => read('belific_ics_subscriptions') || [];
  const settings = () => read('belific_user_settings') || [];
  const tokenRow = () => settings().find((s) => s.key === 'calendar.feed_token');
  const serverToken = () => (fake.store.tables.user_settings || []).find((r) => r.key === 'calendar.feed_token');

  require(C.MAIN);
  await app.whenReady();
  const win = await C.waitFor(() => C.firstWindow());
  win.show();
  win.focus();
  win.webContents.focus();
  const I = makeInput(win, process.env.BELIFIC_SHOTS || '');
  await I.waitBody('Beta', 20000);
  await C.sleep(800);
  const profileIcon = async () => ((await I.exists(I.byLabel('Profile and account'))) ? 'Profile and account' : 'Profile, not signed in');
  const openFromMenu = async (label) => {
    await I.click(I.byLabel(await profileIcon()));
    await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="${label}"]')`, 600);
  };
  const openSettings = async () => {
    await openFromMenu('Settings');
    await I.waitBody('CALENDARS', 8000);
  };
  const back = async () => {
    await I.click(I.byLabel('Back'));
    await I.waitBody('Beta', 8000);
  };
  const text = (label) => I.textOf(I.byLabel(label));
  const typeInto = async (label, value) => {
    await I.click(I.byLabel(label));
    await I.js(`(() => { const e = ${I.byLabel(label)}; e.select(); })()`);
    await I.key('Delete');
    await I.type(value);
  };
  const ext = (attr, uidPart) => I.js(`Array.from(document.querySelectorAll('[data-${attr}]')).filter((e) => e.getBoundingClientRect().width > 0 && e.dataset[${JSON.stringify(attr === 'ext-block' ? 'extBlock' : 'extChip')}].includes(${JSON.stringify(uidPart)})).length`);

  // ======== 1. The timer refreshed the stale seeded subscription by itself ========
  await C.waitFor(() => fetched.includes(SEEDED), 10000).catch(() => {});
  check('on launch the timer fetched the subscription that was due (last try 2 hours ago)', fetched.includes(SEEDED), JSON.stringify(fetched));
  await C.waitFor(() => subs()[0] && subs()[0].eventCount === 1, 6000).catch(() => {});
  check('its new events and refresh time were stored on this computer', subs()[0].eventCount === 1 && Date.parse(subs()[0].lastRefreshedAt) > Date.now() - 60000 && fs.existsSync(path.join(dataDir, 'belific_ics_cal_seed1.kv')));

  // ======== 2. Settings, Calendars, signed out ========
  await openSettings();
  const upper = (await I.body()).toUpperCase();
  check('Settings has a 📅 Calendars section', upper.includes('📅 CALENDARS') && (await I.exists(I.byLabel('Calendars settings'))));
  check('signed out, the feed says it needs an account (and offers no link)', (await text('Calendar feed')).includes('Sign in to get a feed link') && !(await I.exists(I.byLabel('Feed link'))));
  check('the iPhone calendars are explained (allowed on the iPhone, nothing comes here)', (await I.body()).includes('iPhone calendars') && (await I.body()).includes('Nothing from them comes to this computer'));
  check('the seeded subscription is listed with its host, event count and refresh time', (await text('Imported calendar Seeded')).includes('cal.example') && (await text('Imported calendar Seeded')).includes('1 event') && /Refreshed \d\d:\d\d/.test(await text('Imported calendar Seeded')), await text('Imported calendar Seeded'));
  await I.shot('p8-01-settings-signed-out');

  // ======== 3. Adding: refusals, then a good link ========
  const before = fetched.length;
  await typeInto('Calendar link', 'http://cal.example/plain.ics');
  await I.click(I.byLabel('Add calendar'), 600);
  check('an http link is refused in words, never fetched, never stored', (await text('Import note')).includes('Only secure links') && fetched.length === before && subs().length === 1, await text('Import note'));
  await typeInto('Calendar link', 'https://user:pw@cal.example/x.ics');
  await I.click(I.byLabel('Add calendar'), 600);
  check('a link with a user name and password is refused', (await text('Import note')).includes('user name or password') && subs().length === 1);
  await typeInto('Calendar link', 'https://private.example/cal.ics');
  await I.click(I.byLabel('Add calendar'));
  await C.waitFor(async () => (await text('Import note')).includes('private'), 6000).catch(() => {});
  check('a name that resolves to a private address is refused at connect time and not stored', (await text('Import note')).includes('local or private address') && subs().length === 1 && !fetched.includes('https://private.example/cal.ics'), await text('Import note'));
  await typeInto('Calendar link', 'https://hop.example/r');
  await I.click(I.byLabel('Add calendar'));
  await C.waitFor(async () => (await text('Import note')).includes('redirected'), 6000).catch(() => {});
  check('a redirect to an http link is refused', (await text('Import note')).includes('redirected somewhere that is not allowed') && subs().length === 1, await text('Import note'));
  await typeInto('Calendar link', GOOD.replace('https://', 'webcal://'));
  await typeInto('Calendar name', 'Work');
  await I.click(I.byLabel('Add calendar'));
  await C.waitFor(async () => (await text('Import note')).includes('added'), 8000).catch(() => {});
  check('a good webcal link is added (stored as https, with the name given)', (await text('Import note')).includes('Calendar added.') && subs().some((s) => s.name === 'Work' && s.url === GOOD), JSON.stringify(subs().map((s) => s.name)));
  const work = subs().find((s) => s.name === 'Work');
  check('its events are stored locally in their own file (3 events counted; the cancelled one is not)', work && work.eventCount === 3 && fs.existsSync(path.join(dataDir, `belific_ics_cal_${work.id}.kv`)));
  check('the screen shows only the host, never the secret path', !(await I.body()).includes('S3CRET') && (await text('Imported calendar Work')).includes('cal.example'));
  const mainLog = () => {
    try {
      return fs.readFileSync(path.join(userData, 'logs', 'main.log'), 'utf8');
    } catch {
      return '';
    }
  };
  check('the main log names hosts and reasons only, never a link path', mainLog().includes('calendar fetch private.example: blocked-address') && !mainLog().includes('S3CRET') && !mainLog().includes('SEEDED') && !mainLog().includes('/cal.ics'), mainLog().split('\n').filter((l) => l.includes('calendar')).join(' | '));
  await I.shot('p8-02-added');

  // ======== 4. The Calendar shows them beside the tasks, read only ========
  await back();
  await I.blur();
  await I.key('v');
  await C.waitFor(async () => I.exists(`document.querySelector('[aria-label="Calendar"]')`), 6000);
  await I.key('d');
  await C.sleep(600);
  check('day view: the repeating 10:00 London event is on today\'s grid', (await ext('ext-block', 'sync|')) === 1);
  check('day view: the all day event and the seeded all day event are in the all day row', (await ext('ext-chip', 'hol|')) === 1 && (await ext('ext-chip', 's1|')) === 1);
  check('day view: the night shift starts at 22:00 on today\'s grid', (await ext('ext-block', 'night|')) === 1 && (await I.exists(`document.querySelector('[aria-label^="Imported event Night shift, 22:00 to 24:00, Work"]')`)));
  check('a cancelled event is not shown', !(await I.body()).includes('Cancelled thing'));
  check('the task is still there beside them', await I.exists(`document.querySelector('[aria-label="Calendar block Timed task"]')`));
  await I.shot('p8-03-calendar-day');
  await I.click(I.byLabel('Calendar next day'), 600);
  check('next day: the rest of the night shift (00:00 to 02:00, continues)', (await I.exists(`document.querySelector('[aria-label^="Imported event Night shift, 00:00 to 02:00, Work, continues"]')`)), await I.js(`Array.from(document.querySelectorAll('[data-ext-block]')).map((e) => e.getAttribute('aria-label')).join(' | ')`));
  check('next day: the all day event is not there (its end day is excluded)', (await ext('ext-chip', 'hol|')) === 0);
  await I.click(I.byLabel('Calendar go to today'), 400);
  await I.key('m');
  await C.sleep(600);
  check('month view: imported events show as chips on today', (await I.js(`(() => { const c = document.querySelector('[data-cal-day=${JSON.stringify(today)}]'); return c ? c.querySelectorAll('[data-ext-chip]').length : -1; })()`)) >= 1);
  await I.shot('p8-04-calendar-month');
  await I.key('w');
  await C.sleep(400);
  const blockCount = await I.js(`document.querySelectorAll('[data-ext-block]').length`);
  check('imported blocks open nothing (read only): pressing one leaves no menu', await (async () => {
    await I.click(`document.querySelector('[data-ext-block]')`, 400);
    return !(await I.exists(`document.querySelector('[data-popover]')`));
  })());
  check('week view: the daily event shows on several days', blockCount >= 2, String(blockCount));
  const tasksFile = JSON.stringify(read('belific_tasks'));
  check('imported events are never written as tasks', !tasksFile.includes('Team sync') && !tasksFile.includes('Holiday'));

  // ======== 5. Error state, stale events kept, recovery ========
  served[GOOD] = () => ({ status: 500 });
  await openSettings();
  await I.click(I.byLabel('Refresh Work'));
  await C.waitFor(async () => I.exists(I.byLabel('Error for Work')), 6000).catch(() => {});
  check('a failed refresh shows a clear error in words', (await text('Error for Work')).includes('Last try failed: The calendar server refused'), await text('Error for Work'));
  check('the subscription keeps its events and its last good refresh time', subs().find((s) => s.name === 'Work').eventCount === 3 && subs().find((s) => s.name === 'Work').lastError === 'http-status');
  await I.shot('p8-05-error');
  await back();
  check('the Calendar says a calendar could not be refreshed and still shows the last events', (await I.exists(I.byLabel('Imported calendar error'))) && (await ext('ext-block', 'sync|')) >= 1);
  served[GOOD] = () => GOOD_ICS;
  await openSettings();
  await I.click(I.byLabel('Refresh Work'));
  await C.waitFor(async () => !(await I.exists(I.byLabel('Error for Work'))), 6000).catch(() => {});
  check('Refresh after the server recovers clears the error', !(await I.exists(I.byLabel('Error for Work'))) && !subs().find((s) => s.name === 'Work').lastError);

  // ======== 6. Remove ========
  await I.click(I.byLabel('Remove Seeded'));
  await I.click(I.byLabel('Confirm remove Seeded'));
  await C.waitFor(() => !subs().some((s) => s.id === 'seed1'), 6000).catch(() => {});
  check('Remove (after a confirm) drops the subscription and its events file', !subs().some((s) => s.id === 'seed1') && !fs.existsSync(path.join(dataDir, 'belific_ics_cal_seed1.kv')));
  await back();
  check('its events leave the Calendar', (await ext('ext-chip', 's1|')) === 0);

  // ======== 7. The feed link, signed in ========
  await I.click(I.byLabel('Profile, not signed in'));
  await I.click(`document.querySelector('[role="dialog"][aria-label="Profile menu"] [aria-label="Sign in"]')`);
  await I.click(I.byLabel('Continue with Apple'));
  await C.waitFor(() => opened.length === 1);
  const url = new URL(opened[0]);
  fake.challenge = url.searchParams.get('code_challenge');
  const flowId = new URL(url.searchParams.get('redirect_to')).searchParams.get('sb_flow_id');
  app.emit('second-instance', {}, [process.execPath, `belific://auth-callback?${flowId ? `sb_flow_id=${flowId}&` : ''}code=GOODCODE`], '');
  await C.waitFor(() => I.exists(I.byLabel('Profile and account')), 20000);
  await C.waitFor(() => (fake.store.tables.tasks || []).some((r) => r.id === 'b1'), 20000).catch(() => {});
  await openSettings();
  check('signed in with no link yet: it says so and offers Create', (await text('Calendar feed')).includes('No feed link yet') && (await I.exists(I.byLabel('Create feed link'))), await text('Calendar feed'));
  check('subscriptions are never uploaded (no imported event or link on the server)', !JSON.stringify(fake.store.tables).includes('Team sync') && !JSON.stringify(fake.store.tables).includes('S3CRET'));
  await I.click(I.byLabel('Create feed link'));
  await C.waitFor(() => tokenRow() && serverToken(), 15000).catch(() => {});
  const t1 = tokenRow() && tokenRow().value;
  check('Create writes one user_settings row with a 43 character token', /^[A-Za-z0-9_-]{43}$/.test(t1 || ''), String(t1));
  check('the token reached the (fake) server', serverToken() && serverToken().value === t1);
  await C.waitFor(async () => (await text('Feed status')).includes('Active'), 8000).catch(() => {});
  const link = await I.js(`(${I.byLabel('Feed link')} || {}).value || ''`);
  check('the link is the function URL with the token', link === `https://vlogfwnmaqorhialcqbr.supabase.co/functions/v1/belific-calendar-feed?t=${t1}`, link);
  check('once synced it says Active', (await text('Feed status')).includes('Active'), await text('Feed status'));
  await clipboard.writeText('');
  await I.click(I.byLabel('Copy link'));
  const copied = await clipboard.readText();
  check('Copy link puts the link on the clipboard', copied === link && (await text('Feed note')).includes('Link copied'), copied);
  await I.shot('p8-06-feed');
  await I.click(I.byLabel('Make a new link'));
  check('Make a new link asks first and says the old link stops working', (await I.body()).includes('The old link stops working'));
  await I.click(I.byLabel('Confirm make a new link'));
  await C.waitFor(() => tokenRow() && tokenRow().value !== t1 && serverToken().value === tokenRow().value, 15000).catch(() => {});
  const t2 = tokenRow() && tokenRow().value;
  check('a new token replaces the old one, here and on the server', t2 && t2 !== t1 && serverToken().value === t2 && /^[A-Za-z0-9_-]{43}$/.test(t2));
  check('the shown link changed to the new token', (await I.js(`(${I.byLabel('Feed link')} || {}).value || ''`)).endsWith(`t=${t2}`));
  await I.click(I.byLabel('Turn off feed'));
  await I.click(I.byLabel('Confirm turn off feed'));
  await C.waitFor(() => tokenRow() && tokenRow().deletedAt && serverToken().deleted_at, 15000).catch(() => {});
  check('Turn off tombstones the row here and on the server (the link stops working)', !!(tokenRow() && tokenRow().deletedAt) && !!serverToken().deleted_at);
  check('after turning off, no link is shown', !(await I.exists(I.byLabel('Feed link'))) && (await text('Calendar feed')).includes('No feed link yet'));

  // ======== 8. Network ========
  check('the page itself contacted only the fake Supabase host', fake.unexpected.length === 0, JSON.stringify([...new Set(fake.hosts)]));

  const failed = summary();
  app.exit(failed === 0 ? 0 : 1);
}
