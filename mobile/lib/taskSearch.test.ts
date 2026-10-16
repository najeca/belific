// Run with `npm test` from mobile/. Task search (phase 3).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fold, searchTasks } from './taskSearch.ts';
import type { Task } from './types.ts';

const NOW = '2026-10-16T10:00:00.000Z';
const task = (id: string, title: string, extra: Partial<Task> = {}): Task => ({ id, title, completed: false, createdAt: NOW, updatedAt: NOW, ...extra });
const labels = [{ key: 'work', name: 'Work' }];
const lists = [{ key: 'read', name: 'Reading' }];

test('folding ignores case and accents', () => {
  assert.equal(fold('Café RÉSUMÉ'), 'cafe resume');
});

test('every word must be found; a blank query finds nothing', () => {
  const tasks = [task('1', 'Book dentist'), task('2', 'Book flights'), task('3', 'Dentist forms')];
  assert.deepEqual(searchTasks(tasks, [], [], 'book dentist').map((h) => h.task.id), ['1']);
  assert.deepEqual(searchTasks(tasks, [], [], 'dentist').map((h) => h.task.id).sort(), ['1', '3']);
  assert.deepEqual(searchTasks(tasks, [], [], '   '), []);
  assert.deepEqual(searchTasks(tasks, [], [], 'zzz'), []);
});

test('it looks in notes, subtasks, the label name and the list name', () => {
  const tasks = [
    task('n', 'A', { notes: 'ring the plumber' }),
    task('s', 'B', { subtasks: [{ id: 'x', title: 'plumber quote', done: false }] }),
    task('l', 'C', { projectKey: 'work' }),
    task('r', 'D', { listKey: 'read' }),
  ];
  assert.deepEqual(searchTasks(tasks, labels, lists, 'plumber').map((h) => h.task.id).sort(), ['n', 's']);
  assert.deepEqual(searchTasks(tasks, labels, lists, 'work').map((h) => h.task.id), ['l']);
  assert.deepEqual(searchTasks(tasks, labels, lists, 'reading').map((h) => h.task.id), ['r']);
});

test('title starts first, then title matches, then others; open before done; soonest Day first', () => {
  const tasks = [
    task('other', 'Zed', { notes: 'call mum' }),
    task('inside', 'Please call mum'),
    task('start', 'Call mum', { dueDate: '2026-10-30' }),
    task('startSoon', 'Call the bank', { dueDate: '2026-10-18' }),
    task('startDone', 'Call dad', { completed: true, dueDate: '2026-10-17' }),
  ];
  assert.deepEqual(searchTasks(tasks, [], [], 'call').map((h) => h.task.id), ['startSoon', 'start', 'startDone', 'inside', 'other']);
});

test('deleted tasks are never found, and the result is capped', () => {
  assert.deepEqual(searchTasks([task('1', 'Gone', { deletedAt: NOW })], [], [], 'gone'), []);
  const many = Array.from({ length: 50 }, (_, i) => task(`t${i}`, `Task ${i}`));
  assert.equal(searchTasks(many, [], [], 'task').length, 30);
  assert.equal(searchTasks(many, [], [], 'task', 5).length, 5);
});
