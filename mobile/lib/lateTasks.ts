// Late timed tasks (2.27.0, item 7): a placed task whose end has passed and that
// is not done is drawn faded on the Calendar and the Timebox, with one small
// action, "Move to next free slot today", or "Tomorrow" when today has no free
// slot left. Nothing moves by itself. Pure: NO runtime imports besides siblings;
// see lateTasks.test.ts.
import type { Task } from './types.ts';
import { addDays, dateKey, isDateKey, parseDateKey } from './kanban.ts';
import { toMinutes } from './timebox.ts';
import { isSeriesRow } from './rollover.ts';

export const DEFAULT_BLOCK_MINUTES = 30;
export const SLOT_STEP = 30;

export interface Busy {
  start: number;
  end: number;
}

// A stored, unfinished, placed task whose end (start plus estimate, 30 minutes
// without one) is at or before `now`. A day of a repeating series is never late
// here (shown or stored): its days are never moved.
export function isLate(t: Task, now: Date, projected = false): boolean {
  if (projected || isSeriesRow(t) || t.completed || t.deletedAt || !isDateKey(t.dueDate) || !t.startTime) return false;
  const start = toMinutes(t.startTime);
  if (start === null) return false;
  const d = parseDateKey(t.dueDate);
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, start + (t.durationMinutes ?? DEFAULT_BLOCK_MINUTES));
  return end.getTime() <= now.getTime();
}

const pad = (n: number) => String(n).padStart(2, '0');
export function minutesToTime(m: number): string {
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

// The first start, on a 30 minute step from now (rounded up), where a block of
// `duration` fits before 24:00 without touching anything busy. null when there is none.
export function nextFreeSlot(busy: Busy[], duration: number, nowMin: number): number | null {
  const len = Math.max(1, Math.min(duration, 24 * 60));
  for (let s = Math.ceil(nowMin / SLOT_STEP) * SLOT_STEP; s + len <= 24 * 60; s += SLOT_STEP) {
    if (!busy.some((b) => s < b.end && b.start < s + len)) return s;
  }
  return null;
}

// The busy times of `day` from the tasks placed on it (the late task itself left
// out). Events are passed in by the pane that knows them.
export function busyFromTasks(tasks: Task[], day: string, exceptId: string): Busy[] {
  const out: Busy[] = [];
  for (const t of tasks) {
    if (t.id === exceptId || t.deletedAt || t.dueDate !== day || !t.startTime) continue;
    const s = toMinutes(t.startTime);
    if (s === null) continue;
    out.push({ start: s, end: s + (t.durationMinutes ?? DEFAULT_BLOCK_MINUTES) });
  }
  return out;
}

// What the action does: a time today, or tomorrow at the same time of day.
export function lateMove(t: Task, busy: Busy[], now: Date): { label: string; patch: Pick<Task, 'dueDate' | 'startTime'> } {
  const today = dateKey(now);
  const slot = nextFreeSlot(busy, t.durationMinutes ?? DEFAULT_BLOCK_MINUTES, now.getHours() * 60 + now.getMinutes());
  if (slot !== null) return { label: `Move to next free slot today (${minutesToTime(slot)})`, patch: { dueDate: today, startTime: minutesToTime(slot) } };
  return { label: 'No free slot left today: move to tomorrow', patch: { dueDate: dateKey(addDays(parseDateKey(today), 1)), startTime: t.startTime } };
}

// The busy times of `day` from the person's own events (start and end "HH:MM").
// An event running past midnight is busy to 24:00.
export function busyFromEvents(events: Array<{ date: string; start: string; end: string }>, day: string): Busy[] {
  const out: Busy[] = [];
  for (const e of events) {
    if (e.date !== day) continue;
    const s = toMinutes(e.start);
    const en = toMinutes(e.end);
    if (s === null || en === null) continue;
    out.push({ start: s, end: en > s ? en : 24 * 60 });
  }
  return out;
}
