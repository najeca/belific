import { completeTaskById, editDumpItem, patchTask, setTimeDoneById, toggleSubtaskById } from './taskActions';
import {
  completeProjected,
  deleteSeries,
  editRepeatingTime,
  endSeries,
  moveDay,
  patchSeries,
  skipOccurrence,
  tickTimeProjected,
  toggleProjectedSubtask,
} from './seriesActions';
import { deleteBrainDumpItem, deleteTask } from './storage';
import { dumpItemToTask } from './thoughts';
import { isDateKey } from './kanban';
import { isTimeEdit } from './seriesTime';
import type { BrainDumpItem, Task } from './types';

// What a card (or a Timebox block popover, or a phone row or details sheet) can do to its task.
// Shared since PLAN_phone P6 (2.54.0; it was components/desktop/taskOps.ts, which re-exports it).
// A legacy phone Brain Dump item is shown as a task-shaped row; its first edit converts it into a real
// Task in place (lib/dumpConvert.ts), after which the list shows the Task and the item is gone.
export interface TaskOps {
  patch(fields: Partial<Task>): Promise<void>;
  // The same change for THIS day only (a move out of a break, Do during a break): on a repeating task it never
  // reaches the other days (except the first time of a series, 3.20.0); on any other task it is patch.
  patchDay(fields: Partial<Task>): Promise<void>;
  setCompleted(done: boolean): Promise<void>;
  // One time of a task that happens several times a day (Part C).
  setTimeDone(time: string, done: boolean): Promise<void>;
  toggleSubtask(subtaskId: string): Promise<void>;
  remove(): Promise<void>;
  // Repeating tasks only (decision 023): the actions of the overflow menu.
  series?: SeriesOps;
}

export interface SeriesOps {
  // The card is a projected occurrence (not stored yet): its edits apply to
  // the whole series and ticking stores that day.
  projected: boolean;
  skipDay(): Promise<void>;
  deleteSeries(): Promise<void>;
}

// A stored task. A repeating one also gets the series actions, and setting it
// to "Does not repeat" ends the whole series (every row of its root). A new time
// or length from here changes every repeat day without a time of its own (3.20.0, seriesTime.ts).
export function opsForTask(task: Task): TaskOps {
  const repeating = !!task.recurrence;
  return {
    patch: (fields) =>
      repeating && 'recurrence' in fields && fields.recurrence === undefined
        ? endSeries(task, fields)
        : repeating && movesOneDay(task, fields)
          ? moveDay(task, fields.dueDate as string, withoutDay(fields)).then(() => undefined)
          : repeating && isTimeEdit(fields)
            ? editRepeatingTime(task, false, fields, 'panel').then(() => undefined)
            : patchTask(task.id, fields),
    patchDay: (fields) =>
      repeating && movesOneDay(task, fields)
        ? moveDay(task, fields.dueDate as string, withoutDay(fields)).then(() => undefined)
        : repeating && isTimeEdit(fields)
          ? editRepeatingTime(task, false, fields, 'day').then(() => undefined)
          : patchTask(task.id, fields),
    setCompleted: (done) => completeTaskById(task.id, done),
    setTimeDone: (time, done) => setTimeDoneById(task.id, time, done),
    toggleSubtask: (sid) => toggleSubtaskById(task.id, sid),
    remove: () => deleteTask(task.id),
    ...(repeating
      ? { series: { projected: false, skipDay: () => skipOccurrence(task), deleteSeries: () => deleteSeries(task) } }
      : {}),
  };
}

// A new Day for a stored day of a repeating task, with its rule left alone, moves
// that day only (3.1.0, seriesActions.moveDay): the first row's day becomes a
// moved occurrence, so the series' own day is skipped rather than lost. A Day
// set together with a repeat change (the Repeat editor lining the start up with
// the chosen weekdays) is a series edit and stays a plain patch.
const RULE_KEYS = ['recurrence', 'recurrenceDays', 'recurrenceMonthDay'] as const;
export function movesOneDay(task: Task, fields: Partial<Task>): boolean {
  return isDateKey(fields.dueDate) && fields.dueDate !== task.dueDate && !RULE_KEYS.some((k) => k in fields);
}
export function withoutDay(fields: Partial<Task>): Partial<Task> {
  const { dueDate: _day, ...rest } = fields;
  return rest;
}

// A projected occurrence of a repeating series (lib/series.ts): edits go to the
// series template, ticking stores that day's occurrence, "Skip this day" writes
// a tombstone and "Delete repeating task" ends the series.
// A new Day moves that day only (stored first, 3.2.0), as on a stored day. A new
// time or length goes to every repeat day without a time of its own (3.20.0, seriesActions.editRepeatingTime).
export function opsForProjected(task: Task): TaskOps {
  return {
    patch: (fields) =>
      movesOneDay(task, fields)
        ? moveDay(task, fields.dueDate as string, withoutDay(fields)).then(() => undefined)
        : isTimeEdit(fields)
          ? editRepeatingTime(task, true, fields, 'panel').then(() => undefined)
          : patchSeries(task, fields),
    patchDay: (fields) =>
      movesOneDay(task, fields)
        ? moveDay(task, fields.dueDate as string, withoutDay(fields)).then(() => undefined)
        : isTimeEdit(fields)
          ? editRepeatingTime(task, true, fields, 'day').then(() => undefined)
          : patchSeries(task, fields),
    setCompleted: (done) => completeProjected(task, done),
    setTimeDone: (time, done) => tickTimeProjected(task, time, done),
    toggleSubtask: (sid) => toggleProjectedSubtask(task, sid),
    remove: () => skipOccurrence(task),
    series: { projected: true, skipDay: () => skipOccurrence(task), deleteSeries: () => deleteSeries(task) },
  };
}

export function opsForDump(item: BrainDumpItem): TaskOps {
  return {
    patch: async (fields) => void (await editDumpItem(item, fields)),
    patchDay: async (fields) => void (await editDumpItem(item, fields)),
    setCompleted: async (done) =>
      void (await editDumpItem(item, { completed: done, completedAt: done ? new Date().toISOString() : undefined })),
    setTimeDone: async () => {},
    // A legacy item has no subtasks until its first edit converts it.
    toggleSubtask: async () => {},
    remove: () => deleteBrainDumpItem(item.id),
  };
}

// The task shape a dump row is drawn with (never stored).
export function dumpAsTask(item: BrainDumpItem): Task {
  return dumpItemToTask(item, `dump:${item.id}`, item.updatedAt);
}
