// Run with `npm test` from mobile/. One day of the phone's Calendar (PLAN_phone P8): the desktop's rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPhoneDay, minuteAtY } from './phoneDay.ts';
import { PX_PER_HOUR } from './timebox.ts';
import type { ScheduleEvent, Task } from './types.ts';

const DAY = '2026-10-22';
const T = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, completed: false, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', dueDate: DAY, ...extra });
const ids = (d: ReturnType<typeof buildPhoneDay>) => d.blocks.map((b) => b.id).sort();

test('timed tasks are blocks, untimed ones go to the all day row (top priority first)', () => {
  const d = buildPhoneDay({ tasks: [T('a', { startTime: '09:00', durationMinutes: 60 }), T('b'), T('c', { priority: 'high' })], dayKey: DAY, todayKey: DAY });
  assert.deepEqual(ids(d), ['task:a']);
  assert.deepEqual(d.allDay.map((x) => x.task.id), ['c', 'b']);
  const a = d.blocks[0];
  assert.equal(a.top, 9 * PX_PER_HOUR);
  assert.equal(a.height, PX_PER_HOUR);
});

test('a task with several times is a block per time; a break splits the task under it', () => {
  const d = buildPhoneDay({
    tasks: [T('camp', { startTime: '09:30', durationMinutes: 420 }), T('brk', { startTime: '11:00', durationMinutes: 20, cutsBelow: true, extraTimes: ['15:00'] })],
    dayKey: DAY,
    todayKey: DAY,
  });
  const brk = d.blocks.filter((b) => b.source.kind === 'task' && b.source.task.title === 'brk');
  assert.equal(brk.length, 2, 'one block per time');
  const pieces = d.blocks.filter((b) => b.source.kind === 'task' && b.source.piece);
  assert.equal(pieces.length, 3, 'two breaks cut the day long task in three');
  assert.ok(pieces.every((p) => p.cols === 1), 'pieces stack at full width');
});

test('old events are read only blocks; a repeating series shows its projected day', () => {
  const ev: ScheduleEvent = { id: 'e1', title: 'Gym', category: 'x', icon: '🏋️', color: '#888888', start: '13:00', end: '14:00', notes: '', isCustom: true };
  const d = buildPhoneDay({ tasks: [T('walk', { dueDate: '2026-10-20', startTime: '07:00', recurrence: 'daily' })], events: [ev], dayKey: DAY, todayKey: DAY });
  assert.deepEqual(ids(d), ['event:e1', 'task:walk:2026-10-22']);
  const walk = d.blocks.find((b) => b.id.startsWith('task:'))!;
  assert.ok(walk.source.kind === 'task' && walk.source.projected);
});

test('yesterday\'s overnight task shows its rest at the top of today', () => {
  const d = buildPhoneDay({ tasks: [T('night', { dueDate: '2026-10-21', startTime: '23:00', durationMinutes: 180 })], dayKey: DAY, todayKey: DAY });
  const rest = d.blocks[0];
  assert.ok(rest.source.kind === 'task' && rest.source.continuation);
  assert.equal(rest.startMin, 0);
  assert.equal(rest.endMin, 120);
});

test('a tap snaps to the quarter hour under the finger, inside the day', () => {
  assert.equal(minuteAtY(9 * PX_PER_HOUR + 10, PX_PER_HOUR), 9 * 60 + 0, '10 px is about 10 minutes: still 9:00');
  assert.equal(minuteAtY(9 * PX_PER_HOUR + PX_PER_HOUR / 2, PX_PER_HOUR), 9 * 60 + 30);
  assert.equal(minuteAtY(-5, PX_PER_HOUR), 0);
  assert.equal(minuteAtY(30 * PX_PER_HOUR, PX_PER_HOUR), 23 * 60 + 45);
});

test('3.7.0: a task fully inside a break is hosted (no block of its own); one partly over it is split as before', () => {
  const d = buildPhoneDay({
    tasks: [
      T('lunch', { startTime: '12:00', durationMinutes: 60, cutsBelow: true }),
      T('call', { startTime: '12:10', durationMinutes: 20 }),
      T('read', { startTime: '12:30', durationMinutes: 30 }),
      T('long', { startTime: '11:00', durationMinutes: 180 }),
    ],
    dayKey: DAY,
    todayKey: DAY,
  });
  assert.ok(!d.blocks.some((b) => b.id === 'task:call' || b.id === 'task:read'), 'hosted tasks have no block');
  const lunch = d.blocks.find((b) => b.id === 'task:lunch')!;
  assert.ok(lunch.source.kind === 'task');
  assert.deepEqual(lunch.source.kind === 'task' ? lunch.source.hosted?.map((h) => h.task.title) : [], ['call', 'read']);
  assert.equal(lunch.cols, 1, 'the break stays full width');
  const pieces = d.blocks.filter((b) => b.source.kind === 'task' && b.source.piece);
  assert.equal(pieces.length, 2, 'the long task is cut around the break as before');
  assert.equal(d.notes.size, 0, 'no "it would cover the task" note for the hosted ones');
});

// 3.64.0: a shift is a shell; what is inside it is laid out inside its lane, at real size, not beside it.
test('a block inside a longer one is inside its shell, not a column beside it', () => {
  const d = buildPhoneDay({
    tasks: [T('shift', { startTime: '09:00', durationMinutes: 360 }), T('a', { startTime: '10:00', durationMinutes: 60 }), T('b', { startTime: '12:00', durationMinutes: 60 }), T('c', { startTime: '16:00', durationMinutes: 60 })],
    dayKey: DAY,
    todayKey: DAY,
  });
  assert.deepEqual(ids(d), ['task:c', 'task:shift'], 'the outer blocks: the shift and the one after it');
  const shell = d.shells.find((x) => x.id === 'task:shift');
  assert.ok(shell, 'the shift is a shell');
  assert.deepEqual(shell.blocks.map((b) => b.id).sort(), ['task:a', 'task:b']);
  assert.ok(shell.blocks.every((b) => b.cols === 1), 'inside blocks that do not overlap are full width of the shell');
  const shift = d.blocks.find((b) => b.id === 'task:shift')!;
  assert.equal(shift.cols, 1, 'the shell keeps its full lane');
});

test('inside blocks that overlap each other share the shell, not the day', () => {
  const d = buildPhoneDay({
    tasks: [T('shift', { startTime: '09:00', durationMinutes: 360 }), T('a', { startTime: '10:00', durationMinutes: 60 }), T('b', { startTime: '10:30', durationMinutes: 60 })],
    dayKey: DAY,
    todayKey: DAY,
  });
  const shell = d.shells.find((x) => x.id === 'task:shift')!;
  assert.deepEqual(shell.blocks.map((b) => b.cols), [2, 2]);
  assert.equal(d.blocks.find((b) => b.id === 'task:shift')!.cols, 1);
});

test('equal blocks are not inside each other: still side by side; no shells', () => {
  const d = buildPhoneDay({ tasks: [T('a', { startTime: '09:00', durationMinutes: 60 }), T('b', { startTime: '09:00', durationMinutes: 60 })], dayKey: DAY, todayKey: DAY });
  assert.equal(d.shells.length, 0);
  assert.deepEqual(d.blocks.map((b) => b.cols), [2, 2]);
});

test('a shift cut into pieces by a break still holds what is inside it (its lane comes with the shell)', () => {
  const d = buildPhoneDay({
    tasks: [T('camp', { startTime: '09:30', durationMinutes: 420 }), T('brk', { startTime: '11:00', durationMinutes: 20, cutsBelow: true }), T('tiny', { startTime: '10:00', durationMinutes: 15 })],
    dayKey: DAY,
    todayKey: DAY,
  });
  const inner = d.shells.flatMap((x) => x.blocks.map((b) => b.id));
  const all = [...d.blocks.map((b) => b.id), ...inner];
  assert.ok(all.includes('task:tiny'), 'the small task is drawn somewhere');
  for (const sh of d.shells) assert.ok(sh.cols >= 1 && sh.col >= 0, 'every shell has its lane');
});
