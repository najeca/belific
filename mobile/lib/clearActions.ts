// F2 of PLAN_daily_flow: what a Clear writes (the rules are in clear.ts). ONE gesture: the one off tasks in one batch
// save (storage.updateTasks), then each repeating task's own write, so one Ctrl+Z restores everything.
import type { Task } from './types';
import { loadTasksRaw, updateTasks } from './storage';
import { deleteSeries, endBefore, endSeries, skipOccurrence } from './seriesActions';
import { patchTask } from './taskActions';
import { opsForProjected, opsForTask } from './taskOps';
import { rootTaskId } from './recurrence';
import { stack } from './undoStack';
import { partsOf } from './parts';
import { deleteSeriesWithParts } from './partActions';
import { oneOffRows, planClear, type ClearMode, type ClearScope, type ClearTarget } from './clear';

export async function runClear(target: ClearTarget, mode: ClearMode, scope: ClearScope, todayKey: string): Promise<number> {
  stack.markGesture();
  // Planned again from the rows as they are now (another device may have changed them since the question was shown).
  const plan = planClear(await loadTasksRaw(), target, todayKey, mode);
  await updateTasks(oneOffRows(plan, mode, new Date().toISOString()));
  const done = new Set<string>();
  for (const it of plan.items) {
    if (!it.series) continue;
    const root = rootTaskId(it.task.id);
    if (mode === 'off') {
      if (done.has(root)) continue;
      done.add(root);
      // A label is shared by every day of a series (seriesWide.ts).
      await (it.projected ? opsForProjected(it.task) : opsForTask(it.task)).patch({ projectKey: undefined });
      continue;
    }
    if (scope === 'day') {
      // Day, week: that day of the series. List, label: its next day.
      const day = target.kind === 'day' || target.kind === 'week' || it.inside ? it.task : it.next?.task;
      if (day) await skipOccurrence(day);
      continue;
    }
    if (done.has(root)) continue;
    done.add(root);
    if (scope === 'following' && (target.kind === 'day' || target.kind === 'week')) {
      // The first day of the target this series falls on (items come in day order): it and every later day are hidden.
      const first = plan.items
        .filter((x) => x.series && rootTaskId(x.task.id) === root && x.task.dueDate)
        .map((x) => x.task.dueDate as string)
        .sort()[0];
      if (first) await endBefore(it.task, first);
      continue;
    }
    if (mode === 'trash') {
      // R5: a series with parts goes with them (the parts' templates to the Trash too, not left as loose tasks).
      if (partsOf(await loadTasksRaw(), root).length > 0) await deleteSeriesWithParts(it.task, 'all');
      else await deleteSeries(it.task);
      continue;
    }
    // All days, back to the list: the series stops repeating, and its latest open row loses its Day and time.
    await endSeries(it.task);
    const latest = (await loadTasksRaw())
      .filter((r: Task) => rootTaskId(r.id) === root && !r.deletedAt && !r.completed)
      .sort((a, b) => (b.dueDate ?? '').localeCompare(a.dueDate ?? ''))[0];
    if (latest) await patchTask(latest.id, { dueDate: undefined, startTime: undefined, extraTimes: undefined, timesDone: undefined });
  }
  return plan.count;
}
