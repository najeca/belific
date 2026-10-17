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

type TotalsInput = Pick<Task, 'durationMinutes' | 'actualMinutes' | 'timerStartedAt' | 'completed' | 'deletedAt'>;

export function totalsOf(tasks: TotalsInput[], nowMs: number): Totals {
  const t: Totals = { count: 0, done: 0, estimate: 0, actual: 0 };
  for (const task of tasks) {
    if (task.deletedAt) continue;
    t.count += 1;
    if (task.completed) t.done += 1;
    t.estimate += estimateOf(task);
    t.actual += actualOf(task, nowMs);
  }
  return t;
}

// "0:25 / 1:30": actual first, then estimated, H:MM like the chips. Nothing
// planned and nothing spent reads as no text at all (an empty day shows no sum).
export function formatTotals(t: Pick<Totals, 'estimate' | 'actual'>): string {
  if (t.estimate === 0 && t.actual === 0) return '';
  return `${formatClock(t.actual)} / ${formatClock(t.estimate)}`;
}

// The same for one task's chips: "0:25 / 1:00".
export function formatTaskTime(task: Pick<Task, 'durationMinutes' | 'actualMinutes' | 'timerStartedAt'>, nowMs: number): string {
  return `${formatClock(actualOf(task, nowMs))} / ${formatClock(estimateOf(task))}`;
}

// Over the estimate: only when there is one. Used to tint the figure gently
// (never a warning: decision 027, nothing here shames).
export function isOverEstimate(t: Pick<Totals, 'estimate' | 'actual'>): boolean {
  return t.estimate > 0 && t.actual > t.estimate;
}

// The add task box's total (2.26.0): the estimated time of what is still to do
// in a list, "5h planned", "1h 30m planned", "45m planned"; nothing when there
// is none. Finished tasks do not count; a missing estimate is 0.
export function plannedText(tasks: TotalsInput[]): string {
  let minutes = 0;
  for (const t of tasks) if (!t.deletedAt && !t.completed) minutes += estimateOf(t);
  if (minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h ? `${h}h` : ''}${h && m ? ' ' : ''}${m ? `${m}m` : ''} planned`;
}
