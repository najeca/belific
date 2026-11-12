// Run with `npm test` from mobile/. Repeat until and Parts, R1 (migration 005): the sanitisers,
// the mappers in both directions, what is kept locally while the columns are missing, and the
// queueing helper. The engine tests (strict fake server, appearing later, older builds) are in
// syncEngine.test.ts; the probe is in schemaProfile.test.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasRepeatPartsValues,
  preserveFieldsFor,
  sanitizeDateOnly,
  sanitizeId,
  taskFromRemote,
  taskToRemote,
  type Caps,
} from './syncCore.ts';
import type { Task } from './types.ts';

const base: Task = { id: 't', title: 'T', completed: false, createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z' };
const live: Caps = { serverUpdatedAt: true, taskPipeline: true, taskExtras: true, planner: true, partB: true, partC: true, repeatParts: true };
const notYet: Caps = { ...live, repeatParts: false };

test('sanitizeDateOnly: a real calendar day or NULL (a bad date would fail the whole batch)', () => {
  for (const v of ['2026-12-17', '2028-02-29', '2026-01-01']) assert.equal(sanitizeDateOnly(v), v);
  for (const v of ['2026-02-30', '2027-02-29', '2026-13-01', '2026-12-32', '2026-1-1', '17/12/2026', '', '0099-01-01', 20261217, null, undefined, {}])
    assert.equal(sanitizeDateOnly(v), null, String(v));
});

test('sanitizeId: a non-empty id of a sane length', () => {
  assert.equal(sanitizeId('abc'), 'abc');
  assert.equal(sanitizeId('root-1:2026-11-16'), 'root-1:2026-11-16');
  for (const v of ['', 'x'.repeat(201), 5, null, undefined]) assert.equal(sanitizeId(v), null);
});

test('taskToRemote: both columns are sent only when the server has them (caps.repeatParts), as NULL when unset', () => {
  const t: Task = { ...base, repeatUntil: '2026-12-17', parentId: 'p' };
  const sent = taskToRemote(t, live);
  assert.equal(sent.repeat_until, '2026-12-17');
  assert.equal(sent.parent_id, 'p');
  const held = taskToRemote(t, notYet);
  assert.ok(!('repeat_until' in held) && !('parent_id' in held), 'never named while migration 005 is missing');
  assert.ok(!('parent_id' in taskToRemote(t, { serverUpdatedAt: true, taskPipeline: true })), 'nor with an old stored caps value');
  const plain = taskToRemote(base, live);
  assert.equal(plain.repeat_until, null);
  assert.equal(plain.parent_id, null);
  // junk never reaches the server; a task is never its own part
  const junk = taskToRemote({ ...base, repeatUntil: '2026-02-30', parentId: '' }, live);
  assert.equal(junk.repeat_until, null);
  assert.equal(junk.parent_id, null);
  assert.equal(taskToRemote({ ...base, parentId: 't' }, live).parent_id, null);
});

test('taskFromRemote: reads both columns; a row without them (an older client or before 005) has neither', () => {
  const row = { id: 'c', title: 'Bench press', completed: false, created_at: base.createdAt, updated_at: base.updatedAt };
  const withValues = taskFromRemote({ ...row, repeat_until: '2026-12-17', parent_id: 'p' });
  assert.equal(withValues.repeatUntil, '2026-12-17');
  assert.equal(withValues.parentId, 'p');
  for (const r of [row, { ...row, repeat_until: null, parent_id: null }, { ...row, repeat_until: 'nope', parent_id: 'c' }]) {
    const t = taskFromRemote(r);
    assert.equal(t.repeatUntil, undefined);
    assert.equal(t.parentId, undefined);
  }
});

test('round trip: an end date and a parent link come back unchanged', () => {
  const t: Task = { ...base, id: 'c', recurrence: 'weekly', recurrenceDays: ['Mon', 'Thu'], repeatUntil: '2026-12-17', parentId: 'root-1' };
  const back = taskFromRemote(taskToRemote(t, live));
  assert.equal(back.repeatUntil, '2026-12-17');
  assert.equal(back.parentId, 'root-1');
  const none = taskFromRemote(taskToRemote({ ...base }, live));
  assert.equal(none.repeatUntil, undefined);
  assert.equal(none.parentId, undefined);
});

test('kept locally until the probe sees both columns; queued again only for rows that hold a value', () => {
  assert.deepEqual(preserveFieldsFor('tasks', notYet), ['repeatUntil', 'parentId']);
  assert.deepEqual(preserveFieldsFor('tasks', live), []);
  assert.deepEqual(preserveFieldsFor('projects', notYet), []);
  assert.equal(hasRepeatPartsValues('tasks', { repeatUntil: '2026-12-17' }), true);
  assert.equal(hasRepeatPartsValues('tasks', { parentId: 'p' }), true);
  assert.equal(hasRepeatPartsValues('tasks', { title: 'x' }), false);
  assert.equal(hasRepeatPartsValues('tasks', { repeatUntil: 'junk', parentId: '' }), false);
  assert.equal(hasRepeatPartsValues('projects', { parentId: 'p' }), false);
});
