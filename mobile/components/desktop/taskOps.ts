import { completeTaskById, editDumpItem, patchTask, toggleSubtaskById } from '../../lib/taskActions';
import {
  completeProjected,
  deleteSeries,
  endSeries,
  patchSeries,
  skipOccurrence,
  toggleProjectedSubtask,
} from '../../lib/seriesActions';
import { deleteBrainDumpItem, deleteTask } from '../../lib/storage';
import { dumpItemToTask } from '../../lib/thoughts';
import type { BrainDumpItem, Task } from '../../lib/types';

// What a card (or a Timebox block popover) can do to its task. A legacy phone
// Brain Dump item is shown as a task-shaped row; its first edit converts it
// into a real Task in place (lib/dumpConvert.ts), after which the list shows
// the Task and the item is gone.
export interface TaskOps {
  patch(fields: Partial<Task>): Promise<void>;
  setCompleted(done: boolean): Promise<void>;
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
// to "Does not repeat" ends the whole series (every row of its root).
export function opsForTask(task: Task): TaskOps {
  const repeating = !!task.recurrence;
  return {
    patch: (fields) =>
      repeating && 'recurrence' in fields && fields.recurrence === undefined
        ? endSeries(task, fields)
        : patchTask(task.id, fields),
    setCompleted: (done) => completeTaskById(task.id, done),
    toggleSubtask: (sid) => toggleSubtaskById(task.id, sid),
    remove: () => deleteTask(task.id),
    ...(repeating
      ? { series: { projected: false, skipDay: () => skipOccurrence(task), deleteSeries: () => deleteSeries(task) } }
      : {}),
  };
}

// A projected occurrence of a repeating series (lib/series.ts): edits go to the
// series template, ticking stores that day's occurrence, "Skip this day" writes
// a tombstone and "Delete repeating task" ends the series.
export function opsForProjected(task: Task): TaskOps {
  return {
    patch: (fields) => patchSeries(task, fields),
    setCompleted: (done) => completeProjected(task, done),
    toggleSubtask: (sid) => toggleProjectedSubtask(task, sid),
    remove: () => skipOccurrence(task),
    series: { projected: true, skipDay: () => skipOccurrence(task), deleteSeries: () => deleteSeries(task) },
  };
}

export function opsForDump(item: BrainDumpItem): TaskOps {
  return {
    patch: async (fields) => void (await editDumpItem(item, fields)),
    setCompleted: async (done) =>
      void (await editDumpItem(item, { completed: done, completedAt: done ? new Date().toISOString() : undefined })),
    // A legacy item has no subtasks until its first edit converts it.
    toggleSubtask: async () => {},
    remove: () => deleteBrainDumpItem(item.id),
  };
}

// The task shape a dump row is drawn with (never stored).
export function dumpAsTask(item: BrainDumpItem): Task {
  return dumpItemToTask(item, `dump:${item.id}`, item.updatedAt);
}
