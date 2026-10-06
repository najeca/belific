import type { NotifyPayload } from './kv';

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
}

function reminderPart(t: TaskLike): { reminderMinutes?: number } {
  return typeof t.reminderMinutes === 'number' ? { reminderMinutes: t.reminderMinutes } : {};
}

// Pure: builds the payload for the 48 hours after `now` (plus a day of slack,
// the main process applies the exact window).
export function buildNotifyPayload(events: EventLike[], tasks: TaskLike[], now: number): NotifyPayload {
  const horizon = now + 72 * 60 * 60 * 1000;
  const payload: NotifyPayload = { events: [], placed: [], planned: [] };
  for (const e of events) {
    const start = localMs(e.date, e.start);
    if (start === null || start <= now || start > horizon) continue;
    payload.events.push({ id: e.id, title: e.title, icon: e.icon, start });
  }
  const windowDays = new Set<string>();
  for (let i = 0; i <= 3; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    windowDays.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  for (const t of tasks) {
    if (t.completed || !t.dueDate) continue;
    if (t.startTime) {
      const start = localMs(t.dueDate, t.startTime);
      if (start === null || start <= now || start > horizon) continue;
      payload.placed.push({ id: t.id, title: t.title, start, completed: false, ...reminderPart(t) });
    } else if (windowDays.has(t.dueDate)) {
      payload.planned.push({ dueDate: t.dueDate, completed: false, ...reminderPart(t) });
    }
  }
  return payload;
}
