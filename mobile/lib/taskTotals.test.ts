// Run with `npm test` from mobile/. Estimate against actual (build plan phase 2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { actualOf, estimateOf, formatTotals, plannedText, totalsOf } from './taskTotals.ts';
import { planCuts } from './cuts.ts';
import { hostDay, scheduledSpans, type HostEntry } from './hosting.ts';
import { totalScheduledMinutes } from './timebox.ts';
import { startTimer } from './taskTimer.ts';
import type { Task } from './types.ts';

const T0 = Date.parse('2026-10-16T09:00:00.000Z');
const MIN = 60000;
const task = (extra: Partial<Task> = {}): Task => ({ id: 't', title: 'T', completed: false, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', ...extra });

test('a missing actual reads as 0, a missing estimate as 0', () => {
  assert.equal(actualOf(task(), T0), 0);
  assert.equal(actualOf(task({ actualMinutes: undefined }), T0), 0);
  assert.equal(estimateOf(task()), 0);
  assert.equal(estimateOf(task({ durationMinutes: 45 })), 45);
  assert.equal(estimateOf(task({ durationMinutes: -5 })), 0);
  assert.equal(estimateOf(task({ durationMinutes: Number.NaN })), 0);
});

test('totals sum estimates and actuals; deleted tasks never count; null actual is 0', () => {
  const tasks = [
    task({ id: 'a', durationMinutes: 60, actualMinutes: 25, completed: true }),
    task({ id: 'b', durationMinutes: 30 }),
    task({ id: 'c', actualMinutes: 10 }),
    task({ id: 'd', durationMinutes: 999, actualMinutes: 999, deletedAt: '2026-10-02T00:00:00.000Z' }),
  ];
  assert.deepEqual(totalsOf(tasks, T0), { count: 3, done: 1, estimate: 90, actual: 35 });
  assert.deepEqual(totalsOf([], T0), { count: 0, done: 0, estimate: 0, actual: 0 });
});

test('a running timer counts for the time it has run, rounded down; a future start counts 0', () => {
  const running = startTimer(task({ durationMinutes: 60, actualMinutes: 10 }), T0);
  assert.equal(actualOf(running, T0 + 7 * MIN + 59_000), 17);
  assert.equal(actualOf(running, T0 - 5 * MIN), 10, 'the other clock is ahead: the running part is 0');
  assert.equal(totalsOf([running], T0 + 20 * MIN).actual, 30);
});

test('text (3.26.0): the estimate alone in H:MM, nothing for an empty day; an actual time is never shown', () => {
  assert.equal(formatTotals({ estimate: 90 }), '1:30');
  assert.equal(formatTotals({ estimate: 0 }), '');
  assert.equal(formatTotals(totalsOf([task({ durationMinutes: 0, actualMinutes: 5 })], T0)), '');
  assert.equal(formatTotals(totalsOf([task({ durationMinutes: 60, actualMinutes: 25 })], T0)), '1:00');
});

test('2.26.0 the add task box total: estimated time still to do, "5h planned"', async () => {
  const { plannedText } = await import('./taskTotals.ts');
  const t = (durationMinutes?: number, completed = false, deletedAt?: string) => ({ durationMinutes, completed, deletedAt });
  assert.equal(plannedText([]), '');
  assert.equal(plannedText([t(undefined), t(0)]), '');
  assert.equal(plannedText([t(120), t(180)]), '5h planned');
  assert.equal(plannedText([t(60), t(30)]), '1h 30m planned');
  assert.equal(plannedText([t(45)]), '45m planned');
  assert.equal(plannedText([t(45), t(600, true), t(60, false, '2026-10-01T00:00:00Z')]), '45m planned');
});

test('P1: a Break is a free gap: it has no estimate, is not counted, and a task inside it counts in full', () => {
  const lunch = task({ id: 'lunch', dueDate: '2026-10-26', startTime: '12:00', durationMinutes: 60, cutsBelow: true });
  const call = task({ id: 'call', dueDate: '2026-10-26', startTime: '12:10', durationMinutes: 20, actualMinutes: 15 });
  const after = task({ id: 'after', dueDate: '2026-10-26', startTime: '13:00', durationMinutes: 30 });
  assert.equal(estimateOf(lunch), 0);
  assert.deepEqual(totalsOf([lunch, call, after], T0), { count: 2, done: 0, estimate: 50, actual: 15 });
  assert.equal(totalsOf([lunch], T0).estimate, 0);
  assert.equal(totalsOf([lunch, task({ id: 'x', completed: true, cutsBelow: true })], T0).done, 0, 'a ticked break is not a done task');
  assert.equal(plannedText([lunch, call]), '20m planned', 'Brain Dump and list figures leave the break out');
  assert.equal(plannedText([{ ...lunch, durationMinutes: 600 }]), '');
});

// The example of PLAN_breaks_as_gaps: Boot Camp 9:30 for 7 h, short break 11:00 for 20 min, long break 12:30 for 1 h,
// short break 15:00 for 20 min; on Monday four tasks sit in the gaps. Monday is 7:00 in Kanban and in the Timebox.
const DAY = '2026-11-09';
const exampleDay = (withTasks: boolean) => {
  const t = (id: string, startTime: string, durationMinutes: number, extra: Partial<Task> = {}) => task({ id, title: id, dueDate: DAY, startTime, durationMinutes, ...extra });
  return [
    t('boot', '09:30', 420),
    t('short1', '11:00', 20, { cutsBelow: true }),
    t('long', '12:30', 60, { cutsBelow: true }),
    t('short2', '15:00', 20, { cutsBelow: true }),
    ...(withTasks ? [t('warm', '11:00', 20), t('run', '12:30', 30), t('lunch', '13:00', 30), t('shower', '15:00', 20)] : []),
  ];
};
// The Timebox pane's own steps: entries, hosting, cuts, then the Scheduled spans.
function scheduledOf(tasks: Task[]): number {
  const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  const entries: HostEntry[] = tasks.map((t) => ({ id: t.id, startMin: toMin(t.startTime as string), endMin: toMin(t.startTime as string) + (t.durationMinutes as number), breaks: !!t.cutsBelow }));
  const host = hostDay(entries);
  const plan = planCuts(entries.filter((e) => !host.hostOf.has(e.id)), 30, (id) => id);
  return totalScheduledMinutes(scheduledSpans(plan.items, entries));
}

test('P1 Boot Camp, Monday: 7:00 in Kanban and in the Timebox (5:20 of Boot Camp and 1:40 of tasks)', () => {
  const monday = exampleDay(true);
  assert.equal(formatTotals(totalsOf(monday, T0)), '7:00');
  assert.equal(scheduledOf(monday), 420);
});

test('P1 Boot Camp, Tuesday: the same breaks and no tasks in them is 5:20 in both', () => {
  const tuesday = exampleDay(false);
  assert.equal(formatTotals(totalsOf(tuesday, T0)), '5:20');
  assert.equal(scheduledOf(tuesday), 320);
});

test('P1 Boot Camp: the smallest piece (D3) keeps a refused cut whole; with no breaks in the list nothing is cut', () => {
  const tuesday = exampleDay(false);
  assert.equal(formatTotals(totalsOf(tuesday, T0, 90)), '6:40', 'a larger smallest piece refuses the cuts that leave 70 minutes: only the first one cuts');
  assert.equal(formatTotals(totalsOf(tuesday.filter((t) => !t.cutsBelow), T0)), '7:00');
});
