// The quiet line at the foot of a day column on the Tasks board (PLAN_breaks_as_gaps, P1, D1): a Break with a time is a
// gap on the Calendar and the Timebox, not a card, so the column only says how many there are and how long. Pure: NO
// runtime imports besides siblings; see breakLine.test.ts.
import type { Task } from './types.ts';
import { formatDuration } from './duration.ts';
import { DEFAULT_TASK_MINUTES } from './timebox.ts';
import { timesOf } from './times.ts';
import { BREAK_CUP, isBreak } from './taskKind.ts';

// A Break that is placed (it has a start time) is a gap on the grid; one with no time keeps its card.
export function isTimedBreak(task: Pick<Task, 'cutsBelow' | 'startTime' | 'extraTimes'>): boolean {
  return isBreak(task) && timesOf(task).length > 0;
}

// One gap per time of the day; a Break with no length is drawn at the default 30 minutes.
export function breakGaps(task: Pick<Task, 'durationMinutes' | 'startTime' | 'extraTimes'>): { count: number; minutes: number } {
  const len = typeof task.durationMinutes === 'number' && Number.isFinite(task.durationMinutes) && task.durationMinutes > 0 ? Math.round(task.durationMinutes) : DEFAULT_TASK_MINUTES;
  const count = timesOf(task).length;
  return { count, minutes: len * count };
}

// "☕ 3 breaks · 1h 40m"
export function breakLineText(breaks: Array<Pick<Task, 'durationMinutes' | 'startTime' | 'extraTimes'>>): string {
  let count = 0;
  let minutes = 0;
  for (const b of breaks) {
    const g = breakGaps(b);
    count += g.count;
    minutes += g.minutes;
  }
  return `${BREAK_CUP} ${count === 1 ? '1 break' : `${count} breaks`} · ${formatDuration(minutes) ?? '0m'}`;
}

// A row of the line's list: "11:00 · 20m".
export function breakRowSub(task: Pick<Task, 'durationMinutes' | 'startTime' | 'extraTimes'>): string {
  const g = breakGaps(task);
  return `${timesOf(task).join(', ')} · ${formatDuration(g.minutes / Math.max(1, g.count))}`;
}
