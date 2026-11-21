// Run with `npm test` from mobile/. Plan week on the phone (3.65.0).
import test from 'node:test';
import assert from 'node:assert/strict';
import { dayButton, openDays, weekFigure, weekQueue, weekText } from './weekQueue.ts';
import type { Task, TaskList } from './types.ts';

const TODAY = '2026-11-18'; // a Wednesday
const STAMP = '2026-11-01T00:00:00.000Z';
const T = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, completed: false, createdAt: STAMP, updatedAt: STAMP, ...extra });
const LISTS: TaskList[] = [{ key: 'work', name: 'Work', sortOrder: 0, createdAt: STAMP, updatedAt: STAMP }];
const WEEK = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'];

test('the queue: last week first, then Brain Dump, then each list; tasks with a Day or a repeat are not asked', () => {
  const raw = [T('dump'), T('w', { listKey: 'work' }), T('old', { dueDate: '2026-11-15' }), T('onday', { dueDate: '2026-11-19' }), T('rep', { recurrence: 'daily', dueDate: '2026-11-19' })];
  assert.deepEqual(weekQueue(raw, TODAY, LISTS).map((s) => [s.item.task.id, s.source]), [['old', 'earlier'], ['dump', 'list'], ['w', 'list']]);
});

test('only today and later days are offered', () => {
  assert.deepEqual(openDays(WEEK, TODAY), ['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']);
});

test('the words', () => {
  assert.equal(dayButton('2026-11-23'), 'Mon 23');
  assert.equal(weekText('2026-11-19', 'Gym'), 'Thu 19: Gym');
  assert.equal(weekText('skip', 'Gym'), 'Left for now: Gym');
});

test('the figure lists each day, none when nothing has a length', () => {
  const raw = [T('a', { dueDate: '2026-11-19', durationMinutes: 90 })];
  const f = weekFigure(raw, WEEK, TODAY, 30, Date.parse('2026-11-18T10:00:00'));
  assert.match(f, /Thu 1h 30m/);
  assert.match(f, /Mon none/);
});
