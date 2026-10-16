import { useSyncExternalStore } from 'react';
import { kv } from '../../lib/kv';
import { startTimerFor, stopTimerFor } from '../../lib/timerActions';
import { POMODORO_KEY, beginBreak, keepGoing, nextFocus, parsePomodoro, serializePomodoro, startPomodoro, stillStands, type Pomodoro } from '../../lib/pomodoro';
import type { Task } from '../../lib/types';
import { askTimerConfirm, notifyChanged } from './uiStore';

// The pomodoro on this device (build plan phase 7, lib/pomodoro.ts): a countdown
// laid over the ONE task timer. This module only holds the countdown and calls
// the ordinary timer commands (timerActions.ts), so the one timer rule, the
// whole minute rounding and the "over 24 hours asks first" rule are the timer's
// own. The state is remembered on this device (kv, never synced) so a restart
// finds it again.
let state: Pomodoro | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const usePomodoro = (): Pomodoro | null => useSyncExternalStore(subscribe, () => state, () => state);
export const getPomodoro = (): Pomodoro | null => state;

function set(next: Pomodoro | null): void {
  state = next;
  emit();
  (next ? kv.setItem(POMODORO_KEY, serializePomodoro(next)) : kv.removeItem(POMODORO_KEY)).catch(() => {});
}

export async function restorePomodoro(): Promise<void> {
  try {
    const p = parsePomodoro(await kv.getItem(POMODORO_KEY));
    if (p && !state) {
      state = p;
      emit();
    }
  } catch {
    // none
  }
}

// A focus period on a task: its timer is started the ordinary way (which stops
// any other timer first and asks about one left running over a day). If the
// timer is asking a question instead, no pomodoro begins; press it again after.
export async function startFocus(task: Pick<Task, 'id'>): Promise<'started' | 'asked' | 'missing'> {
  const outcome = await startTimerFor(task.id);
  if (outcome.kind === 'confirm') {
    askTimerConfirm({ taskId: outcome.taskId, elapsedMinutes: outcome.elapsedMinutes, thenStart: task.id });
    return 'asked';
  }
  if (outcome.kind !== 'started') return 'missing';
  set(startPomodoro(task.id, Date.now()));
  notifyChanged();
  return 'started';
}

// After a focus period: stop the task timer (the ordinary stop, adding whole
// minutes) and begin the break. If the timer asks about a day-old run instead,
// the pomodoro simply ends and the question is shown.
export async function takeBreak(): Promise<void> {
  const p = state;
  if (!p) return;
  const outcome = await stopTimerFor(p.taskId);
  if (outcome.kind === 'confirm') {
    askTimerConfirm({ taskId: outcome.taskId, elapsedMinutes: outcome.elapsedMinutes });
    set(null);
    return;
  }
  set(beginBreak(p, Date.now()));
  notifyChanged();
}

export function keepFocusing(): void {
  if (state) set(keepGoing(state, Date.now()));
}

// After a break: the next focus period, starting the task's timer again.
export async function startNextFocus(): Promise<void> {
  const p = state;
  if (!p) return;
  const outcome = await startTimerFor(p.taskId);
  if (outcome.kind === 'started') {
    set(nextFocus(p, Date.now()));
    notifyChanged();
  } else if (outcome.kind === 'confirm') {
    askTimerConfirm({ taskId: outcome.taskId, elapsedMinutes: outcome.elapsedMinutes, thenStart: p.taskId });
    set(null);
  } else set(null);
}

export function endPomodoro(): void {
  if (state) set(null);
}

// Called with the timers that are running: a pomodoro that no longer stands
// (its timer was stopped, or another task's timer started) ends. Not in the
// first seconds of a phase, while the list of running timers catches up.
const GRACE_MS = 6000;
export function reconcilePomodoro(running: Array<Pick<Task, 'id'>>, nowMs: number): void {
  const p = state;
  if (!p || nowMs - p.startedMs < GRACE_MS) return;
  if (!stillStands(p, running)) set(null);
}
