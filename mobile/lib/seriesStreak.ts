// Streaks and Progress, derived from repeating series (checkpoint 11, 2.17.0,
// decision 007). Pure: NO runtime react-native or storage imports so
// `node --test` can run it; see seriesStreak.test.ts.
//
// Nothing here is stored or synced. A streak is recomputed from the task rows
// that already exist (stored occurrences `root:date`, tombstones) and, for a
// converted routine (`rt_<routineId>`), from its old routine_completions.
//
// Everything works on local DATE KEYS ('YYYY-MM-DD'), stepped with calendar
// arithmetic (kanban.addDays), never milliseconds, so a 23 or 25 hour day
// (clocks changing) can never skip or repeat a date. A day belongs to the date
// of the occurrence's card, not the time it was ticked, and "My day starts at"
// (decision 024) is scroll only and not an input.
//
// How each day is treated (decision 007: shown from 2, a break is silent):
//   scheduled and completed         done      counts, the run grows
//   scheduled, past, not completed  notDone   ends the run, silently
//   scheduled and tombstoned (Skip this day)  skipped   neutral
//   today, scheduled, not done yet  open      neutral (the run is as of yesterday)
//   not scheduled / before the series / future  off   neutral
// A day is done when its occurrence is COMPLETED. Ticking the last subtask
// completes the occurrence and completing ticks every subtask (subtasks.ts), so
// there is one rule and no partial credit.
import type { Task } from './types.ts';
import { WEEKDAYS, addDays, dateKey, isDateKey, parseDateKey } from './kanban.ts';
import { groupByRoot, idDate, occursOn, seriesOfRows } from './series.ts';
import { shortRepeat } from './repeat.ts';
import { SERIES_PREFIX } from './routineConvert.ts';

export type DayState = 'done' | 'notDone' | 'skipped' | 'open' | 'off';

export interface StreakDay {
  key: string;
  state: DayState;
}

export interface SeriesStreak {
  root: string;
  title: string;
  // Short rule text for the Progress page: "Every day", "Mon Thu".
  repeat: string;
  // 'days' for a daily series; every other rule counts scheduled occurrences.
  unit: 'days' | 'times';
  current: number;
  best: number;
  done7: number;
  scheduled7: number;
  done30: number;
  scheduled30: number;
  // The last 7 days, oldest first, ending today.
  week: StreakDay[];
}

// How far back the walk goes. The local store keeps skip tombstones longer
// (series.OCCURRENCE_TOMBSTONE_KEEP_DAYS), which is what makes this safe.
export const STREAK_LOOKBACK_DAYS = 366;

export interface StreakInput {
  root: string;
  // Every stored row of the root, tombstones included.
  rows: Task[];
  // For an `rt_<routineId>` root: the dates the old routine was ticked.
  legacyDates?: ReadonlySet<string>;
  todayKey: string;
  lookbackDays?: number;
}

function rowDay(r: Task): string | undefined {
  return idDate(r.id) ?? (isDateKey(r.dueDate) ? r.dueDate : undefined);
}

// null when the series is not alive (no repeat rule: ended, deleted, or not a
// series at all).
export function seriesStreak(input: StreakInput): SeriesStreak | null {
  const { root, rows, todayKey } = input;
  if (!isDateKey(todayKey)) return null;
  const series = seriesOfRows(root, rows);
  if (!series) return null;
  const legacy = root.startsWith(SERIES_PREFIX) && input.legacyDates && input.legacyDates.size > 0 ? input.legacyDates : null;

  const doneDays = new Set<string>();
  const skippedDays = new Set<string>();
  for (const r of rows) {
    const day = rowDay(r);
    if (!day) continue;
    if (r.deletedAt) skippedDays.add(day);
    else if (r.completed) doneDays.add(day);
  }

  const lookback = Math.max(1, input.lookbackDays ?? STREAK_LOOKBACK_DAYS);
  const floor = dateKey(addDays(parseDateKey(todayKey), -(lookback - 1)));
  let first = series.startKey;
  if (legacy) for (const d of legacy) if (isDateKey(d) && d < first) first = d;
  if (first < floor) first = floor;

  const template = series.template;
  const anchor = template.dueDate as string;
  const states = new Map<string, DayState>();
  let run = 0;
  let best = 0;
  for (let d = parseDateKey(first); dateKey(d) <= todayKey; d = addDays(d, 1)) {
    const key = dateKey(d);
    // Before the series' first row only a converted routine has a past, and a
    // routine was always daily.
    const scheduled = key < series.startKey ? !!legacy : occursOn(template, key, anchor);
    if (!scheduled) {
      states.set(key, 'off');
      continue;
    }
    const done = doneDays.has(key) || (!!legacy && legacy.has(key));
    let state: DayState;
    if (done) state = 'done';
    else if (skippedDays.has(key)) state = 'skipped';
    else if (key === todayKey) state = 'open';
    else state = 'notDone';
    states.set(key, state);
    if (state === 'done') {
      run += 1;
      if (run > best) best = run;
    } else if (state === 'notDone') {
      run = 0;
    }
  }

  const stateOf = (key: string): DayState => states.get(key) ?? 'off';
  const window = (days: number): { done: number; scheduled: number } => {
    let done = 0;
    let scheduled = 0;
    for (let i = 0; i < days; i++) {
      const s = stateOf(dateKey(addDays(parseDateKey(todayKey), -i)));
      if (s === 'done') {
        done += 1;
        scheduled += 1;
      } else if (s === 'notDone') scheduled += 1;
    }
    return { done, scheduled };
  };
  const w7 = window(7);
  const w30 = window(30);
  const week: StreakDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const key = dateKey(addDays(parseDateKey(todayKey), -i));
    week.push({ key, state: stateOf(key) });
  }
  return {
    root,
    title: template.title,
    repeat: shortRepeat(template, todayKey) ?? '',
    unit: template.recurrence === 'daily' ? 'days' : 'times',
    current: run,
    best,
    done7: w7.done,
    scheduled7: w7.scheduled,
    done30: w30.done,
    scheduled30: w30.scheduled,
    week,
  };
}

// Every live series among `tasks`, keyed by root. `completions` are the old
// routine completions (only used for rt_ roots).
export function computeStreaks(
  tasks: Task[],
  completions: ReadonlyArray<{ routineId: string; date: string }>,
  todayKey: string,
): Map<string, SeriesStreak> {
  const legacyByRoutine = new Map<string, Set<string>>();
  for (const c of completions) {
    let set = legacyByRoutine.get(c.routineId);
    if (!set) legacyByRoutine.set(c.routineId, (set = new Set()));
    set.add(c.date);
  }
  const out = new Map<string, SeriesStreak>();
  for (const [root, rows] of groupByRoot(tasks)) {
    const legacyDates = root.startsWith(SERIES_PREFIX) ? legacyByRoutine.get(root.slice(SERIES_PREFIX.length)) : undefined;
    const s = seriesStreak({ root, rows, legacyDates, todayKey });
    if (s) out.set(root, s);
  }
  return out;
}

// ---- Wording (decision 007): plain, never a zero, never a warning ----

// Only from 2. "N days in a row" for a daily series, "N in a row" otherwise.
export function streakLine(s: Pick<SeriesStreak, 'current' | 'unit'>): string | null {
  if (s.current < 2) return null;
  return s.unit === 'days' ? `${s.current} days in a row` : `${s.current} in a row`;
}

export function bestLine(s: Pick<SeriesStreak, 'best' | 'unit'>): string | null {
  if (s.best < 2) return null;
  return s.unit === 'days' ? `Best: ${s.best} days in a row` : `Best: ${s.best} in a row`;
}

// "Last 7 days: 5 of 6"; nothing at all when none were done (no "0 of 7").
export function windowLine(days: 7 | 30, done: number, scheduled: number): string | null {
  if (done <= 0 || scheduled <= 0) return null;
  return `Last ${days} days: ${done} of ${scheduled}`;
}

const DAY_NAME = WEEKDAYS.map((d) => ({ Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' }[d] as string));
const STATE_TEXT: Record<DayState, string> = {
  done: 'done',
  notDone: 'not done',
  skipped: 'skipped',
  open: 'open',
  off: 'not scheduled',
};

// The accessible name of one square in the week strip, so colour is never the
// only signal: "Monday, done", "Tuesday, not done", "Wednesday, skipped",
// "Thursday, not scheduled", "Today, open".
export function dayLabel(day: StreakDay, todayKey: string): string {
  const name = day.key === todayKey ? 'Today' : DAY_NAME[parseDateKey(day.key).getDay()];
  return `${name}, ${STATE_TEXT[day.state]}`;
}

// Every fixed string of the feature, in one place so the wording test can read
// them all (the Settings label and hint, the Progress page).
export const STREAK_TEXT = {
  settingLabel: 'Show streaks',
  settingHint: 'Shows how many days in a row you did a repeating task, once it reaches 2. This is only on this computer.',
  progressTitle: 'Progress',
  progressRow: 'Progress',
  progressMenu: 'Progress',
  progressEmpty: 'Repeating tasks show up here once you have used them for a few days.',
  progressIntro: 'Your repeating tasks, over the last few days. Nothing here is stored: it is worked out from the days you ticked.',
  weekStrip: 'Last 7 days',
  skipNote: 'A skipped day does not end a run.',
} as const;
