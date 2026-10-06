import test from 'node:test';
import assert from 'node:assert/strict';
import { EDITABLE_SELECTOR, isEditableTarget } from './editable.ts';

// A tiny stand-in for a DOM element: closest() answers for a set of tag names.
const el = (editable: boolean) => ({ closest: (sel: string) => (sel === EDITABLE_SELECTOR && editable ? {} : null) });

test('events from an input, textarea, select or contenteditable are editable targets', () => {
  assert.equal(isEditableTarget(el(true)), true);
  for (const part of ['input', 'textarea', 'select', '[contenteditable]']) assert.ok(EDITABLE_SELECTOR.includes(part), part);
});

test('a press on the card itself, a button or text is not editable', () => {
  assert.equal(isEditableTarget(el(false)), false);
});

test('junk targets never throw and are not editable', () => {
  for (const bad of [null, undefined, 3, 'x', {}, { closest: 5 }, { closest: () => { throw new Error('boom'); } }]) {
    assert.equal(isEditableTarget(bad), false);
  }
  assert.equal(isEditableTarget({ closest: () => undefined }), false);
});
