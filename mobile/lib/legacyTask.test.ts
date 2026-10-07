import test from 'node:test';
import assert from 'node:assert/strict';
import { stripLegacyTaskFields, stripLegacyTasks } from './legacyTask.ts';
import type { Task } from './types.ts';

const base = { id: 'a', title: 'A', completed: false, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' } as Task;

test('a stored task with actualSeconds loses it and keeps everything else', () => {
  const stored = { ...base, durationMinutes: 45, dueDate: '2026-10-08', actualSeconds: 5400 } as unknown as Task;
  const out = stripLegacyTaskFields(stored);
  assert.equal('actualSeconds' in out, false);
  assert.deepEqual(out, { ...base, durationMinutes: 45, dueDate: '2026-10-08' });
});

test('a task without it is returned as the same object', () => {
  assert.equal(stripLegacyTaskFields(base), base);
});

test('a list is cleaned row by row, tombstones included', () => {
  const list = [{ ...base, actualSeconds: 1 }, { ...base, id: 'b', deletedAt: '2026-10-02T00:00:00.000Z', actualSeconds: 0 }] as unknown as Task[];
  const out = stripLegacyTasks(list);
  assert.equal(out.length, 2);
  assert.ok(out.every((t) => !('actualSeconds' in t)));
  assert.equal(out[1].deletedAt, '2026-10-02T00:00:00.000Z');
});

test('a non array is an empty list', () => {
  assert.deepEqual(stripLegacyTasks(null as unknown as Task[]), []);
});
