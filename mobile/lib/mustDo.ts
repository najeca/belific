// Must do (2.27.0): one switch over the existing priority field, no new column.
// On stores priority 'high'; off goes back to what a new task has, which is no
// priority at all (absent means normal, see EventPriority in types.ts). Any task
// already stored as high counts as Must do. Pure: NO runtime imports; see
// mustDo.test.ts. Sync is unchanged (the priority column, as before).
import type { Task } from './types.ts';

export function isMustDo(task: Pick<Task, 'priority'>): boolean {
  return task.priority === 'high';
}

// The fields to write for the switch.
export function mustDoPatch(on: boolean): Pick<Task, 'priority'> {
  return { priority: on ? 'high' : undefined };
}

// Must do first, keeping the given order otherwise (a stable sort).
export function mustDoFirst<T extends Pick<Task, 'priority'>>(tasks: T[]): T[] {
  return tasks.map((t, i) => [t, i] as const).sort((a, b) => Number(isMustDo(b[0])) - Number(isMustDo(a[0])) || a[1] - b[1]).map(([t]) => t);
}
