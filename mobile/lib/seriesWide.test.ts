// Run with `npm test` from mobile/. 3.29.0: what a repeating task shares across ALL its days.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hasWide, mergePatches, splitWide, wideTargets, widePatches, type RowPatch } from './seriesWide.ts';
import { movedCaption, projectOccurrences } from './series.ts';
import { seriesPatches } from './seriesTime.ts';
import type { Task } from './types.ts';

// 2026-11-02 is a Monday. "Apply to 1 application", Mon Wed Fri at 10:00 for 1 hour, started Mon 26 Oct.
const TODAY = '2026-11-02';
const OLD = 'Apply to 1 application';
const NEW = 'Apply to 15 application';
function row(id: string, extra: Partial<Task> = {}): Task {
  return {
    id,
    title: OLD,
    completed: false,
    createdAt: '2026-10-20T08:00:00.000Z',
    updatedAt: '2026-10-20T08:00:00.000Z',
    recurrence: 'weekly',
    recurrenceDays: ['Mon', 'Wed', 'Fri'],
    startTime: '10:00',
    durationMinutes: 60,
    projectKey: 'work',
    listKey: 'jobs',
    notes: 'Use the CV v3',
    subtasks: [
      { id: 's1', title: 'Find a role', done: false },
      { id: 's2', title: 'Send it', done: false },
    ],
    ...extra,
  };
}

// The series as Jethro had it: last Monday done, last Wednesday done, last Friday NOT done (still open), this
// Monday moved into the Short break at 15:05 and shortened to 10 minutes, next Wednesday moved to Thursday, a
// skipped Friday (a tombstone).
function series(): Task[] {
  return [
    row('apply', { dueDate: '2026-10-26', completed: true, completedAt: '2026-10-26T11:00:00.000Z', subtasks: [{ id: 's1', title: 'Find a role', done: true }, { id: 's2', title: 'Send it', done: true }] }),
    row('apply:2026-10-28', { dueDate: '2026-10-28', completed: true, completedAt: '2026-10-28T11:00:00.000Z' }),
    row('apply:2026-10-30', { dueDate: '2026-10-30', subtasks: [{ id: 's1', title: 'Find a role', done: true }, { id: 's2', title: 'Send it', done: false }] }),
    row(`apply:${TODAY}`, { dueDate: TODAY, startTime: '15:05', durationMinutes: 10, updatedAt: '2026-11-02T08:00:00.000Z' }),
    row('apply:2026-11-04', { dueDate: '2026-11-05', startTime: '09:00' }),
    row('apply:2026-11-06', { dueDate: '2026-11-06', deletedAt: '2026-11-01T08:00:00.000Z' }),
  ];
}

function apply(rows: Task[], patches: RowPatch[]): Task[] {
  return rows.map((r) => {
    const p = patches.find((x) => x.id === r.id);
    return p ? { ...r, ...p.fields } : r;
  });
}
const byId = (rows: Task[], id: string) => rows.find((r) => r.id === id) as Task;

test('the shared fields are title, label, list, notes, priority, steps and reminders; date, time and length are not', () => {
  for (const k of ['title', 'projectKey', 'listKey', 'notes', 'priority', 'subtasks', 'reminderMinutes', 'reminders']) assert.ok(hasWide({ [k]: undefined }), k);
  for (const k of ['dueDate', 'startTime', 'durationMinutes', 'extraTimes', 'completed', 'cutsBelow', 'emoji']) assert.ok(!hasWide({ [k]: 1 } as Partial<Task>), k);
  assert.deepEqual(splitWide({ title: 'x', cutsBelow: true }), { wide: { title: 'x' }, rest: { cutsBelow: true } });
});

test('rename from a stored day reaches every day: today (moved into a break, shortened), the moved day, the open past day', () => {
  const rows = series();
  const out = apply(rows, widePatches(rows, { title: NEW }, TODAY, 'apply:2026-10-30'));
  assert.equal(byId(out, `apply:${TODAY}`).title, NEW, 'today, the day stored by the move into the Short break');
  assert.equal(byId(out, 'apply:2026-11-04').title, NEW, 'the day moved to Thursday');
  assert.equal(byId(out, 'apply:2026-10-30').title, NEW, 'the open past day it was edited on');
  assert.equal(byId(out, 'apply').title, OLD, 'a past day that is done keeps its title');
  assert.equal(byId(out, 'apply:2026-10-28').title, OLD);
  assert.equal(byId(out, 'apply:2026-11-06').title, OLD, 'a tombstone is left alone');
  // The date, time and length of each day stay its own; the Moved from caption still reads from the row.
  assert.equal(byId(out, `apply:${TODAY}`).startTime, '15:05');
  assert.equal(byId(out, `apply:${TODAY}`).durationMinutes, 10);
  assert.equal(byId(out, 'apply:2026-11-04').dueDate, '2026-11-05');
  assert.equal(byId(out, 'apply:2026-11-04').startTime, '09:00');
  assert.ok(movedCaption(byId(out, 'apply:2026-11-04')));
  // The days not stored yet follow the template: next week's Monday shows the new title.
  const shown = projectOccurrences(out, ['2026-11-09', '2026-11-11'], TODAY);
  assert.deepEqual(shown.map((t) => t.title), [NEW, NEW]);
});

test('the same rename from a day not stored yet (patchSeries) also reaches the days stored before today', () => {
  const rows = series();
  const patches = mergePatches(seriesPatches(rows, {}, TODAY), widePatches(rows, { title: NEW }, TODAY));
  const out = apply(rows, patches);
  assert.equal(byId(out, `apply:${TODAY}`).title, NEW);
  assert.equal(byId(out, 'apply:2026-10-30').title, NEW, 'the open past day too (before 3.29.0 it kept the old title)');
  assert.equal(byId(out, 'apply').title, OLD);
});

test('a label change, a list change and a notes change go to every day the same way', () => {
  for (const fields of [{ projectKey: 'study' }, { listKey: 'career' }, { notes: 'Use the CV v4' }, { projectKey: undefined }] as Array<Partial<Task>>) {
    const rows = series();
    const out = apply(rows, widePatches(rows, fields, TODAY, `apply:${TODAY}`));
    const k = Object.keys(fields)[0] as keyof Task;
    for (const id of [`apply:${TODAY}`, 'apply:2026-11-04', 'apply:2026-10-30']) assert.equal(byId(out, id)[k], (fields as Record<string, unknown>)[k], `${String(k)} on ${id}`);
    for (const id of ['apply', 'apply:2026-10-28']) assert.equal(byId(out, id)[k], byId(rows, id)[k], `${String(k)} kept on the done day ${id}`);
    assert.equal(byId(out, `apply:${TODAY}`).durationMinutes, 10);
  }
});

test('editing the steps keeps each day its own ticks; the day it was edited on takes them as edited', () => {
  const rows = series();
  const edited = [
    { id: 's1', title: 'Find a role', done: false },
    { id: 's2', title: 'Send it', done: false },
    { id: 's3', title: 'Note the date', done: false },
  ];
  const out = apply(rows, widePatches(rows, { subtasks: edited }, TODAY, `apply:${TODAY}`));
  assert.deepEqual(byId(out, 'apply:2026-10-30').subtasks?.map((s) => [s.title, s.done]), [['Find a role', true], ['Send it', false], ['Note the date', false]]);
  assert.deepEqual(byId(out, `apply:${TODAY}`).subtasks, edited);
  assert.equal(byId(out, 'apply').subtasks?.length, 2, 'the done day keeps its steps');
});

test('a past day that is done is reached only when it is the day being edited', () => {
  const rows = series();
  const ids = (own?: string) => wideTargets(rows, TODAY, own).map((r) => r.id).sort();
  assert.ok(!ids().includes('apply:2026-10-28'));
  assert.ok(ids('apply:2026-10-28').includes('apply:2026-10-28'));
  assert.ok(!ids().includes('apply:2026-11-06'), 'never a tombstone');
});

test('a change that sets nothing new writes nothing', () => {
  const rows = series();
  assert.deepEqual(widePatches(rows, { title: OLD }, TODAY), []);
  assert.deepEqual(widePatches(rows, { startTime: '11:00' }, TODAY), []);
});

test('mergePatches joins the patches of one row', () => {
  assert.deepEqual(mergePatches([{ id: 'a', fields: { title: 'x' } }], [{ id: 'a', fields: { cutsBelow: true } }, { id: 'b', fields: { title: 'y' } }]), [
    { id: 'a', fields: { title: 'x', cutsBelow: true } },
    { id: 'b', fields: { title: 'y' } },
  ]);
});
