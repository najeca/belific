// Search over tasks (build plan phase 3, Ctrl+K). Pure: NO runtime imports
// besides siblings; see taskSearch.test.ts. Case and accent insensitive, every
// word of the query must be found somewhere in the title, notes, subtasks,
// label name or list name. Title matches rank first.
import type { Project, Task, TaskList } from './types.ts';

export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export interface SearchHit {
  task: Task;
  score: number;
}

export const SEARCH_LIMIT = 30;

export function searchTasks(
  tasks: Task[],
  labels: Array<Pick<Project, 'key' | 'name'>>,
  lists: Array<Pick<TaskList, 'key' | 'name'>>,
  query: string,
  limit = SEARCH_LIMIT,
): SearchHit[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const hits: SearchHit[] = [];
  for (const task of tasks) {
    if (task.deletedAt) continue;
    const title = fold(task.title);
    const other = fold(
      [
        task.notes ?? '',
        ...(task.subtasks ?? []).map((s) => s.title),
        labels.find((l) => l.key === task.projectKey)?.name ?? '',
        lists.find((l) => l.key === task.listKey)?.name ?? '',
      ].join(' \n '),
    );
    if (!words.every((w) => title.includes(w) || other.includes(w))) continue;
    let score = 1;
    if (words.every((w) => title.includes(w))) score = 2;
    if (title.startsWith(words[0])) score = 3;
    hits.push({ task, score });
  }
  hits.sort(
    (a, b) =>
      b.score - a.score ||
      Number(a.task.completed) - Number(b.task.completed) ||
      (a.task.dueDate ?? '9999').localeCompare(b.task.dueDate ?? '9999') ||
      b.task.createdAt.localeCompare(a.task.createdAt) ||
      a.task.id.localeCompare(b.task.id),
  );
  return hits.slice(0, limit);
}
