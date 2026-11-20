// The hours strip of the phone's Today, per label (PLAN_phone_stepflow section 2, decision B1.4, 3.60.0). Pure: NO
// runtime imports besides siblings; see labelHours.test.ts.
//
//  * Counted: today's tasks done and planned both (the day's plan does not shrink as you tick), the estimate of
//    taskTotals (a break counts nothing, a reminder never counts, a task with no length counts 0, every time of a task
//    with several times), less the free time cut out of a task and the blocks inside a longer one (a shift counts once,
//    whatever labels its blocks have).
//  * One part per label, longest first; tasks with no label (or a deleted one) are one "No label" part.
//  * "Count in daily hours": a user_settings row `hours.count.<labelKey>` = `on` or `off` (no database change). With no
//    row, a label named Sleep or Break (trimmed, any case) is off, every other label is on. A label switched off is left
//    out of the strip and its total; its tasks still show on the timeline.
import type { Project, Task } from './types.ts';
import { estimateOf } from './taskTotals.ts';
import { timesCount } from './times.ts';
import { isQuickReminder } from './quickReminder.ts';
import { nestedMinutesBy } from './nesting.ts';
import { gapMinutes } from './hosting.ts';
import { DEFAULT_CUT_MIN } from './cuts.ts';

export const HOURS_COUNT_PREFIX = 'hours.count.';
export const NO_LABEL = 'No label';
const OFF_BY_DEFAULT = ['sleep', 'break'];

export function hoursCountKey(labelKey: string): string {
  return `${HOURS_COUNT_PREFIX}${labelKey}`;
}

// The label counts in the daily hours: the stored switch, or the default by name.
export function countsInHours(label: Pick<Project, 'name'>, stored: string | null | undefined): boolean {
  if (stored === 'on') return true;
  if (stored === 'off') return false;
  return !OFF_BY_DEFAULT.includes(label.name.trim().toLowerCase());
}

export interface HoursPart {
  // The label's key, '' for No label.
  key: string;
  name: string;
  emoji?: string;
  colorKey?: string;
  minutes: number;
}

export function labelHours(input: { tasks: Task[]; labels: Project[]; stored: ReadonlyMap<string, string>; cutMin?: number }): { parts: HoursPart[]; total: number } {
  const cutMin = input.cutMin ?? DEFAULT_CUT_MIN;
  const live = new Map(input.labels.filter((l) => !l.deletedAt).map((l) => [l.key, l]));
  const tasks = input.tasks.filter((t) => !t.deletedAt);
  const nested = nestedMinutesBy(tasks, cutMin);
  const groups = new Map<string, Task[]>();
  for (const t of tasks) {
    if (t.cutsBelow || isQuickReminder(t)) continue;
    const key = t.projectKey && live.has(t.projectKey) ? t.projectKey : '';
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const parts: HoursPart[] = [];
  for (const [key, group] of groups) {
    const label = key ? live.get(key) : undefined;
    if (label && !countsInHours(label, input.stored.get(key))) continue;
    let minutes = 0;
    for (const t of group) minutes += estimateOf(t) * timesCount(t) - (nested.get(t) ?? 0);
    minutes -= gapMinutes(group, cutMin, tasks);
    if (minutes <= 0) continue;
    parts.push({ key, name: label ? label.name : NO_LABEL, ...(label?.emoji ? { emoji: label.emoji } : {}), ...(label?.colorKey ? { colorKey: label.colorKey } : {}), minutes });
  }
  parts.sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name));
  return { parts, total: parts.reduce((m, p) => m + p.minutes, 0) };
}
