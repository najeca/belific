import type { BreakSpan } from '../../lib/hosting';

// The breaks each drawn day shows (3.6.0, task during a break), so a drag can tell when it is over one
// (DragProvider). The Timebox and the Calendar set it whenever they lay a day out; both draw a day the
// same way, so whichever wrote last is right. Derived, never stored.
export interface DayBreak extends BreakSpan {
  title: string;
  // The break's own task (never hosted in itself).
  taskId: string;
}

const byDay = new Map<string, DayBreak[]>();

export function setDayBreaks(dayKey: string, breaks: DayBreak[]): void {
  byDay.set(dayKey, breaks);
}

export function dayBreaks(dayKey: string): DayBreak[] {
  return byDay.get(dayKey) ?? [];
}
