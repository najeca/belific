// Shifts S3 and S4 (PLAN_shifts): the card and the details of a block with things inside it, "Add inside", and what goes
// with a shift that is skipped, deleted or crosses midnight. Pure: NO runtime
// imports besides siblings; see shifts.test.ts. Desktop only (the phone gets it in S5).
//
// A SHIFT is a placed task (a day, a time, a length of 2 hours or more, S4) that has other blocks fully inside its time
// (lib/nesting.ts), or a checklist (its subtasks, the "to dos"). What is inside it is worked out from the times every time a day is drawn:
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
import { addDays, dateKey, parseDateKey } from './kanban.ts';

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
  // S4: it is after midnight, on the next day, inside the overnight part of the shift.
  nextDay?: boolean;
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
  // S4: the ids among them that are rows of YESTERDAY's overnight shift (its card is on yesterday's column): the day
  // total leaves them out too, as the shift counts on its own day.
  carried: Set<string>;
}

// S4 fix: the rows and their in place ticks are for a long block, two hours or more (a shift). A shorter placed task
// keeps the steps ring of its card, and the blocks inside it keep their own cards (the grid still draws them inside).
export const SHIFT_MIN_MINUTES = 120;

const isDone = (e: DayHostEntry): boolean => !!e.full.completed || (!!e.time && (e.full.timesDone ?? []).includes(e.time));
const len = (e: { startMin: number; endMin: number }) => e.endMin - e.startMin;
const nextKey = (dayKey: string) => dateKey(addDays(parseDateKey(dayKey), 1));

// The plain blocks of a day (no free time, nothing inside free time), with the hosting the panes use.
function plainOf(tasks: Task[], dayKey: string, todayKey: string): { entries: DayHostEntry[]; plain: DayHostEntry[]; hostOf: Map<string, string> } {
  const entries = dayHostEntries(tasks, dayKey, todayKey);
  const { hostOf } = hostDay(entries);
  return { entries, plain: entries.filter((e) => !e.breaks && !hostOf.has(e.id)), hostOf };
}

// S4: what sits after midnight inside a shift that crosses it: the next day's blocks wholly inside the shift's overnight
// part (yesterday's shift is `cont` there). `shell` is the shift's entry on its own day (its end past 24:00).
function afterMidnight(shell: DayHostEntry, next: DayHostEntry[]): DayHostEntry[] {
  if (shell.endMin <= 24 * 60) return [];
  return next.filter((x) => !x.cont && !x.full.cutsBelow && x.full.id !== shell.full.id && x.startMin + 1440 >= shell.startMin && x.endMin + 1440 <= shell.endMin && len(x) < len(shell));
}

function taskLength(t: Pick<Task, 'durationMinutes'>): number {
  return t.durationMinutes && t.durationMinutes > 0 ? t.durationMinutes : DEFAULT_TASK_MINUTES;
}

function unionOf(spans: Array<[number, number]>): number {
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cur: [number, number] | null = null;
  for (const [a, b] of sorted) {
    if (!cur || a > cur[1]) {
      if (cur) total += cur[1] - cur[0];
      cur = [a, b];
    } else cur[1] = Math.max(cur[1], b);
  }
  return cur ? total + cur[1] - cur[0] : total;
}

// `visible`: only these shifts are shown (their ids); the blocks inside a shift that is not shown keep their cards.
export function shiftsOfDay(tasks: Task[], dayKey: string, todayKey: string, cutMin: number, visible?: Set<string>): DayShifts {
  const out: DayShifts = { byTask: new Map(), hidden: new Set(), carried: new Set() };
  const { entries, plain, hostOf } = plainOf(tasks, dayKey, todayKey);
  if (entries.length === 0) return out;
  const { shellOf, inside } = nestDay(plain);
  const plan = gapLayout(entries, cutMin, (id) => id);
  const nest = nestPlan(entries, hostOf, plan.items);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const nestedIn = new Map<string, number>();
  let next: DayHostEntry[] | null = null;
  for (const e of plain) {
    if (e.time || shellOf.has(e.id) || e.full.cutsBelow) continue;
    // A shift is two hours or more (the fix in S4); its whole length counts, the overnight part too.
    if (taskLength(e.full) < SHIFT_MIN_MINUTES) continue;
    // Yesterday's overnight shift: its card is on yesterday's column, and what is inside its part of today is its rows there.
    if (e.cont) {
      for (const id of inside.get(e.id) ?? []) {
        const x = byId.get(id);
        if (x && !x.time) out.carried.add(x.full.id);
      }
      continue;
    }
    if (visible && !visible.has(e.full.id)) continue;
    const timed = (inside.get(e.id) ?? []).flatMap((id) => {
      const x = byId.get(id);
      return x ? [x] : [];
    });
    if (e.endMin > 24 * 60 && next === null) next = plainOf(tasks, nextKey(dayKey), todayKey).plain;
    const late = next && e.endMin > 24 * 60 ? afterMidnight(e, next) : [];
    const todos = e.full.subtasks ?? [];
    if (timed.length === 0 && late.length === 0 && todos.length === 0) continue;
    if (out.byTask.has(e.full.id)) continue;
    const timedRow = (x: DayHostEntry, nextDay: boolean): ShiftRow => ({
      key: nextDay ? `next:${x.id}` : x.id,
      kind: 'timed',
      title: x.task.title,
      done: isDone(x),
      time: toTime(x.startMin),
      minutes: len(x),
      full: x.full,
      projected: x.projected,
      ...(x.time ? { slot: x.time } : {}),
      ...(nextDay ? { nextDay: true } : {}),
    });
    const rows: ShiftRow[] = [
      ...timed.map((x) => timedRow(x, false)),
      ...late.map((x) => timedRow(x, true)),
      ...todos.map((s): ShiftRow => ({ key: `todo:${s.id}`, kind: 'todo', title: s.title, done: s.done, subtaskId: s.id })),
    ];
    let summary = timed.length + late.length > 0 ? nest.summaries.get(e.id) : undefined;
    if (late.length > 0) {
      const base = summary ?? { total: len(e), planned: 0, free: len(e) };
      const planned = Math.min(base.total, base.planned + unionOf(late.map((x) => [x.startMin, x.endMin] as [number, number])));
      summary = { total: base.total, planned, free: base.total - planned };
    }
    out.byTask.set(e.full.id, { task: e.full, projected: e.projected, ...(summary ? { summary } : {}), rows, done: rows.filter((r) => r.done).length, count: rows.length });
    for (const x of timed) nestedIn.set(x.full.id, (nestedIn.get(x.full.id) ?? 0) + 1);
  }
  // A task is only a row when every time it has that day is inside a shown shift.
  const times = new Map<string, number>();
  for (const e of entries) times.set(e.full.id, (times.get(e.full.id) ?? 0) + 1);
  for (const [id, n] of nestedIn) if (times.get(id) === n) out.hidden.add(id);
  for (const id of [...out.carried]) {
    if (times.get(id) === 1) out.hidden.add(id);
    else out.carried.delete(id);
  }
  return out;
}

// ---- S4: what goes with a shift that is skipped, deleted or moved ----

// The separate tasks inside a shift on its day (and, for a shift that crosses midnight, after midnight on the next
// day): the blocks fully inside its time. Its to dos are its own checklist and always go with it. A task with several
// times a day is left out (only one of its times is inside). `shift` is the day's task (a coming day's occurrence too).
export function insideItemsOf(tasks: Task[], shift: Pick<Task, 'id' | 'dueDate'>, todayKey: string): DayHostEntry[] {
  if (!shift.dueDate) return [];
  const { plain } = plainOf(tasks, shift.dueDate, todayKey);
  const e = plain.find((x) => x.full.id === shift.id && !x.cont && !x.time);
  if (!e || e.full.cutsBelow) return [];
  const own = plain.filter((x) => x !== e && !x.cont && !x.time && !x.full.cutsBelow && e.startMin <= x.startMin && x.endMin <= e.endMin && len(x) < len(e));
  const late = e.endMin > 24 * 60 ? afterMidnight(e, plainOf(tasks, nextKey(shift.dueDate), todayKey).plain).filter((x) => !x.time) : [];
  return [...own, ...late];
}

// "Delete the shift and its 5 items" / "Skip the shift and its 5 items".
export const itemsText = (n: number): string => (n === 1 ? '1 item' : `${n} items`);
export const withItems = (verb: 'Delete' | 'Skip', n: number): string => `${verb} the shift and its ${itemsText(n)}`;
export const shiftOnly = (verb: 'Delete' | 'Skip'): string => `${verb} the shift only`;

// "2 of 7 done"
export const doneText = (done: number, count: number): string => `${done} of ${count} done`;
export const shiftText = (info: ShiftInfo): string | null => (info.summary ? summaryText(info.summary) : null);
// A row's right hand text: "8:30am 30m" for a timed one, nothing for a to do.
export function rowMeta(r: ShiftRow): string {
  if (r.kind !== 'timed' || !r.time) return '';
  return `${formatTime(r.time)}${r.nextDay ? ' (next day)' : ''} ${formatMinutes(r.minutes ?? 0)}`;
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
