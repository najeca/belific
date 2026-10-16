import { loadTasksRaw } from './storage';
import { patchTask } from './taskActions';
import { planStart, stoppedFields } from './timerSession';
import { setActualMinutes, stopTimerWith } from './taskTimer';

// Starting and stopping a task's timer (build plan phase 2). Desktop only: the
// iPhone gets timers in its own adaptation step. The rules are pure
// (timerSession.ts, taskTimer.ts); this file only reads the stored tasks and
// writes the edits through patchTask, which reads each task fresh, so two quick
// edits never overwrite each other.
//
// Every write is one patchTask per task, so a timer start or stop reaches the
// outbox like any other edit and syncs (timerStartedAt, actualMinutes).
export type TimerOutcome =
  | { kind: 'started' }
  | { kind: 'stopped' }
  // A timer ran for more than 24 hours: nothing was written. The caller asks
  // what to add and then calls confirmStaleStop.
  | { kind: 'confirm'; taskId: string; elapsedMinutes: number }
  | { kind: 'missing' }
  | { kind: 'notRunning' };

export async function startTimerFor(id: string, nowMs: number = Date.now()): Promise<TimerOutcome> {
  const plan = planStart(await loadTasksRaw(), id, nowMs);
  if (plan.kind === 'missing') return { kind: 'missing' };
  if (plan.kind === 'confirm') return { kind: 'confirm', taskId: plan.taskId, elapsedMinutes: plan.elapsedMinutes };
  for (const p of plan.patches) await patchTask(p.id, p.fields);
  return { kind: 'started' };
}

export async function stopTimerFor(id: string, nowMs: number = Date.now()): Promise<TimerOutcome> {
  const task = (await loadTasksRaw()).find((t) => t.id === id && !t.deletedAt);
  if (!task) return { kind: 'missing' };
  const r = stoppedFields(task, nowMs);
  if (r.kind === 'notRunning') return { kind: 'notRunning' };
  if (r.kind === 'confirm') return { kind: 'confirm', taskId: id, elapsedMinutes: r.elapsedMinutes };
  await patchTask(id, r.fields);
  return { kind: 'stopped' };
}

// The person's answer to "this timer ran for more than a day": add this many
// minutes (0 adds nothing) and stop it.
export async function confirmStaleStop(id: string, addMinutes: number): Promise<void> {
  const task = (await loadTasksRaw()).find((t) => t.id === id && !t.deletedAt);
  if (!task) return;
  const stopped = stopTimerWith(task, addMinutes);
  await patchTask(id, { actualMinutes: stopped.actualMinutes, timerStartedAt: undefined });
}

// Actual time typed by hand. Returns false (and writes nothing) for a value
// that is not a whole number of minutes from 0 up.
export async function setActualFor(id: string, minutes: number): Promise<boolean> {
  const task = (await loadTasksRaw()).find((t) => t.id === id && !t.deletedAt);
  if (!task) return false;
  const next = setActualMinutes(task, minutes);
  if (!next) return false;
  await patchTask(id, { actualMinutes: next.actualMinutes });
  return true;
}
