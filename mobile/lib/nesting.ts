// Shifts, S1 (PLAN_shifts): a block inside a longer block. Pure: NO runtime imports besides siblings; see
// nesting.test.ts. Shared by the desktop and the phone.
//
// Any timed block that sits fully inside a LONGER block's time (the edges count) is inside it. Nothing is stored: like
// hosting and cuts it is worked out from the times every time a day is drawn or summed, so a block moved out of the
// longer one's time is on its own again at once.
//
//  * Free time comes first (hosting.ts hostDay): a Break is never a shell and never inside one, and a task inside a
//    break belongs to the break, not to the block around the break.
//  * Two blocks with the same start and end are not inside each other: both count, side by side.
//  * One level: every block goes to the outermost block that holds it (a "shell"). When several shells hold it, the
//    shortest, then the earlier, then by id.
//  * Each time of a task with several times a day is its own entry.
//  * Counting (D1 to D3): the shell counts once at its own length, less the free time cut out of it (G4); what is inside
//    it adds nothing. Lunch is an ordinary block inside, so it is part of the shell's planned time (D1).
import type { Task } from './types.ts';
import { DEFAULT_CUT_MIN, cutDay } from './cuts.ts';
import { DEFAULT_TASK_MINUTES, formatMinutes, toMinutes, toTime } from './timebox.ts';
import { dayHostEntries, hostDay, type HostEntry } from './hosting.ts';
import { timesOf } from './times.ts';

export interface NestEntry {
  id: string;
  startMin: number;
  // The TRUE end: may be past 24:00.
  endMin: number;
}

export interface NestResult {
  // An inside entry's id -> its shell's id.
  shellOf: Map<string, string>;
  // A shell's id -> the ids inside it, earliest first (then the longer, then by id).
  inside: Map<string, string[]>;
}

const len = (e: NestEntry) => e.endMin - e.startMin;
const valid = (e: NestEntry) => Number.isFinite(e.startMin) && Number.isFinite(e.endMin) && e.endMin > e.startMin;
const holds = (o: NestEntry, e: NestEntry) => o.startMin <= e.startMin && e.endMin <= o.endMin && len(o) > len(e);

// `entries` are the day's plain blocks: no breaks and no tasks inside a break (the caller leaves them out).
export function nestDay(entries: NestEntry[]): NestResult {
  const res: NestResult = { shellOf: new Map(), inside: new Map() };
  const byLength = entries.filter(valid).sort((a, b) => len(b) - len(a) || a.startMin - b.startMin || a.id.localeCompare(b.id));
  const shells: NestEntry[] = [];
  for (const e of byLength) {
    const holders = shells.filter((s) => holds(s, e));
    if (holders.length === 0) {
      shells.push(e);
      continue;
    }
    const s = holders.sort((a, b) => len(a) - len(b) || a.startMin - b.startMin || a.id.localeCompare(b.id))[0];
    res.shellOf.set(e.id, s.id);
  }
  for (const [e, s] of res.shellOf) res.inside.set(s, [...(res.inside.get(s) ?? []), e]);
  const byId = new Map(entries.map((e) => [e.id, e]));
  for (const ids of res.inside.values()) {
    ids.sort((a, b) => {
      const x = byId.get(a) as NestEntry;
      const y = byId.get(b) as NestEntry;
      return x.startMin - y.startMin || y.endMin - x.endMin || a.localeCompare(b);
    });
  }
  return res;
}

// The minutes the blocks inside a longer one would add on top of it, per task: taken off a total so the day counts
// them once. A block inside counts nothing while a longer block that holds it is counted too; on its own (its shell is
// ticked, or not in the list being totalled) it counts as usual. What free time cuts out of it is already taken off by
// hosting.ts gapMinutes, so only the part that is left is taken off here.
//   `tasks` are the ones being totalled; `context` may hold more (the same days' other tasks, as Analytics has);
//   `counts(task, time)` says whether that time of a task in `tasks` is in the total (default: every time).
type NestInput = Pick<Task, 'durationMinutes'> & Partial<Pick<Task, 'deletedAt' | 'dueDate' | 'startTime' | 'extraTimes' | 'cutsBelow'>>;
export function nestedMinutesBy<T extends NestInput>(tasks: T[], minLen: number = DEFAULT_CUT_MIN, context: NestInput[] = tasks, counts: (task: T, time: string) => boolean = () => true): Map<T, number> {
  const out = new Map<T, number>();
  const counted = new Set<NestInput>(tasks);
  const all = context === tasks ? tasks : [...new Set<NestInput>([...tasks, ...context])];
  const byDay = new Map<string, Array<HostEntry & { task: NestInput; counted: boolean }>>();
  all.forEach((t, i) => {
    if (t.deletedAt || !t.dueDate) return;
    const n = typeof t.durationMinutes === 'number' && Number.isFinite(t.durationMinutes) ? Math.round(t.durationMinutes) : 0;
    const span = n > 0 ? n : t.cutsBelow ? DEFAULT_TASK_MINUTES : 0;
    if (span <= 0) return;
    const list = byDay.get(t.dueDate) ?? [];
    for (const time of timesOf(t)) {
      const s = toMinutes(time);
      if (s === null) continue;
      const isCounted = counted.has(t) && !t.cutsBelow && counts(t as T, time);
      list.push({ id: `${i}@${time}`, startMin: s, endMin: s + span, breaks: !!t.cutsBelow, task: t, counted: isCounted });
    }
    byDay.set(t.dueDate, list);
  });
  for (const list of byDay.values()) {
    const live = list.filter((e) => e.counted);
    if (live.length < 2) continue;
    const hasBreaks = list.some((e) => e.breaks);
    const hostOf = hasBreaks ? hostDay(list).hostOf : new Map<string, string>();
    const unhosted = list.filter((e) => !hostOf.has(e.id));
    const cut = hasBreaks ? cutDay(unhosted, minLen) : null;
    const plain = unhosted.filter((e) => !e.breaks && e.counted);
    for (const e of plain) {
      if (!plain.some((o) => o !== e && holds(o, e))) continue;
      const kept = cut?.cut.has(e.id) ? cut.pieces.filter((p) => p.hostId === e.id).reduce((m, p) => m + (p.endMin - p.startMin), 0) : len(e);
      out.set(e.task as T, (out.get(e.task as T) ?? 0) + kept);
    }
  }
  return out;
}

export function nestedMinutes(tasks: NestInput[], minLen: number = DEFAULT_CUT_MIN, context: NestInput[] = tasks, counts?: (task: NestInput, time: string) => boolean): number {
  let m = 0;
  for (const v of nestedMinutesBy(tasks, minLen, context, counts).values()) m += v;
  return m;
}

// ---- Drawing (S2) ----

// What a shell shows in its header (D1, D3): its own length less the free time cut out of it, the part of it the blocks
// inside cover (once, however they overlap), and the rest.
export interface ShellSummary {
  total: number;
  planned: number;
  free: number;
}
export function summaryText(s: ShellSummary): string {
  if (s.planned <= 0) return `Nothing planned yet, ${formatMinutes(s.total)} free`;
  if (s.free <= 0) return `${formatMinutes(s.planned)} planned, nothing free`;
  return `${formatMinutes(s.planned)} of ${formatMinutes(s.total)} planned, ${formatMinutes(s.free)} free`;
}
// The narrow Week column: "5h/10h".
export const summaryShort = (s: ShellSummary): string => `${formatMinutes(s.planned)}/${formatMinutes(s.total)}`;

// The union of spans, in minutes.
function unionMinutes(spans: Array<[number, number]>): number {
  const sorted = spans.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  let total = 0;
  let cur: [number, number] | null = null;
  for (const [a, b] of sorted) {
    if (!cur || a > cur[1]) {
      if (cur) total += cur[1] - cur[0];
      cur = [a, b];
    } else cur[1] = Math.max(cur[1], b);
  }
  if (cur) total += cur[1] - cur[0];
  return total;
}

// A block that starts inside a longer block and ends after it (both count, side by side): the grey note and its
// "Fit inside" (S2). Only blocks that are not inside anything, against LONGER blocks that are not inside anything (a long
// shift that starts during a short task is not offered to shrink into it).
export const FIT_INSIDE = 'Fit inside';
export const fitNote = (title: string): string => `Starts inside ${title} and ends after it`;
export function partialOverlaps(entries: NestEntry[]): Map<string, string> {
  const out = new Map<string, string>();
  const { shellOf } = nestDay(entries);
  const top = entries.filter((e) => valid(e) && !shellOf.has(e.id));
  for (const e of top) {
    const o = top
      .filter((x) => x !== e && len(x) > len(e) && x.startMin <= e.startMin && e.startMin < x.endMin && x.endMin < e.endMin)
      .sort((a, b) => len(b) - len(a) || a.startMin - b.startMin || a.id.localeCompare(b.id))[0];
    if (o) out.set(e.id, o.id);
  }
  return out;
}
// "Fit inside": the block keeps its length and ends when the longer one ends; one longer than it takes its start and
// its length.
export function fitInsideFields(e: Pick<NestEntry, 'startMin' | 'endMin'>, outer: Pick<NestEntry, 'startMin' | 'endMin'>): Pick<Task, 'startTime' | 'durationMinutes'> {
  if (len(e as NestEntry) > len(outer as NestEntry)) return { startTime: toTime(outer.startMin), durationMinutes: len(outer as NestEntry) };
  return { startTime: toTime(outer.endMin - len(e as NestEntry)) };
}

// A day as the panes draw it, after free time (gaps.ts gapLayout): which drawn item is inside which shell, which items
// are a shell's own (its pieces), each shell's summary and the blocks that stick out of a longer one. `entries` are
// the day's entries (breaks included), `hostOf` hosting.ts's answer for them, `items` the drawn items (a piece carries
// its task's entry id; an item in a gap its gap's id).
export interface NestPlan {
  insideOf: Map<string, string>;
  groupOf: Map<string, string>;
  summaries: Map<string, ShellSummary>;
  partial: Map<string, string>;
}
export function nestPlan(entries: Array<HostEntry>, hostOf: Map<string, string>, items: Array<{ id: string; startMin: number; endMin: number; piece?: { hostId: string }; gapId?: string }>): NestPlan {
  const plan: NestPlan = { insideOf: new Map(), groupOf: new Map(), summaries: new Map(), partial: new Map() };
  const plain = entries.filter((e) => !e.breaks && !hostOf.has(e.id));
  const { shellOf, inside } = nestDay(plain);
  plan.partial = partialOverlaps(plain);
  const spans = new Map<string, { own: number; covered: Array<[number, number]> }>();
  for (const it of items) {
    if (it.gapId) continue;
    const base = it.piece?.hostId ?? it.id;
    const shell = shellOf.get(base);
    if (shell) {
      plan.insideOf.set(it.id, shell);
      const s = spans.get(shell) ?? { own: 0, covered: [] };
      s.covered.push([it.startMin, it.endMin]);
      spans.set(shell, s);
    } else if (inside.has(base)) {
      plan.groupOf.set(it.id, base);
      const s = spans.get(base) ?? { own: 0, covered: [] };
      s.own += it.endMin - it.startMin;
      spans.set(base, s);
    }
  }
  const byId = new Map(entries.map((e) => [e.id, e]));
  for (const [id, s] of spans) {
    const e = byId.get(id);
    if (!e || s.own <= 0) continue;
    const planned = Math.min(s.own, unionMinutes(s.covered.map(([a, b]) => [Math.max(a, e.startMin), Math.min(b, e.endMin)] as [number, number])));
    plan.summaries.set(id, { total: s.own, planned, free: s.own - planned });
  }
  return plan;
}

// The details of a block that starts inside a longer one and ends after it: that block's title and the fields that fit
// it inside. Not for a task with several times a day, nor for yesterday's overnight rest.
export function fitInsideFor(tasks: Task[], task: Pick<Task, 'id' | 'dueDate'>, todayKey: string): { title: string; fields: Pick<Task, 'startTime' | 'durationMinutes'> } | null {
  if (!task.dueDate) return null;
  const entries = dayHostEntries(tasks, task.dueDate, todayKey);
  const { hostOf } = hostDay(entries);
  const plain = entries.filter((e) => !e.breaks && !e.cont && !hostOf.has(e.id));
  const partial = partialOverlaps(plain);
  const e = plain.find((x) => x.full.id === task.id && !x.time);
  const outer = e ? plain.find((x) => x.id === partial.get(e.id)) : undefined;
  return e && outer ? { title: outer.full.title, fields: fitInsideFields(e, outer) } : null;
}
