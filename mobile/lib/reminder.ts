// Per task reminder lead time (checkpoint 8.2, decisions 017 and 020). Pure.
// Task.reminderMinutes: undefined or null = default, -1 = off, 0 or more =
// minutes before the start time. Mirrored (as plain JS) by
// desktop/src/scheduler.js, which is what actually schedules.

export type ReminderChoice = 'default' | 'off' | number;

export interface ReminderOption {
  key: string;
  label: string;
  value: number | null | undefined;
  // Needs a start time (a lead before "no time" means nothing).
  needsStart: boolean;
}

export const REMINDER_OPTIONS: ReminderOption[] = [
  { key: 'none', label: 'None', value: -1, needsStart: false },
  { key: 'start', label: 'At start time', value: 0, needsStart: true },
  { key: '5', label: '5 minutes before', value: 5, needsStart: true },
  { key: '10', label: '10 minutes before', value: 10, needsStart: true },
  { key: '30', label: '30 minutes before', value: 30, needsStart: true },
  { key: '60', label: '1 hour before', value: 60, needsStart: true },
];

export function reminderState(v: number | null | undefined): 'default' | 'set' | 'off' {
  if (v === undefined || v === null || !Number.isInteger(v) || v < -1) return 'default';
  return v === -1 ? 'off' : 'set';
}

// Milliseconds before the start, or null when the reminder is off.
export function leadMs(v: number | null | undefined): number | null {
  const s = reminderState(v);
  if (s === 'off') return null;
  return s === 'set' ? (v as number) * 60_000 : 0;
}

// When the toast fires for a placed task (epoch ms), or null when off.
export function notifyAt(startMs: number, v: number | null | undefined): number | null {
  const lead = leadMs(v);
  return lead === null ? null : startMs - lead;
}

export function reminderLabel(v: number | null | undefined): string {
  const s = reminderState(v);
  if (s === 'default') return 'Default';
  if (s === 'off') return 'None';
  return REMINDER_OPTIONS.find((o) => o.value === v)?.label ?? `${v} minutes before`;
}

// Is the option selectable for this task. Options that need a start time are
// disabled when the task has none (the dropdown then shows the quiet note).
export function optionEnabled(o: ReminderOption, hasStart: boolean): boolean {
  return !o.needsStart || hasStart;
}

export const NO_START_NOTE = 'Reminds at your daily reminder time';
