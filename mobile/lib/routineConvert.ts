// Routines become repeating tasks (checkpoint 10, 2.16.0). Pure: NO runtime
// react-native or storage imports so `node --test` can run it; see
// routineConvert.test.ts. The page-side wiring is routineConvertActions.ts.
//
// A routine (a daily done / not done toggle, grouped morning, afternoon or
// evening) becomes a daily repeating task SERIES (lib/series.ts, decision 023):
// untimed, no reminder, no label, no priority, no steps. The series root id is
// `rt_<routineId>`: deterministic, so converting twice can never make two
// series, and the link from a series back to its routine needs no new column.
// Occurrence ids are `rt_<routineId>:<date>` like any series.
//
// The conversion never touches routine_completions: the history stays exactly
// as the phone wrote it (a later checkpoint derives streaks from it).
//
// Converting = make sure the series exists, then tombstone the routine (a
// direct write, never storage.deleteRoutine, which also wipes the routine's
// completions). The series is written first, so a crash in between leaves a
// routine that still shows and a series that exists; running Convert again just
// finishes the tombstone and never makes a second series.
//
// A tombstone can never be cleared by sync (a pulled tombstone always wins, and
// a live upsert never sends deleted_at), so nothing is ever "revived" under its
// old id. Undo ends the series and gives each routine back as a NEW routine row
// (same title and time of day, new id) with its completions copied to the new
// id. The old rows stay as they were.
import type { Routine, Task, TimeOfDay } from './types.ts';
import { rootTaskId } from './recurrence.ts';
import { deleteSeriesRows } from './series.ts';

export const SERIES_PREFIX = 'rt_';

export function seriesIdFor(routineId: string): string {
  return `${SERIES_PREFIX}${routineId}`;
}

const ORDER: TimeOfDay[] = ['morning', 'afternoon', 'evening'];
export const TIME_OF_DAY_TEXT: Record<TimeOfDay, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
};

function rowsOfRoot(tasks: Task[], root: string): Task[] {
  return tasks.filter((t) => rootTaskId(t.id) === root);
}

// A series is alive while a live row of its root still has a repeat rule.
function isAlive(rows: Task[]): boolean {
  return rows.some((r) => !r.deletedAt && !!r.recurrence);
}

function byTimeOfDay(a: Routine, b: Routine): number {
  const ai = ORDER.indexOf(a.timeOfDay);
  const bi = ORDER.indexOf(b.timeOfDay);
  if (ai !== bi) return (ai === -1 ? 9 : ai) - (bi === -1 ? 9 : bi);
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

export interface ConvertItem {
  routine: Routine;
  // The series root row to write, or null when any row with the root id
  // already exists (a half finished conversion, or a series the person ended or
  // deleted themselves): then only the routine tombstone is missing.
  series: Task | null;
}

export interface ConvertPlan {
  items: ConvertItem[];
}

// The root row of the series for one routine, dated the day Convert is pressed.
export function seriesRowFor(routine: Routine, todayKey: string, nowIso: string): Task {
  return {
    id: seriesIdFor(routine.id),
    title: routine.title,
    dueDate: todayKey,
    completed: false,
    recurrence: 'daily',
    reminderMinutes: -1,
    createdAt: routine.createdAt,
    updatedAt: nowIso,
  };
}

// What Convert would do, from the stored routines (tombstones included) and
// tasks (tombstones included). Routines the person already deleted are skipped.
export function planConvert(routines: Routine[], tasks: Task[], todayKey: string, nowIso: string): ConvertPlan {
  const items: ConvertItem[] = [];
  for (const routine of [...routines].filter((r) => !r.deletedAt).sort(byTimeOfDay)) {
    // Any row with the root id means it was converted (or the person ended or
    // deleted that series): never write a second one.
    const exists = rowsOfRoot(tasks, seriesIdFor(routine.id)).length > 0;
    items.push({ routine, series: exists ? null : seriesRowFor(routine, todayKey, nowIso) });
  }
  return { items };
}

// The routine row Convert writes: a tombstone, nothing else changed.
export function routineTombstone(routine: Routine, nowIso: string): Routine {
  return { ...routine, deletedAt: nowIso, updatedAt: nowIso };
}

// The dry run: one line per routine, and the plain statement that nothing has
// changed yet.
export interface DryRunLine {
  id: string;
  title: string;
  timeOfDay: string;
}
export function dryRunLines(plan: ConvertPlan): DryRunLine[] {
  return plan.items.map((i) => ({
    id: i.routine.id,
    title: i.routine.title,
    timeOfDay: TIME_OF_DAY_TEXT[i.routine.timeOfDay] ?? String(i.routine.timeOfDay),
  }));
}
export const DRY_RUN_NOTE = 'Nothing has changed yet.';

// The warning shown in the confirmation step, word for word.
export const CONVERT_WARNING =
  'Your iPhone will stop showing these routines until the next iPhone update. Only convert when you are ready. You can undo this.';

export interface UndoPlan {
  // Series rows to write: every open row ends (tombstoned), finished days stay
  // but stop repeating (decision 023, "Delete repeating task").
  taskRows: Task[];
  // The routines given back: new rows (new ids) for the ones Convert tombstoned.
  routines: Routine[];
  // For each new routine, the old routine id whose completions are copied to it.
  copyFrom: Array<{ from: string; to: string }>;
  count: number;
}

// Undo: for every routine that has a live series, end the series and give the
// routine back. A series the person deleted themselves is not alive, so it is
// not touched.
export function planUndo(routines: Routine[], tasks: Task[], nowIso: string, newId: () => string): UndoPlan {
  const taskRows: Task[] = [];
  const back: Routine[] = [];
  const copyFrom: Array<{ from: string; to: string }> = [];
  let count = 0;
  for (const routine of routines) {
    const rows = rowsOfRoot(tasks, seriesIdFor(routine.id));
    if (!isAlive(rows)) continue;
    count += 1;
    taskRows.push(...deleteSeriesRows(rows, nowIso));
    if (routine.deletedAt) {
      const id = newId();
      back.push({ id, title: routine.title, timeOfDay: routine.timeOfDay, createdAt: routine.createdAt, updatedAt: nowIso });
      copyFrom.push({ from: routine.id, to: id });
    }
  }
  return { taskRows, routines: back, copyFrom, count };
}

export interface RoutineSummary {
  // Live routines still waiting to be converted.
  pending: number;
  // Converted routines Undo would give back.
  converted: number;
}

export function routineSummary(routines: Routine[], tasks: Task[]): RoutineSummary {
  const pending = planConvert(routines, tasks, '0000-00-00', '').items.length;
  const converted = routines.filter((r) => !!r.deletedAt && isAlive(rowsOfRoot(tasks, seriesIdFor(r.id)))).length;
  return { pending, converted };
}

function plural(n: number): string {
  return n === 1 ? '1 routine' : `${n} routines`;
}

// The quiet lines in Settings, Data. Empty when no routine rows matter.
export function routineLines(s: RoutineSummary): string[] {
  const out: string[] = [];
  if (s.pending > 0) out.push(`${plural(s.pending)} from your iPhone`);
  if (s.converted > 0) {
    out.push(
      s.converted === 1
        ? '1 routine from your iPhone is now a repeating task'
        : `${s.converted} routines from your iPhone are now repeating tasks`,
    );
  }
  return out;
}
