// The time of a repeating task, with no question asked (3.20.0; it replaces the "This day only / All days"
// popup of 3.4.0). Pure (no React Native), see seriesTime.test.ts. The rules:
//  - Dragging, dropping, resizing or nudging one day changes that day only ('day' edits).
//  - The FIRST time of a series (its template has no start time yet) goes to every repeat day, however it is
//    set (the details, a drop from the list or on a timeless chip).
//  - A later time or length from the details ('panel' edits) goes to every repeat day that was not changed on
//    its own: a moved day, or a stored day whose time differs from the series, keeps its own time.
//  - An edit made on a day that has its own time changes that day only.
// No new column: "changed on its own" is read from the rows (a moved row, or a time that differs from the
// template), so it works on every device and with data written by older versions.
import type { Task } from './types.ts';
import { isMovedRow, seriesEditTargets, seriesOfRows, templatePatch } from './series.ts';
import { rootTaskId } from './recurrence.ts';

// The fields whose change is a "time edit": the time and the length of the day.
const EDIT_KEYS = ['startTime', 'durationMinutes', 'extraTimes', 'timesDone'] as const;
export const TIME_FIELDS = ['startTime', 'durationMinutes', 'extraTimes'] as const;

export function isTimeEdit(fields: object): boolean {
  const keys = Object.keys(fields);
  return keys.length > 0 && keys.every((k) => (EDIT_KEYS as readonly string[]).includes(k)) && keys.some((k) => k !== 'timesDone');
}

export const SERIES_TIME_NOTE = 'Applied to every repeat day. Days you moved keep their own time.';
export const OWN_TIME_NOTE = 'This day has its own time. Changes here apply to this day only.';

const sameTimes = (a?: string[], b?: string[]) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

// Does this stored day carry a time of its own (a moved day, or a time other than the series' one)?
export function hasOwnTime(row: Task, template: Task): boolean {
  if (row.id === template.id) return false;
  if (isMovedRow(row)) return true;
  return row.startTime !== template.startTime || row.durationMinutes !== template.durationMinutes || !sameTimes(row.extraTimes, template.extraTimes);
}

// The rows of one root and the series they make, or null when there is none (an undated repeating task).
function seriesOf(rows: Task[]) {
  if (rows.length === 0) return null;
  return seriesOfRows(rootTaskId(rows[0].id), rows);
}

// Has the series no time yet? (Its template has no start time.)
export function seriesHasNoTime(rows: Task[]): boolean {
  const series = seriesOf(rows);
  return !!series && !series.template.startTime;
}

export type TimeScope = 'series' | 'day' | 'plain';

// Which way a time edit goes. 'plain': the task has no series yet (no dated row), so it is an ordinary edit.
// `id` is the card's own id; `source` is where the edit came from.
export function timeEditScope(rows: Task[], id: string, fields: Partial<Task>, source: 'day' | 'panel'): TimeScope {
  const series = seriesOf(rows);
  if (!series) return 'plain';
  const stored = rows.find((r) => r.id === id && !r.deletedAt);
  // The first time: neither the series nor the day being edited has a start time yet. (A day that already has
  // its own time while the series has none, such as a moved day, is changed alone.)
  if (!series.template.startTime && !stored?.startTime && fields.startTime !== undefined) return 'series';
  if (source === 'day') return 'day';
  return stored && hasOwnTime(stored, series.template) ? 'day' : 'series';
}

export interface RowPatch {
  id: string;
  fields: Partial<Task>;
}

// What a series edit writes: the template and every open stored day from today on, except that a day with its
// own time never takes the time fields (the other fields of the same edit still reach it).
export function seriesPatches(rows: Task[], fields: Partial<Task>, todayKey: string): RowPatch[] {
  const series = seriesOf(rows);
  if (!series) return [];
  const out: RowPatch[] = [];
  for (const row of seriesEditTargets(rows, todayKey)) {
    const patch = templatePatch(row, fields);
    if (hasOwnTime(row, series.template)) for (const k of TIME_FIELDS) delete patch[k];
    if (Object.keys(patch).length > 0) out.push({ id: row.id, fields: patch });
  }
  return out;
}
