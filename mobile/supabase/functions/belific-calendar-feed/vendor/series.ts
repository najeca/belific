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
// The template is the latest stored LIVE row of the series by its own day,
// never a moved day while another row is left (isMovedRow). It
// decides the title, label, rule and time of every projection. Its completed
// state, completion time and subtask ticks are IGNORED: a projection is always
// not completed with every subtask unticked. A series is alive while its
// template has a repeat rule; "Does not repeat" and "Delete repeating task"
// clear the rule on every row of the root (tombstones included) so no earlier
// row can restart it. A tombstone left by "Skip this day" never ends a series
// and is only a template of last resort (when nothing else is live).
import type { Subtask, Task, WeekDay } from './types.ts';
import { WEEKDAYS, addDays, dateKey, formatDayLabel, isDateKey, parseDateKey, weekStartOf } from './kanban.ts';
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
  // Every day that already has a row (live or tombstoned) standing for it (its
  // own day, see ownDay): a projection never lands on one of these.
  taken: Set<string>;
}

// The day a row stands for in its series: the date in its id for an occurrence
// (`root:date`), else its Day. An occurrence moved to another Day (a quest put
// on today's plan, build plan phase 4) still stands for its own day, so moving
// one can never change which row is the template or where the rule is anchored.
export function ownDay(row: Pick<Task, 'id' | 'dueDate'>): string | undefined {
  return idDate(row.id) ?? (isDateKey(row.dueDate) ? row.dueDate : undefined);
}

// A MOVED day (3.1.0, "this day only"): a stored occurrence whose Day is not the
// day in its id, for example this Saturday's shift put on Friday. Nothing new
// is stored for it: the id keeps the day it stands for and due_date is where it
// is now, so every device (older ones too) reads it from the existing columns.
// A moved row is never the template (a change made to it alone never reaches
// the other days) and only its id day counts as taken (the day it now sits on
// still shows its own occurrence, if the rule has one there).
export function isMovedRow(row: Pick<Task, 'id' | 'dueDate'>): boolean {
  const own = idDate(row.id);
  return !!own && isDateKey(row.dueDate) && row.dueDate !== own;
}

// The words for moving one day, the same on the desktop and the iPhone (3.2.0).
export const MOVE_THIS_DAY = 'Move this day';
export const MOVE_THIS_DAY_NOTE = 'Only this day moves. The other days stay as they are.';

// The day a moved occurrence came from ('YYYY-MM-DD'), or undefined when it is not moved.
export function movedFrom(row: Pick<Task, 'id' | 'dueDate'>): string | undefined {
  return isMovedRow(row) ? idDate(row.id) : undefined;
}

// What a moved day shows (3.3.0): "Moved from Sat" on a card, a row and a block; the long form
// "Moved from Sat 31 Oct · this day only" in tooltips and the details. Undefined when not moved.
export function movedCaption(row: Pick<Task, 'id' | 'dueDate'>): string | undefined {
  const from = movedFrom(row);
  return from ? `Moved from ${WEEKDAYS[parseDateKey(from).getDay()]}` : undefined;
}
export function movedCaptionLong(row: Pick<Task, 'id' | 'dueDate'>): string | undefined {
  const from = movedFrom(row);
  return from ? `Moved from ${formatDayLabel(from)} · this day only` : undefined;
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
  const ruled = dated.filter((r) => !!r.recurrence);
  const unmoved = (list: Task[]) => list.filter((r) => !isMovedRow(r));
  // A moved row is the template only when nothing else is left (3.1.0).
  const template = latestOf(unmoved(live)) ?? latestOf(unmoved(ruled)) ?? latestOf(live) ?? latestOf(ruled);
  if (!template || !template.recurrence) return null;
  const taken = new Set<string>();
  const anchorKey = ownDay(template) as string;
  let startKey = anchorKey;
  // A row takes the day it stands for, never the day it was moved to (3.1.0).
  for (const r of rows) {
    const d = ownDay(r);
    if (!d) continue;
    taken.add(d);
    if (d < startKey) startKey = d;
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
    // Part C: the other times of the day are a series field; what was ticked is not (a day starts undone).
    ...(template.extraTimes ? { extraTimes: [...template.extraTimes] } : {}),
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
  'extraTimes',
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
  // 3.4.0: instead, when the older live row is still open (it may hold a "this
  // day only" change), the next day of the series is stored to carry the
  // content, so that day's own change is never overwritten.
  templateRow?: Task;
}

// The next day after `afterKey` the series would show (its rule, not taken by
// any row), as an occurrence built from `template`; undefined when there is
// none within the look ahead (a year, or ten for monthly and annual).
function nextOccurrenceAfter(series: Series, template: Task, afterKey: string, nowIso: string): Task | undefined {
  const ahead = template.recurrence === 'monthly' || template.recurrence === 'annual' ? LONG_TOMBSTONE_KEEP_DAYS : 366;
  let day = parseDateKey(afterKey);
  for (let i = 0; i < ahead; i++) {
    day = addDays(day, 1);
    const key = dateKey(day);
    if (!series.taken.has(key) && occursOn(template, key, series.anchorKey)) return occurrenceFromTemplate(template, key, nowIso);
  }
  return undefined;
}

// The live stored row a card stands for: the row with its id when there is one
// (a stored card, moved or not), else the row whose own day is `dayKey`.
function liveRowFor(rows: Task[], dayKey: string, id?: string): Task | undefined {
  return (id ? rows.find((r) => !r.deletedAt && r.id === id) : undefined) ?? rows.find((r) => !r.deletedAt && ownDay(r) === dayKey);
}

// Plans "Skip this day" for `dayKey` of the series made of `rows` (`id`: the
// card's own id, so a moved day is found by its row). null when there is
// nothing to skip: no series, or that day's occurrence is completed.
export function planSkip(rows: Task[], dayKey: string, nowIso: string, id?: string): SkipPlan | null {
  if (rows.length === 0) return null;
  const root = rootTaskId(rows[0].id);
  const series = seriesOfRows(root, rows);
  if (!series) return null;
  const existing = liveRowFor(rows, dayKey, id);
  if (existing) {
    if (existing.completed) return null;
    const tombstone: Task = { ...existing, deletedAt: nowIso, updatedAt: nowIso };
    if (series.template.id !== existing.id) return { tombstone };
    const others = rows.filter((r) => !r.deletedAt && r.id !== existing.id && isDateKey(r.dueDate));
    const heir = latestOf(others.filter((r) => !isMovedRow(r))) ?? latestOf(others);
    if (!heir) return { tombstone };
    if (!heir.completed) {
      const next = nextOccurrenceAfter(series, existing, dayKey, nowIso);
      if (next) return { tombstone, templateRow: next };
    }
    // Every template field is copied, a cleared one included.
    const carried: Partial<Task> = {};
    for (const key of TEMPLATE_FIELDS) (carried as Record<string, unknown>)[key] = existing[key];
    return { tombstone, templatePatch: { id: heir.id, fields: templatePatch(heir, carried) } };
  }
  if (series.taken.has(dayKey)) return null; // already a tombstone
  return { tombstone: { ...occurrenceFromTemplate(series.template, dayKey, nowIso), deletedAt: nowIso } };
}

// ---- Moving one day (3.1.0, "this day only") ----

export interface RowWrite {
  row: Task;
  // Added as a new row, else it replaces the stored row with its id.
  isNew: boolean;
}

export interface MovePlan {
  // Written in this order.
  writes: RowWrite[];
  // The row that stands for the day afterwards (its id is the card's id from now on).
  moved: Task;
}

// ---- A change to one day (3.4.0, "This day only") ----

// Plans changing `fields` (a time, a length, its times) on ONE day of the series
// made of `rows`, stored first when it is only projected. The day keeps its rule
// and Day; the other days never see the change. The template is the latest
// stored row, so a changed day that would become it (it is the latest) would
// hand its change to every later day: the next day of the series is then stored
// as well, from the series as it was, and carries the series instead. That
// next day reads exactly as before (a stored open day of the series). A repeat
// rule, a Day or the row's identity are never taken from `fields` (those are
// series edits or moves). null when there is nothing to change.
export function planThisDayEdit(
  rows: Task[],
  dayKey: string,
  fields: Partial<Task>,
  nowIso: string,
  id?: string,
): MovePlan | null {
  if (rows.length === 0) return null;
  const root = rootTaskId(rows[0].id);
  const series = seriesOfRows(root, rows);
  if (!series) return null;
  const clean: Partial<Task> = { ...fields };
  for (const k of [...MOVE_FORBIDDEN, ...RULE_FIELDS]) delete clean[k];
  if (Object.keys(clean).length === 0) return null;
  const existing = liveRowFor(rows, dayKey, id);
  if (!existing && series.taken.has(dayKey)) return null; // skipped
  const base = existing ?? occurrenceFromTemplate(series.template, dayKey, nowIso);
  const row: Task = { ...base, ...clean, updatedAt: nowIso };
  const writes: RowWrite[] = [{ row, isNew: !existing }];
  const after = existing ? rows.map((r) => (r.id === row.id ? row : r)) : [...rows, row];
  const next = seriesOfRows(root, after);
  if (next && next.template.id === row.id) {
    const carrier = nextOccurrenceAfter(next, series.template, ownDay(row) as string, nowIso);
    if (carrier) writes.push({ row: carrier, isNew: true });
  }
  return { writes, moved: row };
}

// Fields a move may never take from the caller: the row's identity and state.
const MOVE_FORBIDDEN = ['id', 'dueDate', 'deletedAt', 'createdAt'] as const;

// Plans moving ONE day of the series made of `rows` to `toDay`, with `fields`
// (a time, a length, cleared times) applied to that day alone. `fromDay` is the
// day the card stands for (its own day); `id` the card's id when it is stored.
// The rule, the template and every other day are untouched:
//  - a stored occurrence (`root:date`) gets the new Day (its id keeps its day);
//  - a projected day is stored from the template, on the new Day;
//  - the series' first row (its id has no day, so it cannot show a move) has
//    its day skipped instead: the row is tombstoned keeping its rule, exactly as
//    "Skip this day" does, and the day is stored as `root:fromDay` on the new
//    Day, a copy of the row (ticks, time and steps included);
//  - an occurrence put back on its own day is no longer moved.
// null when there is nothing to move: no series, the day is skipped, a Day is
// not a date, or nothing would change.
export function planMoveDay(
  rows: Task[],
  fromDay: string,
  toDay: string,
  nowIso: string,
  opts: { id?: string; fields?: Partial<Task> } = {},
): MovePlan | null {
  if (rows.length === 0 || !isDateKey(fromDay) || !isDateKey(toDay)) return null;
  const root = rootTaskId(rows[0].id);
  const series = seriesOfRows(root, rows);
  if (!series) return null;
  const fields: Partial<Task> = { ...(opts.fields ?? {}) };
  for (const k of MOVE_FORBIDDEN) delete fields[k];
  const hasFields = Object.keys(fields).length > 0;
  const existing = liveRowFor(rows, fromDay, opts.id);
  if (!existing) {
    if (series.taken.has(fromDay)) return null; // skipped
    if (toDay === fromDay && !hasFields) return null;
    const row: Task = { ...occurrenceFromTemplate(series.template, fromDay, nowIso), ...fields, dueDate: toDay };
    return { writes: [{ row, isNew: true }], moved: row };
  }
  if (existing.dueDate === toDay && !hasFields) return null;
  const day = ownDay(existing) as string;
  if (idDate(existing.id) || toDay === day) {
    const row: Task = { ...existing, ...fields, dueDate: toDay, updatedAt: nowIso };
    return { writes: [{ row, isNew: false }], moved: row };
  }
  // The first row, moved off its own day.
  const id = nextOccurrenceId(root, day);
  if (rows.some((r) => r.id === id)) return null; // that day already has a row of its own
  const row: Task = { ...existing, ...fields, id, dueDate: toDay, updatedAt: nowIso };
  const writes: RowWrite[] = [{ row, isNew: true }, { row: { ...existing, deletedAt: nowIso, updatedAt: nowIso }, isNew: false }];
  if (series.template.id === existing.id) {
    // As for a skip: an older live row takes over the template, with its content.
    const heir = latestOf(rows.filter((r) => !r.deletedAt && r.id !== existing.id && isDateKey(r.dueDate) && !isMovedRow(r)));
    if (heir) {
      const carried: Partial<Task> = {};
      for (const key of TEMPLATE_FIELDS) (carried as Record<string, unknown>)[key] = existing[key];
      writes.push({ row: { ...heir, ...templatePatch(heir, carried), updatedAt: nowIso }, isNew: false });
    }
  }
  return { writes, moved: row };
}
