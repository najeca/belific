// Run with `npm test` from mobile/. R2 of PLAN_repeat_end_and_parts: Repeat until. The end date is the last day a
// repeating task happens (E1); days after it are hidden, not deleted; clearing it brings them back; past and done days
// stay. Covers the rule, the hide check, the writes, the wording and every place that builds a day's tasks.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Task, WeekDay } from './types.ts';
import { addDays, bucketTasks, dateKey, parseDateKey } from './kanban.ts';
import {
  earliestEnd,
  endSeriesRows,
  endTooEarlyText,
  isAfterEnd,
  isGone,
  isLastDay,
  occursOn,
  projectOccurrences,
  repeatUntilRows,
  seriesOf,
} from './series.ts';
import { nextOccurrence } from './recurrence.ts';
import { dayRun, repeatLine } from './repeat.ts';
import { tasksForTimebox } from './timeboxTasks.ts';
import { dayItems } from './wrapUp.ts';
import { planClear } from './clear.ts';
import { feedEvents } from './icsFeed.ts';

const MON_THU: WeekDay[] = ['Mon', 'Tue', 'Wed', 'Thu'];
const TODAY = '2026-11-12'; // a Thursday
const camp = (extra: Partial<Task> = {}): Task => ({
  id: 'camp',
  title: 'Boot camp',
  dueDate: '2026-11-02',
  startTime: '18:00',
  durationMinutes: 60,
  recurrence: 'weekly',
  recurrenceDays: MON_THU,
  completed: false,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  ...extra,
});
const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => dateKey(addDays(parseDateKey(from), i)));

test('occursOn: the end date is the last day it happens (E1); nothing after it', () => {
  const rule = camp({ repeatUntil: '2026-12-17' });
  assert.equal(occursOn(rule, '2026-12-17', '2026-11-02'), true, 'Thu 17 Dec is the last day');
  assert.equal(occursOn(rule, '2026-12-21', '2026-11-02'), false, 'Mon 21 Dec is after the end');
  assert.equal(occursOn(camp(), '2026-12-21', '2026-11-02'), true, 'no end: it goes on');
});

test('projection: the boot camp shows up to Thu 17 Dec and nothing from Fri 18 Dec; clearing the date brings the days back', () => {
  const window = days('2026-12-14', 14);
  const ended = projectOccurrences([camp({ repeatUntil: '2026-12-17' })], window, TODAY).map((t) => t.dueDate);
  assert.deepEqual(ended, ['2026-12-14', '2026-12-15', '2026-12-16', '2026-12-17']);
  const back = projectOccurrences([camp()], window, TODAY).map((t) => t.dueDate);
  assert.equal(back.length, 8);
  // a projected day carries the end, so it reads "Last day" on the 17th
  const last = projectOccurrences([camp({ repeatUntil: '2026-12-17' })], ['2026-12-17'], TODAY)[0];
  assert.equal(last.repeatUntil, '2026-12-17');
  assert.equal(isLastDay(last, '2026-12-17'), true);
  assert.equal(isLastDay(last, '2026-12-16'), false);
});

test('isAfterEnd: an open stored day after the end is hidden; a done day, a day before the end and a tombstone are not', () => {
  const end = { repeatUntil: '2026-12-17' };
  const later = camp({ id: 'camp:2026-12-21', dueDate: '2026-12-21', ...end });
  assert.equal(isAfterEnd(later), true);
  assert.equal(isGone(later), true);
  assert.equal(isAfterEnd({ ...later, completed: true }), false, 'a done day stays as history');
  assert.equal(isAfterEnd(camp({ id: 'camp:2026-11-09', dueDate: '2026-11-09', ...end })), false);
  assert.equal(isAfterEnd({ ...later, deletedAt: 'x' }), false);
  assert.equal(isGone({ ...later, deletedAt: 'x' }), true);
  // a moved day stands for its own day: the 17th moved to Fri 18th is still the last day, not hidden
  assert.equal(isAfterEnd(camp({ id: 'camp:2026-12-17', dueDate: '2026-12-18', ...end })), false);
  // the 21st moved back onto the 16th stands for the 21st: hidden
  assert.equal(isAfterEnd(camp({ id: 'camp:2026-12-21', dueDate: '2026-12-16', ...end })), true);
});

test('repeatUntilRows: written on every row with the rule (tombstones and done days too), cleared the same way; nothing deleted', () => {
  const rows = [
    camp({ completed: true }),
    camp({ id: 'camp:2026-11-09', dueDate: '2026-11-09', completed: true }),
    camp({ id: 'camp:2026-11-10', dueDate: '2026-11-10', deletedAt: 'x' }),
    camp({ id: 'camp:2026-12-21', dueDate: '2026-12-21' }),
  ];
  const set = repeatUntilRows(rows, '2026-12-17', 'now');
  assert.equal(set.length, 4);
  assert.ok(set.every((r) => r.repeatUntil === '2026-12-17' && r.updatedAt === 'now'));
  assert.equal(set.filter((r) => r.deletedAt).length, 1, 'no new tombstone');
  assert.equal(set.find((r) => r.id === 'camp:2026-12-21')?.completed, false);
  const cleared = repeatUntilRows(set, undefined, 'later');
  assert.ok(cleared.every((r) => r.repeatUntil === undefined));
  assert.equal(repeatUntilRows(set, '2026-12-17', 'x').length, 0, 'nothing to write when nothing changes');
  assert.equal(repeatUntilRows([{ ...rows[0], recurrence: undefined }], '2026-12-17', 'x').length, 0, 'a row with no rule is left alone');
});

test('"Does not repeat" clears the end date with the rest of the rule', () => {
  const out = endSeriesRows([camp({ repeatUntil: '2026-12-17' })], 'now');
  assert.equal(out[0].recurrence, undefined);
  assert.equal(out[0].repeatUntil, undefined);
});

test('earliest end: the first day of the series; the quiet line names it', () => {
  const rows = [camp(), camp({ id: 'camp:2026-11-09', dueDate: '2026-11-09', completed: true })];
  assert.equal(earliestEnd(rows), '2026-11-02');
  assert.equal(seriesOf(rows, 'camp')?.startKey, '2026-11-02');
  assert.equal(endTooEarlyText('2026-11-02'), 'Pick a day on or after Mon 2 Nov');
});

test('nextOccurrence: no next day after the end (ticking the last day stores nothing ahead)', () => {
  assert.equal(nextOccurrence(camp({ dueDate: '2026-12-17', repeatUntil: '2026-12-17' }), '2026-12-17'), null);
  assert.equal(nextOccurrence(camp({ dueDate: '2026-12-16', repeatUntil: '2026-12-17' }), '2026-12-16'), '2026-12-17');
  assert.equal(nextOccurrence(camp({ dueDate: '2026-12-17' }), '2026-12-17'), '2026-12-21');
});

test('wording: "Mon to Thu, until Thu 17 Dec"; days not in a row read as before', () => {
  assert.equal(repeatLine(camp({ repeatUntil: '2026-12-17' }), TODAY), 'Mon to Thu, until Thu 17 Dec');
  assert.equal(repeatLine(camp(), TODAY), 'Mon to Thu');
  assert.equal(dayRun(['Mon', 'Wed']), 'Mon Wed');
  assert.equal(dayRun(['Mon', 'Tue']), 'Mon Tue');
  assert.equal(dayRun(['Fri', 'Thu', 'Wed']), 'Wed to Fri');
  assert.equal(repeatLine({ recurrence: 'daily', repeatUntil: '2026-12-17' }, TODAY), 'Every day, until Thu 17 Dec');
  assert.equal(repeatLine({ recurrence: 'biweekly', recurrenceDays: ['Mon', 'Thu'] }, TODAY), 'Every 2 wks Mon Thu');
});

// Every place that builds a day's tasks respects the end: the board, the Timebox and Calendar, Wrap up, Clear, the feed.
const withStoredAfterEnd = (): Task[] => {
  const end = { repeatUntil: '2026-12-17' };
  return [
    camp(end),
    camp({ id: 'camp:2026-12-21', dueDate: '2026-12-21', ...end }), // stored ahead before the end was set: hidden
    camp({ id: 'camp:2026-12-22', dueDate: '2026-12-22', completed: true, completedAt: '2026-12-22T19:00:00Z', ...end }), // done: stays
  ];
};

test('the board and the Timebox (the Calendar uses the same rule) hide the open day after the end and keep the done one', () => {
  const raw = withStoredAfterEnd();
  const cols = bucketTasks(raw, ['2026-12-21', '2026-12-22'].map((key) => ({ key, date: parseDateKey(key) })), '2026-12-20');
  assert.equal(cols.days['2026-12-21'].length, 0);
  assert.equal(cols.days['2026-12-22'].length, 1);
  assert.equal(tasksForTimebox(raw, '2026-12-21', '2026-12-20').own.length, 0);
  assert.equal(tasksForTimebox(raw, '2026-12-22', '2026-12-20').own.length, 1);
  assert.equal(tasksForTimebox(raw, '2026-12-17', '2026-12-14').own.length, 1, 'the last day still shows');
});

test('Wrap up and Clear tools see nothing after the end', () => {
  const raw = withStoredAfterEnd();
  assert.equal(dayItems(raw, '2026-12-21', '2026-12-21', 15).length, 0);
  assert.equal(dayItems(raw, '2026-12-17', '2026-12-17', 15).length, 1);
  assert.equal(planClear(raw, { kind: 'day', dayKey: '2026-12-21' }, '2026-12-20').items.length, 0);
  assert.equal(planClear(raw, { kind: 'week', days: days('2026-12-21', 7) }, '2026-12-20').items.length, 0);
});

test('the ICS feed (and the server feed, a byte for byte copy) sends nothing after the end', () => {
  const raw = withStoredAfterEnd();
  const evs = feedEvents(raw, '2026-12-14').map((e) => e.start.slice(0, 8));
  assert.ok(evs.includes('20261217'));
  assert.ok(!evs.includes('20261221'));
  assert.ok(evs.includes('20261222'), 'the done day stays');
});
