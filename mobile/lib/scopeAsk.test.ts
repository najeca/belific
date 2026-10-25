// Run with `npm test` from mobile/. "This day only / All days" (3.4.0).
import test from 'node:test';
import assert from 'node:assert/strict';
import { answerScope, askScope, isTimeEdit, onScopeQuestion, type ScopeQuestion } from './scopeAsk.ts';

const Q: ScopeQuestion = { title: 'Change the time of a repeating task', fallback: 'all' };

test('with nothing drawn to answer, the question answers null at once (the caller keeps the old behaviour)', async () => {
  assert.equal(await askScope(Q), null);
});

test('a host sees the question, its answer resolves it, and the host is told it is gone', async () => {
  const seen: Array<ScopeQuestion | null> = [];
  const off = onScopeQuestion((q) => seen.push(q));
  const pending = askScope(Q);
  assert.deepEqual(seen, [null, Q]);
  answerScope('day');
  assert.equal(await pending, 'day');
  assert.deepEqual(seen, [null, Q, null]);
  // A late dismissal after an answer changes nothing.
  answerScope(null);
  off();
});

test('a dismissal answers null', async () => {
  const off = onScopeQuestion(() => {});
  const pending = askScope(Q);
  answerScope(null);
  assert.equal(await pending, null);
  off();
});

test('the same change arriving twice (Enter, then blur) shares one answer: both go the same way', async () => {
  const seen: Array<ScopeQuestion | null> = [];
  const off = onScopeQuestion((q) => seen.push(q));
  const first = askScope(Q);
  const second = askScope(Q);
  answerScope('day');
  assert.deepEqual([await first, await second], ['day', 'day']);
  assert.deepEqual(seen, [null, Q, null], 'asked once');
  off();
});

test('only a change of time or length asks', () => {
  assert.equal(isTimeEdit({ startTime: '09:00' }), true);
  assert.equal(isTimeEdit({ durationMinutes: 30 }), true);
  assert.equal(isTimeEdit({ startTime: '09:00', extraTimes: ['15:00'], timesDone: [] }), true);
  assert.equal(isTimeEdit({ timesDone: ['15:00'] }), false, 'a tick is not a time change');
  assert.equal(isTimeEdit({ title: 'x' }), false);
  assert.equal(isTimeEdit({ startTime: '09:00', title: 'x' }), false, 'mixed with a series field');
  assert.equal(isTimeEdit({ dueDate: '2026-10-30', startTime: '09:00' }), false, 'a move, not a time change');
  assert.equal(isTimeEdit({}), false);
});
