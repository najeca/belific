// F7 of PLAN_daily_flow (section 10): Quick capture understands a few simple phrases at the END of the text. Pure: NO
// runtime imports besides siblings; see quickParse.test.ts. Desktop only (the phone gets it in its own phase).
//
// What it reads (UK order, 24 hour or am and pm; case does not matter):
//   * a day: "today", "tomorrow", a weekday ("Mon", "Monday": the next one), "next Mon" (that day of next week),
//     "12 Nov" (the next 12 November);
//   * a time: "9am", "6:30pm", "6 pm", "18:00", "9:30" (a bare number such as the 9 in "ring 9 people" is never a time);
//   * a length: "1h", "30m", "1h 30m", "1h30m", "45 min", "for 45 min";
//   * a repeat: two or more weekdays ("Mon Wed"), "every Mon", "every Mon Wed", "every day".
// Only the end is read, each kind at most once, in any order ("gym Mon Wed 6pm 1h"). Words such as "at", "on" and "for"
// in front of a phrase go with it. What is not understood stays in the title, and at least one word always stays: a
// phrase in the middle ("Monday meeting notes", "the 1h video") is never read. Nothing here reads a month in words
// beyond "12 Nov", ranges, "in 3 days", or labels typed with symbols (the plan says those are not worth a wrong guess).
import type { RecurrenceRule, Task, WeekDay } from './types.ts';
import { addDays, dateKey, formatDayTitle, parseDateKey } from './kanban.ts';
import { formatTime } from './data.ts';
import { formatDuration } from './duration.ts';

export interface QuickParse {
  title: string;
  // A day typed as a day ("tomorrow", "Mon", "12 Nov"), 'YYYY-MM-DD'.
  day?: string;
  // 'HH:mm'
  time?: string;
  minutes?: number;
  repeat?: { rule: Extract<RecurrenceRule, 'daily' | 'weekly'>; days?: WeekDay[] };
  // Something was understood (the title is then shorter than the text).
  found: boolean;
}

const WEEKDAYS: WeekDay[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_WORDS: Record<string, WeekDay> = {
  mon: 'Mon', monday: 'Mon', tue: 'Tue', tues: 'Tue', tuesday: 'Tue', wed: 'Wed', weds: 'Wed', wednesday: 'Wed',
  thu: 'Thu', thur: 'Thu', thurs: 'Thu', thursday: 'Thu', fri: 'Fri', friday: 'Fri', sat: 'Sat', saturday: 'Sat', sun: 'Sun', sunday: 'Sun',
};
const MONTH_WORDS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
  aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

const clean = (s: string): string => s.toLowerCase().replace(/[,.;]+$/, '');
const pad = (n: number): string => String(n).padStart(2, '0');
const weekdayOf = (w: string): WeekDay | undefined => DAY_WORDS[clean(w)];

// One time token ("9am", "6:30pm", "18:00", "9:30") as 'HH:mm', or null.
function timeOf(tok: string): string | null {
  const t = clean(tok);
  let m = /^(\d{1,2})(?::(\d{2}))?(am|pm)$/.exec(t);
  if (m) {
    const h = Number(m[1]);
    const min = m[2] === undefined ? 0 : Number(m[2]);
    if (h < 1 || h > 12 || min > 59) return null;
    return `${pad((h % 12) + (m[3] === 'pm' ? 12 : 0))}:${pad(min)}`;
  }
  m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (m && Number(m[1]) <= 23 && Number(m[2]) <= 59) return `${pad(Number(m[1]))}:${m[2]}`;
  return null;
}

// A length in minutes from one token ("1h", "30m", "1h30m", "1.5h", "45min"), or null.
function lengthOf(tok: string): number | null {
  const t = clean(tok);
  let m = /^(\d+)h(?:(\d+)m(?:in)?)?$/.exec(t) ?? /^(\d+)(?:hr|hrs|hour|hours)$/.exec(t);
  if (m) return Number(m[1]) * 60 + (m[2] ? Number(m[2]) : 0);
  m = /^(\d+(?:\.\d+)?)h$/.exec(t);
  if (m) return Math.round(Number(m[1]) * 60);
  m = /^(\d+)(?:m|min|mins|minute|minutes)$/.exec(t);
  if (m) return Number(m[1]);
  return null;
}
const okLength = (n: number | null): n is number => n !== null && Number.isInteger(n) && n >= 1 && n <= 1440;

// The next time `dayOfMonth` `month` comes round on or after today, or null for a day that does not exist.
function dateOf(dayOfMonth: number, month: number, today: Date): string | null {
  for (const year of [today.getFullYear(), today.getFullYear() + 1]) {
    const d = new Date(year, month, dayOfMonth);
    if (d.getMonth() !== month || d.getDate() !== dayOfMonth) continue;
    if (dateKey(d) >= dateKey(today)) return dateKey(d);
  }
  return null;
}

// The next `wd` after today (never today itself).
export function nextWeekday(wd: WeekDay, today: Date): string {
  const delta = ((WEEKDAYS.indexOf(wd) - today.getDay() + 6) % 7) + 1;
  return dateKey(addDays(today, delta));
}

// `wd` of next week (weeks run Monday to Sunday).
function weekdayNextWeek(wd: WeekDay, today: Date): string {
  const toMonday = ((today.getDay() + 6) % 7) * -1 + 7;
  const offset = (WEEKDAYS.indexOf(wd) + 6) % 7;
  return dateKey(addDays(today, toMonday + offset));
}

export function parseQuick(text: string, now: Date): QuickParse {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const out: QuickParse = { title: tokens.join(' '), found: false };
  let end = tokens.length;
  // At least one word stays in the title.
  const room = (n: number): boolean => end - n >= 1;
  const word = (back: number): string => (end - back >= 0 ? clean(tokens[end - back]) : '');
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  for (let guard = 0; guard < tokens.length; guard++) {
    const before = end;
    // A length: "for 45 min", "45 min", "1h 30m", "1h", "30m".
    if (out.minutes === undefined && room(1)) {
      const one = lengthOf(tokens[end - 1]);
      let n = 0;
      let mins: number | null = null;
      if (/^(min|mins|minutes|hr|hrs|hour|hours)$/.test(word(1)) && /^\d+(\.\d+)?$/.test(word(2)) && room(2)) {
        mins = lengthOf(`${word(2)}${/^h/.test(word(1)) ? 'h' : 'm'}`);
        n = 2;
      } else if (one !== null) {
        mins = one;
        n = 1;
        // "1h 30m": an hours token in front of a minutes one.
        const prev = room(2) ? lengthOf(tokens[end - 2]) : null;
        if (okLength(prev) && /^\d+h$/.test(word(2)) && /^\d+m(in)?$/.test(word(1))) {
          mins = prev + one;
          n = 2;
        }
      }
      if (okLength(mins)) {
        end -= n;
        if (word(1) === 'for' && room(1)) end -= 1;
        out.minutes = mins;
      }
    }
    // A time: "6pm", "18:00", "6 pm", optionally after "at".
    if (out.time === undefined && room(1)) {
      let t = timeOf(tokens[end - 1]);
      let n = 1;
      if (t === null && /^(am|pm)$/.test(word(1)) && /^\d{1,2}(:\d{2})?$/.test(word(2)) && room(2)) {
        t = timeOf(`${word(2)}${word(1)}`);
        n = 2;
      }
      if (t !== null) {
        end -= n;
        if (word(1) === 'at' && room(1)) end -= 1;
        out.time = t;
      }
    }
    // A repeat or a day.
    if (out.day === undefined && out.repeat === undefined && room(1)) {
      if (word(1) === 'day' && word(2) === 'every' && room(2)) {
        end -= 2;
        out.repeat = { rule: 'daily' };
      } else if (weekdayOf(tokens[end - 1])) {
        // The run of weekdays at the end ("Mon Wed", "Mon and Wed"), then an "every" in front of it.
        const days: WeekDay[] = [];
        let i = end;
        for (;;) {
          const w = i - 1 >= 0 ? weekdayOf(tokens[i - 1]) : undefined;
          if (w && i - 1 >= 1) {
            days.unshift(w);
            i -= 1;
            if (i - 1 >= 1 && /^(and|&)$/.test(clean(tokens[i - 1])) && weekdayOf(tokens[i - 2] ?? '') && i - 2 >= 1) i -= 1;
            continue;
          }
          break;
        }
        // A run of weekdays that reaches the first word would leave no title ('Mon Wed'): it is left alone.
        const wholeRun = i === 1 && !!weekdayOf(tokens[0]);
        const every = i - 1 >= 1 && clean(tokens[i - 1]) === 'every';
        const next = i - 1 >= 1 && clean(tokens[i - 1]) === 'next';
        if (wholeRun) {
          // nothing read
        } else if (days.length >= 2 || every) {
          end = every ? i - 1 : i;
          out.repeat = { rule: 'weekly', days: [...new Set(days)] };
        } else if (days.length === 1) {
          end = next ? i - 1 : i;
          out.day = next ? weekdayNextWeek(days[0], today) : nextWeekday(days[0], today);
          if (word(1) === 'on' && room(1)) end -= 1;
        }
      } else if (word(1) === 'tomorrow' || word(1) === 'today') {
        out.day = dateKey(addDays(today, word(1) === 'tomorrow' ? 1 : 0));
        end -= 1;
        if (word(1) === 'on' && room(1)) end -= 1;
      } else if (room(2) && /^\d{1,2}(st|nd|rd|th)?$/.test(word(2)) && MONTH_WORDS[word(1)] !== undefined) {
        const d = dateOf(Number(word(2).replace(/\D/g, '')), MONTH_WORDS[word(1)], today);
        if (d) {
          end -= 2;
          out.day = d;
          if (word(1) === 'on' && room(1)) end -= 1;
        }
      }
    }
    if (end === before) break;
  }
  if (end < tokens.length) {
    out.title = tokens.slice(0, end).join(' ');
    out.found = true;
  }
  return out;
}

// What is saved for a reading. A repeat starts on the next of its days after today (a time that has passed today does
// not matter then); "every day" starts today, or tomorrow when its time has passed. A time with no day is today.
export type QuickFields = Partial<Pick<Task, 'dueDate' | 'startTime' | 'durationMinutes' | 'recurrence' | 'recurrenceDays'>>;
export function quickFields(p: QuickParse, now: Date): QuickFields {
  const out: QuickFields = {};
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const passed = p.time !== undefined && p.time <= `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  if (p.repeat?.rule === 'daily') {
    out.dueDate = dateKey(addDays(today, passed ? 1 : 0));
    out.recurrence = 'daily';
  } else if (p.repeat) {
    const days = p.repeat.days ?? [];
    out.dueDate = days.map((d) => nextWeekday(d, today)).sort()[0];
    out.recurrence = 'weekly';
    out.recurrenceDays = days;
  } else if (p.day) out.dueDate = p.day;
  else if (p.time) out.dueDate = dateKey(today);
  if (p.time) out.startTime = p.time;
  if (p.minutes !== undefined) out.durationMinutes = p.minutes;
  return out;
}

// The preview line: "Tomorrow · 9:00am · 1h", "Mon, Wed · 6:00pm · 1h · repeats", "Every day · 7:30am".
export function previewText(p: QuickParse, now: Date): string {
  const todayKey = dateKey(now);
  const f = quickFields(p, now);
  const parts: string[] = [];
  if (p.repeat?.rule === 'daily') parts.push('Every day');
  else if (p.repeat) parts.push(`${(p.repeat.days ?? []).join(', ')}`);
  else if (f.dueDate) parts.push(formatDayTitle(f.dueDate, todayKey));
  if (p.time) parts.push(formatTime(p.time));
  if (p.minutes !== undefined) parts.push(formatDuration(p.minutes) ?? '');
  if (p.repeat?.rule === 'weekly') parts.push('repeats');
  return parts.join(' · ');
}

// The words around the preview (Quick capture).
export const KEEP_AS_TEXT = 'Keep it as plain text';
export const understoodText = (preview: string): string => `Understood: ${preview}`;
