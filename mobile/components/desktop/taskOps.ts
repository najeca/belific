import { completeTaskById, editDumpItem, patchTask, toggleSubtaskById } from '../../lib/taskActions';
import { deleteBrainDumpItem, deleteTask } from '../../lib/storage';
import { taskTimer } from '../../lib/taskTimer';
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
}

export function opsForTask(task: Task): TaskOps {
  return {
    patch: (fields) => patchTask(task.id, fields),
    setCompleted: (done) => completeTaskById(task.id, done),
    toggleSubtask: (sid) => toggleSubtaskById(task.id, sid),
    // A deleted task's timer stops with it, nothing added.
    remove: async () => {
      await deleteTask(task.id);
      await taskTimer.discard(task.id);
    },
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
