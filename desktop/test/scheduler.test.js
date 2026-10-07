'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Scheduler, plan, fixedZone, localZone, WINDOW_MS } = require('../src/scheduler');
const { DEFAULTS, sanitize, loadSettings, saveSettings, loginItemOptions } = require('../src/settings');

const H = 3600000;
const M = 60000;
const S = { ...DEFAULTS };

// A manual clock and timer queue.
function rig(opts = {}) {
  let now = opts.now ?? Date.UTC(2026, 9, 6, 8, 0, 0);
  const timers = new Map();
  let nextId = 1;
  const shown = [];
  const zone = opts.zone ?? fixedZone(0);
  const sched = new Scheduler({
    settings: opts.settings ?? S,
    zone,
    now: () => now,
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { fn, at: now + ms });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    notify: (n) => shown.push(n),
  });
  return {
    sched,
    shown,
    timers,
    get now() {
      return now;
    },
    advance(ms) {
      const target = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at;
        timers.delete(due[0]);
        due[1].fn();
      }
      now = target;
    },
    sleepThrough(ms) {
      now += ms; // the clock moves, timers do not run
    },
  };
}

const ev = (id, start, extra = {}) => ({ id, title: `Event ${id}`, icon: '📅', start, ...extra });

test('48 hour window: inside is scheduled, past and beyond are not', () => {
  const r = rig();
  const t0 = r.now;
  r.sched.update({
    events: [ev('in', t0 + 47 * H), ev('edge', t0 + WINDOW_MS), ev('beyond', t0 + WINDOW_MS + M), ev('past', t0 - M), ev('now', t0)],
  });
  assert.deepEqual(r.sched.pending().map((p) => p.key), ['event:in', 'event:edge']);
});

test('an event fires once at its start with the title and "Starting now"', () => {
  const r = rig();
  r.sched.update({ events: [ev('a', r.now + 10 * M)] });
  r.advance(9 * M);
  assert.equal(r.shown.length, 0);
  r.advance(2 * M);
  assert.deepEqual(r.shown, [{ kind: 'event', key: 'event:a', title: 'Event a', body: '📅 Starting now' }]);
});

test('de-duplicates: re-sending the same payload keeps one timer and never repeats a toast', () => {
  const r = rig();
  const payload = { events: [ev('a', r.now + 10 * M)], placed: [] };
  r.sched.update(payload);
  r.sched.update(payload);
  r.sched.update(JSON.parse(JSON.stringify(payload)));
  assert.equal(r.timers.size, 1);
  r.advance(11 * M);
  assert.equal(r.shown.length, 1);
  r.sched.update(payload); // after firing, the same item (now in the past) is not re-sent or re-fired
  r.advance(1 * H);
  assert.equal(r.shown.length, 1);
});

test('change: moving an event cancels the old timer and fires at the new time only', () => {
  const r = rig();
  r.sched.update({ events: [ev('a', r.now + 10 * M)] });
  r.sched.update({ events: [ev('a', r.now + 30 * M)] });
  assert.equal(r.timers.size, 1);
  r.advance(15 * M);
  assert.equal(r.shown.length, 0);
  r.advance(16 * M);
  assert.equal(r.shown.length, 1);
});

test('cancel: removing an item, or turning a toggle off, cancels its timer', () => {
  const r = rig();
  r.sched.update({ events: [ev('a', r.now + 10 * M)], placed: [{ id: 'p', title: 'Task', start: r.now + 20 * M }] });
  assert.equal(r.timers.size, 2);
  r.sched.update({ events: [], placed: [{ id: 'p', title: 'Task', start: r.now + 20 * M }] });
  assert.equal(r.timers.size, 1);
  r.sched.setSettings({ ...S, notifyTasks: false });
  assert.equal(r.timers.size, 0);
  r.advance(1 * H);
  assert.equal(r.shown.length, 0);
});

test('placed tasks notify at startTime; completed ones are excluded', () => {
  const r = rig();
  r.sched.update({
    placed: [
      { id: 'open', title: 'Write report', start: r.now + 5 * M, completed: false },
      { id: 'done', title: 'Done thing', start: r.now + 6 * M, completed: true },
    ],
  });
  r.advance(10 * M);
  assert.deepEqual(r.shown.map((n) => n.title), ['Write report']);
  assert.equal(r.shown[0].body, 'Starting now');
});

test('a task completed after being scheduled is cancelled by the next update', () => {
  const r = rig();
  r.sched.update({ placed: [{ id: 'x', title: 'X', start: r.now + 5 * M, completed: false }] });
  r.sched.update({ placed: [{ id: 'x', title: 'X', start: r.now + 5 * M, completed: true }] });
  r.advance(10 * M);
  assert.equal(r.shown.length, 0);
});

test('malformed items are ignored, not thrown on', () => {
  const r = rig();
  r.sched.update({ events: [null, {}, { id: 1 }, { id: 'a', title: 'T', start: 'soon' }, ev('ok', r.now + M)], placed: 'nope', planned: 5 });
  assert.equal(r.sched.pending().length, 1);
  r.sched.update(undefined);
  assert.equal(r.sched.pending().length, 0);
});

test('a late timer (computer asleep) is dropped, not shown stale; refresh fires an on-time one', () => {
  const r = rig();
  r.sched.update({ events: [ev('late', r.now + 10 * M), ev('ok', r.now + 20 * M)] });
  r.sleepThrough(10 * M + 2 * M); // woke 2 minutes after 'late' was due
  r.sched.refresh();
  assert.deepEqual(r.shown.map((n) => n.title), ['Event late']);
  r.sleepThrough(1 * H); // woke a long time after 'ok'
  r.sched.refresh();
  assert.equal(r.shown.length, 1, 'the one an hour late is skipped');
});

// ----- daily reminder (decision 020) -----

const day = (offset, now) => fixedZone(0).addDays(now, offset);

test('daily reminder groups planned, unplaced, incomplete tasks into one notification', () => {
  const r = rig(); // 2026-10-06 08:00 UTC, reminder 09:00
  const today = day(0, r.now);
  r.sched.update({
    planned: [
      { dueDate: today },
      { dueDate: today },
      { dueDate: today },
      { dueDate: today, completed: true },
      { dueDate: today, startTime: '14:00' },
      { dueDate: day(1, r.now) },
    ],
  });
  const daily = r.sched.pending().filter((p) => p.kind === 'daily');
  assert.equal(daily.length, 2, 'today and tomorrow are both inside 48 hours');
  r.advance(1 * H + M);
  assert.deepEqual(r.shown, [{ kind: 'daily', key: `daily:${today}`, title: 'Belific', body: '3 tasks planned for today' }]);
});

test('daily reminder wording for one task, and nothing for zero', () => {
  const r = rig();
  const today = day(0, r.now);
  r.sched.update({ planned: [{ dueDate: today }] });
  r.advance(2 * H);
  assert.equal(r.shown[0].body, '1 task planned for today');
  const r2 = rig();
  r2.sched.update({ planned: [{ dueDate: day(0, r2.now), completed: true }, { dueDate: day(0, r2.now), startTime: '10:00' }] });
  assert.equal(r2.timers.size, 0);
  r2.advance(3 * H);
  assert.equal(r2.shown.length, 0);
});

test('daily reminder: off toggle and a different time', () => {
  const r = rig({ settings: { ...S, dailyReminder: false } });
  r.sched.update({ planned: [{ dueDate: day(0, r.now) }] });
  assert.equal(r.timers.size, 0);
  const r2 = rig({ settings: { ...S, dailyTime: '08:30' } });
  r2.sched.update({ planned: [{ dueDate: day(0, r2.now) }] });
  r2.advance(31 * M);
  assert.equal(r2.shown.length, 1);
});

test('daily reminder: today\'s time already passed means the next one is tomorrow, with tomorrow\'s count', () => {
  const r = rig({ now: Date.UTC(2026, 9, 6, 9, 30, 0) });
  r.sched.update({ planned: [{ dueDate: day(0, r.now) }, { dueDate: day(1, r.now) }, { dueDate: day(1, r.now) }] });
  assert.deepEqual(r.sched.pending().map((p) => p.body), ['2 tasks planned for today']);
  assert.equal(r.sched.pending()[0].key, `daily:${day(1, r.now)}`);
});

test('daily reminder: adding a task before it fires updates the count, same notification', () => {
  const r = rig();
  const today = day(0, r.now);
  r.sched.update({ planned: [{ dueDate: today }] });
  r.sched.update({ planned: [{ dueDate: today }, { dueDate: today }] });
  assert.equal(r.timers.size, 1);
  r.advance(2 * H);
  assert.deepEqual(r.shown.map((n) => n.body), ['2 tasks planned for today']);
});

test('day boundary: month end, and a late reminder time', () => {
  // 2026-10-31 23:00 UTC, reminder at 23:30: fires today; the next is 11-01.
  const now = Date.UTC(2026, 9, 31, 23, 0, 0);
  const r = rig({ now, settings: { ...S, dailyTime: '23:30' } });
  r.sched.update({ planned: [{ dueDate: '2026-10-31' }, { dueDate: '2026-11-01' }, { dueDate: '2026-11-01' }] });
  assert.deepEqual(r.sched.pending().map((p) => [p.key, p.body]), [
    ['daily:2026-10-31', '1 task planned for today'],
    ['daily:2026-11-01', '2 tasks planned for today'],
  ]);
});

test('time zones: the same instant is a different day in Auckland and in Los Angeles', () => {
  const now = Date.UTC(2026, 9, 6, 20, 0, 0); // 06 Oct 20:00 UTC
  // Auckland (UTC+13): it is 07 Oct 09:00 already. The reminder time (09:00) is now.
  const nz = rig({ now, zone: fixedZone(13 * 60) });
  nz.sched.update({ planned: [{ dueDate: '2026-10-07' }, { dueDate: '2026-10-08' }] });
  const nzDaily = nz.sched.pending();
  assert.equal(nzDaily[0].key, 'daily:2026-10-08', 'today 09:00 is not after now, so the next is 08 Oct');
  // Los Angeles (UTC-8): it is 06 Oct 12:00; today's 09:00 has passed, so tomorrow.
  const la = rig({ now, zone: fixedZone(-8 * 60) });
  la.sched.update({ planned: [{ dueDate: '2026-10-06' }, { dueDate: '2026-10-07' }] });
  assert.equal(la.sched.pending()[0].key, 'daily:2026-10-07');
  // 09:00 in LA on 07 Oct is 17:00 UTC.
  assert.equal(la.sched.pending()[0].at, Date.UTC(2026, 9, 7, 17, 0, 0));
});

test('local zone helpers agree with the machine clock', () => {
  const ms = new Date(2026, 9, 6, 15, 45).getTime();
  assert.equal(localZone.dateKey(ms), '2026-10-06');
  assert.equal(localZone.at('2026-10-06', '15:45'), ms);
  assert.equal(localZone.addDays(ms, 26), '2026-11-01');
});

test('plan is pure: it never mutates its inputs', () => {
  const payload = { events: [ev('a', Date.UTC(2026, 9, 6, 9, 0))] };
  const copy = JSON.stringify(payload);
  plan({ payload, settings: S, now: Date.UTC(2026, 9, 6, 8, 0), zone: fixedZone(0) });
  assert.equal(JSON.stringify(payload), copy);
});

// ----- settings -----

test('settings: defaults, validation and persistence', async () => {
  assert.deepEqual({ ...DEFAULTS }, { notifyEvents: true, notifyTasks: true, dailyReminder: true, dailyTime: '09:00', dayStart: '05:00', closeToTray: true, startWithWindows: false, trayNoteShown: false });
  const s = sanitize({ dailyTime: '25:00', closeToTray: 'yes', startWithWindows: true, evil: 1, dailyReminder: false });
  assert.equal(s.dailyTime, '09:00');
  assert.equal(s.closeToTray, true);
  assert.equal(s.startWithWindows, true);
  assert.equal(s.dailyReminder, false);
  assert.equal('evil' in s, false);
  const mem = new Map();
  const kv = { getItem: async (k) => mem.get(k) ?? null, setItem: async (k, v) => void mem.set(k, v) };
  await saveSettings(kv, sanitize({ dailyTime: '07:15', notifyEvents: false }));
  const loaded = await loadSettings(kv);
  assert.equal(loaded.dailyTime, '07:15');
  assert.equal(loaded.notifyEvents, false);
  mem.set('belific_desktop_settings', '{not json');
  assert.deepEqual(await loadSettings(kv), { ...DEFAULTS });
});

test('login item options: off by default, hidden start when on', () => {
  assert.deepEqual(loginItemOptions(false, 'C:/x/Belific.exe'), { openAtLogin: false, path: 'C:/x/Belific.exe', args: [] });
  assert.deepEqual(loginItemOptions(true, 'C:/x/Belific.exe'), { openAtLogin: true, path: 'C:/x/Belific.exe', args: ['--hidden'] });
});

test('8.2 per task reminder: default fires at the start time, a lead fires that many minutes earlier', () => {
  const r = rig();
  r.sched.update({
    placed: [
      { id: 'def', title: 'Default', start: r.now + 30 * M, completed: false },
      { id: 'ten', title: 'Ten before', start: r.now + 30 * M, completed: false, reminderMinutes: 10 },
      { id: 'zero', title: 'At start', start: r.now + 30 * M, completed: false, reminderMinutes: 0 },
      { id: 'hour', title: 'Hour before', start: r.now + 90 * M, completed: false, reminderMinutes: 60 },
    ],
  });
  const at = (title) => r.sched.pending().find((p) => p.title === title).at;
  assert.equal(at('Default'), r.now + 30 * M);
  assert.equal(at('Ten before'), r.now + 20 * M);
  assert.equal(at('At start'), r.now + 30 * M);
  assert.equal(at('Hour before'), r.now + 30 * M);
  r.advance(31 * M);
  const byTitle = Object.fromEntries(r.shown.map((n) => [n.title, n.body]));
  assert.equal(byTitle['Ten before'], 'Starts in 10 minutes');
  assert.equal(byTitle['Hour before'], 'Starts in 1 hour');
  assert.equal(byTitle.Default, 'Starting now');
});

test('8.2 per task reminder: off (-1) schedules nothing for the task and drops an existing timer', () => {
  const r = rig();
  const item = (extra) => ({ placed: [{ id: 'p', title: 'Pinned', start: r.now + 30 * M, completed: false, ...extra }] });
  r.sched.update(item({}));
  assert.equal(r.sched.pending().length, 1);
  r.sched.update(item({ reminderMinutes: -1 }));
  assert.equal(r.sched.pending().length, 0, 'switching it off cancels the timer');
  r.sched.update(item({ reminderMinutes: 5 }));
  assert.equal(r.sched.pending()[0].at, r.now + 25 * M, 'changing the lead moves the timer');
  r.advance(40 * M);
  assert.equal(r.shown.length, 1, 'fired once only');
});

test('8.2 per task reminder: a lead already in the past is skipped, junk values mean the default', () => {
  const r = rig();
  r.sched.update({
    placed: [
      { id: 'late', title: 'Too late', start: r.now + 5 * M, completed: false, reminderMinutes: 10 },
      { id: 'junk', title: 'Junk', start: r.now + 15 * M, completed: false, reminderMinutes: 'soon' },
      { id: 'neg', title: 'Neg', start: r.now + 16 * M, completed: false, reminderMinutes: -7 },
    ],
  });
  assert.deepEqual(r.sched.pending().map((p) => p.title), ['Junk', 'Neg']);
  assert.equal(r.sched.pending()[0].at, r.now + 15 * M);
});

test('8.2 daily reminder skips planned tasks set to off and tasks without a time ignore leads', () => {
  const r = rig();
  const today = day(0, r.now);
  r.sched.update({
    planned: [{ dueDate: today }, { dueDate: today, reminderMinutes: -1 }, { dueDate: today, reminderMinutes: 10 }],
  });
  r.advance(1 * H + M);
  assert.equal(r.shown[0].body, '2 tasks planned for today');
  const r2 = rig();
  r2.sched.update({ planned: [{ dueDate: day(0, r2.now), reminderMinutes: -1 }] });
  assert.equal(r2.sched.pending().filter((p) => p.kind === 'daily').length, 0);
});

test('8.2 the 48 hour window applies to the notification time', () => {
  const r = rig();
  r.sched.update({ placed: [{ id: 'far', title: 'Far', start: r.now + WINDOW_MS + 30 * M, completed: false, reminderMinutes: 60 }] });
  assert.equal(r.sched.pending().length, 1, 'start is outside, but 1 hour before is inside');
  r.sched.update({ placed: [{ id: 'far', title: 'Far', start: r.now + WINDOW_MS + 90 * M, completed: false, reminderMinutes: 5 }] });
  assert.equal(r.sched.pending().length, 0);
});
