// The outbound calendar feed (build plan phase 8, step 2): the tasks that have a
// Day AND a start time, written as an iCalendar (RFC 5545) document that Google,
// Apple and Outlook can subscribe to. Pure, NO runtime imports besides siblings,
// because this file is also copied byte for byte into the Edge Function
// (supabase/functions/belific-calendar-feed/vendor/, see scripts/vendor-feed.js
// and calendarFeedFunction.test.ts). Tests: icsFeed.test.ts.
//
// What goes in (agreed with Jethro, 2026-10-17): timed tasks only (no all day
// tasks), from 30 days back to 365 days ahead; the title with the task's emoji in
// front and a tick in front when done; nothing else (no notes, label, priority,
// subtasks or times spent). Repeating series are expanded with the app's own
// series code, so a skipped day stays skipped and a projected day is never in
// the past.
//
// Times are FLOATING (no time zone, no Z): a task stores 'HH:mm' on a local Day
// with no zone, so 09:00 stays 09:00 in whatever zone the calendar shows it and
// a daylight saving change can never move it. A task with no estimate lasts 30
// minutes (the Timebox default); one that runs past midnight simply ends on the
// next day.
import type { Task } from './types.ts';
import { addDays, dateKey, isDateKey, parseDateKey } from './kanban.ts';
import { projectOccurrences } from './series.ts';
import { rootTaskId } from './recurrence.ts';

export const FEED_DAYS_BACK = 30;
export const FEED_DAYS_AHEAD = 365;
export const DEFAULT_EVENT_MINUTES = 30;
export const DONE_PREFIX = '✓ ';

export interface FeedEvent {
  uid: string;
  title: string;
  // Floating local date-times, 'YYYYMMDDTHHMMSS'.
  start: string;
  end: string;
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Wall clock arithmetic on a floating time, done in UTC so no zone or daylight
// saving rule of the machine running it can shift the result.
function floating(dayKey: string, startTime: string, plusMinutes: number): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const [h, mi] = startTime.split(':').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d, h, mi + plusMinutes));
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(t.getUTCFullYear(), 4)}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}T${p(t.getUTCHours())}${p(t.getUTCMinutes())}00`;
}

function minutesOf(t: Pick<Task, 'durationMinutes'>): number {
  const d = t.durationMinutes;
  return typeof d === 'number' && Number.isFinite(d) && d > 0 ? Math.min(Math.round(d), 24 * 60) : DEFAULT_EVENT_MINUTES;
}

export function feedTitle(t: Pick<Task, 'title' | 'emoji' | 'completed'>, emoji?: string): string {
  const e = (t.emoji ?? emoji ?? '').trim();
  const title = (t.title ?? '').trim() || 'Task';
  return `${t.completed ? DONE_PREFIX : ''}${e ? `${e} ` : ''}${title}`;
}

// Every event of the feed for `todayKey` (the server's today), sorted by start.
export function feedEvents(tasks: Task[], todayKey: string): FeedEvent[] {
  if (!isDateKey(todayKey)) return [];
  const today = parseDateKey(todayKey);
  const firstKey = dateKey(addDays(today, -FEED_DAYS_BACK));
  const lastKey = dateKey(addDays(today, FEED_DAYS_AHEAD));
  // A projected occurrence carries no emoji; the series' rows do (the root's is the quest's).
  const emojiOfRoot = new Map<string, string>();
  for (const t of tasks) {
    if (t.deletedAt || !t.emoji) continue;
    const root = rootTaskId(t.id);
    if (t.id === root || !emojiOfRoot.has(root)) emojiOfRoot.set(root, t.emoji);
  }
  const out: FeedEvent[] = [];
  const add = (t: Task) => {
    if (!t.dueDate || !t.startTime || !TIME_RE.test(t.startTime)) return;
    if (t.dueDate < firstKey || t.dueDate > lastKey) return;
    out.push({
      uid: `${t.id}@belific`,
      title: feedTitle(t, emojiOfRoot.get(rootTaskId(t.id))),
      start: floating(t.dueDate, t.startTime, 0),
      end: floating(t.dueDate, t.startTime, minutesOf(t)),
    });
  };
  for (const t of tasks) if (!t.deletedAt && isDateKey(t.dueDate)) add(t);
  const ahead: string[] = [];
  for (let i = 0; i <= FEED_DAYS_AHEAD; i++) ahead.push(dateKey(addDays(today, i)));
  for (const t of projectOccurrences(tasks, ahead, todayKey)) add(t);
  // One event per uid (a stored row and a projection never share a day, but be sure).
  const seen = new Set<string>();
  return out
    .filter((e) => (seen.has(e.uid) ? false : (seen.add(e.uid), true)))
    .sort((a, b) => a.start.localeCompare(b.start) || a.uid.localeCompare(b.uid));
}

// RFC 5545 3.3.11: backslash, semicolon, comma and newlines are escaped.
export function escapeIcsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
}

function utf8Length(ch: string): number {
  const c = ch.codePointAt(0) ?? 0;
  return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
}

// RFC 5545 3.1: lines longer than 75 octets are folded (CRLF and one space),
// never inside a UTF-8 character.
export function foldIcsLine(line: string): string {
  const parts: string[] = [];
  let cur = '';
  let len = 0;
  for (const ch of line) {
    const n = utf8Length(ch);
    const limit = parts.length === 0 ? 75 : 74;
    if (len + n > limit) {
      parts.push(cur);
      cur = '';
      len = 0;
    }
    cur += ch;
    len += n;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// The whole document. `now` is the DTSTAMP of every event.
export function buildIcs(events: FeedEvent[], now: Date): string {
  const stamp = utcStamp(now);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Belific//Calendar feed//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Belific tasks',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeIcsText(e.uid)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${e.start}`,
      `DTEND:${e.end}`,
      `SUMMARY:${escapeIcsText(e.title)}`,
      'TRANSP:OPAQUE',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}
