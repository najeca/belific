// Analytics (build plan phase 6), worked out from the tasks already on the
// device: nothing is stored, nothing is sent. Pure: NO runtime imports besides
// siblings; see analytics.test.ts.
//
// A task counts on the day it was COMPLETED (completedAt, on the local calendar).
// There is no log of time spent per day, so a task's actual time is attributed
// to the day it was completed. A missing actual (NULL) is 0 everywhere
// (build plan section 0, item 8). Wording is neutral: more or fewer, never
// "behind" or "missed" (decision 027).
import type { BrainDumpItem, Project, Task, TaskList } from './types.ts';
import { addDays, dateKey, isDateKey, parseDateKey, weekStartOf } from './kanban.ts';
import { toCsv } from './csv.ts';
import { estimateOf } from './taskTotals.ts';
import { hostedEstimate } from './hosting.ts';
import { effectiveListKey } from './lists.ts';
import { formatClock } from './duration.ts';

export type RangeKey = 'workWeek' | 'last7' | 'last14' | 'lastMonth' | 'last3Months' | 'custom';

export const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: 'workWeek', label: 'Work week' },
  { key: 'last7', label: 'Last 7 days' },
  { key: 'last14', label: 'Last 14 days' },
  { key: 'lastMonth', label: 'Last month' },
  { key: 'last3Months', label: 'Last 3 months' },
  { key: 'custom', label: 'Custom' },
];

// Inclusive local date keys.
export interface DateRange {
  start: string;
  end: string;
}

export const MAX_CUSTOM_DAYS = 366;

// The date `months` months before `key`, on the same date number or the month's
// last day (31 Mar - 1 month = 28 Feb).
function monthsBack(key: string, months: number): string {
  const d = parseDateKey(key);
  const target = new Date(d.getFullYear(), d.getMonth() - months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return dateKey(new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), last)));
}

// Work week: Monday to Friday of this week. Last 7 and 14 days end today. Last
// month and last 3 months run from the day after the same date that many months
// ago, to today. Custom: the two dates given, swapped if reversed, at most a
// year long (the end is pulled in).
export function rangeFor(key: RangeKey, todayKey: string, custom?: { start?: string; end?: string }): DateRange {
  const today = parseDateKey(todayKey);
  switch (key) {
    case 'workWeek': {
      const mon = weekStartOf(today);
      return { start: dateKey(mon), end: dateKey(addDays(mon, 4)) };
    }
    case 'last7':
      return { start: dateKey(addDays(today, -6)), end: todayKey };
    case 'last14':
      return { start: dateKey(addDays(today, -13)), end: todayKey };
    case 'lastMonth':
      return { start: dateKey(addDays(parseDateKey(monthsBack(todayKey, 1)), 1)), end: todayKey };
    case 'last3Months':
      return { start: dateKey(addDays(parseDateKey(monthsBack(todayKey, 3)), 1)), end: todayKey };
    default: {
      let s = isDateKey(custom?.start) ? (custom!.start as string) : todayKey;
      let e = isDateKey(custom?.end) ? (custom!.end as string) : todayKey;
      if (s > e) [s, e] = [e, s];
      const max = dateKey(addDays(parseDateKey(s), MAX_CUSTOM_DAYS - 1));
      return { start: s, end: e > max ? max : e };
    }
  }
}

export function daysIn(r: DateRange): string[] {
  const out: string[] = [];
  for (let d = parseDateKey(r.start); dateKey(d) <= r.end; d = addDays(d, 1)) out.push(dateKey(d));
  return out;
}

// The period of the same length that ends the day before this one starts.
export function previousRange(r: DateRange): DateRange {
  const n = daysIn(r).length;
  const end = addDays(parseDateKey(r.start), -1);
  return { start: dateKey(addDays(end, -(n - 1))), end: dateKey(end) };
}

// ---- completed tasks ----

export function completedDay(t: Pick<Task, 'completed' | 'completedAt' | 'deletedAt'>): string | null {
  if (t.deletedAt || !t.completed || !t.completedAt) return null;
  const ms = Date.parse(t.completedAt);
  return Number.isNaN(ms) ? null : dateKey(new Date(ms));
}

export function completedIn(tasks: Task[], r: DateRange): Task[] {
  return tasks.filter((t) => {
    const d = completedDay(t);
    return d !== null && d >= r.start && d <= r.end;
  });
}

const act = (t: Pick<Task, 'actualMinutes'>): number => (typeof t.actualMinutes === 'number' && t.actualMinutes > 0 ? t.actualMinutes : 0);

// ---- cards ----

export interface CompletedCard {
  current: number;
  previous: number;
  // "12 completed, 4 more than the 7 days before" or '' when both are 0.
  text: string;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

export function compareText(current: number, previous: number, periodWord: string): string {
  if (current === 0 && previous === 0) return '';
  const head = `${current} ${plural(current, 'task', 'tasks')} completed`;
  const diff = current - previous;
  if (diff === 0) return `${head}, the same as ${periodWord}`;
  const n = Math.abs(diff);
  return `${head}, ${n} ${diff > 0 ? 'more' : 'fewer'} than ${periodWord}`;
}

export function completedCard(tasks: Task[], r: DateRange): CompletedCard {
  const current = completedIn(tasks, r).length;
  const previous = completedIn(tasks, previousRange(r)).length;
  const n = daysIn(r).length;
  return { current, previous, text: compareText(current, previous, `the ${n === 1 ? 'day' : `${n} days`} before`) };
}

export interface TimeCard {
  // Over the completed tasks that have an estimate.
  estimated: number;
  actual: number;
  withEstimate: number;
  withoutEstimate: number;
  text: string;
}

// 3.8.0: a done task inside a done break shares its estimated minutes with it; they count once unless
// "Count minutes done during a break twice" is on (`breakTwice`, lib/hosting.ts).
export function timeCard(tasks: Task[], r: DateRange, breakTwice = false): TimeCard {
  const done = completedIn(tasks, r);
  let estimated = 0;
  let actual = 0;
  let withEstimate = 0;
  for (const t of done) {
    const e = estimateOf(t);
    if (e > 0) {
      withEstimate += 1;
      estimated += e;
      actual += act(t);
    }
  }
  if (!breakTwice) estimated -= hostedEstimate(done);
  const withoutEstimate = done.length - withEstimate;
  const text = withEstimate === 0 ? '' : `${formatClock(actual)} spent of ${formatClock(estimated)} estimated`;
  return { estimated, actual, withEstimate, withoutEstimate, text };
}

export interface AgeCard {
  count: number;
  averageDays: number;
  oldestDays: number;
  text: string;
}

// Brain Dump tasks: not done, no Day, not in a list; plus old phone Brain Dump
// items that are still there. Age is whole days since creation, as of `nowMs`.
export function brainDumpAge(tasks: Task[], dumpItems: BrainDumpItem[], lists: Array<Pick<TaskList, 'key' | 'deletedAt'>>, nowMs: number): AgeCard {
  const ages: number[] = [];
  const age = (iso: string) => {
    const ms = Date.parse(iso);
    return Number.isNaN(ms) ? 0 : Math.max(0, Math.floor((nowMs - ms) / 86400000));
  };
  for (const t of tasks) {
    if (t.deletedAt || t.completed || isDateKey(t.dueDate) || effectiveListKey(t, lists) !== undefined) continue;
    ages.push(age(t.createdAt));
  }
  for (const i of dumpItems) if (!i.deletedAt) ages.push(age(i.createdAt));
  if (ages.length === 0) return { count: 0, averageDays: 0, oldestDays: 0, text: '' };
  const averageDays = Math.round(ages.reduce((a, b) => a + b, 0) / ages.length);
  const oldestDays = Math.max(...ages);
  return {
    count: ages.length,
    averageDays,
    oldestDays,
    text: `${ages.length} ${plural(ages.length, 'thought', 'thoughts')} waiting, ${averageDays === 0 ? 'under a day' : `${averageDays} ${plural(averageDays, 'day', 'days')}`} old on average, the oldest ${oldestDays} ${plural(oldestDays, 'day', 'days')}`,
  };
}

// ---- charts ----

export interface DayBar {
  day: string;
  count: number;
  minutes: number;
}

export function timePerDay(tasks: Task[], r: DateRange): DayBar[] {
  const bars = new Map<string, DayBar>(daysIn(r).map((day) => [day, { day, count: 0, minutes: 0 }]));
  for (const t of completedIn(tasks, r)) {
    const bar = bars.get(completedDay(t) as string);
    if (!bar) continue;
    bar.count += 1;
    bar.minutes += act(t);
  }
  return [...bars.values()];
}

export interface TaskBar {
  id: string;
  title: string;
  emoji?: string;
  estimate: number;
  actual: number;
}

export const MAX_TASK_BARS = 30;

// Completed tasks that have an estimate or an actual time, newest first.
export function estimateVsActual(tasks: Task[], r: DateRange, limit = MAX_TASK_BARS): { bars: TaskBar[]; more: number } {
  const rows = completedIn(tasks, r)
    .filter((t) => estimateOf(t) > 0 || act(t) > 0)
    .sort((a, b) => (b.completedAt as string).localeCompare(a.completedAt as string) || a.id.localeCompare(b.id));
  return {
    bars: rows.slice(0, limit).map((t) => ({ id: t.id, title: t.title, emoji: t.emoji, estimate: estimateOf(t), actual: act(t) })),
    more: Math.max(0, rows.length - limit),
  };
}

export interface LabelShare {
  key: string;
  name: string;
  emoji?: string;
  colorKey?: string;
  count: number;
  percent: number;
}

// Whole percentages that add up to 100 (largest remainder), biggest first.
export function percentages(counts: number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return counts.map(() => 0);
  const exact = counts.map((c) => (c * 100) / total);
  const floors = exact.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => ({ i, rem: e - floors[i] })).sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const o of order) {
    if (left <= 0) break;
    floors[o.i] += 1;
    left -= 1;
  }
  return floors;
}

export const NO_LABEL_KEY = '';

export function tasksByLabel(tasks: Task[], r: DateRange, labels: Array<Pick<Project, 'key' | 'name' | 'emoji' | 'colorKey' | 'deletedAt'>>): LabelShare[] {
  const counts = new Map<string, number>();
  for (const t of completedIn(tasks, r)) {
    const live = labels.find((l) => l.key === t.projectKey && !l.deletedAt);
    const k = live ? live.key : NO_LABEL_KEY;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  // Biggest first; on a tie, No label last, then by key.
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1] || Number(a[0] === NO_LABEL_KEY) - Number(b[0] === NO_LABEL_KEY) || a[0].localeCompare(b[0]));
  const pct = percentages(entries.map((e) => e[1]));
  return entries.map(([key, count], i) => {
    const l = labels.find((x) => x.key === key);
    return { key, name: l ? l.name : 'No label', emoji: l?.emoji, colorKey: l?.colorKey, count, percent: pct[i] };
  });
}

// ---- the completed list ----

export interface CompletedRow {
  id: string;
  title: string;
  emoji?: string;
  day: string;
  completedAt: string;
  label: string;
  list: string;
  estimate: number;
  actual: number;
}

export function completedRows(tasks: Task[], r: DateRange, labels: Array<Pick<Project, 'key' | 'name'>>, lists: Array<Pick<TaskList, 'key' | 'name' | 'deletedAt'>>): CompletedRow[] {
  return completedIn(tasks, r)
    .sort((a, b) => (b.completedAt as string).localeCompare(a.completedAt as string) || a.id.localeCompare(b.id))
    .map((t) => ({
      id: t.id,
      title: t.title,
      emoji: t.emoji,
      day: completedDay(t) as string,
      completedAt: t.completedAt as string,
      label: labels.find((l) => l.key === t.projectKey)?.name ?? '',
      list: lists.find((l) => l.key === effectiveListKey(t, lists))?.name ?? '',
      estimate: estimateOf(t),
      actual: act(t),
    }));
}

export type GroupBy = 'none' | 'day' | 'label';

export interface CompletedGroup {
  key: string;
  title: string;
  rows: CompletedRow[];
  estimate: number;
  actual: number;
}

export function groupCompleted(rows: CompletedRow[], by: GroupBy): CompletedGroup[] {
  if (by === 'none') return [{ key: 'all', title: 'All', rows, estimate: sum(rows, 'estimate'), actual: sum(rows, 'actual') }];
  const map = new Map<string, CompletedRow[]>();
  for (const r of rows) {
    const k = by === 'day' ? r.day : r.label || 'No label';
    const list = map.get(k);
    if (list) list.push(r);
    else map.set(k, [r]);
  }
  const keys = [...map.keys()].sort((a, b) => (by === 'day' ? b.localeCompare(a) : a.localeCompare(b)));
  return keys.map((k) => ({ key: k, title: k, rows: map.get(k)!, estimate: sum(map.get(k)!, 'estimate'), actual: sum(map.get(k)!, 'actual') }));
}

function sum(rows: CompletedRow[], f: 'estimate' | 'actual'): number {
  return rows.reduce((n, r) => n + r[f], 0);
}

export const COMPLETED_CSV_HEADERS = ['Completed on', 'Completed at', 'Title', 'Label', 'List', 'Estimated (minutes)', 'Actual (minutes)'];

// The download: the groups in order, one row per task (the group is a column
// when grouped, so the file stays flat).
export function completedCsv(rows: CompletedRow[], by: GroupBy): string {
  const groups = groupCompleted(rows, by);
  const headers = by === 'none' ? COMPLETED_CSV_HEADERS : ['Group', ...COMPLETED_CSV_HEADERS];
  const body: unknown[][] = [];
  for (const g of groups) {
    for (const r of g.rows) {
      const cells = [r.day, r.completedAt, `${r.emoji ? `${r.emoji} ` : ''}${r.title}`, r.label, r.list, r.estimate || '', r.actual || ''];
      body.push(by === 'none' ? cells : [g.title, ...cells]);
    }
  }
  return toCsv(headers, body);
}


// A chart of many days is drawn in groups so each bar stays readable: up to
// `maxBars` bars, each a run of whole days (a week for a quarter).
export interface BarGroup {
  from: string;
  to: string;
  count: number;
  minutes: number;
}

export function bucketBars(bars: DayBar[], maxBars = 31): BarGroup[] {
  if (bars.length === 0) return [];
  const size = Math.max(1, Math.ceil(bars.length / maxBars));
  const out: BarGroup[] = [];
  for (let i = 0; i < bars.length; i += size) {
    const run = bars.slice(i, i + size);
    out.push({ from: run[0].day, to: run[run.length - 1].day, count: run.reduce((n, b) => n + b.count, 0), minutes: run.reduce((n, b) => n + b.minutes, 0) });
  }
  return out;
}
