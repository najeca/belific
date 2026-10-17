// The outbound calendar feed's document (build plan phase 8, step 2).
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { buildIcs, escapeIcsText, feedEvents, feedTitle, foldIcsLine, FEED_DAYS_AHEAD, FEED_DAYS_BACK } from './icsFeed.ts';
import { parseIcs, expandCalendar } from './icsParse.ts';
import type { Task } from './types.ts';

const stamp = '2026-10-01T08:00:00.000Z';
const T = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, completed: false, createdAt: stamp, updatedAt: stamp, ...extra });
const TODAY = '2026-10-17';

test('only tasks with a Day and a valid start time are in the feed; all day tasks and Brain Dump are not', () => {
  const events = feedEvents(
    [
      T('timed', { dueDate: TODAY, startTime: '09:00', durationMinutes: 45 }),
      T('allday', { dueDate: TODAY }),
      T('dump'),
      T('timeonly', { startTime: '10:00' }),
      T('badtime', { dueDate: TODAY, startTime: '25:00' }),
      T('gone', { dueDate: TODAY, startTime: '11:00', deletedAt: stamp }),
    ],
    TODAY,
  );
  assert.deepEqual(events.map((e) => e.uid), ['timed@belific']);
  assert.equal(events[0].start, '20261017T090000');
  assert.equal(events[0].end, '20261017T094500');
});

test('the window is 30 days back to 365 days ahead, both ends included', () => {
  const events = feedEvents(
    [
      T('back30', { dueDate: '2026-09-17', startTime: '08:00' }),
      T('back31', { dueDate: '2026-09-16', startTime: '08:00' }),
      T('ahead365', { dueDate: '2027-10-17', startTime: '08:00' }),
      T('ahead366', { dueDate: '2027-10-18', startTime: '08:00' }),
    ],
    TODAY,
  );
  assert.equal(FEED_DAYS_BACK, 30);
  assert.equal(FEED_DAYS_AHEAD, 365);
  assert.deepEqual(events.map((e) => e.uid).sort(), ['ahead365@belific', 'back30@belific']);
});

test('the title: emoji in front, a tick in front when done, nothing else', () => {
  assert.equal(feedTitle({ title: 'Run', emoji: '🏃', completed: false }), '🏃 Run');
  assert.equal(feedTitle({ title: 'Run', emoji: '🏃', completed: true }), '✓ 🏃 Run');
  assert.equal(feedTitle({ title: '  ', completed: false }), 'Task');
  const [e] = feedEvents([T('n', { title: 'Plan', dueDate: TODAY, startTime: '09:00', notes: 'SECRET NOTE', projectKey: 'work', priority: 'high', subtasks: [{ id: 's', title: 'SECRET STEP', done: false }], actualMinutes: 40 })], TODAY);
  const ics = buildIcs([e], new Date(stamp));
  assert.doesNotMatch(ics, /SECRET|work|high|DESCRIPTION|LOCATION|CATEGORIES/);
});

test('no estimate means 30 minutes; a task past midnight ends the next day; floating times only', () => {
  const events = feedEvents(
    [T('a', { dueDate: TODAY, startTime: '10:00' }), T('night', { dueDate: TODAY, startTime: '23:30', durationMinutes: 120 })],
    TODAY,
  );
  const byUid = Object.fromEntries(events.map((e) => [e.uid, e]));
  assert.equal(byUid['a@belific'].end, '20261017T103000');
  assert.equal(byUid['night@belific'].start, '20261017T233000');
  assert.equal(byUid['night@belific'].end, '20261018T013000');
  const ics = buildIcs(events, new Date(stamp));
  assert.match(ics, /DTSTART:20261017T100000\r\n/);
  assert.doesNotMatch(ics, /DTSTART[^\r]*Z\r\n|TZID/);
});

test('a clock change day keeps the wall clock: 01:30 for 60 minutes on 25 Oct is 01:30 to 02:30', () => {
  const [e] = feedEvents([T('dst', { dueDate: '2026-10-25', startTime: '01:30', durationMinutes: 60 })], TODAY);
  assert.equal(e.start, '20261025T013000');
  assert.equal(e.end, '20261025T023000');
});

test('repeating series: projected days from today, skipped days left out, done days ticked, emoji from the series', () => {
  const rows = [
    T('r', { title: 'Stretch', emoji: '🧘', dueDate: '2026-10-10', startTime: '07:00', recurrence: 'daily' }),
    // a done day in the past (stored), today skipped (tombstone), tomorrow done ahead
    T('r:2026-10-15', { title: 'Stretch', dueDate: '2026-10-15', startTime: '07:00', recurrence: 'daily', completed: true }),
    T('r:2026-10-17', { title: 'Stretch', dueDate: '2026-10-17', startTime: '07:00', recurrence: 'daily', deletedAt: stamp }),
  ];
  const events = feedEvents(rows, TODAY);
  const uids = events.map((e) => e.uid);
  assert.ok(uids.includes('r:2026-10-15@belific'));
  assert.ok(!uids.includes('r:2026-10-17@belific'), 'skipped day');
  assert.ok(uids.includes('r:2026-10-18@belific'), 'projected tomorrow');
  assert.ok(!uids.includes('r:2026-10-16@belific'), 'never a projected day in the past');
  assert.equal(events.find((e) => e.uid === 'r:2026-10-15@belific')!.title, '✓ 🧘 Stretch');
  assert.equal(events.find((e) => e.uid === 'r:2026-10-18@belific')!.title, '🧘 Stretch');
  // Projected up to a year ahead.
  assert.ok(uids.includes('r:2027-10-17@belific'));
  assert.ok(!uids.includes('r:2027-10-18@belific'));
  assert.equal(new Set(uids).size, uids.length);
});

test('a user with no tasks gets a valid empty calendar', () => {
  const ics = buildIcs(feedEvents([], TODAY), new Date(stamp));
  assert.equal(ics, ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Belific//Calendar feed//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Belific tasks', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H', 'END:VCALENDAR', ''].join('\r\n'));
});

test('text is escaped and long lines fold at 75 octets without splitting a character', () => {
  assert.equal(escapeIcsText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
  const long = 'SUMMARY:' + '🧘'.repeat(40);
  const folded = foldIcsLine(long);
  for (const line of folded.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75, line);
  assert.equal(folded.replace(/\r\n /g, ''), long);
  assert.ok(!folded.includes('�'));
});

test('round trip: what the feed writes, the importer reads back (titles with commas and emoji, times)', () => {
  const events = feedEvents([T('x', { title: 'Call Ann, then Bob; ok', emoji: '📞', dueDate: TODAY, startTime: '14:15', durationMinutes: 50 })], TODAY);
  const cal = parseIcs(buildIcs(events, new Date(stamp)));
  assert.equal(cal.name, 'Belific tasks');
  assert.equal(cal.events.length, 1);
  assert.equal(cal.events[0].title, '📞 Call Ann, then Bob; ok');
  const [o] = expandCalendar(cal, new Date(2026, 9, 17).getTime(), new Date(2026, 9, 18).getTime());
  assert.equal(new Date(o.startMs).getHours(), 14);
  assert.equal(o.endMs - o.startMs, 50 * 60000);
});

test('the same feed in five time zones (the function runs in UTC; the result never depends on the zone)', () => {
  const rows = [T('r', { emoji: '🧘', dueDate: '2026-10-10', startTime: '07:00', recurrence: 'weekly', recurrenceDays: ['Sat', 'Sun'] }), T('n', { dueDate: '2026-10-25', startTime: '23:30', durationMinutes: 90 })];
  const here = buildIcs(feedEvents(rows, TODAY), new Date(stamp));
  const url = pathToFileURL(path.join(import.meta.dirname, 'icsFeed.ts')).href;
  for (const tz of ['UTC', 'Europe/London', 'America/New_York', 'Pacific/Auckland', 'Asia/Kolkata']) {
    const code = `const f = await import(${JSON.stringify(url)}); process.stdout.write(f.buildIcs(f.feedEvents(${JSON.stringify(rows)}, ${JSON.stringify(TODAY)}), new Date(${JSON.stringify(stamp)})));`;
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, TZ: tz }, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, here, tz);
  }
});
