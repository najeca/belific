// Convert routines from the iPhone into repeating tasks, and undo it (checkpoint
// 10, 2.16.0). The plan is pure (routineConvert.ts); this file only writes it
// through the normal storage functions, so every row goes through the outbox
// and syncs like any other edit. No database contact of its own.
import { dateKey } from './kanban';
import { generateId } from './data';
import {
  addTask,
  copyRoutineCompletions,
  addRoutine,
  loadRoutinesRaw,
  loadTasksRaw,
  updateRoutine,
  updateTask,
} from './storage';
import {
  planConvert,
  planUndo,
  routineSummary,
  routineTombstone,
  type ConvertPlan,
  type RoutineSummary,
} from './routineConvert';

export interface RoutineState {
  summary: RoutineSummary;
  plan: ConvertPlan;
}

// What is there now, for the Settings page: the counts and the dry run.
export async function loadRoutineState(): Promise<RoutineState> {
  const [routines, tasks] = await Promise.all([loadRoutinesRaw(), loadTasksRaw()]);
  return {
    summary: routineSummary(routines, tasks),
    plan: planConvert(routines, tasks, dateKey(new Date()), new Date().toISOString()),
  };
}

// One at a time, so a double click can never run two conversions at once.
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn);
  chain = run.catch(() => {});
  return run;
}

// Converts every live routine. The plan is made from what is stored NOW, so a
// second run finds the series there and the routines gone and does nothing.
// The series are written first and the routine tombstones second. The
// tombstone is a direct write of the row: storage.deleteRoutine is never used
// because it also removes the routine's completions.
export function convertRoutines(): Promise<number> {
  return serial(async () => {
    const [routines, tasks] = await Promise.all([loadRoutinesRaw(), loadTasksRaw()]);
    const nowIso = new Date().toISOString();
    const plan = planConvert(routines, tasks, dateKey(new Date()), nowIso);
    for (const item of plan.items) if (item.series) await addTask(item.series);
    for (const item of plan.items) await updateRoutine(routineTombstone(item.routine, nowIso));
    return plan.items.length;
  });
}

// Undo: ends the series and gives each routine back as a new row, with its
// completions copied (a tombstone can never be cleared by sync, so the old row
// is not revived). The old routines and completions stay as they were.
export function undoConversion(): Promise<number> {
  return serial(async () => {
    const [routines, tasks] = await Promise.all([loadRoutinesRaw(), loadTasksRaw()]);
    const plan = planUndo(routines, tasks, new Date().toISOString(), generateId);
    for (const row of plan.taskRows) await updateTask(row);
    for (const routine of plan.routines) await addRoutine(routine);
    await copyRoutineCompletions(plan.copyFrom);
    return plan.count;
  });
}
