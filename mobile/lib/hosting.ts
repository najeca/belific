// "Task during a break" (3.5.0). Pure: NO runtime imports besides siblings; see hosting.test.ts.
//
// A task that starts and ends fully inside a break (a task with Split on) is HOSTED by that break:
// it is not cut, not put in a lane beside it, and is drawn as a chip inside the break's block. It
// keeps its own length, tick, timer, priority and list. Nothing is stored: like Split (cuts.ts) it is
// derived from the times every time a day is drawn, so a task moved or resized out of the break is
// back to the usual behaviour at once.
//
//  * Only a break hosts, and a break is never hosted (two breaks stay as they were).
//  * Inside means break start <= task start and task end <= break end (the edges count).
//  * A task inside two breaks goes to the shortest one (then the earlier, then by id).
//  * The rest of yesterday's overnight task (`cont`) is never hosted and never hosts: it keeps today's
//    behaviour (its own day hosts it, or the tasks inside it).
//  * Each time of a task with several times a day is its own entry, hosted on its own.
//  * A task that only partly overlaps a break is not hosted: Split treats it exactly as before.
import type { Task } from './types.ts';
import { tasksForTimebox } from './timeboxTasks.ts';
import { continuationOf, taskToItem, toMinutes, toTime } from './timebox.ts';
import { isMultiTime, moveTimeFields, removeTimeFields, timeViews, timesOf } from './times.ts';

export const LONGER_THAN_BREAK = 'Longer than the break';

export interface HostEntry {
  // The id the pane uses for the block (task:…, cont:…).
  id: string;
  startMin: number;
  // The TRUE end: may be past 24:00.
  endMin: number;
  // The task has Split on: it is a break.
  breaks: boolean;
  // The rest of yesterday's task (it really started the day before).
  cont?: boolean;
}

export interface HostResult {
  // A hosted entry's id -> its break's id.
  hostOf: Map<string, string>;
  // A break's id -> the ids it hosts, earliest first (then the longer, then by id).
  hosted: Map<string, string[]>;
}

const valid = (e: HostEntry) => Number.isFinite(e.startMin) && Number.isFinite(e.endMin) && e.endMin > e.startMin;

export function hostDay(entries: HostEntry[]): HostResult {
  const res: HostResult = { hostOf: new Map(), hosted: new Map() };
  const breaks = entries
    .filter((e) => e.breaks && !e.cont && valid(e))
    .sort((a, b) => a.endMin - a.startMin - (b.endMin - b.startMin) || a.startMin - b.startMin || a.id.localeCompare(b.id));
  if (breaks.length === 0) return res;
  const guests = entries
    .filter((e) => !e.breaks && !e.cont && valid(e))
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin || a.id.localeCompare(b.id));
  for (const g of guests) {
    const b = breaks.find((x) => x.startMin <= g.startMin && g.endMin <= x.endMin);
    if (!b) continue;
    res.hostOf.set(g.id, b.id);
    res.hosted.set(b.id, [...(res.hosted.get(b.id) ?? []), g.id]);
  }
  return res;
}

// One day's entries from the tasks, as the Timebox and the Calendar build them: the day's stored and
// projected tasks (timeboxTasks.ts), one entry per time (times.ts) and yesterday's overnight rest.
export interface DayHostEntry extends HostEntry {
  // The single-time copy the block shows; `full` the real task.
  task: Task;
  full: Task;
  projected: boolean;
  time?: string;
}
export function dayHostEntries(tasks: Task[], dayKey: string, todayKey: string): DayHostEntry[] {
  const out: DayHostEntry[] = [];
  const { own, spill } = tasksForTimebox(tasks, dayKey, todayKey);
  for (const { task: t, projected } of own) {
    for (const v of timeViews(t)) {
      const item = taskToItem(v.task);
      if (!item) continue;
      out.push({ id: `task:${t.id}${v.suffix}`, startMin: item.startMin, endMin: item.endMin, breaks: !!t.cutsBelow, task: v.task, full: t, projected, ...(v.multi ? { time: v.time } : {}) });
    }
  }
  for (const { task: t, projected } of spill) {
    for (const v of timeViews(t)) {
      const rest = continuationOf(v.task);
      if (!rest) continue;
      out.push({ id: `${rest.id}${v.suffix}`, startMin: rest.startMin, endMin: rest.endMin, breaks: !!t.cutsBelow, cont: true, task: v.task, full: t, projected, ...(v.multi ? { time: v.time } : {}) });
    }
  }
  return out;
}

export interface BreakSpan {
  id: string;
  startMin: number;
  endMin: number;
}

// The break under a point of the grid (the shortest when two overlap there).
export function breakAt<T extends BreakSpan>(breaks: T[], min: number): T | undefined {
  return breaks
    .filter((b) => b.startMin <= min && min < b.endMin)
    .sort((a, b) => a.endMin - a.startMin - (b.endMin - b.startMin) || a.startMin - b.startMin || a.id.localeCompare(b.id))[0];
}

// Where a task of `lengthMin` dropped at `dropMin` on a break starts: the dropped time if the task
// fits inside the break from there, else the break's start. null: the task is longer than the break.
export function hostStart(dropMin: number, lengthMin: number, brk: Pick<BreakSpan, 'startMin' | 'endMin'>): number | null {
  if (lengthMin > brk.endMin - brk.startMin) return null;
  return dropMin >= brk.startMin && dropMin + lengthMin <= brk.endMin ? dropMin : brk.startMin;
}

// A drag over the grid (3.6.0): with the pointer on a break, the task starts inside it (`hostStart`
// from the slot it would take). A break task is never hosted (pass no breaks for one).
export type HostDrop<T extends BreakSpan> = { kind: 'none' } | { kind: 'host'; startMin: number; brk: T } | { kind: 'longer'; brk: T };
export function hostDrop<T extends BreakSpan>(breaks: T[], pointerMin: number, slotMin: number, lengthMin: number): HostDrop<T> {
  const brk = breakAt(breaks, pointerMin);
  if (!brk) return { kind: 'none' };
  const start = hostStart(slotMin, lengthMin, brk);
  return start === null ? { kind: 'longer', brk } : { kind: 'host', startMin: start, brk };
}

// Moving a hosted task out (3.9.0). `full` is the real task, `time` the time that is inside the break
// (a task with several times moves only that one). "Move out of break": the task starts when the break
// ends, the same day, the same length. "Remove time": that time goes; a task with one time becomes an
// Anytime task on its day.
export type OutPlan = { ok: true; fields: Partial<Task> } | { ok: false; note: string };
export const ENDS_AT_MIDNIGHT = 'The break ends at midnight: there is no time after it that day.';
export function moveOutFields(full: Task, time: string | undefined, brk: Pick<BreakSpan, 'endMin'>): OutPlan {
  if (brk.endMin >= 1440) return { ok: false, note: ENDS_AT_MIDNIGHT };
  const to = toTime(brk.endMin);
  if (time && isMultiTime(full)) return moveTimeFields(full, time, to);
  return { ok: true, fields: { startTime: to } };
}
export function removeTimeOutFields(full: Task, time: string | undefined): OutPlan {
  if (time && isMultiTime(full)) return removeTimeFields(full, time);
  return { ok: true, fields: { startTime: undefined, extraTimes: undefined, timesDone: undefined } };
}

// "Do during a break": the breaks a task of this length fits in, earliest first.
export function breaksFitting<T extends BreakSpan>(breaks: T[], lengthMin: number): T[] {
  return breaks.filter((b) => lengthMin <= b.endMin - b.startMin).sort((a, b) => a.startMin - b.startMin || a.id.localeCompare(b.id));
}

// How the chips sit in a break block of this size.
//   inline: a short break (one line, under COMPACT px): the title, then one chip on the same line
//           if the block is wide enough, else nothing; "+N" for the rest.
//   stack:  a taller break: the chips one per row under the title; "+N" on the title row for the
//           ones that do not fit.
export const CHIP_ROW_PX = 16;
// Room above the first chip: the block's padding and the title line.
const STACK_TOP_PX = 20;
// The least block width that still shows a chip beside the title on one line.
export const INLINE_CHIP_MIN_W = 150;

export interface ChipPlan {
  mode: 'inline' | 'stack';
  shown: number;
  more: number;
}

// The phone passes its own row and top (bigger text); its width 0 keeps a one line break to "+N".
export function chipPlan(heightPx: number, widthPx: number, count: number, compactPx: number, rowPx = CHIP_ROW_PX, topPx = STACK_TOP_PX): ChipPlan {
  const n = Math.max(0, count);
  if (heightPx < compactPx) {
    const shown = widthPx >= INLINE_CHIP_MIN_W ? Math.min(1, n) : 0;
    return { mode: 'inline', shown, more: n - shown };
  }
  const rows = Math.max(0, Math.floor((heightPx - topPx) / rowPx));
  const shown = Math.min(n, rows);
  return { mode: 'stack', shown, more: n - shown };
}

// The minutes a day's hosted tasks share with their breaks: for each break, the time its tasks cover
// (each is fully inside it; two that overlap each other share those minutes once). "Count minutes done
// during a break twice" off (the default) takes these off a total that adds up lengths, so the
// overlapped minutes count once; on, they are added to a total that already counts them once.
export function hostedMinutes(entries: HostEntry[]): number {
  const { hosted } = hostDay(entries);
  const byId = new Map(entries.map((e) => [e.id, e]));
  let m = 0;
  for (const ids of hosted.values()) {
    const spans = ids.map((id) => byId.get(id) as HostEntry).sort((a, b) => a.startMin - b.startMin);
    let end = -Infinity;
    for (const s of spans) {
      const from = Math.max(s.startMin, end);
      if (s.endMin > from) m += s.endMin - from;
      end = Math.max(end, s.endMin);
    }
  }
  return m;
}

// The same for a list of tasks being totalled by their estimates (a day column, the Calendar's header,
// the planning flow, Analytics): only a task and a break that both have an estimate count the shared
// minutes twice, and only when both are in the list. Each time of a task with several is its own entry.
type EstimateInput = Pick<Task, 'durationMinutes'> & Partial<Pick<Task, 'deletedAt' | 'dueDate' | 'startTime' | 'extraTimes' | 'cutsBelow'>>;
export function hostedEstimate(tasks: EstimateInput[]): number {
  const byDay = new Map<string, HostEntry[]>();
  tasks.forEach((t, i) => {
    const len = typeof t.durationMinutes === 'number' && Number.isFinite(t.durationMinutes) ? Math.round(t.durationMinutes) : 0;
    if (t.deletedAt || !t.dueDate || len <= 0) return;
    const list = byDay.get(t.dueDate) ?? [];
    for (const time of timesOf(t)) {
      const s = toMinutes(time);
      if (s !== null) list.push({ id: `${i}@${time}`, startMin: s, endMin: s + len, breaks: !!t.cutsBelow });
    }
    byDay.set(t.dueDate, list);
  });
  let m = 0;
  for (const list of byDay.values()) m += hostedMinutes(list);
  return m;
}

// The user_settings row for the switch (synced; absent = off).
export const BREAK_TWICE_KEY = 'planner.break_count_twice';
export function parseBreakTwice(value: unknown): boolean {
  return value === 'true' || value === true;
}
