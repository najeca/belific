// Run with `npm test` from mobile/. One task, several times in a day (Part C, P3).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_TIMES,
  addTimeFields,
  doneTimesOf,
  isMultiTime,
  isTimeDone,
  moveTimeFields,
  overlapNote,
  planTick,
  removeTimeFields,
  suggestNextTime,
  timesCount,
  timesLabel,
  timesLeft,
  timesOf,
  wholeTaskTimesDone,
} from './times.ts';
import { plannedText, totalsOf } from './taskTotals.ts';
import type { Task } from './types.ts';

const NOW = '2026-10-21T12:00:00.000Z';
const task = (extra: Partial<Task> = {}): Task => ({
  id: 'b',
  title: 'Short break',
  completed: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  dueDate: '2026-10-21',
  startTime: '11:00',
  durationMinutes: 20,
  ...extra,
});

test('the times of a task: start plus extras, sorted, distinct, valid; none without a start time', () => {
  assert.deepEqual(timesOf(task()), ['11:00']);
  assert.deepEqual(timesOf(task({ extraTimes: ['15:00', '09:30', '15:00', 'junk', '25:00'] })), ['09:30', '11:00', '15:00']);
  assert.deepEqual(timesOf(task({ startTime: undefined, extraTimes: ['15:00'] })), [], 'extras alone mean nothing');
  // An older client moved the start time past an extra one: read as sorted, nothing rewritten.
  assert.deepEqual(timesOf(task({ startTime: '16:00', extraTimes: ['15:00'] })), ['15:00', '16:00']);
  assert.equal(timesOf(task({ extraTimes: ['01:00', '02:00', '03:00', '04:00', '05:00', '06:00', '07:00', '08:00'] })).length, MAX_TIMES);
  assert.equal(isMultiTime(task()), false);
  assert.equal(isMultiTime(task({ extraTimes: ['15:00'] })), true);
  assert.equal(timesCount(task({ startTime: undefined })), 1);
  assert.equal(timesCount(task({ extraTimes: ['15:00', '17:00'] })), 3);
});

test('completed always means every time is done; otherwise the ticked ones that are still times', () => {
  const t = task({ extraTimes: ['15:00'] });
  assert.deepEqual(doneTimesOf(t), []);
  assert.deepEqual(doneTimesOf({ ...t, timesDone: ['15:00', '09:00'] }), ['15:00'], 'a tick for a time that is gone is ignored');
  assert.deepEqual(doneTimesOf({ ...t, completed: true }), ['11:00', '15:00'], 'a phone tick completes every time');
  assert.deepEqual(doneTimesOf({ ...t, completed: true, timesDone: ['11:00'] }), ['11:00', '15:00']);
  assert.equal(isTimeDone({ ...t, timesDone: ['11:00'] }, '15:00'), false);
  assert.equal(timesLeft(t), 2);
  assert.equal(timesLeft({ ...t, timesDone: ['11:00'] }), 1);
  assert.equal(timesLeft({ ...t, completed: true }), 0);
  assert.equal(timesLeft(task({ startTime: undefined })), 1);
});

test('ticking one time leaves the others; the last open one completes the task; unticking reopens it with the rest still done', () => {
  const t = task({ extraTimes: ['15:00'] });
  const first = planTick(t, '11:00', true, NOW)!;
  assert.deepEqual(first, { timesDone: ['11:00'], completed: false, completedAt: undefined });
  const both = planTick({ ...t, timesDone: first.timesDone }, '15:00', true, NOW)!;
  assert.deepEqual(both, { timesDone: ['11:00', '15:00'], completed: true, completedAt: NOW });
  const back = planTick({ ...t, completed: true, completedAt: NOW, timesDone: both.timesDone }, '11:00', false, NOW)!;
  assert.deepEqual(back, { timesDone: ['15:00'], completed: false, completedAt: undefined });
  // unticking a time that was completed from the phone (timesDone absent) expands the list first
  const fromPhone = planTick({ ...t, completed: true, completedAt: NOW }, '15:00', false, NOW)!;
  assert.deepEqual(fromPhone, { timesDone: ['11:00'], completed: false, completedAt: undefined });
  // the same tick twice changes nothing; a time that is not there is refused
  assert.deepEqual(planTick({ ...t, timesDone: ['11:00'] }, '11:00', true, NOW), first);
  assert.equal(planTick(t, '09:00', true, NOW), null);
  assert.equal(planTick(task({ startTime: undefined }), '11:00', true, NOW), null);
  // a completed task keeps its completion time when it stays completed
  const keep = planTick({ ...t, completed: true, completedAt: '2026-10-20T10:00:00.000Z' }, '11:00', true, NOW)!;
  assert.equal(keep.completedAt, '2026-10-20T10:00:00.000Z');
});

test('a whole-task tick ticks every time, and an untick clears them all', () => {
  const t = task({ extraTimes: ['15:00'] });
  assert.deepEqual(wholeTaskTimesDone(t, true), ['11:00', '15:00']);
  assert.equal(wholeTaskTimesDone(t, false), undefined);
  assert.equal(wholeTaskTimesDone(task(), true), undefined, 'a task with one time stores no ticks');
});

test('adding a time: sorted into place, refused when duplicate, overlapping, or the eighth', () => {
  const t = task();
  const added = addTimeFields(t, '15:00');
  assert.ok(added.ok);
  if (added.ok) assert.deepEqual(added.fields, { startTime: '11:00', extraTimes: ['15:00'], completed: false, completedAt: undefined, timesDone: undefined });
  // an earlier time becomes the start time
  const earlier = addTimeFields(t, '09:00');
  assert.ok(earlier.ok);
  if (earlier.ok) assert.deepEqual([earlier.fields.startTime, earlier.fields.extraTimes], ['09:00', ['11:00']]);
  const dup = addTimeFields(t, '11:00');
  assert.ok(!dup.ok);
  if (!dup.ok) assert.match(dup.note, /already/);
  const near = addTimeFields(t, '11:10'); // 20 min task: 11:10 starts before the 11:00 one ends
  assert.ok(!near.ok);
  if (!near.ok) assert.match(near.note, /11:10am would start before the 11:00am one ends \(20 min each\)/);
  assert.ok(addTimeFields(t, '11:20').ok, 'back to back is fine');
  assert.ok(!addTimeFields(task({ startTime: undefined }), '11:00').ok, 'a task needs a first time');
  assert.ok(!addTimeFields(t, 'noon').ok);
  const full = task({ durationMinutes: 15, extraTimes: ['12:00', '13:00', '14:00', '15:00', '16:00', '17:00'] });
  assert.equal(timesOf(full).length, MAX_TIMES);
  const eighth = addTimeFields(full, '18:00');
  assert.ok(!eighth.ok);
  if (!eighth.ok) assert.match(eighth.note, /up to 7 times/);
});

test('adding a time to a completed task reopens it, with the old times still done', () => {
  const t = task({ extraTimes: ['15:00'], completed: true, completedAt: NOW });
  const r = addTimeFields(t, '17:00');
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.fields, { startTime: '11:00', extraTimes: ['15:00', '17:00'], completed: false, completedAt: undefined, timesDone: ['11:00', '15:00'] });
});

test('removing a time: its tick goes; the earliest promotes the next; the last two become one; every remaining done completes it', () => {
  const t = task({ extraTimes: ['15:00', '17:00'], timesDone: ['11:00', '15:00'] });
  const dropLast = removeTimeFields(t, '17:00');
  assert.ok(dropLast.ok);
  if (dropLast.ok) {
    assert.equal(dropLast.fields.startTime, '11:00');
    assert.deepEqual(dropLast.fields.extraTimes, ['15:00']);
    assert.equal(dropLast.fields.completed, true, 'everything left is done');
    assert.deepEqual(dropLast.fields.timesDone, ['11:00', '15:00']);
  }
  const dropFirst = removeTimeFields(t, '11:00');
  assert.ok(dropFirst.ok);
  if (dropFirst.ok) {
    assert.deepEqual([dropFirst.fields.startTime, dropFirst.fields.extraTimes], ['15:00', ['17:00']]);
    assert.equal(dropFirst.fields.completed, false);
    assert.deepEqual(dropFirst.fields.timesDone, ['15:00'], 'the 11:00 tick went with it');
  }
  const two = task({ extraTimes: ['15:00'] });
  const one = removeTimeFields(two, '15:00');
  assert.ok(one.ok);
  if (one.ok) assert.deepEqual(one.fields, { startTime: '11:00', extraTimes: undefined, timesDone: undefined });
  const lone = removeTimeFields(task(), '11:00');
  assert.ok(lone.ok);
  if (lone.ok) assert.deepEqual(lone.fields, { startTime: undefined, extraTimes: undefined, timesDone: undefined });
  assert.ok(!removeTimeFields(t, '09:00').ok);
  // a completed task with a time removed stays completed
  const done = removeTimeFields(task({ extraTimes: ['15:00', '17:00'], completed: true, completedAt: NOW }), '15:00');
  assert.ok(done.ok);
  if (done.ok) assert.equal(done.fields.completed, undefined, 'untouched: it stays completed');
  if (done.ok) assert.deepEqual(done.fields.timesDone, ['11:00', '17:00']);
  // two left, one removed, the other already done: the single task completes
  const lastOne = removeTimeFields(task({ extraTimes: ['15:00'], timesDone: ['11:00'] }), '15:00');
  assert.ok(lastOne.ok);
  if (lastOne.ok) assert.equal(lastOne.fields.completed, true);
});

test('moving a time keeps its tick, re-sorts, and is refused onto another time or too close', () => {
  const t = task({ extraTimes: ['15:00'], timesDone: ['15:00'] });
  const r = moveTimeFields(t, '15:00', '10:00');
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual([r.fields.startTime, r.fields.extraTimes], ['10:00', ['11:00']]);
    assert.deepEqual(r.fields.timesDone, ['10:00'], 'the tick followed the time');
  }
  assert.deepEqual(moveTimeFields(t, '15:00', '15:00'), { ok: true, fields: {} });
  assert.ok(!moveTimeFields(t, '15:00', '11:00').ok);
  assert.ok(!moveTimeFields(t, '15:00', '11:15').ok);
  assert.ok(!moveTimeFields(t, '09:00', '10:00').ok);
  assert.ok(!moveTimeFields(t, '15:00', '99:00').ok);
  // a completed task stays completed through a move
  const c = moveTimeFields(task({ extraTimes: ['15:00'], completed: true, completedAt: NOW }), '15:00', '16:00');
  assert.ok(c.ok);
  if (c.ok) assert.deepEqual(c.fields.timesDone, ['11:00', '16:00']);
});

test('overlap: two times closer than the task is long are refused; the default length is 30 minutes', () => {
  assert.equal(overlapNote(['11:00', '11:20'], 20), null);
  assert.match(overlapNote(['11:00', '11:19'], 20) as string, /11:19am would start before the 11:00am one ends/);
  const noLength = task({ durationMinutes: undefined, extraTimes: ['11:20'] });
  assert.ok(!addTimeFields(task({ durationMinutes: undefined }), '11:20').ok, '30 minutes by default');
  assert.equal(timesOf(noLength).length, 2);
});

test('the suggested next time: the end of the last, rounded up to the half hour, inside the day', () => {
  assert.equal(suggestNextTime(task()), '11:30');
  assert.equal(suggestNextTime(task({ extraTimes: ['15:00'] })), '15:30');
  assert.equal(suggestNextTime(task({ startTime: '23:30' })), null);
  assert.equal(suggestNextTime(task({ startTime: '10:15', durationMinutes: 45 })), '11:00');
  assert.equal(suggestNextTime(task({ startTime: undefined })), null);
});

test('the card text lists the times, with a tick after each done time', () => {
  assert.equal(timesLabel(task()), '11:00');
  assert.equal(timesLabel(task({ startTime: undefined })), '');
  assert.equal(timesLabel(task({ extraTimes: ['15:00'] })), '11:00, 15:00');
  assert.equal(timesLabel(task({ extraTimes: ['15:00'], timesDone: ['11:00'] })), '11:00 ✓, 15:00');
  assert.equal(timesLabel(task({ extraTimes: ['15:00'], completed: true })), '11:00 ✓, 15:00 ✓');
});

test('planned time counts every time: the day total all of them, "still to do" the ones not ticked', () => {
  const t = task({ extraTimes: ['15:00'] });
  assert.equal(totalsOf([t], 0).estimate, 40);
  assert.equal(totalsOf([task()], 0).estimate, 20);
  assert.equal(plannedText([t]), '40m planned');
  assert.equal(plannedText([{ ...t, timesDone: ['11:00'] }]), '20m planned');
  assert.equal(plannedText([{ ...t, completed: true }]), '');
  // 3 hours: a task with no time counts once
  assert.equal(plannedText([task({ startTime: undefined, durationMinutes: 180 })]), '3h planned');
});
