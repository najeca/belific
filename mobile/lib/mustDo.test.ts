import test from 'node:test';
import assert from 'node:assert/strict';
import { isMustDo, mustDoFirst, mustDoPatch } from './mustDo.ts';

test('Must do is the stored high priority; low and none are not', () => {
  assert.equal(isMustDo({ priority: 'high' }), true);
  assert.equal(isMustDo({ priority: 'low' }), false);
  assert.equal(isMustDo({}), false);
});

test('on writes high, off writes the new task default (no priority)', () => {
  assert.deepEqual(mustDoPatch(true), { priority: 'high' });
  assert.deepEqual(mustDoPatch(false), { priority: undefined });
  assert.ok('priority' in mustDoPatch(false), 'the key is present so a patch clears it');
});

test('Must do first, otherwise the order is kept', () => {
  const rows = [{ id: 'a' }, { id: 'b', priority: 'high' as const }, { id: 'c', priority: 'low' as const }, { id: 'd', priority: 'high' as const }];
  assert.deepEqual(mustDoFirst(rows).map((r) => r.id), ['b', 'd', 'a', 'c']);
});
