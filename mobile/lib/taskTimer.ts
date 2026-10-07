import { kv } from './kv';
import { loadTasksRaw, updateTask } from './storage';
import type { TimerState } from './timer';
import { createTimerController } from './timerController';

// The real timer (checkpoint 8.3, decision 022): the rules in
// timerController.ts bound to the clock, one key in the main process store
// (kv, so it survives closing the app, and is never synced) and the task
// storage. The window reads the running timer through useTimer.
const TIMER_KEY = 'belific_timer';

let shown: TimerState | null = null;
const listeners = new Set<() => void>();

export const taskTimer = createTimerController({
  now: () => Date.now(),
  readTimer: async () => {
    try {
      return await kv.getItem(TIMER_KEY);
    } catch {
      return null;
    }
  },
  writeTimer: async (value) => {
    try {
      if (value === null) await kv.removeItem(TIMER_KEY);
      else await kv.setItem(TIMER_KEY, value);
    } catch {
      // The timer is a convenience; a failed write must never break a card.
    }
  },
  readTask: async (id) => (await loadTasksRaw()).find((t) => t.id === id),
  writeActual: async (id, seconds) => {
    const t = (await loadTasksRaw()).find((x) => x.id === id && !x.deletedAt);
    if (t) await updateTask({ ...t, actualSeconds: seconds });
  },
  onChange: (t) => {
    shown = t;
    listeners.forEach((l) => l());
  },
});

export function subscribeTimer(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function timerSnapshot(): TimerState | null {
  return shown;
}

