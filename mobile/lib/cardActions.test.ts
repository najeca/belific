// Run with `npm test` from mobile/. The task card's actions, shared by the phone's press and hold card and the desktop's
// right click menu (PLAN_desktop_parity D1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DELETE_CHOICES, cardActions, deleteAsks, skipNote } from './cardActions.ts';

test('a one off task: Done, Edit, Move, Delete, More; Delete does not ask', () => {
  assert.deepEqual(cardActions({}, false).map((a) => a.label), ['Done', 'Edit', 'Move', 'Delete', 'More']);
  assert.equal(cardActions({}, false)[0].primary, true);
  assert.equal(deleteAsks({}), false);
});

test('a repeating task adds Skip today after Edit; Delete asks Only today or Every day', () => {
  const r = { recurrence: 'daily' };
  assert.deepEqual(cardActions(r, true).map((a) => a.id), ['done', 'edit', 'skip', 'move', 'delete', 'more']);
  assert.equal(cardActions(r, true)[0].label, 'Not done');
  assert.equal(deleteAsks(r), true);
  assert.deepEqual(DELETE_CHOICES.map((a) => a.label), ['Only today', 'Every day']);
  assert.equal(skipNote(), 'Skip today: not today. It still repeats next time.');
});
