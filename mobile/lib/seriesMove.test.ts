// Run with `npm test` from mobile/. Moving one day of a repeating task (3.1.0, "this day only").
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deleteSeriesRows,
  isMovedRow,
  movedFrom,
  planMoveDay,
  planSkip,
  projectOccurrences,
  seriesEditTargets,
  seriesOf,
  templatePatch,
  type MovePlan,
} from './series.ts';
import { addDays, bucketTasks, buildColumnDays, dateKey, parseDateKey } from './kanban.ts';
import { mergeRows, taskFromRemote, taskToRemote, type Caps } from './syncCore.ts';
import { seriesDays } from './quests.ts';
import { trashEntries } from './trash.ts';
import type { Task } from './types.ts';

// 2026-10-25 is a Sunday. The weekend shift: Saturday and Sunday, 09:00 for 8 hours.
const TODAY = '2026-10-25';
const NOW = '2026-10-25T10:00:00.000Z';
const FRI = '2026-10-30';
const SAT = '2026-10-31';
const SUN = '2026-11-01';
const NEXT_SAT = '2026-11-07';
const NEXT_SUN = '2026-11-08';

function row(id: string, extra: Partial<Task> = {}): Task {
  return {
    id,
    title: 'Work shift',
    completed: false,
    createdAt: '2026-10-01T08:00:00.000Z',
    updatedAt: '2026-10-20T08:00:00.000Z',
    recurrence: 'weekly',
    recurrenceDays: ['Sat', 'Sun'],
    startTime: '09:00',
    durationMinutes: 480,
    ...extra,
  };
}
const keys = (from: string, n: number) => Array.from({ length: n }, (_, i) => dateKey(addDays(parseDateKey(from), i)));
const DAYS = keys(TODAY, 21);

// The series started last weekend; last Saturday and today (Sunday) are done.
function shift(): Task[] {
  return [
    row('w', { dueDate: '2026-10-24', completed: true, completedAt: '2026-10-24T17:00:00.000Z' }),
    row('w:2026-10-25', { dueDate: TODAY, completed: true, completedAt: '2026-10-25T17:00:00.000Z' }),
  ];
}

function apply(rows: Task[], plan: MovePlan | null): Task[] {
  assert.ok(plan, 'a move was planned');
  const out = [...rows];
  for (const w of plan.writes) {
    const at = out.findIndex((r) => r.id === w.row.id);
    assert.equal(at === -1, w.isNew, `${w.row.id}: isNew matches the stored rows`);
    if (at === -1) out.push(w.row);
    else out[at] = w.row;
  }
  return out;
}

// Every card on each day: stored live rows by their Day plus the projections.
function board(rows: Task[]) {
  const cols = bucketTasks(rows, buildColumnDays(parseDateKey(TODAY), 21), TODAY, { projected: projectOccurrences(rows, DAYS, TODAY) });
  return (day: string) => cols.days[day].map((c) => ({ id: c.task.id, projected: !!c.projected, start: c.task.startTime }));
}

test('Saturday to Friday: only that day moves; it keeps its rule and the other weekends are unchanged', () => {
  const before = projectOccurrences(shift(), DAYS, TODAY).map((t) => t.dueDate);
  const projected = projectOccurrences(shift(), [SAT], TODAY)[0];
  const plan = planMoveDay(shift(), SAT, FRI, NOW);
  assert.equal(plan!.writes.length, 1);
  const moved = plan!.moved;
  assert.equal(moved.id, `w:${SAT}`);
  assert.equal(moved.dueDate, FRI);
  assert.equal(moved.recurrence, 'weekly');
  assert.deepEqual(moved.recurrenceDays, ['Sat', 'Sun']);
  assert.equal(moved.startTime, '09:00');
  assert.equal(moved.completed, false);
  assert.equal(moved.id, projected.id, 'the stored day has the projected card id');
  const rows = apply(shift(), plan);
  const day = board(rows);
  assert.deepEqual(day(FRI), [{ id: `w:${SAT}`, projected: false, start: '09:00' }]);
  assert.deepEqual(day(SAT), []);
  // Every other day of the next three weeks is exactly as before.
  const after = projectOccurrences(rows, DAYS, TODAY).map((t) => t.dueDate);
  assert.deepEqual(after, before.filter((d) => d !== SAT));
  assert.ok(after.includes(SUN) && after.includes(NEXT_SAT) && after.includes(NEXT_SUN));
  assert.equal(isMovedRow(moved), true);
  assert.equal(movedFrom(moved), SAT);
  // The rule is still counted from the template, a Saturday-anchored row.
  assert.equal(seriesOf(rows, 'w')!.template.id, 'w:2026-10-25');
});

test('Saturday to Sunday: Sunday keeps its own shift beside the moved one', () => {
  const rows = apply(shift(), planMoveDay(shift(), SAT, SUN, NOW));
  const day = board(rows);
  assert.deepEqual(day(SAT), []);
  assert.deepEqual(
    day(SUN).map((c) => c.id).sort(),
    [`w:${SAT}`, `w:${SUN}`].sort(),
  );
  assert.equal(day(SUN).find((c) => c.id === `w:${SUN}`)!.projected, true);
});

test('moving the first row: its day is skipped (tombstone with the rule) and the day is stored as a moved copy', () => {
  // A series created for this Saturday: only its first row exists.
  const start = [row('w', { dueDate: SAT, notes: 'Bring the badge', subtasks: [{ id: 's1', title: 'Badge', done: true }] })];
  const plan = planMoveDay(start, SAT, FRI, NOW, { id: 'w' });
  assert.equal(plan!.moved.id, `w:${SAT}`);
  const rows = apply(start, plan);
  const root = rows.find((r) => r.id === 'w')!;
  assert.equal(root.deletedAt, NOW);
  assert.equal(root.recurrence, 'weekly', 'the tombstone keeps its rule, like Skip this day');
  const copy = rows.find((r) => r.id === `w:${SAT}`)!;
  assert.equal(copy.dueDate, FRI);
  assert.equal(copy.notes, 'Bring the badge');
  assert.deepEqual(copy.subtasks, [{ id: 's1', title: 'Badge', done: true }], 'its steps and ticks come along');
  const day = board(rows);
  assert.deepEqual(day(FRI).map((c) => c.id), [`w:${SAT}`]);
  assert.deepEqual(day(SAT), [], 'problem A: the first row\'s own day does not come back');
  assert.equal(day(SUN)[0].projected, true);
  assert.equal(day(NEXT_SAT)[0].projected, true);
  // A planned skip, not a deletion: nothing in the Trash, and not a skipped day for the streak.
  assert.deepEqual(trashEntries(rows, Date.parse(NOW)), []);
  assert.equal(seriesDays('w', rows)!.marks.get(SAT), undefined);
});

test('moving the first row of a weekly task with no weekdays stored keeps it on Saturdays', () => {
  const start = [row('w', { dueDate: SAT, recurrenceDays: undefined })];
  const rows = apply(start, planMoveDay(start, SAT, FRI, NOW, { id: 'w' }));
  const out = projectOccurrences(rows, DAYS, TODAY).map((t) => t.dueDate);
  assert.deepEqual(out, [NEXT_SAT, '2026-11-14']);
});

test('moving the first row when it is the template hands its content to an older live row', () => {
  // An odd history: an older open occurrence and the first row on a later day.
  const start = [row('w:2026-10-24', { dueDate: '2026-10-24', notes: 'old' }), row('w', { dueDate: SAT, notes: 'new' })];
  const plan = planMoveDay(start, SAT, FRI, NOW, { id: 'w' });
  const heir = plan!.writes.find((w) => w.row.id === 'w:2026-10-24');
  assert.equal(heir!.row.notes, 'new');
  assert.equal(heir!.row.dueDate, '2026-10-24');
});

test('problem B: a time change on the moved day stays on that day', () => {
  const rows = apply(shift(), planMoveDay(shift(), SAT, FRI, NOW, { fields: { startTime: '07:00', durationMinutes: 360 } }));
  const moved = rows.find((r) => r.id === `w:${SAT}`)!;
  assert.equal(moved.startTime, '07:00');
  // The moved row is the latest stored row, but never the template.
  assert.equal(seriesOf(rows, 'w')!.template.id, 'w:2026-10-25');
  for (const t of projectOccurrences(rows, DAYS, TODAY)) {
    assert.equal(t.startTime, '09:00', t.dueDate);
    assert.equal(t.durationMinutes, 480, t.dueDate);
  }
});

test('a moved day that is the only live row is the template of last resort', () => {
  const start = [row('w', { dueDate: SAT })];
  const rows = apply(start, planMoveDay(start, SAT, FRI, NOW, { id: 'w', fields: { startTime: '07:00' } }));
  // The tombstoned first row (unmoved, with its rule) wins over the moved copy.
  assert.equal(seriesOf(rows, 'w')!.template.id, 'w');
  assert.equal(projectOccurrences(rows, [SUN], TODAY)[0].startTime, '09:00');
});

test('an All days edit after a move reaches the moved day too (its time), never its Day', () => {
  const rows = apply(shift(), planMoveDay(shift(), SAT, FRI, NOW));
  const targets = seriesEditTargets(rows, TODAY).map((r) => r.id).sort();
  assert.deepEqual(targets, ['w:2026-10-25', `w:${SAT}`].sort());
  const moved = rows.find((r) => r.id === `w:${SAT}`)!;
  const patch = templatePatch(moved, { startTime: '10:00', dueDate: SUN } as Partial<Task>);
  assert.deepEqual(patch, { startTime: '10:00' });
});

test('putting a moved day back on its own day undoes the move', () => {
  const moved = apply(shift(), planMoveDay(shift(), SAT, FRI, NOW));
  const back = apply(moved, planMoveDay(moved, SAT, SAT, NOW, { id: `w:${SAT}` }));
  const r = back.find((x) => x.id === `w:${SAT}`)!;
  assert.equal(r.dueDate, SAT);
  assert.equal(isMovedRow(r), false);
  assert.equal(movedFrom(r), undefined);
  assert.deepEqual(board(back)(SAT).map((c) => c.id), [`w:${SAT}`]);
  assert.deepEqual(board(back)(FRI), []);
});

test('moving again moves the same row; nothing to do returns null', () => {
  const once = apply(shift(), planMoveDay(shift(), SAT, FRI, NOW));
  const plan = planMoveDay(once, SAT, '2026-10-29', NOW, { id: `w:${SAT}` });
  assert.equal(plan!.writes.length, 1);
  assert.equal(plan!.moved.id, `w:${SAT}`);
  assert.equal(plan!.moved.dueDate, '2026-10-29');
  assert.equal(planMoveDay(once, SAT, FRI, NOW, { id: `w:${SAT}` }), null, 'already there');
  assert.equal(planMoveDay(shift(), SAT, SAT, NOW), null, 'a projected day onto itself');
  assert.equal(planMoveDay(shift(), SAT, 'tomorrow', NOW), null, 'not a date');
  // A skipped day cannot be moved.
  const skipped = [...shift(), { ...projectOccurrences(shift(), [SAT], TODAY)[0], deletedAt: NOW }];
  assert.equal(planMoveDay(skipped, SAT, FRI, NOW), null);
});

test('a move never takes the id, the Day or a tombstone from the fields', () => {
  const plan = planMoveDay(shift(), SAT, FRI, NOW, { fields: { id: 'x', dueDate: SUN, deletedAt: NOW, startTime: '08:00' } });
  assert.equal(plan!.moved.id, `w:${SAT}`);
  assert.equal(plan!.moved.dueDate, FRI);
  assert.equal(plan!.moved.deletedAt, undefined);
  assert.equal(plan!.moved.startTime, '08:00');
});

test('Skip this day on the moved card skips that day by its row; Saturday stays empty', () => {
  const rows = apply(shift(), planMoveDay(shift(), SAT, FRI, NOW));
  const skip = planSkip(rows, SAT, NOW, `w:${SAT}`);
  assert.equal(skip!.tombstone.id, `w:${SAT}`);
  const after = rows.map((r) => (r.id === skip!.tombstone.id ? skip!.tombstone : r));
  assert.deepEqual(board(after)(FRI), []);
  assert.deepEqual(board(after)(SAT), []);
  assert.equal(board(after)(SUN)[0].projected, true);
});

test('Skip this day on Sunday\'s own shift leaves the Saturday moved onto Sunday alone', () => {
  const rows = apply(shift(), planMoveDay(shift(), SAT, SUN, NOW));
  const sunday = projectOccurrences(rows, [SUN], TODAY)[0];
  const skip = planSkip(rows, SUN, NOW, sunday.id);
  assert.equal(skip!.tombstone.id, `w:${SUN}`);
  const after = [...rows, skip!.tombstone];
  assert.deepEqual(board(after)(SUN).map((c) => c.id), [`w:${SAT}`]);
});

test('Delete repeating task removes the moved day with the rest', () => {
  const rows = apply(shift(), planMoveDay(shift(), SAT, FRI, NOW));
  const changed = new Map(deleteSeriesRows(rows, NOW).map((r) => [r.id, r]));
  const after = rows.map((r) => changed.get(r.id) ?? r);
  assert.ok(after.find((r) => r.id === `w:${SAT}`)!.deletedAt);
  assert.deepEqual(projectOccurrences(after, DAYS, TODAY), []);
  assert.deepEqual(board(after)(FRI), []);
});

// ---- sync ----

const CAPS: Caps = { serverUpdatedAt: true, taskPipeline: true, taskExtras: true, planner: true, partB: true, partC: true };
const merge = (local: Task[], remote: Task[]) =>
  mergeRows<Task>({ local, remote, keyOf: (r) => r.id, pending: new Map(), preserveFields: [], mode: 'incremental' }).rows;

test('sync round trip: a moved day travels in the existing columns only and reads back as moved', () => {
  const plain = taskToRemote(shift()[1], CAPS);
  const rows = apply(shift(), planMoveDay(shift(), SAT, FRI, NOW, { fields: { startTime: '07:00' } }));
  const moved = rows.find((r) => r.id === `w:${SAT}`)!;
  const remote = taskToRemote(moved, CAPS);
  assert.deepEqual(Object.keys(remote).sort(), Object.keys(plain).sort(), 'no new column');
  assert.equal(remote.id, `w:${SAT}`);
  assert.equal(remote.due_date, FRI);
  assert.equal(remote.start_time, '07:00');
  const back = taskFromRemote(remote);
  assert.equal(movedFrom(back), SAT);
  assert.equal(back.startTime, '07:00');
});

test('sync round trip of the first row move: the tombstone and the copy reach the other device', () => {
  const start = [row('w', { dueDate: SAT })];
  const moved = apply(start, planMoveDay(start, SAT, FRI, NOW, { id: 'w' }));
  // The other device still has the first row; it pulls both writes through the server shape.
  const pulled = moved.map((r) => taskFromRemote(taskToRemote(r, CAPS)));
  const other = merge(start, pulled);
  assert.ok(other.find((r) => r.id === 'w')!.deletedAt);
  assert.deepEqual(board(other)(FRI).map((c) => c.id), [`w:${SAT}`]);
  assert.deepEqual(board(other)(SAT), []);
  assert.equal(board(other)(SUN)[0].projected, true);
});

test('two devices: one moves Saturday, the other ticks Sunday; the merge keeps both', () => {
  const a = apply(shift(), planMoveDay(shift(), SAT, FRI, NOW));
  const sunday = { ...projectOccurrences(shift(), [SUN], TODAY)[0], completed: true, completedAt: NOW, updatedAt: NOW };
  const b = [...shift(), sunday];
  for (const merged of [merge(a, b), merge(b, a)]) {
    assert.deepEqual(board(merged)(FRI).map((c) => c.id), [`w:${SAT}`]);
    assert.deepEqual(board(merged)(SAT), []);
    assert.deepEqual(board(merged)(SUN).map((c) => [c.id, c.projected]), [[`w:${SUN}`, false]]);
  }
});

test('an older client (2.18.1 rules: a row takes its id day and its Day) also hides Saturday', () => {
  // The older code put both the id date and the Day in `taken`; the moved row carries both.
  const rows = apply(shift(), planMoveDay(shift(), SAT, FRI, NOW));
  const moved = rows.find((r) => r.id === `w:${SAT}`)!;
  const oldTaken = new Set(rows.flatMap((r) => [r.dueDate, r.id.split(':')[1]]).filter(Boolean));
  assert.ok(oldTaken.has(SAT) && oldTaken.has(FRI));
  assert.equal(moved.recurrence, 'weekly');
});
