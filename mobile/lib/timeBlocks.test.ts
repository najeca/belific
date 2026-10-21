// Run with `npm test` from mobile/. A task with several times is drawn once per time (Part C, P4):
// the blocks, their ids, the drag of one time, the resize, the overnight spill and the split per time.
import test from 'node:test';
import assert from 'node:assert/strict';
import { multiDropPatch, resizeRefusal } from './drag.ts';
import { cutDay, planCuts, type CutEntry } from './cuts.ts';
import { continuationOf, layoutItems, taskToItem } from './timebox.ts';
import { tasksForTimebox } from './timeboxTasks.ts';
import { shiftTimesFields, splitBlockSuffix, suffixFor, timeViews, viewAt } from './times.ts';
import { totalScheduledMinutes } from './timebox.ts';
import type { Task } from './types.ts';

const task = (extra: Partial<Task> = {}): Task => ({
  id: 'brk',
  title: 'Short break',
  completed: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  dueDate: '2026-10-22',
  startTime: '11:00',
  durationMinutes: 20,
  extraTimes: ['15:00'],
  ...extra,
});

test('a task with several times is drawn as one single-time block per time, the first with the task\'s own id', () => {
  const views = timeViews(task({ timesDone: ['11:00'] }));
  assert.deepEqual(views.map((v) => [v.index, v.time, v.suffix, v.multi]), [[0, '11:00', '', true], [1, '15:00', '@15:00', true]]);
  assert.equal(views[0].task.startTime, '11:00');
  assert.equal(views[0].task.extraTimes, undefined, 'a block sees one time');
  assert.equal(views[0].task.completed, true, 'the 11:00 block is done');
  assert.equal(views[1].task.completed, false, 'the 15:00 block is not');
  assert.equal(views[1].task.id, 'brk');
  assert.equal(views[0].task.durationMinutes, 20);
  // a task with one time is itself; a task with none has no block
  const single = task({ extraTimes: undefined });
  assert.deepEqual(timeViews(single).map((v) => [v.suffix, v.multi, v.task === single]), [['', false, true]]);
  assert.deepEqual(timeViews(task({ startTime: undefined })), []);
  assert.equal(viewAt(task(), '09:00', true).startTime, '09:00');
  assert.equal(suffixFor(0, '11:00'), '');
  assert.equal(suffixFor(2, '17:30'), '@17:30');
});

test('a block id splits back into the task id and the time', () => {
  assert.deepEqual(splitBlockSuffix('brk'), { id: 'brk' });
  assert.deepEqual(splitBlockSuffix('brk@15:00'), { id: 'brk', time: '15:00' });
  assert.deepEqual(splitBlockSuffix('brk:2026-10-22@15:00'), { id: 'brk:2026-10-22', time: '15:00' });
  assert.deepEqual(splitBlockSuffix('a@b'), { id: 'a@b' }, 'only a real time counts');
  assert.deepEqual(splitBlockSuffix('@15:00'), { id: '@15:00' });
});

test('each time is a block: items for the grid, the day total counts every time, nothing overlaps its own', () => {
  const items = timeViews(task()).map((v) => taskToItem(v.task)!);
  assert.deepEqual(items.map((i) => [i.startMin, i.endMin]), [[660, 680], [900, 920]]);
  assert.equal(totalScheduledMinutes(items), 40);
  assert.equal(layoutItems(items.map((it, i) => ({ ...it, id: `b${i}` }))).blocks.every((b) => b.cols === 1), true);
});

test('each time of a break splits the task it overlaps on its own: three pieces from two breaks', () => {
  // The Boot Camp 09:30 to 16:30, and a Short break at 11:00 and 15:00 (20 minutes each).
  const entries: CutEntry[] = [{ id: 'task:boot', startMin: 570, endMin: 990, breaks: false }];
  for (const v of timeViews(task({ cutsBelow: true }))) {
    const item = taskToItem(v.task)!;
    entries.push({ id: `task:brk${v.suffix}`, startMin: item.startMin, endMin: item.endMin, breaks: true });
  }
  const res = cutDay(entries, 30);
  assert.equal(res.refusals.length, 0);
  assert.deepEqual(res.pieces.map((p) => [p.startMin, p.endMin]), [[570, 660], [680, 900], [920, 990]]);
  const plan = planCuts(entries, 30, (id) => id);
  assert.deepEqual(plan.items.map((i) => i.id).sort(), ['task:boot#0', 'task:boot#1', 'task:boot#2', 'task:brk', 'task:brk@15:00']);
  // a second time that would leave a short piece refuses on its own; the first still cuts
  const near: CutEntry[] = [{ id: 'task:boot', startMin: 570, endMin: 990, breaks: false }, { id: 'task:brk', startMin: 660, endMin: 680, breaks: true }, { id: 'task:brk@15:00', startMin: 960, endMin: 980, breaks: true }];
  const r2 = cutDay(near, 30);
  assert.deepEqual(r2.refusals.map((r) => [r.breakId, r.reason, r.pieceMin]), [['task:brk@15:00', 'short', 10]]);
  assert.equal(r2.pieces.length, 2);
});

test('yesterday\'s task spills into today when ANY of its times runs past midnight, one rest per time', () => {
  const night = task({ id: 'night', dueDate: '2026-10-21', startTime: '09:00', durationMinutes: 120, extraTimes: ['23:00'] });
  const { spill } = tasksForTimebox([night], '2026-10-22', '2026-10-22');
  assert.equal(spill.length, 1);
  const rests = timeViews(spill[0].task).map((v) => continuationOf(v.task)).filter(Boolean);
  assert.equal(rests.length, 1, 'only the 23:00 time passes midnight');
  assert.deepEqual([rests[0]!.startMin, rests[0]!.endMin], [0, 60]);
  // nothing spills when no time passes midnight
  assert.equal(tasksForTimebox([task({ dueDate: '2026-10-21' })], '2026-10-22', '2026-10-22').spill.length, 0);
});

test('dragging one time\'s block: only that time moves on its own day, with its tick; a clash is refused with a reason', () => {
  const t = task({ timesDone: ['15:00'] });
  const slot = (dayKey: string, startMin: number) => ({ kind: 'slot' as const, dayKey, startMin });
  const moved = multiDropPatch(t, '15:00', slot('2026-10-22', 16 * 60), '2026-10-21', false);
  assert.ok(moved && moved.ok);
  if (moved && moved.ok) {
    assert.deepEqual([moved.fields.startTime, moved.fields.extraTimes, moved.fields.timesDone], ['11:00', ['16:00'], ['16:00']]);
    assert.equal(moved.fields.dueDate, undefined, 'the day is not touched');
  }
  const clash = multiDropPatch(t, '15:00', slot('2026-10-22', 11 * 60 + 10), '2026-10-21', false);
  assert.ok(clash && !clash.ok);
  assert.equal(multiDropPatch(t, '15:00', slot('2026-10-22', 15 * 60), '2026-10-21', false), null, 'dropped where it was');
  assert.equal(multiDropPatch(t, '15:00', slot('2026-10-20', 16 * 60), '2026-10-21', false), null, 'never onto a past day');
  // a shown day of a series: the same, whichever day it was dropped on
  const proj = multiDropPatch(t, '11:00', slot('2026-10-23', 10 * 60), '2026-10-21', true);
  assert.ok(proj && proj.ok);
  if (proj && proj.ok) assert.deepEqual([proj.fields.startTime, proj.fields.extraTimes], ['10:00', ['15:00']]);
});

test('dropping a block on another day moves the whole task there, every time by the same amount', () => {
  const t = task({ timesDone: ['11:00'] });
  const r = multiDropPatch(t, '15:00', { kind: 'slot', dayKey: '2026-10-24', startMin: 16 * 60 }, '2026-10-21', false);
  assert.ok(r && r.ok);
  if (r && r.ok) assert.deepEqual(r.fields, { dueDate: '2026-10-24', startTime: '12:00', extraTimes: ['16:00'], timesDone: ['12:00'] });
  // a time that would leave the day refuses the whole move
  const late = multiDropPatch(task({ extraTimes: ['23:30'] }), '11:00', { kind: 'slot', dayKey: '2026-10-24', startMin: 12 * 60 + 30 }, '2026-10-21', false);
  assert.ok(late);
  assert.equal(late && late.ok, false);
  // dropping on a day or the list: the task leaves the grid, all its times with it
  assert.deepEqual(multiDropPatch(t, '11:00', { kind: 'day', dayKey: '2026-10-25' }, '2026-10-21', false), { ok: true, fields: { dueDate: '2026-10-25', startTime: undefined, extraTimes: undefined, timesDone: undefined } });
  assert.deepEqual(multiDropPatch(t, '11:00', { kind: 'left' }, '2026-10-21', false), { ok: true, fields: { dueDate: undefined, startTime: undefined, extraTimes: undefined, timesDone: undefined } });
  assert.equal(multiDropPatch(t, '11:00', { kind: 'day', dayKey: '2026-10-25' }, '2026-10-21', true), null, 'a shown day only changes its time');
});

test('shifting every time keeps the ticks with their times and a completed task completed', () => {
  const shifted = shiftTimesFields(task({ timesDone: ['15:00'] }), 60);
  assert.ok(shifted.ok);
  if (shifted.ok) assert.deepEqual(shifted.fields, { startTime: '12:00', extraTimes: ['16:00'], timesDone: ['16:00'] });
  const done = shiftTimesFields(task({ completed: true }), -30);
  assert.ok(done.ok);
  if (done.ok) assert.deepEqual(done.fields.timesDone, ['10:30', '14:30']);
  assert.ok(!shiftTimesFields(task({ startTime: undefined }), 30).ok);
  assert.ok(!shiftTimesFields(task(), -700).ok);
});

test('a resize changes every time\'s length: refused when two of its times would then overlap', () => {
  assert.equal(resizeRefusal(task(), 60), null);
  assert.match(resizeRefusal(task({ extraTimes: ['11:30'] }), 60) as string, /^Not resizing: 11:30am would start before the 11:00am one ends \(60 min each\)\.$/);
  assert.equal(resizeRefusal(task({ extraTimes: undefined }), 600), null, 'one time never clashes');
});
