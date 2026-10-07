// Fields that no longer exist on a Task. Checkpoint 8.3 stored actualSeconds
// locally; 2.14.0 removed Actual time (decision 022 is superseded), so a
// stored task that still carries it is cleaned when it is loaded. NO runtime
// imports so `node --test` can run it; see legacyTask.test.ts.
import type { Task } from './types.ts';

export function stripLegacyTaskFields(task: Task): Task {
  if (!task || typeof task !== 'object' || !('actualSeconds' in task)) return task;
  const { actualSeconds: _removed, ...rest } = task as Task & { actualSeconds?: unknown };
  return rest as Task;
}

export function stripLegacyTasks(tasks: Task[]): Task[] {
  return Array.isArray(tasks) ? tasks.map(stripLegacyTaskFields) : [];
}
