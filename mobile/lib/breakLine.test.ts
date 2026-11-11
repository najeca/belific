// Run with `npm test` from mobile/. The quiet line at the foot of a day column (PLAN_breaks_as_gaps, P1, D1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { breakGaps, breakLineText, breakRowSub, isTimedBreak } from './breakLine.ts';
import { isMissedTask } from './missed.ts';
import type { Task } from './types.ts';

const T = (extra: Partial<Task>): Task => ({ id: 't', title: 'Break', completed: false, createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z', ...extra });

test('only a Break with a time is a gap that leaves the day column', () => {
  assert.equal(isTimedBreak(T({ cutsBelow: true, startTime: '11:00' })), true);
  assert.equal(isTimedBreak(T({ cutsBelow: true })), false, 'no time yet: it keeps its card');
  assert.equal(isTimedBreak(T({ startTime: '11:00' })), false, 'an ordinary task stays a card');
});

test('the line says how long the free time is (Shifts S2, plain words): "☕ Free time · 1h 40m"', () => {
  const day = [T({ startTime: '11:00', durationMinutes: 20 }), T({ startTime: '12:30', durationMinutes: 60 }), T({ startTime: '15:00', durationMinutes: 20 })];
  assert.equal(breakLineText(day), '☕ Free time · 1h 40m');
  assert.equal(breakLineText([day[0]]), '☕ Free time · 20m');
  assert.deepEqual(breakGaps(T({ startTime: '11:00' })), { count: 1, minutes: 30 }, 'no length: the 30 minutes it is drawn at');
  assert.deepEqual(breakGaps(T({ startTime: '08:00', extraTimes: ['14:00'], durationMinutes: 15 })), { count: 2, minutes: 30 }, 'each time of the day is a gap');
  assert.equal(breakRowSub(T({ startTime: '11:00', durationMinutes: 20 })), '11:00 · 20m');
});

test('a Break is never missed', () => {
  assert.equal(isMissedTask(T({ dueDate: '2026-11-01' }), '2026-11-09'), true);
  assert.equal(isMissedTask(T({ dueDate: '2026-11-01', cutsBelow: true }), '2026-11-09'), false);
});
