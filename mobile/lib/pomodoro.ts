// Pomodoro on the task timer (build plan phase 7). Pure: NO runtime imports
// besides siblings; see pomodoro.test.ts.
//
// A pomodoro is NOT a second timer. It is a countdown laid over the ONE task
// timer that already exists (taskTimer.ts, timerSession.ts):
//  - A FOCUS period starts the task's timer through the normal exclusive start
//    (so the one-timer-at-a-time rule holds: starting it stops any other timer)
//    and counts 25 minutes down.
//  - When the focus period ends the person chooses: take a break (the task's
//    timer is stopped, which adds the elapsed whole minutes exactly like every other stop
//    does: rounded down, a future start counting 0, over 24 hours asking first)
//    or keep going (a new focus period; the timer just keeps running).
//  - During a BREAK no task timer runs, so a break can never overlap one.
//  - After the break the person starts the next focus period (a normal start).
// The pomodoro itself never writes a minute. Everything it knows is a small
// local state (not synced: it is this device's countdown). It ends the moment
// the timer it is laid over is stopped, or another task's timer starts: what the
// person does with the timer always wins.
import type { Task } from './types.ts';

export const DEFAULT_FOCUS_MINUTES = 25;
export const DEFAULT_BREAK_MINUTES = 5;

export type PomodoroPhase = 'focus' | 'break';

export interface Pomodoro {
  taskId: string;
  phase: PomodoroPhase;
  // When this phase began, ms since the epoch.
  startedMs: number;
  focusMinutes: number;
  breakMinutes: number;
  // Focus periods begun so far (1 for the first).
  cycle: number;
}

export function startPomodoro(taskId: string, nowMs: number, focusMinutes = DEFAULT_FOCUS_MINUTES, breakMinutes = DEFAULT_BREAK_MINUTES): Pomodoro {
  return { taskId, phase: 'focus', startedMs: nowMs, focusMinutes: clampMinutes(focusMinutes, DEFAULT_FOCUS_MINUTES), breakMinutes: clampMinutes(breakMinutes, DEFAULT_BREAK_MINUTES), cycle: 1 };
}

function clampMinutes(v: number, fallback: number): number {
  return Number.isInteger(v) && v >= 1 && v <= 180 ? v : fallback;
}

export function phaseSeconds(p: Pomodoro): number {
  return (p.phase === 'focus' ? p.focusMinutes : p.breakMinutes) * 60;
}

// Whole seconds left in this phase (0 when it is over). A start in the future
// (a clock change) counts as the full phase.
export function remainingSeconds(p: Pomodoro, nowMs: number): number {
  const elapsed = Math.max(0, Math.floor((nowMs - p.startedMs) / 1000));
  return Math.max(0, phaseSeconds(p) - elapsed);
}

export function isPhaseOver(p: Pomodoro, nowMs: number): boolean {
  return remainingSeconds(p, nowMs) === 0;
}

// After a focus period: keep going (a new focus period, the timer untouched).
export function keepGoing(p: Pomodoro, nowMs: number): Pomodoro {
  return { ...p, phase: 'focus', startedMs: nowMs, cycle: p.cycle + 1 };
}

// After a focus period: a break. The CALLER stops the task timer first (the
// ordinary stop, which adds the whole minutes).
export function beginBreak(p: Pomodoro, nowMs: number): Pomodoro {
  return { ...p, phase: 'break', startedMs: nowMs };
}

// After a break: the next focus period. The CALLER starts the task timer (the
// ordinary exclusive start).
export function nextFocus(p: Pomodoro, nowMs: number): Pomodoro {
  return { ...p, phase: 'focus', startedMs: nowMs, cycle: p.cycle + 1 };
}

// Does the pomodoro still stand, given which task timers are running?
//  - focus: only while ITS task's timer runs and no other timer runs;
//  - break: only while NO task timer runs (the person starting one ends it).
export function stillStands(p: Pomodoro, running: Array<Pick<Task, 'id'>>): boolean {
  if (p.phase === 'focus') return running.some((t) => t.id === p.taskId) && running.every((t) => t.id === p.taskId);
  return running.length === 0;
}

export function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return `${m}:${String(seconds % 60).padStart(2, '0')}`;
}

export function describe(p: Pomodoro, nowMs: number): string {
  const left = remainingSeconds(p, nowMs);
  if (p.phase === 'focus') return left === 0 ? '🍅 Focus time is up' : `🍅 Focus ${clock(left)} left`;
  return left === 0 ? '☕ Break is over' : `☕ Break ${clock(left)} left`;
}

// ---- remembered locally across a restart (this device only) ----
export const POMODORO_KEY = 'belific_desktop_pomodoro';

export function serializePomodoro(p: Pomodoro | null): string {
  return p ? JSON.stringify(p) : '';
}

export function parsePomodoro(raw: string | null | undefined): Pomodoro | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<Pomodoro>;
    if (typeof o.taskId !== 'string' || !o.taskId || (o.phase !== 'focus' && o.phase !== 'break')) return null;
    if (typeof o.startedMs !== 'number' || !Number.isFinite(o.startedMs)) return null;
    return {
      taskId: o.taskId,
      phase: o.phase,
      startedMs: o.startedMs,
      focusMinutes: clampMinutes(o.focusMinutes as number, DEFAULT_FOCUS_MINUTES),
      breakMinutes: clampMinutes(o.breakMinutes as number, DEFAULT_BREAK_MINUTES),
      cycle: Number.isInteger(o.cycle) && (o.cycle as number) >= 1 ? (o.cycle as number) : 1,
    };
  } catch {
    return null;
  }
}
