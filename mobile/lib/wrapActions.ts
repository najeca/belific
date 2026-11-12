// F3 of PLAN_daily_flow: what Wrap up's and Earlier's buttons write (the rules are in wrapUp.ts). Each is ONE gesture
// (D1: saved at once), so Ctrl+Z, or the Undo on the row it folded, puts it back. Each returns the undo entry it made.
import type { Task } from './types';
import { generateId } from './data';
import { deleteTask, loadTasksRaw, updateTasks } from './storage';
import { patchTask } from './taskActions';
import { moveDay, skipOccurrence } from './seriesActions';
import { opsForProjected, opsForTask } from './taskOps';
import { tickRow } from './shiftActions';
import { carryToDay } from './breakCarry';
import { isSeriesRow } from './rollover';
import { stack, type UndoEntry } from './undoStack';
import { doneOnOwnDay, splitParts, splitSteps, type WrapItem } from './wrapUp';
import { partsOf } from './parts';

async function gesture(run: () => Promise<void>): Promise<UndoEntry | undefined> {
  stack.markGesture();
  const before = stack.peekUndo();
  await run();
  const after = stack.peekUndo();
  return after && after !== before ? after : undefined;
}

const fresh = async (id: string): Promise<Task | undefined> => (await loadTasksRaw()).find((t) => t.id === id && !t.deletedAt);

// A tick, either way.
export const wrapTick = (item: WrapItem) =>
  gesture(async () => {
    if (item.row) return tickRow(item.row.shift, item.row.projected, item.row.row);
    await (item.projected ? opsForProjected(item.task) : opsForTask(item.task)).setCompleted(!item.done);
  });

// Tomorrow (or Today, from Earlier): the Day changes, the time stays. A shift takes the one off items inside it that
// are not done; a repeating item inside stays on its own day, and a done one stays as history.
export const wrapMove = (item: WrapItem, toDay: string) =>
  gesture(async () => {
    const t = await fresh(item.task.id);
    if (!t || t.completed || isSeriesRow(t)) return;
    await patchTask(t.id, { dueDate: toDay });
    await carryToDay(t, toDay, (x) => !x.completed && !isSeriesRow(x));
  });

// Back to its list: the Day and the time cleared.
export const wrapToList = (item: WrapItem) =>
  gesture(async () => {
    const t = await fresh(item.task.id);
    if (t && !t.completed && !isSeriesRow(t)) await patchTask(t.id, { dueDate: undefined, startTime: undefined, extraTimes: undefined, timesDone: undefined });
  });

// Let go (D2): a one off task goes to the Trash; a repeating day is skipped, never the whole series.
export const wrapLetGo = (item: WrapItem) =>
  gesture(async () => {
    if (item.series) return skipOccurrence(item.task);
    const t = await fresh(item.task.id);
    if (t && !t.completed) await deleteTask(t.id);
  });

// Only the steps left to tomorrow: today's task done with its ticked steps, a copy with the rest on tomorrow (one save).
export const wrapSteps = (item: WrapItem, tomorrowKey: string) =>
  gesture(async () => {
    const t = await fresh(item.task.id);
    if (!t || t.completed || isSeriesRow(t)) return;
    await updateTasks(splitSteps(t, tomorrowKey, generateId(), new Date().toISOString()));
  });

// R5, E4: only the parts left to tomorrow: today's parent done with its done parts, a copy of it on tomorrow holding the
// open parts (re-linked), one save, one Ctrl+Z.
export const wrapParts = (item: WrapItem, tomorrowKey: string) =>
  gesture(async () => {
    const raw = await loadTasksRaw();
    const t = raw.find((x) => x.id === item.task.id && !x.deletedAt);
    if (!t || t.completed || isSeriesRow(t)) return;
    const plan = splitParts(t, partsOf(raw, t.id), tomorrowKey, generateId(), new Date().toISOString());
    await updateTasks([plan.today, plan.copy, ...plan.moved]);
  });

// Earlier's Tick all: every one done on its own day, in one save.
export const tickAll = (tasks: Task[]) =>
  gesture(async () => {
    const now = await loadTasksRaw();
    const rows = tasks.flatMap((t) => {
      const row = now.find((x) => x.id === t.id && !x.deletedAt && !x.completed);
      return row ? [doneOnOwnDay(row)] : [];
    });
    if (rows.length > 0) await updateTasks(rows);
  });

// ---- F4: Plan my day ----

// "Not today" (an untick on On today): a one off task goes back to its list, a repeating day is skipped.
export const notToday = (item: WrapItem) => (item.series ? wrapLetGo(item) : wrapToList(item));

// Add to today: a task with no Day gets today (no time: the Timebox takes a drag for that); a repeating task's next
// day moves to today, that day only (series.ts moveDay).
export const addToday = (item: WrapItem, todayKey: string) =>
  gesture(async () => {
    if (item.series) {
      await moveDay(item.task, todayKey);
      return;
    }
    const t = await fresh(item.task.id);
    if (t && !t.completed && !t.dueDate) await patchTask(t.id, { dueDate: todayKey });
  });
