import { useEffect, useState } from 'react';
import { loadTasksRaw } from '../../lib/storage';
import { startTimerFor, stopTimerFor, confirmStaleStop } from '../../lib/timerActions';
import { runningTasks } from '../../lib/timerSession';
import type { Task } from '../../lib/types';
import { askTimerConfirm, clearTimerConfirm, notifyChanged, type TimerConfirm } from './uiStore';

// Start or stop a task's timer from anywhere on the home screen (the card, the
// details panel, the shortcut, the floating widget). A timer that ran for more
// than a day is never added silently: the outcome is a question, shown by the
// floating widget, and answered with answerTimerConfirm.
export async function toggleTimer(task: Pick<Task, 'id' | 'timerStartedAt'>): Promise<void> {
  const running = typeof task.timerStartedAt === 'string';
  const outcome = running ? await stopTimerFor(task.id) : await startTimerFor(task.id);
  if (outcome.kind === 'confirm') {
    // Stopping this one asks about it; starting this one asks about the OTHER
    // task that ran for over a day, then starts this one.
    const c: TimerConfirm = { taskId: outcome.taskId, elapsedMinutes: outcome.elapsedMinutes };
    if (!running) c.thenStart = task.id;
    askTimerConfirm(c);
    return;
  }
  notifyChanged();
}

export async function stopOneTimer(taskId: string): Promise<void> {
  const outcome = await stopTimerFor(taskId);
  if (outcome.kind === 'confirm') askTimerConfirm({ taskId, elapsedMinutes: outcome.elapsedMinutes });
  else notifyChanged();
}

// The answer to a stale timer: add this many minutes (0 for none).
export async function answerTimerConfirm(c: TimerConfirm, addMinutes: number): Promise<void> {
  clearTimerConfirm();
  await confirmStaleStop(c.taskId, addMinutes);
  if (c.thenStart) await startTimerFor(c.thenStart);
  notifyChanged();
}

// Ticks once a second while `active`, so a running timer's seconds move.
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

// The running timers, read from the stored tasks: on every change of the data
// and every few seconds (a timer started on another device arrives with a
// sync). Nothing is held in memory, so after a restart the same timer is found.
export function useRunningTimers(refreshKey: number): Task[] {
  const [running, setRunning] = useState<Task[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () =>
      loadTasksRaw()
        .then((tasks) => {
          if (!alive) return;
          const next = runningTasks(tasks);
          setRunning((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 8000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [refreshKey]);
  return running;
}

// A clock that moves every `ms` milliseconds, for totals that include a running
// timer (they move a little at a time, so a slow tick is enough).
export function useTick(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
