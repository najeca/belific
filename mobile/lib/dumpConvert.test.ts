import test from 'node:test';
import assert from 'node:assert/strict';
import { createDumpConverter } from './dumpConvert.ts';
import { splitThoughts } from './thoughts.ts';
import type { BrainDumpItem, Task } from './types.ts';

const item: BrainDumpItem = { id: 'legacy1', title: 'From the phone', notes: 'n', createdAt: '2026-10-01T08:00:00.000Z', updatedAt: '2026-10-01T08:00:00.000Z' };

function world() {
  const tasks = new Map<string, Task>();
  const dump = new Map<string, BrainDumpItem>([[item.id, item]]);
  let n = 0;
  const conv = createDumpConverter({
    newId: () => `task${++n}`,
    nowIso: () => '2026-10-07T10:00:00.000Z',
    addTask: async (t) => {
      await Promise.resolve();
      tasks.set(t.id, t);
    },
    updateTask: async (t) => void tasks.set(t.id, t),
    deleteDumpItem: async (id) => {
      await Promise.resolve();
      dump.delete(id);
    },
  });
  return { tasks, dump, conv };
}
const left = (w: ReturnType<typeof world>) => splitThoughts([...w.tasks.values()], [...w.dump.values()], '2026-10-07').rows;

test('first edit converts in place: one Task, the legacy item gone from the left list', async () => {
  const w = world();
  assert.deepEqual(left(w).map((r) => r.kind), ['dump']);
  await w.conv.edit(item, { priority: 'high' });
  assert.equal(w.tasks.size, 1);
  assert.equal(w.dump.size, 0);
  assert.deepEqual(left(w).map((r) => r.kind), ['task'], 'exactly one row, and it is the task');
  const t = [...w.tasks.values()][0];
  assert.equal(t.title, 'From the phone');
  assert.equal(t.notes, 'n');
  assert.equal(t.priority, 'high');
  assert.equal(t.createdAt, item.createdAt);
});

test('several edits fired together never create a duplicate task', async () => {
  const w = world();
  await Promise.all([
    w.conv.edit(item, { priority: 'high' }),
    w.conv.edit(item, { projectKey: 'work' }),
    w.conv.edit(item, { durationMinutes: 30 }),
  ]);
  assert.equal(w.tasks.size, 1);
  assert.equal(w.dump.size, 0);
  const t = [...w.tasks.values()][0];
  assert.deepEqual([t.priority, t.projectKey, t.durationMinutes], ['high', 'work', 30]);
  // a later edit still updates the same task
  await w.conv.edit(item, { title: 'Renamed' });
  assert.equal(w.tasks.size, 1);
  assert.equal([...w.tasks.values()][0].title, 'Renamed');
  assert.equal(left(w).length, 1);
});

test('a failed write is retried cleanly, not duplicated', async () => {
  const w = world();
  let fail = true;
  const c = createDumpConverter({
    newId: () => 'tX',
    nowIso: () => '2026-10-07T10:00:00.000Z',
    addTask: async (t) => {
      if (fail) throw new Error('disk');
      w.tasks.set(t.id, t);
    },
    updateTask: async (t) => void w.tasks.set(t.id, t),
    deleteDumpItem: async (id) => void w.dump.delete(id),
  });
  await assert.rejects(c.edit(item, { priority: 'low' }));
  assert.equal(w.dump.size, 1, 'the legacy item is kept when the task could not be written');
  fail = false;
  await c.edit(item, { priority: 'low' });
  assert.equal(w.tasks.size, 1);
  assert.equal(w.dump.size, 0);
});
