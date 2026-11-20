// A repeat said in words for the phone's Tasks tab (PLAN_phone_stepflow section 4, 3.61.0): "Every day",
// "Every Monday and Wednesday", "Every 2 weeks on Friday", "Monthly on the 3rd", with " · Until 17 Dec" when the
// repeat ends. Pure: NO runtime imports besides siblings; see repeatWords.test.ts. `repeatLine` (repeat.ts) keeps the
// short "Mon, Wed" forms the desktop uses; this is the longer form, new for the phone.
import type { Task, WeekDay } from './types.ts';
import { dayAndMonth, effectiveDays, monthDayOf, ordinal, sortDays } from './repeat.ts';
import { isDateKey } from './kanban.ts';

const FULL: Record<WeekDay, string> = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' };

// "Monday", "Monday and Wednesday", "Monday, Wednesday and Friday" (a run of days is still listed, never abbreviated).
export function fullDayList(days: WeekDay[]): string {
  const list = sortDays(days).map((d) => FULL[d]);
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

type RuleFields = Pick<Task, 'recurrence' | 'recurrenceDays' | 'recurrenceMonthDay' | 'dueDate'> & Partial<Pick<Task, 'repeatUntil'>>;

export function repeatWords(task: RuleFields, todayKey: string): string | undefined {
  const days = effectiveDays(task, todayKey);
  let base: string | undefined;
  switch (task.recurrence) {
    case 'daily':
      base = 'Every day';
      break;
    case 'weekly':
      base = days.length === 7 ? 'Every day' : `Every ${fullDayList(days)}`;
      break;
    case 'biweekly':
      base = days.length === 7 ? 'Every day of every other week' : `Every 2 weeks on ${fullDayList(days)}`;
      break;
    case 'triweekly':
      base = days.length === 7 ? 'Every day of every third week' : `Every 3 weeks on ${fullDayList(days)}`;
      break;
    case 'monthly':
      base = `Monthly on the ${ordinal(monthDayOf(task, todayKey))}`;
      break;
    case 'annual':
      base = isDateKey(task.dueDate) ? `Every year on ${dayAndMonth(task.dueDate)}` : 'Every year';
      break;
    default:
      // A rule this version does not know (from a newer device): said plainly, never hidden.
      base = task.recurrence ? 'Repeats' : undefined;
  }
  if (!base) return undefined;
  return isDateKey(task.repeatUntil) ? `${base} · Until ${dayAndMonth(task.repeatUntil)}` : base;
}
