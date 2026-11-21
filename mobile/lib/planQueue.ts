// Plan my day on the phone (PLAN_phone_stepflow section 3, 3.62.0): the tasks to ask about, in order, and the answers a
// task offers. Pure: NO runtime imports besides siblings; see planQueue.test.ts. The writes are the desktop's
// (wrapActions.ts), put together in planActions.ts.
//   1. today's tasks with no time, 2. the Earlier tasks, 3. the tasks with no Day: Brain Dump, then each list.
// A task already timed on today is not asked about; no task is asked twice.
import type { Task, TaskList } from './types.ts';
import { dayItems, earlierItems, type WrapItem } from './wrapUp.ts';
import { addRows, repeatingNotToday } from './planDay.ts';
import { liveLists } from './lists.ts';

export type PlanSource = 'today' | 'earlier' | 'list';
export interface PlanStep {
  item: WrapItem;
  source: PlanSource;
}

export type PlanAnswer = 'today' | 'tomorrow' | 'time' | 'notToday';

// D6 of PLAN_desktop_parity (3.68.0): which tasks Plan my day shows, for both apps. The phone asks them one at a time
// (planQueue); the desktop's one screen shows the same sets in columns (On today, Add to today per list, Earlier).
// `dayKey` is the day planned, `todayKey` the real today (the desktop fixes the day when the screen opens).
export const planTodayItems = (raw: Task[], dayKey: string, todayKey: string, cutMin: number): WrapItem[] => dayItems(raw, dayKey, todayKey, cutMin);
export const planEarlierItems = (raw: Task[], todayKey: string): WrapItem[] => earlierItems(raw, todayKey);
// One list's tasks with no Day (undefined: Brain Dump), a part offered with its parent only.
export const planListItems = (raw: Task[], listKey: string | undefined, lists: TaskList[]): WrapItem[] => addRows(raw, listKey, lists);
// Desktop only: the repeating tasks whose next day is not today (the phone does not offer them).
export const planRepeatingItems = (raw: Task[], todayKey: string): WrapItem[] => repeatingNotToday(raw, todayKey);

export function planQueue(raw: Task[], todayKey: string, lists: TaskList[], cutMin: number): PlanStep[] {
  const seen = new Set<string>();
  const out: PlanStep[] = [];
  const add = (items: WrapItem[], source: PlanSource) => {
    for (const item of items) {
      const id = item.task.id;
      if (seen.has(id) || item.task.cutsBelow) continue;
      seen.add(id);
      out.push({ item, source });
    }
  };
  add(
    planTodayItems(raw, todayKey, todayKey, cutMin).filter((i) => !i.done && !i.row && !i.task.startTime && !i.inside),
    'today',
  );
  add(planEarlierItems(raw, todayKey), 'earlier');
  add(planListItems(raw, undefined, lists), 'list');
  for (const l of liveLists(lists)) add(planListItems(raw, l.key, lists), 'list');
  return out;
}

// What a task offers: a repeating day never goes to another day this way (it has Not today, which skips that day).
export function answersFor(step: PlanStep): PlanAnswer[] {
  return step.item.series ? ['today', 'time', 'notToday'] : ['today', 'tomorrow', 'time', 'notToday'];
}

export const ANSWER_LABEL: Record<PlanAnswer, string> = { today: 'Today', tomorrow: 'Tomorrow', time: 'A time', notToday: 'Not today' };

// The line an answer leaves in the summary and the Undo bar.
export function answerText(answer: PlanAnswer, title: string, time?: string): string {
  if (answer === 'time') return `${time ? `At ${time}` : 'At a time'}: ${title}`;
  return `${ANSWER_LABEL[answer]}: ${title}`;
}

export const progressText = (index: number, total: number): string => `${Math.min(index + 1, total)} of ${total}`;

// A 24 hour "HH:MM" (or "H:MM", "HHMM") read as a time of day; null when it is not one.
export function readTime(text: string): string | null {
  const m = /^(\d{1,2}):?(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}
