import test from 'node:test';
import assert from 'node:assert/strict';
import { openCountText, openTaskCounts } from './labelUsage.ts';

test('counts only open, live tasks per label', () => {
  const counts = openTaskCounts([
    { projectKey: 'a' },
    { projectKey: 'a', completed: false },
    { projectKey: 'a', completed: true },
    { projectKey: 'a', deletedAt: '2026-10-01T00:00:00Z' },
    { projectKey: 'b' },
    {},
  ]);
  assert.equal(counts.get('a'), 2);
  assert.equal(counts.get('b'), 1);
  assert.equal(counts.get('c'), undefined);
});

test('count wording', () => {
  assert.equal(openCountText(0), 'No open tasks');
  assert.equal(openCountText(1), '1 open task');
  assert.equal(openCountText(7), '7 open tasks');
});
