// Run with `npm test` from mobile/. Editing a list's name and emoji (2.48.0): the same row, so the key and
// its tasks stay; the name follows the new list rule; the edit is one upsert in the sync outbox.
import test from 'node:test';
import assert from 'node:assert/strict';
import { editedList, effectiveListKey, listCounts, listEmojiOf, listNameProblem } from './lists.ts';
import { EMPTY_OUTBOX, enqueue, listToRemote } from './syncCore.ts';
import type { Task, TaskList } from './types.ts';

const list = (key: string, name: string, extra: Partial<TaskList> = {}): TaskList => ({
  key,
  name,
  sortOrder: 0,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...extra,
});
const task = (id: string, listKey?: string): Task => ({
  id,
  title: id,
  completed: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...(listKey ? { listKey } : {}),
});

const lists = [list('a', 'Work', { emoji: '💼' }), list('b', 'Reading', { sortOrder: 1 })];
const tasks = [task('t1', 'a'), task('t2', 'a'), task('t3', 'b'), task('t4')];

test('a rename and a new emoji keep the list key, the order, createdAt and every task', () => {
  const r = editedList(lists, 'a', '  Deep   work ', '🎯');
  assert.ok('list' in r);
  if (!('list' in r)) return;
  assert.equal(r.list.key, 'a');
  assert.equal(r.list.name, 'Deep work');
  assert.equal(r.list.emoji, '🎯');
  assert.equal(r.list.sortOrder, 0);
  assert.equal(r.list.createdAt, lists[0].createdAt);
  const after = lists.map((l) => (l.key === 'a' ? r.list : l));
  assert.deepEqual(tasks.filter((t) => effectiveListKey(t, after) === 'a').map((t) => t.id), ['t1', 't2']);
  assert.equal(listCounts(tasks, after).get('a'), 2);
  assert.equal(listEmojiOf(tasks[0], after), '🎯');
  assert.equal(lists[0].name, 'Work', 'the input is not changed');
});

test('no emoji text clears the emoji; text that is not an emoji clears it too', () => {
  const r = editedList(lists, 'a', 'Work', undefined);
  assert.ok('list' in r && r.list.emoji === undefined && !('emoji' in r.list));
  const t = editedList(lists, 'a', 'Work', 'abc');
  assert.ok('list' in t && t.list.emoji === undefined);
});

test('duplicate names follow the new list rule: another list name is refused, its own is fine', () => {
  assert.deepEqual(editedList(lists, 'a', ' reading ', '💼'), { problem: 'Another list has that name' });
  assert.equal(listNameProblem(lists, 'reading'), 'Another list has that name');
  assert.ok('list' in editedList(lists, 'a', 'WORK', '💼'), 'its own name in other letters is allowed');
  assert.deepEqual(editedList(lists, 'a', 'Brain Dump', '💼'), { problem: 'Brain Dump is always there' });
  assert.deepEqual(editedList(lists, 'a', '   ', '💼'), { problem: 'Enter a name' });
  assert.ok('problem' in editedList(lists, 'a', 'x'.repeat(41), '💼'));
  const gone = [list('a', 'Work', { deletedAt: '2026-10-02T00:00:00.000Z' })];
  assert.deepEqual(editedList(gone, 'a', 'Work', undefined), { problem: 'That list no longer exists' });
  assert.deepEqual(editedList(lists, 'zzz', 'New', undefined), { problem: 'That list no longer exists' });
});

test('the edited row is one upsert in the outbox under the same key, with the new name and emoji', () => {
  const r = editedList(lists, 'a', 'Deep work', '🎯');
  assert.ok('list' in r);
  if (!('list' in r)) return;
  // storage.putList stamps updatedAt, then queues the row
  const stamped = { ...r.list, updatedAt: '2026-10-22T09:00:00.000Z' };
  let box = enqueue(EMPTY_OUTBOX, [{ table: 'lists', key: 'a', op: 'upsert', row: { ...lists[0] } }]);
  box = enqueue(box, [{ table: 'lists', key: stamped.key, op: 'upsert', row: stamped as unknown as Record<string, unknown> }]);
  assert.equal(box.entries.length, 1, 'one entry per list: the edit replaces the older write');
  const sent = listToRemote(box.entries[0].row as unknown as TaskList);
  assert.equal(sent.key, 'a');
  assert.equal(sent.name, 'Deep work');
  assert.equal(sent.emoji, '🎯');
  assert.equal(sent.updated_at, '2026-10-22T09:00:00.000Z');
  assert.equal(sent.created_at, lists[0].createdAt);
  assert.equal(sent.deleted_at, undefined);
});
