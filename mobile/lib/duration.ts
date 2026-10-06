// Task durations (checkpoints 4.1 and 4.4). Pure, no runtime imports; see
// duration.test.ts. A duration is whole minutes in Task.durationMinutes, and
// it is optional: None (the default for a new task) stores nothing.
// The editor offers None, 15m, 30m, 1h, 2h and a Custom hours plus minutes
// picker in 5 minute steps, from 5 minutes to 24 hours (24h only with 0
// minutes). Any value stored before (15, 120 from the old "2h+" chip,
// anything else) loads and displays as it is; it only changes when the user
// picks a new duration.

export const DURATION_STEP = 5;
export const MIN_DURATION = 5;
export const MAX_DURATION = 24 * 60;
// What the Custom picker shows before anything is chosen.
export const CUSTOM_START = 30;

// The quick chips after None.
export const QUICK_DURATIONS = [
  { label: '15m', minutes: 15 },
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '2h', minutes: 120 },
];

export const HOUR_OPTIONS = Array.from({ length: 25 }, (_, h) => h);
// 0, 5, 10 ... 55
export const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, i) => i * 5);

// 10 -> "10m", 65 -> "1h 5m", 90 -> "1h 30m", 1440 -> "24h"; none -> undefined
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

// Any number to a valid picker duration: 5 minute steps, 5 to 1440.
export function clampDuration(minutes: number): number {
  if (!Number.isFinite(minutes)) return MIN_DURATION;
  const stepped = Math.round(minutes / DURATION_STEP) * DURATION_STEP;
  return Math.min(MAX_DURATION, Math.max(MIN_DURATION, stepped));
}

// The Custom picker's two selects. 24 hours allows only 0 minutes; minutes
// snap to the 5 minute options; anything under 5 minutes becomes 5.
export function joinDuration(hours: number, minutes: number): number {
  const h = Math.min(24, Math.max(0, Math.floor(hours)));
  const m = h === 24 ? 0 : Math.min(55, Math.max(0, Math.round(minutes / DURATION_STEP) * DURATION_STEP));
  return Math.max(MIN_DURATION, h * 60 + m);
}

// A duration shown in the Custom picker (an odd stored value such as 7 shows
// as 0h 5m; showing it does not change what is stored). None shows 0h 30m.
export function splitDuration(minutes: number | undefined): { hours: number; minutes: number } {
  const total = clampDuration(minutes ?? CUSTOM_START);
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

// Whether the Custom picker allows this pair (24h with any minutes is not).
export function isValidPick(hours: number, minutes: number): boolean {
  if (!MINUTE_OPTIONS.includes(minutes) || hours < 0 || hours > 24) return false;
  if (hours === 24 && minutes !== 0) return false;
  return hours * 60 + minutes >= MIN_DURATION;
}

// Whether a stored duration is one of the quick chips (otherwise the editor
// opens with Custom shown). None is not "custom".
export function isQuickDuration(minutes: number | undefined): boolean {
  return minutes === undefined || QUICK_DURATIONS.some((d) => d.minutes === minutes);
}
