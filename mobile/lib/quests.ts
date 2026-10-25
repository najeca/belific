// Quests (build plan phase 4): every live repeating series, grouped by cadence,
// with what is due in the current period and a streak counted in periods.
// Pure: NO runtime imports besides siblings; see quests.test.ts. Shared by the
// desktop and the iPhone.
//
// A quest IS a repeating series (decision 023); there is no second concept of a
// routine. Daily is the daily series, and a routine converted in 2.16.0 is the
// daily series `rt_<routineId>`, whose ticks before the conversion are its old
// routine_completions. Nothing here is stored: everything is worked out from
// the task rows (stored occurrences, skip tombstones) every time.
//
// Periods (Jethro, 2026-10-16): a day for daily, a Monday to Sunday week for
// weekly, a fortnight for every 2 weeks and three weeks for every 3 weeks (both
// counted from the series' own week, the same count occursOn uses), a calendar
// month for monthly and a calendar year for annual.
//
// A period's state, from its scheduled days (on or after the series start):
//   every scheduled day done or skipped, at least one done   done     the run grows
//   every scheduled day skipped                              skipped  neutral
//   a scheduled day not done (and not skipped)               missed   the run ends, silently
//   no scheduled day in it                                   off      neutral
// The CURRENT period is neutral until it is complete: unfinished, it never ends
// the run; finished (every scheduled day done or skipped), it counts.
//
// Dates are local 'YYYY-MM-DD' keys stepped with calendar arithmetic, never
// milliseconds, so a day of 23 or 25 hours (clocks changing) cannot skip or
// repeat a day. A tick belongs to its occurrence's own day (the date in its id),
// never to the time it was made or the device's time zone.
import type { RecurrenceRule, Task } from './types.ts';
import { WEEKDAYS, addDays, dateKey, isDateKey, parseDateKey, weekStartOf } from './kanban.ts';
import { groupByRoot, occurrenceFromTemplate, occursOn, ownDay, seriesOfRows, type Series } from './series.ts';
import { dayAndMonth, shortRepeat } from './repeat.ts';
import { SERIES_PREFIX } from './routineConvert.ts';

export type QuestSection = 'daily' | 'weekly' | 'biweekly' | 'everyFew' | 'monthly' | 'annual' | 'other';

export const QUEST_SECTIONS: Array<{ key: QuestSection; title: string; emoji: string }> = [
  { key: 'daily', title: 'Daily', emoji: '☀️' },
  { key: 'weekly', title: 'Weekly', emoji: '📅' },
  { key: 'biweekly', title: 'Every 2 weeks', emoji: '🗓️' },
  { key: 'everyFew', title: 'Every few weeks', emoji: '🔄' },
  { key: 'monthly', title: 'Monthly', emoji: '🌙' },
  { key: 'annual', title: 'Every year', emoji: '🎂' },
  // A rule this version does not know (from a newer device): still shown, so no
  // repeating task is ever hidden.
  { key: 'other', title: 'Other repeats', emoji: '🔁' },
];

export function sectionOf(rule: RecurrenceRule | string | undefined): QuestSection {
  switch (rule) {
    case 'daily':
      return 'daily';
    case 'weekly':
      return 'weekly';
    case 'biweekly':
      return 'biweekly';
    case 'triweekly':
      return 'everyFew';
    case 'monthly':
      return 'monthly';
    case 'annual':
      return 'annual';
    default:
      return 'other';
  }
}

// ---- periods ----

export interface Period {
  start: string;
  end: string;
}

function weeksBetween(a: Date, b: Date): number {
  // Whole weeks from a's week to b's week, by calendar days (DST proof).
  const da = weekStartOf(a);
  const db = weekStartOf(b);
  return Math.round((Date.UTC(db.getFullYear(), db.getMonth(), db.getDate()) - Date.UTC(da.getFullYear(), da.getMonth(), da.getDate())) / (7 * 86400000));
}

export function periodOf(section: QuestSection, dayKey: string, anchorKey: string): Period {
  const d = parseDateKey(dayKey);
  switch (section) {
    case 'weekly': {
      const s = weekStartOf(d);
      return { start: dateKey(s), end: dateKey(addDays(s, 6)) };
    }
    case 'biweekly':
    case 'everyFew': {
      const n = section === 'biweekly' ? 2 : 3;
      const anchorWeek = weekStartOf(parseDateKey(anchorKey));
      const w = weeksBetween(anchorWeek, d);
      const block = Math.floor(w / n);
      const s = addDays(anchorWeek, block * n * 7);
      return { start: dateKey(s), end: dateKey(addDays(s, n * 7 - 1)) };
    }
    case 'monthly':
      return { start: dateKey(new Date(d.getFullYear(), d.getMonth(), 1)), end: dateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
    case 'annual':
      return { start: dateKey(new Date(d.getFullYear(), 0, 1)), end: dateKey(new Date(d.getFullYear(), 11, 31)) };
    default:
      return { start: dayKey, end: dayKey };
  }
}

export function nextPeriodStart(p: Period): string {
  return dateKey(addDays(parseDateKey(p.end), 1));
}

// ---- the days of a series ----

export type DayMark = 'done' | 'skipped';

export interface SeriesDays {
  series: Series;
  section: QuestSection;
  // Days ticked (stored occurrence completed, or an old routine tick) and days skipped.
  marks: Map<string, DayMark>;
  // A converted routine: before its first row every day was scheduled (a routine was daily).
  legacy: boolean;
  firstKey: string;
}

export function seriesDays(root: string, rows: Task[], legacyDates?: ReadonlySet<string>): SeriesDays | null {
  const series = seriesOfRows(root, rows);
  if (!series) return null;
  const marks = new Map<string, DayMark>();
  // A day with a live row is not skipped: the first row moved off its day
  // leaves a tombstone on that day beside the moved copy (series.planMoveDay).
  const liveDays = new Set(rows.filter((r) => !r.deletedAt).map((r) => ownDay(r)));
  for (const r of rows) {
    const day = ownDay(r);
    if (!day) continue;
    if (r.deletedAt) {
      if (!marks.has(day) && !liveDays.has(day)) marks.set(day, 'skipped');
    } else if (r.completed) marks.set(day, 'done');
  }
  const legacy = root.startsWith(SERIES_PREFIX) && !!legacyDates && legacyDates.size > 0;
  let firstKey = series.startKey;
  if (legacy) {
    for (const d of legacyDates!) {
      if (!isDateKey(d)) continue;
      if (!marks.has(d)) marks.set(d, 'done');
      if (d < firstKey) firstKey = d;
    }
  }
  return { series, section: sectionOf(series.template.recurrence), marks, legacy, firstKey };
}

export function isScheduled(sd: SeriesDays, dayKey: string): boolean {
  if (dayKey < sd.firstKey) return false;
  if (dayKey < sd.series.startKey) return sd.legacy;
  return occursOn(sd.series.template, dayKey, sd.series.anchorKey);
}

export function scheduledIn(sd: SeriesDays, p: Period): string[] {
  const out: string[] = [];
  for (let d = parseDateKey(p.start); dateKey(d) <= p.end; d = addDays(d, 1)) {
    const k = dateKey(d);
    if (isScheduled(sd, k)) out.push(k);
  }
  return out;
}

export type PeriodState = 'done' | 'skipped' | 'missed' | 'off' | 'open';

export function periodState(sd: SeriesDays, p: Period, todayKey: string): PeriodState {
  const days = scheduledIn(sd, p);
  if (days.length === 0) return 'off';
  const current = p.start <= todayKey && todayKey <= p.end;
  let done = 0;
  let skipped = 0;
  for (const k of days) {
    const m = sd.marks.get(k);
    if (m === 'done') done += 1;
    else if (m === 'skipped') skipped += 1;
  }
  const complete = done + skipped === days.length;
  if (complete) return done > 0 ? 'done' : 'skipped';
  return current ? 'open' : 'missed';
}

// How far back a streak is counted, by cadence (periods older than this are
// not walked). Skip tombstones of every series are kept locally long enough
// (series.OCCURRENCE_TOMBSTONE_KEEP_DAYS and the longer keep for monthly and
// annual series), so a skip never ages into a miss inside this window.
export const LOOKBACK_DAYS: Record<QuestSection, number> = {
  daily: 366,
  weekly: 366,
  biweekly: 366,
  everyFew: 366,
  other: 366,
  monthly: 3660,
  annual: 3660,
};

export interface PeriodStreak {
  current: number;
  best: number;
}

export function periodStreak(sd: SeriesDays, todayKey: string): PeriodStreak {
  const floor = dateKey(addDays(parseDateKey(todayKey), -(LOOKBACK_DAYS[sd.section] - 1)));
  const startKey = sd.firstKey > floor ? sd.firstKey : floor;
  let p = periodOf(sd.section, startKey, sd.series.anchorKey);
  // A period cut by the window is not counted: start at the first whole one.
  if (p.start < startKey && startKey !== sd.firstKey) p = periodOf(sd.section, nextPeriodStart(p), sd.series.anchorKey);
  let run = 0;
  let best = 0;
  for (let guard = 0; p.start <= todayKey && guard < 5000; guard++) {
    const s = periodState(sd, p, todayKey);
    if (s === 'done') {
      run += 1;
      if (run > best) best = run;
    } else if (s === 'missed') run = 0;
    p = periodOf(sd.section, nextPeriodStart(p), sd.series.anchorKey);
  }
  return { current: run, best };
}

// ---- what is due now, and what one tap completes ----

export type DueKind = 'done' | 'skipped' | 'dueToday' | 'due' | 'next' | 'none';

const PERIOD_PHRASE: Record<QuestSection, string> = {
  daily: 'today',
  weekly: 'this week',
  biweekly: 'this fortnight',
  everyFew: 'for these 3 weeks',
  monthly: 'this month',
  annual: 'this year',
  other: 'today',
};

export interface Due {
  kind: DueKind;
  text: string;
  // The day one tap completes: the earliest scheduled day of this period that
  // is not done or skipped and is not after today, else the next one in this
  // period (done early). Absent when nothing is left in the period.
  targetDay?: string;
}

function nextText(section: QuestSection, dayKey: string, todayKey: string): string {
  const d = parseDateKey(dayKey);
  const inDays = Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(parseDateKey(todayKey).getFullYear(), parseDateKey(todayKey).getMonth(), parseDateKey(todayKey).getDate())) / 86400000);
  if ((section === 'weekly' || section === 'biweekly' || section === 'everyFew' || section === 'daily') && inDays <= 6) return `Next: ${WEEKDAYS[d.getDay()]}`;
  return `Next: ${dayAndMonth(dayKey)}`;
}

export function dueNow(sd: SeriesDays, todayKey: string): Due {
  const p = periodOf(sd.section, todayKey, sd.series.anchorKey);
  const days = scheduledIn(sd, p);
  if (days.length === 0) return { kind: 'none', text: `Nothing due ${PERIOD_PHRASE[sd.section]}` };
  const remaining = days.filter((k) => !sd.marks.has(k));
  if (remaining.length === 0) {
    const anyDone = days.some((k) => sd.marks.get(k) === 'done');
    return anyDone ? { kind: 'done', text: `Done ${PERIOD_PHRASE[sd.section]}` } : { kind: 'skipped', text: `Skipped ${PERIOD_PHRASE[sd.section]}` };
  }
  const notAfter = remaining.filter((k) => k <= todayKey);
  if (notAfter.length > 0) {
    const t = notAfter[0];
    return t === todayKey ? { kind: 'dueToday', text: 'Due today', targetDay: t } : { kind: 'due', text: `Due ${PERIOD_PHRASE[sd.section]}`, targetDay: t };
  }
  return { kind: 'next', text: nextText(sd.section, remaining[0], todayKey), targetDay: remaining[0] };
}

// The task row for a day of the series: the stored row that stands for it (an
// occurrence, moved or not, or the root row on its own day), else the
// occurrence as it would be stored (projected, not yet written).
export function occurrenceFor(rows: Task[], series: Series, dayKey: string): { task: Task; stored: boolean } {
  const stored = rows.find((r) => !r.deletedAt && ownDay(r) === dayKey);
  if (stored) return { task: stored, stored: true };
  return { task: occurrenceFromTemplate(series.template, dayKey, series.template.updatedAt), stored: false };
}

function lastDoneIn(rows: Task[], sd: SeriesDays, todayKey: string): Task | null {
  const p = periodOf(sd.section, todayKey, sd.series.anchorKey);
  let best: Task | null = null;
  for (const r of rows) {
    const day = ownDay(r);
    if (r.deletedAt || !r.completed || !day || day < p.start || day > p.end) continue;
    if (!best || (ownDay(best) as string) < day) best = r;
  }
  return best;
}

// The Timebox slot a quest is put in from the Quests screen: the next half hour
// from now (never past 23:30). It can be dragged anywhere afterwards.
export function nextHalfHour(now: Date): string {
  const m = Math.min(23 * 60 + 30, Math.ceil((now.getHours() * 60 + now.getMinutes() + 1) / 30) * 30);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// ---- the quests ----

export type StreakUnit = 'days' | 'weeks' | 'fortnights' | 'stretches' | 'months' | 'years' | 'times';
const UNITS: Record<QuestSection, StreakUnit> = {
  daily: 'days',
  weekly: 'weeks',
  biweekly: 'fortnights',
  everyFew: 'stretches',
  monthly: 'months',
  annual: 'years',
  other: 'times',
};

export interface Quest {
  root: string;
  title: string;
  emoji?: string;
  section: QuestSection;
  repeat: string;
  due: Due;
  // The occurrence one tap completes (and Skip, Today and Timebox act on).
  target: { task: Task; stored: boolean } | null;
  // When this period is done: the latest done occurrence in it, so a second tap
  // can reopen it (a mistaken tick is undone where it was made).
  undo: Task | null;
  current: number;
  best: number;
  unit: StreakUnit;
  rows: Task[];
}

export function buildQuests(
  tasks: Task[],
  completions: ReadonlyArray<{ routineId: string; date: string }>,
  todayKey: string,
): Quest[] {
  const legacyByRoutine = new Map<string, Set<string>>();
  for (const c of completions) {
    let set = legacyByRoutine.get(c.routineId);
    if (!set) legacyByRoutine.set(c.routineId, (set = new Set()));
    set.add(c.date);
  }
  const out: Quest[] = [];
  for (const [root, rows] of groupByRoot(tasks)) {
    const legacy = root.startsWith(SERIES_PREFIX) ? legacyByRoutine.get(root.slice(SERIES_PREFIX.length)) : undefined;
    const sd = seriesDays(root, rows, legacy);
    if (!sd) continue;
    const due = dueNow(sd, todayKey);
    const streak = periodStreak(sd, todayKey);
    const t = sd.series.template;
    out.push({
      root,
      title: t.title,
      emoji: t.emoji,
      section: sd.section,
      repeat: shortRepeat(t, todayKey) ?? String(t.recurrence ?? ''),
      due,
      target: due.targetDay ? occurrenceFor(rows, sd.series, due.targetDay) : null,
      undo: due.kind === 'done' ? lastDoneIn(rows, sd, todayKey) : null,
      current: streak.current,
      best: streak.best,
      unit: UNITS[sd.section],
      rows,
    });
  }
  out.sort((a, b) => a.title.localeCompare(b.title) || a.root.localeCompare(b.root));
  return out;
}

export function questsBySection(quests: Quest[]): Array<{ section: (typeof QUEST_SECTIONS)[number]; quests: Quest[] }> {
  return QUEST_SECTIONS.map((section) => ({ section, quests: quests.filter((q) => q.section === section.key) })).filter(
    (g) => g.quests.length > 0,
  );
}

// ---- wording (decisions 007 and 027): current and best, never a zero, never a warning ----

const UNIT_ONE: Record<StreakUnit, string> = {
  days: 'day',
  weeks: 'week',
  fortnights: 'fortnight',
  stretches: 'stretch of 3 weeks',
  months: 'month',
  years: 'year',
  times: 'time',
};
const UNIT_MANY: Record<StreakUnit, string> = {
  days: 'days',
  weeks: 'weeks',
  fortnights: 'fortnights',
  stretches: 'stretches of 3 weeks',
  months: 'months',
  years: 'years',
  times: 'times',
};

export function unitText(n: number, unit: StreakUnit): string {
  return `${n} ${n === 1 ? UNIT_ONE[unit] : UNIT_MANY[unit]}`;
}

// "4 weeks in a row · best 6", "Best 6 weeks", or nothing at all.
export function streakText(q: Pick<Quest, 'current' | 'best' | 'unit'>): string | null {
  if (q.current > 0) return q.best > q.current ? `${unitText(q.current, q.unit)} in a row · best ${q.best}` : `${unitText(q.current, q.unit)} in a row`;
  if (q.best > 0) return `Best ${unitText(q.best, q.unit)}`;
  return null;
}

// Can the quest's target be put on today's plan? Only an occurrence row (its id
// carries its day), never the series' root row: moving the root row would move
// where the rule is counted from.
export function canPlanToday(q: Pick<Quest, 'target' | 'root'>, todayKey: string): boolean {
  if (!q.target) return false;
  if (q.target.task.dueDate === todayKey) return false;
  return q.target.task.id !== q.root;
}
