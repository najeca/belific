// Run with `npm test` from mobile/. Repeat control and next occurrence
// (checkpoint 4.2). 2026-10-05 is a Monday.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REPEAT_CHOICES,
  SHORT_MONTH_NOTE,
  WEEKDAY_SET,
  WEEKEND_SET,
  WEEK_ORDER,
  alignToDays,
  alignToMonthDay,
  allSeven,
  defaultMonthDay,
  effectiveDays,
  formatDayList,
  initialDays,
  monthDayOf,
  ordinal,
  parseMonthDay,
  repeatKindOf,
  repeatLabel,
  repeatSummary,
  switchedKind,
  resolveRepeat,
  ruleFor,
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

test('five choices in order: Does not repeat, Daily, Weekly, Every 2 weeks, Monthly', () => {
  assert.deepEqual(REPEAT_CHOICES.map((c) => c.label), ['Does not repeat', 'Daily', 'Weekly', 'Every 2 weeks', 'Monthly']);
  assert.deepEqual(REPEAT_CHOICES.map((c) => c.kind), ['none', 'daily', 'weekly', 'biweekly', 'monthly']);
});

test('Daily stores recurrence daily with no days or month day, summary and no-Day case', () => {
  const r = resolveRepeat('daily', [], MON, null)!;
  assert.deepEqual(r, { dueDate: MON, recurrence: 'daily', recurrenceDays: undefined, recurrenceMonthDay: undefined });
  assert.equal(repeatSummary('daily', [], MON, null), 'Repeats every day.');
  assert.equal(ruleFor('daily', []), 'daily');
  // no Day: the same rule as the other repeats, the Day stays empty
  assert.equal(resolveRepeat('daily', [], undefined, null)!.dueDate, undefined);
  assert.equal(repeatKindOf('daily'), 'daily');
  assert.equal(repeatLabel('daily', []), 'Daily');
});

test('Weekly with all seven days switches the selection to Daily; fewer days stay Weekly', () => {
  assert.equal(switchedKind('weekly', [...WEEK_ORDER]), 'daily');
  assert.equal(switchedKind('weekly', WEEKDAY_SET), 'weekly');
  assert.equal(switchedKind('biweekly', [...WEEK_ORDER]), 'biweekly');
  assert.equal(switchedKind('monthly', []), 'monthly');
});

test('seven days on Weekly become Daily, and back', () => {
  let days: WeekDay[] = [...WEEKDAY_SET];
  assert.equal(repeatLabel('weekly', days), 'Weekly');
  assert.equal(ruleFor('weekly', days), 'weekly');
  days = toggleDay(toggleDay(days, 'Sat'), 'Sun');
  assert.equal(allSeven(days), true);
  assert.equal(repeatLabel('weekly', days), 'Daily');
  assert.equal(ruleFor('weekly', days), 'daily');
  assert.equal(repeatSummary('weekly', days, MON, null), 'Repeats every day.');
  const saved = resolveRepeat('weekly', days, MON, null)!;
  assert.equal(saved.recurrence, 'daily');
  assert.equal(saved.recurrenceDays, undefined);
  assert.equal(saved.dueDate, MON);
  days = toggleDay(days, 'Wed');
  assert.equal(repeatLabel('weekly', days), 'Weekly');
  assert.equal(resolveRepeat('weekly', days, MON, null)!.recurrence, 'weekly');
  // A stored daily task now opens as Daily
  assert.equal(repeatKindOf('daily'), 'daily');
  assert.deepEqual(initialDays({ recurrence: 'daily' }, MON), WEEK_ORDER);
});

test('Every 2 weeks with all seven days stays Every 2 weeks', () => {
  assert.equal(repeatLabel('biweekly', WEEK_ORDER), 'Every 2 weeks');
  assert.equal(ruleFor('biweekly', WEEK_ORDER), 'biweekly');
  const r = resolveRepeat('biweekly', WEEK_ORDER, MON, null)!;
  assert.equal(r.recurrence, 'biweekly');
  assert.deepEqual(r.recurrenceDays, WEEK_ORDER);
  assert.equal(repeatSummary('biweekly', WEEK_ORDER, MON, null), 'Repeats every day of every other week');
  // Next occurrence: every day of the on week, then skips a week
  const t = { dueDate: SUN, recurrence: 'biweekly' as const, recurrenceDays: WEEK_ORDER };
  assert.equal(nx({ ...t, dueDate: MON }, MON), '2026-10-06');
  assert.equal(nx({ dueDate: '2026-10-04', recurrence: 'biweekly', recurrenceDays: WEEK_ORDER }, '2026-10-04'), '2026-10-12');
});

test('saving is disabled with no days or an invalid month day', () => {
  assert.equal(resolveRepeat('weekly', [], MON, null), null);
  assert.equal(resolveRepeat('biweekly', [], MON, null), null);
  assert.equal(repeatSummary('weekly', [], MON, null), 'Choose at least one day');
  assert.equal(resolveRepeat('monthly', [], MON, null), null);
  assert.equal(repeatSummary('monthly', [], MON, null), 'Enter a day from 1 to 31');
});

test('the Day of the month field accepts 1 to 31 only', () => {
  assert.equal(parseMonthDay('1'), 1);
  assert.equal(parseMonthDay(' 31 '), 31);
  assert.equal(parseMonthDay('07'), 7);
  for (const bad of ['', '0', '32', '2.5', '-1', 'x', '1e1', '100']) assert.equal(parseMonthDay(bad), null, bad);
  assert.equal(defaultMonthDay({ dueDate: '2026-10-14' }), 14);
  assert.equal(defaultMonthDay({ dueDate: '2026-10-14', recurrenceMonthDay: 3 }), 3);
  assert.equal(defaultMonthDay({}), 1);
  assert.equal(defaultMonthDay(undefined), 1);
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
  assert.equal(repeatKindOf('weekly'), 'weekly');
  assert.equal(repeatKindOf('triweekly'), 'biweekly');
  assert.equal(repeatKindOf(undefined), 'none');
  assert.equal(shortRepeat({ recurrence: 'weekly', dueDate: WED }, MON), 'Wed');
  assert.equal(shortRepeat({ recurrence: 'weekly', recurrenceDays: WFS }, MON), 'Wed Fri Sun');
  assert.equal(shortRepeat({ recurrence: 'biweekly', recurrenceDays: ['Mon', 'Thu'] }, MON), 'Every 2 wks Mon Thu');
  assert.equal(shortRepeat({ recurrence: 'daily' }, MON), 'Every day');
  assert.equal(shortRepeat({ recurrence: 'monthly', dueDate: '2026-10-14' }, MON), 'Monthly 14th');
  assert.equal(shortRepeat({}, MON), undefined);
});

test('the Day moves to the next chosen weekday, or month day, on or after it', () => {
  assert.equal(alignToDays(MON, WFS), WED);
  assert.equal(alignToDays(WED, WFS), WED);
  assert.equal(alignToDays('2026-10-12', ['Sun']), '2026-10-18');
  const r = resolveRepeat('weekly', WFS, MON, null)!;
  assert.equal(r.dueDate, WED);
  assert.equal(r.movedFrom, MON);
  assert.deepEqual(r.recurrenceDays, WFS);
  // Day-less stays Day-less
  assert.equal(resolveRepeat('weekly', WFS, undefined, null)!.dueDate, undefined);
  assert.equal(resolveRepeat('monthly', [], undefined, 14)!.dueDate, undefined);
  // Monthly: same month if still ahead, else next month, clamped
  assert.equal(alignToMonthDay('2026-10-05', 14), '2026-10-14');
  assert.equal(alignToMonthDay('2026-10-14', 14), '2026-10-14');
  assert.equal(alignToMonthDay('2026-10-15', 1), '2026-11-01');
  assert.equal(alignToMonthDay('2027-02-10', 31), '2027-02-28');
  const m = resolveRepeat('monthly', [], '2026-10-15', 1)!;
  assert.equal(m.dueDate, '2026-11-01');
  assert.equal(m.recurrenceMonthDay, 1);
  assert.equal(resolveRepeat('none', WFS, MON, null)!.recurrence, undefined);
});

test('summary text says exactly what will happen', () => {
  assert.equal(repeatSummary('none', [], MON, null), 'Does not repeat');
  assert.equal(repeatSummary('weekly', WFS, WED, null), 'Repeats every Wed, Fri and Sun');
  assert.equal(repeatSummary('weekly', WFS, MON, null), 'Repeats every Wed, Fri and Sun, starts Wed 7 Oct');
  assert.equal(repeatSummary('weekly', WFS, undefined, null), 'Repeats every Wed, Fri and Sun');
  assert.equal(repeatSummary('weekly', WEEKDAY_SET, MON, null), 'Repeats every weekday (Mon to Fri)');
  assert.equal(repeatSummary('weekly', WEEKEND_SET, undefined, null), 'Repeats every weekend (Sat and Sun)');
  assert.equal(repeatSummary('biweekly', ['Mon', 'Thu'], MON, null), 'Repeats every other week on Mon and Thu');
  assert.equal(repeatSummary('monthly', [], '2026-10-01', 1), 'Repeats on the 1st of every month');
  assert.equal(repeatSummary('monthly', [], undefined, 1), 'Repeats on the 1st of every month');
  assert.equal(repeatSummary('monthly', [], '2026-10-05', 1), 'Repeats on the 1st of every month, starts Sun 1 Nov');
  assert.equal(repeatSummary('monthly', [], undefined, 31), `Repeats on the 31st of every month. ${SHORT_MONTH_NOTE}`);
  assert.equal(repeatSummary('monthly', [], undefined, 28), 'Repeats on the 28th of every month');
  assert.equal(repeatSummary('monthly', [], undefined, 29).endsWith(SHORT_MONTH_NOTE), true);
  for (const kind of ['weekly', 'biweekly'] as const) assert.ok(!/Weekly/.test(repeatSummary(kind, WFS, MON, null)));
});

test('ordinals', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 24, 30, 31].map(ordinal), [
    '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '24th', '30th', '31st',
  ]);
  assert.equal(monthDayOf({ recurrenceMonthDay: 31, dueDate: '2027-02-28' }, MON), 31);
  // Since 4.3 the stored number always wins (it is an explicit field)
  assert.equal(monthDayOf({ recurrenceMonthDay: 31, dueDate: '2027-02-27' }, MON), 31);
  assert.equal(monthDayOf({ dueDate: '2027-02-27' }, MON), 27);
});
