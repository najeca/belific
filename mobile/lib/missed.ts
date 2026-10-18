// The Missed list (2.27.0, item 6): what was planned for a day before today and
// is not done. Computed from the stored rows every time; nothing is stored for it
// and nothing here moves a date. Pure: NO runtime imports besides siblings; see
// missed.test.ts.
//
// Two kinds:
//  - a one off task: a Day before today, not completed, not deleted, not a row
//    of a repeating series. It can go to today, tomorrow, a picked day, or have
//    its Day dropped (it stays in its list).
//  - a day of a repeating series (a gym day) in the last MISSED_LOOKBACK_DAYS
//    days that is not done and not skipped: a stored open occurrence, or a day
//    the series was only ever shown for. It is never moved: Skip writes the
//    usual skip tombstone (neutral for the streak), and Do it today makes a new
//    one off task for today (the series day itself stays not done).
// Must do first, then the oldest day first, then by title.
import type { Task } from './types.ts';
import { addDays, dateKey, isDateKey, parseDateKey } from './kanban.ts';
import { groupByRoot, idDate, occurrenceFromTemplate, occursOn, seriesOfRows } from './series.ts';
import { isSeriesRow } from './rollover.ts';
import { isMustDo } from './mustDo.ts';

export const MISSED_LOOKBACK_DAYS = 7;

export interface MissedItem {
  kind: 'task' | 'occurrence';
  // For an occurrence: the stored open row, or the day built from the template
  // (never written by being listed).
  task: Task;
  day: string;
  stored: boolean;
}

export function isMissedTask(t: Task, todayKey: string): boolean {
  return !t.deletedAt && !t.completed && isDateKey(t.dueDate) && t.dueDate < todayKey && !isSeriesRow(t);
}

export function missedItems(tasks: Task[], todayKey: string, lookback = MISSED_LOOKBACK_DAYS): MissedItem[] {
  const out: MissedItem[] = [];
  for (const t of tasks) if (isMissedTask(t, todayKey)) out.push({ kind: 'task', task: t, day: t.dueDate as string, stored: true });

  const from = dateKey(addDays(parseDateKey(todayKey), -lookback));
  for (const [root, rows] of groupByRoot(tasks)) {
    const series = seriesOfRows(root, rows);
    if (!series) continue;
    // Stored open rows of the series on a past day (a skip tombstone is deleted).
    for (const r of rows) {
      const day = isDateKey(r.dueDate) ? r.dueDate : idDate(r.id);
      if (!day || r.deletedAt || r.completed || day >= todayKey || day < from) continue;
      out.push({ kind: 'occurrence', task: r, day, stored: true });
    }
    // Days the series was due but has no row at all (shown, never stored).
    for (let d = from; d < todayKey; d = dateKey(addDays(parseDateKey(d), 1))) {
      if (d < series.startKey || series.taken.has(d)) continue;
      if (occursOn(series.template, d, series.anchorKey)) out.push({ kind: 'occurrence', task: occurrenceFromTemplate(series.template, d, series.template.updatedAt), day: d, stored: false });
    }
  }
  return out.sort(
    (a, b) => Number(isMustDo(b.task)) - Number(isMustDo(a.task)) || a.day.localeCompare(b.day) || a.task.title.localeCompare(b.task.title) || a.task.id.localeCompare(b.task.id),
  );
}

// The one off tasks only (what "Move all to today" moves).
export function missedOneOffs(tasks: Task[], todayKey: string): Task[] {
  return missedItems(tasks, todayKey).filter((m) => m.kind === 'task').map((m) => m.task);
}

// "Do it today" on a missed day of a series: a plain task for today with the
// series' name, emoji, label, estimate, notes and steps (unticked), and no
// repeat, so it never joins the series or its streak.
export function doTodayCopy(occ: Task, id: string, todayKey: string, nowIso: string, newSubId: () => string): Task {
  const copy: Task = { id, title: occ.title, completed: false, createdAt: nowIso, updatedAt: nowIso, dueDate: todayKey };
  if (occ.emoji) copy.emoji = occ.emoji;
  if (occ.projectKey) copy.projectKey = occ.projectKey;
  if (occ.durationMinutes !== undefined) copy.durationMinutes = occ.durationMinutes;
  if (occ.notes) copy.notes = occ.notes;
  if (occ.priority) copy.priority = occ.priority;
  if (occ.listKey) copy.listKey = occ.listKey;
  if (occ.subtasks && occ.subtasks.length > 0) copy.subtasks = occ.subtasks.map((s) => ({ id: newSubId(), title: s.title, done: false }));
  return copy;
}
