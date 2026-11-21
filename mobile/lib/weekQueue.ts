// Plan week on the phone (PLAN_phone_parity phase 9, 3.65.0): the tasks to place on a day of the week, one at a time:
// the ones left from last week first (Earlier), then Brain Dump, then each list. Pure: NO runtime imports besides
// siblings; see weekQueue.test.ts. The days and the rule that a day takes a task only from today on are the desktop's
// (planEntry.weekToPlan, planDay.dayOpen); the writes are wrapActions.ts, put together in weekPhoneActions.ts.
import type { Task, TaskList } from './types.ts';
import { earlierItems, type WrapItem } from './wrapUp.ts';
import { addRows, dayOpen, dayTotalText } from './planDay.ts';
import { liveLists } from './lists.ts';
import { WEEKDAYS, parseDateKey } from './kanban.ts';

export type WeekSource = 'earlier' | 'list';
export interface WeekStep {
  item: WrapItem;
  source: WeekSource;
}

export function weekQueue(raw: Task[], todayKey: string, lists: TaskList[]): WeekStep[] {
  const seen = new Set<string>();
  const out: WeekStep[] = [];
  const add = (items: WrapItem[], source: WeekSource) => {
    for (const item of items) {
      const id = item.task.id;
      if (seen.has(id) || item.task.cutsBelow) continue;
      seen.add(id);
      out.push({ item, source });
    }
  };
  add(earlierItems(raw, todayKey), 'earlier');
  add(addRows(raw, undefined, lists), 'list');
  for (const l of liveLists(lists)) add(addRows(raw, l.key, lists), 'list');
  return out;
}

// The days a task can be placed on: only from today on.
export const openDays = (days: string[], todayKey: string): string[] => days.filter((d) => dayOpen(d, todayKey));

// "Mon 23"
export function dayButton(key: string): string {
  const d = parseDateKey(key);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}`;
}

// "Mon 2h 30m · Tue 1h · Wed none": each day's planned total (a shift counts once).
export function weekFigure(raw: Task[], days: string[], todayKey: string, cutMin: number, nowMs: number): string {
  return days.map((d) => `${WEEKDAYS[parseDateKey(d).getDay()]} ${dayTotalText(raw, d, todayKey, cutMin, nowMs).replace('—', 'none')}`).join(' · ');
}

export function weekText(day: string, title: string): string {
  return day === 'skip' ? `Left for now: ${title}` : `${dayButton(day)}: ${title}`;
}
