// Repeating tasks as SERIES with projected occurrences (checkpoint 8.4, decision
// 023). Pure: NO runtime react-native or storage imports so `node --test` can
// run it; see series.test.ts. Dates are local 'YYYY-MM-DD' keys.
//
// A repeating task is a series: every stored row whose id is `${root}` or
// `${root}:${date}` (the existing occurrence id scheme, recurrence.ts). The
// board and the Timebox SHOW an occurrence on every matching day from today
// forward, computed here from the series' template and its rule. Projected
// occurrences are never stored, never synced, never in the left list and never
// in the past. Ticking one stores that day's occurrence as a real task with the
// deterministic id; a skipped day is a tombstoned stored occurrence with that
// id (the existing tombstone mechanism, so sync needs no new column and
// tombstones win everywhere).
//
// The template is the latest stored LIVE row of the series by its Day. It
// decides the title, label, rule and time of every projection. Its completed
// state, completion time and subtask ticks are IGNORED: a projection is always
// not completed with every subtask unticked. A series is alive while its
// template has a repeat rule; "Does not repeat" and "Delete repeating task"
// clear the rule on every row of the root (tombstones included) so no earlier
// row can restart it. A tombstone left by "Skip this day" never ends a series
// and is only a template of last resort (when nothing else is live).
import type { Subtask, Task, WeekDay } from './types.ts';
import { WEEKDAYS, addDays, dateKey, isDateKey, parseDateKey, weekStartOf } from './kanban.ts';
import { effectiveDays, monthDayOf, occursAnnually } from './repeat.ts';
import { nextOccurrenceId, rootTaskId } from './recurrence.ts';
import { copyForNextOccurrence } from './subtasks.ts';

// The day an occurrence id stands for: the part after the first ':' when it is
// a date, else nothing (a root row's own id).
export function idDate(id: string): string | undefined {
  const i = id.indexOf(':');
  if (i === -1) return undefined;
  const rest = id.slice(i + 1);
  return isDateKey(rest) ? rest : undefined;
}

// Local tombstone housekeeping: the tombstone of a skipped occurrence is kept
// while its day is today or later (it is what hides the day), however old it is.
export function isUpcomingOccurrence(id: string, todayKey: string): boolean {
  const day = idDate(id);
  return !!day && day >= todayKey;
}

// How long the local store keeps the tombstone of a skipped occurrence of a
// repeating task (checkpoint 11). Streaks treat a skipped day as neutral, so the
// tombstone must outlive the streak lookback (366 days, seriesStreak.ts) or a
// long run would break silently when a skip aged out. Local only: the server
// never prunes, nothing is synced differently, no migration.
export const OCCURRENCE_TOMBSTONE_KEEP_DAYS = 400;
export const LONG_TOMBSTONE_KEEP_DAYS = 3700;

// Is this tombstone one the local prune must keep? A skipped day of a series:
// its id carries the day (`root:date`), or it is a row that still has a repeat
// rule (a skipped root row). It is kept while that day is within the last
// OCCURRENCE_TOMBSTONE_KEEP_DAYS days or any day ahead. Other tombstones
// (ordinary deleted tasks, ended series) follow the normal 90 day prune.
export function keepsOccurrenceTombstone(
  task: { id: string; dueDate?: string; recurrence?: unknown },
  todayKey: string,
): boolean {
  const day = idDate(task.id) ?? (task.recurrence && isDateKey(task.dueDate) ? task.dueDate : undefined);
  if (!day) return false;
  // Monthly and annual streaks look back ten years (quests.LOOKBACK_DAYS), so
  // their skips are kept as long; every other skip 400 days.
  const keep = task.recurrence === 'monthly' || task.recurrence === 'annual' ? LONG_TOMBSTONE_KEEP_DAYS : OCCURRENCE_TOMBSTONE_KEEP_DAYS;
  return day >= dateKey(addDays(parseDateKey(todayKey), -keep));
}

// The series fields a projection and a template carry.
const RULE_FIELDS = ['recurrence', 'recurrenceDays', 'recurrenceMonthDay'] as const;

export interface Series {
  root: string;
  // The row projections are built from (see the header).
  template: Task;
  // The first Day the series has a row on: nothing projects before it.
  startKey: string;
  // Where the rule is counted from (every N weeks, the month day of an old
  // monthly task, the date of an annual one): the template's own day.
  anchorKey: string;
  // Every Day that already has a row (live or tombstoned), by Day or by id:
  // a projection never lands on one of these.
  taken: Set<string>;
}

// The day a row stands for in its series: the date in its id for an occurrence
// (`root:date`), else its Day. An occurrence moved to another Day (a quest put
// on today's plan, build plan phase 4) still stands for its own day, so moving
// one can never change which row is the template or where the rule is anchored.
export function ownDay(row: Pick<Task, 'id' | 'dueDate'>): string | undefined {
  return idDate(row.id) ?? (isDateKey(row.dueDate) ? row.dueDate : undefined);
}

function laterRow(a: Task, b: Task): boolean {
  // true when a should be preferred over b as "the latest"
  const ad = ownDay(a) as string;
  const bd = ownDay(b) as string;
  if (ad !== bd) return ad > bd;
  return (a.updatedAt ?? '') > (b.updatedAt ?? '') || ((a.updatedAt ?? '') === (b.updatedAt ?? '') && a.id > b.id);
}

function latestOf(rows: Task[]): Task | undefined {
  let best: Task | undefined;
  for (const r of rows) if (!best || laterRow(r, best)) best = r;
  return best;
}

// The series of one root, from all its rows (tombstones included), or null when
// it has no repeating template.
export function seriesOfRows(root: string, rows: Task[]): Series | null {
  const dated = rows.filter((r) => isDateKey(r.dueDate));
  if (dated.length === 0) return null;
  const live = dated.filter((r) => !r.deletedAt);
  const template = latestOf(live) ?? latestOf(dated.filter((r) => !!r.recurrence));
  if (!template || !template.recurrence) return null;
  const taken = new Set<string>();
  const anchorKey = ownDay(template) as string;
  let startKey = anchorKey;
  for (const r of rows) {
    const dates = [isDateKey(r.dueDate) ? r.dueDate : undefined, idDate(r.id)];
    for (const d of dates) {
      if (!d) continue;
      taken.add(d);
      if (d < startKey) startKey = d;
    }
  }
  return { root, template, startKey, anchorKey, taken };
}

export function groupByRoot(tasks: Task[]): Map<string, Task[]> {
  const map = new Map<string, Task[]>();
  for (const t of tasks) {
    const root = rootTaskId(t.id);
    const list = map.get(root);
    if (list) list.push(t);
    else map.set(root, [t]);
  }
  return map;
}

export function seriesOf(tasks: Task[], root: string): Series | null {
  return seriesOfRows(root, tasks.filter((t) => rootTaskId(t.id) === root));
}

// ---- The rule: does the series occur on `day`? ----

function lastDayOfMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// `rule` is the template; `anchorKey` is the Day its every-N-weeks count starts
// from (the template's own Day: that week is "on", then every Nth after it).
export function occursOn(
  rule: Pick<Task, 'recurrence' | 'recurrenceDays' | 'recurrenceMonthDay' | 'dueDate'>,
  dayKey: string,
  anchorKey: string,
): boolean {
  if (!rule.recurrence || !isDateKey(dayKey) || !isDateKey(anchorKey)) return false;
  const day = parseDateKey(dayKey);
  const weekday = WEEKDAYS[day.getDay()] as WeekDay;
  switch (rule.recurrence) {
    case 'daily':
      return true;
    case 'weekly':
      return effectiveDays({ recurrenceDays: rule.recurrenceDays, dueDate: anchorKey }, anchorKey).includes(weekday);
    case 'biweekly':
    case 'triweekly': {
      const period = rule.recurrence === 'biweekly' ? 2 : 3;
      if (!effectiveDays({ recurrenceDays: rule.recurrenceDays, dueDate: anchorKey }, anchorKey).includes(weekday)) return false;
      const weeks = Math.round((weekStartOf(day).getTime() - weekStartOf(parseDateKey(anchorKey)).getTime()) / WEEK_MS);
      return ((weeks % period) + period) % period === 0;
    }
    case 'monthly': {
      const md = monthDayOf({ recurrenceMonthDay: rule.recurrenceMonthDay, dueDate: anchorKey }, anchorKey);
      return day.getDate() === Math.min(md, lastDayOfMonth(day));
    }
    case 'annual':
      return occursAnnually(dayKey, anchorKey, rule.recurrenceMonthDay);
    default:
      return false;
  }
}

// ---- Building an occurrence from the template ----

// The occurrence of the series on `day`: same name, label, priority, estimate,
// notes, start time, reminder and repeat as the template; not completed; every
// subtask unticked with ids derived from the occurrence id. The id is the
// deterministic `${root}:${day}`, so two devices agree.
export function occurrenceFromTemplate(template: Task, dayKey: string, nowIso: string): Task {
  const id = nextOccurrenceId(template.id, dayKey);
  const subtasks = copyForNextOccurrence(template.subtasks, id);
  return {
    id,
    title: template.title,
    dueDate: dayKey,
    priority: template.priority,
    projectKey: template.projectKey,
    // The list too (it was missing: every projected day showed "Brain Dump" in the details).
    ...(template.listKey ? { listKey: template.listKey } : {}),
    notes: template.notes,
    durationMinutes: template.durationMinutes,
    startTime: template.startTime,
    recurrence: template.recurrence,
    recurrenceDays: template.recurrenceDays,
    recurrenceMonthDay: template.recurrenceMonthDay,
    ...(subtasks ? { subtasks } : {}),
    ...(template.reminderMinutes !== undefined && template.reminderMinutes !== null ? { reminderMinutes: template.reminderMinutes } : {}),
    ...(template.cutsBelow ? { cutsBelow: true } : {}),
    ...(template.reminders ? { reminders: [...template.reminders] } : {}),
    completed: false,
    createdAt: template.createdAt,
    updatedAt: nowIso,
  };
}

// ---- Projection ----

// The occurrences to SHOW on `dayKeys`: for every live series, each day that is
// not before today (or `minKey`), not before the series started, not already
// taken by a stored row or a tombstone, and matches the rule. Returned as Task
// objects with the occurrence id; they are never written anywhere.
export function projectOccurrences(
  tasks: Task[],
  dayKeys: string[],
  todayKey: string,
  opts: { minKey?: string } = {},
): Task[] {
  const floor = opts.minKey && opts.minKey < todayKey ? opts.minKey : todayKey;
  const out: Task[] = [];
  for (const [root, rows] of groupByRoot(tasks)) {
    const series = seriesOfRows(root, rows);
    if (!series) continue;
    for (const day of dayKeys) {
      if (!isDateKey(day) || day < floor || day < series.startKey || series.taken.has(day)) continue;
      if (occursOn(series.template, day, series.anchorKey)) {
        out.push(occurrenceFromTemplate(series.template, day, series.template.updatedAt));
      }
    }
  }
  return out;
}

// Is this task row part of a live series (it repeats, and so do its siblings)?
export function isRepeating(task: Pick<Task, 'recurrence'>): boolean {
  return !!task.recurrence;
}

// ---- Editing the template ----

// The edit-able fields a template edit may change. Never the Day, the
// completed state, the completion time or the creation time.
export const TEMPLATE_FIELDS = [
  'title',
  'priority',
  'projectKey',
  'listKey',
  'notes',
  'durationMinutes',
  'startTime',
  'recurrence',
  'recurrenceDays',
  'recurrenceMonthDay',
  'subtasks',
  'reminderMinutes',
  'cutsBelow',
  'reminders',
] as const;

// The template's own subtask list after an edit. A completed template keeps
// every subtask done (completing ticks them all); an open one keeps the ticks
// of subtasks that are still there (matched by title, once each). The edit never
// changes whether the template itself is completed.
export function templateSubtasks(prev: Subtask[] | undefined, edited: Subtask[], templateCompleted: boolean): Subtask[] {
  const pool = [...(prev ?? [])];
  return edited.map((s) => {
    if (templateCompleted) return { ...s, done: true };
    const at = pool.findIndex((p) => p.title === s.title);
    const done = at >= 0 ? pool[at].done : false;
    if (at >= 0) pool.splice(at, 1);
    return { ...s, done };
  });
}

// The stored rows an edit made on a projected card is written to: the template
// row (whatever its state, so every projection follows) and every live row that
// is not completed and is dated today or later (an open stored card of the same
// series reads the same as the days around it). Completed rows other than the
// template, past rows and tombstones are left as they were.
export function seriesEditTargets(rows: Task[], todayKey: string): Task[] {
  const series = seriesOfRows(rows.length > 0 ? rootTaskId(rows[0].id) : '', rows);
  if (!series) return [];
  const targets = new Map<string, Task>([[series.template.id, series.template]]);
  for (const r of rows) {
    if (r.deletedAt || r.completed || !isDateKey(r.dueDate) || r.dueDate < todayKey) continue;
    targets.set(r.id, r);
  }
  return [...targets.values()];
}

// What a card edit changes on the template row: only TEMPLATE_FIELDS, with the
// subtask list re-ticked as above. An edit that clears a field (undefined) is
// kept as a clear.
export function templatePatch(template: Task, fields: Partial<Task>): Partial<Task> {
  const out: Partial<Task> = {};
  for (const key of TEMPLATE_FIELDS) {
    if (!(key in fields)) continue;
    if (key === 'subtasks') {
      const list = fields.subtasks;
      out.subtasks = list ? templateSubtasks(template.subtasks, list, template.completed) : undefined;
    } else {
      (out as Record<string, unknown>)[key] = (fields as Record<string, unknown>)[key];
    }
  }
  return out;
}

// ---- Ending a series ----

function clearRule(row: Task, nowIso: string): Task {
  const next: Task = { ...row, updatedAt: nowIso };
  for (const f of RULE_FIELDS) next[f] = undefined;
  return next;
}

function hasRule(row: Task): boolean {
  return !!row.recurrence || !!row.recurrenceDays || row.recurrenceMonthDay !== undefined;
}

// "Does not repeat": every row of the root, tombstones included, loses its
// repeat rule, so nothing earlier can restart projections. Rows keep their
// Day, completed state and tombstones. Returns only the rows that change.
export function endSeriesRows(rows: Task[], nowIso: string): Task[] {
  return rows.filter(hasRule).map((r) => clearRule(r, nowIso));
}

// "Delete repeating task": every live row that is not completed is tombstoned
// (and loses its rule); a completed row stays as history but loses its rule;
// existing tombstones lose theirs too. So the series stops on every device and
// no row remains that could restart it. Returns only the rows that change.
export function deleteSeriesRows(rows: Task[], nowIso: string): Task[] {
  const out: Task[] = [];
  for (const r of rows) {
    if (!r.deletedAt && !r.completed) out.push({ ...clearRule(r, nowIso), deletedAt: nowIso });
    else if (hasRule(r)) out.push(clearRule(r, nowIso));
  }
  return out;
}

// ---- Skipping a day ----

export interface SkipPlan {
  // The tombstone to write (a new row for a projected day, or the existing open
  // row tombstoned). It keeps the repeat rule, so a series with nothing else
  // live can still be projected from it.
  tombstone: Task;
  // When the skipped row was the template and an older live row takes over, the
  // content the skipped row carried is copied onto it so later edits are not
  // lost. Never touches its Day or completed state.
  templatePatch?: { id: string; fields: Partial<Task> };
}

// Plans "Skip this day" for `dayKey` of the series made of `rows`. null when
// there is nothing to skip: no series, or that day's occurrence is completed.
export function planSkip(rows: Task[], dayKey: string, nowIso: string): SkipPlan | null {
  if (rows.length === 0) return null;
  const root = rootTaskId(rows[0].id);
  const series = seriesOfRows(root, rows);
  if (!series) return null;
  const existing = rows.find((r) => !r.deletedAt && (r.dueDate === dayKey || idDate(r.id) === dayKey));
  if (existing) {
    if (existing.completed) return null;
    const tombstone: Task = { ...existing, deletedAt: nowIso, updatedAt: nowIso };
    if (series.template.id !== existing.id) return { tombstone };
    const others = rows.filter((r) => !r.deletedAt && r.id !== existing.id && isDateKey(r.dueDate));
    const heir = latestOf(others);
    if (!heir) return { tombstone };
    // Every template field is copied, a cleared one included.
    const carried: Partial<Task> = {};
    for (const key of TEMPLATE_FIELDS) (carried as Record<string, unknown>)[key] = existing[key];
    return { tombstone, templatePatch: { id: heir.id, fields: templatePatch(heir, carried) } };
  }
  if (series.taken.has(dayKey)) return null; // already a tombstone
  return { tombstone: { ...occurrenceFromTemplate(series.template, dayKey, nowIso), deletedAt: nowIso } };
}
