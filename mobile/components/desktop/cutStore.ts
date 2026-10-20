import { useSyncExternalStore } from 'react';
import { loadUserSettingsRaw, setUserSetting } from '../../lib/storage';
import { CUT_MIN_KEY, DEFAULT_CUT_MIN, parseCutMin, type CutMin } from '../../lib/cuts';

// The smallest piece "Cut tasks underneath" may leave (15, 30 or 60 minutes, default 30),
// as a small module store like featureStore.ts. It is the user_settings row
// `planner.cut_min`, so it is the same on every computer (synced; no schema change).
let cutMin: CutMin = DEFAULT_CUT_MIN;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useCutMin = (): CutMin => useSyncExternalStore(subscribe, () => cutMin, () => cutMin);

export async function refreshCutMin(): Promise<void> {
  try {
    const row = (await loadUserSettingsRaw()).find((s) => s.key === CUT_MIN_KEY && !s.deletedAt);
    const next = parseCutMin(row?.value);
    if (next !== cutMin) {
      cutMin = next;
      emit();
    }
  } catch {
    // keep what is showing
  }
}

export async function setCutMin(n: CutMin): Promise<void> {
  cutMin = n;
  emit();
  await setUserSetting(CUT_MIN_KEY, String(n));
}
