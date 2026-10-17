import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SUBTASKS,
  addSubtask,
  copyForNextOccurrence,
  counterLabel,
  deleteSubtask,
  moveSubtask,
  renameSubtask,
  toggleSubtask,
  withAllDone,
} from './subtasks.ts';
import { buildNextOccurrence } from './recurrence.ts';
import type { Task } from './types.ts';

const T = '2026-10-07T09:00:00.000Z';
const task = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, completed: false, createdAt: T, updatedAt: T, ...extra });
const sub = (id: string, done = false) => ({ id, title: `S ${id}`, done });

test('add, rename, delete, move and the counter', () => {
  let l = addSubtask(undefined, '  First  ', 'a');
  l = addSubtask(l, 'Second', 'b');
  l = addSubtask(l, '   ', 'c');
  assert.deepEqual(l.map((s) => s.title), ['First', 'Second']);
  assert.equal(counterLabel(l), '0/2');
  l = renameSubtask(l, 'a', 'First!');
  l = renameSubtask(l, 'b', '   ');
  assert.deepEqual(l.map((s) => s.title), ['First!', 'Second']);
  l = moveSubtask(l, 0, 1);
  assert.deepEqual(l.map((s) => s.id), ['b', 'a']);
  assert.deepEqual(moveSubtask(l, 0, 9).map((s) => s.id), ['b', 'a']);
  l = deleteSubtask(l, 'b');
  assert.deepEqual(l.map((s) => s.id), ['a']);
  assert.equal(counterLabel(undefined), '0/0');
});

test('a list never exceeds 50 and titles are capped', () => {
  let l = undefined as ReturnType<typeof addSubtask> | undefined;
  for (let i = 0; i < 60; i++) l = addSubtask(l, `t${i}`, `id${i}`);
  assert.equal(l!.length, MAX_SUBTASKS);
  assert.equal(addSubtask(undefined, 'x'.repeat(500), 'z')[0].title.length, 200);
});

test('ticking the last open subtask completes the task; unticking one of a completed task reopens it', () => {
  const t = task('t', { subtasks: [sub('a', true), sub('b')] });
  const r1 = toggleSubtask(t, 'b');
  assert.equal(r1.completeTask, true);
  assert.ok(r1.subtasks.every((s) => s.done));
  const r2 = toggleSubtask(task('t', { completed: true, subtasks: [sub('a', true), sub('b', true)] }), 'a');
  assert.equal(r2.completeTask, false);
  assert.equal(r2.subtasks[0].done, false);
  // an ordinary tick that is not the last changes nothing else
  assert.equal(toggleSubtask(task('t', { subtasks: [sub('a'), sub('b')] }), 'a').completeTask, null);
  // unticking in an open task changes nothing else
  assert.equal(toggleSubtask(task('t', { subtasks: [sub('a', true), sub('b')] }), 'a').completeTask, null);
  assert.equal(toggleSubtask(t, 'nope').completeTask, null);
});

test('completing the task ticks every subtask; reopening leaves them', () => {
  assert.deepEqual(withAllDone([sub('a'), sub('b', true)])!.map((s) => s.done), [true, true]);
  assert.equal(withAllDone(undefined), undefined);
});

test('a repeating task next occurrence copies the subtasks with new ids, all unticked', () => {
  const t = task('t', { dueDate: '2026-10-07', recurrence: 'daily', subtasks: [sub('a', true), sub('b', true)] });
  const next = buildNextOccurrence(t, '2026-10-07', T)!;
  assert.deepEqual(next.subtasks!.map((s) => s.done), [false, false]);
  assert.deepEqual(next.subtasks!.map((s) => s.title), ['S a', 'S b']);
  assert.ok(next.subtasks!.every((s) => s.id.startsWith(next.id)));
  assert.notEqual(next.subtasks![0].id, 'a');
  assert.equal(copyForNextOccurrence([], 'x'), undefined);
  const plain = buildNextOccurrence(task('p', { dueDate: '2026-10-07', recurrence: 'daily' }), '2026-10-07', T)!;
  assert.equal('subtasks' in plain && plain.subtasks !== undefined, false);
});

test('2.26.0: dropping a task on another card is gone; nothing in this module merges tasks', async () => {
  const mod = (await import('./subtasks.ts')) as Record<string, unknown>;
  for (const gone of ['planDropAsSubtask', 'undoDropAsSubtask', 'nextDwell', 'dwellArmed', 'resolveCardRelease', 'SUBTASK_DWELL_MS', 'UNDO_MS']) assert.equal(mod[gone], undefined, gone);
});
