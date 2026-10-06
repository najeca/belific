// Run with `npm test` from mobile/. Label names, suggestions and deletion
// (checkpoint 4.3).
import test from 'node:test';
import assert from 'node:assert/strict';
import { availableSuggestions, deletedLabelTarget, findLabelByName, normalizeName, renameProblem } from './labelRules.ts';
import { LABEL_SUGGESTIONS } from './labelSuggestions.ts';

const L = (key: string, name: string, deletedAt?: string) => ({ key, name, deletedAt });

test('names compare trimmed and case insensitively', () => {
  assert.equal(normalizeName('  Work '), 'work');
  const labels = [L('a', 'Work'), L('b', 'Home')];
  assert.equal(findLabelByName(labels, ' work ')?.key, 'a');
  assert.equal(findLabelByName(labels, 'WORK')?.key, 'a');
  assert.equal(findLabelByName(labels, 'Gym'), undefined);
  assert.equal(findLabelByName(labels, '   '), undefined);
  // Deleted labels do not count; one key can be excluded (rename)
  assert.equal(findLabelByName([L('a', 'Work', 'x')], 'Work'), undefined);
  assert.equal(findLabelByName(labels, 'Work', 'a'), undefined);
});

test('the ten suggestions, minus the ones already used', () => {
  assert.deepEqual([...LABEL_SUGGESTIONS], ['Work', 'Study', 'Health', 'Fitness', 'Home', 'Errands', 'Money', 'Social', 'Admin', 'Personal']);
  assert.equal(availableSuggestions([]).length, 10);
  const left = availableSuggestions([L('a', 'work'), L('b', ' HOME '), L('c', 'Gym'), L('d', 'Money', 'deleted')]);
  assert.deepEqual(left, ['Study', 'Health', 'Fitness', 'Errands', 'Money', 'Social', 'Admin', 'Personal']);
});

test('rename rejects blanks and duplicates, allows a change of case', () => {
  const labels = [L('a', 'Work'), L('b', 'Home')];
  assert.equal(renameProblem(labels, 'a', '  '), 'Enter a name');
  assert.equal(renameProblem(labels, 'a', 'home'), 'Another label already has that name');
  assert.equal(renameProblem(labels, 'a', 'WORK'), null);
  assert.equal(renameProblem(labels, 'a', 'Office'), null);
});

test('deleting one of two duplicates moves its tasks to the other; otherwise none', () => {
  const labels = [L('a', 'Work'), L('b', 'work '), L('c', 'Home'), L('d', 'Home', 'x')];
  assert.equal(deletedLabelTarget(labels, 'a'), 'b');
  assert.equal(deletedLabelTarget(labels, 'b'), 'a');
  // The only live "Home": tasks lose their label (a deleted twin does not count)
  assert.equal(deletedLabelTarget(labels, 'c'), undefined);
  assert.equal(deletedLabelTarget(labels, 'missing'), undefined);
});
