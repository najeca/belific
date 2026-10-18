// The weekday and date of today on the day header, the Today buttons and the
// strip (2.27.0, item 5), with fixed dates. The real day: Sunday 18 October
// 2026, Europe/London (BST, UTC+1, a week before the clocks change).
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { columnHeading, followToday, stripAround, dayAt, indexOfDay } from './dayStrip.ts';
import { dateKey, parseDateKey, weekStartOf, WEEKDAYS } from './kanban.ts';
import { calendarTitle } from './calendarView.ts';

test('18 October 2026 is a Sunday, and the header says so', () => {
  assert.equal(WEEKDAYS[parseDateKey('2026-10-18').getDay()], 'Sun');
  assert.deepEqual(columnHeading('2026-10-18', '2026-10-18'), { weekday: 'Sun', date: 'Oct 18', when: 'today' });
  assert.deepEqual(columnHeading('2026-10-17', '2026-10-18'), { weekday: 'Sat', date: 'Oct 17', when: 'past' });
  assert.deepEqual(columnHeading('2026-10-19', '2026-10-18'), { weekday: 'Mon', date: 'Oct 19', when: 'future' });
  assert.equal(calendarTitle('day', '2026-10-18'), 'Sun 18 Oct 2026');
  // The week starts on Monday: the Sunday belongs to the week of Mon 12 Oct.
  assert.equal(dateKey(weekStartOf(parseDateKey('2026-10-18'))), '2026-10-12');
});

test('the strip around today has today where the Today button puts it', () => {
  const strip = stripAround('2026-10-18');
  const i = indexOfDay(strip, '2026-10-18');
  assert.equal(dayAt(strip, i), '2026-10-18');
  assert.equal(dayAt(strip, i + 1), '2026-10-19');
  assert.equal(dayAt(strip, i - 1), '2026-10-17');
});

test('today is the local day in Europe/London, not the UTC day, at every hour of 18 October', () => {
  const url = pathToFileURL(path.join(import.meta.dirname, 'dayStrip.ts')).href;
  const code = `const s = await import(${JSON.stringify(url)});
    const k = await import(${JSON.stringify(pathToFileURL(path.join(import.meta.dirname, 'kanban.ts')).href)});
    const out = [];
    for (const h of [0, 0.5, 1, 12, 23, 23.99]) {
      const d = new Date(2026, 9, 18, Math.floor(h), Math.round((h % 1) * 60));
      const key = k.dateKey(d);
      out.push([key, s.columnHeading(key, key).weekday, d.getTimezoneOffset()]);
    }
    // The clock change a week later (Sun 25 Oct 2026, 02:00 BST back to 01:00 GMT).
    for (const h of [0, 1, 3, 23]) { const d = new Date(2026, 9, 25, h, 30); out.push([k.dateKey(d), s.columnHeading(k.dateKey(d), k.dateKey(d)).weekday]); }
    process.stdout.write(JSON.stringify(out));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, TZ: 'Europe/London' }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  for (const [key, wd, off] of out.slice(0, 6)) {
    assert.equal(key, '2026-10-18');
    assert.equal(wd, 'Sun');
    assert.equal(off, -60, 'BST');
  }
  for (const [key, wd] of out.slice(6)) assert.deepEqual([key, wd], ['2026-10-25', 'Sun']);
});

test('after midnight a view on today follows to the new today; a moved view stays', () => {
  assert.equal(followToday('2026-10-17', '2026-10-17', '2026-10-18'), '2026-10-18');
  assert.equal(followToday('2026-10-20', '2026-10-17', '2026-10-18'), '2026-10-20');
  assert.equal(followToday('2026-10-18', '2026-10-18', '2026-10-18'), '2026-10-18');
});
