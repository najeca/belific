// Board filter (checkpoint 8.2, decision 021). UI state only: remembered in the
// main process store, never synced. Pure; see taskFilter.test.ts.
import type { Task } from './types.ts';

export interface TaskFilter {
  // Label keys that are ticked (multi select).
  labels: string[];
  // The "No label" row.
  noLabel: boolean;
  // Completed tasks are hidden unless this is on.
  showComplete: boolean;
}

export const EMPTY_FILTER: TaskFilter = { labels: [], noLabel: false, showComplete: false };
export const FILTER_KEY = 'belific_desktop_filter';

// The number shown on the button: ticked labels, "No label" and "Show complete".
export function filterCount(f: TaskFilter): number {
  return f.labels.length + (f.noLabel ? 1 : 0) + (f.showComplete ? 1 : 0);
}

// Label part only. With nothing ticked every task matches.
export function matchesLabels(task: Pick<Task, 'projectKey'>, f: TaskFilter): boolean {
  if (f.labels.length === 0 && !f.noLabel) return true;
  if (!task.projectKey) return f.noLabel;
  return f.labels.includes(task.projectKey);
}

// What the board, the left list and the Timebox show. Events are not tasks and
// never go through this.
export function taskVisible(task: Pick<Task, 'projectKey' | 'completed'>, f: TaskFilter): boolean {
  return matchesLabels(task, f) && (f.showComplete || !task.completed);
}

export function filterTasks<T extends Pick<Task, 'projectKey' | 'completed'>>(tasks: T[], f: TaskFilter): T[] {
  return tasks.filter((t) => taskVisible(t, f));
}

export function toggleLabel(f: TaskFilter, key: string): TaskFilter {
  return { ...f, labels: f.labels.includes(key) ? f.labels.filter((k) => k !== key) : [...f.labels, key] };
}

// A label that was deleted since the filter was saved no longer counts.
export function pruneFilter(f: TaskFilter, existingKeys: string[]): TaskFilter {
  const labels = f.labels.filter((k) => existingKeys.includes(k));
  return labels.length === f.labels.length ? f : { ...f, labels };
}

export function parseFilter(raw: string | null): TaskFilter {
  if (!raw) return EMPTY_FILTER;
  try {
    const o = JSON.parse(raw) as Partial<TaskFilter>;
    return {
      labels: Array.isArray(o.labels) ? o.labels.filter((k): k is string => typeof k === 'string').slice(0, 100) : [],
      noLabel: o.noLabel === true,
      showComplete: o.showComplete === true,
    };
  } catch {
    return EMPTY_FILTER;
  }
}

export function serializeFilter(f: TaskFilter): string {
  return JSON.stringify(f);
}
