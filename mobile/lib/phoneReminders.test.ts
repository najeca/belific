// Run with `npm test` from mobile/. The phone's task reminders (PLAN_phone P7): the desktop's rules
// and keys, each time of a task, repeating days, passed leads skipped, the iOS limit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planTaskReminders } from './phoneReminders.ts';
import type { Task } from './types.ts';

const NOW = new Date(2026, 9, 22, 8, 0, 0).getTime(); // Thu 22 Oct 2026, 08:00 local
const T = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, completed: false, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', dueDate: '2026-10-22', ...extra });
const at = (h: number, m = 0, day = 22) => new Date(2026, 9, day, h, m, 0).getTime();

test('a timed task reminds at its start by default, with the desktop key', () => {
  const r = planTaskReminders({ tasks: [T('a', { startTime: '09:30' })], now: NOW, limit: 64 });
  assert.deepEqual(r, [{ key: 'task:a', at: at(9, 30), title: 'a', body: 'Starting now' }]);
});

test('its own list of leads; a lead that has passed is skipped on its own', () => {
  const r = planTaskReminders({ tasks: [T('a', { startTime: '08:20', reminders: [0, 10, 60] })], now: NOW, limit: 64 });
  assert.deepEqual(
    r.map((x) => [x.key, x.at, x.body]),
    [
      ['task:a@10', at(8, 10), 'Starts in 10 minutes'],
      ['task:a', at(8, 20), 'Starting now'],
    ],
    'the hour before has passed',
  );
  assert.deepEqual(planTaskReminders({ tasks: [T('a', { startTime: '09:00', reminders: [] })], now: NOW, limit: 64 }), [], 'an empty list is no reminder');
  assert.deepEqual(planTaskReminders({ tasks: [T('a', { startTime: '09:00', reminderMinutes: -1 })], now: NOW, limit: 64 }), [], 'the legacy "off"');
});

test('each time of a task with several times that is not done; untimed, done, deleted and past tasks never', () => {
  const r = planTaskReminders({
    tasks: [
      T('brk', { startTime: '11:00', extraTimes: ['15:00', '17:00'], timesDone: ['15:00'] }),
      T('free'),
      T('done', { startTime: '12:00', completed: true }),
      T('gone', { startTime: '12:00', deletedAt: '2026-10-21T00:00:00.000Z' }),
      T('past', { startTime: '07:00' }),
    ],
    now: NOW,
    limit: 64,
  });
  assert.deepEqual(r.map((x) => x.key), ['task:brk', 'task:brk#17:00']);
});

test('the projected days of a repeating series remind too, within 14 days; a skipped day does not', () => {
  const tasks = [T('walk', { dueDate: '2026-10-20', startTime: '07:30', recurrence: 'daily' }), T('walk:2026-10-24', { dueDate: '2026-10-24', startTime: '07:30', recurrence: 'daily', deletedAt: '2026-10-21T00:00:00.000Z' })];
  const r = planTaskReminders({ tasks, now: NOW, limit: 64 });
  assert.equal(r[0].key, 'task:walk:2026-10-23', 'today 07:30 has passed; tomorrow is first');
  assert.ok(!r.some((x) => x.key === 'task:walk:2026-10-24'), 'the skipped day');
  assert.equal(r.length, 12, '23 Oct to 4 Nov less the skipped day');
});

test('only the soonest within the limit (iOS keeps 64 per app)', () => {
  const tasks = Array.from({ length: 30 }, (_, i) => T(`t${i}`, { startTime: `${String(9 + Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}` }));
  const r = planTaskReminders({ tasks, now: NOW, limit: 10 });
  assert.equal(r.length, 10);
  assert.deepEqual(r.map((x) => x.key).slice(0, 2), ['task:t0', 'task:t1']);
  assert.ok(r.every((x, i) => i === 0 || r[i - 1].at <= x.at));
});
