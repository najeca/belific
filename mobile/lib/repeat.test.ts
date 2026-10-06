// Run with `npm test` from mobile/. Repeat control and next occurrence
// (checkpoint 4.2). 2026-10-05 is a Monday.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REPEAT_CHOICES,
  WEEKDAY_SET,
  WEEKEND_SET,
  alignToDays,
  effectiveDays,
  formatDayList,
  monthDayOf,
  ordinal,
  repeatKindOf,
  repeatSummary,
  resolveRepeat,
  shortRepeat,
  toggleDay,
} from './repeat.ts';
import { buildNextOccurrence, nextOccurrence } from './recurrence.ts';
import type { Task, WeekDay } from './types.ts';

const MON = '2026-10-05';
const WED = '2026-10-07';
const FRI = '2026-10-09';
const SUN = '2026-10-11';
const WFS: WeekDay[] = ['Wed', 'Fri', 'Sun'];

const nx = (task: Partial<Task>, today: string) => nextOccurrence(task, today);

test('choices never say a bare Weekly', () => {
  assert.deepEqual(REPEAT_CHOICES.map((c) => c.label), ['Does not repeat', 'Every day', 'Specific days', 'Every 2 weeks', 'Monthly']);
  assert.ok(!REPEAT_CHOICES.some((c) => c.label === 'Weekly'));
});

test('multiple weekday selection, in week order', () => {
  let days: WeekDay[] = [];
  days = toggleDay(days, 'Sun');
  days = toggleDay(days, 'Wed');
  days = toggleDay(days, 'Fri');
  assert.deepEqual(days, ['Wed', 'Fri', 'Sun']);
  assert.deepEqual(toggleDay(days, 'Fri'), ['Wed', 'Sun']);
  assert.deepEqual(WEEKDAY_SET, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  assert.deepEqual(WEEKEND_SET, ['Sat', 'Sun']);
  assert.equal(formatDayList(['Sun', 'Wed', 'Fri']), 'Wed, Fri and Sun');
  assert.equal(formatDayList(['Thu', 'Mon']), 'Mon and Thu');
  assert.equal(formatDayList(['Tue']), 'Tue');
});

test('next occurrence, specific days Wed Fri Sun', () => {
  const t = { dueDate: WED, recurrence: 'weekly' as const, recurrenceDays: WFS };
  // Completing a Wednesday task on Wednesday gives Friday
  assert.equal(nx(t, WED), FRI);
  // Completing it early (on Monday) still gives the next listed day after its own Day
  assert.equal(nx(t, MON), FRI);
  // Completing it two days late (Friday) gives Sunday, never a past date
  assert.equal(nx(t, FRI), SUN);
  // The Friday occurrence completed on Friday gives Sunday
  assert.equal(nx({ ...t, dueDate: FRI }, FRI), SUN);
  // Sunday wraps to next Wednesday
  assert.equal(nx({ ...t, dueDate: SUN }, SUN), '2026-10-14');
  // Day-less: counts from today
  assert.equal(nx({ ...t, dueDate: undefined }, MON), WED);
});

test('next occurrence, every 2 weeks on Mon and Thu', () => {
  const t = { dueDate: MON, recurrence: 'biweekly' as const, recurrenceDays: ['Mon', 'Thu'] as WeekDay[] };
  assert.equal(nx(t, MON), '2026-10-08'); // Thu of the same (on) week
  assert.equal(nx({ ...t, dueDate: '2026-10-08' }, '2026-10-08'), '2026-10-19'); // skips the off week
  // Done late, in the off week: next is the Monday of the following on week
  assert.equal(nx({ ...t, dueDate: '2026-10-08' }, '2026-10-14'), '2026-10-19');
  // Done very late, inside the next on week: the Thu of that week
  assert.equal(nx({ ...t, dueDate: '2026-10-08' }, '2026-10-20'), '2026-10-22');
});

test('next occurrence, monthly keeps its date and clamps to month end', () => {
  const m = (dueDate: string, today: string, md?: number) =>
    nx({ dueDate, recurrence: 'monthly', recurrenceMonthDay: md }, today);
  assert.equal(m('2026-10-14', '2026-10-14', 14), '2026-11-14');
  assert.equal(m('2027-01-31', '2027-01-31', 31), '2027-02-28');
  assert.equal(m('2027-02-28', '2027-02-28', 31), '2027-03-31'); // back to the 31st
  assert.equal(m('2028-01-31', '2028-01-31', 31), '2028-02-29'); // leap year
  assert.equal(m('2026-10-14', '2026-10-20', 14), '2026-11-14'); // done late
  assert.equal(m('2026-10-14', '2026-10-02', 14), '2026-11-14'); // done early
  // Legacy monthly without recurrenceMonthDay uses the Day's number
  assert.equal(m('2026-08-31', '2026-08-31'), '2026-09-30');
});

test('the next occurrence carries the repeat fields', () => {
  const task = {
    id: 'r1',
    title: 'Bins',
    dueDate: '2027-01-31',
    recurrence: 'monthly',
    recurrenceMonthDay: 31,
    completed: true,
    createdAt: '',
    updatedAt: '',
  } as Task;
  const next = buildNextOccurrence(task, '2027-01-31', 'now')!;
  assert.equal(next.dueDate, '2027-02-28');
  assert.equal(next.recurrenceMonthDay, 31);
  assert.equal(next.id, 'r1:2027-02-28');
  assert.equal(buildNextOccurrence(next, '2027-02-28', 'now')!.dueDate, '2027-03-31');
});

test('legacy values', () => {
  // weekly with days shows its days; with none, the weekday of its Day
  assert.deepEqual(effectiveDays({ recurrenceDays: ['Fri', 'Mon'], dueDate: WED }, MON), ['Mon', 'Fri']);
  assert.deepEqual(effectiveDays({ recurrenceDays: [], dueDate: WED }, MON), ['Wed']);
  assert.deepEqual(effectiveDays({ dueDate: undefined }, FRI), ['Fri']);
  // a legacy weekly with no days repeats on its Day's weekday, even done late
  assert.equal(nx({ dueDate: MON, recurrence: 'weekly' }, MON), '2026-10-12');
  assert.equal(nx({ dueDate: MON, recurrence: 'weekly' }, WED), '2026-10-12');
  assert.equal(repeatKindOf('weekly'), 'days');
  assert.equal(repeatKindOf('triweekly'), 'biweekly');
  assert.equal(repeatKindOf(undefined), 'none');
  assert.equal(shortRepeat({ recurrence: 'weekly', dueDate: WED }, MON), 'Wed');
  assert.equal(shortRepeat({ recurrence: 'weekly', recurrenceDays: WFS }, MON), 'Wed Fri Sun');
  assert.equal(shortRepeat({ recurrence: 'biweekly', recurrenceDays: ['Mon', 'Thu'] }, MON), 'Every 2 wks Mon Thu');
  assert.equal(shortRepeat({ recurrence: 'daily' }, MON), 'Every day');
  assert.equal(shortRepeat({ recurrence: 'monthly', dueDate: '2026-10-14' }, MON), 'Monthly 14th');
  assert.equal(shortRepeat({}, MON), undefined);
});

test('the Day moves to the next chosen weekday on or after it', () => {
  assert.equal(alignToDays(MON, WFS), WED);
  assert.equal(alignToDays(WED, WFS), WED);
  assert.equal(alignToDays('2026-10-12', ['Sun']), '2026-10-18');
  const r = resolveRepeat('days', WFS, MON, MON)!;
  assert.equal(r.dueDate, WED);
  assert.equal(r.movedFrom, MON);
  assert.deepEqual(r.recurrenceDays, WFS);
  // Day-less stays Day-less
  assert.equal(resolveRepeat('days', WFS, undefined, MON)!.dueDate, undefined);
  // No day chosen: incomplete
  assert.equal(resolveRepeat('days', [], MON, MON), null);
  assert.equal(resolveRepeat('biweekly', [], MON, MON), null);
  // Monthly stores the date number
  assert.equal(resolveRepeat('monthly', [], '2026-10-14', MON)!.recurrenceMonthDay, 14);
  assert.equal(resolveRepeat('monthly', [], '2027-02-28', MON, 31)!.recurrenceMonthDay, 31);
  assert.equal(resolveRepeat('monthly', [], '2027-03-15', MON, 31)!.recurrenceMonthDay, 15);
  assert.equal(resolveRepeat('none', WFS, MON, MON)!.recurrence, undefined);
});

test('summary text says exactly what will happen', () => {
  assert.equal(repeatSummary('none', [], MON, MON), 'Does not repeat');
  assert.equal(repeatSummary('daily', [], MON, MON), 'Repeats every day');
  assert.equal(repeatSummary('days', WFS, WED, MON), 'Repeats every Wed, Fri and Sun');
  assert.equal(repeatSummary('days', WFS, MON, MON), 'Repeats every Wed, Fri and Sun, starts Wed 7 Oct');
  assert.equal(repeatSummary('days', WFS, undefined, MON), 'Repeats every Wed, Fri and Sun');
  assert.equal(repeatSummary('days', [], MON, MON), 'Choose at least one day');
  assert.equal(repeatSummary('days', WEEKDAY_SET, MON, MON), 'Repeats every weekday (Mon to Fri)');
  assert.equal(repeatSummary('days', WEEKEND_SET, undefined, MON), 'Repeats every weekend (Sat and Sun)');
  assert.equal(repeatSummary('biweekly', ['Mon', 'Thu'], MON, MON), 'Repeats every other week on Mon and Thu');
  assert.equal(repeatSummary('monthly', [], '2026-10-14', MON), 'Repeats on the 14th of every month');
  assert.equal(
    repeatSummary('monthly', [], '2026-10-31', MON),
    'Repeats on the 31st of every month (the last day in shorter months)',
  );
  assert.equal(repeatSummary('monthly', [], undefined, MON), 'Repeats on the 5th of every month, counted from today (no Day set)');
  for (const kind of ['days', 'biweekly'] as const) assert.ok(!/Weekly/.test(repeatSummary(kind, WFS, MON, MON)));
});

test('ordinals', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal), [
    '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '31st',
  ]);
  assert.equal(monthDayOf({ recurrenceMonthDay: 31, dueDate: '2027-02-28' }, MON), 31);
  assert.equal(monthDayOf({ recurrenceMonthDay: 31, dueDate: '2027-02-27' }, MON), 27);
});
