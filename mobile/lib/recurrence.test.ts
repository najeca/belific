// Run with `npm test` from mobile/ (Node 26 runs .ts natively; the explicit
// .ts imports are required by Node).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNextOccurrence, nextOccurrence, nextOccurrenceId, rootTaskId } from './recurrence.ts';
import type { Task, WeekDay } from './types.ts';

const TODAY = '2026-10-05';
// `today` defaults to a date long before the Days used below, so the Day is the
// base. Tests of the later-of rule pass `today` explicitly.
const next = (dueDate: string | undefined, recurrence: Task['recurrence'], days?: WeekDay[], today = '2000-01-01') =>
  nextOccurrence({ dueDate, recurrence, recurrenceDays: days }, today);

test('a task that does not repeat has no next occurrence', () => {
  assert.equal(next('2026-10-05', undefined), null);
});

test('daily: +1 day, across month, year and leap boundaries', () => {
  assert.equal(next('2026-10-05', 'daily'), '2026-10-06');
  assert.equal(next('2026-10-31', 'daily'), '2026-11-01');
  assert.equal(next('2026-12-31', 'daily'), '2027-01-01');
  assert.equal(next('2028-02-28', 'daily'), '2028-02-29');
  assert.equal(next('2028-02-29', 'daily'), '2028-03-01');
  assert.equal(next('2027-02-28', 'daily'), '2027-03-01');
});

test('weekly with no weekdays: +7 days', () => {
  assert.equal(next('2026-10-05', 'weekly'), '2026-10-12');
  assert.equal(next('2026-10-05', 'weekly', []), '2026-10-12');
  assert.equal(next('2026-12-28', 'weekly'), '2027-01-04');
});

test('weekly with weekdays: the next selected weekday after the Day', () => {
  // 2026-10-05 is a Monday
  assert.equal(next('2026-10-05', 'weekly', ['Mon', 'Thu']), '2026-10-08'); // Mon -> Thu
  assert.equal(next('2026-10-08', 'weekly', ['Mon', 'Thu']), '2026-10-12'); // Thu -> next Mon
  assert.equal(next('2026-10-10', 'weekly', ['Mon', 'Thu']), '2026-10-12'); // Sat (not selected) -> Mon
  assert.equal(next('2026-10-05', 'weekly', ['Mon']), '2026-10-12'); // only today's weekday -> +7
  assert.equal(next('2026-10-11', 'weekly', ['Mon']), '2026-10-12'); // Sun -> Mon
  assert.equal(next('2026-10-06', 'weekly', ['Sun']), '2026-10-11'); // Tue -> Sun
  assert.equal(next('2026-10-11', 'weekly', ['Sun', 'Sat']), '2026-10-17'); // Sun wraps to the Saturday
  assert.equal(next('2026-12-31', 'weekly', ['Fri', 'Sat']), '2027-01-01'); // across the year
  assert.equal(next('2028-02-25', 'weekly', ['Tue']), '2028-02-29'); // across a leap day
});

test('every 2 weeks with no days: the weekday of the Day, every other week (+14)', () => {
  assert.equal(next('2026-10-05', 'biweekly'), '2026-10-19');
  // With days (checkpoint 4.2): the Day's own week is an "on" week, so a
  // Monday task repeating on Fri comes back that Friday.
  assert.equal(next('2026-10-05', 'biweekly', ['Fri']), '2026-10-09');
  assert.equal(next('2026-12-23', 'biweekly'), '2027-01-06');
  assert.equal(next('2028-02-20', 'biweekly'), '2028-03-05');
  assert.equal(next('2026-10-05', 'triweekly'), '2026-10-26');
});

test('monthly: same day next month, clamped to the month end', () => {
  assert.equal(next('2026-10-15', 'monthly'), '2026-11-15');
  assert.equal(next('2026-01-31', 'monthly'), '2026-02-28');
  assert.equal(next('2028-01-31', 'monthly'), '2028-02-29'); // leap year
  assert.equal(next('2026-03-31', 'monthly'), '2026-04-30');
  assert.equal(next('2026-05-31', 'monthly'), '2026-06-30');
  assert.equal(next('2026-12-15', 'monthly'), '2027-01-15'); // year boundary
  assert.equal(next('2026-12-31', 'monthly'), '2027-01-31');
  assert.equal(next('2026-01-30', 'monthly'), '2026-02-28');
  assert.equal(next('2028-02-29', 'monthly'), '2028-03-29');
  assert.equal(next('2027-02-28', 'monthly'), '2027-03-28');
});

test('a recurring task with no (or an invalid) Day counts from today', () => {
  assert.equal(next(undefined, 'daily', undefined, TODAY), '2026-10-06');
  assert.equal(next(undefined, 'weekly', ['Fri'], TODAY), '2026-10-09');
  assert.equal(next(undefined, 'monthly', undefined, '2026-01-31'), '2026-02-28');
  assert.equal(next('not a date', 'daily', undefined, TODAY), '2026-10-06');
  assert.equal(next('2026-02-30', 'daily', undefined, TODAY), '2026-10-06');
});

test('the count starts from the later of the Day and today', () => {
  // a Day in the future is used as it is
  assert.equal(next('2026-10-20', 'daily', undefined, TODAY), '2026-10-21');
  assert.equal(next('2026-10-20', 'weekly', ['Thu'], TODAY), '2026-10-22');
  // a Day in the past counts from today instead (2026-10-05 is a Monday)
  assert.equal(next('2026-09-21', 'daily', undefined, TODAY), '2026-10-06');
  assert.equal(next('2026-09-21', 'weekly', undefined, TODAY), '2026-10-12');
  assert.equal(next('2026-09-21', 'weekly', ['Mon'], TODAY), '2026-10-12'); // a Monday task done on a Monday
  assert.equal(next('2026-09-21', 'weekly', ['Mon', 'Thu'], TODAY), '2026-10-08');
  assert.equal(next('2026-09-21', 'biweekly', undefined, TODAY), '2026-10-19');
  // Monthly keeps its date number (checkpoint 4.2): the 31st done late is the 31st.
  assert.equal(next('2026-08-31', 'monthly', undefined, TODAY), '2026-10-31');
  // the same Day as today
  assert.equal(next(TODAY, 'daily', undefined, TODAY), '2026-10-06');
});

test('an overdue recurring task never produces a past-dated next occurrence', () => {
  const rules: Array<{ r: NonNullable<Task['recurrence']>; days?: WeekDay[] }> = [
    { r: 'daily' },
    { r: 'weekly' },
    { r: 'weekly', days: ['Mon', 'Wed', 'Fri'] },
    { r: 'weekly', days: ['Sun'] },
    { r: 'biweekly' },
    { r: 'triweekly' },
    { r: 'monthly' },
  ];
  const todays = ['2026-10-05', '2026-12-31', '2028-02-29', '2027-03-31'];
  const days = ['2020-01-01', '2026-01-31', '2026-09-30', '2026-10-04', '2026-12-30', '2028-02-28'];
  for (const today of todays) {
    for (const { r, days: wd } of rules) {
      for (const day of days) {
        const n = next(day, r, wd, today)!;
        assert.ok(n > today, `${r} ${wd ?? ''} due ${day}, completed ${today} gave ${n}`);
      }
      assert.ok(next(undefined, r, wd, today)! > today);
    }
  }
});

// Clock changes make some local days 23 or 25 hours long: results must still be
// calendar days, never skipping or repeating a date.
const ZONES = ['Europe/London', 'America/New_York', 'Australia/Lord_Howe', 'Pacific/Auckland', 'Asia/Kolkata'];
for (const tz of ZONES) {
  test(`recurrence across clock changes in ${tz}`, () => {
    const previous = process.env.TZ;
    process.env.TZ = tz;
    try {
      assert.equal(next('2026-10-24', 'daily'), '2026-10-25'); // London clocks go back on the 25th
      assert.equal(next('2026-10-25', 'daily'), '2026-10-26');
      assert.equal(next('2026-03-28', 'daily'), '2026-03-29'); // London clocks go forward on the 29th
      assert.equal(next('2026-03-29', 'daily'), '2026-03-30');
      assert.equal(next('2026-10-31', 'daily'), '2026-11-01'); // New York clocks go back on 1 Nov
      assert.equal(next('2026-03-07', 'daily'), '2026-03-08'); // New York clocks go forward on 8 Mar
      assert.equal(next('2026-10-20', 'biweekly'), '2026-11-03');
      assert.equal(next('2026-10-22', 'weekly', ['Mon']), '2026-10-26');
      assert.equal(next('2026-10-25', 'weekly'), '2026-11-01');
      assert.equal(next('2026-03-15', 'monthly'), '2026-04-15');
      assert.equal(next('2026-09-26', 'daily'), '2026-09-27'); // Auckland clocks go forward on 27 Sep
      assert.equal(next('2026-04-04', 'daily'), '2026-04-05'); // Lord Howe clocks go back on 5 Apr
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });
}

test('ids: the root is the part before the first colon, and ids are deterministic', () => {
  assert.equal(rootTaskId('1730000000000'), '1730000000000');
  assert.equal(rootTaskId('7f3c2a10-1111-4222-8333-944455556666'), '7f3c2a10-1111-4222-8333-944455556666');
  assert.equal(rootTaskId('abc:2026-10-06'), 'abc');
  assert.equal(rootTaskId('abc:2026-10-06:2026-10-13'), 'abc');
  assert.equal(nextOccurrenceId('abc', '2026-10-06'), 'abc:2026-10-06');
  assert.equal(nextOccurrenceId('abc:2026-10-06', '2026-10-07'), 'abc:2026-10-07');
  assert.equal(nextOccurrenceId('abc', '2026-10-06'), nextOccurrenceId('abc', '2026-10-06'));
});

test('buildNextOccurrence copies the details, resets completion and drops the time of day', () => {
  const task: Task = {
    id: 'root1',
    title: 'Water plants',
    dueDate: '2026-10-05',
    priority: 'high',
    projectKey: 'p1',
    notes: 'Kitchen first',
    durationMinutes: 15,
    startTime: '08:00',
    recurrence: 'weekly',
    recurrenceDays: ['Mon', 'Thu'],
    completed: true,
    completedAt: '2026-10-05T08:30:00.000Z',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-10-05T08:30:00.000Z',
    origin: 'dump',
  };
  const built = buildNextOccurrence(task, TODAY, '2026-10-05T09:00:00.000Z')!;
  assert.equal(built.id, 'root1:2026-10-08');
  assert.equal(built.dueDate, '2026-10-08');
  assert.equal(built.title, 'Water plants');
  assert.equal(built.priority, 'high');
  assert.equal(built.projectKey, 'p1');
  assert.equal(built.notes, 'Kitchen first');
  assert.equal(built.durationMinutes, 15);
  assert.equal(built.recurrence, 'weekly');
  assert.deepEqual(built.recurrenceDays, ['Mon', 'Thu']);
  assert.equal(built.completed, false);
  assert.equal(built.completedAt, undefined);
  assert.equal(built.startTime, undefined);
  assert.equal(built.origin, undefined);
  assert.equal(built.createdAt, '2026-10-05T09:00:00.000Z');
  // The next occurrence of the next occurrence keeps the same root.
  assert.equal(buildNextOccurrence({ ...built, completed: true }, TODAY, 'x')!.id, 'root1:2026-10-12');
  assert.equal(buildNextOccurrence({ ...task, recurrence: undefined }, TODAY, 'x'), null);
});
