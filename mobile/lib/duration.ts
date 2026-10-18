// Task durations (checkpoints 4.1, 4.4 and 8.3). Pure, no runtime imports; see
// duration.test.ts. A duration is whole minutes in Task.durationMinutes, and
// it is optional: no duration (the default for a new task) stores nothing.
// Typing accepts any whole minute from 1 to 1440 in the forms listed at
// parseDuration; the preset list is only a shortcut. Any value stored before
// (15, 120, 7, anything else) loads and displays as it is.

export const MIN_DURATION = 1;
export const MAX_DURATION = 24 * 60;

// The dropdown's preset list, in order (build plan phase 2: 5m, 10m, 15m, 30m,
// 45m, 1h, 1.5h, 2h; "custom" is the typed field above the list). Anything
// stored earlier (20 min, 3h, 4h, 7...) still loads and displays as it is.
export const DURATION_PRESETS = [5, 10, 15, 30, 45, 60, 90, 120];

function wholeMinutes(minutes?: number): number | undefined {
  if (minutes === undefined || minutes === null || !Number.isFinite(minutes) || minutes <= 0) return undefined;
  return Math.round(minutes);
}

// 10 -> "10m", 65 -> "1h 5m", 90 -> "1h 30m", 1440 -> "24h"; none -> undefined
export function formatDuration(minutes?: number): string | undefined {
  const m = wholeMinutes(minutes);
  if (m === undefined) return undefined;
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h}h` : `${h}h ${rest}m`;
}

// The chip text: H:MM. 15 -> "0:15", 90 -> "1:30", 1440 -> "24:00"; no
// duration -> "0:00".
export function formatClock(minutes?: number): string {
  const m = wholeMinutes(minutes) ?? 0;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

// The time drop-down's list (2.27.1), in order: 5 to 45 minutes, then 1 hour to
// 4 hours in 15 minute steps, then 5, 6 and 8 hours. "Custom" and "Clear" follow
// it in the drop-down. Anything else stored before still loads and displays.
export const TIME_CHOICES: readonly number[] = [
  5, 10, 15, 20, 30, 45,
  ...Array.from({ length: 13 }, (_, i) => 60 + i * 15),
  300, 360, 480,
];

// The drop-down's short text: 45 -> "45 min", 60 -> "1 h", 90 -> "1 h 30",
// 65 -> "1 h 05"; none -> undefined.
export function shortDuration(minutes?: number): string | undefined {
  const m = wholeMinutes(minutes);
  if (m === undefined) return undefined;
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} h` : `${h} h ${String(rest).padStart(2, '0')}`;
}

// "45 min", "1h", "1h 30m": the preset list's labels.
export function presetLabel(minutes: number): string {
  return minutes < 60 ? `${minutes} min` : (formatDuration(minutes) as string);
}

const MINUTE_UNIT = '(?:m|min|mins|minute|minutes)';
const HOUR_UNIT = '(?:h|hr|hrs|hour|hours)';
const RE_COLON = /^(\d{1,2}):([0-5]\d)$/;
const RE_DECIMAL_HOURS = new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*${HOUR_UNIT}$`, 'i');
const RE_PARTS = new RegExp(`^(?:(\\d+)\\s*${HOUR_UNIT})?\\s*(?:(\\d+)\\s*(?:${MINUTE_UNIT})?)?$`, 'i');

// Typed text to whole minutes, or null when it is not a duration. Accepts
// "45m", "45", "1h", "1h 30m", "1h30", "1.5h", "130" (a bare number is
// minutes) and "1:30". A valid result is a whole minute from 1 to 1440.
export function parseDuration(text: string): number | null {
  const s = String(text ?? '').trim();
  if (s === '') return null;
  let total: number | null = null;
  let m: RegExpExecArray | null;
  if ((m = RE_COLON.exec(s))) {
    total = Number(m[1]) * 60 + Number(m[2]);
  } else if ((m = RE_DECIMAL_HOURS.exec(s))) {
    total = Math.round(Number(m[1]) * 60);
  } else if ((m = RE_PARTS.exec(s)) && (m[1] !== undefined || m[2] !== undefined)) {
    total = Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
  }
  if (total === null || !Number.isFinite(total)) return null;
  return total >= MIN_DURATION && total <= MAX_DURATION ? total : null;
}
