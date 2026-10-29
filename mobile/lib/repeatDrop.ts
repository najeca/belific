// Dragging a repeating task that has no Day yet (an empty Task date) from the left list onto a day (3.18.1).
// Such a task has no series yet (a series is counted from its first row's Day), so the day it is dropped on becomes
// its start, and that day has to be one the repeat rule runs on: Mon and Thu for a weekly Mon and Thu task. Any
// other day is refused with a hint, and nothing is written.
import type { Task } from './types.ts';
import { effectiveDays, formatDayList, monthDayOf, ordinal, weekdayOf } from './repeat.ts';
import { occursOn } from './series.ts';

type RuleFields = Pick<Task, 'recurrence' | 'recurrenceDays' | 'recurrenceMonthDay' | 'dueDate'>;

// Is this a repeating task with no Day, the kind this rule is about?
export function isUndatedRepeating(task: Pick<Task, 'recurrence' | 'dueDate'> & { id?: string }): boolean {
  return !!task.recurrence && !task.dueDate;
}

// Where the rule runs, for the hint: "Mon, Thu" or "the 15th".
export function repeatDaysText(task: RuleFields, todayKey: string): string {
  if (task.recurrence === 'monthly') return `the ${ordinal(monthDayOf(task, todayKey))}`;
  return effectiveDays(task, todayKey).join(', ');
}

export function repeatDropHint(task: RuleFields, todayKey: string): string {
  return `Drop on a repeat day (${repeatDaysText(task, todayKey)}) or change the repeat`;
}

// null when `dayKey` is a day the rule runs on (counting the series from that day), else the hint.
export function repeatDropRefusal(task: RuleFields, dayKey: string, todayKey: string): string | null {
  if (!task.recurrence) return null;
  // The weekdays and the month day are the rule's own; the rest (which week of a two weekly, which year) is
  // counted from the day the series starts, and this day starts it.
  if (task.recurrence === 'weekly' || task.recurrence === 'biweekly' || task.recurrence === 'triweekly') {
    return effectiveDays(task, todayKey).includes(weekdayOf(dayKey)) ? null : repeatDropHint(task, todayKey);
  }
  return occursOn({ ...task, dueDate: undefined }, dayKey, dayKey) ? null : repeatDropHint(task, todayKey);
}

// What the drop writes first: the task gets that day as its Day (its series starts there). The time, if the
// drop set one, is written after, by seriesActions.startRepeatingOn.
export function startedOn(task: Task, dayKey: string, nowIso: string): Task {
  return { ...task, dueDate: dayKey, updatedAt: nowIso };
}
