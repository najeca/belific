// Task timer maths (checkpoint 8.3, decision 022). Pure, no runtime imports;
// see timer.test.ts. Elapsed time is always computed from two timestamps
// (milliseconds since the epoch), never by counting ticks, so a closed app, a
// sleeping computer or a 30 second refresh cannot drift it, and a clock that
// goes backwards can never give a negative time.
//
// The running timer is local UI state (one key in the main process store); it
// is not synced. The only synced value is Task.actualSeconds.

export interface TimerState {
  taskId: string;
  startedAt: number;
}

// A run longer than this is probably a forgotten timer: it is never added
// automatically (the card asks first).
export const LONG_TIMER_SECONDS = 12 * 60 * 60;
// Upper bound of a stored Actual (a year); a typed value is at most 24h.
export const MAX_ACTUAL_SECONDS = 366 * 24 * 60 * 60;

export function elapsedSeconds(startedAt: number, now: number): number {
  if (!Number.isFinite(startedAt) || !Number.isFinite(now)) return 0;
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

// Longer than 12 hours (exactly 12 hours is not).
export function isLongRun(seconds: number): boolean {
  return seconds > LONG_TIMER_SECONDS;
}

export function addActual(actualSeconds: number | undefined, add: number): number {
  const base = Number.isFinite(actualSeconds) && (actualSeconds as number) > 0 ? Math.floor(actualSeconds as number) : 0;
  const extra = Number.isFinite(add) && add > 0 ? Math.floor(add) : 0;
  return Math.min(MAX_ACTUAL_SECONDS, base + extra);
}

// The Actual to show: stored seconds plus the running time, if this task is
// the one running.
export function liveActualSeconds(actualSeconds: number | undefined, timer: TimerState | null, taskId: string, now: number): number {
  const base = addActual(actualSeconds, 0);
  return timer && timer.taskId === taskId ? addActual(base, elapsedSeconds(timer.startedAt, now)) : base;
}

// A typed correction of the Actual shown: while this task's timer runs, the
// stored part is what makes the shown total equal the typed one.
export function storedForTyped(typedSeconds: number, runningSeconds: number): number {
  return addActual(undefined, Math.max(0, typedSeconds - Math.max(0, runningSeconds)));
}

// A stored timer is read back from disk: anything malformed is no timer.
export function parseTimer(raw: string | null): TimerState | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<TimerState> | null;
    if (v && typeof v.taskId === 'string' && v.taskId.length > 0 && typeof v.startedAt === 'number' && Number.isFinite(v.startedAt)) {
      return { taskId: v.taskId, startedAt: v.startedAt };
    }
  } catch {
    // fall through
  }
  return null;
}

// On startup (and whenever the tasks may have changed under it): a timer whose
// task is gone, deleted or completed is dropped, with no time added.
export function pruneTimer(
  timer: TimerState | null,
  task: { completed: boolean; deletedAt?: string } | undefined,
): TimerState | null {
  if (!timer) return null;
  if (!task || task.deletedAt || task.completed) return null;
  return timer;
}
