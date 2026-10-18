// The continuous strip of days (2.26.0): the Tasks board and the Calendar's
// week view scroll sideways through days with no week boundaries, from years
// back to years ahead, opening with today at the left edge. Only the columns on
// screen (plus a few either side) are drawn, so it stays fast with thousands of
// days. Pure: NO runtime imports besides siblings; see dayStrip.test.ts.
//
// Index 0 is the strip's first day (`originKey`); a column's left edge is
// index * step pixels from the strip's left.
import { addDays, dateKey, isDateKey, parseDateKey, MONTHS } from './kanban.ts';

export const STRIP_DAYS_BACK = 5 * 366;
export const STRIP_DAYS_AHEAD = 5 * 366;
export const STRIP_OVERSCAN = 3;

export interface Strip {
  originKey: string;
  total: number;
}

export function stripAround(todayKey: string): Strip {
  return { originKey: dateKey(addDays(parseDateKey(todayKey), -STRIP_DAYS_BACK)), total: STRIP_DAYS_BACK + STRIP_DAYS_AHEAD + 1 };
}

// Whole calendar days between two keys (clock changes never shift it).
export function daysBetween(fromKey: string, toKey: string): number {
  const a = parseDateKey(fromKey);
  const b = parseDateKey(toKey);
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
}

export function indexOfDay(strip: Strip, key: string): number {
  if (!isDateKey(key)) return -1;
  const i = daysBetween(strip.originKey, key);
  return i >= 0 && i < strip.total ? i : -1;
}

export function dayAt(strip: Strip, index: number): string {
  return dateKey(addDays(parseDateKey(strip.originKey), index));
}

// The scroll position that puts a day at the left edge.
export function offsetOfDay(strip: Strip, key: string, step: number): number {
  const i = indexOfDay(strip, key);
  return i < 0 ? 0 : i * step;
}

// The columns to draw for a scroll position: those on screen plus `overscan`
// either side, clamped to the strip.
export function visibleRange(scrollLeft: number, viewWidth: number, step: number, total: number, overscan = STRIP_OVERSCAN): { first: number; last: number } {
  if (total <= 0 || step <= 0) return { first: 0, last: -1 };
  const first = Math.max(0, Math.floor(Math.max(0, scrollLeft) / step) - overscan);
  const last = Math.min(total - 1, Math.ceil((Math.max(0, scrollLeft) + Math.max(0, viewWidth)) / step) + overscan - 1);
  return { first, last: Math.max(first, last) };
}

// The day whose column is at the left edge (for the header and the Today button).
export function leftDay(strip: Strip, scrollLeft: number, step: number): string {
  const i = Math.min(strip.total - 1, Math.max(0, Math.round(Math.max(0, scrollLeft) / step)));
  return dayAt(strip, i);
}

// Where the arrows go: one screen of whole columns earlier or later.
export function pageOffset(scrollLeft: number, viewWidth: number, step: number, delta: -1 | 1, total: number): number {
  const cols = Math.max(1, Math.floor(viewWidth / step));
  const at = Math.round(Math.max(0, scrollLeft) / step);
  const next = Math.min(Math.max(0, at + delta * cols), Math.max(0, total - cols));
  return next * step;
}

// "October 2026", or "Oct to Nov 2026", or "Dec 2026 to Jan 2027" for the days on screen.
export function rangeTitle(firstKey: string, lastKey: string): string {
  const a = parseDateKey(firstKey);
  const b = parseDateKey(lastKey);
  const long = (d: Date) => d.toLocaleString('en-GB', { month: 'long' });
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) return `${long(a)} ${a.getFullYear()}`;
  if (a.getFullYear() === b.getFullYear()) return `${MONTHS[a.getMonth()]} to ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
  return `${MONTHS[a.getMonth()]} ${a.getFullYear()} to ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
}

// A column's heading: the weekday and the date ("Sat", "Oct 17"), plus whether
// it is today, in the past or ahead.
export function columnHeading(key: string, todayKey: string): { weekday: string; date: string; when: 'past' | 'today' | 'future' } {
  const d = parseDateKey(key);
  const weekday = d.toLocaleString('en-GB', { weekday: 'short' });
  const date = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return { weekday, date, when: key === todayKey ? 'today' : key < todayKey ? 'past' : 'future' };
}

// The Calendar's week title: the seven days from `firstKey`, "17 to 23 Oct 2026",
// "28 Oct to 3 Nov 2026", "29 Dec 2026 to 4 Jan 2027".
export function weekRangeTitle(firstKey: string): string {
  const a = parseDateKey(firstKey);
  const b = addDays(a, 6);
  if (a.getFullYear() !== b.getFullYear()) return `${a.getDate()} ${MONTHS[a.getMonth()]} ${a.getFullYear()} to ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
  if (a.getMonth() !== b.getMonth()) return `${a.getDate()} ${MONTHS[a.getMonth()]} to ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
  return `${a.getDate()} to ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
}

// When the date changes while the app stays open (it lives in the tray for
// days), a view that was showing today moves on to the new today; a view the
// person had moved elsewhere stays where it is (2.27.0, item 5). Before this the
// Timebox and the Calendar kept the day they opened on, so after midnight they
// still read yesterday's weekday as "today".
export function followToday(viewKey: string, prevTodayKey: string, todayKey: string): string {
  return viewKey === prevTodayKey && prevTodayKey !== todayKey ? todayKey : viewKey;
}
