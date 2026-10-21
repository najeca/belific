import type { NotifyPayload } from './kv';
import { projectOccurrences } from './series.ts';
import { normalizeReminders } from './reminder.ts';
import { doneTimesOf, timesOf } from './times.ts';
import type { Task } from './types';

// Pure part of the desktop notification payload (checkpoint 7), kept apart
// from desktopNotify.ts so it can be unit tested without storage.
// Local wall time of a Day ('YYYY-MM-DD') and a time ('HH:mm') as epoch ms.
export function localMs(day: string, hm: string): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  const t = /^(\d{2}):(\d{2})$/.exec(hm);
  if (!d || !t) return null;
  const ms = new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]), 0, 0).getTime();
  return Number.isFinite(ms) ? ms : null;
}

interface EventLike {
  id: string;
  title: string;
  icon: string;
  date: string;
  start: string;
}
interface TaskLike {
  id: string;
  title: string;
  completed: boolean;
  dueDate?: string;
  startTime?: string;
  reminderMinutes?: number | null;
  // Part B (P5): the task's own list of reminders (an empty list is none).
  reminders?: number[];
  // Part C (P5): a task with several times a day reminds at each of them that is not done.
  extraTimes?: string[];
  timesDone?: string[];
  completedAt?: string;
  // Tombstones are passed in too: a skipped day blocks its projection.
  deletedAt?: string;
}

function reminderPart(t: TaskLike): { reminderMinutes?: number; reminders?: number[] } {
  return {
    ...(typeof t.reminderMinutes === 'number' ? { reminderMinutes: t.reminderMinutes } : {}),
    ...(Array.isArray(t.reminders) ? { reminders: normalizeReminders(t.reminders) } : {}),
  };
}

// Pure: builds the payload for the 48 hours after `now` (plus a day of slack,
// the main process applies the exact window). `tasks` are the raw stored rows
// (tombstones included). Occurrences of repeating series that are only SHOWN
// (lib/series.ts, decision 023) are added: timed ones as placed tasks with
// their own reminder lead, untimed ones for the grouped daily reminder.
export function buildNotifyPayload(events: EventLike[], tasks: TaskLike[], now: number): NotifyPayload {
  const horizon = now + 72 * 60 * 60 * 1000;
  const payload: NotifyPayload = { events: [], placed: [], planned: [] };
  for (const e of events) {
    const start = localMs(e.date, e.start);
    if (start === null || start <= now || start > horizon) continue;
    payload.events.push({ id: e.id, title: e.title, icon: e.icon, start });
  }
  const windowList: string[] = [];
  for (let i = 0; i <= 3; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    windowList.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  const windowDays = new Set(windowList);
  const add = (t: TaskLike) => {
    if (t.completed || t.deletedAt || !t.dueDate) return;
    if (t.startTime) {
      // One entry per time that is still to do (the first has no `slot`, so its reminders keep their keys).
      const times = timesOf(t);
      const done = new Set(doneTimesOf(t));
      times.forEach((time, i) => {
        if (done.has(time)) return;
        const start = localMs(t.dueDate as string, time);
        if (start === null || start <= now || start > horizon) return;
        payload.placed.push({ id: t.id, title: t.title, start, completed: false, ...(i > 0 ? { slot: time } : {}), ...reminderPart(t) });
      });
      return;
    } else if (windowDays.has(t.dueDate)) {
      payload.planned.push({ dueDate: t.dueDate, completed: false, ...reminderPart(t) });
    }
  };
  for (const t of tasks) add(t);
  for (const t of projectOccurrences(tasks as unknown as Task[], windowList, windowList[0])) add(t);
  return payload;
}
