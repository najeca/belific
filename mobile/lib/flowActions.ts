// Wrap up and Plan week on the phone (3.65.0): what each answer writes. Every write is the desktop's (wrapActions.ts), never
// a phone copy. Plan my day's writes are planActions.ts.
import { wrapLetGo, wrapMove, wrapParts, wrapSteps, wrapTick, wrapToList, addToday } from './wrapActions';
import type { WrapItem } from './wrapUp';
import type { WrapAnswer } from './wrapQueue';
import type { WeekSource } from './weekQueue';

export async function runWrapAnswer(item: WrapItem, answer: WrapAnswer, tomorrowKey: string): Promise<void> {
  if (answer === 'done') await wrapTick(item);
  else if (answer === 'tomorrow') await wrapMove(item, tomorrowKey);
  else if (answer === 'list') await wrapToList(item);
  else if (answer === 'steps') await wrapSteps(item, tomorrowKey);
  else if (answer === 'parts') await wrapParts(item, tomorrowKey);
  else await wrapLetGo(item);
}

// A task from Earlier moves to the day (its time kept); a task from a list gets the day with no time.
export async function runWeekAnswer(item: WrapItem, source: WeekSource, day: string): Promise<void> {
  if (source === 'earlier') await wrapMove(item, day);
  else await addToday(item, day);
}
