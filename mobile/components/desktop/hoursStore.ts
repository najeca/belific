import { useSyncExternalStore } from 'react';
import { loadUserSettingsRaw, setUserSetting } from '../../lib/storage';
import { hoursCountKey, HOURS_COUNT_PREFIX } from '../../lib/labelHours';

// D3 of PLAN_desktop_parity (3.67.0): the "Count in daily hours" switches on the desktop (Settings, Daily hours, and the
// label form). The same synced user_settings rows the phone writes, `hours.count.<labelKey>` = `on` or `off`; with no
// row, Sleep and Break are off and every other label is on (lib/labelHours.ts countsInHours). The Today view reads them
// through lib/todayModelActions.ts; a change here asks it to reload.
let stored: Map<string, string> = new Map();
let nonce = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export async function loadHoursStored(): Promise<Map<string, string>> {
  const rows = await loadUserSettingsRaw();
  stored = new Map(rows.filter((r) => !r.deletedAt && r.key.startsWith(HOURS_COUNT_PREFIX)).map((r) => [r.key.slice(HOURS_COUNT_PREFIX.length), r.value]));
  emit();
  return stored;
}

export async function setHoursCount(labelKey: string, on: boolean): Promise<void> {
  stored = new Map(stored).set(labelKey, on ? 'on' : 'off');
  nonce += 1;
  emit();
  await setUserSetting(hoursCountKey(labelKey), on ? 'on' : 'off');
}

export const useHoursStored = (): Map<string, string> => useSyncExternalStore(subscribe, () => stored, () => stored);
// Bumped on every switch, so the Today view reloads its strip.
export const useHoursNonce = (): number => useSyncExternalStore(subscribe, () => nonce, () => 0);
