// Run with `npm test` from mobile/. Part C data (migration 004, NOT APPLIED): the
// sanitisers and mappers for extra_times and times_done, what is kept locally while
// the columns are missing, and that the one unapplied file stays additive and flagged.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  MAX_EXTRA_TIMES,
  MAX_TIMES_DONE,
  hasPartCValues,
  preserveFieldsFor,
  sanitizeExtraTimes,
  sanitizeTimesDone,
  taskFromRemote,
  taskToRemote,
  type Caps,
} from './syncCore.ts';
import type { Task } from './types.ts';

const base: Task = { id: 't', title: 'T', completed: false, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' };
const live: Caps = { serverUpdatedAt: true, taskPipeline: true, taskExtras: true, planner: true, partB: true, partC: true };
const notYet: Caps = { ...live, partC: false };

test('sanitizeExtraTimes: valid HH:mm only, distinct, ascending, at most six; an empty or unreadable list is NULL', () => {
  assert.deepEqual(sanitizeExtraTimes(['15:00', '09:30']), ['09:30', '15:00']);
  assert.deepEqual(sanitizeExtraTimes(['15:00', '15:00', '09:30']), ['09:30', '15:00']);
  assert.deepEqual(sanitizeExtraTimes(['24:00', '9:30', '12:60', 'noon', 5, null, '00:00', '23:59']), ['00:00', '23:59']);
  assert.equal(sanitizeExtraTimes(['01:00', '02:00', '03:00', '04:00', '05:00', '06:00', '07:00', '08:00'])?.length, MAX_EXTRA_TIMES);
  for (const v of [[], null, undefined, '15:00', 15, {}, true, ['x']]) assert.equal(sanitizeExtraTimes(v), null);
});

test('sanitizeTimesDone: the same rules, with room for the start time as well (seven)', () => {
  assert.deepEqual(sanitizeTimesDone(['15:00', '11:00']), ['11:00', '15:00']);
  assert.equal(sanitizeTimesDone(['01:00', '02:00', '03:00', '04:00', '05:00', '06:00', '07:00', '08:00'])?.length, MAX_TIMES_DONE);
  assert.equal(MAX_TIMES_DONE, MAX_EXTRA_TIMES + 1);
  assert.equal(sanitizeTimesDone([]), null);
});

test('taskToRemote: the two columns are sent only when the server has both (caps.partC), else never named', () => {
  const t = { ...base, startTime: '11:00', extraTimes: ['15:00'], timesDone: ['11:00'] };
  const sent = taskToRemote(t, live);
  assert.deepEqual(sent.extra_times, ['15:00']);
  assert.deepEqual(sent.times_done, ['11:00']);
  const held = taskToRemote(t, notYet);
  assert.ok(!('extra_times' in held) && !('times_done' in held), 'never named while migration 004 (Part C) is missing');
  assert.ok(!('extra_times' in taskToRemote(t, { serverUpdatedAt: true, taskPipeline: true })), 'nor with an old caps value');
  const plain = taskToRemote(base, live);
  assert.equal(plain.extra_times, null);
  assert.equal(plain.times_done, null);
  // Part B on its own does not name the Part C columns
  const bOnly = taskToRemote(t, notYet);
  assert.ok('cuts_below' in bOnly && !('extra_times' in bOnly));
});

test('taskFromRemote: reads both columns, sanitised; a row without them has none', () => {
  const row = { id: 'x', title: 'X', created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z', completed: false };
  const withValues = taskFromRemote({ ...row, extra_times: ['15:00', '09:30'], times_done: ['09:30'] });
  assert.deepEqual(withValues.extraTimes, ['09:30', '15:00']);
  assert.deepEqual(withValues.timesDone, ['09:30']);
  const without = taskFromRemote(row);
  assert.equal(without.extraTimes, undefined);
  assert.equal(without.timesDone, undefined);
  const bad = taskFromRemote({ ...row, extra_times: 'afternoon', times_done: [1, 2] });
  assert.equal(bad.extraTimes, undefined);
  assert.equal(bad.timesDone, undefined);
});

test('preserveFieldsFor: the two fields are kept from the local row exactly while partC is missing', () => {
  assert.ok(preserveFieldsFor('tasks', notYet).includes('extraTimes'));
  assert.ok(preserveFieldsFor('tasks', notYet).includes('timesDone'));
  assert.ok(!preserveFieldsFor('tasks', live).includes('extraTimes'));
  assert.ok(preserveFieldsFor('tasks', { serverUpdatedAt: true, taskPipeline: true }).includes('timesDone'), 'an old caps value reads as missing');
  assert.ok(!preserveFieldsFor('projects', notYet).includes('extraTimes'));
  // Part B and Part C are independent
  assert.ok(!preserveFieldsFor('tasks', { ...live, partB: false }).includes('extraTimes'));
  assert.ok(!preserveFieldsFor('tasks', notYet).includes('cutsBelow'));
});

test('hasPartCValues: a task holding extra times or ticked times is queued when the columns appear', () => {
  assert.equal(hasPartCValues('tasks', { extraTimes: ['15:00'] }), true);
  assert.equal(hasPartCValues('tasks', { timesDone: ['11:00'] }), true);
  assert.equal(hasPartCValues('tasks', { title: 'x' }), false);
  assert.equal(hasPartCValues('projects', { extraTimes: ['15:00'] }), false);
});

test('004_part_b.sql carries the Part C columns: nullable jsonb, no default, still NOT APPLIED and additive, rollback listed', () => {
  const dir = path.join(import.meta.dirname, '..', 'supabase', 'belific_schema');
  const sql = fs.readFileSync(path.join(dir, '004_part_b.sql'), 'utf8');
  assert.match(sql.split('\n').slice(0, 8).join('\n'), /NOT APPLIED\. DO NOT RUN/, 'the header keeps its warning');
  const code = sql
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  assert.match(code, /add column extra_times jsonb, add column times_done jsonb ?; commit;$/);
  assert.ok(!/\b(drop|delete|update|truncate|grant|revoke|default|not null|check)\b/i.test(code), 'nothing destructive, no default, no constraint');
  for (const c of ['extra_times', 'times_done']) assert.match(sql, new RegExp(`^-- {3}drop column if exists ${c},`, 'm'), `${c} is in the commented rollback`);
  const readme = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
  assert.match(readme, /004_part_b\.sql.*NOT APPLIED/);
  assert.match(readme, /extra_times/);
});
