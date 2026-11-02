// What a repeating task shares across ALL its days (3.29.0). Pure (no React Native), see seriesWide.test.ts.
//
// The rule: editing the title, label, list, notes, priority, steps or reminders of a repeating task applies to
// every one of its days: the series (its template, which the days not stored yet are drawn from) and every
// stored day, open or moved, earlier or later, except a PAST day that is already done (it stays as it was done).
// Only the date, the time and the length can differ from one day to the next.
//
// Before 3.29.0 an edit made on a stored day (its details, its card) wrote that day's row only, and an edit made
// on a day not stored yet reached the template and the open stored days from today on; so a day stored earlier
// (moved into a break, shortened) kept the old title on the Calendar and in its break while the details of the
// edited day showed the new one.
//
// Ticking a step is not an edit of the steps: it goes through toggleSubtask and stays on its own day. When the
// steps are edited (added, renamed, removed), each day keeps the ticks of the steps it still has.
import type { Task } from './types.ts';
import { isDateKey } from './kanban.ts';
import { ownDay, seriesOfRows, templateSubtasks } from './series.ts';
import { rootTaskId } from './recurrence.ts';

export const SERIES_WIDE_FIELDS = ['title', 'projectKey', 'listKey', 'notes', 'priority', 'subtasks', 'reminderMinutes', 'reminders'] as const;
type WideKey = (typeof SERIES_WIDE_FIELDS)[number];

export interface RowPatch {
  id: string;
  fields: Partial<Task>;
}

// The fields of an edit split in two: the ones every day shares, and the rest.
export function splitWide(fields: Partial<Task>): { wide: Partial<Task>; rest: Partial<Task> } {
  const wide: Partial<Task> = {};
  const rest: Partial<Task> = {};
  for (const [k, v] of Object.entries(fields)) {
    if ((SERIES_WIDE_FIELDS as readonly string[]).includes(k)) (wide as Record<string, unknown>)[k] = v;
    else (rest as Record<string, unknown>)[k] = v;
  }
  return { wide, rest };
}

export const hasWide = (fields: Partial<Task>): boolean => Object.keys(fields).some((k) => (SERIES_WIDE_FIELDS as readonly string[]).includes(k));

// The day a row happened on: where it is (a moved day is on the day it was moved to), else the day it stands for.
function dayOf(row: Task): string | undefined {
  return isDateKey(row.dueDate) ? row.dueDate : ownDay(row);
}

// The rows a series wide edit reaches: the template (always, so the days not stored yet follow), the row the edit
// was made on (`ownId`, always), and every live row except a past day that is done. Tombstones are left alone.
export function wideTargets(rows: Task[], todayKey: string, ownId?: string): Task[] {
  const live = rows.filter((r) => !r.deletedAt);
  const series = seriesOfRows(rows.length > 0 ? rootTaskId(rows[0].id) : '', rows);
  const out = new Map<string, Task>();
  if (series && !series.template.deletedAt) out.set(series.template.id, series.template);
  for (const r of live) {
    const day = dayOf(r);
    const pastDone = r.completed && !!day && day < todayKey;
    if (!pastDone || r.id === ownId) out.set(r.id, r);
  }
  return [...out.values()];
}

// What each target row is written: only the shared fields of the edit, and only where they change something. The
// steps are re-ticked from each day's own ticks (a done day keeps them all done, as the template does).
export function widePatches(rows: Task[], fields: Partial<Task>, todayKey: string, ownId?: string): RowPatch[] {
  const { wide } = splitWide(fields);
  if (Object.keys(wide).length === 0) return [];
  const out: RowPatch[] = [];
  for (const row of wideTargets(rows, todayKey, ownId)) {
    const patch: Partial<Task> = {};
    for (const k of Object.keys(wide) as WideKey[]) {
      // The day the edit was made on takes the steps exactly as edited; the others keep their own ticks.
      const value = k === 'subtasks' && row.id !== ownId ? (wide.subtasks ? templateSubtasks(row.subtasks, wide.subtasks, row.completed) : undefined) : wide[k];
      if (JSON.stringify(row[k]) !== JSON.stringify(value)) (patch as Record<string, unknown>)[k] = value;
    }
    if (Object.keys(patch).length > 0) out.push({ id: row.id, fields: patch });
  }
  return out;
}

// Two lists of row patches as one (a row named in both gets both; the later list wins on a shared field).
export function mergePatches(a: RowPatch[], b: RowPatch[]): RowPatch[] {
  const map = new Map<string, Partial<Task>>();
  for (const p of [...a, ...b]) map.set(p.id, { ...(map.get(p.id) ?? {}), ...p.fields });
  return [...map.entries()].map(([id, f]) => ({ id, fields: f }));
}
