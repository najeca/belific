// Run with `npm test` from mobile/. Quests (build plan phase 4): sections,
// periods, period streaks, due state, the one tap target, month ends, leap
// years, daylight saving changes and other time zones.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  buildQuests,
  canPlanToday,
  dueNow,
  isScheduled,
  occurrenceFor,
  periodOf,
  periodStreak,
  questsBySection,
  sectionOf,
  seriesDays,
  streakText,
  nextHalfHour,
} from './quests.ts';
import { occursOn, seriesOfRows } from './series.ts';
import type { Task, WeekDay } from './types.ts';
import { fixture } from './quests.test.fixture.ts';

const STAMP = '2026-09-01T00:00:00.000Z';
const T = (id: string, dueDate: string, extra: Partial<Task> = {}): Task => ({ id, title: id, dueDate, completed: false, createdAt: STAMP, updatedAt: STAMP, ...extra });
const done = (id: string, dueDate: string, extra: Partial<Task> = {}) => T(id, dueDate, { completed: true, completedAt: `${dueDate}T09:00:00.000Z`, ...extra });
const skip = (id: string, dueDate: string, extra: Partial<Task> = {}) => T(id, dueDate, { deletedAt: STAMP, ...extra });
const weekly = (days: WeekDay[]) => ({ recurrence: 'weekly' as const, recurrenceDays: days });
const sd = (rows: Task[], legacy?: Set<string>) => seriesDays(rows[0].id.split(':')[0], rows, legacy)!;

test('sections: every rule has one, a rule this version does not know is still shown', () => {
  assert.equal(sectionOf('daily'), 'daily');
  assert.equal(sectionOf('weekly'), 'weekly');
  assert.equal(sectionOf('biweekly'), 'biweekly');
  assert.equal(sectionOf('triweekly'), 'everyFew');
  assert.equal(sectionOf('monthly'), 'monthly');
  assert.equal(sectionOf('annual'), 'annual');
  assert.equal(sectionOf('quarterly_from_the_future'), 'other');
});

test('no repeating task is hidden; ended, deleted and one off tasks are not quests', () => {
  const tasks = [
    T('d', '2026-10-01', { recurrence: 'daily' }),
    T('w', '2026-10-05', weekly(['Mon'])),
    T('b', '2026-10-05', { recurrence: 'biweekly', recurrenceDays: ['Mon'] }),
    T('t', '2026-10-05', { recurrence: 'triweekly', recurrenceDays: ['Mon'] }),
    T('m', '2026-10-05', { recurrence: 'monthly', recurrenceMonthDay: 5 }),
    T('a', '2026-10-05', { recurrence: 'annual' }),
    T('x', '2026-10-05', { recurrence: 'quarterly_from_the_future' as never }),
    T('ended', '2026-10-05'),
    skip('gone', '2026-10-05', { recurrence: undefined }),
    T('plain', '2026-10-05'),
  ];
  const quests = buildQuests(tasks, [], '2026-10-16');
  assert.deepEqual(quests.map((q) => q.root).sort(), ['a', 'b', 'd', 'm', 't', 'w', 'x']);
  assert.deepEqual(
    questsBySection(quests).map((g) => g.section.title),
    ['Daily', 'Weekly', 'Every 2 weeks', 'Every few weeks', 'Monthly', 'Every year', 'Other repeats'],
  );
});

test('periods: weeks run Monday to Sunday; fortnights and 3 weeks count from the series\' own week', () => {
  assert.deepEqual(periodOf('weekly', '2026-10-16', '2026-01-01'), { start: '2026-10-12', end: '2026-10-18' });
  assert.deepEqual(periodOf('weekly', '2026-10-18', '2026-01-01'), { start: '2026-10-12', end: '2026-10-18' });
  assert.deepEqual(periodOf('biweekly', '2026-10-20', '2026-09-28'), { start: '2026-10-12', end: '2026-10-25' });
  assert.deepEqual(periodOf('biweekly', '2026-10-11', '2026-09-28'), { start: '2026-09-28', end: '2026-10-11' });
  assert.deepEqual(periodOf('everyFew', '2026-10-19', '2026-09-28'), { start: '2026-10-19', end: '2026-11-08' });
  assert.deepEqual(periodOf('everyFew', '2026-10-18', '2026-09-28'), { start: '2026-09-28', end: '2026-10-18' });
  // before the anchor too (a week earlier is the previous block)
  assert.deepEqual(periodOf('biweekly', '2026-09-21', '2026-09-28'), { start: '2026-09-14', end: '2026-09-27' });
  assert.deepEqual(periodOf('monthly', '2026-02-10', 'x'), { start: '2026-02-01', end: '2026-02-28' });
  assert.deepEqual(periodOf('monthly', '2028-02-10', 'x'), { start: '2028-02-01', end: '2028-02-29' });
  assert.deepEqual(periodOf('annual', '2026-10-16', 'x'), { start: '2026-01-01', end: '2026-12-31' });
  assert.deepEqual(periodOf('daily', '2026-10-16', 'x'), { start: '2026-10-16', end: '2026-10-16' });
});

test('weekly: a week counts when every scheduled day is done or skipped; a miss resets; the current week waits', () => {
  const base = [
    done('w', '2026-09-28', weekly(['Mon', 'Wed'])),
    done('w:2026-09-30', '2026-09-30', weekly(['Mon', 'Wed'])),
    done('w:2026-10-05', '2026-10-05', weekly(['Mon', 'Wed'])),
    skip('w:2026-10-07', '2026-10-07', weekly(['Mon', 'Wed'])),
    done('w:2026-10-12', '2026-10-12', weekly(['Mon', 'Wed'])),
  ];
  // Friday: this week's Wednesday is not done yet, the week is not over: neutral.
  assert.deepEqual(periodStreak(sd(base), '2026-10-16'), { current: 2, best: 2 });
  const due = dueNow(sd(base), '2026-10-16');
  assert.deepEqual(due, { kind: 'due', text: 'Due this week', targetDay: '2026-10-14' });
  // Wednesday done (late): the week is complete and counts.
  const caught = [...base, done('w:2026-10-14', '2026-10-14', weekly(['Mon', 'Wed']))];
  assert.deepEqual(periodStreak(sd(caught), '2026-10-16'), { current: 3, best: 3 });
  assert.equal(dueNow(sd(caught), '2026-10-16').text, 'Done this week');
  // Next week, Wednesday never done: that week is missed, the run ends quietly.
  assert.deepEqual(periodStreak(sd(base), '2026-10-21'), { current: 0, best: 2 });
  assert.equal(streakText({ ...periodStreak(sd(base), '2026-10-21'), unit: 'weeks' }), 'Best 2 weeks');
});

test('a week where every day was skipped is neutral: it neither counts nor breaks', () => {
  const rows = [
    done('w', '2026-09-28', weekly(['Mon', 'Wed'])),
    done('w:2026-09-30', '2026-09-30', weekly(['Mon', 'Wed'])),
    skip('w:2026-10-05', '2026-10-05', weekly(['Mon', 'Wed'])),
    skip('w:2026-10-07', '2026-10-07', weekly(['Mon', 'Wed'])),
    done('w:2026-10-12', '2026-10-12', weekly(['Mon', 'Wed'])),
    done('w:2026-10-14', '2026-10-14', weekly(['Mon', 'Wed'])),
  ];
  assert.deepEqual(periodStreak(sd(rows), '2026-10-19'), { current: 2, best: 2 });
  const allSkipped = [...rows.slice(0, 4)];
  assert.equal(dueNow(sd(allSkipped), '2026-10-08').text, 'Skipped this week');
});

test('every 2 weeks and every 3 weeks count fortnights and 3 week stretches', () => {
  const bi = (id: string, day: string, f = done) => f(id, day, { recurrence: 'biweekly', recurrenceDays: ['Mon'] });
  const rows = [bi('b', '2026-08-31'), bi('b:2026-09-14', '2026-09-14'), bi('b:2026-09-28', '2026-09-28'), bi('b:2026-10-12', '2026-10-12')];
  assert.deepEqual(periodStreak(sd(rows), '2026-10-20'), { current: 4, best: 4 });
  assert.equal(isScheduled(sd(rows), '2026-10-19'), false, 'the off week');
  assert.equal(dueNow(sd(rows), '2026-10-20').text, 'Done this fortnight');
  const tri = (id: string, day: string, f = done) => f(id, day, { recurrence: 'triweekly', recurrenceDays: ['Fri'] });
  const trows = [tri('t', '2026-09-04'), tri('t:2026-09-25', '2026-09-25'), T('t:2026-10-16', '2026-10-16', { recurrence: 'triweekly', recurrenceDays: ['Fri'] })];
  assert.deepEqual(periodStreak(sd(trows), '2026-10-14'), { current: 2, best: 2 });
  assert.deepEqual(dueNow(sd(trows), '2026-10-14'), { kind: 'next', text: 'Next: Fri', targetDay: '2026-10-16' });
  assert.equal(streakText({ current: 2, best: 2, unit: 'stretches' }), '2 stretches of 3 weeks in a row');
});

test('monthly across month ends: the 31st falls on the last day of shorter months', () => {
  const mo = (id: string, day: string, f = done) => f(id, day, { recurrence: 'monthly', recurrenceMonthDay: 31 });
  const rows = [mo('m', '2026-01-31'), mo('m:2026-02-28', '2026-02-28'), mo('m:2026-03-31', '2026-03-31'), mo('m:2026-04-30', '2026-04-30')];
  const s = sd(rows);
  assert.equal(isScheduled(s, '2026-02-28'), true);
  assert.equal(isScheduled(s, '2026-02-27'), false);
  assert.equal(isScheduled(s, '2026-04-30'), true);
  assert.deepEqual(periodStreak(s, '2026-05-10'), { current: 4, best: 4 });
  assert.equal(dueNow(s, '2026-05-10').text, 'Next: 31 May');
  // a leap year February
  const leap = sd([mo('n', '2028-01-31')]);
  assert.equal(isScheduled(leap, '2028-02-29'), true);
  assert.equal(isScheduled(leap, '2028-02-28'), false);
  // a missed month
  assert.deepEqual(periodStreak(s, '2026-06-02'), { current: 0, best: 4 });
});

test('every year: Feb 29 falls on Feb 28 in other years; years count across leap years', () => {
  const an = (id: string, day: string, f = done) => f(id, day, { recurrence: 'annual', recurrenceMonthDay: 29 });
  const rows = [an('a', '2024-02-29'), an('a:2025-02-28', '2025-02-28'), an('a:2026-02-28', '2026-02-28')];
  const s = sd(rows);
  assert.equal(isScheduled(s, '2027-02-28'), true);
  assert.equal(isScheduled(s, '2028-02-29'), true);
  assert.equal(isScheduled(s, '2028-02-28'), false);
  assert.equal(occursOn({ recurrence: 'annual' }, '2025-02-28', '2024-02-29'), true);
  // the template is now the 2026-02-28 occurrence; the stored 29 keeps the rule on the 29th
  assert.equal(s.series.anchorKey, '2026-02-28');
  assert.deepEqual(periodStreak(s, '2026-10-16'), { current: 3, best: 3 });
  assert.equal(dueNow(s, '2026-10-16').text, 'Done this year');
  // 2027: Feb 28 has passed, not done, the year is not over: neutral, "Due this year"
  assert.deepEqual(periodStreak(s, '2027-03-01'), { current: 3, best: 3 });
  assert.deepEqual(dueNow(s, '2027-03-01'), { kind: 'due', text: 'Due this year', targetDay: '2027-02-28' });
  // 2028: 2027 was missed; the next is the 29th
  assert.deepEqual(periodStreak(s, '2028-01-05'), { current: 0, best: 3 });
  assert.equal(dueNow(s, '2028-01-05').text, 'Next: 29 Feb');
  assert.equal(streakText({ current: 3, best: 3, unit: 'years' }), '3 years in a row');
});

test('a converted routine counts its old ticks as days before its first row', () => {
  const rows = [done('rt_r1', '2026-10-14', { recurrence: 'daily' }), done('rt_r1:2026-10-15', '2026-10-15', { recurrence: 'daily' })];
  const legacy = new Set(['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13']);
  const quests = buildQuests(rows, [...legacy].map((date) => ({ routineId: 'r1', date })), '2026-10-16');
  assert.equal(quests.length, 1);
  assert.equal(quests[0].section, 'daily');
  assert.equal(quests[0].current, 6);
  assert.equal(quests[0].due.text, 'Due today');
  assert.equal(streakText(quests[0]), '6 days in a row');
  // a gap in the old ticks ends the run there
  const gap = buildQuests(rows, ['2026-10-10', '2026-10-12', '2026-10-13'].map((date) => ({ routineId: 'r1', date })), '2026-10-16');
  assert.deepEqual([gap[0].current, gap[0].best], [4, 4]);
});

test('one tap: today first, else the earliest undone day this period, else the next one this period', () => {
  const rows = [T('f', '2026-10-02', weekly(['Fri']))];
  const s = sd(rows);
  // Wednesday: Friday is next, done early
  assert.deepEqual(dueNow(s, '2026-10-14'), { kind: 'next', text: 'Next: Fri', targetDay: '2026-10-16' });
  const target = occurrenceFor(rows, s.series, '2026-10-16');
  assert.equal(target.stored, false);
  assert.equal(target.task.id, 'f:2026-10-16');
  assert.equal(dueNow(s, '2026-10-16').text, 'Due today');
  // a stored root row stands for its own day
  assert.deepEqual(occurrenceFor(rows, s.series, '2026-10-02'), { task: rows[0], stored: true });
  // monthly next date
  assert.equal(dueNow(sd([T('m', '2026-09-20', { recurrence: 'monthly', recurrenceMonthDay: 20 })]), '2026-10-16').text, 'Next: 20 Oct');
});

test('an occurrence moved to another day counts on its own day and never moves the rule', () => {
  // Friday's occurrence put on Wednesday's plan and done there.
  const rows = [
    done('f', '2026-10-02', { recurrence: 'biweekly', recurrenceDays: ['Fri'] }),
    done('f:2026-10-16', '2026-10-14', { recurrence: 'biweekly', recurrenceDays: ['Fri'] }),
  ];
  const series = seriesOfRows('f', rows)!;
  assert.equal(series.template.id, 'f:2026-10-16');
  assert.equal(series.anchorKey, '2026-10-16', 'the template stands for its own day');
  assert.equal(occursOn(series.template, '2026-10-30', series.anchorKey), true);
  assert.equal(occursOn(series.template, '2026-10-23', series.anchorKey), false);
  const s = sd(rows);
  assert.equal(s.marks.get('2026-10-16'), 'done');
  assert.equal(s.marks.get('2026-10-14'), undefined);
  assert.deepEqual(periodStreak(s, '2026-10-20'), { current: 2, best: 2 });
});

test('wording: current and best only, never a zero', () => {
  assert.equal(streakText({ current: 0, best: 0, unit: 'days' }), null);
  assert.equal(streakText({ current: 1, best: 1, unit: 'days' }), '1 day in a row');
  assert.equal(streakText({ current: 2, best: 5, unit: 'weeks' }), '2 weeks in a row · best 5');
  assert.equal(streakText({ current: 0, best: 5, unit: 'months' }), 'Best 5 months');
  for (const u of ['days', 'weeks', 'fortnights', 'stretches', 'months', 'years', 'times'] as const) {
    for (const [c, b] of [[0, 0], [0, 3], [2, 3], [1, 1]]) {
      const t = streakText({ current: c, best: b, unit: u }) ?? '';
      assert.doesNotMatch(t, /\b0\b|lost|broke|missed|behind|overdue|risk|fail/i, t);
    }
  }
});

test('putting a quest on today: only an occurrence, never the root row, never one already today', () => {
  const rows = [T('f', '2026-10-02', weekly(['Fri']))];
  const [q] = buildQuests(rows, [], '2026-10-14');
  assert.equal(canPlanToday(q, '2026-10-14'), true);
  const [onDay] = buildQuests(rows, [], '2026-10-16');
  assert.equal(canPlanToday(onDay, '2026-10-16'), false, 'already today');
  const [rootDay] = buildQuests([T('g', '2026-10-16', weekly(['Fri']))], [], '2026-10-14');
  assert.equal(rootDay.target?.task.id, 'g');
  assert.equal(canPlanToday(rootDay, '2026-10-14'), false, 'the root row would move the rule');
});

// ---- daylight saving changes and other time zones ----
// The same rows and the same date give the same quests in every zone, through
// every clock change of 2026 (Europe 29 Mar and 25 Oct, the US 8 Mar and 1 Nov,
// New Zealand 5 Apr and 27 Sep, Lord Howe's half hour change), whatever time of
// day or zone the ticks were made in.
const summary = (rows: Task[], today: string) =>
  buildQuests(rows, [], today).map((q) => ({ root: q.root, current: q.current, best: q.best, due: q.due, target: q.target?.task.id ?? null }));

test('daylight saving: runs straight through every clock change (the skipped 29 Mar is neutral)', () => {
  const rows = fixture();
  const out = summary(rows, '2026-11-11');
  const daily = out.find((q) => q.root === 'd')!;
  // 1 Mar to 10 Nov is 255 days, one skipped: 254 done in a row.
  assert.equal(daily.current, 254);
  assert.equal(daily.best, 254);
  const weeklyQ = out.find((q) => q.root === 'w')!;
  assert.equal(weeklyQ.best, 5, 'weeks of 2, 9, 16, 23 and 30 Mar (Mon and Sun across 29 Mar)');
  const monthly = out.find((q) => q.root === 'mo')!;
  assert.equal(monthly.current, 10);
});

test('another time zone: identical quests in London, New York, Auckland, Lord Howe and Kolkata', () => {
  const here = JSON.stringify([summary(fixture(), '2026-11-11'), summary(fixture(), '2026-03-30'), summary(fixture(), '2026-10-26')]);
  const url = pathToFileURL(path.join(import.meta.dirname, 'quests.ts')).href;
  const furl = pathToFileURL(path.join(import.meta.dirname, 'quests.test.fixture.ts')).href;
  for (const tz of ['Europe/London', 'America/New_York', 'Pacific/Auckland', 'Australia/Lord_Howe', 'Asia/Kolkata']) {
    const code = `const q = await import(${JSON.stringify(url)}); const f = await import(${JSON.stringify(furl)});
      const s = (today) => q.buildQuests(f.fixture(), [], today).map((x) => ({ root: x.root, current: x.current, best: x.best, due: x.due, target: x.target ? x.target.task.id : null }));
      process.stdout.write(JSON.stringify([s('2026-11-11'), s('2026-03-30'), s('2026-10-26')]));`;
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, TZ: tz }, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, here, tz);
  }
});

test('the Timebox slot from the Quests screen is the next half hour, never past 23:30', () => {
  assert.equal(nextHalfHour(new Date(2026, 9, 16, 9, 0)), '09:30');
  assert.equal(nextHalfHour(new Date(2026, 9, 16, 9, 10)), '09:30');
  assert.equal(nextHalfHour(new Date(2026, 9, 16, 9, 29)), '09:30');
  assert.equal(nextHalfHour(new Date(2026, 9, 16, 9, 30)), '10:00');
  assert.equal(nextHalfHour(new Date(2026, 9, 16, 23, 50)), '23:30');
});

test('a done period can be reopened from the quest: the latest done occurrence of the period', () => {
  const rows = [done('w', '2026-10-05', weekly(['Mon', 'Wed'])), done('w:2026-10-12', '2026-10-12', weekly(['Mon', 'Wed'])), done('w:2026-10-14', '2026-10-14', weekly(['Mon', 'Wed']))];
  const [q] = buildQuests(rows, [], '2026-10-16');
  assert.equal(q.due.kind, 'done');
  assert.equal(q.undo?.id, 'w:2026-10-14');
  assert.equal(q.target, null);
});
