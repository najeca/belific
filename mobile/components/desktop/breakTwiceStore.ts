import { useSyncExternalStore } from 'react';
import { loadUserSettingsRaw, setUserSetting } from '../../lib/storage';
import { BREAK_TWICE_KEY, parseBreakTwice } from '../../lib/hosting';

// "Count minutes done during a break twice" (3.8.0, off by default), as a small module store like
// cutStore.ts. It is the user_settings row `planner.break_count_twice`, so it is the same on every
// computer (synced; no schema change). Off: a task during a break shares its minutes with the break and
// the day's planned time and Analytics count them once (lib/hosting.ts hostedEstimate).
let twice = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useBreakTwice = (): boolean => useSyncExternalStore(subscribe, () => twice, () => twice);
// For code outside a component's render (the planning flow's figures).
export const breakTwiceNow = (): boolean => twice;

export async function refreshBreakTwice(): Promise<void> {
  try {
    const row = (await loadUserSettingsRaw()).find((s) => s.key === BREAK_TWICE_KEY && !s.deletedAt);
    const next = parseBreakTwice(row?.value);
    if (next !== twice) {
      twice = next;
      emit();
    }
  } catch {
    // keep what is showing
  }
}

export async function setBreakTwice(on: boolean): Promise<void> {
  twice = on;
  emit();
  await setUserSetting(BREAK_TWICE_KEY, String(on));
}
