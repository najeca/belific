// The per task timer (build plan phase 1, migration 002). Pure: NO runtime
// imports so `node --test` runs it; see taskTimer.test.ts.
//
// A running timer is one field, timerStartedAt, synced like any other, so a
// timer started on the iPhone shows on Windows. Stopping it adds the elapsed
// WHOLE minutes to actualMinutes and clears timerStartedAt. Seconds below a
// minute are dropped, never rounded up: actual time is never overstated.
//
// A timer left running for more than a day (a forgotten timer, or a clock
// that is badly wrong) is never added silently: stopTimer returns 'confirm'
// and the UI asks what to add, then calls stopTimerWith.
import type { Task } from './types.ts';
import { MAX_ACTUAL_MINUTES } from './syncCore.ts';

export const STALE_TIMER_MS = 24 * 60 * 60 * 1000;

type TimerFields = Pick<Task, 'actualMinutes' | 'timerStartedAt'>;

export function isTimerRunning(task: TimerFields): boolean {
  return typeof task.timerStartedAt === 'string' && !Number.isNaN(Date.parse(task.timerStartedAt));
}

// Whole minutes since the start. A start in the future (the other device's
// clock is ahead) counts as 0, never negative.
export function elapsedMinutes(startedAt: string, nowMs: number): number {
  const start = Date.parse(startedAt);
  if (Number.isNaN(start) || nowMs <= start) return 0;
  return Math.floor((nowMs - start) / 60000);
}

// What a card shows while the timer runs: the stored total plus the time so far.
export function shownMinutes(task: TimerFields, nowMs: number): number {
  const base = task.actualMinutes ?? 0;
  return isTimerRunning(task) ? clampActual(base + elapsedMinutes(task.timerStartedAt as string, nowMs)) : base;
}

function clampActual(n: number): number {
  return Math.min(MAX_ACTUAL_MINUTES, Math.max(0, Math.floor(n)));
}

// Starting a running timer changes nothing (the first start stands).
export function startTimer<T extends TimerFields>(task: T, nowMs: number): T {
  if (isTimerRunning(task)) return task;
  return { ...task, timerStartedAt: new Date(nowMs).toISOString() };
}

export type StopResult<T> =
  | { kind: 'stopped'; task: T }
  | { kind: 'confirm'; elapsedMinutes: number }
  | { kind: 'notRunning' };

export function stopTimer<T extends TimerFields>(task: T, nowMs: number): StopResult<T> {
  if (!isTimerRunning(task)) return { kind: 'notRunning' };
  const start = Date.parse(task.timerStartedAt as string);
  const elapsed = elapsedMinutes(task.timerStartedAt as string, nowMs);
  if (nowMs - start > STALE_TIMER_MS) return { kind: 'confirm', elapsedMinutes: elapsed };
  return { kind: 'stopped', task: stopTimerWith(task, elapsed) };
}

// Stops the timer and adds exactly `addMinutes` (0 adds nothing).
export function stopTimerWith<T extends TimerFields>(task: T, addMinutes: number): T {
  const add = Number.isFinite(addMinutes) && addMinutes > 0 ? Math.floor(addMinutes) : 0;
  const { timerStartedAt: _stopped, ...rest } = task;
  return { ...(rest as T), actualMinutes: clampActual((task.actualMinutes ?? 0) + add) };
}

// Actual time typed by hand. Invalid input changes nothing (returns null).
export function setActualMinutes<T extends TimerFields>(task: T, minutes: number): T | null {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > MAX_ACTUAL_MINUTES) return null;
  return { ...task, actualMinutes: minutes };
}
