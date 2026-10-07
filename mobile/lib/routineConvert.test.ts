import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONVERT_WARNING,
  DRY_RUN_NOTE,
  dryRunLines,
  planConvert,
  planUndo,
  routineLines,
  routineSummary,
  routineTombstone,
  seriesIdFor,
} from './routineConvert.ts';
import { projectOccurrences } from './series.ts';
import { rootTaskId } from './recurrence.ts';
import type { Routine, Task } from './types.ts';

const NOW = '2026-10-08T09:00:00.000Z';
const TODAY = '2026-10-08';

const routine = (id: string, title: string, timeOfDay: Routine['timeOfDay'], extra: Partial<Routine> = {}): Routine => ({
  id,
  title,
  timeOfDay,
  createdAt: '2026-09-01T07:00:00.000Z',
  updatedAt: '2026-09-01T07:00:00.000Z',
  ...extra,
});

const R1 = routine('r1', 'Morning stretch', 'morning');
const R2 = routine('r2', 'Wind down', 'evening', { createdAt: '2026-09-02T07:00:00.000Z' });

// Applies a plan the way convertRoutines does, to plain arrays.
function applyConvert(routines: Routine[], tasks: Task[]): { routines: Routine[]; tasks: Task[]; n: number } {
  const plan = planConvert(routines, tasks, TODAY, NOW);
  const nextTasks = [...tasks];
  for (const i of plan.items) if (i.series) nextTasks.push(i.series);
  const tomb = new Map(plan.items.map((i) => [i.routine.id, routineTombstone(i.routine, NOW)]));
  return { routines: routines.map((r) => tomb.get(r.id) ?? r), tasks: nextTasks, n: plan.items.length };
}

test('a routine maps to a daily, untimed series with no reminder, label, priority or steps', () => {
  const [item] = planConvert([R1], [], TODAY, NOW).items;
  const s = item.series!;
  assert.equal(s.id, 'rt_r1');
  assert.equal(s.title, 'Morning stretch');
  assert.equal(s.recurrence, 'daily');
  assert.equal(s.dueDate, TODAY);
  assert.equal(s.reminderMinutes, -1);
  assert.equal(s.completed, false);
  assert.equal(s.startTime, undefined);
  assert.equal(s.durationMinutes, undefined);
  assert.equal(s.projectKey, undefined);
  assert.equal(s.priority, undefined);
  assert.equal(s.subtasks, undefined);
  assert.equal(s.createdAt, R1.createdAt);
});

test('series ids are deterministic and have no colon, so the root id is the id', () => {
  assert.equal(seriesIdFor('abc'), 'rt_abc');
  assert.equal(rootTaskId(seriesIdFor('0a1b2c3d-1111-4222-8333-444455556666')), 'rt_0a1b2c3d-1111-4222-8333-444455556666');
  assert.equal(rootTaskId(`${seriesIdFor('abc')}:2026-10-09`), 'rt_abc');
});

test('the converted series shows on every day from today, projected by the existing series code', () => {
  const { tasks } = applyConvert([R1], []);
  const days = ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'];
  const projected = projectOccurrences(tasks, days, TODAY).map((t) => t.id);
  // today is the stored root row itself; the other days are projected
  assert.deepEqual(projected, ['rt_r1:2026-10-09', 'rt_r1:2026-10-10', 'rt_r1:2026-10-11']);
});

test('the dry run lists title and time of day in morning, afternoon, evening order and changes nothing', () => {
  const routines = [R2, R1, routine('r3', 'Lunch walk', 'afternoon')];
  const tasks: Task[] = [];
  const before = JSON.stringify({ routines, tasks });
  const lines = dryRunLines(planConvert(routines, tasks, TODAY, NOW));
  assert.deepEqual(
    lines.map((l) => `${l.title} / ${l.timeOfDay}`),
    ['Morning stretch / Morning', 'Lunch walk / Afternoon', 'Wind down / Evening'],
  );
  assert.equal(JSON.stringify({ routines, tasks }), before);
  assert.equal(DRY_RUN_NOTE, 'Nothing has changed yet.');
});

test('the dry run count counts live routines only', () => {
  const gone = routine('r9', 'Deleted one', 'morning', { deletedAt: '2026-09-10T00:00:00.000Z' });
  assert.equal(planConvert([R1, R2, gone], [], TODAY, NOW).items.length, 2);
  assert.deepEqual(routineSummary([R1, R2, gone], []), { pending: 2, converted: 0 });
});

test('the confirmation warning is exact', () => {
  assert.equal(
    CONVERT_WARNING,
    'Your iPhone will stop showing these routines until the next iPhone update. Only convert when you are ready. You can undo this.',
  );
});

test('converting writes a tombstone for each routine and leaves everything else on it as it was', () => {
  const { routines } = applyConvert([R1, R2], []);
  for (const r of routines) {
    assert.equal(r.deletedAt, NOW);
    assert.equal(r.updatedAt, NOW);
  }
  assert.equal(routines[0].title, R1.title);
  assert.equal(routines[0].timeOfDay, R1.timeOfDay);
  assert.equal(routines[0].createdAt, R1.createdAt);
});

test('converting twice never makes a second series or a second tombstone', () => {
  const once = applyConvert([R1, R2], []);
  assert.equal(once.n, 2);
  assert.equal(once.tasks.length, 2);
  const twice = applyConvert(once.routines, once.tasks);
  assert.equal(twice.n, 0);
  assert.equal(twice.tasks.length, 2);
  assert.deepEqual(twice.routines, once.routines);
});

test('a half finished conversion (series written, routine still live) only adds the tombstone', () => {
  const half: Task[] = [planConvert([R1], [], TODAY, NOW).items[0].series!];
  const plan = planConvert([R1], half, TODAY, NOW);
  assert.equal(plan.items.length, 1);
  assert.equal(plan.items[0].series, null);
  const done = applyConvert([R1], half);
  assert.equal(done.tasks.length, 1);
  assert.ok(done.routines[0].deletedAt);
});

test('a routine whose series the person already ended or deleted gets no second series', () => {
  const dead: Task = { ...planConvert([R1], [], TODAY, NOW).items[0].series!, recurrence: undefined, deletedAt: NOW };
  const plan = planConvert([R1], [dead], TODAY, NOW);
  assert.equal(plan.items[0].series, null);
});

test('a routine already deleted by the person is skipped', () => {
  const gone = routine('r9', 'Deleted one', 'morning', { deletedAt: '2026-09-10T00:00:00.000Z' });
  const { routines, tasks, n } = applyConvert([gone], []);
  assert.equal(n, 0);
  assert.equal(tasks.length, 0);
  assert.equal(routines[0].updatedAt, gone.updatedAt);
});

test('the quiet lines say how many routines there are, and nothing when there are none', () => {
  assert.deepEqual(routineLines({ pending: 0, converted: 0 }), []);
  assert.deepEqual(routineLines({ pending: 1, converted: 0 }), ['1 routine from your iPhone']);
  assert.deepEqual(routineLines({ pending: 2, converted: 0 }), ['2 routines from your iPhone']);
  assert.deepEqual(routineLines({ pending: 0, converted: 2 }), ['2 routines from your iPhone are now repeating tasks']);
  assert.deepEqual(routineLines({ pending: 0, converted: 1 }), ['1 routine from your iPhone is now a repeating task']);
  assert.equal(routineLines({ pending: 1, converted: 1 }).length, 2);
});

test('after converting, the summary shows converted routines and nothing pending', () => {
  const { routines, tasks } = applyConvert([R1, R2], []);
  assert.deepEqual(routineSummary(routines, tasks), { pending: 0, converted: 2 });
});

test('undo ends the series (open rows tombstoned, rule cleared) and gives each routine back as a new row', () => {
  const { routines, tasks } = applyConvert([R1, R2], []);
  let n = 0;
  const plan = planUndo(routines, tasks, '2026-10-09T08:00:00.000Z', () => `new${++n}`);
  assert.equal(plan.count, 2);
  assert.equal(plan.taskRows.length, 2);
  for (const t of plan.taskRows) {
    assert.ok(t.deletedAt);
    assert.equal(t.recurrence, undefined);
  }
  assert.deepEqual(
    plan.routines.map((r) => [r.id, r.title, r.timeOfDay, r.deletedAt]),
    [['new1', 'Morning stretch', 'morning', undefined], ['new2', 'Wind down', 'evening', undefined]],
  );
  assert.deepEqual(plan.copyFrom, [{ from: 'r1', to: 'new1' }, { from: 'r2', to: 'new2' }]);
});

test('an undone series is gone: no projection, and a re-run of Convert converts the new routines once', () => {
  const converted = applyConvert([R1], []);
  const plan = planUndo(converted.routines, converted.tasks, NOW, () => 'fresh');
  const tasks = converted.tasks.map((t) => plan.taskRows.find((c) => c.id === t.id) ?? t);
  const routines = [...converted.routines, ...plan.routines];
  assert.deepEqual(projectOccurrences(tasks, ['2026-10-09', '2026-10-10'], TODAY), []);
  assert.deepEqual(routineSummary(routines, tasks), { pending: 1, converted: 0 });
  const again = applyConvert(routines, tasks);
  assert.equal(again.n, 1);
  assert.equal(again.tasks.filter((t) => t.id === 'rt_fresh').length, 1);
  // the old series stays ended: still nothing for the old id
  assert.equal(again.tasks.filter((t) => t.id === 'rt_r1' && !t.deletedAt).length, 0);
});

test('undo does nothing to routines that were never converted, or whose series was deleted by the person', () => {
  const plan = planUndo([R1], [], NOW, () => 'x');
  assert.equal(plan.count, 0);
  assert.deepEqual(plan.taskRows, []);
  assert.deepEqual(plan.routines, []);
  const { routines, tasks } = applyConvert([R1], []);
  const deleted = tasks.map((t) => ({ ...t, recurrence: undefined, deletedAt: NOW }));
  assert.equal(planUndo(routines, deleted, NOW, () => 'x').count, 0);
});

test('undo keeps finished days: they stop repeating but are not deleted', () => {
  const { routines, tasks } = applyConvert([R1], []);
  const ticked: Task = { ...tasks[0], id: 'rt_r1:2026-10-09', dueDate: '2026-10-09', completed: true, completedAt: NOW };
  const plan = planUndo(routines, [...tasks, ticked], NOW, () => 'x');
  const done = plan.taskRows.find((t) => t.id === 'rt_r1:2026-10-09')!;
  assert.equal(done.deletedAt, undefined);
  assert.equal(done.completed, true);
  assert.equal(done.recurrence, undefined);
});

test('planning never produces anything for routine completions', () => {
  const { routines, tasks } = applyConvert([R1], []);
  const convertPlan = planConvert([R1], [], TODAY, NOW);
  const undoPlan = planUndo(routines, tasks, NOW, () => 'x');
  // the plans have no completions field to write or delete: only the copy list on undo
  assert.deepEqual(Object.keys(convertPlan), ['items']);
  assert.deepEqual(Object.keys(undoPlan).sort(), ['copyFrom', 'count', 'routines', 'taskRows']);
  assert.ok(undoPlan.copyFrom.every((c) => c.from === 'r1'));
});
