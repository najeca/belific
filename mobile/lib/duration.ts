// Task durations (checkpoint 4.1). Pure, no runtime imports; see
// duration.test.ts. A duration is whole minutes in Task.durationMinutes.
// The editor offers 30m, 1h, 2h and a Custom hours plus minutes picker in
// 30 minute steps, from 30 minutes to 24 hours. Values stored before that
// (15, 120 from the old "2h+" chip, anything else) load and display as they
// are; they are only rounded when the user picks a new duration.

export const DURATION_STEP = 30;
export const MIN_DURATION = 30;
export const MAX_DURATION = 24 * 60;

export const QUICK_DURATIONS = [
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '2h', minutes: 120 },
];

export const HOUR_OPTIONS = Array.from({ length: 25 }, (_, h) => h);
export const MINUTE_OPTIONS = [0, 30];

// 15 -> "15m", 60 -> "1h", 90 -> "1h 30m", 1440 -> "24h"
export function formatDuration(minutes?: number): string | undefined {
  if (!minutes || minutes <= 0 || !Number.isFinite(minutes)) return undefined;
  const m = Math.round(minutes);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h}h` : `${h}h ${rest}m`;
}

// "1h 30m", "45m", "2h", "1h30m" -> minutes; null if it is not a duration.
export function parseDuration(text: string): number | null {
  const m = /^\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?\s*$/i.exec(text);
  if (!m || (m[1] === undefined && m[2] === undefined)) return null;
  const total = Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
  return total > 0 ? total : null;
}

// Any number to a valid stored duration: 30 minute steps, 30 to 1440.
export function clampDuration(minutes: number): number {
  if (!Number.isFinite(minutes)) return MIN_DURATION;
  const stepped = Math.round(minutes / DURATION_STEP) * DURATION_STEP;
  return Math.min(MAX_DURATION, Math.max(MIN_DURATION, stepped));
}

// The Custom picker's two selects. 24 hours allows only 0 minutes; anything
// under 30 minutes becomes 30.
export function joinDuration(hours: number, minutes: number): number {
  const h = Math.min(24, Math.max(0, Math.floor(hours)));
  const m = h === 24 ? 0 : minutes >= 30 ? 30 : 0;
  return Math.max(MIN_DURATION, h * 60 + m);
}

// A duration shown in the Custom picker (a stored 15 shows as 0h 30m, 45 as
// 1h 0m after rounding; showing it does not change what is stored).
export function splitDuration(minutes: number | undefined): { hours: number; minutes: number } {
  const total = clampDuration(minutes ?? MIN_DURATION);
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

// Whether the Custom picker allows this pair (24h with 30 minutes is not).
export function isValidPick(hours: number, minutes: number): boolean {
  if (!MINUTE_OPTIONS.includes(minutes) || hours < 0 || hours > 24) return false;
  if (hours === 24 && minutes !== 0) return false;
  return hours * 60 + minutes >= MIN_DURATION;
}
