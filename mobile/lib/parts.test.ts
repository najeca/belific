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

test('who can have parts: a task, repeating or not (R5); not a part, not free time', () => {
  assert.equal(canHaveParts(upper), true);
  assert.equal(canHaveParts({ ...upper, recurrence: 'daily' }), true, 'R5: a repeating task can hold parts');
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

// ---- R5: repeating parents and the flows ----
import { dayRowFor, parentTaskOf, partsFor, isDayRow, partKeyOf } from './parts.ts';
import { isGone } from './series.ts';
import { buttonsFor, splitParts, dayItems, partsButton } from './wrapUp.ts';
import { oneOffRows, partsNote, planClear } from './clear.ts';
import { partsDeletedWithSeries } from './trash.ts';

const camp = (extra: Partial<Task> = {}): Task => ({ id: 'camp', title: 'Upper day', dueDate: '2026-11-09', startTime: '18:00', durationMinutes: 60, recurrence: 'weekly', recurrenceDays: ['Mon', 'Thu'], completed: false, createdAt: 'c', updatedAt: 'u', ...extra });
const sp = (id: string, extra: Partial<Task> = {}): Task => T(id, { title: id, parentId: 'camp', durationMinutes: 10, createdAt: `2026-11-01T07:00:0${id.length}.000Z`, ...extra });

test('R5: a repeating parent\'s parts repeat each day and reset: a tick is that day\'s row only', () => {
  const tpl = [sp('b'), sp('sh')];
  const day16 = camp({ id: 'camp:2026-11-16', dueDate: '2026-11-16' });
  const dayRow = dayRowFor(tpl[0], '2026-11-12', true, 'now');
  assert.equal(dayRow.id, 'b:2026-11-12');
  const rows = [camp(), day16, ...tpl, dayRow];
  const thu = partsFor(rows, camp({ id: 'camp:2026-11-12', dueDate: '2026-11-12' }));
  assert.deepEqual(thu.map((p) => [p.id, p.completed, p.partDay]), [['b', true, '2026-11-12'], ['sh', false, '2026-11-12']]);
  const mon = partsFor(rows, day16);
  assert.deepEqual(mon.map((p) => [p.id, p.completed]), [['b', false], ['sh', false]], 'the next day starts unticked');
  assert.equal(partKeyOf(day16), 'camp');
  assert.ok(isDayRow(dayRow) && isGone(dayRow), 'a day row is history, never a task');
  assert.deepEqual(withParts(rows).map((t) => t.id), ['camp', 'camp:2026-11-16'], 'parts and day rows are not tasks of their own');
});

test('R5: parts stay with the series when its root row is a tombstone; the parent a part shows under is the latest live day', () => {
  const rows = [camp({ deletedAt: 'x' }), camp({ id: 'camp:2026-11-12', dueDate: '2026-11-12' }), sp('b')];
  assert.deepEqual(partsOf(rows, 'camp').map((p) => p.id), ['b']);
  assert.equal(parentTaskOf(rows[2], rows)?.id, 'camp:2026-11-12');
  assert.ok(withParts([camp({ deletedAt: 'x' }), sp('b')]).some((t) => t.id === 'b'), 'no live series left: the orphan rule');
});

test('R5, E4: Wrap up Tomorrow with some parts done splits the task like steps; none done moves it whole; a repeating day never moves', () => {
  const up = T('up', { title: 'Upper day', dueDate: '2026-11-12' });
  const ps = [{ ...bench, completed: true }, shoulders, back];
  const rows = [up, ...ps.map((p) => ({ ...p, parentId: 'up' }))];
  const item = dayItems(rows, '2026-11-12', '2026-11-12', 15)[0];
  assert.deepEqual(item.parts, { done: 1, total: 3 });
  assert.equal(buttonsFor(item).partsLeft, 2);
  assert.equal(partsButton(2), 'Only the 2 parts left to tomorrow');
  const plan = splitParts(up, partsOf([up, ...ps.map((p) => ({ ...p, parentId: 'up' }))], 'up'), '2026-11-13', 'copy1', 'now');
  assert.equal(plan.today.completed, true);
  assert.equal(plan.copy.dueDate, '2026-11-13');
  assert.equal(plan.copy.completed, false);
  assert.deepEqual(plan.moved.map((p) => [p.title, p.parentId]), [['Shoulders', 'copy1'], ['Back', 'copy1']], 'the open parts are re-linked, not copied');
  const none = dayItems([up, ...[bench, shoulders, back].map((p) => ({ ...p, parentId: 'up' }))], '2026-11-12', '2026-11-12', 15)[0];
  assert.equal(buttonsFor(none).partsLeft, 0, 'none done: Tomorrow moves the task and its parts follow with no write');
  const rep = dayItems([camp({ dueDate: '2026-11-12' }), sp('b')], '2026-11-12', '2026-11-12', 15)[0];
  assert.deepEqual(rep.parts, { done: 0, total: 1 });
  assert.equal(buttonsFor(rep).tomorrow, false);
});

test('R5: Clear tools: a task and its parts count once; to the Trash they go together; day and week clear no part on its own', () => {
  const up = T('up', { title: 'Upper day', listKey: 'gym' });
  const ps = [T('p1', { parentId: 'up', listKey: 'gym' }), T('p2', { parentId: 'up', listKey: 'gym' })];
  const plan = planClear([up, ...ps], { kind: 'list', listKey: 'gym', name: 'Gym' }, '2026-11-12');
  assert.equal(plan.count, 1, 'counted as one');
  assert.deepEqual([plan.withParts, plan.parts], [1, 2]);
  assert.equal(partsNote(plan, 'trash'), '1 task has 2 parts, which go with it.');
  const rows = oneOffRows(plan, 'trash', 'now');
  assert.deepEqual(rows.map((r) => r.id).sort(), ['p1', 'p2', 'up']);
  assert.ok(rows.every((r) => r.deletedAt === 'now'));
  const day = planClear([T('d', { dueDate: '2026-11-12' }), T('dp', { parentId: 'd' })], { kind: 'day', dayKey: '2026-11-12' }, '2026-11-12');
  assert.equal(day.count, 1);
  assert.deepEqual(oneOffRows(day, 'unplan', 'now').map((r) => r.id), ['d'], 'the parts go with it, no write');
});

test('R5: the Trash: the parts deleted with a repeating series are in its entry', () => {
  const T1 = '2026-11-12T10:00:00.000Z';
  const T0 = '2026-11-01T10:00:00.000Z';
  const gone = (t: Task, at: string): Task => ({ ...t, recurrence: undefined, recurrenceDays: undefined, deletedAt: at, updatedAt: at });
  const rows = [gone(camp(), T1), gone(camp({ id: 'camp:2026-11-12', dueDate: '2026-11-12' }), T1), gone(sp('b'), T1), gone(sp('old'), T0)];
  assert.deepEqual(partsDeletedWithSeries(rows[1], rows).map((p) => p.id), ['b']);
  assert.equal(trashEntries(rows, Date.parse(T1) + 1000).filter((e) => e.title === 'b').length, 0, 'not an entry of its own');
});

test('R5: undoing the tick that created a part\'s day row unticks it, never a tombstone (a re-tick must survive a sync)', () => {
  const tpl = sp('b');
  const row = dayRowFor(tpl, '2026-11-12', true, '2026-11-12T10:00:00.000Z');
  const entry = { changes: [{ id: row.id, after: row }], label: 'ticked', gesture: 1, lastAt: 0 };
  const plan = planStep(entry, [camp(), tpl, row], '2026-11-12T10:00:05.000Z', 'undo');
  assert.equal(plan.writes.length, 1);
  assert.equal(plan.writes[0].deletedAt, undefined);
  assert.equal(plan.writes[0].completed, false);
  const again = planStep({ ...entry, written: plan.written }, [camp(), tpl, plan.writes[0]], '2026-11-12T10:00:09.000Z', 'redo');
  assert.equal(again.writes[0].completed, true);
});
