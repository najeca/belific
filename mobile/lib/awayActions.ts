import { loadUserSettingsRaw, setUserSetting } from './storage';
import { awayDaysFrom, awayKey } from './awayDays';

// Away days (2.27.0, item 8), stored as user_settings rows (lib/awayDays.ts):
// they sync to the other computer like any setting. No schema change.

export async function loadAwayDays(): Promise<Set<string>> {
  return awayDaysFrom(await loadUserSettingsRaw());
}

export function setAway(day: string, away: boolean): Promise<void> {
  return setUserSetting(awayKey(day), away ? '1' : '0');
}
