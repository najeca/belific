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
import { DEFAULT_TASK_MINUTES, toMinutes } from './timebox.ts';
import { hostDay, type HostEntry } from './hosting.ts';
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
