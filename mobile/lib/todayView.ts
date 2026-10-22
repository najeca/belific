// What the phone's Today shows (PLAN_phone P4). Pure: NO runtime imports besides siblings; see
// todayView.test.ts.
//
//  * Today's tasks only (stored with today's Day, plus today's projected occurrences of repeating
//    series, exactly as the desktop's Timebox reads a day: timeboxTasks.ts).
//  * Timed items in time order; a task with several times a day is one item per time (times.ts).
//  * Tasks with no time in an "Anytime" group: top priority first, then oldest first.
//  * The phone's old events (decision 4: kept) are timed, read only items among the tasks.
//  * Routines not yet converted (PLAN_phone section 5) are untimed items at the top of Anytime,
//    ordered morning, afternoon, evening. A routine whose series `rt_<id>` exists is never shown,
//    so a converted routine never appears twice.
//  * Done items (a ticked task or time, a ticked routine) leave the lists and go to "Done today".
//  * Now and Next come from the timed items still to do.
import type { Routine, ScheduleEvent, Task, TimeOfDay } from './types.ts';
import { tasksForTimebox } from './timeboxTasks.ts';
import { DEFAULT_TASK_MINUTES } from './timebox.ts';
import { isMultiTime, isTimeDone, timeViews } from './times.ts';
import { isMustDo } from './mustDo.ts';
import { SERIES_PREFIX } from './routineConvert.ts';
import { rootTaskId } from './recurrence.ts';

export type TodayItem =
  | { kind: 'task'; key: string; task: Task; projected: boolean; time?: string; startMin?: number; endMin?: number; done: boolean; multi: boolean }
  | { kind: 'event'; key: string; event: ScheduleEvent; startMin: number; endMin: number }
  | { kind: 'routine'; key: string; routine: Routine; done: boolean };

export interface TodayView {
  timed: TodayItem[];
  anytime: TodayItem[];
  done: TodayItem[];
  now: TodayItem | null;
  next: TodayItem | null;
}

const ORDER: Record<TimeOfDay, number> = { morning: 0, afternoon: 1, evening: 2 };

export function toMin(t: string | undefined): number | undefined {
  if (!t || !/^\d\d:\d\d$/.test(t)) return undefined;
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
}

export function buildToday(input: {
  tasks: Task[];
  todayKey: string;
  nowMin: number;
  events?: ScheduleEvent[];
  routines?: Routine[];
  // Routine ids ticked today (routine_completions with today's date).
  routinesDone?: ReadonlySet<string>;
}): TodayView {
  const { tasks, todayKey, nowMin } = input;
  const timed: TodayItem[] = [];
  const anytime: TodayItem[] = [];
  const done: TodayItem[] = [];

  for (const { task, projected } of tasksForTimebox(tasks, todayKey, todayKey).own) {
    if (!task.startTime) {
      const item: TodayItem = { kind: 'task', key: task.id, task, projected, done: task.completed, multi: false };
      (task.completed ? done : anytime).push(item);
      continue;
    }
    const multi = isMultiTime(task);
    for (const v of timeViews(task)) {
      const start = toMin(v.time);
      const isDone = task.completed || (multi && isTimeDone(task, v.time));
      const item: TodayItem = {
        kind: 'task',
        key: `${task.id}${v.suffix}`,
        task: v.task,
        projected,
        time: v.time,
        startMin: start,
        endMin: start === undefined ? undefined : start + (task.durationMinutes ?? DEFAULT_TASK_MINUTES),
        done: isDone,
        multi,
      };
      (isDone ? done : timed).push(item);
    }
  }

  for (const e of input.events ?? []) {
    const s = toMin(e.start);
    const end = toMin(e.end);
    if (s === undefined) continue;
    timed.push({ kind: 'event', key: `event:${e.id}`, event: e, startMin: s, endMin: end !== undefined && end > s ? end : s + DEFAULT_TASK_MINUTES });
  }

  // Routines that are still routines (not converted to a live series).
  const liveIds = new Set(tasks.filter((t) => !t.deletedAt).map((t) => rootTaskId(t.id)));
  const routines = (input.routines ?? [])
    .filter((r) => !r.deletedAt && !liveIds.has(`${SERIES_PREFIX}${r.id}`))
    .sort((a, b) => ORDER[a.timeOfDay] - ORDER[b.timeOfDay] || a.createdAt.localeCompare(b.createdAt));
  const routineItems: TodayItem[] = [];
  for (const r of routines) {
    const isDone = !!input.routinesDone?.has(r.id);
    const item: TodayItem = { kind: 'routine', key: `routine:${r.id}`, routine: r, done: isDone };
    (isDone ? done : routineItems).push(item);
  }

  const startOf = (i: TodayItem) => (i.kind === 'routine' ? 0 : (i.startMin ?? 0));
  const titleOf = (i: TodayItem) => (i.kind === 'task' ? i.task.title : i.kind === 'event' ? i.event.title : i.routine.title);
  timed.sort((a, b) => startOf(a) - startOf(b) || (a.kind === b.kind ? 0 : a.kind === 'task' ? -1 : 1) || titleOf(a).localeCompare(titleOf(b)));
  anytime.sort((a, b) => {
    if (a.kind !== 'task' || b.kind !== 'task') return 0;
    return Number(isMustDo(b.task)) - Number(isMustDo(a.task)) || a.task.createdAt.localeCompare(b.task.createdAt) || a.task.title.localeCompare(b.task.title);
  });

  const endOf = (i: TodayItem) => (i.kind === 'routine' ? 0 : (i.endMin ?? startOf(i) + DEFAULT_TASK_MINUTES));
  const now = timed.find((i) => startOf(i) <= nowMin && nowMin < endOf(i)) ?? null;
  const next = timed.find((i) => startOf(i) > nowMin) ?? null;

  return { timed, anytime: [...routineItems, ...anytime], done, now, next };
}

// The words of the Now and Next line: "Now: Stand up, until 9:30am" / "Next: Lunch at 12:30pm".
export function itemTitle(i: TodayItem): string {
  if (i.kind === 'task') return `${i.task.emoji ? `${i.task.emoji} ` : ''}${i.task.title}`;
  if (i.kind === 'event') return `${i.event.icon ? `${i.event.icon} ` : ''}${i.event.title}`;
  return i.routine.title;
}
