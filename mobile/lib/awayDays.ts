// Away days (2.27.0, item 8). Stored with existing storage only: one
// user_settings row per day, key "away.YYYY-MM-DD", value "1" (away) or "0" (not
// away any more). No schema change. A value is written rather than a tombstone
// because sync lets a tombstone win, which would stop a day being marked away
// again. An older Belific reads only the keys it knows (feature.*, template.*,
// ui.panes, calendar.feed_token), so it ignores these rows and keeps them as
// they are when it syncs. Pure: NO runtime imports besides siblings; see
// awayDays.test.ts.
import type { UserSetting } from './types.ts';
import { isDateKey } from './kanban.ts';

export const AWAY_PREFIX = 'away.';

export function awayKey(day: string): string {
  return `${AWAY_PREFIX}${day}`;
}

// The days marked away, from the stored settings rows.
export function awayDaysFrom(settings: Pick<UserSetting, 'key' | 'value' | 'deletedAt'>[]): Set<string> {
  const out = new Set<string>();
  for (const s of settings) {
    if (s.deletedAt || !s.key.startsWith(AWAY_PREFIX)) continue;
    const day = s.key.slice(AWAY_PREFIX.length);
    if (isDateKey(day) && s.value === '1') out.add(day);
  }
  return out;
}

export const AWAY_ADD_WARNING = 'This is an away day. The task is added anyway.';
