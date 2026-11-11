// The scissors (PLAN_breaks_as_gaps P4, 3.35.0): cutting a gap into a task on the Calendar or the Timebox. Pure: NO
// runtime imports besides siblings; see blade.test.ts. DESKTOP ONLY (the phone has no hover, so no scissors).
//
// The tool: off -> armed (the button or C, D2) -> cutting (the first click, or a press) -> asking (the second click
// on a task that repeats: "This day only" or "All days of <task>") -> armed again. Esc steps back; Esc when armed
// turns it off. What it makes is exactly what Task or Break = Break makes: one Break row with a day, a time and a
// length (and, for All days, the task's repeat rule). Nothing new is stored.
import type { Task } from './types.ts';
import { cutDay, type CutEntry } from './cuts.ts';
import { toTime } from './timebox.ts';

export const BLADE_STEP = 5;
const DAY = 24 * 60;

// The task a cut goes into: the timed, non-break task under the first click (one time of a task with several).
export interface BladeHost {
  // The block id of that time (task:<id><suffix>), as cuts.ts and hosting.ts know it.
  id: string;
  startMin: number;
  endMin: number;
  title: string;
  // The real task (for its repeat rule) and whether it repeats.
  task: Task;
  repeats: boolean;
}

export type BladeState =
  | { mode: 'off' }
  | { mode: 'armed' }
  | { mode: 'cutting'; dayKey: string; startMin: number; host: BladeHost | null }
  | { mode: 'asking'; dayKey: string; span: [number, number]; host: BladeHost; x: number; y: number };

// Minutes on the grid to the nearest 5, kept on the day.
export function snap5(min: number): number {
  return Math.max(0, Math.min(DAY, Math.round(min / BLADE_STEP) * BLADE_STEP));
}

// The gap between two points, in either order: at least 5 minutes, kept on the day and inside the task under it.
// null when there is no 5 minute room left.
export function bladeSpan(a: number, b: number, host?: Pick<BladeHost, 'startMin' | 'endMin'> | null): [number, number] | null {
  const lo = host ? Math.max(0, host.startMin) : 0;
  const hi = host ? Math.min(DAY, host.endMin) : DAY;
  let s = Math.max(lo, Math.min(a, b));
  let e = Math.min(hi, Math.max(a, b));
  if (e - s < BLADE_STEP) {
    e = Math.min(hi, s + BLADE_STEP);
    s = Math.max(lo, e - BLADE_STEP);
  }
  return e - s >= BLADE_STEP ? [s, e] : null;
}

// The task under a point: the timed, non-break tasks that are not inside a break (`hosts`), the shortest when two
// overlap there.
export function hostAt(hosts: BladeHost[], min: number): BladeHost | null {
  return hosts.filter((h) => h.startMin <= min && min < h.endMin).sort((a, b) => a.endMin - a.startMin - (b.endMin - b.startMin) || a.startMin - b.startMin)[0] ?? null;
}

// D3: why the cut is refused, or null. The day's other breaks are judged as the drawing judges them (cuts.ts, earliest
// first), with the smallest piece setting. Shifts S2, plain words: "Too short: this would leave 10 min (at least 30)".
export const BLADE_NEW_ID = 'blade:new';
export function bladeCheck(span: [number, number], host: Pick<BladeHost, 'id' | 'startMin' | 'endMin'> | null, dayBreaks: CutEntry[], cutMin: number): string | null {
  if (!host) return null;
  const res = cutDay([{ id: host.id, startMin: host.startMin, endMin: host.endMin, breaks: false }, ...dayBreaks.filter((b) => b.breaks), { id: BLADE_NEW_ID, startMin: span[0], endMin: span[1], breaks: true }], cutMin);
  const r = res.refusals.find((x) => x.breakId === BLADE_NEW_ID && x.hostId === host.id);
  if (!r) return null;
  if (r.reason === 'covers') return 'This would cover the whole block';
  return `Too short: this would leave ${r.pieceMin ?? 0} min (at least ${cutMin})`;
}

// The Break the cut makes. 'all': the task's repeat rule too, so the break series starts on this day and repeats on
// the same days as the task from here on (earlier days do not change).
export type BladeScope = 'day' | 'all';
export function bladeTask(span: [number, number], dayKey: string, scope: BladeScope, template?: Pick<Task, 'recurrence' | 'recurrenceDays' | 'recurrenceMonthDay'> | null): Partial<Task> {
  const base: Partial<Task> = { title: FREE_TIME, cutsBelow: true, dueDate: dayKey, startTime: toTime(span[0]), durationMinutes: span[1] - span[0] };
  if (scope !== 'all' || !template?.recurrence) return base;
  return {
    ...base,
    recurrence: template.recurrence,
    ...(template.recurrenceDays ? { recurrenceDays: [...template.recurrenceDays] } : {}),
    ...(template.recurrenceMonthDay !== undefined ? { recurrenceMonthDay: template.recurrenceMonthDay } : {}),
  };
}

// The popover's second choice: "All days of Boot Camp".
export const allDaysOf = (title: string): string => `All days of ${title}`;
// Shifts S2: the scissors are called "Free time" on screen, in plain words.
export const FREE_TIME = 'Free time';
export const BLADE_LABEL = 'Mark free time (C)';
export const BLADE_HINT = 'Click where the free time starts, then where it ends. Esc to stop.';
