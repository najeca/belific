// Run with `npm test` from mobile/. Task or Break (3.27.0): the stored value stays cutsBelow.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BREAK_HINT, TASK_HINT, breakIgnored, kindOf, kindPatch, showsInside } from './taskKind.ts';

test('Break is cutsBelow true, Task is cutsBelow unset: no new stored value', () => {
  assert.equal(kindOf({ cutsBelow: true }), 'break');
  assert.equal(kindOf({}), 'task');
  assert.equal(kindOf({ cutsBelow: undefined }), 'task');
  assert.deepEqual(kindPatch('break'), { cutsBelow: true });
  assert.deepEqual(kindPatch('task'), { cutsBelow: undefined });
  assert.ok('cutsBelow' in kindPatch('task'), 'Task clears the field (a patch that names it)');
});

test('the words: no "Split" anywhere', () => {
  assert.equal(showsInside('Lunch'), 'Shows inside Lunch');
  assert.equal(breakIgnored('Lunch'), 'Its Break is ignored while it is inside Lunch.');
  for (const s of [TASK_HINT, BREAK_HINT, showsInside('x'), breakIgnored('x')]) assert.ok(!/split/i.test(s), s);
});
