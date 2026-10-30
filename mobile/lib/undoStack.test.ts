// Run with `npm test` from mobile/. Undo and redo of task changes on the desktop (3.21.0, lib/undoStack.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { GROUP_GAP_MS, UNDO_LIMIT, UndoStack, labelOf, sameRow, stepStack, verbOf, type StepOutcome } from './undoStack.ts';
import { planMoveDay, planSkip, planThisDayEdit, projectOccurrences, seriesOfRows } from './series.ts';
import { mergeRows, type OutboxEntry } from './syncCore.ts';
import type { Task } from './types.ts';

const MON = '2026-10-26';
const THU = '2026-10-29';
const FRI = '2026-10-30';
const NEXT_THU = '2026-11-05';

function task(id: string, extra: Partial<Task> = {}): Task {
  return { id, title: 'Zone 2', completed: false, createdAt: '2026-10-01T08:00:00.000Z', updatedAt: '2026-10-01T08:00:00.000Z', ...extra };
}

// The storage layer in miniature: every write is stamped, queued for sync (outbox) and recorded.
class Store {
  rows: Task[] = [];
  outbox: Task[] = [];
  s = new UndoStack();
  clock = Date.parse('2026-10-26T09:00:00.000Z');
  constructor(rows: Task[] = []) {
    this.rows = rows.map((r) => ({ ...r }));
    this.s.enabled = true;
  }
  iso() {
    return new Date(this.clock).toISOString();
  }
  tick(ms = 50) {
    this.clock += ms;
  }
  gesture() {
    this.s.markGesture();
    this.tick(2000);
  }
  add(t: Task) {
    this.tick(5);
    const st = { ...t, updatedAt: this.iso() };
    this.rows.push(st);
    this.outbox.push(st);
    this.s.record(undefined, st, this.clock);
  }
  update(t: Task) {
    this.tick(5);
    const st = { ...t, updatedAt: this.iso() };
    const was = this.rows.find((r) => r.id === t.id);
    this.rows = this.rows.map((r) => (r.id === t.id ? st : r));
    this.outbox.push(st);
    this.s.record(was, st, this.clock);
  }
  del(id: string) {
    this.tick(5);
    const was = this.rows.find((r) => r.id === id)!;
    const st = { ...was, deletedAt: this.iso(), updatedAt: this.iso() };
    this.rows = this.rows.map((r) => (r.id === id ? st : r));
    this.outbox.push(st);
    this.s.record(was, st, this.clock);
  }
  row(id: string) {
    return this.rows.find((r) => r.id === id);
  }
  live() {
    return this.rows.filter((r) => !r.deletedAt);
  }
  // Undo or redo, as lib/undoActions.ts does it.
  step(dir: 'undo' | 'redo'): StepOutcome {
    this.gesture();
    const r = stepStack(this.s, dir, this.rows, this.iso(), { labels: [], lists: [] });
    for (const w of r.writes) {
      if (this.rows.some((x) => x.id === w.id)) this.rows = this.rows.map((x) => (x.id === w.id ? w : x));
      else this.rows.push(w);
      this.outbox.push(w);
    }
    return r.outcome;
  }
  undo() {
    return this.step('undo');
  }
  redo() {
    return this.step('redo');
  }
}
const ok = (o: StepOutcome) => {
  assert.equal(o.ok, true, JSON.stringify(o));
  return o as Extract<StepOutcome, { ok: true }>;
};

test('move: undo puts the day and time back, redo moves again; the writes are ordinary edits that move updatedAt', () => {
  const st = new Store([task('a', { dueDate: MON, startTime: '09:00', durationMinutes: 60 })]);
  st.gesture();
  st.update({ ...st.row('a')!, dueDate: THU, startTime: '16:30' });
  const stamped = st.row('a')!.updatedAt;
  const u = ok(st.undo());
  assert.equal(u.label, 'moved Zone 2');
  assert.equal(st.row('a')!.dueDate, MON);
  assert.equal(st.row('a')!.startTime, '09:00');
  assert.ok(st.row('a')!.updatedAt > stamped, 'updatedAt moves forward');
  assert.equal(st.outbox[st.outbox.length - 1].id, 'a', 'queued for sync like any edit');
  ok(st.redo());
  assert.equal(st.row('a')!.dueDate, THU);
  assert.equal(st.row('a')!.startTime, '16:30');
});

test('resize, nudge, time edit and date edit each undo and redo', () => {
  const st = new Store([task('a', { dueDate: MON, startTime: '09:00', durationMinutes: 60 })]);
  const cases: Array<[string, Partial<Task>, string]> = [
    ['resized', { durationMinutes: 90 }, 'resized Zone 2'],
    ['nudge', { startTime: '09:30' }, 'moved Zone 2'],
    ['time', { startTime: '11:00' }, 'moved Zone 2'],
    ['date', { dueDate: FRI }, 'moved Zone 2'],
  ];
  for (const [, patch, label] of cases) {
    const before = { ...st.row('a')! };
    st.gesture();
    st.update({ ...before, ...patch });
    const key = Object.keys(patch)[0] as keyof Task;
    assert.equal(st.row('a')![key], (patch as Record<string, unknown>)[key]);
    assert.equal(ok(st.undo()).label, label);
    assert.ok(sameRow(st.row('a'), before), `${label} undone`);
    ok(st.redo());
    assert.equal(st.row('a')![key], (patch as Record<string, unknown>)[key]);
    ok(st.undo());
  }
});

test('tick: one entry for the tick and the day it creates; undo untick both', () => {
  const st = new Store([task('r', { recurrence: 'daily' })]);
  st.gesture();
  st.update({ ...st.row('r')!, completed: true, completedAt: st.iso() });
  st.add(task(`r:${THU}`, { dueDate: THU, recurrence: 'daily' }));
  assert.equal(st.s.depth, 1);
  assert.equal(ok(st.undo()).label, 'ticked Zone 2');
  assert.equal(st.row('r')!.completed, false);
  assert.ok(st.row(`r:${THU}`)!.deletedAt, 'the created next day is deleted again');
  ok(st.redo());
  assert.equal(st.row('r')!.completed, true);
  assert.equal(verbOf({ id: 'x', before: task('x', { completed: true }), after: task('x') }), 'unticked');
});

test('ticking one of several times of a task undoes that time only', () => {
  const st = new Store([task('p', { dueDate: MON, startTime: '08:00', extraTimes: ['12:40'], timesDone: [] })]);
  st.gesture();
  st.update({ ...st.row('p')!, timesDone: ['12:40'] });
  assert.equal(ok(st.undo()).label, 'ticked a time of Zone 2');
  assert.deepEqual(st.row('p')!.timesDone, []);
  assert.deepEqual(st.row('p')!.extraTimes, ['12:40']);
});

test('extra times: moving one time of a task undoes to the exact times it had', () => {
  const st = new Store([task('p', { dueDate: MON, startTime: '08:00', extraTimes: ['12:40', '15:00'] })]);
  st.gesture();
  st.update({ ...st.row('p')!, extraTimes: ['13:30', '15:00'] });
  ok(st.undo());
  assert.deepEqual(st.row('p')!.extraTimes, ['12:40', '15:00']);
  ok(st.redo());
  assert.deepEqual(st.row('p')!.extraTimes, ['13:30', '15:00']);
});

test('delete: undo brings the task back as a Trash restore does (a new id, the tombstone stays and is touched)', () => {
  const st = new Store([task('d', { dueDate: MON, startTime: '09:00', listKey: 'L1', notes: 'keep' })]);
  st.gesture();
  st.del('d');
  const tomb = st.row('d')!;
  const u = ok(st.undo());
  assert.equal(u.label, 'deleted Zone 2');
  const back = st.row('restored_d')!;
  assert.ok(back && !back.deletedAt, 'a live copy under the restored id');
  assert.equal(back.dueDate, MON);
  assert.equal(back.startTime, '09:00');
  assert.equal(back.notes, 'keep');
  assert.equal(back.listKey, undefined, 'a list that is not there is dropped, as the Trash does');
  assert.ok(st.row('d')!.deletedAt, 'the tombstone stays: nothing can clear it');
  assert.ok(st.row('d')!.updatedAt > tomb.updatedAt, 'and is touched so it leaves the Trash');
  assert.equal(st.live().length, 1);
  // Redo deletes the copy; undo again restores under the next id.
  ok(st.redo());
  assert.equal(st.live().length, 0);
  assert.ok(st.row('restored_d')!.deletedAt);
  ok(st.undo());
  assert.ok(st.row('restored2_d') && !st.row('restored2_d')!.deletedAt);
  assert.equal(st.live().length, 1);
});

test('create: undo deletes it, redo brings it back under a new id (a tombstone is never cleared)', () => {
  const st = new Store();
  st.gesture();
  st.add(task('n', { title: 'New thing' }));
  assert.equal(ok(st.undo()).label, 'created New thing');
  assert.ok(st.row('n')!.deletedAt);
  ok(st.redo());
  assert.equal(st.live().length, 1);
  assert.equal(st.live()[0].title, 'New thing');
  assert.notEqual(st.live()[0].id, 'n');
  ok(st.undo());
  assert.equal(st.live().length, 0);
});

test('skip a stored day: undo brings the day back as a plain copy; skip the first row: the series goes on', () => {
  // A weekly series started Monday; Monday is its first row (id r), Thursday a stored day.
  const rule = { recurrence: 'weekly' as const, recurrenceDays: ['Mon' as const, 'Thu' as const], startTime: '16:30' };
  const st = new Store([task('r', { ...rule, dueDate: MON }), task(`r:${THU}`, { ...rule, dueDate: THU })]);
  // Skipping the stored Thursday (the existing skip tombstones the row and keeps its rule).
  st.gesture();
  st.del(`r:${THU}`);
  assert.equal(ok(st.undo()).label, 'skipped Zone 2');
  const copy = st.live().find((r) => r.id.startsWith('restored'))!;
  assert.ok(copy, 'a one-off copy stands in for the skipped day');
  assert.equal(copy.dueDate, THU);
  assert.equal(copy.recurrence, undefined);
  ok(st.redo());
  assert.equal(st.live().filter((r) => r.id.startsWith('restored')).length, 0);

  // Skipping the series' first row: its day is stored as root:day with the rule, so projection continues.
  const st2 = new Store([task('r', { ...rule, dueDate: MON })]);
  st2.gesture();
  st2.del('r');
  ok(st2.undo());
  const day = st2.row(`r:${MON}`)!;
  assert.ok(day && !day.deletedAt && day.recurrence === 'weekly' && day.dueDate === MON);
  assert.equal(projectOccurrences(st2.rows, [NEXT_THU], MON).length, 1, 'the series still projects its next day');
});

test('skip a projected day (a tombstone row is created): undo gives that day back', () => {
  const rule = { recurrence: 'weekly' as const, recurrenceDays: ['Mon' as const, 'Thu' as const], startTime: '16:30' };
  const st = new Store([task('r', { ...rule, dueDate: MON })]);
  st.gesture();
  const plan = planSkip(st.rows, THU, st.iso())!;
  st.add(plan.tombstone);
  assert.equal(projectOccurrences(st.rows, [THU], MON).length, 0, 'skipped');
  const u = ok(st.undo());
  assert.equal(u.label, 'skipped Zone 2');
  const shown = st.live().filter((r) => r.dueDate === THU);
  assert.equal(shown.length, 1, 'the day is back (as a one-off copy, the tombstone cannot be cleared)');
  assert.equal(shown[0].startTime, '16:30');
});

test('repeating days: a day moved with this-day-only undoes to the series day, and redo moves it again', () => {
  const rule = { recurrence: 'weekly' as const, recurrenceDays: ['Mon' as const, 'Thu' as const], startTime: '16:30', durationMinutes: 90 };
  const st = new Store([task('z', { ...rule, dueDate: MON })]);
  st.gesture();
  const plan = planMoveDay(st.rows, THU, FRI, st.iso())!;
  for (const w of plan.writes) (w.isNew ? st.add(w.row) : st.update(w.row));
  assert.equal(st.row(`z:${THU}`)!.dueDate, FRI);
  assert.equal(ok(st.undo()).label, 'moved Zone 2');
  const back = st.row(`z:${THU}`)!;
  assert.equal(back.dueDate, THU, 'Thursday is on Thursday again');
  assert.equal(back.startTime, '16:30');
  assert.equal(projectOccurrences(st.rows, [NEXT_THU], MON).length, 1);
  ok(st.redo());
  assert.equal(st.row(`z:${THU}`)!.dueDate, FRI);
  // A this-day-only time edit (it also stores a carrier day): one entry, both undone.
  const st2 = new Store([task('z', { ...rule, dueDate: MON })]);
  st2.gesture();
  const edit = planThisDayEdit(st2.rows, MON, { startTime: '17:00' }, st2.iso())!;
  for (const w of edit.writes) (w.isNew ? st2.add(w.row) : st2.update(w.row));
  assert.equal(st2.s.depth, 1);
  ok(st2.undo());
  const series = seriesOfRows('z', st2.rows)!;
  assert.equal(series.template.startTime, '16:30');
  assert.equal(st2.row('z')!.startTime, '16:30');
  assert.equal(st2.live().filter((r) => r.startTime === '17:00').length, 0);
});

test('moving the first row of a series off its own day: undo restores that day with the series', () => {
  const rule = { recurrence: 'weekly' as const, recurrenceDays: ['Mon' as const, 'Thu' as const], startTime: '16:30' };
  const st = new Store([task('z', { ...rule, dueDate: MON }), task(`z:${THU}`, { ...rule, dueDate: THU })]);
  st.gesture();
  const plan = planMoveDay(st.rows, MON, FRI, st.iso(), { id: 'z' })!;
  for (const w of plan.writes) (w.isNew ? st.add(w.row) : st.update(w.row));
  ok(st.undo());
  const monday = st.live().filter((r) => r.dueDate === MON);
  assert.equal(monday.length, 1, 'Monday shows once');
  assert.equal(monday[0].recurrence, 'weekly');
  assert.equal(st.live().filter((r) => r.dueDate === FRI).length, 0, 'nothing left on Friday');
  assert.ok(seriesOfRows('z', st.rows), 'the series is intact');
});

test('a row that changed since is never overwritten: the entry is dropped with a message', () => {
  const st = new Store([task('a', { dueDate: MON, startTime: '09:00' })]);
  st.gesture();
  st.update({ ...st.row('a')!, startTime: '10:00' });
  // Another device moved it meanwhile (a write that is not in the stack).
  st.rows = st.rows.map((r) => (r.id === 'a' ? { ...r, startTime: '13:00', updatedAt: '2026-10-26T12:00:00.000Z' } : r));
  const o = st.undo();
  assert.equal(o.ok, false);
  assert.match((o as { text: string }).text, /changed since/);
  assert.equal(st.row('a')!.startTime, '13:00', 'their change is untouched');
  assert.equal(st.s.canUndo, false, 'and the entry is gone');
});

test('a deleted task that a later sync pull changed is not undone over', () => {
  const st = new Store([task('a', { dueDate: MON })]);
  st.gesture();
  st.del('a');
  st.rows = st.rows.map((r) => (r.id === 'a' ? { ...r, title: 'Renamed elsewhere' } : r));
  assert.equal(st.undo().ok, false);
  assert.equal(st.live().length, 0);
});

test('grouping: one gesture is one entry; a new gesture, or a long gap, is another', () => {
  const st = new Store([task('a'), task('b')]);
  st.gesture();
  st.update({ ...st.row('a')!, startTime: '09:00' });
  st.update({ ...st.row('b')!, startTime: '10:00' });
  assert.equal(st.s.depth, 1);
  assert.equal(labelOf(st.s.peekUndo()!.changes), 'moved 2 tasks');
  st.gesture();
  st.update({ ...st.row('a')!, startTime: '11:00' });
  assert.equal(st.s.depth, 2);
  // The same gesture but a long gap (a slow write): a new entry.
  st.tick(GROUP_GAP_MS + 100);
  st.update({ ...st.row('a')!, startTime: '12:00' });
  assert.equal(st.s.depth, 3);
  // Two writes of one row in a gesture keep the first before and the last after.
  st.gesture();
  st.update({ ...st.row('a')!, startTime: '13:00' });
  st.update({ ...st.row('a')!, startTime: '14:00' });
  const top = st.s.peekUndo()!;
  assert.equal(top.changes.length, 1);
  assert.equal(top.changes[0].before!.startTime, '12:00');
  assert.equal(top.changes[0].after.startTime, '14:00');
  // A row that ends where it began leaves no entry.
  st.gesture();
  st.update({ ...st.row('a')!, startTime: '15:00' });
  st.update({ ...st.row('a')!, startTime: '14:00' });
  assert.equal(st.s.peekUndo()!.changes[0].after.startTime, '14:00', 'the earlier entry is on top again');
});

test('the stack holds 50 entries, a new change clears redo, and nothing records while it is off', () => {
  const st = new Store([task('a')]);
  for (let i = 0; i < UNDO_LIMIT + 10; i++) {
    st.gesture();
    st.update({ ...st.row('a')!, startTime: `${String(i % 24).padStart(2, '0')}:${i < 24 ? '00' : '30'}` });
  }
  assert.equal(st.s.depth, UNDO_LIMIT);
  ok(st.undo());
  assert.equal(st.s.canRedo, true);
  st.gesture();
  st.update({ ...st.row('a')!, title: 'Other' });
  assert.equal(st.s.canRedo, false, 'a new change ends the redo history');
  const off = new Store([task('a')]);
  off.s.enabled = false;
  off.gesture();
  off.update({ ...off.row('a')!, startTime: '09:00' });
  assert.equal(off.s.depth, 0);
  assert.equal(off.undo().ok, false);
  assert.equal(st.s.canUndo, true);
  st.s.clear();
  assert.equal(st.undo().ok, false, 'nothing after a sign out clears it');
});

test('sync: undo and redo are ordinary edits, queued with a newer updatedAt, and they win the merge like any edit', () => {
  const st = new Store([task('a', { dueDate: MON, startTime: '09:00' })]);
  const original = { ...st.row('a')! };
  st.gesture();
  st.update({ ...original, startTime: '10:00' });
  const pushed = st.outbox.length;
  ok(st.undo());
  const queued = st.outbox.slice(pushed);
  assert.equal(queued.length, 1);
  assert.equal(queued[0].startTime, '09:00');
  assert.ok(queued[0].updatedAt > st.outbox[pushed - 1].updatedAt, 'newer than the edit it takes back');
  // The server still has the 10:00 edit; the undo is pending: the pending local change wins.
  const pending = new Map<string, OutboxEntry>([['a', { table: 'tasks', op: 'upsert', row: queued[0], queuedAt: st.iso() } as unknown as OutboxEntry]]);
  const merged = mergeRows<Task>({ local: st.rows, remote: [st.outbox[pushed - 1]], keyOf: (r) => r.id, pending, preserveFields: [], mode: 'incremental' });
  assert.equal(merged.rows.find((r) => r.id === 'a')!.startTime, '09:00');
  // The deleted task comes back as a NEW row, so the tombstone that wins every merge does not take it down.
  const st2 = new Store([task('d', { dueDate: MON })]);
  st2.gesture();
  st2.del('d');
  ok(st2.undo());
  const remoteTomb = st2.rows.find((r) => r.id === 'd')!;
  const m2 = mergeRows<Task>({ local: st2.rows, remote: [remoteTomb], keyOf: (r) => r.id, pending: new Map(), preserveFields: [], mode: 'incremental' });
  assert.equal(m2.rows.filter((r) => !r.deletedAt).length, 1);
  assert.equal(m2.rows.filter((r) => !r.deletedAt)[0].id, 'restored_d');
});

test('the label: a verb and the title, for the toast', () => {
  const mk = (before: Partial<Task> | undefined, after: Partial<Task>) => ({ id: 'a', ...(before ? { before: task('a', before) } : {}), after: task('a', after) });
  assert.equal(labelOf([mk(undefined, {})]), 'created Zone 2');
  assert.equal(verbOf(mk({}, { deletedAt: 'x' })), 'deleted');
  assert.equal(verbOf(mk({ recurrence: 'daily' }, { recurrence: 'daily', deletedAt: 'x' })), 'skipped');
  assert.equal(verbOf(mk({}, { completed: true })), 'ticked');
  assert.equal(verbOf(mk({ startTime: '09:00' }, { startTime: '10:00' })), 'moved');
  assert.equal(verbOf(mk({ durationMinutes: 30 }, { durationMinutes: 60 })), 'resized');
  assert.equal(verbOf(mk({}, { title: 'Zone 3' })), 'edited');
  assert.equal(labelOf([]), 'a change');
});

test('a projected day nudged this-day-only stores the day and a carrier; undo leaves every day at the series time', () => {
  const st = new Store([task('rp', { recurrence: 'daily', dueDate: MON, startTime: '15:00', durationMinutes: 30 })]);
  st.gesture();
  const plan = planThisDayEdit(st.rows, THU, { startTime: '15:30' }, st.iso())!;
  assert.equal(plan.writes.length, 2, 'the day and the carrier');
  for (const w of plan.writes) (w.isNew ? st.add(w.row) : st.update(w.row));
  assert.equal(st.s.depth, 1);
  ok(st.undo());
  assert.ok(st.live().every((r) => r.startTime === '15:00'), JSON.stringify(st.live().map((r) => [r.id, r.startTime])));
  assert.equal(seriesOfRows('rp', st.rows)!.template.startTime, '15:00');
  ok(st.redo());
  assert.equal(st.row(`rp:${THU}`)!.startTime, '15:30');
  assert.ok(st.live().filter((r) => r.startTime === '15:00').length >= 1, 'the carrier keeps the series time');
});
