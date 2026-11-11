// F4 of PLAN_daily_flow: Plan my day on one screen. Pure: NO runtime imports besides siblings; see planDay.test.ts.
// The writes are in wrapActions.ts (each button is ONE gesture: its row's Undo or Ctrl+Z puts it back, D1).
//
//   * On today: the day's tasks, stored and repeating (wrapUp.dayItems: a shift is one item, what is inside it is part
//     of it). Unticking one means "not today": a one off task goes back to its list (Day and time cleared), a repeating
//     day is skipped (the usual skip tombstone). The Timebox beside it takes a drag to give a task a time.
//   * Add to today: one picker (Brain Dump, then each list) with the tasks that have no Day, and the repeating tasks whose
//     next day is not today (Today moves that one day here). The tasks of earlier days are one folded line that opens
//     the Earlier panel (F3).
import type { Task, TaskList } from './types.ts';
import { addDays, dateKey, parseDateKey } from './kanban.ts';
import { projectOccurrences } from './series.ts';
import { rootTaskId } from './recurrence.ts';
import { isSeriesRow } from './rollover.ts';
import { tasksInList } from './lists.ts';
import { totalsOf } from './taskTotals.ts';
import { formatMinutes } from './timebox.ts';
import { earlierItems } from './wrapUp.ts';
import type { WrapItem } from './wrapUp.ts';

const item = (task: Task, projected: boolean): WrapItem => ({ key: task.id, task, projected, series: projected || isSeriesRow(task), done: !!task.completed });

// The tasks of a list (undefined: Brain Dump) that have no Day and are not done, oldest first as the list shows them.
export function addRows(raw: Task[], listKey: string | undefined, lists: Array<Pick<TaskList, 'key' | 'deletedAt'>>): WrapItem[] {
  const live = raw.filter((t) => !t.deletedAt);
  return tasksInList(live, listKey, lists)
    .filter((t) => !t.completed && !t.dueDate && !t.cutsBelow && !t.recurrence)
    .map((t) => item(t, false));
}

// How far ahead a repeating task's next day is looked for.
const AHEAD_DAYS = 62;

// The repeating tasks that are not on today: each one's next open day (shown or stored), soonest first.
export function repeatingNotToday(raw: Task[], todayKey: string): WrapItem[] {
  const start = parseDateKey(todayKey);
  const days = Array.from({ length: AHEAD_DAYS }, (_, i) => dateKey(addDays(start, i)));
  const shown = projectOccurrences(raw, days, todayKey);
  const live = raw.filter((t) => !t.deletedAt);
  const onToday = new Set([...shown, ...live].filter((t) => t.dueDate === todayKey && isSeriesRow(t)).map((t) => rootTaskId(t.id)));
  const next = new Map<string, WrapItem>();
  const candidates = [
    ...shown.map((t) => item(t, true)),
    ...live.filter((t) => isSeriesRow(t) && !t.completed && !!t.dueDate && t.dueDate > todayKey).map((t) => item(t, false)),
  ];
  for (const c of candidates) {
    if (c.task.cutsBelow) continue;
    const root = rootTaskId(c.task.id);
    if (onToday.has(root)) continue;
    const had = next.get(root);
    if (!had || (c.task.dueDate as string) < (had.task.dueDate as string)) next.set(root, c);
  }
  return [...next.values()].sort((a, b) => (a.task.dueDate as string).localeCompare(b.task.dueDate as string) || a.task.title.localeCompare(b.task.title));
}

// The one folded line for earlier days: "3 from earlier days" (never "missed").
export const earlierLine = (n: number): string => `${n} from earlier days`;

// What is inside a shift, folded under its row: "3 inside · 1 to do".
export function insideText(it: WrapItem): string {
  const rows = it.inside ?? [];
  const todos = rows.filter((r) => r.row?.row.kind === 'todo').length;
  const timed = rows.length - todos;
  return [timed > 0 ? `${timed} inside` : '', todos > 0 ? (todos === 1 ? '1 to do' : `${todos} to dos`) : ''].filter(Boolean).join(' · ');
}

// "Planned 11h 15m": today's planned time, a shift once (S1); free time does not count.
export function plannedText(raw: Task[], todayKey: string, cutMin: number, nowMs: number): string {
  const all = [...raw.filter((t) => !t.deletedAt && t.dueDate === todayKey), ...projectOccurrences(raw, [todayKey], todayKey)];
  const est = totalsOf(all, nowMs, cutMin).estimate;
  return est > 0 ? `Planned ${formatMinutes(est)}` : 'Nothing has a length yet.';
}

// ---- F5: Plan week ----

// A day's planned total for its column: a shift counts at its own length, once (S1); "—" when nothing has a length.
export function dayTotalText(raw: Task[], dayKey: string, todayKey: string, cutMin: number, nowMs: number): string {
  const all = [...raw.filter((t) => !t.deletedAt && t.dueDate === dayKey), ...projectOccurrences(raw, [dayKey], todayKey)];
  const est = totalsOf(all, nowMs, cutMin).estimate;
  return est > 0 ? formatMinutes(est) : '—';
}

// "4 from last week": the tasks of earlier days that wait in Earlier (a shift is one). Never "missed", nothing at zero.
export const lastWeekLine = (n: number): string => `${n} from last week`;
export const lastWeekCount = (raw: Task[], todayKey: string): number => earlierItems(raw, todayKey).length;

// A day takes a task only from today on (the same rule as a drop on a day column).
export const dayOpen = (dayKey: string, todayKey: string): boolean => dayKey >= todayKey;
