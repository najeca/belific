// The phone's task reminders (PLAN_phone P7). Pure: NO runtime imports besides siblings; see
// phoneReminders.test.ts. The same rules as the desktop's scheduler (desktop/src/scheduler.js), which
// reads the payload built by desktopNotifyCore.ts:
//  * a timed task on a Day reminds at each of its times that is not done (Part C), the projected days
//    of repeating series included (series.ts);
//  * at every lead of its reminder list (reminder.ts effectiveReminders: its own list, the legacy
//    single lead, else the default list); a lead that has passed is skipped on its own;
//  * the keys are the desktop's: `task:<id>` at the start, `#HH:mm` for a time after the first,
//    `@<lead>` for a lead before the start.
// iOS keeps at most 64 pending notifications per app, so the phone plans a rolling window (14 days)
// and keeps the soonest `limit` of them.
import type { Task } from './types.ts';
import { projectOccurrences } from './series.ts';
import { effectiveReminders, DEFAULT_REMINDERS } from './reminder.ts';
import { doneTimesOf, timesOf } from './times.ts';
import { localMs } from './desktopNotifyCore.ts';

export const REMINDER_WINDOW_DAYS = 14;
export const TASK_REMINDER_PREFIX = 'task:';

export interface PlannedReminder {
  key: string;
  at: number;
  title: string;
  body: string;
}

function leadText(lead: number): string {
  if (lead % 1440 === 0) return lead === 1440 ? '1 day' : `${lead / 1440} days`;
  if (lead % 60 === 0) return lead === 60 ? '1 hour' : `${lead / 60} hours`;
  return `${lead} minutes`;
}

function dayKeys(now: number, days: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return out;
}

export function planTaskReminders(input: { tasks: Task[]; now: number; defaults?: readonly number[]; limit: number; days?: number }): PlannedReminder[] {
  const { tasks, now, limit } = input;
  const defaults = input.defaults ?? DEFAULT_REMINDERS;
  const days = dayKeys(now, input.days ?? REMINDER_WINDOW_DAYS);
  const window = new Set(days);
  const horizon = now + (input.days ?? REMINDER_WINDOW_DAYS) * 24 * 60 * 60 * 1000;
  const out: PlannedReminder[] = [];
  const add = (t: Task) => {
    if (t.completed || t.deletedAt || !t.dueDate || !t.startTime || !window.has(t.dueDate)) return;
    const done = new Set(doneTimesOf(t));
    timesOf(t).forEach((time, i) => {
      if (done.has(time)) return;
      const start = localMs(t.dueDate as string, time);
      if (start === null || start <= now) return;
      for (const lead of effectiveReminders(t, defaults)) {
        const at = start - lead * 60000;
        if (at <= now || at > horizon) continue;
        const base = `${TASK_REMINDER_PREFIX}${t.id}${i > 0 ? `#${time}` : ''}`;
        out.push({ key: lead === 0 ? base : `${base}@${lead}`, at, title: `${t.emoji ? `${t.emoji} ` : ''}${t.title}`, body: lead > 0 ? `Starts in ${leadText(lead)}` : 'Starting now' });
      }
    });
  };
  for (const t of tasks) add(t);
  for (const t of projectOccurrences(tasks, days, days[0])) add(t);
  out.sort((a, b) => a.at - b.at || a.key.localeCompare(b.key));
  const seen = new Set<string>();
  return out.filter((r) => !seen.has(r.key) && seen.add(r.key)).slice(0, Math.max(0, limit));
}
