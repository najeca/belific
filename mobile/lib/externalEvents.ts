// Events from outside Belific, drawn read only beside the tasks (build plan
// phase 8): the Windows desktop's imported ICS subscriptions and the iPhone's
// own calendars. Pure: NO runtime imports besides siblings; see
// externalEvents.test.ts.
//
// A day shows an event in one of two places:
//  - the all day row: an all day event on every day it covers, and a timed
//    event of 24 hours or more on every day it touches;
//  - the hour grid: a shorter timed event, cut at midnight, so one that runs
//    past 24:00 shows its rest at the top of the next day.
// Days are this device's local calendar days; minutes are counted from local
// midnight with the clock, so a clock change day still reads 00:00 to 24:00.
import type { Occurrence } from './icsParse.ts';
import { addDays, dateKey, parseDateKey } from './kanban.ts';

export interface DaySegment {
  occ: Occurrence;
  allDayRow: boolean;
  // Grid only: minutes from local midnight, 0 to 1440.
  startMin: number;
  endMin: number;
  // It started on an earlier day.
  continues: boolean;
}

const DAY_MS = 86400000;
// A zero length event still gets a block the eye can find.
export const MIN_SEGMENT_MINUTES = 15;

function minuteOfDay(ms: number): number {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}

export function segmentsForDay(occs: Occurrence[], dayKey: string): DaySegment[] {
  const dayStart = parseDateKey(dayKey).getTime();
  const dayEnd = addDays(parseDateKey(dayKey), 1).getTime();
  const out: DaySegment[] = [];
  for (const occ of occs) {
    if (occ.allDay) {
      if (occ.startKey && occ.endKey && occ.startKey <= dayKey && dayKey < occ.endKey) {
        out.push({ occ, allDayRow: true, startMin: 0, endMin: 1440, continues: occ.startKey < dayKey });
      }
      continue;
    }
    const zeroLength = occ.endMs <= occ.startMs;
    const touches = zeroLength ? occ.startMs >= dayStart && occ.startMs < dayEnd : occ.startMs < dayEnd && occ.endMs > dayStart;
    if (!touches) continue;
    const continues = occ.startMs < dayStart;
    if (occ.endMs - occ.startMs >= DAY_MS) {
      out.push({ occ, allDayRow: true, startMin: 0, endMin: 1440, continues });
      continue;
    }
    const startMin = continues ? 0 : minuteOfDay(occ.startMs);
    let endMin = occ.endMs >= dayEnd ? 1440 : minuteOfDay(occ.endMs);
    if (endMin <= startMin) endMin = Math.min(1440, startMin + MIN_SEGMENT_MINUTES);
    out.push({ occ, allDayRow: false, startMin, endMin, continues });
  }
  return out.sort((a, b) => Number(b.allDayRow) - Number(a.allDayRow) || a.startMin - b.startMin || a.occ.title.localeCompare(b.occ.title));
}

// 'HH:mm' of a minute of the day.
export function minuteLabel(min: number): string {
  const m = Math.max(0, Math.min(1440, Math.round(min)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// ---- The iPhone's own calendars (expo-calendar events) ----

export interface DeviceEventLike {
  id: string;
  title?: string | null;
  startDate: string | Date;
  endDate: string | Date;
  allDay?: boolean | null;
  calendarId?: string;
}

function ms(v: string | Date): number {
  return v instanceof Date ? v.getTime() : Date.parse(v);
}

// iOS gives an all day event as local midnight to 23:59:59 of its last day (or
// to the next midnight); either way it covers the days from its start up to and
// including the day its end falls on, unless the end is exactly midnight.
export function fromDeviceEvent(e: DeviceEventLike): Occurrence | null {
  const startMs = ms(e.startDate);
  const endMs = ms(e.endDate);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  const title = (e.title ?? '').trim() || 'Busy';
  if (e.allDay) {
    const s = new Date(startMs);
    const startKey = dateKey(s);
    const end = new Date(Math.max(endMs, startMs));
    const endIsMidnight = end.getHours() === 0 && end.getMinutes() === 0 && end.getSeconds() === 0;
    let endKey = endIsMidnight ? dateKey(end) : dateKey(addDays(end, 1));
    if (endKey <= startKey) endKey = dateKey(addDays(s, 1));
    return { id: `${e.calendarId ?? ''}|${e.id}|${startMs}`, title, allDay: true, startMs, endMs, startKey, endKey };
  }
  return { id: `${e.calendarId ?? ''}|${e.id}|${startMs}`, title, allDay: false, startMs, endMs: Math.max(endMs, startMs) };
}

// Local midnight at the start of the first day and the end of the last day of a
// range of day keys, for asking a calendar for its events.
export function rangeOf(firstKey: string, lastKey: string): { fromMs: number; toMs: number } {
  return { fromMs: parseDateKey(firstKey).getTime(), toMs: addDays(parseDateKey(lastKey), 1).getTime() };
}
