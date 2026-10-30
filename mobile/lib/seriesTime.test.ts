// Run with `npm test` from mobile/. The time of a repeating task with no question (3.20.0, lib/seriesTime.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { OWN_TIME_NOTE, SERIES_TIME_NOTE, hasOwnTime, isTimeEdit, seriesHasNoTime, seriesPatches, timeEditScope } from './seriesTime.ts';
import { planMoveDay, planThisDayEdit, projectOccurrences, type MovePlan } from './series.ts';
import type { Task } from './types.ts';

// 2026-10-26 is a Monday. "Zone 2" repeats Mon and Thu.
const MON = '2026-10-26';
const THU = '2026-10-29';
const NEXT_MON = '2026-11-02';
const NEXT_THU = '2026-11-05';
const FRI = '2026-10-30';
const NOW = '2026-10-26T08:00:00.000Z';

function zone(extra: Partial<Task> = {}): Task {
  return {
    id: 'z',
    title: 'Zone 2',
    completed: false,
    createdAt: '2026-10-20T08:00:00.000Z',
    updatedAt: '2026-10-20T08:00:00.000Z',
    recurrence: 'weekly',
    recurrenceDays: ['Mon', 'Thu'],
    dueDate: MON,
    ...extra,
  };
}

// Applies what an edit writes, the way seriesActions does: patches to rows by id.
function applyPatches(rows: Task[], patches: Array<{ id: string; fields: Partial<Task> }>): Task[] {
  return rows.map((r) => {
    const p = patches.find((x) => x.id === r.id);
    return p ? { ...r, ...p.fields, updatedAt: NOW } : r;
  });
}
function applyPlan(rows: Task[], plan: MovePlan | null): Task[] {
  assert.ok(plan);
  const out = [...rows];
  for (const w of plan.writes) {
    const at = out.findIndex((r) => r.id === w.row.id);
    if (at === -1) out.push(w.row);
    else out[at] = w.row;
  }
  return out;
}
const shown = (rows: Task[], day: string) => {
  const stored = rows.find((r) => !r.deletedAt && (r.id === `z:${day}` || (r.id === 'z' && r.dueDate === day)));
  return stored ?? projectOccurrences(rows, [day], MON).find((t) => t.dueDate === day);
};

test('isTimeEdit: a time or a length, not a tick of a time alone', () => {
  assert.equal(isTimeEdit({ startTime: '16:30' }), true);
  assert.equal(isTimeEdit({ startTime: '16:30', durationMinutes: 90 }), true);
  assert.equal(isTimeEdit({ timesDone: [] }), false);
  assert.equal(isTimeEdit({ startTime: '16:30', dueDate: MON }), false);
  assert.equal(isTimeEdit({}), false);
});

test('Zone 2 dropped on Monday 16:30: the FIRST time goes to every repeat day, Thursday is timed too', () => {
  const rows = [zone()];
  assert.equal(seriesHasNoTime(rows), true);
  const fields = { startTime: '16:30', durationMinutes: 90 };
  // Dropped from the list (source day) and set in the details (panel): both are the whole series.
  assert.equal(timeEditScope(rows, 'z', fields, 'day'), 'series');
  assert.equal(timeEditScope(rows, 'z', fields, 'panel'), 'series');
  const after = applyPatches(rows, seriesPatches(rows, fields, MON));
  for (const d of [MON, THU, NEXT_MON, NEXT_THU]) {
    const t = shown(after, d)!;
    assert.equal(t.startTime, '16:30', d);
    assert.equal(t.durationMinutes, 90, d);
  }
  // Nothing on a day that is not a repeat day.
  assert.equal(shown(after, FRI), undefined);
});

test('the first time reaches the later days even when only the template is stored (Thursday used to stay untimed)', () => {
  const rows = [zone()];
  const patches = seriesPatches(rows, { startTime: '16:30' }, MON);
  assert.deepEqual(patches.map((p) => p.id), ['z']);
  assert.equal(projectOccurrences(applyPatches(rows, patches), [THU], MON)[0].startTime, '16:30');
});

test('a drag or a resize on a series that already has a time changes that day only', () => {
  const rows = [zone({ startTime: '16:30', durationMinutes: 90 })];
  assert.equal(seriesHasNoTime(rows), false);
  assert.equal(timeEditScope(rows, `z:${THU}`, { startTime: '17:00' }, 'day'), 'day');
  assert.equal(timeEditScope(rows, `z:${THU}`, { durationMinutes: 60 }, 'day'), 'day');
});

test('a later time from the details reaches every day that was not changed on its own', () => {
  let rows = [zone({ startTime: '16:30', durationMinutes: 90 })];
  // Thursday is moved to 17:00 for that day only (a drag).
  rows = applyPlan(rows, planThisDayEdit(rows, THU, { startTime: '17:00' }, NOW));
  assert.equal(shown(rows, THU)!.startTime, '17:00');
  assert.equal(timeEditScope(rows, 'z', { startTime: '18:00' }, 'panel'), 'series');
  rows = applyPatches(rows, seriesPatches(rows, { startTime: '18:00' }, MON));
  assert.equal(shown(rows, MON)!.startTime, '18:00');
  assert.equal(shown(rows, NEXT_MON)!.startTime, '18:00');
  assert.equal(shown(rows, NEXT_THU)!.startTime, '18:00');
  // The day the user changed keeps its own time.
  assert.equal(shown(rows, THU)!.startTime, '17:00');
});

test('a stored day equal to the series (a ticked day) follows a series change', () => {
  let rows = [zone({ startTime: '16:30' }), zone({ id: `z:${THU}`, dueDate: THU, startTime: '16:30' })];
  assert.equal(hasOwnTime(rows[1], rows[0]), false);
  rows = applyPatches(rows, seriesPatches(rows, { startTime: '15:00', durationMinutes: 45 }, MON));
  assert.equal(rows[1].startTime, '15:00');
  assert.equal(rows[1].durationMinutes, 45);
});

test('a moved day keeps its own time, and so does a day with its own length', () => {
  let rows = [zone({ startTime: '16:30', durationMinutes: 90 })];
  rows = applyPlan(rows, planMoveDay(rows, THU, FRI, NOW));
  const moved = rows.find((r) => r.id === `z:${THU}`)!;
  assert.equal(moved.dueDate, FRI);
  assert.equal(hasOwnTime(moved, rows[0]), true);
  const after = applyPatches(rows, seriesPatches(rows, { startTime: '18:00', durationMinutes: 30 }, MON));
  const kept = after.find((r) => r.id === `z:${THU}`)!;
  assert.equal(kept.startTime, '16:30');
  assert.equal(kept.durationMinutes, 90);
  assert.equal(kept.dueDate, FRI);
  assert.equal(after[0].startTime, '18:00');
  // A length of its own alone is also its own.
  const len = [zone({ startTime: '16:30', durationMinutes: 90 }), zone({ id: `z:${THU}`, dueDate: THU, startTime: '16:30', durationMinutes: 30 })];
  assert.equal(hasOwnTime(len[1], len[0]), true);
});

test('an edit made on a day that has its own time changes that day only', () => {
  let rows = [zone({ startTime: '16:30', durationMinutes: 90 })];
  rows = applyPlan(rows, planThisDayEdit(rows, THU, { startTime: '17:00' }, NOW));
  assert.equal(timeEditScope(rows, `z:${THU}`, { startTime: '17:30' }, 'panel'), 'day');
  // The edited day without its own time is the series.
  assert.equal(timeEditScope(rows, 'z', { startTime: '17:30' }, 'panel'), 'series');
});

test('the other fields of a series edit still reach a day with its own time (a title is not a time)', () => {
  let rows = [zone({ startTime: '16:30' })];
  rows = applyPlan(rows, planThisDayEdit(rows, THU, { startTime: '17:00' }, NOW));
  const patches = seriesPatches(rows, { title: 'Zone 2 ride', startTime: '18:00' }, MON);
  const thu = patches.find((p) => p.id === `z:${THU}`)!;
  assert.deepEqual(thu.fields, { title: 'Zone 2 ride' });
});

test('a task with no dated row has no series: the edit is a plain one', () => {
  const rows = [zone({ dueDate: undefined })];
  assert.equal(timeEditScope(rows, 'z', { startTime: '16:30' }, 'panel'), 'plain');
  assert.equal(timeEditScope(rows, 'z', { startTime: '16:30' }, 'day'), 'plain');
  assert.deepEqual(seriesPatches(rows, { startTime: '16:30' }, MON), []);
});

test('removing the time from the details goes to the series, not as a first time', () => {
  const rows = [zone({ startTime: '16:30' })];
  assert.equal(timeEditScope(rows, 'z', { startTime: undefined }, 'panel'), 'series');
  const after = applyPatches(rows, seriesPatches(rows, { startTime: undefined }, MON));
  assert.equal(after[0].startTime, undefined);
});

test('the notes read as written', () => {
  assert.equal(SERIES_TIME_NOTE, 'Applied to every repeat day. Days you moved keep their own time.');
  assert.ok(OWN_TIME_NOTE.includes('this day only'));
});

test('a day that already has its own time while the series has none is changed alone (not a first time)', () => {
  const rows = [zone(), zone({ id: `z:${THU}`, dueDate: FRI, startTime: '10:00' })];
  assert.equal(timeEditScope(rows, `z:${THU}`, { startTime: '11:00' }, 'day'), 'day');
  assert.equal(timeEditScope(rows, `z:${THU}`, { startTime: '11:00' }, 'panel'), 'day');
});
