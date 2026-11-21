// What Today stores and cleans, for both apps (PLAN_desktop_parity D1, 3.66.0). Moved out of the phone's today.tsx.
import { deleteUserSetting, loadUserSetting, loadUserSettingsRaw, setUserSetting } from './storage';
import { orderKey, parseOrder } from './anytimeOrder';
import { todaySettings } from './todayModel';

// The stored Anytime order of the day and the hours switches; the order rows of days long gone are deleted (they sync
// like any setting).
export async function loadTodaySettings(todayKey: string): Promise<{ order: string[]; hoursStored: Map<string, string> }> {
  const order = parseOrder(await loadUserSetting(orderKey(todayKey)));
  const { hoursStored, stale } = todaySettings(await loadUserSettingsRaw(), todayKey);
  for (const k of stale) await deleteUserSetting(k);
  return { order, hoursStored };
}

export async function saveAnytimeOrder(todayKey: string, keys: string[]): Promise<void> {
  await setUserSetting(orderKey(todayKey), JSON.stringify(keys));
}
