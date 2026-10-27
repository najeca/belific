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

// 3.10.0: every hosted time of a day with its break (the details' "Inside this break" and "During"),
// and an index of a few days for the cards: a hosted task's break title and a break's count, by the id of
// the task (for a projected day, that day's occurrence id).
export interface HostLink {
  guest: DayHostEntry;
  brk: DayHostEntry;
}
export function hostLinks(tasks: Task[], dayKey: string, todayKey: string): HostLink[] {
  const entries = dayHostEntries(tasks, dayKey, todayKey);
  const byId = new Map(entries.map((e) => [e.id, e]));
  const out: HostLink[] = [];
  for (const [g, b] of hostDay(entries).hostOf) {
    const guest = byId.get(g);
    const brk = byId.get(b);
    if (guest && brk) out.push({ guest, brk });
  }
  return out.sort((x, y) => x.guest.startMin - y.guest.startMin || x.guest.id.localeCompare(y.guest.id));
}
export interface HostIndex {
  during: Map<string, string>;
  inside: Map<string, number>;
}
export function hostIndex(tasks: Task[], dayKeys: string[], todayKey: string): HostIndex {
  const idx: HostIndex = { during: new Map(), inside: new Map() };
  for (const key of new Set(dayKeys)) {
    for (const { guest, brk } of hostLinks(tasks, key, todayKey)) {
      if (!idx.during.has(guest.full.id)) idx.during.set(guest.full.id, brk.full.title);
      idx.inside.set(brk.full.id, (idx.inside.get(brk.full.id) ?? 0) + 1);
    }
  }
  return idx;
}
export const duringCaption = (breakTitle: string): string => `During ${breakTitle}`;
export const insidePill = (n: number): string => `${n} inside`;

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

// 3.11.0: refuse, do not just warn. A task never ends up partly inside a break it starts in, and a
// task inside a break never ends up sticking out of it:
//  (a) a new start (a drop, a new time, a new day, a new task) inside a break, and the task does not fit
//      there from that start;
//  (b) a task that was inside a break, whose new times still overlap that break but do not fit in it.
// A task that only starts before a break and runs into it is not refused (Split cuts it, as always), and
// a length change of a task outside every break is not refused. A break itself is never refused (moving
// or shrinking one is allowed: its tasks that no longer fit simply leave it, see lostGuests).
export type Span = [number, number];
export function fitRefusal<T extends BreakSpan>(breaks: T[], before: Span[], after: Span[]): T | null {
  for (const [s, e] of after) {
    const isNewStart = !before.some(([ps]) => ps === s);
    for (const b of breaks) {
      const fits = b.startMin <= s && e <= b.endMin;
      if (fits) continue;
      const startsIn = b.startMin <= s && s < b.endMin;
      const overlaps = s < b.endMin && e > b.startMin;
      const wasIn = before.some(([ps, pe]) => b.startMin <= ps && pe <= b.endMin);
      if ((startsIn && isNewStart) || (wasIn && overlaps)) return b;
    }
  }
  return null;
}
function lengthText(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}
// The note of a refused drop or new task: "Longer than the break (1 h)".
export const longerNote = (b: Pick<BreakSpan, 'startMin' | 'endMin'>): string => `${LONGER_THAN_BREAK} (${lengthText(b.endMin - b.startMin)})`;
// The note of a refused change in a task's details.
export const DETAILS_LONGER = 'Longer than the break. Shorten it or move it out.';

// A day before and after a change: the tasks that were inside a break whose own times did not change but
// which no longer fit in it because the break moved or shrank ("N tasks no longer fit and moved out of
// the break"). A break that is gone (deleted, Split off) is not counted: its tasks just go back to normal.
export interface HostSnapshot {
  spans: Map<string, Span>;
  hostOf: Map<string, string>;
}
export function hostSnapshot(entries: HostEntry[]): HostSnapshot {
  return { spans: new Map(entries.map((e) => [e.id, [e.startMin, e.endMin] as Span])), hostOf: hostDay(entries).hostOf };
}
export function lostGuests(prev: HostSnapshot, next: HostSnapshot): number {
  let n = 0;
  for (const [g, b] of prev.hostOf) {
    const was = prev.spans.get(b);
    const now = next.spans.get(b);
    const gWas = prev.spans.get(g);
    const gNow = next.spans.get(g);
    if (!was || !now || !gWas || !gNow) continue;
    if (was[0] === now[0] && was[1] === now[1]) continue;
    if (gWas[0] !== gNow[0] || gWas[1] !== gNow[1]) continue;
    if (next.hostOf.get(g) !== b) n += 1;
  }
  return n;
}
// 3.11.1: would this change to a break take a task it hosts out of it? `before` and `after` are the day's
// entries around the change; `taskId` the break's task. True when a time that was inside it is not inside
// it any more (it moved, shrank, was deleted from the day or lost Split).
export function breakLosesGuests(before: DayHostEntry[], after: DayHostEntry[], taskId: string): boolean {
  const was = hostDay(before);
  const now = hostDay(after);
  const taskOf = new Map(before.map((e) => [e.id, e.full.id]));
  const taskOfAfter = new Map(after.map((e) => [e.id, e.full.id]));
  for (const [guest, brk] of was.hostOf) {
    if (taskOf.get(brk) !== taskId) continue;
    if (!taskOfAfter.has(guest)) continue;
    const host = now.hostOf.get(guest);
    if (!host || taskOfAfter.get(host) !== taskId) return true;
  }
  return false;
}
export const lostNote = (n: number): string => (n === 1 ? '1 task no longer fits and moved out of the break' : `${n} tasks no longer fit and moved out of the break`);

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
