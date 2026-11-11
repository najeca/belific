// F6 of PLAN_daily_flow: quick reminders (text and a time, no length). Pure: NO runtime imports besides siblings; see quickReminder.test.ts.
//
// A quick reminder is text and a time, with no length (D4): a timed task (a Day and a startTime) with
// `durationMinutes: 0`. Nothing new is stored.
//   * It is a small bubble at its time on the Timebox and the Calendar: it takes no lane, never cuts, nests or hosts,
//     and the blocks are laid out as if it were not there (it never reaches layoutItems, hosting or nesting).
//   * On the Tasks board it is a one line row at the top of its day column, never a card, and never in the day's total.
//   * It counts in no total, estimate, shift summary, Earlier count or Analytics figure.
//   * It notifies at its time (desktop/src/scheduler.js, `quick`), whatever the task reminder settings say.
//   * A tick clears it (the bubble goes); Ctrl+Z puts it back, like any tick.
// Older builds read the 0 as "no length" and draw a 30 minute block; one that edits it uploads no length, and it becomes
// an ordinary task (the CHANGELOG says so).
import type { Task } from './types.ts';
import { formatTime } from './data.ts';
import { toMinutes } from './timebox.ts';

// The bubble's and the row's icon (Ionicons, in the accent colour: the ⏰ emoji draws red on Windows, and nothing is red).
export const REMINDER_ICON = 'alarm-outline';
// The details' line under Estimated time.
export const REMINDER_NOTE = 'A reminder: no length, it only reminds you at its time. Choose a time length to make it a normal task.';

export function isQuickReminder(t: Pick<Task, 'durationMinutes' | 'startTime' | 'dueDate'>): boolean {
  return t.durationMinutes === 0 && !!t.startTime && !!t.dueDate;
}

// Splits a day's tasks: the quick reminders apart from the rest.
export function splitReminders<T extends { task: Task }>(list: T[]): { reminders: T[]; rest: T[] } {
  const reminders: T[] = [];
  const rest: T[] = [];
  for (const x of list) (isQuickReminder(x.task) ? reminders : rest).push(x);
  reminders.sort((a, b) => (toMinutes(a.task.startTime) ?? 0) - (toMinutes(b.task.startTime) ?? 0) || a.task.title.localeCompare(b.task.title));
  return { reminders, rest };
}

// "11:15am Ring the pharmacy" (the alarm icon is drawn before it)
export const reminderText = (t: Pick<Task, 'startTime' | 'title'>): string => `${t.startTime ? formatTime(t.startTime) : ''} ${t.title}`.replace(/\s+/g, ' ').trim();

// The Day a reminder made in Quick capture goes on: today, or tomorrow when that time has passed today.
export function reminderDay(hm: string, now: Date, todayKey: string, tomorrowKey: string): string {
  const m = toMinutes(hm);
  if (m === null) return todayKey;
  return m <= now.getHours() * 60 + now.getMinutes() ? tomorrowKey : todayKey;
}

// Quick capture's line under the time: "Reminds you today at 11:15am" / "Reminds you tomorrow at 7:00am".
export function reminderWhen(hm: string, dayKey: string, todayKey: string): string {
  if (toMinutes(hm) === null) return 'Choose a time';
  return `Reminds you ${dayKey === todayKey ? 'today' : 'tomorrow'} at ${formatTime(hm)}`;
}

// The task a reminder is: the title, its Day and time, no length, and one notification at its time.
export function reminderFields(dayKey: string, hm: string): Pick<Task, 'dueDate' | 'startTime' | 'durationMinutes'> {
  return { dueDate: dayKey, startTime: hm, durationMinutes: 0 };
}

// The 14 px label beside a bubble shows when no block covers the reminder's time (give or take `pad` minutes):
// `spans` are the drawn blocks' [start, end) in minutes.
export function labelFits(atMin: number, spans: Array<[number, number]>, pad = 12): boolean {
  return !spans.some(([s, e]) => s < atMin + pad && atMin - pad < e);
}
