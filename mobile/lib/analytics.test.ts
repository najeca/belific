// Run with `npm test` from mobile/. Analytics (build plan phase 6).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  brainDumpAge,
  compareText,
  completedCard,
  completedCsv,
  completedIn,
  completedRows,
  daysIn,
  estimateVsActual,
  groupCompleted,
  percentages,
  previousRange,
  rangeFor,
  tasksByLabel,
  timeCard,
  timePerDay,
} from './analytics.ts';
import type { Project, Task } from './types.ts';

const TODAY = '2026-10-16'; // a Friday
const STAMP = '2026-09-01T00:00:00.000Z';
const T = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, completed: false, createdAt: STAMP, updatedAt: STAMP, ...extra });
// Done at local noon of `day`, so the local date is `day` in every time zone.
const done = (id: string, day: string, extra: Partial<Task> = {}): Task => {
  const [y, m, d] = day.split('-').map(Number);
  return T(id, { completed: true, completedAt: new Date(y, m - 1, d, 12).toISOString(), ...extra });
};

test('ranges: work week Mon to Fri, the last N days end today, months count back by the calendar, custom is clamped', () => {
  assert.deepEqual(rangeFor('workWeek', TODAY), { start: '2026-10-12', end: '2026-10-16' });
  assert.deepEqual(rangeFor('workWeek', '2026-10-18'), { start: '2026-10-12', end: '2026-10-16' }, 'a Sunday is still that week');
  assert.deepEqual(rangeFor('last7', TODAY), { start: '2026-10-10', end: TODAY });
  assert.deepEqual(rangeFor('last14', TODAY), { start: '2026-10-03', end: TODAY });
  assert.deepEqual(rangeFor('lastMonth', TODAY), { start: '2026-09-17', end: TODAY });
  assert.deepEqual(rangeFor('last3Months', TODAY), { start: '2026-07-17', end: TODAY });
  assert.deepEqual(rangeFor('lastMonth', '2026-03-31'), { start: '2026-03-01', end: '2026-03-31' }, '31 Mar back a month is 28 Feb, the day after is 1 Mar');
  assert.deepEqual(rangeFor('custom', TODAY, { start: '2026-10-05', end: '2026-10-01' }), { start: '2026-10-01', end: '2026-10-05' }, 'reversed dates are swapped');
  assert.deepEqual(rangeFor('custom', TODAY, {}), { start: TODAY, end: TODAY });
  const long = rangeFor('custom', TODAY, { start: '2020-01-01', end: '2026-10-16' });
  assert.equal(daysIn(long).length, 366);
  assert.equal(daysIn({ start: '2026-10-01', end: '2026-10-03' }).length, 3);
});

test('the previous period is the same length, ending the day before', () => {
  assert.deepEqual(previousRange({ start: '2026-10-10', end: TODAY }), { start: '2026-10-03', end: '2026-10-09' });
  assert.deepEqual(previousRange({ start: '2026-10-16', end: TODAY }), { start: '2026-10-15', end: '2026-10-15' });
  assert.deepEqual(previousRange({ start: '2026-03-01', end: '2026-03-03' }), { start: '2026-02-26', end: '2026-02-28' });
});

test('completed tasks count on the day they were completed; deleted and open ones never', () => {
  const tasks = [done('a', '2026-10-12'), done('b', '2026-10-16'), done('c', '2026-10-09'), T('open'), done('gone', '2026-10-12', { deletedAt: STAMP }), T('nostamp', { completed: true })];
  assert.deepEqual(completedIn(tasks, { start: '2026-10-10', end: TODAY }).map((t) => t.id).sort(), ['a', 'b']);
});

test('the completed card compares with the period before, in neutral words', () => {
  const tasks = [done('a', '2026-10-12'), done('b', '2026-10-14'), done('c', '2026-10-16'), done('p1', '2026-10-05')];
  const card = completedCard(tasks, { start: '2026-10-10', end: TODAY });
  assert.deepEqual([card.current, card.previous], [3, 1]);
  assert.equal(card.text, '3 tasks completed, 2 more than the 7 days before');
  assert.equal(compareText(1, 4, 'the 7 days before'), '1 task completed, 3 fewer than the 7 days before');
  assert.equal(compareText(2, 2, 'the 7 days before'), '2 tasks completed, the same as the 7 days before');
  assert.equal(compareText(0, 0, 'x'), '');
  assert.doesNotMatch(compareText(0, 5, 'x'), /behind|missed|lost|fail|worse|only/i);
});

test('actual against estimated: over completed tasks that have an estimate; null actual is 0', () => {
  const r = { start: '2026-10-10', end: TODAY };
  const tasks = [
    done('a', '2026-10-12', { durationMinutes: 60, actualMinutes: 45 }),
    done('b', '2026-10-13', { durationMinutes: 30 }),
    done('c', '2026-10-14', { actualMinutes: 20 }),
    done('d', '2026-10-15'),
    done('old', '2026-09-01', { durationMinutes: 600, actualMinutes: 600 }),
  ];
  const c = timeCard(tasks, r);
  assert.deepEqual([c.estimated, c.actual, c.withEstimate, c.withoutEstimate], [90, 45, 2, 2]);
  assert.equal(c.text, '0:45 spent of 1:30 estimated');
  assert.equal(timeCard([], r).text, '');
});

test('Brain Dump age: open tasks with no Day and no live list, plus old items; whole days', () => {
  const now = Date.parse('2026-10-16T12:00:00.000Z');
  const iso = (daysAgo: number) => new Date(now - daysAgo * 86400000).toISOString();
  const tasks = [
    T('a', { createdAt: iso(10) }),
    T('b', { createdAt: iso(2) }),
    T('c', { createdAt: iso(30), listKey: 'l1' }),
    T('d', { createdAt: iso(40), dueDate: TODAY }),
    T('e', { createdAt: iso(50), completed: true }),
    T('f', { createdAt: iso(60), deletedAt: STAMP }),
    T('g', { createdAt: iso(20), listKey: 'gone' }),
  ];
  const lists = [{ key: 'l1' }, { key: 'gone', deletedAt: STAMP }];
  const items = [{ id: 'i', title: 'i', notes: '', createdAt: iso(6), updatedAt: iso(6) }];
  const age = brainDumpAge(tasks, items, lists, now);
  assert.deepEqual([age.count, age.oldestDays, age.averageDays], [4, 20, 10], 'a, b, g (its list is gone) and the old item: 10, 2, 20, 6');
  assert.match(age.text, /4 thoughts waiting, 10 days old on average, the oldest 20 days/);
  assert.deepEqual(brainDumpAge([], [], [], now), { count: 0, averageDays: 0, oldestDays: 0, text: '' });
});

test('time per day: one bar for every day of the range, task count and actual minutes', () => {
  const r = { start: '2026-10-12', end: '2026-10-14' };
  const bars = timePerDay([done('a', '2026-10-12', { actualMinutes: 30 }), done('b', '2026-10-12', { actualMinutes: 15 }), done('c', '2026-10-14')], r);
  assert.deepEqual(bars, [
    { day: '2026-10-12', count: 2, minutes: 45 },
    { day: '2026-10-13', count: 0, minutes: 0 },
    { day: '2026-10-14', count: 1, minutes: 0 },
  ]);
});

test('estimated against actual per task: only tasks with either, newest first, capped', () => {
  const r = { start: '2026-10-01', end: TODAY };
  const tasks = [
    done('a', '2026-10-02', { durationMinutes: 30, actualMinutes: 40, emoji: 'E' }),
    done('b', '2026-10-05', { durationMinutes: 60 }),
    done('c', '2026-10-06'),
    ...Array.from({ length: 40 }, (_, i) => done(`m${i}`, '2026-10-10', { durationMinutes: 5 })),
  ];
  const res = estimateVsActual(tasks, r);
  assert.equal(res.bars.length, 30);
  assert.equal(res.more, 12, '42 tasks with a figure, 30 shown');
  assert.ok(!res.bars.some((b) => b.id === 'c'));
  const small = estimateVsActual(tasks.slice(0, 3), r);
  assert.deepEqual(small.bars.map((b) => b.id), ['b', 'a']);
  assert.deepEqual(small.bars[1], { id: 'a', title: 'a', emoji: 'E', estimate: 30, actual: 40 });
});

test('percentages add up to exactly 100', () => {
  assert.deepEqual(percentages([1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(percentages([2, 1]), [67, 33]);
  assert.deepEqual(percentages([5]), [100]);
  assert.deepEqual(percentages([0, 0]), [0, 0]);
  for (const counts of [[7, 7, 7, 7, 7, 7, 7], [1, 2, 3, 4, 5], [13, 1, 1]]) assert.equal(percentages(counts).reduce((a, b) => a + b, 0), 100);
});

test('tasks by label: shares of completed tasks, a deleted label is No label', () => {
  const labels: Project[] = [
    { key: 'w', name: 'Work', emoji: 'W', colorKey: 'sage', createdAt: STAMP, updatedAt: STAMP },
    { key: 'x', name: 'Old', createdAt: STAMP, updatedAt: STAMP, deletedAt: STAMP },
  ];
  const r = { start: '2026-10-01', end: TODAY };
  const shares = tasksByLabel([done('a', '2026-10-02', { projectKey: 'w' }), done('b', '2026-10-03', { projectKey: 'w' }), done('c', '2026-10-04', { projectKey: 'x' }), done('d', '2026-10-05')], r, labels);
  assert.deepEqual(shares.map((s) => [s.name, s.count, s.percent]), [['Work', 2, 50], ['No label', 2, 50]]);
  assert.equal(shares[0].emoji, 'W');
  assert.deepEqual(tasksByLabel([], r, labels), []);
});

test('the completed list: grouped by day or label, and a flat CSV', () => {
  const labels = [{ key: 'w', name: 'Work' }];
  const lists = [{ key: 'l1', name: 'Reading' }];
  const r = { start: '2026-10-01', end: TODAY };
  const rows = completedRows(
    [done('a', '2026-10-12', { title: 'Alpha, one', projectKey: 'w', durationMinutes: 30, actualMinutes: 25 }), done('b', '2026-10-12', { title: '=bad', listKey: 'l1' }), done('c', '2026-10-14', { title: 'Gamma', projectKey: 'w' })],
    r,
    labels,
    lists,
  );
  assert.deepEqual(rows.map((x) => x.id), ['c', 'a', 'b'].sort((p, q) => rows.findIndex((x) => x.id === p) - rows.findIndex((x) => x.id === q)));
  const byDay = groupCompleted(rows, 'day');
  assert.deepEqual(byDay.map((g) => [g.title, g.rows.length]), [['2026-10-14', 1], ['2026-10-12', 2]], 'newest day first');
  assert.deepEqual(byDay[1].actual, 25);
  const byLabel = groupCompleted(rows, 'label');
  assert.deepEqual(byLabel.map((g) => g.title), ['No label', 'Work']);
  assert.equal(groupCompleted(rows, 'none').length, 1);
  const csv = completedCsv(rows, 'none');
  const lines = csv.trim().split('\r\n');
  assert.equal(lines[0], 'Completed on,Completed at,Title,Label,List,Estimated (minutes),Actual (minutes)');
  assert.equal(lines.length, 4);
  assert.ok(csv.includes('"Alpha, one"'));
  assert.ok(csv.includes("'=bad"), 'a title that is a formula is written as text');
  assert.ok(completedCsv(rows, 'day').startsWith('Group,Completed on'));
});

test('many days are grouped so every bar stays readable', async () => {
  const { bucketBars } = await import('./analytics.ts');
  const days = (n: number) => Array.from({ length: n }, (_, i) => ({ day: `d${i}`, count: 1, minutes: 10 }));
  assert.equal(bucketBars(days(7)).length, 7);
  assert.equal(bucketBars(days(31)).length, 31);
  const q = bucketBars(days(92));
  assert.ok(q.length <= 31);
  assert.equal(q.reduce((n, g) => n + g.count, 0), 92, 'nothing is lost in grouping');
  assert.equal(q.reduce((n, g) => n + g.minutes, 0), 920);
  assert.deepEqual([q[0].from, q[q.length - 1].to], ['d0', 'd91']);
  assert.deepEqual(bucketBars([]), []);
});

test('3.8.0: the time card counts a done task inside a done break once, twice with the setting on', () => {
  const r = rangeFor('last7', TODAY);
  const tasks = [
    done('lunch', TODAY, { dueDate: TODAY, startTime: '12:00', durationMinutes: 60, actualMinutes: 50, cutsBelow: true }),
    done('call', TODAY, { dueDate: TODAY, startTime: '12:10', durationMinutes: 20, actualMinutes: 10 }),
  ];
  assert.equal(timeCard(tasks, r).estimated, 60);
  assert.equal(timeCard(tasks, r, true).estimated, 80);
  assert.equal(timeCard(tasks, r).actual, 60, 'actual unchanged');
  assert.equal(timeCard([tasks[1]], r).estimated, 20, 'the break not done: nothing shared');
});
