// Run with `npm test` from mobile/. What Today shows, shared by the phone and the desktop (PLAN_desktop_parity D1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { todayModel, todaySettings } from './todayModel.ts';
import { orderKey } from './anytimeOrder.ts';
import type { Project, Task } from './types.ts';

const DAY = '2026-11-12';
const STAMP = '2026-11-01T00:00:00.000Z';
const T = (id: string, startTime?: string, durationMinutes?: number, extra: Partial<Task> = {}): Task => ({
  id,
  title: id,
  completed: false,
  createdAt: STAMP,
  updatedAt: STAMP,
  dueDate: DAY,
  ...(startTime ? { startTime } : {}),
  ...(durationMinutes ? { durationMinutes } : {}),
  ...extra,
});
const LABELS: Project[] = [{ key: 'h', name: 'Health', createdAt: STAMP, updatedAt: STAMP } as Project];
const base = { todayKey: DAY, cutMin: 30, order: [] as string[], labels: LABELS, hoursStored: new Map<string, string>() };

test('rows inside a shift are not rows of their own; the shift keeps its row', () => {
  const tasks = [T('shift', '08:00', 600), T('in', '09:00', 60), T('later', '19:00', 30)];
  const m = todayModel({ ...base, tasks, nowMin: 7 * 60 });
  assert.deepEqual(m.timeline.map((r) => r.item.key), ['shift', 'later']);
  assert.ok(m.shifts.hidden.has('in'));
  assert.ok(m.shifts.byTask.has('shift'));
});

test('the timeline is in time order, then by title, and keeps ticked items', () => {
  const tasks = [T('b', '10:00', 30), T('a', '10:00', 30), T('early', '07:00', 15, { completed: true })];
  const m = todayModel({ ...base, tasks, nowMin: 12 * 60 });
  assert.deepEqual(m.timeline.map((r) => r.item.key), ['early', 'a', 'b']);
  assert.equal(m.timeline[0].span.done, true);
});

test('the Now card: the item running now, and the next one', () => {
  const tasks = [T('gym', '14:00', 60), T('call', '15:30', 15)];
  const m = todayModel({ ...base, tasks, nowMin: 14 * 60 + 35 });
  assert.equal(m.now.now?.key, 'gym');
  assert.equal(m.nowItem?.key, 'gym');
  assert.equal(m.now.next?.key, 'call');
});

test('a quick reminder is never Now, only Next', () => {
  const tasks = [T('ring', '14:00', undefined, { durationMinutes: 0 })];
  const m = todayModel({ ...base, tasks, nowMin: 13 * 60 + 50 });
  assert.equal(m.now.now, null);
  assert.equal(m.now.next?.key, 'ring');
});

test('Anytime follows the stored order; new ones after; ticked untimed go to done', () => {
  const tasks = [T('x'), T('y'), T('z'), T('fin', undefined, undefined, { completed: true })];
  const m = todayModel({ ...base, tasks, nowMin: 9 * 60, order: ['z', 'x'] });
  assert.deepEqual(m.anytime.map((i) => i.key), ['z', 'x', 'y']);
  assert.deepEqual(m.doneUntimed.map((i) => i.key), ['fin']);
});

test('the hours strip counts today only, done and planned', () => {
  const tasks = [T('a', '09:00', 60, { projectKey: 'h' }), T('b', '11:00', 30, { projectKey: 'h', completed: true }), T('other', '09:00', 60, { dueDate: '2026-11-13', projectKey: 'h' })];
  const m = todayModel({ ...base, tasks, nowMin: 8 * 60 });
  assert.equal(m.hours.total, 90);
});

test('settings: the hours switches by label, and order rows older than 14 days are stale', () => {
  const r = todaySettings(
    [
      { key: 'hours.count.h', value: 'off' },
      { key: 'hours.count.gone', value: 'off', deletedAt: STAMP },
      { key: orderKey('2026-10-01'), value: '[]' },
      { key: orderKey(DAY), value: '[]' },
      { key: 'cut.min', value: '30' },
    ],
    DAY,
  );
  assert.deepEqual([...r.hoursStored], [['h', 'off']]);
  assert.deepEqual(r.stale, [orderKey('2026-10-01')]);
});
