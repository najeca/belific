// F2 of PLAN_daily_flow: the Clear tools (Clear day, Clear week, Clear list, Clear label). Pure: NO runtime imports
// besides siblings; see clear.test.ts. What is written lives in clearActions.ts (one gesture, one batch save).
//
// Safe handling (PLAN_daily_flow section 7, D3):
//   * Clear day and Clear week send their unticked tasks back to their lists (Day and time cleared). Nothing is deleted.
//   * Clear list moves its unticked tasks to the Trash (restorable for 30 days).
//   * Clear label takes the label off its unticked tasks; its confirmation can instead move them to the Trash.
//   * Done tasks are never touched. Free time (a Break) is left alone: it is not a task to clear.
//   * A repeating task asks "This day only" or "All days" (All days chosen). For a day or a week, "This day only" skips
//     those days; for a list or a label it is the task's next day. "All days" stops the series (day, week: it no longer
//     repeats and goes back to its list) or deletes it (list, label to Trash). A label is shared by every day of a
//     series, so taking it off asks nothing.
//   * A shift takes what is inside it along (shifts.ts insideItemsOf, the day after midnight too), and counts as one.
import type { Task } from './types.ts';
import { addDays, dateKey, formatShortDate, parseDateKey } from './kanban.ts';
import { isGone, projectOccurrences } from './series.ts';
import { rootTaskId } from './recurrence.ts';
import { isSeriesRow } from './rollover.ts';
import { insideItemsOf } from './shifts.ts';

export type ClearTarget =
  | { kind: 'day'; dayKey: string }
  | { kind: 'week'; days: string[] }
  | { kind: 'list'; listKey: string; name: string }
  | { kind: 'label'; labelKey: string; name: string };

// 'unplan': back to the list (day, week); 'trash': to the Trash (list, label's second button); 'off': the label off.
export type ClearMode = 'unplan' | 'trash' | 'off';
export type ClearScope = 'day' | 'all';

export interface ClearItem {
  task: Task;
  // A day of a repeating series that is only shown (not stored).
  projected: boolean;
  // Part of a repeating series (its template, a stored day, or a shown day).
  series: boolean;
  // Inside a shift that is cleared too (not counted on its own).
  inside: boolean;
  // List and label, a repeating task: the day "This day only" acts on (its next open day from today).
  next?: { task: Task; projected: boolean };
}

export interface ClearPlan {
  items: ClearItem[];
  // What the confirmation counts: a shift is one, with what is inside it.
  count: number;
  shifts: number;
  inside: number;
  repeating: number;
}

export const defaultMode = (t: ClearTarget): ClearMode => (t.kind === 'list' ? 'trash' : t.kind === 'label' ? 'off' : 'unplan');

const open = (t: Task) => !isGone(t) && !t.completed && !t.cutsBelow;

function daysAhead(todayKey: string, n: number): string[] {
  const d = parseDateKey(todayKey);
  return Array.from({ length: n }, (_, i) => dateKey(addDays(d, i)));
}

// The next open day of a series from today: its stored row on or after today, else the first shown day (up to a year).
function nextOf(tasks: Task[], row: Task, todayKey: string): { task: Task; projected: boolean } | undefined {
  const root = rootTaskId(row.id);
  const stored = tasks
    .filter((t) => rootTaskId(t.id) === root && open(t) && !!t.dueDate && t.dueDate >= todayKey)
    .sort((a, b) => (a.dueDate as string).localeCompare(b.dueDate as string))[0];
  const shown = projectOccurrences(tasks, daysAhead(todayKey, 366), todayKey).find((t) => rootTaskId(t.id) === root);
  if (stored && (!shown || (stored.dueDate as string) <= (shown.dueDate as string))) return { task: stored, projected: false };
  return shown ? { task: shown, projected: true } : undefined;
}

export function planClear(tasks: Task[], target: ClearTarget, todayKey: string, mode: ClearMode = defaultMode(target)): ClearPlan {
  const items: ClearItem[] = [];
  const seen = new Set<string>();
  const add = (task: Task, projected: boolean, inside = false) => {
    if (seen.has(task.id) || !open(task)) return;
    seen.add(task.id);
    items.push({ task, projected, series: projected || isSeriesRow(task), inside });
  };
  if (target.kind === 'day' || target.kind === 'week') {
    const days = target.kind === 'day' ? [target.dayKey] : target.days;
    const set = new Set(days);
    for (const t of tasks) if (t.dueDate && set.has(t.dueDate)) add(t, false);
    for (const t of projectOccurrences(tasks, days, todayKey)) add(t, true);
  } else {
    const roots = new Set<string>();
    for (const t of tasks) {
      const hit = target.kind === 'list' ? t.listKey === target.listKey : t.projectKey === target.labelKey;
      if (!hit || !open(t)) continue;
      if (isSeriesRow(t)) {
        // One row per series: the latest stored live row stands for it (its next day is worked out below).
        const root = rootTaskId(t.id);
        if (roots.has(root)) continue;
        roots.add(root);
        const rows = tasks.filter((r) => rootTaskId(r.id) === root && open(r));
        const latest = rows.sort((a, b) => (b.dueDate ?? '').localeCompare(a.dueDate ?? ''))[0] ?? t;
        add(latest, false);
        const it = items[items.length - 1];
        if (it && it.task === latest) it.next = nextOf(tasks, latest, todayKey);
        continue;
      }
      add(t, false);
    }
  }
  // A shift takes what is inside it along (not when only its label comes off).
  let shifts = 0;
  if (mode !== 'off') {
    for (const it of [...items]) {
      if (!it.task.dueDate || !it.task.startTime) continue;
      const inner = insideItemsOf(tasks, it.task, todayKey).filter((e) => open(e.full));
      if (inner.length === 0) continue;
      shifts += 1;
      for (const e of inner) {
        const already = items.find((x) => x.task.id === e.full.id);
        if (already) already.inside = true;
        else add(e.full, e.projected, true);
      }
    }
  }
  const inside = items.filter((i) => i.inside).length;
  return { items, count: items.length - inside, shifts, inside, repeating: items.filter((i) => i.series && !i.inside).length };
}

// ---- words ----

const tasksWord = (n: number): string => (n === 1 ? '1 task' : `${n} tasks`);

function whereText(target: ClearTarget, todayKey: string): string {
  if (target.kind === 'day') {
    if (target.dayKey === todayKey) return 'today';
    return parseDateKey(target.dayKey).toLocaleDateString('en-GB', { weekday: 'long' }) + ` ${formatShortDate(target.dayKey)}`;
  }
  if (target.kind === 'week') return `${formatShortDate(target.days[0])} to ${formatShortDate(target.days[target.days.length - 1])}`;
  return target.kind === 'list' ? `the list ${target.name}` : `the label ${target.name}`;
}

// "Clear 14 tasks from Wednesday 18 Nov?"
export function clearQuestion(target: ClearTarget, plan: ClearPlan, todayKey: string): string {
  if (plan.count === 0) return `Nothing to clear from ${whereText(target, todayKey)}.`;
  if (target.kind === 'label') return `Clear the label ${target.name} from ${tasksWord(plan.count)}?`;
  return `Clear ${tasksWord(plan.count)} from ${whereText(target, todayKey)}?`;
}

export function clearExplain(target: ClearTarget, mode: ClearMode): string {
  if (mode === 'unplan') return 'They go back to their lists. Nothing is deleted. Done tasks stay where they are.';
  if (mode === 'trash') return 'They move to the Trash, where you can restore them for 30 days. Done tasks stay.';
  return 'The label comes off them. The tasks stay where they are. Done tasks keep it.';
}

export const shiftNote = (plan: ClearPlan): string | null =>
  plan.shifts === 0 ? null : plan.shifts === 1 ? `A shift counts as one, with the ${tasksWord(plan.inside)} inside it.` : `Each shift counts as one, with what is inside it (${tasksWord(plan.inside)}).`;

export const repeatNote = (n: number): string => (n === 1 ? '1 of them repeats:' : `${n} of them repeat:`);

// The main button: "Clear 14 tasks", "Move 14 tasks to the Trash", "Take the label off 9 tasks".
export function clearButton(mode: ClearMode, n: number): string {
  if (mode === 'trash') return `Move ${tasksWord(n)} to the Trash`;
  if (mode === 'off') return `Take the label off ${tasksWord(n)}`;
  return `Clear ${tasksWord(n)}`;
}
// D3: the label's smaller second button.
export const labelTrashButton = (n: number): string => `Move the ${n} ${n === 1 ? 'task' : 'tasks'} to Trash`;
export const clearedText = (mode: ClearMode, n: number): string => (mode === 'trash' ? `Moved ${tasksWord(n)} to the Trash` : mode === 'off' ? `Took the label off ${tasksWord(n)}` : `Cleared ${tasksWord(n)}`);

// The rows the batch save writes for the one off tasks (stored, not a series).
export function oneOffRows(plan: ClearPlan, mode: ClearMode, nowIso: string): Task[] {
  return plan.items
    .filter((i) => !i.series && !i.projected)
    .map((i) => {
      if (mode === 'trash') return { ...i.task, deletedAt: nowIso };
      if (mode === 'off') return i.inside ? i.task : { ...i.task, projectKey: undefined };
      return { ...i.task, dueDate: undefined, startTime: undefined, extraTimes: undefined, timesDone: undefined };
    })
    .filter((t, k, all) => all.indexOf(t) === k && (mode !== 'off' || t.projectKey === undefined));
}

// The week of a day: Monday to Sunday.
export function weekOf(dayKey: string): string[] {
  const d = parseDateKey(dayKey);
  const monday = addDays(d, -((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => dateKey(addDays(monday, i)));
}
