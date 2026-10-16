// Run with `npm test` from mobile/. The Daily Planning and Shutdown draft (phase 5).
import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_DRAFT, doneOn, draftAdd, draftEdit, draftView, finishWrites, isEmptyDraft, missedTasks, nextWeekStart, onDay } from './planningDraft.ts';
import type { Task } from './types.ts';

const STAMP = '2026-10-01T00:00:00.000Z';
const T = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, completed: false, createdAt: STAMP, updatedAt: STAMP, ...extra });
const TODAY = '2026-10-16';
const rows = (): Task[] => [
  T('missed1', { dueDate: '2026-10-14' }),
  T('missed2', { dueDate: '2026-10-15', startTime: '08:00' }),
  T('today1', { dueDate: TODAY }),
  T('dump1'),
  T('series', { dueDate: '2026-10-15', recurrence: 'daily' }),
  T('yday', { dueDate: '2026-10-15', completed: true, completedAt: '2026-10-15T10:00:00.000Z' }),
];

test('a draft never touches the stored rows, whatever is done in it (Cancel changes nothing)', () => {
  const stored = rows();
  const before = JSON.stringify(stored);
  let d = EMPTY_DRAFT;
  d = draftEdit(d, 'missed1', { completed: true });
  d = draftEdit(d, 'dump1', { dueDate: TODAY });
  d = draftEdit(d, 'today1', { dueDate: '2026-10-17' });
  d = draftEdit(d, 'today1', { startTime: '10:00' });
  d = draftAdd(d, T('new', { dueDate: TODAY }));
  d = draftEdit(d, 'new', { title: 'renamed' });
  const view = draftView(stored, d);
  assert.equal(JSON.stringify(stored), before, 'the stored rows are exactly as they were');
  assert.equal(view.find((t) => t.id === 'today1')?.dueDate, '2026-10-17');
  assert.equal(view.find((t) => t.id === 'today1')?.startTime, '10:00');
  assert.equal(view.find((t) => t.id === 'new')?.title, 'renamed');
  assert.equal(d.edits.new, undefined, 'an added task is edited in place, not as a stored edit');
  // Cancel is dropping the draft: there are no writes to make or undo.
  assert.equal(isEmptyDraft(EMPTY_DRAFT), true);
  assert.equal(isEmptyDraft(d), false);
});

test('Finish in Planning: the draft, then the rollover of every other unfinished earlier task', () => {
  const stored = rows();
  let d = draftEdit(EMPTY_DRAFT, 'missed1', { completed: true });
  d = draftEdit(d, 'dump1', { dueDate: TODAY });
  const w = finishWrites(stored, d, TODAY, 'planning');
  assert.deepEqual(w.patches, [
    { id: 'missed1', fields: { completed: true } },
    { id: 'dump1', fields: { dueDate: TODAY } },
    { id: 'missed2', fields: { dueDate: TODAY } },
  ]);
  assert.deepEqual(w.adds, []);
  // missed1 was ticked as done in the draft: it is not also rolled.
});

test('a task the draft moved elsewhere is not rolled; an unchanged edit writes nothing', () => {
  const stored = rows();
  let d = draftEdit(EMPTY_DRAFT, 'missed2', { dueDate: '2026-10-19' });
  d = draftEdit(d, 'today1', { dueDate: TODAY });
  const w = finishWrites(stored, d, TODAY, 'planning');
  assert.deepEqual(w.patches, [
    { id: 'missed2', fields: { dueDate: '2026-10-19' } },
    { id: 'missed1', fields: { dueDate: TODAY } },
  ]);
});

test('Finish in Shutdown: the draft, then the chosen unfinished tasks of today to tomorrow', () => {
  const stored = rows();
  const w = finishWrites(stored, EMPTY_DRAFT, TODAY, 'shutdown', new Set(['today1']));
  assert.deepEqual(w.patches, [{ id: 'today1', fields: { dueDate: '2026-10-17' } }]);
  assert.deepEqual(finishWrites(stored, EMPTY_DRAFT, TODAY, 'shutdown').patches, [], 'nothing chosen, nothing moves');
});

test('added tasks are written as they are; a deleted stored row is never patched', () => {
  const stored = [...rows(), T('gone', { dueDate: TODAY, deletedAt: STAMP })];
  let d = draftAdd(EMPTY_DRAFT, T('new', { dueDate: TODAY }));
  d = draftEdit(d, 'gone', { dueDate: '2026-10-20' });
  const w = finishWrites(stored, d, TODAY, 'planning');
  assert.deepEqual(w.adds.map((t) => t.id), ['new']);
  assert.ok(!w.patches.some((p) => p.id === 'gone'));
});

test('what the steps show: missed (oldest first, no series rows), done on a day, on a day', () => {
  const stored = rows();
  assert.deepEqual(missedTasks(stored, TODAY).map((t) => t.id), ['missed1', 'missed2']);
  assert.deepEqual(doneOn(stored, '2026-10-15').map((t) => t.id), ['yday']);
  assert.deepEqual(onDay(stored, TODAY).map((t) => t.id), ['today1']);
  assert.equal(nextWeekStart('2026-10-16'), '2026-10-19');
  assert.equal(nextWeekStart('2026-10-19'), '2026-10-26');
});
