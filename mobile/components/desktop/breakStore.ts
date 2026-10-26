import { lostGuests, lostNote, type BreakSpan, type HostSnapshot } from '../../lib/hosting';
import { showNotice } from './uiStore';

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

// 3.11.0: a break moved or shrunk so tasks inside it no longer fit is allowed; they go back to normal
// blocks and the notice says "2 tasks no longer fit and moved out of the break". Each pane passes the
// day it drew; the first to see the change says so, the second finds nothing new.
const snapshots = new Map<string, HostSnapshot>();
export function watchDay(dayKey: string, snap: HostSnapshot): void {
  const prev = snapshots.get(dayKey);
  snapshots.set(dayKey, snap);
  if (!prev) return;
  const n = lostGuests(prev, snap);
  if (n > 0) showNotice(lostNote(n));
}
