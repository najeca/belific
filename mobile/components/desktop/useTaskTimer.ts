import { useEffect, useState, useSyncExternalStore } from 'react';
import { subscribeTimer, timerSnapshot } from '../../lib/taskTimer';
import type { TimerState } from '../../lib/timer';

// The running timer (at most one, see lib/taskTimer.ts), shared by every card.
export function useRunningTimer(): TimerState | null {
  return useSyncExternalStore(subscribeTimer, timerSnapshot, () => null);
}

// The current time, refreshed every 30 seconds while `active` (a running
// timer's live Actual). Time shown is always computed from timestamps, so a
// slow or missed refresh only delays the display.
export function useNow(active: boolean, everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [active, everyMs]);
  return now;
}
