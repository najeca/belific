// Run with `node --test lib/kanban.test.ts` from mobile/ (Node 26 runs .ts
// natively; the explicit .ts import below is required by Node).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  bucketTasks,
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
  assert.equal(cols.later.length, 0);
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

test('bucketTasks: beyond the window goes to Later, sorted by date', () => {
  const cols = bucketTasks(
    [task('1', { dueDate: '2026-12-01' }), task('2', { dueDate: '2026-10-19' }), task('3', { dueDate: '2027-01-01' })],
    days,
    TODAY,
  );
  assert.deepEqual(cols.later.map((i) => i.task.id), ['2', '1', '3']);
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
