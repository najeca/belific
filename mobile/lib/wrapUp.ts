// F3 of PLAN_daily_flow: Wrap up and the Earlier panel. Pure: NO runtime imports besides siblings; see wrapUp.test.ts.
// What is written lives in wrapActions.ts (each button is ONE gesture, so one Ctrl+Z or the row's Undo puts it back).
//
// The rules (PLAN_daily_flow sections 4 and 5, D1, D2, D5):
//   * Wrap up lists the day's tasks (stored and repeating), a tick each. An unticked one off task has three buttons:
//     Tomorrow (its time kept), Back to its list (Day and time cleared) and Let go (to the Trash, D2).
//   * A repeating day never moves: it has its tick and Let go only, which skips that day (the usual skip tombstone,
//     never the whole series). It comes back on its next repeat day.
//   * A one off task with some steps ticked and some not can send only the steps left to tomorrow: a copy with those
//     steps goes to tomorrow, and today's task keeps its ticked steps and is done.
//   * A shift is one row; the blocks inside it are its rows, with the same buttons. Tomorrow on a shift takes the one
//     off blocks inside it that are not done (repeating ones stay, done ones stay as history). Its to dos are its own
//     checklist: a tick each, and they go with it.
//   * Earlier: the one off tasks of a day before today that are not done (missed.ts). A shift is one row with its
//     inside rows under it. Tick all marks them all done on their own days. Before 14:00 a row also has Today.
import type { Task } from './types.ts';
import { isGone, projectOccurrences } from './series.ts';
import { isSeriesRow } from './rollover.ts';
import { shiftsOfDay, insideItemsOf, type ShiftRow } from './shifts.ts';
import { withAllDone } from './subtasks.ts';
import { wholeTaskTimesDone } from './times.ts';
import { formatMinutes, toMinutes } from './timebox.ts';
import { missedItems, ownDayCompletedAt } from './missed.ts';
import { totalsOf } from './taskTotals.ts';
import { isQuickReminder } from './quickReminder.ts';

export interface WrapItem {
  // The task's id; a shift's to do: `todo:<shift id>:<item id>`.
  key: string;
  task: Task;
  // A day of a repeating series that is only shown (not stored).
  projected: boolean;
  // Part of a repeating series: it never moves.
  series: boolean;
  done: boolean;
  // A shift: what is inside it.
  inside?: WrapItem[];
  // A row of a shift (timed or a to do): ticked through the shift (shiftActions.tickRow).
  row?: { shift: Task; projected: boolean; row: ShiftRow };
}

const startOf = (t: Task) => toMinutes(t.startTime) ?? 24 * 60;
const byTime = (a: WrapItem, b: WrapItem) => startOf(a.task) - startOf(b.task) || a.task.title.localeCompare(b.task.title) || a.key.localeCompare(b.key);

// The day's tasks, as Wrap up lists them. `raw`: every stored row, tombstones included (a skipped day is not shown).
export function dayItems(raw: Task[], dayKey: string, todayKey: string, cutMin: number): WrapItem[] {
  const stored = raw.filter((t) => !isGone(t) && !t.cutsBelow && t.dueDate === dayKey);
  const shown = projectOccurrences(raw, [dayKey], todayKey).filter((t) => !t.cutsBelow);
  const shifts = shiftsOfDay(raw, dayKey, todayKey, cutMin);
  const items: WrapItem[] = [];
  const seen = new Set<string>();
  for (const [task, projected] of [...stored.map((t) => [t, false] as const), ...shown.map((t) => [t, true] as const)]) {
    if (seen.has(task.id) || shifts.hidden.has(task.id)) continue;
    seen.add(task.id);
    const item: WrapItem = { key: task.id, task, projected, series: projected || isSeriesRow(task), done: !!task.completed };
    const info = shifts.byTask.get(task.id);
    if (info) {
      item.inside = info.rows
        .filter((r) => !r.nextDay)
        .map((r): WrapItem => {
          const row = { shift: task, projected, row: r };
          if (r.kind === 'todo' || !r.full) return { key: `todo:${task.id}:${r.subtaskId}`, task: { ...task, id: `todo:${task.id}:${r.subtaskId}`, title: r.title }, projected, series: true, done: r.done, row };
          // A task with several times a day is ticked by its time here, and never moves from inside a shift.
          return { key: r.slot ? `${r.full.id}#${r.slot}` : r.full.id, task: r.full, projected: !!r.projected, series: !!r.projected || isSeriesRow(r.full) || !!r.slot, done: r.done, row };
        });
    }
    items.push(item);
  }
  return items.sort(byTime);
}

// The buttons an unticked row offers.
export interface WrapButtons {
  tomorrow: boolean;
  list: boolean;
  letGo: boolean;
  // "Only the 3 steps left to tomorrow": how many steps are left (0: not offered).
  stepsLeft: number;
}

export function buttonsFor(item: WrapItem): WrapButtons {
  const none = { tomorrow: false, list: false, letGo: false, stepsLeft: 0 };
  if (item.done) return none;
  // A shift's to do: its tick only (it goes with the shift).
  if (item.row && item.row.row.kind === 'todo') return none;
  if (item.series) return { ...none, letGo: !item.row?.row.slot };
  const steps = item.task.subtasks ?? [];
  const ticked = steps.filter((s) => s.done).length;
  const left = steps.length - ticked;
  return { tomorrow: true, list: true, letGo: true, stepsLeft: !item.inside && ticked > 0 && left > 0 ? left : 0 };
}

export const stepsButton = (n: number): string => (n === 1 ? 'Only the 1 step left to tomorrow' : `Only the ${n} steps left to tomorrow`);

// What a decided row folds to ("Tomorrow · Undo").
// F4: 'notToday' (Plan my day's untick of a one off task: back to its list), 'skipToday' (of a repeating day), 'addToday'.
export type WrapChoice = 'tomorrow' | 'list' | 'letGo' | 'skip' | 'steps' | 'today' | 'done' | 'notToday' | 'skipToday' | 'addToday' | 'put';
export function choiceText(c: WrapChoice): string {
  if (c === 'tomorrow') return 'Tomorrow';
  if (c === 'list') return 'Back to its list';
  if (c === 'letGo') return 'Let go, in the Trash';
  if (c === 'skip') return 'Let go for today, it repeats';
  if (c === 'steps') return 'The steps left go to tomorrow';
  if (c === 'today') return 'Today';
  if (c === 'notToday') return 'Not today, back to its list';
  if (c === 'skipToday') return 'Skipped today, it repeats';
  if (c === 'addToday') return 'Added to today';
  if (c === 'put') return 'Put on a day';
  return 'Done on its own day';
}

// The steps split: [today's task, done with its ticked steps; tomorrow's copy with the steps left].
export function splitSteps(t: Task, tomorrowKey: string, newId: string, nowIso: string): [Task, Task] {
  const steps = t.subtasks ?? [];
  const today: Task = { ...t, subtasks: steps.filter((s) => s.done), completed: true, completedAt: nowIso, timesDone: wholeTaskTimesDone(t, true) };
  const { completedAt: _c, timesDone: _d, timerStartedAt: _r, deletedAt: _x, actualMinutes: _a, ...rest } = t;
  const copy: Task = { ...rest, id: newId, dueDate: tomorrowKey, subtasks: steps.filter((s) => !s.done), completed: false, createdAt: nowIso, updatedAt: nowIso };
  return [today, copy];
}

// Done on its own day (Earlier's Tick all): the steps and every time ticked too, as a tick does.
export function doneOnOwnDay(t: Task): Task {
  const subtasks = withAllDone(t.subtasks);
  return { ...t, completed: true, completedAt: ownDayCompletedAt(t.dueDate as string), ...(subtasks ? { subtasks } : {}), timesDone: wholeTaskTimesDone(t, true) };
}

// ---- Earlier ----

// The one off tasks of earlier days that are not done; a shift is one row with the ones inside it under it.
export function earlierItems(raw: Task[], todayKey: string): WrapItem[] {
  const missed = missedItems(raw, todayKey).map((m) => m.task);
  const ids = new Set(missed.map((t) => t.id));
  const under = new Map<string, Task[]>();
  const taken = new Set<string>();
  for (const t of missed) {
    if (!t.startTime || taken.has(t.id)) continue;
    const inner = insideItemsOf(raw, t, todayKey).filter((e) => ids.has(e.full.id) && e.full.id !== t.id);
    if (inner.length === 0) continue;
    under.set(t.id, inner.map((e) => e.full));
    for (const e of inner) taken.add(e.full.id);
  }
  const plain = (t: Task): WrapItem => ({ key: t.id, task: t, projected: false, series: false, done: false });
  return missed.filter((t) => !taken.has(t.id) || under.has(t.id)).map((t) => ({ ...plain(t), ...(under.has(t.id) ? { inside: (under.get(t.id) ?? []).map(plain) } : {}) }));
}

// Every open task Earlier lists, inside rows included (what Tick all ticks).
export const allOpen = (items: WrapItem[]): Task[] => items.flatMap((i) => [...(i.done ? [] : [i.task]), ...(i.inside ?? []).filter((x) => !x.done).map((x) => x.task)]);

export const tickAllText = (n: number): string => `Tick all ${n}`;
export const tickedAllText = (n: number): string => (n === 1 ? 'Ticked 1, done on its own day' : `Ticked ${n}, done on their own days`);

// Today shows on Earlier's rows before 14:00 (planning, not wrapping up).
export const showToday = (hour: number): boolean => hour >= 4 && hour < 14;

// ---- the figure ----

const tasksWord = (n: number): string => (n === 1 ? '1 task' : `${n} tasks`);

// "Tomorrow so far: 4 tasks, 3h 30m" (a shift counts once, as one task).
export function tomorrowText(raw: Task[], tomorrowKey: string, todayKey: string, cutMin: number, nowMs: number): string {
  // F6: a quick reminder is not a task in the count.
  const items = dayItems(raw, tomorrowKey, todayKey, cutMin).filter((i) => !isQuickReminder(i.task));
  if (items.length === 0) return 'Tomorrow so far: nothing planned yet.';
  const all = [...raw.filter((t) => !isGone(t) && t.dueDate === tomorrowKey), ...projectOccurrences(raw, [tomorrowKey], todayKey)];
  const est = totalsOf(all, nowMs, cutMin).estimate;
  return `Tomorrow so far: ${tasksWord(items.length)}${est > 0 ? `, ${formatMinutes(est)}` : ''}`;
}
