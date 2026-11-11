// Shifts S3 (PLAN_shifts): the card and the details of a block with things inside it, and "Add inside". Pure: NO runtime
// imports besides siblings; see shifts.test.ts. Desktop only (the phone gets it in S5).
//
// A SHIFT is a placed task (a day, a time, a length) that has other blocks fully inside its time (lib/nesting.ts), or a
// checklist (its subtasks, the "to dos"). What is inside it is worked out from the times every time a day is drawn:
// nothing new is stored. A timed block inside is an ordinary task; a to do is an item of the shift's checklist.
//   * D2: a block inside a shift is a ROW of the shift's Kanban card, not a card of its own.
//   * The summary ("5h of 10h planned, 5h free") is the one the grid's header shows (nesting.ts nestPlan, D1, D3). It
//     is shown when a timed block is inside; "x of y done" counts the timed blocks and the to dos together.
import type { Subtask, Task } from './types.ts';
import { addSubtask } from './subtasks.ts';
import { gapLayout } from './gaps.ts';
import { dayHostEntries, hostDay, type DayHostEntry } from './hosting.ts';
import { nestDay, nestPlan, summaryText, type ShellSummary } from './nesting.ts';
import { DEFAULT_TASK_MINUTES, formatMinutes, toMinutes, toTime } from './timebox.ts';
import { formatTime } from './data.ts';

export interface ShiftRow {
  key: string;
  kind: 'timed' | 'todo';
  title: string;
  done: boolean;
  // Timed: the block's start ('HH:mm') and length, and the real task with whether it is only shown (a coming day).
  time?: string;
  minutes?: number;
  full?: Task;
  projected?: boolean;
  // A task with several times a day: the time this row ticks.
  slot?: string;
  // A to do: its item in the shift's checklist.
  subtaskId?: string;
}

export interface ShiftInfo {
  task: Task;
  projected: boolean;
  summary?: ShellSummary;
  rows: ShiftRow[];
  done: number;
  count: number;
}

export interface DayShifts {
  // The shift's task id (a coming day's occurrence id for a projected one) -> what is inside it.
  byTask: Map<string, ShiftInfo>;
  // The ids of tasks drawn only as rows of a shift (no card of their own, D2).
  hidden: Set<string>;
}

const isDone = (e: DayHostEntry): boolean => !!e.full.completed || (!!e.time && (e.full.timesDone ?? []).includes(e.time));

// `visible`: only these shifts are shown (their ids); the blocks inside a shift that is not shown keep their cards.
export function shiftsOfDay(tasks: Task[], dayKey: string, todayKey: string, cutMin: number, visible?: Set<string>): DayShifts {
  const out: DayShifts = { byTask: new Map(), hidden: new Set() };
  const entries = dayHostEntries(tasks, dayKey, todayKey);
  if (entries.length === 0) return out;
  const host = hostDay(entries);
  const plain = entries.filter((e) => !e.breaks && !host.hostOf.has(e.id));
  const { shellOf, inside } = nestDay(plain);
  const plan = gapLayout(entries, cutMin, (id) => id);
  const nest = nestPlan(entries, host.hostOf, plan.items);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const nestedIn = new Map<string, number>();
  for (const e of plain) {
    if (e.cont || e.time || shellOf.has(e.id) || e.full.cutsBelow) continue;
    if (visible && !visible.has(e.full.id)) continue;
    const timed = (inside.get(e.id) ?? []).flatMap((id) => {
      const x = byId.get(id);
      return x ? [x] : [];
    });
    const todos = e.full.subtasks ?? [];
    if (timed.length === 0 && todos.length === 0) continue;
    if (out.byTask.has(e.full.id)) continue;
    const rows: ShiftRow[] = [
      ...timed.map((x): ShiftRow => ({ key: x.id, kind: 'timed', title: x.task.title, done: isDone(x), time: toTime(x.startMin), minutes: x.endMin - x.startMin, full: x.full, projected: x.projected, ...(x.time ? { slot: x.time } : {}) })),
      ...todos.map((s): ShiftRow => ({ key: `todo:${s.id}`, kind: 'todo', title: s.title, done: s.done, subtaskId: s.id })),
    ];
    const summary = timed.length > 0 ? nest.summaries.get(e.id) : undefined;
    out.byTask.set(e.full.id, { task: e.full, projected: e.projected, ...(summary ? { summary } : {}), rows, done: rows.filter((r) => r.done).length, count: rows.length });
    for (const x of timed) nestedIn.set(x.full.id, (nestedIn.get(x.full.id) ?? 0) + 1);
  }
  // A task is only a row when every time it has that day is inside a shown shift.
  const times = new Map<string, number>();
  for (const e of entries) times.set(e.full.id, (times.get(e.full.id) ?? 0) + 1);
  for (const [id, n] of nestedIn) if (times.get(id) === n) out.hidden.add(id);
  return out;
}

// "2 of 7 done"
export const doneText = (done: number, count: number): string => `${done} of ${count} done`;
export const shiftText = (info: ShiftInfo): string | null => (info.summary ? summaryText(info.summary) : null);
// A row's right hand text: "8:30am 30m" for a timed one, nothing for a to do.
export function rowMeta(r: ShiftRow): string {
  if (r.kind !== 'timed' || !r.time) return '';
  return `${formatTime(r.time)} ${formatMinutes(r.minutes ?? 0)}`;
}

// ---- Add inside ----

export const ADD_INSIDE = 'Add inside';
export type InsideScope = 'day' | 'all';
export interface InsideForm {
  title: string;
  timed: boolean;
  // 'HH:mm'
  start: string;
  length: number;
  scope: InsideScope;
}
export const INSIDE_LENGTHS = [15, 30, 45, 60, 90, 120, 180, 240] as const;
export const DEFAULT_INSIDE_MIN = 30;
export const allDaysOfShift = (title: string): string => `All days of ${title}`;

// A shift's span in minutes (its end may pass 24:00), or null when it has no time.
export function shiftSpan(shift: Pick<Task, 'startTime' | 'durationMinutes'>): [number, number] | null {
  const s = toMinutes(shift.startTime);
  if (s === null) return null;
  const len = shift.durationMinutes && shift.durationMinutes > 0 ? shift.durationMinutes : DEFAULT_TASK_MINUTES;
  return [s, s + len];
}

export interface FormCheck {
  ok: boolean;
  // Grey, plain: why a timed item does not fit, and what "Fit inside" would set.
  note?: string;
  fit?: { start: string; length: number };
}
const clock = (min: number): string => formatTime(toTime(min));

// A to do needs a name. A timed item needs one too, and has to fit in the shift: starting and ending inside it.
export function formCheck(shift: Pick<Task, 'title' | 'startTime' | 'durationMinutes'>, f: InsideForm): FormCheck {
  const named = f.title.trim().length > 0;
  if (!f.timed) return { ok: named };
  const span = shiftSpan(shift);
  const start = toMinutes(f.start);
  if (!span || start === null) return { ok: false, ...(span ? {} : { note: `${shift.title} has no time yet, so only a to do can go inside it.` }) };
  const room = span[1] - span[0];
  const length = f.length > 0 ? f.length : DEFAULT_INSIDE_MIN;
  if (length > room) return { ok: false, note: `Longer than ${shift.title} (${formatMinutes(room)})`, fit: { start: toTime(span[0]), length: room } };
  if (start < span[0]) return { ok: false, note: `This would start before ${shift.title} (${clock(span[0])})`, fit: { start: toTime(span[0]), length } };
  if (start + length > span[1]) return { ok: false, note: `This would end after ${shift.title} (${clock(span[1])})`, fit: { start: toTime(span[1] - length), length } };
  return { ok: named };
}

// The first time to suggest: the shift's start.
export const defaultStart = (shift: Pick<Task, 'startTime'>): string => shift.startTime ?? '09:00';

// The task a timed item becomes: an ordinary task on the shift's day. For "All days" of a repeating shift it repeats
// on the same days, from this day on (as the scissors' free time does, blade.ts bladeTask).
export function insideTask(shift: Pick<Task, 'recurrence' | 'recurrenceDays' | 'recurrenceMonthDay'>, dayKey: string, f: InsideForm): Partial<Task> {
  const base: Partial<Task> = { title: f.title.trim(), dueDate: dayKey, startTime: f.start, durationMinutes: f.length };
  if (f.scope !== 'all' || !shift.recurrence) return base;
  return {
    ...base,
    recurrence: shift.recurrence,
    ...(shift.recurrenceDays ? { recurrenceDays: [...shift.recurrenceDays] } : {}),
    ...(shift.recurrenceMonthDay !== undefined ? { recurrenceMonthDay: shift.recurrenceMonthDay } : {}),
  };
}

// The shift's checklist with the to do on the end (a blank name or a full list changes nothing).
export const insideTodo = (list: Subtask[] | undefined, title: string, id: string): Subtask[] => addSubtask(list, title, id);

// A to do ticked or unticked. Unlike a step of an ordinary task, ticking the last one does NOT complete the shift: the
// shift has timed blocks inside it and its own tick.
export function flipTodo(list: Subtask[] | undefined, id: string): Subtask[] {
  return (list ?? []).map((s) => (s.id === id ? { ...s, done: !s.done } : s));
}
