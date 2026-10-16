// Run with `npm test` from mobile/. Duplicating a task (phase 2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { duplicateTask } from './taskCopy.ts';
import type { Task } from './types.ts';

const NOW = '2026-10-16T10:00:00.000Z';
const original: Task = {
  id: 'orig',
  title: 'Write report',
  notes: 'Section 2 first',
  priority: 'high',
  projectKey: 'work',
  listKey: 'reading',
  emoji: 'E',
  dueDate: '2026-10-20',
  startTime: '09:00',
  durationMinutes: 90,
  reminderMinutes: 10,
  completed: true,
  completedAt: '2026-10-16T09:00:00.000Z',
  actualMinutes: 75,
  timerStartedAt: '2026-10-16T09:30:00.000Z',
  recurrence: 'weekly',
  recurrenceDays: ['Mon'],
  subtasks: [{ id: 's1', title: 'Outline', done: true }, { id: 's2', title: 'Draft', done: false }],
  origin: 'dump',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-10-15T00:00:00.000Z',
};

test('a copy keeps the description of the work and its Day', () => {
  const c = duplicateTask(original, 'copy1', NOW, (i) => `n${i}`);
  assert.equal(c.id, 'copy1');
  assert.equal(c.title, 'Write report');
  assert.equal(c.notes, 'Section 2 first');
  assert.equal(c.priority, 'high');
  assert.equal(c.projectKey, 'work');
  assert.equal(c.listKey, 'reading');
  assert.equal(c.emoji, 'E');
  assert.equal(c.dueDate, '2026-10-20');
  assert.equal(c.durationMinutes, 90);
  assert.equal(c.reminderMinutes, 10);
});

test('a copy carries no progress, no time slot and no repeat', () => {
  const c = duplicateTask(original, 'copy1', NOW, (i) => `n${i}`);
  assert.equal(c.completed, false);
  for (const k of ['completedAt', 'actualMinutes', 'timerStartedAt', 'startTime', 'recurrence', 'recurrenceDays', 'recurrenceMonthDay', 'origin']) {
    assert.equal(k in c, false, k);
  }
  assert.equal(c.createdAt, NOW);
  assert.equal(c.updatedAt, NOW);
});

test('subtasks are copied with new ids and unticked; the original is untouched', () => {
  const before = JSON.stringify(original);
  const c = duplicateTask(original, 'copy1', NOW, (i) => `n${i}`);
  assert.deepEqual(c.subtasks, [{ id: 'n0', title: 'Outline', done: false }, { id: 'n1', title: 'Draft', done: false }]);
  assert.equal(JSON.stringify(original), before);
});

test('a plain task copies to a plain task', () => {
  const c = duplicateTask({ id: 'x', title: 'Call', completed: false, createdAt: NOW, updatedAt: NOW }, 'y', NOW, () => 'z');
  assert.deepEqual(c, { id: 'y', title: 'Call', completed: false, createdAt: NOW, updatedAt: NOW });
});
