// Run with `npm test` from mobile/. Push after (PLAN_push_after P1): the pure rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isRootRow, parsePushAfter, pushFields, pushPlan, pushedText, refusalText, type PushInput, type PushMove } from './pushAfter.ts';
import { planThisDayEdit } from './series.ts';
import type { Task } from './types.ts';

const DAY = '2026-11-25';
const TODAY = '2026-11-24';
const T = (id: string, startTime: string | undefined, durationMinutes: number | undefined, extra: Partial<Task> = {}): Task => ({
  id,
  title: id,
  completed: false,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  dueDate: DAY,
  ...(startTime ? { startTime } : {}),
  ...(durationMinutes !== undefined ? { durationMinutes } : {}),
  ...extra,
});
const min = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
// The moved task as stored after its drop.
function plan(tasks: Task[], movedId: string, extra: Partial<PushInput> = {}) {
  const m = tasks.find((t) => t.id === movedId)!;
  const s = min(m.startTime!);
  return pushPlan({ tasks, dayKey: m.dueDate ?? DAY, todayKey: TODAY, nowMin: 0, moved: { id: m.id, startMin: s, endMin: s + (m.durationMinutes ?? 30), breaks: !!m.cutsBelow }, ...extra });
}
const moves = (p: ReturnType<typeof pushPlan>): PushMove[] => {
  assert.ok(p && 'moves' in p, `expected moves, got ${JSON.stringify(p && 'refused' in p ? p : p)}`);
  return p.moves;
};
const at = (ms: PushMove[]) => ms.map((m) => `${m.entry.full.id}@${m.toMin / 60}`);

test('no overlap: null (an ordinary drop)', () => {
  assert.equal(plan([T('gym', '09:00', 60), T('a', '10:00', 30), T('b', '08:00', 60)], 'gym'), null);
});

test('one overlap pushes one, by just enough', () => {
  const ms = moves(plan([T('gym', '09:00', 60), T('a', '09:30', 30)], 'gym'));
  assert.deepEqual(at(ms), ['a@10']);
  assert.equal(ms[0].fromMin, min('09:30'));
});

test('a chain of three stops at the first gap big enough', () => {
  const tasks = [T('gym', '09:00', 60), T('a', '09:30', 60), T('b', '10:30', 30), T('c', '11:00', 30), T('d', '12:00', 30)];
  // a -> 10:00-11:00, b (10:30) -> 11:00-11:30, c (11:00) -> 11:30-12:00, d starts at 12:00: the gap is big enough.
  assert.deepEqual(at(moves(plan(tasks, 'gym'))), ['a@10', 'b@11', 'c@11.5']);
});

test('a blocker that starts before the drop and overlaps only its start is pushed after it (question 1)', () => {
  assert.deepEqual(at(moves(plan([T('gym', '09:00', 60), T('a', '08:30', 60)], 'gym'))), ['a@10']);
});

test('done tasks never move and never push; the overlap is left', () => {
  assert.equal(plan([T('gym', '09:00', 60), T('a', '09:30', 30, { completed: true })], 'gym'), null);
  // A done task in the chain's way does not stop it or move.
  const ms = moves(plan([T('gym', '09:00', 60), T('a', '09:30', 60), T('done', '10:15', 30, { completed: true }), T('b', '10:30', 30)], 'gym'));
  assert.deepEqual(at(ms), ['a@10', 'b@11']);
});

test('a done time of a task with several times is not pushed', () => {
  const multi = T('pill', '09:30', 15, { extraTimes: ['14:00'], timesDone: ['09:30'] });
  assert.equal(plan([T('gym', '09:00', 60), multi], 'gym'), null);
});

test('a quick reminder (no length) is ignored', () => {
  assert.equal(plan([T('gym', '09:00', 60), T('q', '09:30', 0)], 'gym'), null);
});

test('a shift moves with its rows (counted once) and the chain goes on from its end', () => {
  const tasks = [T('gym', '07:00', 60), T('shift', '07:30', 240), T('r1', '08:00', 30), T('r2', '10:00', 60), T('after', '11:45', 30)];
  const ms = moves(plan(tasks, 'gym'));
  // shift 07:30-11:30 -> 08:00-12:00, carrying r1 and r2; 'after' (11:45) is pushed to 12:00.
  assert.deepEqual(at(ms), ['shift@8', 'after@12']);
  assert.deepEqual(ms[0].rows.map((r) => r.full.id).sort(), ['r1', 'r2']);
});

test('a task dropped inside a shift pushes nothing (it is a row of the shift)', () => {
  const tasks = [T('shift', '08:00', 480), T('r1', '09:00', 60), T('new', '09:30', 30)];
  assert.equal(plan(tasks, 'new'), null);
});

test('a shift dropped over shorter tasks takes them in as rows; what sticks out is pushed', () => {
  const tasks = [T('shift', '08:00', 240), T('in', '09:00', 30), T('out', '11:30', 60)];
  assert.deepEqual(at(moves(plan(tasks, 'shift'))), ['out@12']);
});

test('what was carried with the moved task is never a blocker', () => {
  const tasks = [T('gym', '09:00', 60), T('inside', '09:15', 15)];
  assert.deepEqual(at(moves(plan(tasks, 'gym'))), ['inside@10'], 'not carried: pushed');
  assert.equal(plan(tasks, 'gym', { carried: ['inside'] }), null);
});

test('a break is a wall: the pushed task jumps to its end', () => {
  const tasks = [T('gym', '09:00', 60), T('a', '09:30', 60), T('lunch', '10:30', 60, { cutsBelow: true })];
  // a would be 10:00-11:00, over the break: it goes to 11:30.
  assert.deepEqual(at(moves(plan(tasks, 'gym'))), ['a@11.5']);
});

test('a break and a task inside a break never push', () => {
  assert.equal(plan([T('brk', '09:00', 60, { cutsBelow: true }), T('a', '09:30', 60)], 'brk'), null);
  assert.equal(plan([T('brk', '09:00', 120, { cutsBelow: true }), T('guest', '09:30', 30), T('a', '09:45', 30)], 'guest'), null);
});

test('the breaks inside a pushed shift go with it, not walls', () => {
  const tasks = [T('gym', '07:00', 60), T('shift', '07:30', 300), T('lunch', '10:00', 30, { cutsBelow: true })];
  assert.deepEqual(at(moves(plan(tasks, 'gym'))), ['shift@8']);
});

test('a chain that would end after 24:00 is refused whole', () => {
  const tasks = [T('late', '22:00', 60), T('a', '22:30', 60), T('b', '23:15', 30)];
  const p = plan(tasks, 'late');
  assert.ok(p && 'refused' in p);
  assert.equal(p.count, 2);
  assert.equal(p.refused, refusalText(2));
  assert.equal(p.refused, 'Not enough room before midnight to push 2 tasks. They overlap for now.');
});

test('a repeating day: a projected day is moved as that day, the root row never', () => {
  const series = T('run', '09:30', 30, { dueDate: '2026-11-20', recurrence: 'daily' });
  const tasks = [T('gym', '09:00', 60), series];
  const ms = moves(plan(tasks, 'gym'));
  assert.equal(ms.length, 1);
  assert.equal(ms[0].entry.projected, true);
  assert.equal(ms[0].entry.full.id, `run:${DAY}`);
  // Stored through "this day only": a new day row, the root row is not written.
  const p = planThisDayEdit([series], DAY, pushFields(ms[0])!, '2026-11-24T08:00:00.000Z');
  assert.ok(p);
  assert.ok(p.writes.every((w) => w.row.id !== 'run'));
  assert.equal(p.moved.startTime, '10:00');
});

test('the first row of a series on its own day is not pushed (the root row is never written)', () => {
  const series = T('run', '09:30', 30, { recurrence: 'daily' });
  const tasks = [T('gym', '09:00', 60), series];
  assert.equal(plan(tasks, 'gym'), null);
  assert.equal(isRootRow({ full: series, projected: false }), true);
  assert.equal(isRootRow({ full: { ...series, id: `run:${DAY}` }, projected: false }), false);
});

test('a stored day row of a series is pushed', () => {
  const tasks = [T('gym', '09:00', 60), T('run', '07:00', 30, { dueDate: '2026-11-20', recurrence: 'daily' }), T(`run:${DAY}`, '09:30', 30, { recurrence: 'daily' })];
  assert.deepEqual(at(moves(plan(tasks, 'gym'))), [`run:${DAY}@10`]);
});

test('the moved series day never pushes another day of its own series', () => {
  const tasks = [T('run', '07:00', 30, { dueDate: '2026-11-20', recurrence: 'daily' }), T(`run:${DAY}`, '09:30', 30, { recurrence: 'daily' })];
  assert.equal(plan(tasks, `run:${DAY}`), null);
});

test('one time of a task with several moves; its other times stay', () => {
  const multi = T('pill', '09:30', 15, { extraTimes: ['14:00'] });
  const ms = moves(plan([T('gym', '09:00', 60), multi], 'gym'));
  assert.equal(ms.length, 1);
  assert.equal(ms[0].entry.time, '09:30');
  const f = pushFields(ms[0])!;
  assert.equal(f.startTime, '10:00');
  assert.deepEqual(f.extraTimes, ['14:00']);
});

test('a pushed time that would clash with another of its own times refuses the whole push', () => {
  const multi = T('pill', '09:30', 30, { extraTimes: ['10:15'] });
  const p = plan([T('gym', '09:00', 60), multi], 'gym');
  assert.ok(p && 'refused' in p);
});

test('on today, tasks that ended before now are not blockers; past days are never pushed', () => {
  const tasks = [T('gym', '09:00', 60, { dueDate: TODAY }), T('a', '08:30', 45, { dueDate: TODAY }), T('b', '09:30', 30, { dueDate: TODAY })];
  const p = moves(plan(tasks, 'gym', { nowMin: min('09:20') }));
  assert.deepEqual(at(p), ['b@10'], 'a ended 09:15, before now');
  const old = [T('gym', '09:00', 60, { dueDate: '2026-11-20' }), T('a', '09:30', 30, { dueDate: '2026-11-20' })];
  assert.equal(plan(old, 'gym'), null);
});

test('equal starts go by title', () => {
  const tasks = [T('gym', '09:00', 60), T('z', '09:30', 30, { title: 'Zed' }), T('y', '09:30', 30, { title: 'Apple' })];
  assert.deepEqual(at(moves(plan(tasks, 'gym'))), ['y@10', 'z@10.5']);
});

test('the setting is on unless it says off; the words of the Undo bar', () => {
  assert.equal(parsePushAfter(null), true);
  assert.equal(parsePushAfter('on'), true);
  assert.equal(parsePushAfter('off'), false);
  assert.equal(pushedText('Gym', min('15:00'), 2), 'Moved Gym to 3:00pm and pushed 2 tasks later');
  assert.equal(pushedText('Gym', min('09:00'), 1), 'Moved Gym to 9:00am and pushed 1 task later');
});
