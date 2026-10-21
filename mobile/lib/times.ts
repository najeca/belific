// One task, several times in a day (Part C, 2.36.0). Pure: NO runtime imports besides siblings; see
// times.test.ts. DESKTOP ONLY: the phone shows a task once, at its start time (the names
// below are on the iOS marker gate).
//
// A task keeps its first time in `startTime` and the others in `extraTimes` ('HH:mm', at most 6),
// all with the same length. What is ticked on a row's day is `timesDone`. The rules:
//  * The times of a task are startTime plus extraTimes, sorted, distinct, valid. A task without a
//    startTime has none (extras alone mean nothing). An older client that moves startTime past an
//    extra time is read as sorted; nothing is rewritten until an edit.
//  * `completed` true ALWAYS means every time is done, whatever timesDone holds (a tick on the
//    phone, or on an older desktop, completes the task). Ticking the last open time completes the
//    task; unticking any time of a completed task reopens it with the other times still done.
//  * A task's own times may not overlap: two times closer together than the task is long are refused.
//  * Adding a time to a completed task reopens it (the new time is not done). Removing a time drops
//    its tick; when every remaining time is done the task is completed. Moving a time keeps its tick.
import type { Task } from './types.ts';
import { MAX_EXTRA_TIMES } from './syncCore.ts';
import { toMinutes, toTime } from './timebox.ts';
import { DEFAULT_BLOCK_MINUTES } from './lateTasks.ts';

export const MAX_TIMES = MAX_EXTRA_TIMES + 1;

// The line in the Reminder menu of a task with several times a day.
export const EACH_TIME_NOTE = 'For each time: every time of the day that is not done gets these reminders.';

type TimeFields = Pick<Task, 'startTime' | 'extraTimes'>;
type DoneFields = TimeFields & Pick<Task, 'completed' | 'completedAt' | 'timesDone'>;

function validTime(t: unknown): t is string {
  return typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}

// The times of the day this task happens, earliest first. Empty when it has no start time.
export function timesOf(task: TimeFields): string[] {
  if (!validTime(task.startTime)) return [];
  const all = new Set<string>([task.startTime]);
  for (const t of task.extraTimes ?? []) if (validTime(t)) all.add(t);
  return [...all].sort().slice(0, MAX_TIMES);
}

export function isMultiTime(task: TimeFields): boolean {
  return timesOf(task).length > 1;
}

// The times that are done: all of them when the task is completed, else the ticked ones that are
// still times of the task.
export function doneTimesOf(task: DoneFields): string[] {
  const times = timesOf(task);
  if (task.completed) return times;
  const ticked = new Set(task.timesDone ?? []);
  return times.filter((t) => ticked.has(t));
}

export function isTimeDone(task: DoneFields, time: string): boolean {
  return doneTimesOf(task).includes(time);
}

// How many of the task's times are still to do (0 for a completed task; 1 for a task with no time).
export function timesLeft(task: DoneFields): number {
  if (task.completed) return 0;
  const n = timesOf(task).length;
  return n === 0 ? 1 : n - doneTimesOf(task).length;
}

// How many times the task takes in a day (1 when it has no time).
export function timesCount(task: TimeFields): number {
  return Math.max(1, timesOf(task).length);
}

// ---- field layouts ----

// startTime plus extraTimes for a sorted list: the first is the start, the rest are extras.
function layout(times: string[]): Pick<Task, 'startTime' | 'extraTimes'> {
  if (times.length === 0) return { startTime: undefined, extraTimes: undefined };
  const [first, ...rest] = times;
  return { startTime: first, extraTimes: rest.length > 0 ? rest : undefined };
}

export interface TimeEdit {
  ok: true;
  fields: Partial<Task>;
}
export interface TimeRefusal {
  ok: false;
  note: string;
}

function lengthOf(task: Pick<Task, 'durationMinutes'>): number {
  const m = task.durationMinutes;
  return typeof m === 'number' && Number.isFinite(m) && m > 0 ? Math.round(m) : DEFAULT_BLOCK_MINUTES;
}

function clock12(time: string): string {
  const m = toMinutes(time) ?? 0;
  const h = Math.floor(m / 60);
  return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')}${h >= 12 ? 'pm' : 'am'}`;
}

// null when no two times start closer together than the task is long.
export function overlapNote(times: string[], length: number): string | null {
  const sorted = [...times].sort();
  for (let i = 1; i < sorted.length; i++) {
    const a = toMinutes(sorted[i - 1]) as number;
    const b = toMinutes(sorted[i]) as number;
    if (b - a < length) return `${clock12(sorted[i])} would start before the ${clock12(sorted[i - 1])} one ends (${length} min each)`;
  }
  return null;
}

// What fields a change of the time list writes, keeping the ticks right (see the header).
function withTimes(task: DoneFields, next: string[], renamed?: { from: string; to: string }): Partial<Task> {
  const wasDone = doneTimesOf(task);
  let done = wasDone;
  if (renamed) done = wasDone.map((t) => (t === renamed.from ? renamed.to : t));
  done = done.filter((t) => next.includes(t));
  const allDone = next.length > 0 && done.length === next.length;
  const fields: Partial<Task> = { ...layout(next) };
  if (next.length <= 1) {
    // One time or none left: it is an ordinary task again.
    fields.timesDone = undefined;
    if (!task.completed && allDone) {
      fields.completed = true;
      fields.completedAt = task.completedAt ?? new Date().toISOString();
    }
    return fields;
  }
  // A completed task stays completed only while every time is still done.
  if (task.completed && allDone) {
    fields.timesDone = [...next];
    return fields;
  }
  fields.completed = allDone;
  fields.completedAt = allDone ? task.completedAt ?? new Date().toISOString() : undefined;
  fields.timesDone = allDone ? [...next] : done.length > 0 ? done : undefined;
  return fields;
}

// The default for "Add another time": the end of the last time, rounded up to the half hour, kept
// inside the day; falls back to the first free half hour after it.
export function suggestNextTime(task: TimeFields & Pick<Task, 'durationMinutes'>): string | null {
  const times = timesOf(task);
  if (times.length === 0 || times.length >= MAX_TIMES) return null;
  const length = lengthOf(task);
  const last = toMinutes(times[times.length - 1]) as number;
  let m = Math.ceil((last + length) / 30) * 30;
  for (; m <= 23 * 60 + 30; m += 30) {
    if (overlapNote([...times, toTime(m)], length) === null) return toTime(m);
  }
  return null;
}

export function addTimeFields(task: DoneFields & Pick<Task, 'durationMinutes'>, time: string): TimeEdit | TimeRefusal {
  const times = timesOf(task);
  if (times.length === 0) return { ok: false, note: 'Give the task a time first.' };
  if (!validTime(time)) return { ok: false, note: 'That is not a time.' };
  if (times.includes(time)) return { ok: false, note: `${clock12(time)} is already one of its times.` };
  if (times.length >= MAX_TIMES) return { ok: false, note: `A task can have up to ${MAX_TIMES} times a day.` };
  const next = [...times, time].sort();
  const problem = overlapNote(next, lengthOf(task));
  if (problem) return { ok: false, note: `Not adding it: ${problem}.` };
  // The new time is not done, so a completed task reopens with its other times still done.
  const wasDone = doneTimesOf(task);
  return {
    ok: true,
    fields: { ...layout(next), completed: false, completedAt: undefined, timesDone: wasDone.length > 0 ? wasDone : undefined },
  };
}

export function removeTimeFields(task: DoneFields, time: string): TimeEdit | TimeRefusal {
  const times = timesOf(task);
  if (!times.includes(time)) return { ok: false, note: 'That time is not on the task.' };
  const next = times.filter((t) => t !== time);
  if (next.length === 0) return { ok: true, fields: { startTime: undefined, extraTimes: undefined, timesDone: undefined } };
  return { ok: true, fields: withTimes(task, next) };
}

export function moveTimeFields(task: DoneFields & Pick<Task, 'durationMinutes'>, from: string, to: string): TimeEdit | TimeRefusal {
  const times = timesOf(task);
  if (!times.includes(from)) return { ok: false, note: 'That time is not on the task.' };
  if (!validTime(to)) return { ok: false, note: 'That is not a time.' };
  if (from === to) return { ok: true, fields: {} };
  if (times.includes(to)) return { ok: false, note: `${clock12(to)} is already one of its times.` };
  const next = times.map((t) => (t === from ? to : t)).sort();
  const problem = overlapNote(next, lengthOf(task));
  if (problem) return { ok: false, note: `Not moving it: ${problem}.` };
  return { ok: true, fields: withTimes(task, next, { from, to }) };
}

// ---- ticking ----

export interface TickPlan {
  timesDone: string[] | undefined;
  completed: boolean;
  completedAt: string | undefined;
}

// Ticking (or unticking) one time. null when the time is not one of the task's.
export function planTick(task: DoneFields, time: string, done: boolean, nowIso: string): TickPlan | null {
  const times = timesOf(task);
  if (!times.includes(time)) return null;
  const set = new Set(doneTimesOf(task));
  if (done) set.add(time);
  else set.delete(time);
  const all = set.size === times.length;
  const list = times.filter((t) => set.has(t));
  return {
    timesDone: all ? [...times] : list.length > 0 ? list : undefined,
    completed: all,
    completedAt: all ? (task.completed ? task.completedAt ?? nowIso : nowIso) : undefined,
  };
}

// The tick state a whole-task tick writes: every time done, or none.
export function wholeTaskTimesDone(task: TimeFields, completed: boolean): string[] | undefined {
  const times = timesOf(task);
  return completed && times.length > 1 ? times : undefined;
}

// "11:00, 15:00" with a ✓ after each time that is done (the card's time chip).
export function timesLabel(task: DoneFields, show: (t: string) => string = (t) => t): string {
  const done = new Set(doneTimesOf(task));
  const times = timesOf(task);
  if (times.length <= 1) return times.length === 1 ? show(times[0]) : '';
  return times.map((t) => `${show(t)}${done.has(t) ? ' ✓' : ''}`).join(', ');
}

// ---- drawing: one block per time (Part C, P4) ----

// What a time grid draws for one time of a task: a single-time copy of the task (its start time is
// that time, no extra times, done if that time is done), so every block behaves like an ordinary
// task's. The real task is kept beside it for what is written back.
export interface TimeView {
  // 0 for the first time, whose block id is the task's own; later times add `@HH:mm`.
  index: number;
  time: string;
  // The id suffix: '' for the first time, '@HH:mm' for the others.
  suffix: string;
  // The task as one block sees it. Only a task with several times is copied; one with one time is itself.
  task: Task;
  multi: boolean;
}

export function suffixFor(index: number, time: string): string {
  return index === 0 ? '' : `@${time}`;
}

export function viewAt(task: Task, time: string, done: boolean): Task {
  return { ...task, startTime: time, extraTimes: undefined, timesDone: undefined, completed: done };
}

// The blocks of a task on its day, earliest time first. A task with no (valid) time has none.
export function timeViews(task: Task): TimeView[] {
  const times = timesOf(task);
  if (times.length <= 1) return times.length === 1 ? [{ index: 0, time: times[0], suffix: '', task, multi: false }] : [];
  const done = new Set(doneTimesOf(task));
  return times.map((time, index) => ({ index, time, suffix: suffixFor(index, time), task: viewAt(task, time, done.has(time)), multi: true }));
}

// The block id back to the task id and the time suffix: `task:${id}@HH:mm` has the suffix '@HH:mm'.
export function splitBlockSuffix(blockId: string): { id: string; time?: string } {
  const at = blockId.lastIndexOf('@');
  if (at <= 0) return { id: blockId };
  const time = blockId.slice(at + 1);
  return validTime(time) ? { id: blockId.slice(0, at), time } : { id: blockId };
}

// Moving every time by the same number of minutes (a block dragged to another day): refused when a
// time would leave the day. Ticks follow their times.
export function shiftTimesFields(task: DoneFields, deltaMin: number): TimeEdit | TimeRefusal {
  const times = timesOf(task);
  if (times.length === 0) return { ok: false, note: 'The task has no time.' };
  const moved = times.map((t) => (toMinutes(t) as number) + deltaMin);
  if (moved.some((m) => m < 0 || m > 23 * 60 + 59)) return { ok: false, note: 'Not moving it: a time would leave the day.' };
  const next = moved.map((m) => toTime(m));
  const done = new Set(doneTimesOf(task));
  const nextDone = times.flatMap((t, i) => (done.has(t) ? [next[i]] : []));
  const [first, ...rest] = next;
  const fields: Partial<Task> = { startTime: first, extraTimes: rest.length > 0 ? rest : undefined };
  if (!task.completed) fields.timesDone = nextDone.length > 0 ? nextDone : undefined;
  else fields.timesDone = [...next];
  return { ok: true, fields };
}
