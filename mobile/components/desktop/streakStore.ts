import { useMemo, useSyncExternalStore } from 'react';
import { rootTaskId } from '../../lib/recurrence';
import type { SeriesStreak } from '../../lib/seriesStreak';
import type { Task } from '../../lib/types';

// The streaks of every live series, worked out once per refresh by DesktopHome
// (lib/seriesStreak.ts, checkpoint 11) and read by the cards, the block popover
// and the Progress page. Derived from rows that already exist: nothing here is
// stored or synced. `show` is the "Show streaks" setting (desktop only); it hides
// the lines on cards and blocks, never the Progress page.
interface State {
  streaks: Map<string, SeriesStreak>;
  show: boolean;
  day: string;
}

let state: State = { streaks: new Map(), show: true, day: '' };
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const emit = () => listeners.forEach((l) => l());

export function setStreaks(streaks: Map<string, SeriesStreak>, day: string): void {
  state = { ...state, streaks, day };
  emit();
}

export function setShowStreaks(show: boolean): void {
  if (state.show === show) return;
  state = { ...state, show };
  emit();
}

function useState_(): State {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

// The series this task belongs to, or undefined (not a series, or no streak).
export function useSeriesStreak(task: Pick<Task, 'id' | 'recurrence'>): SeriesStreak | undefined {
  const s = useState_();
  return useMemo(() => (task.recurrence ? s.streaks.get(rootTaskId(task.id)) : undefined), [s.streaks, task.id, task.recurrence]);
}

// The day the streaks were worked out for (today, a local date key).
export function useStreakDay(): string {
  return useState_().day;
}

export function useShowStreaks(): boolean {
  return useState_().show;
}

export function useAllStreaks(): { streaks: SeriesStreak[]; today: string } {
  const s = useState_();
  return useMemo(() => ({ streaks: [...s.streaks.values()], today: s.day }), [s.streaks, s.day]);
}
