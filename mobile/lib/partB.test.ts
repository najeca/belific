// Run with `npm test` from mobile/. Part B data (migration 004, NOT APPLIED): the
// sanitisers and mappers, what is kept locally while the columns are missing,
// what a copy carries, and that 004 is additive only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  MAX_REMINDERS,
  hasPartBValues,
  preserveFieldsFor,
  sanitizeCuts,
  sanitizeReminders,
  taskFromRemote,
  taskToRemote,
  type Caps,
} from './syncCore.ts';
import { duplicateTask } from './taskCopy.ts';
import type { Task } from './types.ts';

const base: Task = { id: 't', title: 'T', completed: false, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' };
const live: Caps = { serverUpdatedAt: true, taskPipeline: true, taskExtras: true, planner: true, partB: true };
const notYet: Caps = { ...live, partB: false };

test('sanitizeCuts: only true is a value; everything else is NULL (off is the default)', () => {
  assert.equal(sanitizeCuts(true), true);
  for (const v of [false, 0, 1, 'true', null, undefined, {}]) assert.equal(sanitizeCuts(v), null);
});

test('sanitizeReminders: whole minutes 0 to 1440, distinct, ascending, at most five; an empty list is a value; junk is NULL', () => {
  assert.deepEqual(sanitizeReminders([5, 0]), [0, 5]);
  assert.deepEqual(sanitizeReminders([5, 5, 0, 5]), [0, 5]);
  assert.deepEqual(sanitizeReminders([]), []);
  assert.deepEqual(sanitizeReminders([0, 1440, 1441, -1, 2.5, '5', null, NaN]), [0, 1440]);
  assert.equal(sanitizeReminders([1, 2, 3, 4, 5, 6, 7])?.length, MAX_REMINDERS);
  for (const v of [null, undefined, 5, '0,5', {}, true]) assert.equal(sanitizeReminders(v), null);
});

test('taskToRemote: the two columns are sent only when the server has both (caps.partB)', () => {
  const t = { ...base, cutsBelow: true, reminders: [5, 0] };
  const sent = taskToRemote(t, live);
  assert.equal(sent.cuts_below, true);
  assert.deepEqual(sent.reminders, [0, 5]);
  const held = taskToRemote(t, notYet);
  assert.ok(!('cuts_below' in held) && !('reminders' in held), 'never named while migration 004 is missing');
  assert.ok(!('cuts_below' in taskToRemote(t, { serverUpdatedAt: true, taskPipeline: true })), 'nor with an old caps value');
  // a task without them is sent as NULL, not as false or an empty list
  const plain = taskToRemote(base, live);
  assert.equal(plain.cuts_below, null);
  assert.equal(plain.reminders, null);
});

test('taskFromRemote: reads the columns, and a row without them (an older client) has neither value', () => {
  const row = { id: 't', title: 'T', completed: false, created_at: base.createdAt, updated_at: base.updatedAt };
  const withValues = taskFromRemote({ ...row, cuts_below: true, reminders: [10, 0] });
  assert.equal(withValues.cutsBelow, true);
  assert.deepEqual(withValues.reminders, [0, 10]);
  const without = taskFromRemote(row);
  assert.equal(without.cutsBelow, undefined);
  assert.equal(without.reminders, undefined);
  const bad = taskFromRemote({ ...row, cuts_below: 'yes', reminders: 'soon' });
  assert.equal(bad.cutsBelow, undefined);
  assert.equal(bad.reminders, undefined);
  assert.deepEqual(taskFromRemote({ ...row, reminders: [] }).reminders, [], 'an empty list survives the round trip');
});

test('preserveFieldsFor: the two fields are kept from the local row exactly while partB is missing', () => {
  assert.ok(preserveFieldsFor('tasks', notYet).includes('cutsBelow'));
  assert.ok(preserveFieldsFor('tasks', notYet).includes('reminders'));
  assert.ok(!preserveFieldsFor('tasks', live).includes('cutsBelow'));
  assert.ok(!preserveFieldsFor('tasks', live).includes('reminders'));
  assert.ok(preserveFieldsFor('tasks', { serverUpdatedAt: true, taskPipeline: true }).includes('cutsBelow'), 'an old caps value reads as missing');
  assert.deepEqual(preserveFieldsFor('projects', live), []);
});

test('hasPartBValues: a task holding a true switch or a reminder list (even an empty one) is queued when the columns appear', () => {
  assert.equal(hasPartBValues('tasks', { cutsBelow: true }), true);
  assert.equal(hasPartBValues('tasks', { reminders: [] }), true);
  assert.equal(hasPartBValues('tasks', { reminders: [0] }), true);
  assert.equal(hasPartBValues('tasks', { title: 'x' }), false);
  assert.equal(hasPartBValues('tasks', { cutsBelow: false }), false);
  assert.equal(hasPartBValues('projects', { cutsBelow: true }), false);
});

test('004_part_b.sql says NOT APPLIED, is additive only and keeps the rollback commented out', () => {
  const file = path.join(import.meta.dirname, '..', 'supabase', 'belific_schema', '004_part_b.sql');
  const sql = fs.readFileSync(file, 'utf8');
  assert.match(sql.split('\n').slice(0, 8).join('\n'), /NOT APPLIED\. DO NOT RUN/);
  const code = sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Part B's two columns, and since 2026-10-21 (still unapplied) Part C's two.
  assert.match(code, /^begin; alter table belific\.tasks add column cuts_below boolean, add column reminders jsonb, add column extra_times jsonb, add column times_done jsonb ?; commit;$/);
  assert.ok(!/\b(drop|delete|update|truncate|grant|revoke|default|not null|check)\b/i.test(code), 'nothing destructive, no default, no constraint');
  assert.match(sql, /^-- {3}drop column if exists reminders,/m, 'the rollback is there, as comments');
  assert.match(sql, /^-- {3}drop column if exists times_done,/m, 'and it drops the Part C columns too');
  assert.match(sql, /^-- {3}drop column if exists extra_times,/m);
  assert.ok(!/^drop /im.test(code));
  const readme = fs.readFileSync(path.join(path.dirname(file), 'README.md'), 'utf8');
  assert.match(readme, /004_part_b\.sql.*NOT APPLIED/);
});

test('a duplicate carries the switch and the reminder list (a copy of the array, not the same one)', () => {
  const t: Task = { ...base, dueDate: '2026-10-20', cutsBelow: true, reminders: [0, 5] };
  const dup = duplicateTask(t, 'copy', '2026-10-20T00:00:00.000Z', (i) => `s${i}`);
  assert.equal(dup.cutsBelow, true);
  assert.deepEqual(dup.reminders, [0, 5]);
  assert.notEqual(dup.reminders, t.reminders);
});
