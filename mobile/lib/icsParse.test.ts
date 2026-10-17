// Reading ICS subscriptions (build plan phase 8, step 3): parsing, repeats,
// time zones and daylight saving, all day events. Display on a day (all day row
// or grid, past midnight) is in externalEvents.test.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { expandCalendar, ianaZone, parseDuration, parseIcs, parseIcsTime, parseLine, parseRule, toEpoch, unfold, type IcsCalendar } from './icsParse.ts';

const cal = (...events: string[]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'X-WR-CALNAME:Work', ...events, 'END:VCALENDAR'].join('\r\n');
const ev = (...lines: string[]) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n');
const U = (y: number, m: number, d: number, h = 0, mi = 0) => Date.UTC(y, m - 1, d, h, mi);
const YEAR = [U(2026, 1, 1), U(2028, 1, 1)] as const;
const starts = (c: IcsCalendar, from = YEAR[0], to = YEAR[1]) => expandCalendar(c, from, to).map((o) => o.startMs);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 16);

test('lines: unfolding, quoted parameters, escaped text, case of names', () => {
  assert.deepEqual(unfold('SUMMARY:Long\r\n  line\r\n\tend'), ['SUMMARY:Long line' + 'end']);
  const p = parseLine('dtstart;TZID="America/New_York";X-A="a;b:c":20261017T090000')!;
  assert.equal(p.name, 'DTSTART');
  assert.equal(p.params.TZID, 'America/New_York');
  assert.equal(p.params['X-A'], 'a;b:c');
  assert.equal(p.value, '20261017T090000');
  const c = parseIcs(cal(ev('UID:1', 'SUMMARY:Lunch\\, with Ann\\; and Bob\\nRoom 2', 'DTSTART:20261017T120000Z')));
  assert.equal(c.events[0].title, 'Lunch, with Ann; and Bob\nRoom 2');
  assert.equal(c.name, 'Work');
});

test('values: date, UTC, zoned and floating times; durations; bad values are skipped', () => {
  assert.deepEqual(parseIcsTime('20261017'), { kind: 'date', y: 2026, m: 10, d: 17 });
  assert.equal((parseIcsTime('20261017T090000Z') as { zone: string }).zone, 'UTC');
  assert.equal((parseIcsTime('20261017T090000', { TZID: 'Europe/London' }) as { zone: string }).zone, 'Europe/London');
  assert.equal((parseIcsTime('20261017T090000') as { zone: string }).zone, 'floating');
  assert.equal(parseIcsTime('20260230'), null);
  assert.equal(parseIcsTime('2026-10-17'), null);
  assert.equal(parseDuration('PT1H30M'), 5400);
  assert.equal(parseDuration('P1W'), 604800);
  assert.equal(parseDuration('P1DT2H'), 93600);
  assert.equal(parseDuration('-PT15M'), -900);
  assert.equal(parseDuration('P'), null);
  const c = parseIcs(cal(ev('UID:bad', 'DTSTART:yesterday'), ev('UID:ok', 'DTSTART:20261017T090000Z'), 'garbage line without colon'));
  assert.deepEqual(c.events.map((e) => e.uid), ['ok']);
});

test('zones: IANA, quoted, Mozilla style path, Windows names, unknown', () => {
  assert.equal(ianaZone('Europe/London'), 'Europe/London');
  assert.equal(ianaZone('"Europe/London"'), 'Europe/London');
  assert.equal(ianaZone('/mozilla.org/20050126_1/America/New_York'), 'America/New_York');
  assert.equal(ianaZone('GMT Standard Time'), 'Europe/London');
  assert.equal(ianaZone('Pacific Standard Time'), 'America/Los_Angeles');
  assert.equal(ianaZone('Not A Zone'), null);
  const t = (s: string, tz: string) => toEpoch(parseIcsTime(s, { TZID: tz })!, { zones: {} });
  assert.equal(t('20260715T090000', 'Europe/London'), U(2026, 7, 15, 8), 'BST is UTC+1');
  assert.equal(t('20260115T090000', 'Europe/London'), U(2026, 1, 15, 9));
  assert.equal(t('20260715T090000', 'GMT Standard Time'), U(2026, 7, 15, 8));
  assert.equal(t('20260715T090000', 'America/New_York'), U(2026, 7, 15, 13));
  assert.equal(t('20260715T090000', 'Asia/Kolkata'), U(2026, 7, 15, 3, 30));
});

test('a VTIMEZONE the runtime does not know is computed from its own rules', () => {
  const zone = [
    'BEGIN:VTIMEZONE',
    'TZID:(UTC+00:00) Dublin\\, Edinburgh\\, Lisbon\\, London',
    'BEGIN:STANDARD',
    'DTSTART:16010101T020000',
    'TZOFFSETFROM:+0100',
    'TZOFFSETTO:+0000',
    'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10',
    'END:STANDARD',
    'BEGIN:DAYLIGHT',
    'DTSTART:16010101T010000',
    'TZOFFSETFROM:+0000',
    'TZOFFSETTO:+0100',
    'RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3',
    'END:DAYLIGHT',
    'END:VTIMEZONE',
  ].join('\r\n');
  const c = parseIcs(
    cal(zone, ev('UID:w', 'SUMMARY:Standup', 'DTSTART;TZID="(UTC+00:00) Dublin\\, Edinburgh\\, Lisbon\\, London":20261019T090000', 'DURATION:PT15M', 'RRULE:FREQ=WEEKLY;COUNT=3')),
  );
  assert.equal(Object.keys(c.zones).length, 1);
  // 19 Oct is BST (08:00 UTC); 26 Oct and 2 Nov are GMT (09:00 UTC): 09:00 local every week.
  assert.deepEqual(starts(c).map(iso), ['2026-10-19T08:00', '2026-10-26T09:00', '2026-11-02T09:00']);
});

test('daylight saving: a weekly 09:00 New York meeting stays 09:00 New York across 1 Nov, an hour later in UTC', () => {
  const c = parseIcs(cal(ev('UID:ny', 'DTSTART;TZID=America/New_York:20261026T090000', 'DTEND;TZID=America/New_York:20261026T100000', 'RRULE:FREQ=WEEKLY;COUNT=3')));
  const occ = expandCalendar(c, ...YEAR);
  assert.deepEqual(occ.map((o) => iso(o.startMs)), ['2026-10-26T13:00', '2026-11-02T14:00', '2026-11-09T14:00']);
  for (const o of occ) assert.equal(o.endMs - o.startMs, 3600000);
});

test('UTC events stay at the same instant across a clock change (they move on the local clock instead)', () => {
  const c = parseIcs(cal(ev('UID:u', 'DTSTART:20261023T080000Z', 'RRULE:FREQ=DAILY;COUNT=4')));
  assert.deepEqual(starts(c).map(iso), ['2026-10-23T08:00', '2026-10-24T08:00', '2026-10-25T08:00', '2026-10-26T08:00']);
});

test('repeats: daily with interval, weekly on several days every 2 weeks, COUNT and UNTIL', () => {
  const d = parseIcs(cal(ev('UID:d', 'DTSTART:20261001T100000Z', 'RRULE:FREQ=DAILY;INTERVAL=3;COUNT=4')));
  assert.deepEqual(starts(d).map(iso), ['2026-10-01T10:00', '2026-10-04T10:00', '2026-10-07T10:00', '2026-10-10T10:00']);
  // Thu 1 Oct 2026; every 2 weeks on Tue and Thu (week starts Monday).
  const w = parseIcs(cal(ev('UID:w', 'DTSTART:20261001T100000Z', 'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;UNTIL=20261031T235959Z')));
  assert.deepEqual(starts(w).map(iso), ['2026-10-01T10:00', '2026-10-13T10:00', '2026-10-15T10:00', '2026-10-27T10:00', '2026-10-29T10:00']);
  // UNTIL as a date is inclusive of that day.
  const u = parseIcs(cal(ev('UID:u', 'DTSTART;VALUE=DATE:20261001', 'RRULE:FREQ=DAILY;UNTIL=20261003')));
  assert.equal(starts(u).length, 3);
});

test('repeats: monthly on the last Friday, on day -1, on the 31st (months without one are skipped), BYSETPOS last weekday', () => {
  const lastFri = parseIcs(cal(ev('UID:lf', 'DTSTART:20261030T150000Z', 'RRULE:FREQ=MONTHLY;BYDAY=-1FR;COUNT=4')));
  assert.deepEqual(starts(lastFri).map(iso), ['2026-10-30T15:00', '2026-11-27T15:00', '2026-12-25T15:00', '2027-01-29T15:00']);
  const lastDay = parseIcs(cal(ev('UID:ld', 'DTSTART:20260131T120000Z', 'RRULE:FREQ=MONTHLY;BYMONTHDAY=-1;COUNT=3')));
  assert.deepEqual(starts(lastDay).map(iso), ['2026-01-31T12:00', '2026-02-28T12:00', '2026-03-31T12:00']);
  const the31st = parseIcs(cal(ev('UID:31', 'DTSTART:20260131T120000Z', 'RRULE:FREQ=MONTHLY;COUNT=3')));
  assert.deepEqual(starts(the31st).map(iso), ['2026-01-31T12:00', '2026-03-31T12:00', '2026-05-31T12:00']);
  const lastWeekday = parseIcs(cal(ev('UID:lw', 'DTSTART:20261030T090000Z', 'RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;COUNT=3')));
  assert.deepEqual(starts(lastWeekday).map(iso), ['2026-10-30T09:00', '2026-11-30T09:00', '2026-12-31T09:00']);
});

test('repeats: yearly birthdays as all day events, Feb 29 only in leap years, the 2nd Sunday of May', () => {
  const b = parseIcs(cal(ev('UID:b', 'SUMMARY:Ann', 'DTSTART;VALUE=DATE:20200229', 'DTEND;VALUE=DATE:20200301', 'RRULE:FREQ=YEARLY')));
  const occ = expandCalendar(b, U(2026, 1, 1), U(2033, 1, 1));
  assert.deepEqual(occ.map((o) => o.startKey), ['2028-02-29', '2032-02-29']);
  const mothers = parseIcs(cal(ev('UID:m', 'DTSTART;VALUE=DATE:20260510', 'RRULE:FREQ=YEARLY;BYMONTH=5;BYDAY=2SU')));
  assert.deepEqual(expandCalendar(mothers, ...YEAR).map((o) => o.startKey), ['2026-05-10', '2027-05-09']);
});

test('EXDATE (as a time and as a date), RDATE, RECURRENCE-ID moving one day and cancelling another', () => {
  const c = parseIcs(
    cal(
      ev('UID:s', 'SUMMARY:Gym', 'DTSTART;TZID=Europe/London:20261019T070000', 'DURATION:PT1H', 'RRULE:FREQ=DAILY;COUNT=6', 'EXDATE;TZID=Europe/London:20261020T070000', 'EXDATE;VALUE=DATE:20261021', 'RDATE;TZID=Europe/London:20261101T100000'),
      ev('UID:s', 'SUMMARY:Gym (late)', 'RECURRENCE-ID;TZID=Europe/London:20261022T070000', 'DTSTART;TZID=Europe/London:20261022T180000', 'DTEND;TZID=Europe/London:20261022T190000'),
      ev('UID:s', 'RECURRENCE-ID;TZID=Europe/London:20261023T070000', 'DTSTART;TZID=Europe/London:20261023T070000', 'STATUS:CANCELLED'),
    ),
  );
  const occ = expandCalendar(c, ...YEAR);
  assert.deepEqual(
    occ.map((o) => `${iso(o.startMs)} ${o.title}`),
    ['2026-10-19T06:00 Gym', '2026-10-22T17:00 Gym (late)', '2026-10-24T06:00 Gym', '2026-11-01T10:00 Gym'],
  );
  assert.equal(new Set(occ.map((o) => o.id)).size, occ.length, 'ids are unique');
});

test('cancelled events and events with no UID; a rule with unknown parts shows its first day only', () => {
  const c = parseIcs(
    cal(ev('UID:x', 'DTSTART:20261017T090000Z', 'STATUS:CANCELLED'), ev('SUMMARY:No uid', 'DTSTART:20261018T090000Z'), ev('UID:h', 'DTSTART:20261019T090000Z', 'RRULE:FREQ=DAILY;BYHOUR=9,17')),
  );
  const occ = expandCalendar(c, ...YEAR);
  assert.deepEqual(occ.map((o) => o.title), ['No uid', '']);
  assert.equal(parseRule('FREQ=HOURLY')!.unsupported, true);
  assert.equal(parseRule('FREQ=YEARLY;BYDAY=20MO')!.unsupported, true);
  assert.equal(parseRule('INTERVAL=2'), null);
});

test('all day events: one day, several days, no DTEND, DURATION in days', () => {
  const c = parseIcs(
    cal(
      ev('UID:one', 'DTSTART;VALUE=DATE:20261017'),
      ev('UID:three', 'DTSTART;VALUE=DATE:20261017', 'DTEND;VALUE=DATE:20261020'),
      ev('UID:dur', 'DTSTART;VALUE=DATE:20261017', 'DURATION:P2D'),
    ),
  );
  const occ = expandCalendar(c, ...YEAR);
  const by = Object.fromEntries(occ.map((o) => [o.id.split('|')[0], o]));
  assert.equal(by.one.allDay, true);
  assert.deepEqual([by.one.startKey, by.one.endKey], ['2026-10-17', '2026-10-18']);
  assert.deepEqual([by.three.startKey, by.three.endKey], ['2026-10-17', '2026-10-20']);
  assert.deepEqual([by.dur.startKey, by.dur.endKey], ['2026-10-17', '2026-10-19']);
});

test('only the window is returned, and an event that started before it but still runs is included', () => {
  const c = parseIcs(cal(ev('UID:long', 'DTSTART:20261016T220000Z', 'DTEND:20261017T020000Z'), ev('UID:old', 'DTSTART:20260101T090000Z'), ev('UID:daily', 'DTSTART:20200101T090000Z', 'RRULE:FREQ=DAILY')));
  const occ = expandCalendar(c, U(2026, 10, 17), U(2026, 10, 18));
  assert.deepEqual(occ.map((o) => o.id.split('|')[0]).sort(), ['daily', 'long']);
});

test('caps: an endless daily rule from 1900 and a huge COUNT stay bounded and fast', () => {
  const c = parseIcs(cal(ev('UID:forever', 'DTSTART:19000101T090000Z', 'RRULE:FREQ=DAILY'), ev('UID:count', 'DTSTART:20260101T090000Z', 'RRULE:FREQ=DAILY;COUNT=99999999')));
  const t0 = Date.now();
  const occ = expandCalendar(c, U(2026, 10, 1), U(2026, 11, 1));
  assert.ok(Date.now() - t0 < 3000, 'under 3 s');
  assert.equal(occ.filter((o) => o.id.startsWith('count')).length, 31);
});

test('floating times and all day events read in the computer\'s own zone (five zones, in child processes)', () => {
  const url = pathToFileURL(path.join(import.meta.dirname, 'icsParse.ts')).href;
  const text = cal(ev('UID:f', 'DTSTART:20261025T090000', 'DTEND:20261025T100000'), ev('UID:a', 'DTSTART;VALUE=DATE:20261025'));
  for (const tz of ['Europe/London', 'America/New_York', 'Pacific/Auckland', 'Asia/Kolkata', 'Australia/Lord_Howe']) {
    const code = `const p = await import(${JSON.stringify(url)}); const c = p.parseIcs(${JSON.stringify(text)});
      const o = p.expandCalendar(c, Date.UTC(2026, 9, 20), Date.UTC(2026, 9, 30));
      process.stdout.write(JSON.stringify(o.map((x) => x.allDay ? x.startKey + '/' + x.endKey : new Date(x.startMs).getHours() + ':' + new Date(x.startMs).getMinutes() + '+' + (x.endMs - x.startMs) / 60000)));`;
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, TZ: tz }, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout).sort(), ['2026-10-25/2026-10-26', '9:0+60'], tz);
  }
});

test('a calendar of 3000 daily events from 2015 stays within the work budget and returns quickly', () => {
  const events = Array.from({ length: 3000 }, (_, i) => ev(`UID:e${i}`, 'DTSTART:20150101T090000Z', 'RRULE:FREQ=DAILY'));
  const c = parseIcs(cal(...events));
  const t0 = Date.now();
  expandCalendar(c, U(2026, 10, 12), U(2026, 10, 19));
  assert.ok(Date.now() - t0 < 5000, `took ${Date.now() - t0} ms`);
});
