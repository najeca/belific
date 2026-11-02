// Estimate against actual, for a day or a list (build plan phase 2). Pure: NO
// runtime imports besides siblings; see taskTotals.test.ts.
//
// actual_minutes is nullable and NULL means 0 (build plan section 0, item 8),
// so every figure here reads a missing actual as 0. A running timer counts for
// the time it has run so far (taskTimer.shownMinutes), so a total moves while a
// timer runs without anything being stored. Deleted tasks never count.
import type { Task } from './types.ts';
import { formatClock } from './duration.ts';
import { shownMinutes } from './taskTimer.ts';
import { timesCount, timesLeft } from './times.ts';
import { hostedEstimate } from './hosting.ts';

export interface Totals {
  count: number;
  done: number;
  estimate: number;
  actual: number;
}

export function estimateOf(task: Pick<Task, 'durationMinutes'>): number {
  const m = task.durationMinutes;
  return typeof m === 'number' && Number.isFinite(m) && m > 0 ? Math.round(m) : 0;
}

export function actualOf(task: Pick<Task, 'actualMinutes' | 'timerStartedAt'>, nowMs: number): number {
  return shownMinutes(task, nowMs);
}

// A task with several times a day (Part C) takes its length at every time: the estimate of the day
// counts all of them, what is still to do counts the times not yet ticked.
type TotalsInput = Pick<Task, 'durationMinutes' | 'actualMinutes' | 'timerStartedAt' | 'completed' | 'deletedAt'> &
  Partial<Pick<Task, 'startTime' | 'extraTimes' | 'timesDone' | 'completedAt' | 'dueDate' | 'cutsBelow'>>;

// 3.8.0 (task during a break): a task fully inside a break shares its minutes with the break. Unless
// "Count minutes done during a break twice" is on (`breakTwice`), the estimate counts them once
// (lib/hosting.ts hostedEstimate). The actual time is never changed: one timer runs at a time, so a
// task's and its break's timed minutes never overlap.
export function totalsOf(tasks: TotalsInput[], nowMs: number, breakTwice = false): Totals {
  const t: Totals = { count: 0, done: 0, estimate: 0, actual: 0 };
  for (const task of tasks) {
    if (task.deletedAt) continue;
    t.count += 1;
    if (task.completed) t.done += 1;
    t.estimate += estimateOf(task) * timesCount(task);
    t.actual += actualOf(task, nowMs);
  }
  if (!breakTwice) t.estimate -= hostedEstimate(tasks);
  return t;
}

// "1:30": the estimated time, H:MM like the chips. 3.26.0: Actual time is no longer shown anywhere, so
// the figure is the estimate alone (the stored actual minutes stay, `actual` is still summed for the
// data export). Nothing planned reads as no text at all (an empty day shows no sum).
export function formatTotals(t: Pick<Totals, 'estimate'>): string {
  return t.estimate > 0 ? formatClock(t.estimate) : '';
}

// The add task box's total (2.26.0): the estimated time of what is still to do
// in a list, "5h planned", "1h 30m planned", "45m planned"; nothing when there
// is none. Finished tasks do not count; a missing estimate is 0.
export function plannedText(tasks: TotalsInput[]): string {
  let minutes = 0;
  for (const t of tasks) if (!t.deletedAt && !t.completed) minutes += estimateOf(t) * timesLeft(t);
  if (minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h ? `${h}h` : ''}${h && m ? ' ' : ''}${m ? `${m}m` : ''} planned`;
}
