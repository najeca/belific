// Which tasks a day's Timebox draws (checkpoint 8.4, decisions 023 and 024).
// Pure, NO runtime imports besides siblings; see timeboxTasks.test.ts.
//
// A task belongs to the Day it starts on. For one Day the Timebox draws:
//  - `own`: the stored tasks of that Day plus the projected occurrences of
//    repeating series that fall on it;
//  - `spill`: tasks of the PREVIOUS Day (stored or projected) that run past
//    24:00, so their rest is drawn at the top as "Continues from yesterday".
// The spill is derived every time, never stored. Projected occurrences are
// never in the past, with one exception that is display only: today's early
// hours show the rest of yesterday's overnight routine even when yesterday's
// occurrence was only ever projected, so a night shift does not look empty.
import type { Task } from './types.ts';
import { addDays, dateKey, parseDateKey } from './kanban.ts';
import { projectOccurrences } from './series.ts';
import { continuationOf } from './timebox.ts';

export interface DayTask {
  task: Task;
  projected: boolean;
}

export function tasksForTimebox(tasks: Task[], dayKey: string, todayKey: string): { own: DayTask[]; spill: DayTask[] } {
  const prevKey = dateKey(addDays(parseDateKey(dayKey), -1));
  const own: DayTask[] = [];
  const spill: DayTask[] = [];
  for (const t of tasks) {
    if (t.deletedAt) continue;
    if (t.dueDate === dayKey) own.push({ task: t, projected: false });
    else if (t.dueDate === prevKey && continuationOf(t)) spill.push({ task: t, projected: false });
  }
  const floor = dayKey === todayKey ? prevKey : todayKey;
  for (const t of projectOccurrences(tasks, [dayKey, prevKey], todayKey, { minKey: floor })) {
    if (t.dueDate === dayKey) own.push({ task: t, projected: true });
    else if (continuationOf(t)) spill.push({ task: t, projected: true });
  }
  return { own, spill };
}
