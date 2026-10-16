import { completeTaskById, patchTask } from './taskActions';
import { completeProjected, materialise, skipOccurrence } from './seriesActions';
import { ownDay } from './series';
import type { Task } from './types';

// What a quest card does (build plan phase 4), on the desktop and the iPhone.
// The rules are in quests.ts and series.ts; every write goes through the same
// series and task commands as a board card, so it is queued for sync like any
// other edit, and a quest and its card on the board are one row.
export interface QuestTarget {
  task: Task;
  stored: boolean;
}

// One tap: the target occurrence is stored (when it is still only projected)
// and completed.
export async function completeQuest(target: QuestTarget): Promise<void> {
  if (target.stored) await completeTaskById(target.task.id, true);
  else await completeProjected(target.task, true);
}

// The second tap on a done quest reopens the latest done occurrence of the period.
export async function reopenQuest(row: Task): Promise<void> {
  await completeTaskById(row.id, false);
}

// A planned skip: the existing "Skip this day" (a tombstoned occurrence), for
// the occurrence's own day. Neutral for the streak; it cannot be unskipped.
export async function skipQuest(target: QuestTarget): Promise<void> {
  const day = ownDay(target.task);
  if (!day) return;
  await skipOccurrence({ ...target.task, dueDate: day });
}

// Put the target occurrence on today's plan: it is stored (if needed) and its
// Day becomes today. Its id keeps its own day, so the rule and the streak are
// unchanged (series.ownDay). The caller checks quests.canPlanToday first.
export async function planQuestToday(target: QuestTarget, todayKey: string): Promise<Task | null> {
  const row = target.stored ? target.task : await materialise(target.task);
  if (!row) return null;
  if (row.dueDate !== todayKey) await patchTask(row.id, { dueDate: todayKey });
  return { ...row, dueDate: todayKey };
}

// Put it on today's Timebox at `startTime` (the next half hour, quests.nextHalfHour).
export async function timeboxQuestToday(target: QuestTarget, todayKey: string, startTime: string): Promise<void> {
  const row = await planQuestToday(target, todayKey);
  if (row) await patchTask(row.id, { startTime });
}
