// Reading iCalendar (RFC 5545) subscriptions for the Windows desktop (build
// plan phase 8, step 3). Pure: NO runtime imports besides siblings, so
// `node --test` runs it (icsParse.test.ts). The main process only fetches the
// text (desktop/src/icsFetch.js); this file turns it into events and expands
// repeats for the days the Calendar shows.
//
// Read only and forgiving: a line or event that cannot be understood is
// skipped, never an error for the whole calendar. Supported:
//  - DTSTART / DTEND / DURATION as a DATE (all day), a UTC time (Z), a time in a
//    named zone (TZID) or a floating time;
//  - zones as IANA names (Europe/London), Windows names (GMT Standard Time, as
//    Outlook writes them) or the calendar's own VTIMEZONE rules; an unknown zone
//    is read as this computer's local time;
//  - RRULE with FREQ DAILY, WEEKLY, MONTHLY or YEARLY, INTERVAL, COUNT, UNTIL,
//    BYDAY (with 1MO or -1FR in a month or year), BYMONTHDAY (negative too),
//    BYMONTH, BYSETPOS and WKST; EXDATE, RDATE, RECURRENCE-ID overrides and
//    STATUS:CANCELLED. A rule with parts this does not know (BYHOUR, BYWEEKNO,
//    HOURLY...) shows its first day only.
// Repeats are counted in the event's own wall clock and zone, so a 09:00
// London meeting stays at 09:00 London time across the clock change.

export type IcsTime =
  | { kind: 'date'; y: number; m: number; d: number }
  | { kind: 'time'; y: number; m: number; d: number; h: number; mi: number; s: number; zone: string };
// zone: 'UTC', 'floating', or the TZID as written.

export interface IcsRule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  count?: number;
  until?: IcsTime;
  byDay?: Array<{ ord: number; wd: number }>; // wd 0 = Sunday; ord 0 = every
  byMonthDay?: number[];
  byMonth?: number[];
  bySetPos?: number[];
  wkst: number;
  unsupported?: boolean;
}

export interface IcsEvent {
  uid: string;
  title: string;
  start: IcsTime;
  end?: IcsTime;
  durationSec?: number;
  rule?: IcsRule;
  exdates: IcsTime[];
  rdates: IcsTime[];
  recurrenceId?: IcsTime;
  cancelled: boolean;
}

export interface IcsObservance {
  start: IcsTime; // local wall clock of the first onset
  offsetFrom: number; // seconds east of UTC
  offsetTo: number;
  month?: number;
  byDay?: { ord: number; wd: number };
  byMonthDay?: number;
}

export interface IcsCalendar {
  name?: string;
  events: IcsEvent[];
  zones: Record<string, IcsObservance[]>;
}

export interface Occurrence {
  // Stable within a calendar: uid plus the instance's own start.
  id: string;
  title: string;
  allDay: boolean;
  startMs: number;
  endMs: number;
  // All day only: first day and the day after the last ('YYYY-MM-DD').
  startKey?: string;
  endKey?: string;
}

export const MAX_EVENTS = 5000;
export const MAX_OCCURRENCES_PER_EVENT = 1000;
const MAX_STEPS = 100000;
// Total repeat days walked in one expansion, across all events, so a huge
// calendar of old repeating events can never freeze the Calendar.
export const EXPAND_BUDGET = 500000;
const WD = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const DAY_MS = 86400000;

// ---- Lines and properties ----

interface Prop {
  name: string;
  params: Record<string, string>;
  value: string;
}

export function unfold(text: string): string[] {
  return text.replace(/\r\n|\r/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

export function parseLine(line: string): Prop | null {
  // name *(";" param) ":" value; a quoted parameter value may hold ; and :.
  let i = 0;
  let inQuote = false;
  for (; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuote = !inQuote;
    else if (c === ':' && !inQuote) break;
  }
  if (i >= line.length) return null;
  const head = line.slice(0, i);
  const value = line.slice(i + 1);
  const parts: string[] = [];
  let cur = '';
  inQuote = false;
  for (const c of head) {
    if (c === '"') inQuote = !inQuote;
    if (c === ';' && !inQuote) {
      parts.push(cur);
      cur = '';
    } else cur += c;
  }
  parts.push(cur);
  const name = parts[0].trim().toUpperCase();
  if (!/^[A-Z0-9-]+$/.test(name)) return null;
  const params: Record<string, string> = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=');
    if (eq === -1) continue;
    params[p.slice(0, eq).trim().toUpperCase()] = p.slice(eq + 1).trim().replace(/^"|"$/g, '');
  }
  return { name, params, value };
}

export function unescapeText(s: string): string {
  return s.replace(/\\([\\;,nN])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c));
}

// '20261017', '20261017T090000', '20261017T090000Z'.
export function parseIcsTime(value: string, params: Record<string, string> = {}): IcsTime | null {
  const v = value.trim();
  const date = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (date) {
    const [y, m, d] = [Number(date[1]), Number(date[2]), Number(date[3])];
    return validDate(y, m, d) ? { kind: 'date', y, m, d } : null;
  }
  const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
  if (!dt) return null;
  const [y, m, d, h, mi, s] = dt.slice(1, 7).map(Number);
  if (!validDate(y, m, d) || h > 23 || mi > 59 || s > 60) return null;
  const zone = dt[7] === 'Z' ? 'UTC' : params.TZID ? params.TZID : 'floating';
  return { kind: 'time', y, m, d, h, mi, s: Math.min(s, 59), zone };
}

function validDate(y: number, m: number, d: number): boolean {
  if (y < 1000 || y > 2200 || m < 1 || m > 12 || d < 1) return false;
  return d <= daysInMonth(y, m);
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// 'P1D', 'PT1H30M', '-PT15M', 'P2W' in seconds.
export function parseDuration(value: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim());
  if (!m || value.trim() === 'P' || /T$/.test(value.trim())) return null;
  const [w, d, h, mi, s] = m.slice(2, 7).map((x) => Number(x ?? 0));
  const total = (((w * 7 + d) * 24 + h) * 60 + mi) * 60 + s;
  return m[1] === '-' ? -total : total;
}

function parseOffset(value: string): number | null {
  const m = /^([+-])(\d{2})(\d{2})(\d{2})?$/.exec(value.trim());
  if (!m) return null;
  const secs = Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4] ?? 0);
  return m[1] === '-' ? -secs : secs;
}

function parseByDay(s: string): { ord: number; wd: number } | null {
  const m = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(s.trim().toUpperCase());
  if (!m) return null;
  return { ord: m[1] ? Number(m[1]) : 0, wd: WD.indexOf(m[2]) };
}

const KNOWN_RULE_PARTS = new Set(['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'BYDAY', 'BYMONTHDAY', 'BYMONTH', 'BYSETPOS', 'WKST']);

export function parseRule(value: string): IcsRule | null {
  const parts: Record<string, string> = {};
  for (const kv of value.split(';')) {
    const eq = kv.indexOf('=');
    if (eq > 0) parts[kv.slice(0, eq).trim().toUpperCase()] = kv.slice(eq + 1).trim();
  }
  const freq = parts.FREQ?.toUpperCase();
  const rule: IcsRule = { freq: 'DAILY', interval: 1, wkst: 1 };
  if (freq === 'DAILY' || freq === 'WEEKLY' || freq === 'MONTHLY' || freq === 'YEARLY') rule.freq = freq;
  else if (freq) rule.unsupported = true;
  else return null;
  if (Object.keys(parts).some((k) => !KNOWN_RULE_PARTS.has(k))) rule.unsupported = true;
  const int = (s: string | undefined) => (s && /^[+-]?\d+$/.test(s) ? Number(s) : NaN);
  if (parts.INTERVAL) {
    const n = int(parts.INTERVAL);
    if (n >= 1 && n <= 1000) rule.interval = n;
  }
  if (parts.COUNT) {
    const n = int(parts.COUNT);
    if (n >= 1) rule.count = Math.min(n, 100000);
  }
  if (parts.UNTIL) rule.until = parseIcsTime(parts.UNTIL) ?? undefined;
  if (parts.BYDAY) {
    const list = parts.BYDAY.split(',').map(parseByDay);
    if (list.every(Boolean)) rule.byDay = list as Array<{ ord: number; wd: number }>;
    else rule.unsupported = true;
  }
  const nums = (s: string, lo: number, hi: number) => {
    const list = s.split(',').map(int);
    return list.every((n) => Number.isInteger(n) && n !== 0 && Math.abs(n) >= lo && Math.abs(n) <= hi) ? list : null;
  };
  if (parts.BYMONTHDAY) {
    const l = nums(parts.BYMONTHDAY, 1, 31);
    if (l) rule.byMonthDay = l;
    else rule.unsupported = true;
  }
  if (parts.BYMONTH) {
    const l = nums(parts.BYMONTH, 1, 12);
    if (l && l.every((n) => n > 0)) rule.byMonth = l;
    else rule.unsupported = true;
  }
  if (parts.BYSETPOS) {
    const l = nums(parts.BYSETPOS, 1, 366);
    if (l) rule.bySetPos = l;
    else rule.unsupported = true;
  }
  if (parts.WKST) {
    const w = WD.indexOf(parts.WKST.toUpperCase());
    if (w >= 0) rule.wkst = w;
  }
  // An ordinal BYDAY in a YEARLY rule without BYMONTH counts weeks of the year: not supported.
  if (rule.byDay?.some((b) => b.ord !== 0) && (rule.freq === 'DAILY' || rule.freq === 'WEEKLY' || (rule.freq === 'YEARLY' && !rule.byMonth))) {
    rule.unsupported = true;
  }
  return rule;
}

function timeList(p: Prop): IcsTime[] {
  return p.value
    .split(',')
    .map((v) => parseIcsTime(v, p.params))
    .filter((t): t is IcsTime => t !== null);
}

// ---- The document ----

export function parseIcs(text: string): IcsCalendar {
  const cal: IcsCalendar = { events: [], zones: {} };
  const stack: string[] = [];
  let ev: Partial<IcsEvent> & { exdates: IcsTime[]; rdates: IcsTime[] } = { exdates: [], rdates: [] };
  let zoneId = '';
  let obs: Partial<IcsObservance> | null = null;
  let obsRule: IcsRule | null = null;
  for (const raw of unfold(text)) {
    if (!raw) continue;
    const p = parseLine(raw);
    if (!p) continue;
    if (p.name === 'BEGIN') {
      const what = p.value.trim().toUpperCase();
      stack.push(what);
      if (what === 'VEVENT') ev = { exdates: [], rdates: [], cancelled: false };
      if (what === 'VTIMEZONE') zoneId = '';
      if ((what === 'STANDARD' || what === 'DAYLIGHT') && stack.includes('VTIMEZONE')) {
        obs = {};
        obsRule = null;
      }
      continue;
    }
    if (p.name === 'END') {
      const what = stack.pop();
      if (what === 'VEVENT' && ev.start && cal.events.length < MAX_EVENTS) {
        cal.events.push({
          // An event with no UID still shows; it gets one from its start and title.
          uid: ev.uid || `nouid-${dateKeyOf(ev.start)}-${cal.events.length}`,
          title: ev.title ?? '',
          start: ev.start,
          end: ev.end,
          durationSec: ev.durationSec,
          rule: ev.rule,
          exdates: ev.exdates,
          rdates: ev.rdates,
          recurrenceId: ev.recurrenceId,
          cancelled: ev.cancelled ?? false,
        });
      }
      if ((what === 'STANDARD' || what === 'DAYLIGHT') && obs && zoneId && obs.start && obs.offsetFrom !== undefined && obs.offsetTo !== undefined) {
        const o: IcsObservance = { start: obs.start, offsetFrom: obs.offsetFrom, offsetTo: obs.offsetTo };
        if (obsRule && obsRule.freq === 'YEARLY' && !obsRule.unsupported) {
          o.month = obsRule.byMonth?.[0];
          if (obsRule.byDay?.length === 1) o.byDay = obsRule.byDay[0];
          if (obsRule.byMonthDay?.length === 1) o.byMonthDay = obsRule.byMonthDay[0];
        }
        (cal.zones[zoneId] = cal.zones[zoneId] ?? []).push(o);
        obs = null;
      }
      continue;
    }
    const top = stack[stack.length - 1];
    if (top === 'VCALENDAR' && p.name === 'X-WR-CALNAME') cal.name = unescapeText(p.value).slice(0, 200);
    if (top === 'VTIMEZONE' && p.name === 'TZID') zoneId = p.value.trim();
    if ((top === 'STANDARD' || top === 'DAYLIGHT') && obs) {
      if (p.name === 'DTSTART') obs.start = parseIcsTime(p.value) ?? undefined;
      if (p.name === 'TZOFFSETFROM') obs.offsetFrom = parseOffset(p.value) ?? undefined;
      if (p.name === 'TZOFFSETTO') obs.offsetTo = parseOffset(p.value) ?? undefined;
      if (p.name === 'RRULE') obsRule = parseRule(p.value);
    }
    if (top !== 'VEVENT') continue;
    switch (p.name) {
      case 'UID':
        ev.uid = p.value.trim().slice(0, 500);
        break;
      case 'SUMMARY':
        ev.title = unescapeText(p.value).trim().slice(0, 500);
        break;
      case 'DTSTART':
        ev.start = parseIcsTime(p.value, p.params) ?? undefined;
        break;
      case 'DTEND':
        ev.end = parseIcsTime(p.value, p.params) ?? undefined;
        break;
      case 'DURATION': {
        const d = parseDuration(p.value);
        if (d !== null && d >= 0) ev.durationSec = d;
        break;
      }
      case 'RRULE':
        ev.rule = parseRule(p.value) ?? undefined;
        break;
      case 'EXDATE':
        ev.exdates.push(...timeList(p));
        break;
      case 'RDATE':
        if ((p.params.VALUE ?? '').toUpperCase() !== 'PERIOD') ev.rdates.push(...timeList(p));
        break;
      case 'RECURRENCE-ID':
        ev.recurrenceId = parseIcsTime(p.value, p.params) ?? undefined;
        break;
      case 'STATUS':
        ev.cancelled = p.value.trim().toUpperCase() === 'CANCELLED';
        break;
    }
  }
  return cal;
}

// ---- Zones ----

// The Windows zone names Outlook and Exchange write, mapped to IANA (the
// common ones; CLDR windowsZones.xml, territory 001).
export const WINDOWS_ZONES: Record<string, string> = {
  'Dateline Standard Time': 'Etc/GMT+12',
  'Hawaiian Standard Time': 'Pacific/Honolulu',
  'Alaskan Standard Time': 'America/Anchorage',
  'Pacific Standard Time': 'America/Los_Angeles',
  'US Mountain Standard Time': 'America/Phoenix',
  'Mountain Standard Time': 'America/Denver',
  'Central Standard Time': 'America/Chicago',
  'Central America Standard Time': 'America/Guatemala',
  'Eastern Standard Time': 'America/New_York',
  'Atlantic Standard Time': 'America/Halifax',
  'Newfoundland Standard Time': 'America/St_Johns',
  'E. South America Standard Time': 'America/Sao_Paulo',
  'SA Pacific Standard Time': 'America/Bogota',
  'Argentina Standard Time': 'America/Buenos_Aires',
  'UTC': 'UTC',
  'Coordinated Universal Time': 'UTC',
  'GMT Standard Time': 'Europe/London',
  'Greenwich Standard Time': 'Atlantic/Reykjavik',
  'W. Europe Standard Time': 'Europe/Berlin',
  'Central Europe Standard Time': 'Europe/Budapest',
  'Romance Standard Time': 'Europe/Paris',
  'Central European Standard Time': 'Europe/Warsaw',
  'W. Central Africa Standard Time': 'Africa/Lagos',
  'GTB Standard Time': 'Europe/Bucharest',
  'FLE Standard Time': 'Europe/Kiev',
  'E. Europe Standard Time': 'Europe/Chisinau',
  'Israel Standard Time': 'Asia/Jerusalem',
  'Egypt Standard Time': 'Africa/Cairo',
  'South Africa Standard Time': 'Africa/Johannesburg',
  'Turkey Standard Time': 'Europe/Istanbul',
  'Russian Standard Time': 'Europe/Moscow',
  'Arab Standard Time': 'Asia/Riyadh',
  'Arabian Standard Time': 'Asia/Dubai',
  'Iran Standard Time': 'Asia/Tehran',
  'Pakistan Standard Time': 'Asia/Karachi',
  'India Standard Time': 'Asia/Kolkata',
  'Nepal Standard Time': 'Asia/Katmandu',
  'Bangladesh Standard Time': 'Asia/Dhaka',
  'SE Asia Standard Time': 'Asia/Bangkok',
  'China Standard Time': 'Asia/Shanghai',
  'Singapore Standard Time': 'Asia/Singapore',
  'Taipei Standard Time': 'Asia/Taipei',
  'W. Australia Standard Time': 'Australia/Perth',
  'Tokyo Standard Time': 'Asia/Tokyo',
  'Korea Standard Time': 'Asia/Seoul',
  'Cen. Australia Standard Time': 'Australia/Adelaide',
  'AUS Central Standard Time': 'Australia/Darwin',
  'E. Australia Standard Time': 'Australia/Brisbane',
  'AUS Eastern Standard Time': 'Australia/Sydney',
  'New Zealand Standard Time': 'Pacific/Auckland',
};

const fmtCache = new Map<string, Intl.DateTimeFormat | null>();
function zoneFormat(tz: string): Intl.DateTimeFormat | null {
  if (fmtCache.has(tz)) return fmtCache.get(tz) ?? null;
  let f: Intl.DateTimeFormat | null = null;
  try {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
  } catch {
    f = null;
  }
  fmtCache.set(tz, f);
  return f;
}

// An IANA name this runtime knows, from a TZID as written: 'Europe/London',
// '"Europe/London"', '/mozilla.org/20050126_1/Europe/London', a Windows name.
export function ianaZone(tzid: string): string | null {
  const t = tzid.trim().replace(/^"|"$/g, '');
  if (!t) return null;
  if (WINDOWS_ZONES[t]) return WINDOWS_ZONES[t];
  if (zoneFormat(t)) return t;
  const segs = t.split('/').filter(Boolean);
  for (let n = Math.min(3, segs.length); n >= 2; n--) {
    const tail = segs.slice(-n).join('/');
    if (zoneFormat(tail)) return tail;
  }
  return null;
}

// Offset of an IANA zone at instant t, in ms east of UTC.
function ianaOffsetMs(tz: string, t: number): number {
  const f = zoneFormat(tz);
  if (!f) return 0;
  const sec = Math.floor(t / 1000) * 1000;
  const parts: Record<string, number> = {};
  for (const p of f.formatToParts(new Date(sec))) if (p.type !== 'literal') parts[p.type] = Number(p.value);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour === 24 ? 0 : parts.hour, parts.minute, parts.second);
  return asUtc - sec;
}

// Nth weekday of a month (ord 1..5, or -1..-5 from the end); day number or null.
function nthWeekday(y: number, m: number, wd: number, ord: number): number | null {
  const dim = daysInMonth(y, m);
  if (ord > 0) {
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const d = 1 + ((wd - first + 7) % 7) + (ord - 1) * 7;
    return d <= dim ? d : null;
  }
  const last = new Date(Date.UTC(y, m - 1, dim)).getUTCDay();
  const d = dim - ((last - wd + 7) % 7) + (ord + 1) * 7;
  return d >= 1 ? d : null;
}

// Offset of a VTIMEZONE at instant t, in seconds east of UTC.
function vtzOffsetSec(obs: IcsObservance[], t: number): number {
  let best: { at: number; to: number } | null = null;
  let earliest: { at: number; from: number } | null = null;
  const y = new Date(t).getUTCFullYear();
  for (const o of obs) {
    if (o.start.kind !== 'time') continue;
    const s = o.start;
    const onsets: number[] = [];
    if (o.month && (o.byDay || o.byMonthDay)) {
      for (let yy = Math.max(s.y, y - 1); yy <= y + 1; yy++) {
        const d = o.byDay ? nthWeekday(yy, o.month, o.byDay.wd, o.byDay.ord || 1) : o.byMonthDay! > 0 ? o.byMonthDay! : daysInMonth(yy, o.month) + o.byMonthDay! + 1;
        if (d) onsets.push(Date.UTC(yy, o.month - 1, d, s.h, s.mi, s.s) - o.offsetFrom * 1000);
      }
    } else onsets.push(Date.UTC(s.y, s.m - 1, s.d, s.h, s.mi, s.s) - o.offsetFrom * 1000);
    for (const at of onsets) {
      if (at <= t && (!best || at > best.at)) best = { at, to: o.offsetTo };
      if (!earliest || at < earliest.at) earliest = { at, from: o.offsetFrom };
    }
  }
  return best ? best.to : earliest ? earliest.from : 0;
}

// Epoch ms of a wall clock time in a zone of this calendar.
export function toEpoch(t: IcsTime, cal: Pick<IcsCalendar, 'zones'>): number {
  if (t.kind === 'date') return new Date(t.y, t.m - 1, t.d).getTime();
  const wall = Date.UTC(t.y, t.m - 1, t.d, t.h, t.mi, t.s);
  if (t.zone === 'UTC') return wall;
  if (t.zone === 'floating') return new Date(t.y, t.m - 1, t.d, t.h, t.mi, t.s).getTime();
  const iana = ianaZone(t.zone);
  if (iana) {
    let at = wall - ianaOffsetMs(iana, wall);
    at = wall - ianaOffsetMs(iana, at);
    return at;
  }
  const obs = cal.zones[t.zone] ?? cal.zones[t.zone.replace(/^"|"$/g, '')];
  if (obs && obs.length) {
    let at = wall - vtzOffsetSec(obs, wall) * 1000;
    at = wall - vtzOffsetSec(obs, at) * 1000;
    return at;
  }
  // Unknown zone: read it as this computer's local time.
  return new Date(t.y, t.m - 1, t.d, t.h, t.mi, t.s).getTime();
}

// ---- Repeats ----

interface Ymd {
  y: number;
  m: number;
  d: number;
}

function ymdAdd(a: Ymd, days: number): Ymd {
  const t = new Date(Date.UTC(a.y, a.m - 1, a.d + days));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}
function weekday(a: Ymd): number {
  return new Date(Date.UTC(a.y, a.m - 1, a.d)).getUTCDay();
}
function ymdNum(a: Ymd): number {
  return a.y * 10000 + a.m * 100 + a.d;
}

// The days of one month a MONTHLY or YEARLY rule picks.
function daysInRuleMonth(rule: IcsRule, y: number, m: number, startDay: number): number[] {
  const dim = daysInMonth(y, m);
  let days: number[];
  if (rule.byMonthDay) {
    days = rule.byMonthDay.map((n) => (n > 0 ? n : dim + n + 1)).filter((n) => n >= 1 && n <= dim);
    if (rule.byDay) days = days.filter((d) => rule.byDay!.some((b) => b.wd === weekday({ y, m, d })));
  } else if (rule.byDay) {
    const set = new Set<number>();
    for (const b of rule.byDay) {
      if (b.ord !== 0) {
        const d = nthWeekday(y, m, b.wd, b.ord);
        if (d) set.add(d);
      } else for (let d = 1; d <= dim; d++) if (weekday({ y, m, d }) === b.wd) set.add(d);
    }
    days = [...set];
  } else days = startDay <= dim ? [startDay] : [];
  return [...new Set(days)].sort((a, b) => a - b);
}

function applySetPos(days: Ymd[], setPos: number[] | undefined): Ymd[] {
  if (!setPos) return days;
  const out: Ymd[] = [];
  for (const p of setPos) {
    const d = p > 0 ? days[p - 1] : days[days.length + p];
    if (d) out.push(d);
  }
  return out.sort((a, b) => ymdNum(a) - ymdNum(b));
}

// Every day the rule makes, in order, starting from the event's first day.
// `onDay` returns false to stop.
function walkRule(rule: IcsRule, first: Ymd, onDay: (d: Ymd) => boolean): void {
  let steps = 0;
  const startN = ymdNum(first);
  const emit = (list: Ymd[]) => {
    for (const d of list) {
      if (ymdNum(d) < startN) continue;
      if (!onDay(d)) return false;
    }
    return true;
  };
  if (rule.freq === 'DAILY') {
    for (let cur = first; steps < MAX_STEPS; cur = ymdAdd(cur, rule.interval), steps++) {
      if (rule.byMonth && !rule.byMonth.includes(cur.m)) continue;
      if (rule.byMonthDay && !rule.byMonthDay.some((n) => (n > 0 ? n : daysInMonth(cur.y, cur.m) + n + 1) === cur.d)) continue;
      if (rule.byDay && !rule.byDay.some((b) => b.wd === weekday(cur))) continue;
      if (!emit([cur])) return;
    }
    return;
  }
  if (rule.freq === 'WEEKLY') {
    const wds = rule.byDay ? rule.byDay.map((b) => b.wd) : [weekday(first)];
    const weekStart = ymdAdd(first, -((weekday(first) - rule.wkst + 7) % 7));
    for (let ws = weekStart; steps < MAX_STEPS; ws = ymdAdd(ws, 7 * rule.interval), steps++) {
      const days: Ymd[] = [];
      for (let i = 0; i < 7; i++) {
        const d = ymdAdd(ws, i);
        if (wds.includes(weekday(d)) && (!rule.byMonth || rule.byMonth.includes(d.m))) days.push(d);
      }
      if (!emit(applySetPos(days, rule.bySetPos))) return;
    }
    return;
  }
  if (rule.freq === 'MONTHLY') {
    for (let i = 0; steps < MAX_STEPS; i += rule.interval, steps++) {
      const y = first.y + Math.floor((first.m - 1 + i) / 12);
      const m = ((first.m - 1 + i) % 12) + 1;
      if (rule.byMonth && !rule.byMonth.includes(m)) continue;
      const days = daysInRuleMonth(rule, y, m, first.d).map((d) => ({ y, m, d }));
      if (!emit(applySetPos(days, rule.bySetPos))) return;
    }
    return;
  }
  for (let y = first.y; steps < MAX_STEPS; y += rule.interval, steps++) {
    const months = rule.byMonth ?? [first.m];
    const days: Ymd[] = [];
    for (const m of [...months].sort((a, b) => a - b)) {
      for (const d of daysInRuleMonth(rule, y, m, first.d)) days.push({ y, m, d });
    }
    if (!emit(applySetPos(days, rule.bySetPos))) return;
  }
}

function withDay(t: IcsTime, d: Ymd): IcsTime {
  return { ...t, y: d.y, m: d.m, d: d.d };
}

function dateKeyOf(t: { y: number; m: number; d: number }): string {
  return `${String(t.y).padStart(4, '0')}-${String(t.m).padStart(2, '0')}-${String(t.d).padStart(2, '0')}`;
}

function sameInstance(a: IcsTime, b: IcsTime, cal: IcsCalendar): boolean {
  if (a.kind === 'date' || b.kind === 'date') return dateKeyOf(a) === dateKeyOf(b);
  return toEpoch(a, cal) === toEpoch(b, cal);
}

// What an exception (EXDATE, RECURRENCE-ID) is compared by: the day for an all
// day event or an exception given as a date, else the instant.
function instanceKeys(t: IcsTime, cal: IcsCalendar): string[] {
  return t.kind === 'date' ? [`d${dateKeyOf(t)}`] : [`d${dateKeyOf(t)}`, `t${toEpoch(t, cal)}`];
}

function untilPassed(start: IcsTime, until: IcsTime, cal: IcsCalendar): boolean {
  if (until.kind === 'date' || start.kind === 'date') return dateKeyOf(start) > dateKeyOf(until);
  return toEpoch(start, cal) > toEpoch(until, cal);
}

function occurrenceOf(ev: IcsEvent, start: IcsTime, cal: IcsCalendar, base: { lenMs: number; days: number }): Occurrence {
  if (start.kind === 'date') {
    const startKey = dateKeyOf(start);
    const endD = ymdAdd(start, Math.max(1, base.days));
    return {
      id: `${ev.uid}|${startKey}`,
      title: ev.title,
      allDay: true,
      startMs: toEpoch(start, cal),
      endMs: toEpoch({ kind: 'date', ...endD }, cal),
      startKey,
      endKey: dateKeyOf(endD),
    };
  }
  const startMs = toEpoch(start, cal);
  return { id: `${ev.uid}|${startMs}`, title: ev.title, allDay: false, startMs, endMs: startMs + base.lenMs };
}

function baseLength(ev: IcsEvent, cal: IcsCalendar): { lenMs: number; days: number } {
  const s = ev.start;
  if (s.kind === 'date') {
    if (ev.end && ev.end.kind === 'date') {
      const days = Math.round((Date.UTC(ev.end.y, ev.end.m - 1, ev.end.d) - Date.UTC(s.y, s.m - 1, s.d)) / DAY_MS);
      return { lenMs: 0, days: Math.max(1, days) };
    }
    if (ev.durationSec !== undefined) return { lenMs: 0, days: Math.max(1, Math.round(ev.durationSec / 86400)) };
    return { lenMs: 0, days: 1 };
  }
  if (ev.end) {
    const len = toEpoch(ev.end, cal) - toEpoch(s, cal);
    return { lenMs: Math.max(0, len), days: 0 };
  }
  if (ev.durationSec !== undefined) return { lenMs: ev.durationSec * 1000, days: 0 };
  return { lenMs: 0, days: 0 };
}

function overlaps(o: Occurrence, fromMs: number, toMs: number): boolean {
  if (o.endMs === o.startMs) return o.startMs >= fromMs && o.startMs < toMs;
  return o.startMs < toMs && o.endMs > fromMs;
}

// Every occurrence that overlaps [fromMs, toMs), sorted by start.
export function expandCalendar(cal: IcsCalendar, fromMs: number, toMs: number): Occurrence[] {
  const out: Occurrence[] = [];
  let budget = EXPAND_BUDGET;
  const masters = cal.events.filter((e) => !e.recurrenceId);
  const overrides = new Map<string, IcsEvent[]>();
  for (const e of cal.events) {
    if (!e.recurrenceId) continue;
    const list = overrides.get(e.uid) ?? [];
    list.push(e);
    overrides.set(e.uid, list);
  }
  for (const ev of masters) {
    if (ev.cancelled) continue;
    const base = baseLength(ev, cal);
    const moved = overrides.get(ev.uid) ?? [];
    // Exceptions given as a date match that whole day; as a time, that instant.
    const exDays = new Set<string>();
    const exTimes = new Set<string>();
    for (const x of [...ev.exdates, ...moved.map((o) => o.recurrenceId!)]) {
      const keys = instanceKeys(x, cal);
      if (x.kind === 'date' || ev.start.kind === 'date') exDays.add(keys[0]);
      else exTimes.add(keys[1]);
    }
    const skip = (t: IcsTime) => {
      const keys = instanceKeys(t, cal);
      return exDays.has(keys[0]) || (keys[1] !== undefined && exTimes.has(keys[1]));
    };
    // Far before the window (by more than the event's length and two days of
    // zone slack): skipped without the zone maths.
    const slack = base.lenMs + Math.max(1, base.days) * DAY_MS + 2 * DAY_MS;
    const early = (t: IcsTime) => Date.UTC(t.y, t.m - 1, t.d) + slack < fromMs;
    let count = 0;
    const push = (t: IcsTime) => {
      if (early(t) || skip(t)) return;
      const o = occurrenceOf(ev, t, cal, base);
      if (overlaps(o, fromMs, toMs)) out.push(o);
    };
    if (!ev.rule || ev.rule.unsupported) push(ev.start);
    else {
      const rule = ev.rule;
      walkRule(rule, ev.start, (d) => {
        if (--budget <= 0) return false;
        const t = withDay(ev.start, d);
        if (rule.until) {
          const u = rule.until;
          if (Date.UTC(t.y, t.m - 1, t.d) > Date.UTC(u.y, u.m - 1, u.d) + 2 * DAY_MS) return false;
          if (!early(t) && untilPassed(t, u, cal)) return false;
        }
        count++;
        if (rule.count !== undefined && count > rule.count) return false;
        // Past the window: stop.
        if (Date.UTC(t.y, t.m - 1, t.d) - 2 * DAY_MS >= toMs) return false;
        push(t);
        return out.length < MAX_EVENTS * 4 && count < MAX_STEPS;
      });
    }
    for (const r of ev.rdates) {
      if (!sameInstance(r, ev.start, cal)) push(r);
    }
    for (const o of moved) {
      if (o.cancelled) continue;
      const occ = occurrenceOf({ ...o, uid: ev.uid }, o.start, cal, baseLength({ ...o, durationSec: o.durationSec ?? (o.end ? undefined : base.lenMs / 1000) }, cal));
      occ.id = `${ev.uid}|r${toEpoch(o.recurrenceId!, cal)}`;
      if (overlaps(occ, fromMs, toMs)) out.push(occ);
    }
  }
  // An override whose master is not in this calendar still shows.
  const masterUids = new Set(masters.map((m) => m.uid));
  for (const [uid, list] of overrides) {
    if (masterUids.has(uid)) continue;
    for (const o of list) {
      if (o.cancelled) continue;
      const occ = occurrenceOf(o, o.start, cal, baseLength(o, cal));
      if (overlaps(occ, fromMs, toMs)) out.push(occ);
    }
  }
  const perEvent = new Map<string, number>();
  return out
    .sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id))
    .filter((o) => {
      const uid = o.id.slice(0, o.id.lastIndexOf('|'));
      const n = (perEvent.get(uid) ?? 0) + 1;
      perEvent.set(uid, n);
      return n <= MAX_OCCURRENCES_PER_EVENT;
    });
}
