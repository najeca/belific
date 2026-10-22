// Holding a block on the phone's Day timeline and dragging it in time (PLAN_phone P10). Pure: NO
// runtime imports besides siblings; see phoneDrag.test.ts. The desktop's drop rules (drag.ts) on one
// day, in 15 minute steps (decision 6):
//  * a task of one time moves to the new start (a task with no length gets 30 minutes, as on the
//    desktop); a projected day of a repeating series moves the series' time, never its day;
//  * one time of a task with several times moves only that time (drag.ts multiDropPatch), refused
//    when it would overlap another of its times;
//  * never onto a past day (drag.ts canDrop).
import type { Task } from './types.ts';
import { dropPatch, multiDropPatch } from './drag.ts';
import { DEFAULT_TASK_MINUTES } from './timebox.ts';
import { PHONE_SNAP } from './phoneDay.ts';

// The new start when a block that started at `startMin` has been dragged `dy` pixels.
export function draggedStart(startMin: number, dy: number, pxPerHour: number, durationMin: number, snap = PHONE_SNAP): number {
  const raw = startMin + (dy / pxPerHour) * 60;
  const snapped = Math.round(raw / snap) * snap;
  const latest = Math.max(0, 1440 - Math.max(snap, Math.min(durationMin, 1440)));
  return Math.max(0, Math.min(latest, snapped));
}

export type PhoneDrop = { fields: Partial<Task>; series: boolean } | { note: string } | null;

// What the drop writes: `series` says the fields go to the series template (a projected day). Null
// when nothing changes or the drop is not allowed.
export function phoneDropPatch(input: { task: Task; time?: string; multi: boolean; projected: boolean; dayKey: string; startMin: number; todayKey: string }): PhoneDrop {
  const { task, dayKey, startMin, todayKey, projected } = input;
  const target = { kind: 'slot' as const, dayKey, startMin };
  if (input.multi && input.time) {
    const res = multiDropPatch(task, input.time, target, todayKey, projected);
    if (!res) return null;
    return res.ok ? { fields: res.fields, series: projected } : { note: res.note };
  }
  const patch = dropPatch(task, 'block', target, todayKey);
  if (!patch) return null;
  if (projected) {
    // A repeating day: its time is the series' time; its day never changes by a drag.
    const fields: Partial<Task> = { startTime: patch.startTime };
    if (!task.durationMinutes) fields.durationMinutes = DEFAULT_TASK_MINUTES;
    return fields.startTime === task.startTime ? null : { fields, series: true };
  }
  return { fields: patch, series: false };
}
