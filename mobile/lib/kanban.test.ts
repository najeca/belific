// Run with `node --test lib/kanban.test.ts` from mobile/ (Node 26 runs .ts
// natively; the explicit .ts import below is required by Node).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  addWeeks,
  bucketTasks,
  clampToToday,
  formatWeekLabel,
  isDayInView,
  weekDays,
  weekStartOf,
  buildColumnDays,
  dateKey,
  formatDayLabel,
  formatDayTitle,
  formatDuration,
  formatShortDate,
  isDateKey,
  parseDateKey,
} from './kanban.ts';
import type { Task } from './types.ts';

function task(id: string, extra: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    completed: false,
    createdAt: `2026-10-0${(Number(id.replace(/\D/g, '')) % 9) + 1}T09:00:00.000Z`,
    updatedAt: '2026-10-01T09:00:00.000Z',
    ...extra,
  };
}

test('dateKey and parseDateKey round trip local days', () => {
  assert.equal(dateKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(dateKey(parseDateKey('2026-12-31')), '2026-12-31');
  assert.equal(parseDateKey('2026-02-03').getHours(), 0);
});

test('isDateKey accepts real days only', () => {
  assert.equal(isDateKey('2026-10-05'), true);
  assert.equal(isDateKey('2026-02-30'), false);
  assert.equal(isDateKey('2026-13-01'), false);
  assert.equal(isDateKey('5 Oct'), false);
  assert.equal(isDateKey(''), false);
  assert.equal(isDateKey(undefined), false);
});

test('buildColumnDays gives 14 consecutive days from today', () => {
  const days = buildColumnDays(new Date(2026, 9, 5, 15, 30), 14);
  assert.equal(days.length, 14);
  assert.equal(days[0].key, '2026-10-05');
  assert.equal(days[13].key, '2026-10-18');
});

test('buildColumnDays crosses month and year boundaries and leap day', () => {
  const month = buildColumnDays(new Date(2026, 9, 25), 14).map((d) => d.key);
  assert.deepEqual(month.slice(5, 9), ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  const year = buildColumnDays(new Date(2026, 11, 28), 7).map((d) => d.key);
  assert.deepEqual(year, [
    '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03',
  ]);
  const leap = buildColumnDays(new Date(2028, 1, 27), 4).map((d) => d.key);
  assert.deepEqual(leap, ['2028-02-27', '2028-02-28', '2028-02-29', '2028-03-01']);
  const nonLeap = buildColumnDays(new Date(2027, 1, 27), 3).map((d) => d.key);
  assert.deepEqual(nonLeap, ['2027-02-27', '2027-02-28', '2027-03-01']);
});

// Clock changes make some local days 23 or 25 hours long. Adding 24h of
// milliseconds would skip or repeat a date; calendar arithmetic must not.
// Setting TZ at runtime applies to Date in Node; the test also checks it did.
const ZONES: Array<{ tz: string; start: Date }> = [
  { tz: 'Europe/London', start: new Date(2026, 9, 20) }, // clocks back 25 Oct 2026
  { tz: 'Europe/London', start: new Date(2026, 2, 24) }, // clocks forward 29 Mar 2026
  { tz: 'America/New_York', start: new Date(2026, 9, 29) }, // back 1 Nov 2026
  { tz: 'America/New_York', start: new Date(2026, 2, 3) }, // forward 8 Mar 2026
  { tz: 'Australia/Lord_Howe', start: new Date(2026, 3, 1) }, // 30 minute change, 5 Apr 2026
  { tz: 'Pacific/Auckland', start: new Date(2026, 8, 20) }, // forward 27 Sep 2026
];

for (const { tz, start } of ZONES) {
  test(`buildColumnDays across clock changes in ${tz} from ${dateKey(start)}`, () => {
    const previous = process.env.TZ;
    process.env.TZ = tz;
    try {
      const days = buildColumnDays(new Date(start.getFullYear(), start.getMonth(), start.getDate(), 12), 14);
      const keys = days.map((d) => d.key);
      assert.equal(new Set(keys).size, 14, `duplicate dates: ${keys.join(',')}`);
      for (let i = 1; i < keys.length; i++) {
        const gapDays = Math.round((Date.UTC(...ymd(keys[i])) - Date.UTC(...ymd(keys[i - 1]))) / 86_400_000);
        assert.equal(gapDays, 1, `${keys[i - 1]} -> ${keys[i]}`);
      }
      for (const d of days) {
        assert.equal(d.date.getHours(), 0);
        assert.equal(dateKey(d.date), d.key);
      }
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });
}

function ymd(key: string): [number, number, number] {
  const [y, m, d] = key.split('-').map(Number);
  return [y, m - 1, d];
}

test('addDays uses calendar days', () => {
  assert.equal(dateKey(addDays(new Date(2026, 9, 24, 23, 30), 2)), '2026-10-26');
  assert.equal(dateKey(addDays(new Date(2026, 0, 1), -1)), '2025-12-31');
});

test('formatting helpers', () => {
  assert.equal(formatDayLabel('2026-10-05'), 'Mon 5 Oct');
  assert.equal(formatShortDate('2026-10-05'), '5 Oct');
  assert.equal(formatDayTitle('2026-10-05', '2026-10-05'), 'Today');
  assert.equal(formatDayTitle('2026-10-06', '2026-10-05'), 'Tomorrow');
  assert.equal(formatDayTitle('2026-10-07', '2026-10-05'), 'Wed 7 Oct');
  assert.equal(formatDayTitle('2026-11-01', '2026-10-31'), 'Tomorrow');
  assert.equal(formatDuration(15), '15m');
  assert.equal(formatDuration(60), '1h');
  assert.equal(formatDuration(90), '1h 30m');
  assert.equal(formatDuration(120), '2h');
  assert.equal(formatDuration(undefined), undefined);
  assert.equal(formatDuration(0), undefined);
});

const TODAY = '2026-10-05';
const days = buildColumnDays(parseDateKey(TODAY), 14);

test('bucketTasks: unscheduled, a day column, and the last visible day', () => {
  const cols = bucketTasks(
    [task('1'), task('2', { dueDate: '2026-10-07' }), task('3', { dueDate: '2026-10-18' })],
    days,
    TODAY,
  );
  assert.deepEqual(cols.unscheduled.map((i) => i.task.id), ['1']);
  assert.deepEqual(cols.days['2026-10-07'].map((i) => i.task.id), ['2']);
  assert.deepEqual(cols.days['2026-10-18'].map((i) => i.task.id), ['3']);
  assert.equal(Object.keys(cols.days).length, 14);
});

test('bucketTasks: unfinished past tasks surface in Today first, with their original date', () => {
  const cols = bucketTasks(
    [
      task('1', { dueDate: TODAY, priority: 'high' }),
      task('2', { dueDate: '2026-10-02' }),
      task('3', { dueDate: '2026-09-30' }),
      task('4', { dueDate: TODAY }),
    ],
    days,
    TODAY,
  );
  const today = cols.days[TODAY];
  assert.deepEqual(today.map((i) => i.task.id), ['3', '2', '1', '4']);
  assert.equal(today[0].overdueFrom, '2026-09-30');
  assert.equal(today[1].overdueFrom, '2026-10-02');
  assert.equal(today[2].overdueFrom, undefined);
  // The stored date is not touched.
  assert.equal(today[0].task.dueDate, '2026-09-30');
});

test('bucketTasks: finished past tasks do not appear; finished current ones sort last', () => {
  const cols = bucketTasks(
    [
      task('1', { dueDate: '2026-10-02', completed: true, completedAt: '2026-10-02T10:00:00.000Z' }),
      task('2', { dueDate: TODAY, completed: true, completedAt: '2026-10-05T08:00:00.000Z' }),
      task('3', { dueDate: TODAY }),
      task('4', { dueDate: TODAY, completed: true, completedAt: '2026-10-05T09:00:00.000Z' }),
    ],
    days,
    TODAY,
  );
  assert.deepEqual(cols.days[TODAY].map((i) => i.task.id), ['3', '4', '2']);
});

test('bucketTasks: tasks on days that are not displayed appear in no column', () => {
  const cols = bucketTasks(
    [task('1', { dueDate: '2026-12-01' }), task('2', { dueDate: '2026-10-19' }), task('3', { dueDate: '2027-01-01' })],
    days,
    TODAY,
  );
  assert.equal(Object.values(cols.days).flat().length, 0);
  assert.equal(cols.unscheduled.length, 0);
});

test('bucketTasks: a future week shows its own tasks, not overdue ones', () => {
  const future = weekDays(weekStartOf(parseDateKey('2026-10-14')), TODAY);
  const cols = bucketTasks(
    [
      task('1', { dueDate: '2026-10-14' }),
      task('2', { dueDate: '2026-10-02' }), // overdue: only in the current week's Today column
      task('3'),
      task('4', { dueDate: '2026-10-07' }), // a different week
    ],
    future,
    TODAY,
  );
  assert.deepEqual(cols.days['2026-10-14'].map((i) => i.task.id), ['1']);
  assert.deepEqual(cols.unscheduled.map((i) => i.task.id), ['3']);
  assert.equal(Object.values(cols.days).flat().length, 1);
});

test('bucketTasks: tombstones and malformed dates', () => {
  const cols = bucketTasks(
    [
      task('1', { deletedAt: '2026-10-04T00:00:00.000Z' }),
      task('2', { dueDate: 'next week' }),
      task('3', { dueDate: '2026-02-30' }),
    ],
    days,
    TODAY,
  );
  assert.deepEqual(cols.unscheduled.map((i) => i.task.id), ['2', '3']);
  assert.equal(Object.values(cols.days).flat().length, 0);
});

test('bucketTasks: priority then created order, High first', () => {
  const cols = bucketTasks(
    [
      task('1', { dueDate: '2026-10-06', createdAt: '2026-10-03T00:00:00.000Z' }),
      task('2', { dueDate: '2026-10-06', createdAt: '2026-10-01T00:00:00.000Z' }),
      task('3', { dueDate: '2026-10-06', createdAt: '2026-10-04T00:00:00.000Z', priority: 'high' }),
    ],
    days,
    TODAY,
  );
  assert.deepEqual(cols.days['2026-10-06'].map((i) => i.task.id), ['3', '2', '1']);
});

test('bucketTasks works across a month boundary', () => {
  const todayKey = '2026-10-30';
  const d = buildColumnDays(parseDateKey(todayKey), 14);
  const cols = bucketTasks([task('1', { dueDate: '2026-11-02' }), task('2', { dueDate: '2026-10-31' })], d, todayKey);
  assert.deepEqual(cols.days['2026-11-02'].map((i) => i.task.id), ['1']);
  assert.deepEqual(cols.days['2026-10-31'].map((i) => i.task.id), ['2']);
});

// --- week board ---

test('weekStartOf is Monday based', () => {
  assert.equal(dateKey(weekStartOf(parseDateKey('2026-10-05'))), '2026-10-05'); // Monday
  assert.equal(dateKey(weekStartOf(parseDateKey('2026-10-07'))), '2026-10-05'); // Wednesday
  assert.equal(dateKey(weekStartOf(parseDateKey('2026-10-11'))), '2026-10-05'); // Sunday belongs to the week before
  assert.equal(dateKey(weekStartOf(parseDateKey('2026-10-12'))), '2026-10-12');
  assert.equal(dateKey(weekStartOf(parseDateKey('2027-01-01'))), '2026-12-28'); // across the year
  assert.equal(dateKey(weekStartOf(parseDateKey('2028-03-01'))), '2028-02-28'); // across a leap day
  assert.equal(weekStartOf(new Date(2026, 9, 7, 23, 59)).getHours(), 0);
});

test('addWeeks adds whole calendar weeks', () => {
  assert.equal(dateKey(addWeeks(parseDateKey('2026-10-05'), 1)), '2026-10-12');
  assert.equal(dateKey(addWeeks(parseDateKey('2026-12-28'), 1)), '2027-01-04');
  assert.equal(dateKey(addWeeks(parseDateKey('2026-10-05'), 4)), '2026-11-02');
});

test('weekDays: the current week runs from today to Sunday, future weeks are the full week', () => {
  const current = weekDays(weekStartOf(parseDateKey('2026-10-07')), '2026-10-07');
  assert.deepEqual(current.map((d) => d.key), ['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
  const monday = weekDays(weekStartOf(parseDateKey('2026-10-05')), '2026-10-05');
  assert.equal(monday.length, 7);
  const sunday = weekDays(weekStartOf(parseDateKey('2026-10-11')), '2026-10-11');
  assert.deepEqual(sunday.map((d) => d.key), ['2026-10-11']);
  const future = weekDays(parseDateKey('2026-10-12'), '2026-10-07');
  assert.equal(future.length, 7);
  assert.equal(future[0].key, '2026-10-12');
  assert.equal(future[6].key, '2026-10-18');
});

test('weekDays crosses months, years and leap days', () => {
  const month = weekDays(parseDateKey('2026-10-26'), '2026-10-01').map((d) => d.key);
  assert.deepEqual(month, ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
  const year = weekDays(parseDateKey('2026-12-28'), '2026-12-01').map((d) => d.key);
  assert.deepEqual(year.slice(3), ['2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
  const leap = weekDays(parseDateKey('2028-02-28'), '2028-02-01').map((d) => d.key);
  assert.deepEqual(leap.slice(0, 3), ['2028-02-28', '2028-02-29', '2028-03-01']);
});

test('formatWeekLabel', () => {
  const cur = weekDays(weekStartOf(parseDateKey('2026-10-07')), '2026-10-07');
  assert.equal(formatWeekLabel(cur, 2026), 'Wed 7 Oct to Sun 11 Oct');
  const monthSpan = weekDays(parseDateKey('2026-10-26'), '2026-10-07');
  assert.equal(formatWeekLabel(monthSpan, 2026), 'Mon 26 Oct to Sun 1 Nov');
  const yearSpan = weekDays(parseDateKey('2026-12-28'), '2026-10-07');
  assert.equal(formatWeekLabel(yearSpan, 2026), 'Mon 28 Dec 2026 to Sun 3 Jan 2027');
  const nextYear = weekDays(parseDateKey('2027-01-11'), '2026-10-07');
  assert.equal(formatWeekLabel(nextYear, 2026), 'Mon 11 Jan 2027 to Sun 17 Jan 2027');
  const leapSpan = weekDays(parseDateKey('2028-02-28'), '2028-02-01');
  assert.equal(formatWeekLabel(leapSpan, 2028), 'Mon 28 Feb to Sun 5 Mar');
  const sundayOnly = weekDays(weekStartOf(parseDateKey('2026-10-11')), '2026-10-11');
  assert.equal(formatWeekLabel(sundayOnly, 2026), 'Sun 11 Oct to Sun 11 Oct');
  assert.equal(formatWeekLabel([], 2026), '');
});

test('clampToToday and isDayInView', () => {
  assert.equal(clampToToday('2026-10-01', '2026-10-05'), '2026-10-05');
  assert.equal(clampToToday('2026-10-05', '2026-10-05'), '2026-10-05');
  assert.equal(clampToToday('2026-11-02', '2026-10-05'), '2026-11-02');
  assert.equal(clampToToday('not a date', '2026-10-05'), '2026-10-05');
  assert.equal(clampToToday('2026-02-30', '2026-10-05'), '2026-10-05');
  const view = weekDays(weekStartOf(parseDateKey('2026-10-07')), '2026-10-07');
  assert.equal(isDayInView('2026-10-09', view), true);
  assert.equal(isDayInView('2026-11-02', view), false);
});

// Week arithmetic must not skip or repeat a Monday when clocks change.
const WEEK_ZONES = ['Europe/London', 'America/New_York', 'Australia/Lord_Howe', 'Pacific/Auckland', 'Asia/Kolkata'];
for (const tz of WEEK_ZONES) {
  test(`weeks are seven calendar days across clock changes in ${tz}`, () => {
    const previous = process.env.TZ;
    process.env.TZ = tz;
    try {
      let start = weekStartOf(new Date(2026, 2, 20, 12));
      for (let i = 0; i < 40; i++) {
        const next = addWeeks(start, 1);
        assert.equal(next.getDay(), 1, `${dateKey(next)} is not a Monday`);
        assert.equal(next.getHours(), 0);
        const gap = Math.round((Date.UTC(next.getFullYear(), next.getMonth(), next.getDate()) - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86_400_000);
        assert.equal(gap, 7);
        assert.equal(dateKey(weekStartOf(addDays(next, 6))), dateKey(next));
        start = next;
      }
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });
}
