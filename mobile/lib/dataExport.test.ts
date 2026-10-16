// Run with `npm test` from mobile/. Data export (build plan phase 6).
import test from 'node:test';
import assert from 'node:assert/strict';
import { TASK_CSV_HEADERS, buildExport, exportMessage, looksSecret, type ExportInput } from './dataExport.ts';

const STAMP = '2026-09-01T00:00:00.000Z';
const input = (): ExportInput => ({
  tasks: [
    { id: 't1', title: 'Write, "report"', completed: true, completedAt: STAMP, createdAt: STAMP, updatedAt: STAMP, projectKey: 'w', listKey: 'l1', durationMinutes: 30, actualMinutes: 25, notes: '=evil', subtasks: [{ id: 's', title: 'Outline', done: true }] },
    { id: 't2', title: 'Plain', completed: false, createdAt: STAMP, updatedAt: STAMP },
    { id: 't3', title: 'Deleted one', completed: false, createdAt: STAMP, updatedAt: STAMP, deletedAt: STAMP },
  ],
  labels: [{ key: 'w', name: 'Work', createdAt: STAMP, updatedAt: STAMP }],
  lists: [{ key: 'l1', name: 'Reading', sortOrder: 0, createdAt: STAMP, updatedAt: STAMP }],
  settings: [
    { key: 'feature.pomodoro', value: 'on', updatedAt: STAMP },
    { key: 'auth.refresh_token', value: 'SECRET-TOKEN-VALUE', updatedAt: STAMP },
    { key: 'ui.panes', value: '{}', updatedAt: STAMP, deletedAt: STAMP },
  ],
  events: [],
  categories: [],
  routines: [{ id: 'r1', title: 'Stretch', timeOfDay: 'morning', createdAt: STAMP, updatedAt: STAMP }],
  routineCompletions: [{ routineId: 'r1', date: '2026-10-01', completedAt: STAMP }],
  brainDumpItems: [{ id: 'b1', title: 'Old thought', notes: '', createdAt: STAMP, updatedAt: STAMP }],
});

test('it counts the rows it exports, deleted rows left out', () => {
  const r = buildExport(input(), '2.23.0', '2026-10-16T12:00:00.000Z');
  assert.deepEqual(r.counts, { tasks: 2, labels: 1, lists: 1, settings: 1, events: 0, categories: 0, routines: 1, routineCompletions: 1, brainDumpItems: 1 });
  assert.equal(r.total, 8);
  const parsed = JSON.parse(r.json);
  assert.equal(parsed.app, 'Belific');
  assert.equal(parsed.version, '2.23.0');
  assert.equal(parsed.exportedAt, '2026-10-16T12:00:00.000Z');
  assert.deepEqual(parsed.counts, r.counts);
  assert.equal(parsed.tables.tasks.length, 2);
  assert.ok(!r.json.includes('Deleted one'));
});

test('no auth token, secret or session ever leaves: a secret looking setting is withheld and counted', () => {
  const r = buildExport(input(), '2.23.0', STAMP);
  assert.ok(!r.json.includes('SECRET-TOKEN-VALUE'));
  assert.ok(!r.json.includes('refresh_token'));
  assert.ok(!r.csv.includes('SECRET-TOKEN-VALUE'));
  assert.equal(r.withheld, 1);
  // a field with a secret looking name on any row is dropped too
  const dirty = input();
  (dirty.tasks[0] as unknown as Record<string, unknown>).accessToken = 'LEAK';
  (dirty.labels[0] as unknown as Record<string, unknown>).session = 'LEAK2';
  const d = buildExport(dirty, 'x', STAMP);
  assert.ok(!d.json.includes('LEAK'));
  assert.equal(d.withheld, 3);
  for (const name of ['token', 'access_token', 'refreshToken', 'client_secret', 'password', 'session', 'apiKey', 'api_key', 'credentials', 'auth.x']) assert.equal(looksSecret(name), true, name);
  for (const name of ['title', 'notes', 'timerStartedAt', 'feature.pomodoro', 'ui.panes', 'template.1']) assert.equal(looksSecret(name), false, name);
});

test('the CSV is the tasks, one row each, with label and list named and formulas written as text', () => {
  const r = buildExport(input(), 'x', STAMP);
  const lines = r.csv.trim().split('\r\n');
  assert.equal(lines[0], TASK_CSV_HEADERS.join(','));
  assert.equal(lines.length, 3, 'a header and two tasks');
  assert.ok(r.csv.includes('"Write, ""report"""'));
  assert.ok(r.csv.includes(',Work,Reading,'));
  assert.ok(r.csv.includes("'=evil"));
  assert.ok(r.csv.includes('[x] Outline'));
});

test('the message says how many rows', () => {
  const r = buildExport(input(), 'x', STAMP);
  assert.equal(exportMessage(r, 'json'), 'Exported 8 rows: 2 tasks, 1 label, 1 list, 1 setting, 1 routine, 1 routine tick, 1 old Brain Dump item. 1 secret-looking entry was left out.');
  assert.equal(exportMessage(r, 'csv'), 'Exported 2 tasks to CSV (one row each). The JSON file has everything.');
  const empty = buildExport({ tasks: [], labels: [], lists: [], settings: [], events: [], categories: [], routines: [], routineCompletions: [], brainDumpItems: [] }, 'x', STAMP);
  assert.equal(exportMessage(empty, 'json'), 'Exported 0 rows.');
  assert.equal(empty.total, 0);
});

test('only the known tables are written (nothing else on the device can slip in)', () => {
  const parsed = JSON.parse(buildExport(input(), 'x', STAMP).json);
  assert.deepEqual(Object.keys(parsed.tables).sort(), ['brainDumpItems', 'categories', 'events', 'labels', 'lists', 'routineCompletions', 'routines', 'settings', 'tasks']);
});
