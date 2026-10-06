import test from 'node:test';
import assert from 'node:assert/strict';
import { REMINDER_OPTIONS, leadMs, notifyAt, optionEnabled, reminderLabel, reminderState } from './reminder.ts';

test('states: undefined and null are the default, -1 is off, 0 or more is set', () => {
  assert.equal(reminderState(undefined), 'default');
  assert.equal(reminderState(null), 'default');
  assert.equal(reminderState(-1), 'off');
  assert.equal(reminderState(0), 'set');
  assert.equal(reminderState(30), 'set');
  assert.equal(reminderState(-5), 'default');
  assert.equal(reminderState(2.5), 'default');
});

test('lead time: default is the start time, off is none, n is n minutes before', () => {
  const start = Date.UTC(2026, 9, 7, 9, 30);
  assert.equal(notifyAt(start, undefined), start);
  assert.equal(notifyAt(start, null), start);
  assert.equal(notifyAt(start, 0), start);
  assert.equal(notifyAt(start, 10), start - 600_000);
  assert.equal(notifyAt(start, 60), start - 3_600_000);
  assert.equal(notifyAt(start, -1), null);
  assert.equal(leadMs(-1), null);
});

test('options that need a start time are disabled without one; None never is', () => {
  const none = REMINDER_OPTIONS.find((o) => o.key === 'none')!;
  const ten = REMINDER_OPTIONS.find((o) => o.key === '10')!;
  assert.equal(optionEnabled(none, false), true);
  assert.equal(optionEnabled(ten, false), false);
  assert.equal(optionEnabled(ten, true), true);
  assert.deepEqual(REMINDER_OPTIONS.map((o) => o.value), [-1, 0, 5, 10, 30, 60]);
});

test('labels', () => {
  assert.equal(reminderLabel(undefined), 'Default');
  assert.equal(reminderLabel(-1), 'None');
  assert.equal(reminderLabel(5), '5 minutes before');
  assert.equal(reminderLabel(0), 'At start time');
});
