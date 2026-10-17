// Where an outside event shows on a day (build plan phase 8): all day row or
// hour grid, cut at midnight, clock change days; and the iPhone's events.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { fromDeviceEvent, minuteLabel, rangeOf, segmentsForDay, MIN_SEGMENT_MINUTES } from './externalEvents.ts';
import type { Occurrence } from './icsParse.ts';

const L = (y: number, m: number, d: number, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();
const timed = (id: string, s: number, e: number): Occurrence => ({ id, title: id, allDay: false, startMs: s, endMs: e });
const allDay = (id: string, startKey: string, endKey: string): Occurrence => ({ id, title: id, allDay: true, startMs: 0, endMs: 0, startKey, endKey });

test('a timed event sits on the grid of its day at its local minutes', () => {
  const [s] = segmentsForDay([timed('a', L(2026, 10, 17, 9, 30), L(2026, 10, 17, 11))], '2026-10-17');
  assert.deepEqual([s.allDayRow, s.startMin, s.endMin, s.continues], [false, 570, 660, false]);
  assert.equal(segmentsForDay([timed('a', L(2026, 10, 17, 9, 30), L(2026, 10, 17, 11))], '2026-10-18').length, 0);
});

test('a long event across midnight is cut: the rest shows at the top of the next day', () => {
  const o = timed('night', L(2026, 10, 17, 22), L(2026, 10, 18, 2));
  const [a] = segmentsForDay([o], '2026-10-17');
  const [b] = segmentsForDay([o], '2026-10-18');
  assert.deepEqual([a.startMin, a.endMin, a.continues], [1320, 1440, false]);
  assert.deepEqual([b.startMin, b.endMin, b.continues], [0, 120, true]);
  // Ending exactly at midnight does not touch the next day.
  assert.equal(segmentsForDay([timed('m', L(2026, 10, 17, 22), L(2026, 10, 18, 0))], '2026-10-18').length, 0);
});

test('a timed event of 24 hours or more goes in the all day row of every day it touches', () => {
  const o = timed('trip', L(2026, 10, 17, 15), L(2026, 10, 19, 10));
  for (const k of ['2026-10-17', '2026-10-18', '2026-10-19']) {
    const [s] = segmentsForDay([o], k);
    assert.equal(s.allDayRow, true, k);
  }
  assert.equal(segmentsForDay([o], '2026-10-20').length, 0);
});

test('all day events cover their days, end day excluded', () => {
  const o = allDay('hol', '2026-10-17', '2026-10-20');
  assert.deepEqual(['2026-10-16', '2026-10-17', '2026-10-19', '2026-10-20'].map((k) => segmentsForDay([o], k).length), [0, 1, 1, 0]);
  assert.equal(segmentsForDay([o], '2026-10-18')[0].continues, true);
});

test('a zero length event gets a small block; all day first, then by start', () => {
  const segs = segmentsForDay([timed('z', L(2026, 10, 17, 23, 55), L(2026, 10, 17, 23, 55)), timed('b', L(2026, 10, 17, 8), L(2026, 10, 17, 9)), allDay('ad', '2026-10-17', '2026-10-18')], '2026-10-17');
  assert.deepEqual(segs.map((s) => s.occ.id), ['ad', 'b', 'z']);
  assert.equal(segs[2].endMin, 1440, 'capped at 24:00');
  const [mid] = segmentsForDay([timed('z', L(2026, 10, 17, 12), L(2026, 10, 17, 12))], '2026-10-17');
  assert.equal(mid.endMin - mid.startMin, MIN_SEGMENT_MINUTES);
  assert.equal(minuteLabel(570), '09:30');
  assert.equal(minuteLabel(1440), '24:00');
});

test('clock change days in five zones: an event from 00:30 to 03:30 local reads 00:30 to 03:30', () => {
  const url = pathToFileURL(path.join(import.meta.dirname, 'externalEvents.ts')).href;
  // Each zone's own clock change day of 2026.
  const days: Record<string, string> = { 'Europe/London': '2026-10-25', 'America/New_York': '2026-11-01', 'Pacific/Auckland': '2026-09-27', 'Australia/Lord_Howe': '2026-10-04', 'Asia/Kolkata': '2026-10-25' };
  for (const [tz, day] of Object.entries(days)) {
    const [y, m, d] = day.split('-').map(Number);
    const nextKey = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    const code = `const e = await import(${JSON.stringify(url)});
      const s = new Date(${y}, ${m - 1}, ${d}, 0, 30).getTime(); const en = new Date(${y}, ${m - 1}, ${d}, 3, 30).getTime();
      const segs = e.segmentsForDay([{ id: 'x', title: 'x', allDay: false, startMs: s, endMs: en }], ${JSON.stringify(day)});
      const next = e.segmentsForDay([{ id: 'x', title: 'x', allDay: false, startMs: s, endMs: en }], ${JSON.stringify(nextKey)});
      process.stdout.write(JSON.stringify([segs.map((x) => [x.startMin, x.endMin]), next.length]));`;
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, TZ: tz }, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(JSON.parse(r.stdout), [[[30, 210]], 0], tz);
  }
});

test('iPhone events: timed, all day ending 23:59:59, all day ending at the next midnight, several days, bad dates', () => {
  const t = fromDeviceEvent({ id: 'e1', calendarId: 'c', title: 'Dentist', startDate: new Date(2026, 9, 17, 9).toISOString(), endDate: new Date(2026, 9, 17, 10).toISOString() })!;
  assert.equal(t.allDay, false);
  assert.equal(t.endMs - t.startMs, 3600000);
  const a = fromDeviceEvent({ id: 'e2', title: 'Holiday', allDay: true, startDate: new Date(2026, 9, 17), endDate: new Date(2026, 9, 17, 23, 59, 59) })!;
  assert.deepEqual([a.startKey, a.endKey], ['2026-10-17', '2026-10-18']);
  const b = fromDeviceEvent({ id: 'e3', allDay: true, startDate: new Date(2026, 9, 17), endDate: new Date(2026, 9, 18) })!;
  assert.deepEqual([b.startKey, b.endKey, b.title], ['2026-10-17', '2026-10-18', 'Busy']);
  const c = fromDeviceEvent({ id: 'e4', allDay: true, startDate: new Date(2026, 9, 17), endDate: new Date(2026, 9, 19, 23, 59, 59) })!;
  assert.deepEqual([c.startKey, c.endKey], ['2026-10-17', '2026-10-20']);
  assert.equal(fromDeviceEvent({ id: 'x', startDate: 'nope', endDate: 'nope' }), null);
  const r = rangeOf('2026-10-01', '2026-10-31');
  assert.equal(r.fromMs, L(2026, 10, 1));
  assert.equal(r.toMs, L(2026, 11, 1));
});
