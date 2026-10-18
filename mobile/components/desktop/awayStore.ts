import { useEffect, useSyncExternalStore } from 'react';
import { loadAwayDays, setAway } from '../../lib/awayActions';

// The away days (2.27.0, item 8) for every pane at once: the Tasks strip, the
// Calendar, Daily Planning and the day menu read the same set, so marking a day
// shows everywhere straight away. Loaded from the settings rows on every
// change (refreshKey), so a day marked on the other computer shows after sync.
let days: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function reloadAwayDays(): Promise<void> {
  return loadAwayDays().then((d) => {
    days = d;
    listeners.forEach((l) => l());
  });
}

export async function markAway(day: string, away: boolean): Promise<void> {
  await setAway(day, away);
  await reloadAwayDays();
}

export function useAwayDays(refreshKey?: number): ReadonlySet<string> {
  useEffect(() => {
    reloadAwayDays();
  }, [refreshKey]);
  return useSyncExternalStore(subscribe, () => days, () => days);
}
