import test from 'node:test';
import assert from 'node:assert/strict';
import { freeDaysAfter, planAwayMoves, planPushWeek, planShiftDay, weekEndOf } from './dayShift.ts';
import type { Task } from './types.ts';

const T = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, completed: false, createdAt: `2026-10-0${id.length}T00:00:00Z`, updatedAt: 'u', ...extra });

test('Shift unfinished to next day: only unfinished one off tasks of that day, time kept', () => {
  const rows = [
    T('a', { dueDate: '2026-10-18', startTime: '09:00' }),
    T('b', { dueDate: '2026-10-18' }),
    T('done', { dueDate: '2026-10-18', completed: true }),
    T('gym', { dueDate: '2026-10-18', recurrence: 'daily' }),
    T('gym:2026-10-18x', { dueDate: '2026-10-18' }),
    T('occ:2026-10-18', { dueDate: '2026-10-18' }),
    T('other', { dueDate: '2026-10-19' }),
    T('gone', { dueDate: '2026-10-18', deletedAt: 'x' }),
  ];
  const moves = planShiftDay(rows, '2026-10-18');
  assert.deepEqual(moves.map((m) => [m.id, m.to]), [['a', '2026-10-19'], ['b', '2026-10-19'], ['gym:2026-10-18x', '2026-10-19']]);
});

test('Push rest of week: from the day to Sunday, each a week on; across a month end', () => {
  assert.equal(weekEndOf('2026-10-28'), '2026-11-01');
  const rows = [T('wed', { dueDate: '2026-10-28' }), T('sun', { dueDate: '2026-11-01', startTime: '20:00' }), T('mon', { dueDate: '2026-11-02' }), T('tue', { dueDate: '2026-10-27' })];
  assert.deepEqual(planPushWeek(rows, '2026-10-28').map((m) => [m.id, m.from, m.to]), [['wed', '2026-10-28', '2026-11-04'], ['sun', '2026-11-01', '2026-11-08']]);
  // A Sunday is its own last day.
  assert.deepEqual(planPushWeek(rows, '2026-11-01').map((m) => m.id), ['sun']);
});

test('free days skip away days', () => {
  const away = new Set(['2026-10-19', '2026-10-20']);
  assert.deepEqual(freeDaysAfter('2026-10-18', away, 3), ['2026-10-21', '2026-10-22', '2026-10-23']);
});

test('marking a day away: next free day, or spread one per free day in board order', () => {
  const rows = [T('late', { dueDate: '2026-10-20', startTime: '15:00' }), T('x', { dueDate: '2026-10-20' }), T('early', { dueDate: '2026-10-20', startTime: '08:00' })];
  const away = new Set(['2026-10-21']);
  assert.deepEqual(planAwayMoves(rows, '2026-10-20', 'next', away).map((m) => [m.id, m.to]), [['x', '2026-10-22'], ['early', '2026-10-22'], ['late', '2026-10-22']]);
  assert.deepEqual(planAwayMoves(rows, '2026-10-20', 'spread', away).map((m) => [m.id, m.to]), [['x', '2026-10-22'], ['early', '2026-10-23'], ['late', '2026-10-24']]);
});

test('planning never changes the rows', () => {
  const rows = [T('a', { dueDate: '2026-10-18' })];
  const before = JSON.stringify(rows);
  planShiftDay(rows, '2026-10-18');
  planPushWeek(rows, '2026-10-18');
  planAwayMoves(rows, '2026-10-18', 'spread', new Set());
  assert.equal(JSON.stringify(rows), before);
});
