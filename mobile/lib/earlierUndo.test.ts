import { test } from 'node:test';
import assert from 'node:assert/strict';
import { earlierA11y, undoRows, withoutEarlier } from './earlierUndo.ts';
import type { Task } from './types.ts';

const t = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, completed: false, createdAt: '2026-11-01T08:00:00.000Z', updatedAt: '2026-11-01T08:00:00.000Z', ...extra });

test('a changed row is written back as it was; an untouched one is not', () => {
  const before = [t('a', { dueDate: '2026-11-17' }), t('b')];
  const after = [t('a', { dueDate: '2026-11-20', updatedAt: '2026-11-19T09:00:00.000Z' }), t('b')];
  assert.deepEqual(undoRows(before, after), [before[0]]);
});

test('Let go (the row went to the Trash) comes back without its deletedAt', () => {
  const before = [t('a', { dueDate: '2026-11-17' })];
  const after = [t('a', { dueDate: '2026-11-17', deletedAt: '2026-11-19T09:00:00.000Z', updatedAt: '2026-11-19T09:00:00.000Z' })];
  const rows = undoRows(before, after);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].deletedAt, undefined);
});

test('a row the answer added (the steps split copy) goes to the Trash', () => {
  const before = [t('a')];
  const after = [t('a', { completed: true, updatedAt: '2026-11-19T09:00:00.000Z' }), t('copy', { updatedAt: '2026-11-19T09:00:00.000Z' })];
  const rows = undoRows(before, after);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].completed, false);
  assert.equal(rows[1].id, 'copy');
  assert.ok(rows[1].deletedAt);
});

test('the lists leave out one off tasks of earlier days that are not ticked, and keep the rest', () => {
  const today = '2026-11-19';
  const rows = [
    t('old', { dueDate: '2026-11-17' }),
    t('oldDone', { dueDate: '2026-11-17', completed: true }),
    t('today', { dueDate: today }),
    t('none'),
    t('series', { dueDate: '2026-11-17', recurrence: 'daily' }),
    t('reminder', { dueDate: '2026-11-17', startTime: '09:00', durationMinutes: 0 }),
  ];
  assert.deepEqual(withoutEarlier(rows, today).map((x) => x.id), ['oldDone', 'today', 'none', 'series', 'reminder']);
});

test('the pill says how many for VoiceOver, calmly', () => {
  assert.equal(earlierA11y(1), 'Earlier: 1 task from an earlier day');
  assert.equal(earlierA11y(3), 'Earlier: 3 tasks from earlier days');
});
