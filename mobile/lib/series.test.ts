// Run with `npm test` from mobile/. Repeating tasks as series (checkpoint 8.4).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deleteSeriesRows,
  endSeriesRows,
  groupByRoot,
  idDate,
  isUpcomingOccurrence,
  occursOn,
  occurrenceFromTemplate,
  planSkip,
  projectOccurrences,
  seriesEditTargets,
  seriesOf,
  templatePatch,
  templateSubtasks,
} from './series.ts';
import { buildColumnDays, bucketTasks, dateKey, addDays, parseDateKey } from './kanban.ts';
import { mergeRows } from './syncCore.ts';
import type { Task } from './types.ts';

// 2026-10-07 is a Wednesday.
const TODAY = '2026-10-07';
const NOW = '2026-10-07T09:00:00.000Z';

function row(id: string, extra: Partial<Task> = {}): Task {
  return { id, title: 'Series', completed: false, createdAt: '2026-10-01T08:00:00.000Z', updatedAt: '2026-10-06T08:00:00.000Z', ...extra };
}
const keys = (from: string, n: number) => Array.from({ length: n }, (_, i) => dateKey(addDays(parseDateKey(from), i)));
const dates = (list: Task[]) => list.map((t) => t.dueDate);
const WEEK = keys(TODAY, 7); // Wed 7 to Tue 13

// ---- the rule ----

test('daily: every day from today', () => {
  const rows = [row('d', { dueDate: TODAY, recurrence: 'daily' })];
  // The stored row is today: the other six days are projected
  assert.deepEqual(dates(projectOccurrences(rows, WEEK, TODAY)), WEEK.slice(1));
});

test('daily series with nothing stored for today projects today too', () => {
  const rows = [row('d', { dueDate: '2026-10-05', completed: true, completedAt: '2026-10-05T10:00:00.000Z', recurrence: 'daily' })];
  assert.deepEqual(dates(projectOccurrences(rows, WEEK, TODAY)), WEEK);
});

test('weekly: only the chosen weekdays', () => {
  const rows = [row('w', { dueDate: '2026-10-05', completed: true, recurrence: 'weekly', recurrenceDays: ['Mon', 'Thu', 'Sat'] })];
  // Thu 8, Sat 10 (Mon 12 too, in the next days)
  assert.deepEqual(dates(projectOccurrences(rows, keys(TODAY, 8), TODAY)), ['2026-10-08', '2026-10-10', '2026-10-12']);
});

test('weekly with no days stored repeats on the weekday of the Day', () => {
  const rows = [row('w', { dueDate: '2026-10-07', recurrence: 'weekly' })]; // a Wednesday
  assert.deepEqual(dates(projectOccurrences(rows, keys(TODAY, 15), TODAY)), ['2026-10-14', '2026-10-21']);
});

test('every 2 weeks: only the "on" weeks, counted from the series anchor Day', () => {
  // Anchor Mon 5 Oct: weeks of 5 Oct, 19 Oct, 2 Nov are on
  const rows = [row('b', { dueDate: '2026-10-05', completed: true, recurrence: 'biweekly', recurrenceDays: ['Mon', 'Wed'] })];
  const out = dates(projectOccurrences(rows, keys(TODAY, 30), TODAY));
  assert.deepEqual(out, ['2026-10-07', '2026-10-19', '2026-10-21', '2026-11-02', '2026-11-04']);
  // The next week (12 and 14 Oct) is off
  assert.equal(out.includes('2026-10-12'), false);
  assert.equal(out.includes('2026-10-14'), false);
});

test('every 2 weeks keeps its anchor from the template Day, not from today', () => {
  // The template is dated 14 Oct: weeks of 12 Oct, 26 Oct are on, 19 Oct is off; 5 Oct week is on as well.
  const rows = [row('b', { dueDate: '2026-10-14', recurrence: 'biweekly', recurrenceDays: ['Wed'] })];
  assert.equal(occursOn(rows[0], '2026-10-28', '2026-10-14'), true);
  assert.equal(occursOn(rows[0], '2026-10-21', '2026-10-14'), false);
  assert.equal(occursOn(rows[0], '2026-10-07', '2026-10-14'), false); // the week before the anchor is off
  assert.equal(occursOn(rows[0], '2026-09-30', '2026-10-14'), true); // two weeks before is on
});

test('monthly on the 31st clamps to the last day of shorter months', () => {
  const rows = [row('m', { dueDate: '2026-10-31', recurrence: 'monthly', recurrenceMonthDay: 31 })];
  const out = dates(projectOccurrences(rows, keys('2026-11-01', 160), '2026-11-01'));
  assert.deepEqual(out, ['2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28', '2027-03-31']);
  // A leap year February
  assert.equal(occursOn(rows[0], '2028-02-29', '2026-10-31'), true);
  assert.equal(occursOn(rows[0], '2028-02-28', '2026-10-31'), false);
});

test('monthly on the 15th falls on the 15th', () => {
  const rows = [row('m', { dueDate: '2026-10-15', recurrence: 'monthly', recurrenceMonthDay: 15 })];
  assert.deepEqual(dates(projectOccurrences(rows, keys('2026-10-08', 60), TODAY)), ['2026-11-15']);
});

// ---- never in the past, never before the series, never duplicated ----

test('nothing is projected before today, even when asked for past days', () => {
  const rows = [row('d', { dueDate: '2026-10-01', completed: true, recurrence: 'daily' })];
  const out = dates(projectOccurrences(rows, ['2026-10-04', '2026-10-05', '2026-10-06', TODAY, '2026-10-08'], TODAY));
  assert.deepEqual(out, [TODAY, '2026-10-08']);
});

test('nothing is projected before the series started', () => {
  const rows = [row('d', { dueDate: '2026-10-12', recurrence: 'daily' })];
  assert.deepEqual(dates(projectOccurrences(rows, WEEK, TODAY)), ['2026-10-13']);
});

test('a day that has a stored occurrence shows the stored one, never a duplicate', () => {
  const rows = [
    row('d', { dueDate: '2026-10-05', completed: true, recurrence: 'daily' }),
    row('d:2026-10-08', { dueDate: '2026-10-08', completed: true, recurrence: 'daily' }),
  ];
  const out = dates(projectOccurrences(rows, WEEK, TODAY));
  assert.equal(out.includes('2026-10-08'), false);
  assert.equal(out.length, 6);
  // The board shows exactly one card for that day
  const days = buildColumnDays(parseDateKey(TODAY), 7);
  const cols = bucketTasks(rows, days, TODAY, { projected: projectOccurrences(rows, WEEK, TODAY) });
  assert.equal(cols.days['2026-10-08'].length, 1);
  assert.equal(cols.days['2026-10-08'][0].projected, undefined);
});

test('an occurrence that was moved to another Day still takes its own date (no duplicate on either day)', () => {
  const rows = [
    row('d', { dueDate: '2026-10-05', completed: true, recurrence: 'daily' }),
    row('d:2026-10-08', { dueDate: '2026-10-10', recurrence: 'daily' }),
  ];
  const out = dates(projectOccurrences(rows, WEEK, TODAY));
  assert.equal(out.includes('2026-10-08'), false); // its id date is taken
  assert.equal(out.includes('2026-10-10'), false); // its Day is taken
});

test('a past stored occurrence that was not completed is not carried forward or projected', () => {
  const rows = [
    row('d', { dueDate: '2026-10-04', completed: true, recurrence: 'daily' }),
    row('d:2026-10-05', { dueDate: '2026-10-05', recurrence: 'daily' }), // never completed
  ];
  const out = projectOccurrences(rows, WEEK, TODAY);
  assert.equal(dates(out).includes('2026-10-05'), false);
  // And the board does not surface the unfinished repeating row as overdue in Today
  const days = buildColumnDays(parseDateKey(TODAY), 7);
  const cols = bucketTasks(rows, days, TODAY, { projected: out });
  assert.equal(cols.days[TODAY].some((i) => i.task.id === 'd:2026-10-05'), false);
  assert.equal(cols.days[TODAY].length, 1);
  assert.equal(cols.days[TODAY][0].projected, true);
});

test('a non repeating unfinished past task still surfaces as overdue (unchanged)', () => {
  const rows = [row('x', { dueDate: '2026-10-05' })];
  const days = buildColumnDays(parseDateKey(TODAY), 7);
  assert.equal(bucketTasks(rows, days, TODAY, { projected: [] }).days[TODAY].length, 1);
});

test('a skipped day is blocked by its tombstone; other days still project', () => {
  const rows = [
    row('d', { dueDate: '2026-10-05', completed: true, recurrence: 'daily' }),
    row('d:2026-10-09', { dueDate: '2026-10-09', recurrence: 'daily', deletedAt: NOW }),
  ];
  const out = dates(projectOccurrences(rows, WEEK, TODAY));
  assert.equal(out.includes('2026-10-09'), false);
  assert.deepEqual(out, ['2026-10-07', '2026-10-08', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13']);
});

test('a skip tombstone dated after every live row does not become the template or end the series', () => {
  const live = row('d', { dueDate: '2026-10-05', completed: true, recurrence: 'daily', title: 'Live title' });
  const skip = row('d:2026-10-20', { dueDate: '2026-10-20', recurrence: 'daily', deletedAt: NOW, title: 'Stale skip title' });
  const s = seriesOf([live, skip], 'd')!;
  assert.equal(s.template.id, 'd');
  const out = projectOccurrences([live, skip], WEEK, TODAY);
  assert.equal(out.length, 7);
  assert.ok(out.every((t) => t.title === 'Live title'));
});

test('skipping the latest day: the series continues', () => {
  // Today's stored occurrence is the latest live row; skipping tombstones it.
  const rows = [
    row('d', { dueDate: '2026-10-05', completed: true, recurrence: 'daily', title: 'Old name' }),
    row('d:2026-10-07', { dueDate: TODAY, recurrence: 'daily', title: 'Edited name' }),
  ];
  const plan = planSkip(rows, TODAY, NOW)!;
  assert.equal(plan.tombstone.id, 'd:2026-10-07');
  assert.equal(plan.tombstone.deletedAt, NOW);
  // The edit that row carried moves onto the older row that takes over
  assert.deepEqual(plan.templatePatch && plan.templatePatch.id, 'd');
  assert.equal(plan.templatePatch!.fields.title, 'Edited name');
  // Apply the plan
  const after = rows.map((r) => (r.id === plan.tombstone.id ? plan.tombstone : r.id === plan.templatePatch!.id ? { ...r, ...plan.templatePatch!.fields } : r));
  const out = projectOccurrences(after, WEEK, TODAY);
  assert.deepEqual(dates(out), WEEK.slice(1)); // today stays skipped, the rest continue
  assert.ok(out.every((t) => t.title === 'Edited name'));
  // the older row is still completed
  assert.equal(after.find((r) => r.id === 'd')!.completed, true);
});

test('skipping the only row keeps the series alive (the tombstone is the template of last resort)', () => {
  const rows = [row('d', { dueDate: TODAY, recurrence: 'daily', title: 'Only' })];
  const plan = planSkip(rows, TODAY, NOW)!;
  assert.equal(plan.templatePatch, undefined);
  const after = [plan.tombstone];
  const out = projectOccurrences(after, WEEK, TODAY);
  assert.deepEqual(dates(out), WEEK.slice(1));
  assert.equal(out[0].title, 'Only');
});

test('skipping a projected day writes a tombstone with that occurrence id and the series rule', () => {
  const rows = [row('d', { dueDate: '2026-10-05', completed: true, recurrence: 'daily' })];
  const plan = planSkip(rows, '2026-10-10', NOW)!;
  assert.equal(plan.tombstone.id, 'd:2026-10-10');
  assert.equal(plan.tombstone.dueDate, '2026-10-10');
  assert.equal(plan.tombstone.deletedAt, NOW);
  assert.equal(plan.tombstone.recurrence, 'daily');
  assert.equal(plan.tombstone.completed, false);
  assert.equal(plan.templatePatch, undefined);
});

test('a completed day cannot be skipped, and a day that is already skipped is not skipped twice', () => {
  const rows = [
    row('d', { dueDate: '2026-10-05', completed: true, recurrence: 'daily' }),
    row('d:2026-10-07', { dueDate: TODAY, completed: true, recurrence: 'daily' }),
    row('d:2026-10-08', { dueDate: '2026-10-08', recurrence: 'daily', deletedAt: NOW }),
  ];
  assert.equal(planSkip(rows, TODAY, NOW), null);
  assert.equal(planSkip(rows, '2026-10-08', NOW), null);
});

// ---- ending a series: it must never come back ----

function apply(rows: Task[], changed: Task[]): Task[] {
  const by = new Map(changed.map((c) => [c.id, c]));
  return rows.map((r) => by.get(r.id) ?? r);
}

test('Does not repeat clears the rule on EVERY row of the root, tombstones included', () => {
  const rows = [
    row('d', { dueDate: '2026-10-05', completed: true, recurrence: 'daily' }),
    row('d:2026-10-06', { dueDate: '2026-10-06', completed: true, recurrence: 'daily' }),
    row('d:2026-10-09', { dueDate: '2026-10-09', recurrence: 'daily', deletedAt: NOW }),
    row('d:2026-10-12', { dueDate: '2026-10-12', recurrence: 'daily' }),
  ];
  const changed = endSeriesRows(rows, NOW);
  assert.equal(changed.length, 4);
  assert.ok(changed.every((r) => !r.recurrence && !r.recurrenceDays && r.recurrenceMonthDay === undefined));
  // Days, completed state and the tombstone are kept
  assert.equal(changed.find((r) => r.id === 'd:2026-10-09')!.deletedAt, NOW);
  assert.equal(changed.find((r) => r.id === 'd')!.completed, true);
  const after = apply(rows, changed);
  assert.equal(seriesOf(after, 'd'), null);
  assert.deepEqual(projectOccurrences(after, WEEK, TODAY), []);
});

test('end the series, then delete its last row: no projections come back', () => {
  const rows = [
    row('d', { dueDate: '2026-10-05', completed: true, recurrence: 'daily' }),
    row('d:2026-10-07', { dueDate: TODAY, recurrence: 'daily' }),
  ];
  let after = apply(rows, endSeriesRows(rows, NOW));
  // the user then deletes the remaining open row
  after = after.map((r) => (r.id === 'd:2026-10-07' ? { ...r, deletedAt: NOW } : r));
  assert.equal(seriesOf(after, 'd'), null);
  assert.deepEqual(projectOccurrences(after, WEEK, TODAY), []);
  // deleting the older one too changes nothing
  after = after.map((r) => ({ ...r, deletedAt: NOW }));
  assert.deepEqual(projectOccurrences(after, WEEK, TODAY), []);
});

test('end the series twice: nothing more to change', () => {
  const rows = [row('d', { dueDate: TODAY, recurrence: 'daily' })];
  const once = apply(rows, endSeriesRows(rows, NOW));
  assert.deepEqual(endSeriesRows(once, NOW), []);
});

test('Delete repeating task: open rows are tombstoned, history rows stay but stop repeating', () => {
  const rows = [
    row('d', { dueDate: '2026-10-05', completed: true, completedAt: '2026-10-05T10:00:00.000Z', recurrence: 'daily' }),
    row('d:2026-10-06', { dueDate: '2026-10-06', completed: true, recurrence: 'daily' }),
    row('d:2026-10-07', { dueDate: TODAY, recurrence: 'daily' }),
    row('d:2026-10-09', { dueDate: '2026-10-09', recurrence: 'daily', deletedAt: '2026-10-06T00:00:00.000Z' }),
  ];
  const changed = deleteSeriesRows(rows, NOW);
  const byId = Object.fromEntries(changed.map((r) => [r.id, r]));
  assert.equal(byId['d:2026-10-07'].deletedAt, NOW);
  assert.equal(byId['d:2026-10-07'].recurrence, undefined);
  assert.equal(byId['d'].deletedAt, undefined); // history stays
  assert.equal(byId['d'].completed, true);
  assert.equal(byId['d'].completedAt, '2026-10-05T10:00:00.000Z');
  assert.equal(byId['d'].recurrence, undefined);
  assert.equal(byId['d:2026-10-09'].deletedAt, '2026-10-06T00:00:00.000Z'); // an older tombstone is kept as it was
  assert.equal(byId['d:2026-10-09'].recurrence, undefined);
  const after = apply(rows, changed);
  assert.deepEqual(projectOccurrences(after, WEEK, TODAY), []);
  assert.equal(seriesOf(after, 'd'), null);
});

test('delete the series on two devices and merge by sync: it stays gone', () => {
  // Both devices start from the same rows, each deletes the series on its own clock.
  const start = [
    row('d', { dueDate: '2026-10-05', completed: true, recurrence: 'daily' }),
    row('d:2026-10-07', { dueDate: TODAY, recurrence: 'daily' }),
    row('d:2026-10-08', { dueDate: '2026-10-08', recurrence: 'daily' }),
  ];
  const a = apply(start, deleteSeriesRows(start, '2026-10-07T09:00:00.000Z'));
  const b = apply(start, deleteSeriesRows(start, '2026-10-07T09:00:05.000Z'));
  const merge = (local: Task[], remote: Task[]) =>
    mergeRows<Task>({ local, remote, keyOf: (r) => r.id, pending: new Map(), preserveFields: [], mode: 'incremental' }).rows;
  for (const merged of [merge(a, b), merge(b, a)]) {
    assert.deepEqual(projectOccurrences(merged, WEEK, TODAY), []);
    assert.equal(seriesOf(merged, 'd'), null);
    assert.ok(merged.filter((r) => r.id !== 'd').every((r) => !!r.deletedAt));
  }
});

test('one device ended the series and the other still has the old rows: the ended rows win on pull', () => {
  const start = [
    row('d', { dueDate: '2026-10-05', completed: true, recurrence: 'daily', updatedAt: '2026-10-06T08:00:00.000Z' }),
    row('d:2026-10-07', { dueDate: TODAY, recurrence: 'daily', updatedAt: '2026-10-06T08:00:00.000Z' }),
  ];
  const ended = apply(start, deleteSeriesRows(start, '2026-10-07T09:00:00.000Z'));
  // The stale device pulls what the ended device pushed
  const merged = mergeRows<Task>({ local: start, remote: ended, keyOf: (r) => r.id, pending: new Map(), preserveFields: [], mode: 'incremental' }).rows;
  assert.deepEqual(projectOccurrences(merged, WEEK, TODAY), []);
});

test('series continue after one occurrence is deleted on another device (a tombstone is just a skip)', () => {
  const rows = [
    row('d', { dueDate: '2026-10-05', completed: true, recurrence: 'daily' }),
    row('d:2026-10-08', { dueDate: '2026-10-08', recurrence: 'daily', deletedAt: NOW }),
  ];
  const out = projectOccurrences(rows, WEEK, TODAY);
  assert.equal(out.length, 6);
  assert.equal(dates(out).includes('2026-10-08'), false);
});

// ---- iPhone style rows ----

test('an iPhone style stored next copy plus the projection never duplicates', () => {
  // The phone completed today's occurrence and created tomorrow's copy the old way.
  const rows = [
    row('d', { dueDate: '2026-10-06', completed: true, recurrence: 'daily' }),
    row('d:2026-10-07', { dueDate: TODAY, completed: true, completedAt: NOW, recurrence: 'daily' }),
    row('d:2026-10-08', { dueDate: '2026-10-08', recurrence: 'daily' }), // created by the phone on completion
  ];
  const projected = projectOccurrences(rows, WEEK, TODAY);
  assert.equal(dates(projected).includes('2026-10-07'), false);
  assert.equal(dates(projected).includes('2026-10-08'), false);
  const days = buildColumnDays(parseDateKey(TODAY), 7);
  const cols = bucketTasks(rows, days, TODAY, { projected });
  for (const d of WEEK) assert.equal(cols.days[d].length, 1, d);
  // The stored Oct 8 row is the latest live row now, and is the template
  assert.equal(seriesOf(rows, 'd')!.template.id, 'd:2026-10-08');
});

test('a legacy repeating task needs no migration: its open row is the template and days after it project', () => {
  const rows = [row('legacy', { dueDate: '2026-10-10', recurrence: 'weekly', recurrenceDays: ['Sat'] })];
  assert.deepEqual(dates(projectOccurrences(rows, keys(TODAY, 20), TODAY)), ['2026-10-17', '2026-10-24']);
});

// ---- the template ignores day state ----

test('the template completed, ticked and timed: projections are never completed and subtasks are unticked', () => {
  const template = row('d', {
    dueDate: TODAY,
    recurrence: 'daily',
    completed: true,
    completedAt: NOW,
    subtasks: [
      { id: 'a', title: 'one', done: true },
      { id: 'b', title: 'two', done: true },
    ],
    startTime: '05:00',
    durationMinutes: 45,
    reminderMinutes: 10,
    projectKey: 'work',
    priority: 'high',
    notes: 'Remember',
  });
  const out = projectOccurrences([template], WEEK, TODAY);
  assert.equal(out.length, 6);
  for (const t of out) {
    assert.equal(t.completed, false);
    assert.equal(t.completedAt, undefined);
    assert.ok(t.subtasks && t.subtasks.length === 2 && t.subtasks.every((s) => s.done === false));
    assert.deepEqual(t.subtasks!.map((s) => s.title), ['one', 'two']);
    assert.equal(t.startTime, '05:00');
    assert.equal(t.durationMinutes, 45);
    assert.equal(t.reminderMinutes, 10);
    assert.equal(t.projectKey, 'work');
    assert.equal(t.priority, 'high');
    assert.equal(t.notes, 'Remember');
    assert.equal(t.id, `d:${t.dueDate}`);
  }
  // The subtask ids are derived from the occurrence id, so ticking maps to the stored copy
  assert.deepEqual(out[0].subtasks!.map((s) => s.id), [`${out[0].id}:s1`, `${out[0].id}:s2`]);
});

test('the template open with ticked subtasks: projections still start unticked', () => {
  const template = row('d', { dueDate: TODAY, recurrence: 'daily', subtasks: [{ id: 'a', title: 'one', done: true }] });
  const out = projectOccurrences([template], keys(TODAY, 2), TODAY);
  assert.equal(out[0].subtasks![0].done, false);
  assert.equal(template.subtasks![0].done, true); // the template itself is untouched
});

test('the template carrying a legacy actual time or other day state does not leak into projections', () => {
  const template = { ...row('d', { dueDate: TODAY, recurrence: 'daily', completed: true, completedAt: NOW }), actualSeconds: 600 } as Task;
  const o = occurrenceFromTemplate(template, '2026-10-09', NOW);
  assert.equal('actualSeconds' in o, false);
  assert.equal(o.completed, false);
  assert.equal(o.completedAt, undefined);
});

// ---- what a card edit patches ----

test('a template edit patches only the edit-able fields and never the Day or the completed state', () => {
  const template = row('d', { dueDate: '2026-10-05', completed: true, completedAt: NOW, recurrence: 'daily', title: 'Old' });
  const fields: Partial<Task> = {
    title: 'New',
    priority: 'high',
    projectKey: 'home',
    notes: 'n',
    durationMinutes: 20,
    startTime: '06:30',
    reminderMinutes: -1,
    dueDate: '2026-10-12',
    completed: false,
    completedAt: undefined,
    createdAt: '2000-01-01T00:00:00.000Z',
    id: 'other',
  };
  const patch = templatePatch(template, fields);
  assert.deepEqual(Object.keys(patch).sort(), ['durationMinutes', 'notes', 'priority', 'projectKey', 'reminderMinutes', 'startTime', 'title']);
  const merged = { ...template, ...patch };
  assert.equal(merged.completed, true);
  assert.equal(merged.completedAt, NOW);
  assert.equal(merged.dueDate, '2026-10-05');
  assert.equal(merged.id, 'd');
  assert.equal(merged.createdAt, template.createdAt);
});

test('a template edit that clears a field is kept as a clear', () => {
  const template = row('d', { dueDate: TODAY, recurrence: 'daily', startTime: '05:00', durationMinutes: 30, projectKey: 'work' });
  const patch = templatePatch(template, { startTime: undefined, durationMinutes: undefined, projectKey: undefined });
  const merged = { ...template, ...patch };
  assert.equal(merged.startTime, undefined);
  assert.equal(merged.durationMinutes, undefined);
  assert.equal(merged.projectKey, undefined);
});

test('editing the subtask list of a completed template keeps every subtask done and the task completed', () => {
  const template = row('d', {
    dueDate: '2026-10-05',
    completed: true,
    recurrence: 'daily',
    subtasks: [
      { id: 'a', title: 'one', done: true },
      { id: 'b', title: 'two', done: true },
    ],
  });
  const edited = [
    { id: 'x1', title: 'one', done: false },
    { id: 'x2', title: 'three', done: false },
  ];
  const patch = templatePatch(template, { subtasks: edited });
  assert.deepEqual(patch.subtasks!.map((s) => [s.title, s.done]), [['one', true], ['three', true]]);
  assert.equal({ ...template, ...patch }.completed, true);
});

test('editing the subtask list of an open template keeps the ticks of subtasks that remain', () => {
  const prev = [
    { id: 'a', title: 'one', done: true },
    { id: 'b', title: 'two', done: false },
    { id: 'c', title: 'one', done: false },
  ];
  const edited = [
    { id: 'x1', title: 'two', done: false },
    { id: 'x2', title: 'one', done: false },
    { id: 'x3', title: 'one', done: false },
    { id: 'x4', title: 'new', done: false },
  ];
  assert.deepEqual(templateSubtasks(prev, edited, false).map((s) => s.done), [false, true, false, false]);
  assert.deepEqual(templateSubtasks(undefined, edited, false).map((s) => s.done), [false, false, false, false]);
});

// ---- series switched to Does not repeat via the template ----

test('changing the template to Does not repeat removes the projections', () => {
  const rows = [row('d', { dueDate: TODAY, recurrence: 'daily' })];
  assert.equal(projectOccurrences(rows, WEEK, TODAY).length, 6);
  const ended = apply(rows, endSeriesRows(rows, NOW));
  assert.equal(projectOccurrences(ended, WEEK, TODAY).length, 0);
});

// ---- identifiers ----

test('idDate reads the date of an occurrence id', () => {
  assert.equal(idDate('abc:2026-10-08'), '2026-10-08');
  assert.equal(idDate('abc'), undefined);
  assert.equal(idDate('abc:nope'), undefined);
});

test('groupByRoot groups an occurrence with its root', () => {
  const g = groupByRoot([row('a'), row('a:2026-10-08'), row('b')]);
  assert.deepEqual([...g.keys()].sort(), ['a', 'b']);
  assert.equal(g.get('a')!.length, 2);
});

test('rows without a Day make no series (a day-less repeating task has nothing to project from)', () => {
  assert.deepEqual(projectOccurrences([row('d', { recurrence: 'daily' })], WEEK, TODAY), []);
});

test('two series do not interfere', () => {
  const rows = [row('a', { dueDate: TODAY, recurrence: 'daily', title: 'A' }), row('b', { dueDate: TODAY, recurrence: 'weekly', recurrenceDays: ['Fri'], title: 'B' })];
  const out = projectOccurrences(rows, WEEK, TODAY);
  assert.equal(out.filter((t) => t.title === 'A').length, 6);
  assert.deepEqual(out.filter((t) => t.title === 'B').map((t) => t.dueDate), ['2026-10-09']);
});

test('a template edit moves with a series whose latest row is a future stored occurrence', () => {
  const rows = [
    row('d', { dueDate: '2026-10-05', completed: true, recurrence: 'daily', title: 'Old' }),
    row('d:2026-10-10', { dueDate: '2026-10-10', completed: true, recurrence: 'daily', title: 'Newest' }),
  ];
  const out = projectOccurrences(rows, WEEK, TODAY);
  assert.ok(out.every((t) => t.title === 'Newest'));
  assert.equal(out.length, 6); // today to the 13th except the 10th
});

// ---- which stored rows a projected card edit is written to ----

test('a template edit reaches the template and every open stored row from today, nothing else', () => {
  const rows = [
    row('d', { dueDate: '2026-10-03', completed: true, recurrence: 'daily' }), // old history
    row('d:2026-10-06', { dueDate: '2026-10-06', recurrence: 'daily' }), // past and open: left alone
    row('d:2026-10-07', { dueDate: TODAY, completed: true, recurrence: 'daily' }), // done today: left alone
    row('d:2026-10-08', { dueDate: '2026-10-08', recurrence: 'daily' }), // open stored: patched
    row('d:2026-10-09', { dueDate: '2026-10-09', recurrence: 'daily', deletedAt: NOW }), // tombstone: left alone
    row('d:2026-10-10', { dueDate: '2026-10-10', completed: true, recurrence: 'daily' }), // latest = template, completed
  ];
  const ids = seriesEditTargets(rows, TODAY).map((r) => r.id).sort();
  assert.deepEqual(ids, ['d:2026-10-08', 'd:2026-10-10']);
});

test('an edit written to a completed template leaves it completed with its completion time', () => {
  const rows = [row('d', { dueDate: '2026-10-05', completed: true, completedAt: NOW, recurrence: 'daily', title: 'Old' })];
  const [target] = seriesEditTargets(rows, TODAY);
  const written = { ...target, ...templatePatch(target, { title: 'New', startTime: '06:00' }) };
  assert.equal(written.title, 'New');
  assert.equal(written.completed, true);
  assert.equal(written.completedAt, NOW);
  assert.equal(written.dueDate, '2026-10-05');
});

test('no targets for an ended series', () => {
  assert.deepEqual(seriesEditTargets([row('d', { dueDate: TODAY })], TODAY), []);
});

test('the tombstone of a skipped occurrence is kept while its day is today or later', () => {
  assert.equal(isUpcomingOccurrence('d:2026-10-07', TODAY), true);
  assert.equal(isUpcomingOccurrence('d:2027-03-01', TODAY), true); // skipped far ahead
  assert.equal(isUpcomingOccurrence('d:2026-10-06', TODAY), false); // a past day: the normal 90 day prune applies
  assert.equal(isUpcomingOccurrence('d', TODAY), false); // an ordinary task id
});
