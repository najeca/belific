import { useSyncExternalStore } from 'react';
import { loadUserSettingsRaw, setUserSetting } from '../../lib/storage';
import { endPomodoro } from './pomodoroStore';
import { defaultFeatures, featureSettingKey, featureValue, featuresFromSettings, type FeatureKey, type FeatureMap } from '../../lib/features';

// The power feature toggles (build plan phase 7, lib/features.ts) as a small
// module store, so a card, a menu and the settings page all follow one value.
// Each toggle is a user_settings row `feature.<name>` (synced), read when the
// home screen opens and again whenever its data changes (a sync can bring a
// toggle from the other device). Until the first read the defaults apply, which
// are today's screens.
let features: FeatureMap = defaultFeatures();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useFeatures(): FeatureMap {
  return useSyncExternalStore(subscribe, () => features, () => features);
}
export function useFeature(key: FeatureKey): boolean {
  return useFeatures()[key];
}
export const getFeatures = (): FeatureMap => features;

function sameMap(a: FeatureMap, b: FeatureMap): boolean {
  return (Object.keys(a) as FeatureKey[]).every((k) => a[k] === b[k]);
}

export async function refreshFeatures(): Promise<void> {
  try {
    const next = featuresFromSettings(await loadUserSettingsRaw());
    if (!sameMap(next, features)) {
      features = next;
      emit();
    }
  } catch {
    // keep what is showing
  }
}

export async function setFeature(key: FeatureKey, on: boolean): Promise<void> {
  features = { ...features, [key]: on };
  emit();
  // Switching pomodoro off ends one in progress (the task timer itself carries on).
  if (key === 'pomodoro' && !on) endPomodoro();
  await setUserSetting(featureSettingKey(key), featureValue(on));
}
