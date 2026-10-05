// Pure recurrence maths for recurring Tasks (checkpoint 2b). NO runtime
// react-native or storage imports so `node --test` can run it; see
// recurrence.test.ts. Only the NEXT occurrence ever exists (docs/DESIGN_VISION
// section 2): completing a recurring task creates the next one, see
// taskActions.ts. Dates are local 'YYYY-MM-DD' keys.
import type { RecurrenceRule, Task, WeekDay } from './types.ts';
import { WEEKDAYS, addDays, dateKey, isDateKey, parseDateKey } from './kanban.ts';

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

// Same day of the month next month, clamped to that month's last day
// (31 Jan becomes 28 Feb, or 29 in a leap year).
function addOneMonthClamped(d: Date): Date {
  const lastOfNext = new Date(d.getFullYear(), d.getMonth() + 2, 0).getDate();
  return new Date(d.getFullYear(), d.getMonth() + 1, Math.min(d.getDate(), lastOfNext));
}

// The Day of the next occurrence, or null if the task does not repeat.
//  - daily: +1 day
//  - weekly with weekdays: the next selected weekday after the current Day
//  - weekly with none selected: +7 days
//  - biweekly (every 2 weeks): +14 days; triweekly: +21 days
//  - monthly: same day of the month next month, clamped to the month end
// A recurring task with no (or an invalid) Day counts from today. The result
// depends only on the task's own Day, never on when it was completed, so it
// is the same on every device.
export function nextOccurrence(
  task: { dueDate?: string; recurrence?: RecurrenceRule; recurrenceDays?: WeekDay[] },
  todayKey: string,
): string | null {
  if (!task.recurrence) return null;
  const base = parseDateKey(isDateKey(task.dueDate) ? task.dueDate : todayKey);
  switch (task.recurrence) {
    case 'daily':
      return dateKey(addDays(base, 1));
    case 'weekly': {
      const wanted = task.recurrenceDays ?? [];
      if (wanted.length === 0) return dateKey(addDays(base, 7));
      for (let i = 1; i <= 7; i++) {
        const candidate = addDays(base, i);
        if (wanted.includes(WEEKDAYS[candidate.getDay()] as WeekDay)) return dateKey(candidate);
      }
      return dateKey(addDays(base, 7));
    }
    case 'biweekly':
      return dateKey(addDays(base, 14));
    case 'triweekly':
      return dateKey(addDays(base, 21));
    case 'monthly':
      return dateKey(addOneMonthClamped(base));
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
  return {
    id: nextOccurrenceId(task.id, dueDate),
    title: task.title,
    dueDate,
    priority: task.priority,
    projectKey: task.projectKey,
    notes: task.notes,
    durationMinutes: task.durationMinutes,
    recurrence: task.recurrence,
    recurrenceDays: task.recurrenceDays,
    completed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}
