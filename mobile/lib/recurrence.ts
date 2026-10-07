// Pure recurrence maths for recurring Tasks (checkpoints 2b and 2c). NO runtime
// react-native or storage imports so `node --test` can run it; see
// recurrence.test.ts. On the iPhone only the NEXT occurrence ever exists
// (docs/DESIGN_VISION section 2): completing a recurring task creates the next
// one, see taskActions.ts. The desktop shows the coming days of a series
// without storing them (series.ts, decision 023) and only uses this file's id
// scheme and next-day maths for a repeating task with no Day. Dates are local
// 'YYYY-MM-DD' keys.
import type { RecurrenceRule, Task, WeekDay } from './types.ts';
import { WEEKDAYS, addDays, dateKey, isDateKey, parseDateKey, weekStartOf } from './kanban.ts';
import { effectiveDays, monthDayOf } from './repeat.ts';
import { copyForNextOccurrence } from './subtasks.ts';

// The chain's root id is the part before the first ':'. Existing ids (UUID v4
// or a Date.now() based string) never contain one, and every generated
// occurrence id is `${rootId}:${dueDate}`.
export function rootTaskId(id: string): string {
  const i = id.indexOf(':');
  return i === -1 ? id : id.slice(0, i);
}

// Deterministic: two devices completing the same occurrence compute the same
// id, so the second one finds it already there and creates nothing.
export function nextOccurrenceId(id: string, nextDueDate: string): string {
  return `${rootTaskId(id)}:${nextDueDate}`;
}

// Day `monthDay` of the month that contains `year/month`, clamped to its
// last day (31 becomes 28 Feb, or 29 in a leap year).
function clampedMonthDay(year: number, month: number, monthDay: number): Date {
  const last = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(monthDay, last));
}

// The first chosen weekday strictly after `base` in a week that is "on" for a
// repeat every `period` weeks, counted from the week of `anchor` (Monday
// based). period 1 is every week.
function nextChosenDay(base: Date, days: WeekDay[], anchor: Date, period: number): Date {
  const anchorWeek = weekStartOf(anchor).getTime();
  for (let i = 1; i <= 7 * period + 7; i++) {
    const candidate = addDays(base, i);
    if (!days.includes(WEEKDAYS[candidate.getDay()] as WeekDay)) continue;
    // Calendar weeks between the two Mondays (rounded: clocks changing make a
    // week 167 or 169 hours).
    const weeks = Math.round((weekStartOf(candidate).getTime() - anchorWeek) / (7 * 24 * 60 * 60 * 1000));
    if (((weeks % period) + period) % period === 0) return candidate;
  }
  return addDays(base, 7 * period);
}

// The Day of the next occurrence, or null if the task does not repeat.
//  - daily: +1 day
//  - weekly (Specific days): the next chosen weekday
//  - biweekly (Every 2 weeks): the next chosen weekday in an "on" week; the
//    week of the task's Day is "on", then every other week. triweekly: every
//    third week, same rule (never offered by an editor; kept for old data).
//  - weekly or biweekly with no days chosen (older data): the weekday of the
//    task's Day
//  - monthly: the next date with its recurrenceMonthDay (or the Day's date
//    number), clamped to shorter months
// Every "next" is STRICTLY AFTER the base.
// The count starts from the LATER of the task's Day and today (a task with no,
// or an invalid, Day counts from today), so the next occurrence is never in the
// past: completing an overdue weekly task today gives the next weekday after
// today, not a date that is already gone. Two devices completing on the same
// day agree on the id; if they complete on different days they could create
// two different next occurrences, which is accepted.
export function nextOccurrence(
  task: { dueDate?: string; recurrence?: RecurrenceRule; recurrenceDays?: WeekDay[]; recurrenceMonthDay?: number },
  todayKey: string,
): string | null {
  if (!task.recurrence) return null;
  const dayKey = isDateKey(task.dueDate) ? task.dueDate : todayKey;
  const base = parseDateKey(dayKey > todayKey ? dayKey : todayKey);
  const anchor = parseDateKey(dayKey);
  switch (task.recurrence) {
    case 'daily':
      return dateKey(addDays(base, 1));
    case 'weekly':
      return dateKey(nextChosenDay(base, effectiveDays(task, todayKey), anchor, 1));
    case 'biweekly':
      return dateKey(nextChosenDay(base, effectiveDays(task, todayKey), anchor, 2));
    case 'triweekly':
      return dateKey(nextChosenDay(base, effectiveDays(task, todayKey), anchor, 3));
    case 'monthly': {
      const md = monthDayOf(task, todayKey);
      const sameMonth = clampedMonthDay(base.getFullYear(), base.getMonth(), md);
      if (sameMonth.getTime() > base.getTime()) return dateKey(sameMonth);
      return dateKey(clampedMonthDay(base.getFullYear(), base.getMonth() + 1, md));
    }
    default:
      return null;
  }
}

// The task that follows `task`: same name, duration, priority, label, notes
// and repeat settings, not completed, with the deterministic id. (The time of
// day, startTime, is not carried over.)
export function buildNextOccurrence(task: Task, todayKey: string, nowIso: string): Task | null {
  const dueDate = nextOccurrence(task, todayKey);
  if (!dueDate) return null;
  const id = nextOccurrenceId(task.id, dueDate);
  const subtasks = copyForNextOccurrence(task.subtasks, id);
  return {
    id,
    title: task.title,
    dueDate,
    priority: task.priority,
    projectKey: task.projectKey,
    notes: task.notes,
    durationMinutes: task.durationMinutes,
    recurrence: task.recurrence,
    recurrenceDays: task.recurrenceDays,
    recurrenceMonthDay: task.recurrenceMonthDay,
    ...(subtasks ? { subtasks } : {}),
    ...(task.reminderMinutes !== undefined && task.reminderMinutes !== null ? { reminderMinutes: task.reminderMinutes } : {}),
    completed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}
