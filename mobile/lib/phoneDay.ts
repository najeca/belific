// One day of the phone's Calendar Day view (PLAN_phone P8). Pure: NO runtime imports besides siblings;
// see phoneDay.test.ts. The desktop Calendar's rules for a day (CalendarPane), so both apps draw a day
// the same way: today's stored and projected tasks (timeboxTasks.ts), one block per time (times.ts),
// yesterday's overnight rest, breaks that split the tasks under them (cuts.ts), the old events
// (decision 4: grey, read only), the iPhone's own calendar events, all laid out side by side where they
// overlap (timebox.ts layoutItems).
import type { ScheduleEvent, Task } from './types.ts';
import { tasksForTimebox, type DayTask } from './timeboxTasks.ts';
import { continuationOf, layoutItems, taskToItem, toMinutes, type PlacedBlock, type TimeboxItem } from './timebox.ts';
import { timeViews } from './times.ts';
import { planCuts, DEFAULT_CUT_MIN, type CutEntry, type CutPiece } from './cuts.ts';
import { hostDay, type HostEntry } from './hosting.ts';
import { isMustDo } from './mustDo.ts';
import { segmentsForDay, type DaySegment } from './externalEvents.ts';
import type { Occurrence } from './icsParse.ts';

export type DaySource =
  // `hosted` (3.7.0, lib/hosting.ts): a break's tasks fully inside it, drawn as chips in its block.
  | { kind: 'task'; task: Task; projected: boolean; full?: Task; time?: string; suffix?: string; piece?: CutPiece; continuation?: boolean; hosted?: HostedTask[] }
  | { kind: 'event'; event: ScheduleEvent }
  | { kind: 'device'; seg: DaySegment };

export interface HostedTask {
  // The task's own block id (task:<id><suffix>).
  id: string;
  task: Task;
  projected: boolean;
}

export interface PhoneDay {
  key: string;
  allDay: DayTask[];
  deviceAllDay: DaySegment[];
  blocks: Array<PlacedBlock & { source: DaySource }>;
  // A break that could not split a task: the sentence, by the break's block id.
  notes: Map<string, string>;
}

export function buildPhoneDay(input: { tasks: Task[]; dayKey: string; todayKey: string; events?: ScheduleEvent[]; device?: Occurrence[]; cutMin?: number }): PhoneDay {
  const { tasks, dayKey, todayKey } = input;
  const sources = new Map<string, DaySource>();
  const items: TimeboxItem[] = [];
  for (const e of input.events ?? []) {
    const s = toMinutes(e.start);
    const en = toMinutes(e.end);
    if (s === null || en === null) continue;
    sources.set(`event:${e.id}`, { kind: 'event', event: e });
    items.push({ id: `event:${e.id}`, startMin: s, endMin: en });
  }
  const { own, spill } = tasksForTimebox(tasks, dayKey, todayKey);
  const allDay = own.filter((d) => !d.task.startTime).sort((a, b) => Number(isMustDo(b.task)) - Number(isMustDo(a.task)));
  const entries: Array<CutEntry & HostEntry> = [];
  const high = new Map<string, boolean>();
  for (const { task: t, projected } of own) {
    if (!t.startTime) continue;
    for (const v of timeViews(t)) {
      const item = taskToItem(v.task);
      if (!item) continue;
      const id = `task:${t.id}${v.suffix}`;
      sources.set(id, { kind: 'task', task: v.task, projected, ...(v.multi ? { full: t, time: v.time, suffix: v.suffix } : {}) });
      entries.push({ id, startMin: item.startMin, endMin: item.endMin, breaks: !!t.cutsBelow });
      high.set(id, isMustDo(t));
    }
  }
  for (const { task: t, projected } of spill) {
    for (const v of timeViews(t)) {
      const rest = continuationOf(v.task);
      if (!rest) continue;
      const id = `${rest.id}${v.suffix}`;
      sources.set(id, { kind: 'task', task: v.task, projected, continuation: true, ...(v.multi ? { full: t, time: v.time, suffix: v.suffix } : {}) });
      entries.push({ id, startMin: rest.startMin, endMin: rest.endMin, breaks: !!t.cutsBelow, cont: true });
      high.set(id, isMustDo(t));
    }
  }
  const titleOf = (id: string) => {
    const s = sources.get(id);
    return s && s.kind === 'task' ? s.task.title : id;
  };
  // 3.7.0: a task fully inside a break is a chip in it (lib/hosting.ts), as on the desktop.
  const host = hostDay(entries);
  for (const [breakId, ids] of host.hosted) {
    const b = sources.get(breakId);
    if (!b || b.kind !== 'task') continue;
    const hosted: HostedTask[] = [];
    for (const id of ids) {
      const g = sources.get(id);
      if (g && g.kind === 'task') hosted.push({ id, task: g.task, projected: g.projected });
    }
    sources.set(breakId, { ...b, hosted });
  }
  const plan = planCuts(entries.filter((e) => !host.hostOf.has(e.id)), input.cutMin ?? DEFAULT_CUT_MIN, titleOf);
  for (const it of plan.items) {
    if (it.piece) {
      const host = sources.get(it.piece.hostId);
      if (host && host.kind === 'task') sources.set(it.id, { ...host, piece: it.piece });
    }
    items.push({ id: it.id, startMin: it.startMin, endMin: it.endMin, high: high.get(it.piece?.hostId ?? it.id) });
  }
  const deviceAllDay: DaySegment[] = [];
  for (const seg of segmentsForDay(input.device ?? [], dayKey)) {
    if (seg.allDayRow) {
      deviceAllDay.push(seg);
      continue;
    }
    const id = `ext:${seg.occ.id}`;
    sources.set(id, { kind: 'device', seg });
    items.push({ id, startMin: seg.startMin, endMin: seg.endMin });
  }
  const blocks = layoutItems(items)
    .blocks.map((b) => ({ ...b, source: sources.get(b.id) as DaySource }))
    .filter((b) => !!b.source);
  return { key: dayKey, allDay, deviceAllDay, blocks, notes: plan.notes };
}

// The time a tap on an empty part of the timeline stands for: the quarter hour under the finger
// (decision 6: the phone snaps to 15 minutes), never past 23:45.
export const PHONE_SNAP = 15;
export function minuteAtY(y: number, pxPerHour: number, snap = PHONE_SNAP): number {
  const raw = Math.floor(((y / pxPerHour) * 60) / snap) * snap;
  return Math.max(0, Math.min(1440 - snap, raw));
}
