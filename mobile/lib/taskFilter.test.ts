import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_FILTER, filterCount, filterTasks, matchesLabels, parseFilter, pruneFilter, serializeFilter, taskVisible, toggleLabel } from './taskFilter.ts';

const t = (projectKey: string | undefined, completed = false) => ({ projectKey, completed });

test('no filter: every open task shows, completed are hidden by default', () => {
  assert.equal(taskVisible(t('a'), EMPTY_FILTER), true);
  assert.equal(taskVisible(t(undefined), EMPTY_FILTER), true);
  assert.equal(taskVisible(t('a', true), EMPTY_FILTER), false);
  assert.equal(filterCount(EMPTY_FILTER), 0);
});

test('labels are multi select and only those show', () => {
  const f = toggleLabel(toggleLabel(EMPTY_FILTER, 'a'), 'b');
  assert.deepEqual(filterTasks([t('a'), t('b'), t('c'), t(undefined)], f).map((x) => x.projectKey), ['a', 'b']);
  assert.equal(filterCount(f), 2);
  assert.deepEqual(toggleLabel(f, 'a').labels, ['b']);
});

test('"No label" shows unlabelled tasks, alone or with labels', () => {
  const only = { ...EMPTY_FILTER, noLabel: true };
  assert.deepEqual(filterTasks([t('a'), t(undefined)], only).map((x) => x.projectKey), [undefined]);
  const both = { ...only, labels: ['a'] };
  assert.equal(filterTasks([t('a'), t('b'), t(undefined)], both).length, 2);
  assert.equal(filterCount(both), 2);
});

test('Show complete reveals completed tasks and counts as one', () => {
  const f = { ...EMPTY_FILTER, showComplete: true };
  assert.equal(taskVisible(t('a', true), f), true);
  assert.equal(filterCount(f), 1);
  assert.equal(filterCount({ labels: ['a'], noLabel: true, showComplete: true }), 3);
  // the left pane Done today line uses the label rule only
  assert.equal(matchesLabels(t('a', true), EMPTY_FILTER), true);
  assert.equal(matchesLabels(t('b', true), { ...EMPTY_FILTER, labels: ['a'] }), false);
});

test('events are not tasks: the filter helpers only ever see tasks', () => {
  // A CustomEvent has no projectKey/completed; the panes never pass events in.
  const events = [{ id: 'e1' }, { id: 'e2' }];
  const f = { labels: ['a'], noLabel: false, showComplete: false };
  assert.equal(events.length, 2);
  assert.equal(filterTasks([] as ReturnType<typeof t>[], f).length, 0);
});

test('persisting: round trip, junk reads as empty, deleted labels are pruned', () => {
  const f = { labels: ['a', 'b'], noLabel: true, showComplete: true };
  assert.deepEqual(parseFilter(serializeFilter(f)), f);
  assert.deepEqual(parseFilter('nope'), EMPTY_FILTER);
  assert.deepEqual(parseFilter(null), EMPTY_FILTER);
  assert.deepEqual(parseFilter('{"labels":[1,"x"],"noLabel":"yes"}'), { labels: ['x'], noLabel: false, showComplete: false });
  assert.deepEqual(pruneFilter(f, ['b']).labels, ['b']);
});
