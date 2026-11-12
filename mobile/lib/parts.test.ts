// Run with `npm test` from mobile/. R4 of PLAN_repeat_end_and_parts: Parts. A part is its own task row with parentId;
// shown as a row in its parent's card, never on its own; the orphan rule; totals counted once with the parent's own
// estimate winning (E2); the tick rules; delete with or without the parts; taking one out; steps into parts.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Task } from './types.ts';
import {
  canHaveParts,
  deleteAllText,
  deleteWrites,
  isShownPart,
  indexById,
  newPart,
  parentDoneWrites,
  partIndex,
  partMinutes,
  partTickWrites,
  partsAddUp,
  partsOf,
  partsProgress,
  stepsToParts,
  takeOutRow,
  withParts,
  withPartsOf,
} from './parts.ts';
import { estimateOf, totalsOf } from './taskTotals.ts';

const T = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, completed: false, createdAt: `2026-11-12T10:00:0${id.length % 10}.000Z`, updatedAt: 'x', ...extra });
const upper = T('upper', { title: 'Upper day', dueDate: '2026-11-12', startTime: '18:00', listKey: 'gym' });
const bench = T('bench', { title: 'Bench press', parentId: 'upper', durationMinutes: 20, notes: '4 sets, slow on the way down', createdAt: '2026-11-12T10:00:01.000Z' });
const shoulders = T('shoulders', { title: 'Shoulders', parentId: 'upper', durationMinutes: 25, createdAt: '2026-11-12T10:00:02.000Z' });
const back = T('back', { title: 'Back', parentId: 'upper', durationMinutes: 30, createdAt: '2026-11-12T10:00:03.000Z' });
const all = [upper, bench, shoulders, back];

test('a part is shown under its live parent, in the order made; never as a task of its own', () => {
  assert.deepEqual(partsOf(all, 'upper').map((p) => p.title), ['Bench press', 'Shoulders', 'Back']);
  const shown = withParts(all);
  assert.deepEqual(shown.map((t) => t.id), ['upper']);
  assert.equal(isShownPart(bench, indexById(all)), true);
});

test('the orphan rule: a part with a missing, deleted or nested parent shows as an ordinary task; restoring brings it back', () => {
  assert.deepEqual(withParts([bench]).map((t) => t.id), ['bench'], 'parent missing (sync out of order, an older build)');
  const gone = [{ ...upper, deletedAt: 'x' }, bench];
  assert.ok(withParts(gone).some((t) => t.id === 'bench'), 'parent in the Trash');
  const nested = [T('p', { parentId: 'q' }), T('q'), T('c', { parentId: 'p' })];
  assert.ok(withParts(nested).some((t) => t.id === 'c'), 'a part of a part is shown on its own (one level only)');
  assert.ok(!withParts(all).some((t) => t.id === 'bench'), 'restored: back under it (parentId never changed)');
  assert.equal(partIndex([T('self', { parentId: 'self' })]).size, 0, 'a task is never its own part');
});

test('E2: the parent with no estimate counts its parts (75m); its own estimate wins when it has one; counted once', () => {
  const [p] = withParts(all);
  assert.equal(p.partsMinutes, 75);
  assert.equal(estimateOf(p), 75);
  assert.equal(totalsOf(withParts(all), 0).estimate, 75, 'the parts never count on their own');
  const own = withParts([{ ...upper, durationMinutes: 60 }, bench, shoulders, back]);
  assert.equal(own[0].partsMinutes, undefined);
  assert.equal(estimateOf(own[0]), 60);
  assert.equal(partsAddUp({ durationMinutes: 60 }, [bench, shoulders, back], (m) => `${m}m`), 'Parts add up to 75m.');
  assert.equal(partsAddUp({}, [bench], (m) => `${m}m`), null, 'no line when the sum is the estimate');
  assert.equal(partMinutes([T('a'), T('b', { durationMinutes: 10 })]), 10, 'a new part has no estimate and adds nothing');
});

test('withPartsOf: a day total takes the parts of that day\'s parents only', () => {
  const other = T('other', { dueDate: '2026-11-13' });
  const raw = [upper, bench, shoulders, back, other, T('x', { parentId: 'other', durationMinutes: 99 })];
  const day = raw.filter((t) => t.dueDate === '2026-11-12');
  const out = withPartsOf(day, raw);
  assert.deepEqual(out.map((t) => t.id), ['upper']);
  assert.equal(totalsOf(out, 0).estimate, 75);
});

test('progress: "2 of 5 done"', () => {
  assert.equal(partsProgress([{ completed: true }, { completed: true }, { completed: false }, { completed: false }, { completed: false }]).text, '2 of 5 done');
});

test('ticks: the last open part completes the parent; unticking one reopens a done parent; completing the parent ticks every part', () => {
  const two = [{ ...bench, completed: true }, { ...shoulders, completed: true }, back];
  const last = partTickWrites(upper, two, 'back', true, 'now');
  assert.deepEqual(last.map((r) => [r.id, r.completed]), [['back', true], ['upper', true]]);
  const one = partTickWrites(upper, [bench, shoulders, back], 'bench', true, 'now');
  assert.deepEqual(one.map((r) => r.id), ['bench'], 'not the last: the parent stays open');
  const reopen = partTickWrites({ ...upper, completed: true }, two.map((p) => ({ ...p, completed: true })), 'bench', false, 'now');
  assert.deepEqual(reopen.map((r) => [r.id, r.completed]), [['bench', false], ['upper', false]]);
  assert.deepEqual(parentDoneWrites([{ ...bench, completed: true }, shoulders, back], 'now').map((r) => r.id), ['shoulders', 'back']);
});

test('delete: "the task only" turns the parts into ordinary tasks on its Day and list; "the task and its 3 parts" bins them all', () => {
  const only = deleteWrites(upper, [bench, shoulders, back], 'only', 'now');
  assert.equal(only[0].deletedAt, 'now');
  assert.ok(only.slice(1).every((p) => !p.parentId && !p.deletedAt && p.dueDate === '2026-11-12' && p.listKey === 'gym'));
  const allOut = deleteWrites(upper, [bench, shoulders, back], 'all', 'now');
  assert.ok(allOut.every((r) => r.deletedAt === 'now'));
  assert.ok(allOut.slice(1).every((p) => p.parentId === 'upper'), 'the link stays, so Restore puts them back under it');
  assert.equal(deleteAllText(3), 'Delete the task and its 3 parts');
  assert.equal(deleteAllText(1), 'Delete the task and its part');
});

test('take out: an ordinary task on the parent\'s Day and list; new parts: no Day, the parent\'s list, a name needed', () => {
  const out = takeOutRow(bench, upper);
  assert.equal(out.parentId, undefined);
  assert.equal(out.dueDate, '2026-11-12');
  assert.equal(out.notes, '4 sets, slow on the way down');
  const p = newPart(upper, '  Bench   press ', 'n1', 'now')!;
  assert.deepEqual([p.title, p.parentId, p.listKey, p.dueDate, p.startTime, p.recurrence], ['Bench press', 'upper', 'gym', undefined, undefined, undefined]);
  assert.equal(newPart(upper, '   ', 'n2', 'now'), null);
});

test('steps into parts: same titles, ticks and order; the checklist emptied', () => {
  const parent = { ...upper, subtasks: [{ id: 's1', title: 'Warm up', done: true }, { id: 's2', title: 'Stretch', done: false }] };
  const plan = stepsToParts(parent, (i) => `p${i}`, '2026-11-12T10:00:00.000Z');
  assert.equal(plan.parent.subtasks, undefined);
  assert.deepEqual(plan.parts.map((p) => [p.id, p.title, p.completed, p.parentId]), [['p0', 'Warm up', true, 'upper'], ['p1', 'Stretch', false, 'upper']]);
  assert.deepEqual(partsOf([plan.parent, ...plan.parts], 'upper').map((p) => p.title), ['Warm up', 'Stretch'], 'the order holds');
});

test('who can have parts (R4): an ordinary task; not a repeating one (R5), not a part, not free time', () => {
  assert.equal(canHaveParts(upper), true);
  assert.equal(canHaveParts({ ...upper, recurrence: 'daily' }), false);
  assert.equal(canHaveParts(bench), false);
  assert.equal(canHaveParts({ ...upper, cutsBelow: true }), false);
});

import { planStep } from './undoStack.ts';
import { partsDeletedWith, trashEntries } from './trash.ts';

test('undo of "Delete the task and its 3 parts": the parent comes back under a new id and its parts follow it', () => {
  const at = '2026-11-12T10:00:00.000Z';
  const after = deleteWrites(upper, [bench, shoulders, back], 'all', at).map((r) => ({ ...r, updatedAt: at }));
  const entry = { changes: [upper, bench, shoulders, back].map((b, i) => ({ id: b.id, before: b, after: after[i] })), label: 'deleted', gesture: 1, lastAt: 0 };
  const plan = planStep(entry, after, '2026-11-12T10:00:05.000Z', 'undo');
  const liveRows = plan.writes.filter((w) => !w.deletedAt);
  const parent = liveRows.find((w) => w.title === 'Upper day')!;
  assert.ok(parent && parent.id !== 'upper');
  const back3 = liveRows.filter((w) => w.parentId);
  assert.equal(back3.length, 3);
  assert.ok(back3.every((p) => p.parentId === parent.id), JSON.stringify(back3.map((p) => p.parentId)));
  assert.deepEqual(partsOf([...after, ...plan.writes], parent.id).map((p) => p.title), ['Bench press', 'Shoulders', 'Back']);
});

test('the Trash: the parts deleted with their parent are one entry with it ("With its 3 parts")', () => {
  const at = '2026-11-12T10:00:00.000Z';
  const rows = deleteWrites(upper, [bench, shoulders, back], 'all', at).map((r) => ({ ...r, updatedAt: at }));
  const entries = trashEntries(rows, Date.parse(at) + 1000);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, 'Upper day');
  assert.equal(entries[0].note, 'With its 3 parts.');
  assert.equal(partsDeletedWith(entries[0].row, rows).length, 3);
});
