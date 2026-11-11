import { useSyncExternalStore } from 'react';
import { loadUserSettingsRaw, setUserSetting } from '../../lib/storage';
import { FREE_TIME_LINE_KEY, parseFreeTimeLine } from '../../lib/planEntry';

// F1 of PLAN_daily_flow: whether the "Free time" line shows at the foot of a day column (Settings, Planning). Off by
// default. It is a user_settings row (`board.free_time_line`, synced, no schema change), as a small module store like
// cutStore.ts. The gaps on the Calendar and Timebox stay the only sign of a break either way.
let on = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useFreeTimeLine = (): boolean => useSyncExternalStore(subscribe, () => on, () => on);

export async function refreshFreeTimeLine(): Promise<void> {
  try {
    const row = (await loadUserSettingsRaw()).find((s) => s.key === FREE_TIME_LINE_KEY && !s.deletedAt);
    const next = parseFreeTimeLine(row?.value);
    if (next !== on) {
      on = next;
      emit();
    }
  } catch {
    // keep what is showing
  }
}

export async function setFreeTimeLine(next: boolean): Promise<void> {
  on = next;
  emit();
  await setUserSetting(FREE_TIME_LINE_KEY, String(next));
}
