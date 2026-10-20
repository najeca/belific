// Per task reminder lead time (checkpoint 8.2, decisions 017 and 020). Pure.
// Task.reminderMinutes: undefined or null = default, -1 = off, 0 or more =
// minutes before the start time. Mirrored (as plain JS) by
// desktop/src/scheduler.js, which is what actually schedules.
//
// Part B, P5 (2.32.0): a task can have SEVERAL reminders, Task.reminders: whole
// minutes before the start (0 = at the start), distinct, at most five, ascending.
// Which list applies to a task (`effectiveReminders`):
//   1. Task.reminders when it is an array (an empty list means no reminder);
//   2. otherwise the legacy reminderMinutes: -1 = none, 0 or more = that one;
//   3. otherwise the default list (Settings, Notifications; "at the start" unless changed).
// Choosing reminders also writes the first one into reminderMinutes (`reminderPatch`), so an
// older desktop that only knows the single value still gets one sensible reminder.
export const MAX_TASK_REMINDERS = 5;
export const DEFAULT_REMINDERS: readonly number[] = [0];

// Whole minutes 0 to 1440, distinct, ascending, at most five; anything else is dropped.
export function normalizeReminders(list: unknown): number[] {
  if (!Array.isArray(list)) return [];
  const out = new Set<number>();
  for (const n of list) if (typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 1440) out.add(n);
  return [...out].sort((a, b) => a - b).slice(0, MAX_TASK_REMINDERS);
}

export function effectiveReminders(task: { reminders?: unknown; reminderMinutes?: number | null }, defaults: readonly number[] = DEFAULT_REMINDERS): number[] {
  if (Array.isArray(task.reminders)) return normalizeReminders(task.reminders);
  const v = task.reminderMinutes;
  if (typeof v === 'number' && Number.isInteger(v) && v >= -1 && v <= 1440) return v === -1 ? [] : [v];
  return normalizeReminders(defaults);
}

// Adds the lead when it is not in the list, removes it when it is. Never more than five.
export function toggleLead(list: readonly number[], lead: number): number[] {
  const has = list.includes(lead);
  return normalizeReminders(has ? list.filter((n) => n !== lead) : [...list, lead]);
}

// The fields to write: 'default' goes back to the default list; a list is stored as it is,
// with its first (smallest lead) mirrored into the legacy single value; an empty list is "none".
export function reminderPatch(choice: 'default' | readonly number[]): { reminders: number[] | undefined; reminderMinutes: number | undefined } {
  if (choice === 'default') return { reminders: undefined, reminderMinutes: undefined };
  const list = normalizeReminders(choice);
  return { reminders: list, reminderMinutes: list.length > 0 ? list[0] : -1 };
}

export function leadLabel(lead: number): string {
  if (lead === 0) return 'At start time';
  if (lead === 60) return '1 hour before';
  if (lead === 1440) return '1 day before';
  if (lead % 60 === 0) return `${lead / 60} hours before`;
  return `${lead} minutes before`;
}

// The leads a person can switch on or off (the list in the menu and in Settings).
export const REMINDER_LEADS: readonly number[] = [0, 5, 10, 15, 30, 60, 1440];

export function remindersText(list: readonly number[]): string {
  return list.length === 0 ? 'None' : list.map(leadLabel).join(', ');
}

// What the details row shows: the task's own list, or the default list in brackets.
export function taskRemindersLabel(task: { reminders?: unknown; reminderMinutes?: number | null }, defaults: readonly number[] = DEFAULT_REMINDERS): string {
  const own = Array.isArray(task.reminders) || reminderState(task.reminderMinutes) !== 'default';
  const list = effectiveReminders(task, defaults);
  return own ? remindersText(list) : `Default (${remindersText(list)})`;
}

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
