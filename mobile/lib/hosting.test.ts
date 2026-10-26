// Run with `npm test` from mobile/. A task during a break (3.5.0): hosted when fully inside a break.
import test from 'node:test';
import assert from 'node:assert/strict';
import { duringCaption, hostIndex, hostLinks, insidePill, ENDS_AT_MIDNIGHT, LONGER_THAN_BREAK, breakAt, hostDrop, hostedEstimate, moveOutFields, removeTimeOutFields, breaksFitting, chipPlan, dayHostEntries, hostDay, hostStart, hostedMinutes, parseBreakTwice, type HostEntry } from './hosting.ts';
import { cutDay, planCuts } from './cuts.ts';
import { COMPACT_BLOCK_PX, PX_PER_HOUR } from './timebox.ts';
import type { Task } from './types.ts';

const h = (hh: number, mm = 0) => hh * 60 + mm;
const task = (id: string, s: number, e: number): HostEntry => ({ id, startMin: s, endMin: e, breaks: false });
const brk = (id: string, s: number, e: number): HostEntry => ({ id, startMin: s, endMin: e, breaks: true });
const px = (min: number) => (min / 60) * PX_PER_HOUR;

test('a task fully inside a break is hosted by it, the edges included', () => {
  const r = hostDay([brk('lunch', h(12), h(13)), task('call', h(12, 15), h(12, 30)), task('edge', h(12), h(13))]);
  assert.equal(r.hostOf.get('call'), 'lunch');
  assert.equal(r.hostOf.get('edge'), 'lunch', 'the same span as the break is inside');
  assert.deepEqual(r.hosted.get('lunch'), ['edge', 'call']);
});

test('a task that only partly overlaps a break is not hosted and Split treats it as before', () => {
  const entries = [brk('b', h(11), h(11, 20)), task('boot', h(9, 30), h(16, 30)), task('late', h(11, 10), h(11, 40))];
  const r = hostDay(entries);
  assert.equal(r.hostOf.size, 0);
  assert.equal(r.hosted.size, 0);
  // Nothing hosted: the cut is the one cuts.ts makes on its own.
  const kept = entries.filter((e) => !r.hostOf.has(e.id));
  assert.deepEqual(cutDay(kept, 30), cutDay(entries, 30));
});

test('a task longer than the break is never hosted; dropping one is refused with the note', () => {
  const r = hostDay([brk('b', h(10), h(10, 20)), task('long', h(10), h(10, 30))]);
  assert.equal(r.hostOf.size, 0);
  assert.equal(hostStart(h(10), 30, { startMin: h(10), endMin: h(10, 20) }), null);
  assert.equal(LONGER_THAN_BREAK, 'Longer than the break');
});

test('several tasks in one break are all hosted, overlapping ones too (a list, not lanes)', () => {
  const r = hostDay([brk('b', h(12), h(13)), task('c', h(12, 30), h(12, 45)), task('a', h(12), h(12, 20)), task('b2', h(12, 10), h(12, 40))]);
  assert.deepEqual(r.hosted.get('b'), ['a', 'b2', 'c'], 'earliest first');
});

test('the hosted task leaves the Split plan: no "covers" refusal, a cut elsewhere is unchanged', () => {
  const entries = [task('day', h(9), h(17)), brk('b', h(12), h(12, 30)), task('tea', h(12, 5), h(12, 20))];
  const before = planCuts(entries, 30, (id) => id);
  assert.ok(before.notes.get('b')?.includes('cover all'), 'before: the break said it would cover the task');
  const r = hostDay(entries);
  assert.equal(r.hostOf.get('tea'), 'b');
  const after = planCuts(entries.filter((e) => !r.hostOf.has(e.id)), 30, (id) => id);
  assert.equal(after.notes.size, 0);
  const pieces = (p: typeof after) => p.items.filter((i) => i.piece).map((i) => [i.startMin, i.endMin]);
  assert.deepEqual(pieces(after), pieces(before), 'the day long task is cut exactly as before');
});

test('a break is never hosted, the rest of yesterday never hosts and is never hosted, the shortest break wins', () => {
  const r = hostDay([
    brk('big', h(12), h(14)),
    brk('small', h(12, 30), h(13)),
    task('in-both', h(12, 35), h(12, 50)),
    task('in-big', h(13, 10), h(13, 30)),
    { ...task('cont:night', 0, h(0, 20)), cont: true },
    { ...brk('cont:b', 0, h(1)), cont: true },
    task('early', h(0, 10), h(0, 30)),
  ]);
  assert.equal(r.hostOf.get('in-both'), 'small');
  assert.equal(r.hostOf.get('in-big'), 'big');
  assert.equal(r.hostOf.has('small'), false, 'a break inside a break stays a break');
  assert.equal(r.hostOf.has('cont:night'), false);
  assert.equal(r.hostOf.has('early'), false, "yesterday's break goes on hosting nothing today");
});

test('Split off: a task of the same span hosts nothing', () => {
  const r = hostDay([task('lunch', h(12), h(13)), task('call', h(12, 15), h(12, 30))]);
  assert.equal(r.hostOf.size, 0);
});

test('damaged entries are ignored', () => {
  const r = hostDay([brk('b', h(12), h(13)), task('x', NaN, h(12, 30)), task('zero', h(12, 10), h(12, 10)), brk('bad', h(9), h(8))]);
  assert.equal(r.hostOf.size, 0);
  assert.equal(hostDay([]).hosted.size, 0);
});

const DAY = '2026-10-26';
const T = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, completed: false, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', dueDate: DAY, ...extra });

test('extra times: each time of a task is hosted on its own', () => {
  const tasks = [
    T('brk', { startTime: '12:00', durationMinutes: 30, cutsBelow: true }),
    T('pill', { startTime: '08:00', durationMinutes: 10, extraTimes: ['12:10', '18:00'] }),
  ];
  const entries = dayHostEntries(tasks, DAY, DAY);
  const r = hostDay(entries);
  assert.equal(r.hostOf.get('task:pill@12:10'), 'task:brk');
  assert.equal(r.hostOf.has('task:pill'), false, 'the 08:00 time is not inside');
  assert.equal(r.hostOf.has('task:pill@18:00'), false);
  assert.equal(entries.find((e) => e.id === 'task:pill@12:10')?.time, '12:10');
});

test('extra times on the break: each of its times hosts what is inside it', () => {
  const tasks = [T('brk', { startTime: '10:00', durationMinutes: 20, cutsBelow: true, extraTimes: ['15:00'] }), T('a', { startTime: '10:05', durationMinutes: 10 }), T('b', { startTime: '15:00', durationMinutes: 20 })];
  const r = hostDay(dayHostEntries(tasks, DAY, DAY));
  assert.equal(r.hostOf.get('task:a'), 'task:brk');
  assert.equal(r.hostOf.get('task:b'), 'task:brk@15:00');
});

test('repeating days: a projected break hosts a projected task on a later day', () => {
  const later = '2026-10-29';
  const tasks = [
    T('lunch', { dueDate: '2026-10-20', startTime: '12:00', durationMinutes: 60, cutsBelow: true, recurrence: 'daily' }),
    T('read', { dueDate: '2026-10-20', startTime: '12:10', durationMinutes: 20, recurrence: 'daily' }),
  ];
  const entries = dayHostEntries(tasks, later, DAY);
  const r = hostDay(entries);
  const hosted = [...r.hostOf.entries()];
  assert.equal(hosted.length, 1);
  assert.match(hosted[0][0], /^task:read/);
  assert.match(hosted[0][1], /^task:lunch/);
  assert.ok(entries.every((e) => e.projected), 'both are projected days');
});

test('moved out of the break: back to normal at once (derived, nothing stored)', () => {
  const inside = [T('brk', { startTime: '12:00', durationMinutes: 30, cutsBelow: true }), T('x', { startTime: '12:10', durationMinutes: 15 })];
  assert.equal(hostDay(dayHostEntries(inside, DAY, DAY)).hostOf.size, 1);
  const out = [inside[0], { ...inside[1], startTime: '12:20' }];
  assert.equal(hostDay(dayHostEntries(out, DAY, DAY)).hostOf.size, 0, 'now it ends at 12:35, past the break');
});

test('hostStart: the dropped time if the task fits from there, else the break start', () => {
  const b = { startMin: h(12), endMin: h(13) };
  assert.equal(hostStart(h(12, 30), 30, b), h(12, 30));
  assert.equal(hostStart(h(12, 30), 45, b), h(12));
  assert.equal(hostStart(h(11, 30), 20, b), h(12), 'a drop before the break starts with it');
  assert.equal(hostStart(h(12), 60, b), h(12));
  assert.equal(hostStart(h(12), 61, b), null);
});

test('breakAt and breaksFitting', () => {
  const list = [
    { id: 'a', startMin: h(15), endMin: h(15, 20) },
    { id: 'b', startMin: h(12), endMin: h(13) },
    { id: 'c', startMin: h(12, 30), endMin: h(12, 45) },
  ];
  assert.equal(breakAt(list, h(12, 35))?.id, 'c', 'the shortest under the pointer');
  assert.equal(breakAt(list, h(12, 50))?.id, 'b');
  assert.equal(breakAt(list, h(13)), undefined, 'the end is outside');
  assert.deepEqual(breaksFitting(list, 20).map((b) => b.id), ['b', 'a']);
  assert.deepEqual(breaksFitting(list, 90), []);
});

test('chipPlan: a 20 minute break is one line, a 45 and a 60 minute one stack', () => {
  assert.deepEqual(chipPlan(px(20), 300, 1, COMPACT_BLOCK_PX), { mode: 'inline', shown: 1, more: 0 });
  assert.deepEqual(chipPlan(px(20), 300, 3, COMPACT_BLOCK_PX), { mode: 'inline', shown: 1, more: 2 });
  assert.deepEqual(chipPlan(px(20), 120, 3, COMPACT_BLOCK_PX), { mode: 'inline', shown: 0, more: 3 }, 'too narrow: only +N');
  assert.deepEqual(chipPlan(px(45), 300, 1, COMPACT_BLOCK_PX), { mode: 'stack', shown: 1, more: 0 });
  assert.deepEqual(chipPlan(px(60), 300, 3, COMPACT_BLOCK_PX), { mode: 'stack', shown: 2, more: 1 });
  assert.deepEqual(chipPlan(px(120), 300, 3, COMPACT_BLOCK_PX), { mode: 'stack', shown: 3, more: 0 });
  assert.deepEqual(chipPlan(px(60), 300, 0, COMPACT_BLOCK_PX), { mode: 'stack', shown: 0, more: 0 });
  // The phone: bigger rows, and a one line break is only "+N".
  assert.deepEqual(chipPlan(px(20), 0, 2, COMPACT_BLOCK_PX, 18, 22), { mode: 'inline', shown: 0, more: 2 });
  assert.deepEqual(chipPlan(px(60), 0, 3, COMPACT_BLOCK_PX, 18, 22), { mode: 'stack', shown: 1, more: 2 });
  assert.deepEqual(chipPlan(px(90), 0, 3, COMPACT_BLOCK_PX, 18, 22), { mode: 'stack', shown: 3, more: 0 });
});

test('hostedMinutes: the hosted lengths (what counting once takes off); the setting reads safely', () => {
  assert.equal(hostedMinutes([brk('b', h(12), h(13)), task('a', h(12), h(12, 20)), task('c', h(12, 30), h(12, 45)), task('out', h(12, 50), h(13, 10))]), 35);
  assert.equal(parseBreakTwice('true'), true);
  assert.equal(parseBreakTwice('false'), false);
  assert.equal(parseBreakTwice(undefined), false);
  assert.equal(parseBreakTwice('yes'), false);
});

test('hostDrop: over a break the task starts inside it; longer is refused; elsewhere nothing changes', () => {
  const list = [{ id: 'lunch', startMin: h(12), endMin: h(13) }, { id: 'tea', startMin: h(15), endMin: h(15, 20) }];
  assert.deepEqual(hostDrop(list, h(12, 40), h(12, 30), 15), { kind: 'host', startMin: h(12, 30), brk: list[0] });
  assert.deepEqual(hostDrop(list, h(15, 10), h(15), 15), { kind: 'host', startMin: h(15), brk: list[1] });
  assert.deepEqual(hostDrop(list, h(15, 10), h(15), 30), { kind: 'longer', brk: list[1] });
  assert.deepEqual(hostDrop(list, h(14), h(14), 15), { kind: 'none' });
  assert.deepEqual(hostDrop([], h(12), h(12), 15), { kind: 'none' });
});

test('hostedMinutes: two tasks overlapping each other inside a break share their minutes once', () => {
  assert.equal(hostedMinutes([brk('b', h(12), h(13)), task('a', h(12), h(12, 40)), task('c', h(12, 20), h(12, 50))]), 50);
});

test('hostedEstimate: only tasks and breaks with an estimate, in the list, on the same day', () => {
  const D = (id: string, extra: Partial<Task>) => T(id, extra);
  const lunch = D('lunch', { startTime: '12:00', durationMinutes: 60, cutsBelow: true });
  const call = D('call', { startTime: '12:10', durationMinutes: 20 });
  const read = D('read', { startTime: '12:30', durationMinutes: 15 });
  assert.equal(hostedEstimate([lunch, call, read]), 35);
  assert.equal(hostedEstimate([call, read]), 0, 'the break is not in the list');
  assert.equal(hostedEstimate([{ ...lunch, durationMinutes: undefined }, call]), 0, 'a break with no estimate counts nothing twice');
  assert.equal(hostedEstimate([lunch, { ...call, durationMinutes: undefined }]), 0, 'a task with no estimate counts nothing');
  assert.equal(hostedEstimate([lunch, { ...call, dueDate: '2026-10-27' }]), 0, 'another day');
  assert.equal(hostedEstimate([lunch, { ...call, deletedAt: '2026-10-26T00:00:00.000Z' }]), 0, 'deleted');
  assert.equal(hostedEstimate([lunch, D('pill', { startTime: '08:00', durationMinutes: 10, extraTimes: ['12:40'] })]), 10, 'only the time inside the break');
});

test('3.9.0: moving out starts the task when the break ends, same day and length; Remove time makes it Anytime', () => {
  const call = T('call', { startTime: '12:10', durationMinutes: 20 });
  assert.deepEqual(moveOutFields(call, undefined, { endMin: h(13) }), { ok: true, fields: { startTime: '13:00' } });
  assert.deepEqual(moveOutFields(call, undefined, { endMin: h(24) }), { ok: false, note: ENDS_AT_MIDNIGHT });
  assert.deepEqual(removeTimeOutFields(call, undefined), { ok: true, fields: { startTime: undefined, extraTimes: undefined, timesDone: undefined } });
});

test('3.9.0: a task with several times moves or loses only the time inside the break', () => {
  const pill = T('pill', { startTime: '08:00', durationMinutes: 10, extraTimes: ['12:40', '18:00'] });
  const out = moveOutFields(pill, '12:40', { endMin: h(13) });
  assert.ok(out.ok);
  assert.deepEqual(out.ok && [out.fields.startTime, out.fields.extraTimes], ['08:00', ['13:00', '18:00']]);
  const gone = removeTimeOutFields(pill, '12:40');
  assert.ok(gone.ok);
  assert.deepEqual(gone.ok && [gone.fields.startTime, gone.fields.extraTimes], ['08:00', ['18:00']]);
  const clash = moveOutFields({ ...pill, extraTimes: ['12:40', '13:00'] }, '12:40', { endMin: h(13) });
  assert.equal(clash.ok, false, 'one of its own times is already there');
});

test('3.10.0: hostLinks pairs each hosted time with its break; hostIndex gives the cards their caption and count', () => {
  const tasks = [
    T('lunch', { startTime: '12:00', durationMinutes: 60, cutsBelow: true }),
    T('call', { startTime: '12:10', durationMinutes: 20 }),
    T('read', { startTime: '12:20', durationMinutes: 30 }),
    T('pill', { startTime: '08:00', durationMinutes: 10, extraTimes: ['12:40'] }),
    T('out', { startTime: '12:50', durationMinutes: 30 }),
  ];
  const links = hostLinks(tasks, DAY, DAY);
  assert.deepEqual(links.map((l) => [l.guest.id, l.brk.full.id]), [['task:call', 'lunch'], ['task:read', 'lunch'], ['task:pill@12:40', 'lunch']]);
  const idx = hostIndex(tasks, [DAY, DAY], DAY);
  assert.equal(idx.inside.get('lunch'), 3, 'two overlapping tasks and a second time all count, the day once');
  assert.equal(idx.during.get('pill'), 'lunch', 'the title of the break (T titles a task by its id)');
  assert.equal(idx.during.has('out'), false);
  assert.equal(duringCaption('Lunch'), 'During Lunch');
  assert.equal(insidePill(3), '3 inside');
});

test('3.10.0: a repeating day moved into a break is hosted; Split off or a deleted break hosts nothing', () => {
  const later = '2026-10-29';
  const base = [
    T('lunch', { startTime: '12:00', durationMinutes: 60, cutsBelow: true, dueDate: later }),
    T('walk', { dueDate: '2026-10-20', startTime: '07:00', durationMinutes: 20, recurrence: 'daily' }),
  ];
  // That day of the walk moved to 12:10 (stored as root:day with its own time).
  const moved = [...base, T('walk:' + later, { dueDate: later, startTime: '12:10', durationMinutes: 20, recurrence: 'daily' })];
  assert.equal(hostIndex(moved, [later], DAY).during.get('walk:' + later), 'lunch');
  assert.equal(hostIndex([{ ...moved[0], cutsBelow: false }, ...moved.slice(1)], [later], DAY).during.size, 0, 'Split off');
  assert.equal(hostIndex([{ ...moved[0], deletedAt: '2026-10-26T00:00:00.000Z' }, ...moved.slice(1)], [later], DAY).during.size, 0, 'deleted');
});
