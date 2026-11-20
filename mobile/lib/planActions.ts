// Plan my day on the phone (3.62.0): what each answer writes. Every write is the desktop's (wrapActions.ts, taskOps.ts),
// never a phone copy. Returns a sentence when a write is refused (a time that does not fit a break), else null.
import type { Task } from './types';
import { addToday, notToday, wrapMove } from './wrapActions';
import { opsForProjected, opsForTask } from './taskOps';
import { breakRefusal } from './hostActions';
import { timePatch } from './detailsPatches';
import { taskDuration } from './drag';
import type { PlanAnswer, PlanStep } from './planQueue';
import { isUnstartedSeriesDay, UNSTARTED_NOTE } from './planGuard';
import { loadTasksRaw } from './storage';

export async function runPlanAnswer(step: PlanStep, answer: PlanAnswer, todayKey: string, tomorrowKey: string, time?: string): Promise<string | null> {
  const { item, source } = step;
  const task = item.task;
  if (answer === 'today') {
    if (source === 'earlier') await wrapMove(item, todayKey);
    else if (source === 'list') await addToday(item, todayKey);
    return null;
  }
  if (answer === 'tomorrow') {
    await wrapMove(item, tomorrowKey);
    return null;
  }
  if (answer === 'notToday') {
    // A task still in its list has nothing to take off today: it is left as it is.
    if (item.series && isUnstartedSeriesDay(await loadTasksRaw(), task)) return UNSTARTED_NOTE;
    if (source !== 'list') await notToday(item);
    return null;
  }
  if (!time) return 'Choose a time.';
  const res = timePatch(task, time);
  if ('note' in res) return res.note;
  const fields: Partial<Task> = { ...res.fields };
  // The length is kept; a task with none gets the default (the one the Timebox gives a dropped task).
  if (task.durationMinutes === undefined) fields.durationMinutes = taskDuration(task);
  if (!item.series && task.dueDate !== todayKey) fields.dueDate = todayKey;
  const refused = await breakRefusal(task, { ...fields, dueDate: fields.dueDate ?? task.dueDate ?? todayKey }, 'details');
  if (refused) return refused;
  const ops = item.projected ? opsForProjected(task) : opsForTask(task);
  // A repeating day takes its time for this day only.
  await (item.series ? ops.patchDay(fields) : ops.patch(fields));
  return null;
}
