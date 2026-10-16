// Run with `npm test` from mobile/. Lists beside Brain Dump (phase 2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveListKey, listCounts, listNameProblem, listTitle, liveLists, newList, nextSortOrder, resolveSelectedList, tasksInList } from './lists.ts';
import type { Task, TaskList } from './types.ts';

const NOW = '2026-10-16T10:00:00.000Z';
const list = (key: string, name: string, extra: Partial<TaskList> = {}): TaskList => ({ key, name, sortOrder: 0, createdAt: NOW, updatedAt: NOW, ...extra });
const task = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, completed: false, createdAt: NOW, updatedAt: NOW, ...extra });

test('names: blank, too long, Brain Dump and duplicates are refused; the list itself may keep its name', () => {
  const lists = [list('a', 'Reading'), list('b', 'Old', { deletedAt: NOW })];
  assert.equal(listNameProblem(lists, 'Errands'), null);
  assert.equal(listNameProblem(lists, '   '), 'Enter a name');
  assert.equal(listNameProblem(lists, 'x'.repeat(41)), 'Use 40 characters or fewer');
  assert.equal(listNameProblem(lists, ' brain  dump '), 'Brain Dump is always there');
  assert.equal(listNameProblem(lists, 'READING'), 'Another list has that name');
  assert.equal(listNameProblem(lists, 'reading', 'a'), null, 'renaming a list to its own name with other case');
  assert.equal(listNameProblem(lists, 'Old'), null, 'a deleted list does not hold its name');
});

test('new lists are named tidily and sort after the others', () => {
  const lists = [list('a', 'A', { sortOrder: 2 }), list('b', 'B', { sortOrder: 7, deletedAt: NOW })];
  assert.equal(nextSortOrder(lists), 3);
  assert.equal(nextSortOrder([]), 0);
  const l = newList('k', '  Weekend   plans ', undefined, 3, NOW);
  assert.deepEqual(l, { key: 'k', name: 'Weekend plans', sortOrder: 3, createdAt: NOW, updatedAt: NOW });
  assert.equal(newList('k', 'X', 'E', 0, NOW).emoji, 'E');
  assert.deepEqual(liveLists([list('z', 'Z', { sortOrder: 1 }), list('a', 'A', { sortOrder: 1 }), list('d', 'D', { deletedAt: NOW }), list('f', 'F', { sortOrder: 0 })]).map((x) => x.key), ['f', 'a', 'z']);
});

test('a task whose list is gone reads as Brain Dump', () => {
  const lists = [list('a', 'Reading'), list('b', 'Gone', { deletedAt: NOW })];
  assert.equal(effectiveListKey(task('t', { listKey: 'a' }), lists), 'a');
  assert.equal(effectiveListKey(task('t', { listKey: 'b' }), lists), undefined);
  assert.equal(effectiveListKey(task('t', { listKey: 'unknown' }), lists), undefined);
  assert.equal(effectiveListKey(task('t'), lists), undefined);
});

test('a list holds its own tasks; Brain Dump holds the rest; deleted tasks are in none', () => {
  const lists = [list('a', 'Reading'), list('b', 'Gone', { deletedAt: NOW })];
  const tasks = [task('1'), task('2', { listKey: 'a' }), task('3', { listKey: 'b' }), task('4', { listKey: 'a', deletedAt: NOW })];
  assert.deepEqual(tasksInList(tasks, undefined, lists).map((t) => t.id), ['1', '3']);
  assert.deepEqual(tasksInList(tasks, 'a', lists).map((t) => t.id), ['2']);
});

test('counts: incomplete tasks with no Day, per list; Brain Dump under the empty key', () => {
  const lists = [list('a', 'Reading')];
  const tasks = [
    task('1'),
    task('2', { listKey: 'a' }),
    task('3', { listKey: 'a' }),
    task('4', { listKey: 'a', completed: true }),
    task('5', { listKey: 'a', dueDate: '2026-10-20' }),
    task('6', { deletedAt: NOW }),
    task('7', { listKey: 'ghost' }),
  ];
  const c = listCounts(tasks, lists);
  assert.equal(c.get(''), 2);
  assert.equal(c.get('a'), 2);
});

test('titles and the remembered selection', () => {
  assert.equal(listTitle(undefined), '🧠 Brain Dump');
  assert.equal(listTitle(list('a', 'Reading', { emoji: '📚' })), '📚 Reading');
  assert.equal(listTitle(list('a', 'Reading')), '📋 Reading');
  const lists = [list('a', 'Reading'), list('b', 'Gone', { deletedAt: NOW })];
  assert.equal(resolveSelectedList('a', lists), 'a');
  assert.equal(resolveSelectedList('b', lists), undefined);
  assert.equal(resolveSelectedList(null, lists), undefined);
  assert.equal(resolveSelectedList('nope', lists), undefined);
});
