import test from 'node:test';
import assert from 'node:assert/strict';
import { cardKeyAction } from './cardKeys.ts';

const on = { onCardItself: true, editable: false, modified: false };

test('Enter on the card opens its details (2.27.0: no expanding in place)', () => {
  assert.equal(cardKeyAction({ ...on, key: 'Enter' }), 'open');
});

test('Escape is not the card key any more (nothing to collapse)', () => {
  assert.equal(cardKeyAction({ ...on, key: 'Escape' }), null);
});

test('keys from a field or from a child are never the card key', () => {
  for (const key of ['Enter', 'Escape', ' ']) {
    assert.equal(cardKeyAction({ ...on, key, editable: true }), null, `editable ${key}`);
    assert.equal(cardKeyAction({ ...on, key, onCardItself: false }), null, `child ${key}`);
  }
});

test('Space and other keys do nothing (the 2.12.1 fix)', () => {
  for (const key of [' ', 'Space', 'a', 'Tab', 'ArrowDown']) assert.equal(cardKeyAction({ ...on, key }), null, key);
});

test('a modified Enter is left alone', () => {
  assert.equal(cardKeyAction({ ...on, key: 'Enter', modified: true }), null);
});
