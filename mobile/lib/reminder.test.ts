import test from 'node:test';
import assert from 'node:assert/strict';
import { NEEDS_TIME_HINT, REMINDER_OPTIONS, leadMs, notifyAt, optionEnabled, reminderHint, reminderLabel, reminderState } from './reminder.ts';

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

// ---- Part B, P5: several reminders per timed task ----
import {
  DEFAULT_REMINDERS,
  MAX_TASK_REMINDERS,
  REMINDER_LEADS,
  effectiveReminders,
  leadLabel,
  normalizeReminders,
  reminderPatch,
  remindersText,
  taskRemindersLabel,
  toggleLead,
} from './reminder.ts';

test('P5 normalizeReminders: whole minutes 0 to 1440, distinct, ascending, at most five', () => {
  assert.deepEqual(normalizeReminders([5, 0, 5]), [0, 5]);
  assert.deepEqual(normalizeReminders([30, 10, 5, 0, 60, 1440, 15]), [0, 5, 10, 15, 30]);
  assert.equal(normalizeReminders([1, 2, 3, 4, 5, 6]).length, MAX_TASK_REMINDERS);
  assert.deepEqual(normalizeReminders([-1, 1441, 2.5, '5', null, NaN]), []);
  for (const v of [undefined, null, 5, 'x', {}]) assert.deepEqual(normalizeReminders(v), []);
});

test('P5 effectiveReminders: the task list first (empty = none), then the legacy single value, then the defaults', () => {
  const dflt = [0, 10];
  assert.deepEqual(effectiveReminders({ reminders: [5, 0] }, dflt), [0, 5]);
  assert.deepEqual(effectiveReminders({ reminders: [] }, dflt), [], 'an empty list is a real choice: none');
  assert.deepEqual(effectiveReminders({ reminders: [], reminderMinutes: 5 }, dflt), [], 'the list wins over the legacy value');
  assert.deepEqual(effectiveReminders({ reminderMinutes: 5 }, dflt), [5]);
  assert.deepEqual(effectiveReminders({ reminderMinutes: 0 }, dflt), [0]);
  assert.deepEqual(effectiveReminders({ reminderMinutes: -1 }, dflt), []);
  assert.deepEqual(effectiveReminders({}, dflt), [0, 10]);
  assert.deepEqual(effectiveReminders({ reminderMinutes: null }, dflt), [0, 10]);
  assert.deepEqual(effectiveReminders({ reminderMinutes: 99999 }, dflt), [0, 10], 'an invalid legacy value is the default');
  assert.deepEqual(effectiveReminders({}), [...DEFAULT_REMINDERS], 'no defaults given: at the start');
  assert.deepEqual([...DEFAULT_REMINDERS], [0]);
});

test('P5 toggleLead and reminderPatch: add or remove one, keep ascending, mirror the first into the legacy value', () => {
  assert.deepEqual(toggleLead([0], 5), [0, 5]);
  assert.deepEqual(toggleLead([0, 5], 0), [5]);
  assert.deepEqual(toggleLead([5], 5), []);
  assert.equal(toggleLead([1, 2, 3, 4, 5], 6).length, MAX_TASK_REMINDERS, 'never more than five');
  assert.deepEqual(reminderPatch([5, 0]), { reminders: [0, 5], reminderMinutes: 0 });
  assert.deepEqual(reminderPatch([10]), { reminders: [10], reminderMinutes: 10 });
  assert.deepEqual(reminderPatch([]), { reminders: [], reminderMinutes: -1 }, 'none: an older desktop reads -1 = off');
  assert.deepEqual(reminderPatch('default'), { reminders: undefined, reminderMinutes: undefined });
  assert.ok('reminders' in reminderPatch('default') && 'reminderMinutes' in reminderPatch('default'), 'the keys are present so a patch clears them');
});

test('P5 labels: the leads, the list text and the details row text', () => {
  assert.deepEqual([...REMINDER_LEADS], [0, 5, 10, 15, 30, 60, 1440]);
  assert.equal(leadLabel(0), 'At start time');
  assert.equal(leadLabel(5), '5 minutes before');
  assert.equal(leadLabel(60), '1 hour before');
  assert.equal(leadLabel(120), '2 hours before');
  assert.equal(leadLabel(1440), '1 day before');
  assert.equal(remindersText([]), 'None');
  assert.equal(remindersText([0, 5]), 'At start time, 5 minutes before');
  assert.equal(taskRemindersLabel({}), 'Default (At start time)');
  assert.equal(taskRemindersLabel({}, [0, 5]), 'Default (At start time, 5 minutes before)');
  assert.equal(taskRemindersLabel({ reminders: [5] }), '5 minutes before');
  assert.equal(taskRemindersLabel({ reminders: [] }), 'None');
  assert.equal(taskRemindersLabel({ reminderMinutes: -1 }), 'None');
  assert.equal(taskRemindersLabel({ reminderMinutes: 10 }), '10 minutes before');
});

test('3.18.0: reminders can be chosen before a task has a time: stored as usual, with a hint until it has one', () => {
  assert.equal(NEEDS_TIME_HINT, 'Applies once you set a time');
  assert.equal(reminderHint({}), NEEDS_TIME_HINT, 'no day, no time');
  assert.equal(reminderHint({ dueDate: '2026-11-02' }), NEEDS_TIME_HINT, 'a day but no time');
  assert.equal(reminderHint({ dueDate: '2026-11-02', startTime: '09:00' }), null, 'timed: no hint');
  // The choice on a task with no time is the same stored list as on a timed one (no new column).
  const undated: { reminders?: number[] } = {};
  const next = toggleLead(effectiveReminders(undated, [0]), 5);
  assert.deepEqual(next, [0, 5]);
  assert.deepEqual(reminderPatch(next), reminderPatch([0, 5]));
  // Once a time is set the stored list is read as before.
  assert.deepEqual(effectiveReminders({ reminders: [0, 5] }, [0]), [0, 5]);
});
