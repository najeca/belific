import test from 'node:test';
import assert from 'node:assert/strict';
import { cardKeyAction } from './cardKeys.ts';

const on = { onCardItself: true, editable: false, expanded: false, modified: false };

test('Enter on the card toggles it', () => {
  assert.equal(cardKeyAction({ ...on, key: 'Enter' }), 'toggle');
  assert.equal(cardKeyAction({ ...on, key: 'Enter', expanded: true }), 'toggle');
});

test('Escape collapses only an expanded card', () => {
  assert.equal(cardKeyAction({ ...on, key: 'Escape', expanded: true }), 'collapse');
  assert.equal(cardKeyAction({ ...on, key: 'Escape' }), null);
});

test('keys from a field or from a child are never the card key', () => {
  for (const key of ['Enter', 'Escape', ' ']) {
    assert.equal(cardKeyAction({ ...on, key, editable: true, expanded: true }), null, `editable ${key}`);
    assert.equal(cardKeyAction({ ...on, key, onCardItself: false, expanded: true }), null, `child ${key}`);
  }
});

test('Space and other keys do nothing (the 2.12.1 fix)', () => {
  for (const key of [' ', 'Space', 'a', 'Tab', 'ArrowDown']) assert.equal(cardKeyAction({ ...on, key, expanded: true }), null, key);
});

test('a modified Enter is left alone', () => {
  assert.equal(cardKeyAction({ ...on, key: 'Enter', modified: true }), null);
});
