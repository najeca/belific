// What Today shows, for both apps (PLAN_desktop_parity D1, 3.66.0). Moved unchanged out of the phone's
// app/(tabs)/today.tsx so the phone and the desktop Today view (D3) cannot decide "now", "Anytime" or the timeline
// order apart. Pure: NO runtime imports besides siblings; see todayModel.test.ts.
//
//  * The rows come from buildToday (lib/todayView.ts). A block inside a shift is a row of the shift's card, not a row of
//    its own (S5, D2): it is left out of timed, anytime and done.
//  * The Now card reads every timed item of today; a ticked one is left out by nowCard itself.
//  * The timeline is every timed item of today in time order (then by title), ticked ones kept (struck through).
//  * Anytime follows the stored do first order (lib/anytimeOrder.ts); new items come after it.
//  * The hours strip counts today's own tasks, done and planned (lib/labelHours.ts).
import type { Project, Routine, ScheduleEvent, Task } from './types.ts';
import { buildToday, itemTitle, type TodayItem, type TodayView } from './todayView.ts';
import { shiftsOfDay, type DayShifts } from './shifts.ts';
import { hostIndex } from './hosting.ts';
import { nowCard, type NowCardItem } from './nowCard.ts';
import type { TimelineSpan } from './todayTimeline.ts';
import { applyOrder, staleOrderKeys } from './anytimeOrder.ts';
import { labelHours, HOURS_COUNT_PREFIX } from './labelHours.ts';
import { isQuickReminder } from './quickReminder.ts';

export interface TodayModelInput {
  tasks: Task[];
  todayKey: string;
  nowMin: number;
  cutMin: number;
  events?: ScheduleEvent[];
  routines?: Routine[];
  routinesDone?: ReadonlySet<string>;
  // The stored do first order of Anytime (parseOrder of the day's row).
  order: string[];
  labels: Project[];
  // The "Count in daily hours" rows, by label key.
  hoursStored: Map<string, string>;
}

export interface TimelineRow {
  item: TodayItem;
  span: TimelineSpan;
}

export interface TodayModel {
  full: TodayView;
  // The tasks of today with a row of their own (once each).
  ownTasks: Task[];
  shifts: DayShifts;
  // buildToday with the rows inside a shift left out.
  view: TodayView;
  hours: ReturnType<typeof labelHours>;
  hosts: ReturnType<typeof hostIndex>;
  timedAll: TodayItem[];
  now: ReturnType<typeof nowCard>;
  nowItem: TodayItem | undefined;
  timeline: TimelineRow[];
  doneUntimed: TodayItem[];
  anytime: TodayItem[];
}

export function ownTasksOf(full: TodayView): Task[] {
  const seen = new Map<string, Task>();
  for (const i of [...full.timed, ...full.anytime, ...full.done]) if (i.kind === 'task' && !seen.has(i.task.id)) seen.set(i.task.id, i.task);
  return [...seen.values()];
}

export function withoutShiftRows(full: TodayView, shifts: DayShifts): TodayView {
  const keep = (i: TodayItem) => i.kind !== 'task' || !shifts.hidden.has(i.task.id);
  return { ...full, timed: full.timed.filter(keep), anytime: full.anytime.filter(keep), done: full.done.filter(keep) };
}

export function timedItemsOf(view: TodayView): TodayItem[] {
  return [...view.timed, ...view.done.filter((i) => i.kind !== 'routine' && i.startMin !== undefined)];
}

export function nowItemsOf(timedAll: TodayItem[]): NowCardItem[] {
  const items: NowCardItem[] = [];
  for (const i of timedAll) {
    if (i.kind === 'routine' || i.startMin === undefined) continue;
    const t = i.kind === 'task' ? i.task : null;
    items.push({ key: i.key, title: itemTitle(i), startMin: i.startMin, endMin: i.endMin ?? i.startMin, reminder: !!t && isQuickReminder(t), free: !!t?.cutsBelow, done: i.kind === 'task' && i.done });
  }
  return items;
}

export function timelineOf(timedAll: TodayItem[]): TimelineRow[] {
  return timedAll
    .filter((i) => i.kind !== 'routine' && i.startMin !== undefined)
    .sort((a, b) => (a.kind === 'routine' || b.kind === 'routine' ? 0 : (a.startMin ?? 0) - (b.startMin ?? 0)) || itemTitle(a).localeCompare(itemTitle(b)))
    .map((item) => {
      const t = item.kind === 'task' ? item.task : null;
      const startMin = item.kind === 'routine' ? 0 : (item.startMin ?? 0);
      const span: TimelineSpan = { key: item.key, startMin, endMin: item.kind === 'routine' ? 0 : (item.endMin ?? startMin), reminder: !!t && isQuickReminder(t), free: !!t?.cutsBelow, done: item.kind === 'task' && item.done };
      return { item, span };
    });
}

export function anytimeOf(view: TodayView, order: string[]): TodayItem[] {
  const byKey = new Map(view.anytime.map((i) => [i.key, i]));
  return applyOrder(view.anytime.map((i) => i.key), order).map((k) => byKey.get(k) as TodayItem);
}

export function todayModel(input: TodayModelInput): TodayModel {
  const { tasks, todayKey, nowMin, cutMin, order, labels, hoursStored } = input;
  const full = buildToday({ tasks, todayKey, nowMin, events: input.events, routines: input.routines, routinesDone: input.routinesDone });
  const ownTasks = ownTasksOf(full);
  const shifts = shiftsOfDay(tasks, todayKey, todayKey, cutMin, new Set(ownTasks.map((t) => t.id)));
  const view = withoutShiftRows(full, shifts);
  const hours = labelHours({ tasks: ownTasks.filter((t) => t.dueDate === todayKey), labels, stored: hoursStored, cutMin });
  const hosts = hostIndex(tasks, [todayKey], todayKey);
  const timedAll = timedItemsOf(view);
  const now = nowCard(nowItemsOf(timedAll), nowMin);
  const nowItem = now.now ? timedAll.find((i) => i.key === now.now?.key) : undefined;
  return {
    full,
    ownTasks,
    shifts,
    view,
    hours,
    hosts,
    timedAll,
    now,
    nowItem,
    timeline: timelineOf(timedAll),
    doneUntimed: view.done.filter((i) => i.kind === 'routine' || i.startMin === undefined),
    anytime: anytimeOf(view, order),
  };
}

// The synced settings Today reads: the hours switches by label key, and the order rows of days long gone.
export function todaySettings(settings: { key: string; value: string; deletedAt?: string | null }[], todayKey: string): { hoursStored: Map<string, string>; stale: string[] } {
  const live = settings.filter((x) => !x.deletedAt);
  return {
    hoursStored: new Map(live.filter((x) => x.key.startsWith(HOURS_COUNT_PREFIX)).map((x) => [x.key.slice(HOURS_COUNT_PREFIX.length), x.value])),
    stale: staleOrderKeys(live.map((x) => x.key), todayKey),
  };
}
