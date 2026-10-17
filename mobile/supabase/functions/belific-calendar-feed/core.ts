// The rules of belific-calendar-feed, kept free of Deno and network code so
// `node --test` can check them (lib/calendarFeedFunction.test.ts). index.ts is
// only the wiring.
//
// What it does: GET /functions/v1/belific-calendar-feed?t=<token> returns an
// iCalendar document of ONE user's timed tasks (lib/icsFeed.ts, copied into
// ./vendor). The token is the only credential: calendar apps send no login.
//
// What it reads, and nothing else (agreed with Jethro, 2026-10-17):
//  1. belific.user_settings: user_id of the one live row whose key is
//     'calendar.feed_token' and whose value is the token;
//  2. belific.tasks of THAT user_id only: id, title, emoji, due_date,
//     start_time, duration_minutes, completed, recurrence, recurrence_days,
//     recurrence_month_day, updated_at, deleted_at.
// The user id comes only from step 1, never from the request. Nothing is
// written. Every failure is one fixed sentence; nothing about a token, a user,
// a table or an error is ever returned or logged.
import type { Task, WeekDay } from './vendor/types.ts';
import { buildIcs, feedEvents } from './vendor/icsFeed.ts';
import { dateKey } from './vendor/kanban.ts';

export const FEED_TOKEN_KEY = 'calendar.feed_token';
export const BELIFIC_SCHEMA = 'belific';
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const TASK_COLUMNS = [
  'id',
  'title',
  'emoji',
  'due_date',
  'start_time',
  'duration_minutes',
  'completed',
  'recurrence',
  'recurrence_days',
  'recurrence_month_day',
  'updated_at',
  'deleted_at',
] as const;
export const PAGE_SIZE = 1000;
export const MAX_PAGES = 20;

// Per token: a calendar app checks every few hours; 30 in 10 minutes is plenty.
export const TOKEN_LIMIT = { max: 30, windowMs: 10 * 60 * 1000 };
// Per caller address, for requests whose token is malformed or unknown: caps guessing.
export const UNKNOWN_LIMIT = { max: 20, windowMs: 10 * 60 * 1000 };

export interface FeedDb {
  // The owner of a live token row, null when there is none, 'error' when the read failed.
  ownerOfToken(token: string): Promise<string | null | 'error'>;
  // Every task row of that user (live and tombstones), or 'error'.
  tasksOf(userId: string): Promise<TaskRow[] | 'error'>;
}

export type TaskRow = Partial<Record<(typeof TASK_COLUMNS)[number], unknown>>;

export interface FeedResponse {
  status: number;
  headers: Record<string, string>;
  body: string | null;
}

// A fixed window counter per key, in memory. Best effort: an instance that
// restarts forgets its counts, and instances do not share them (a shared count
// would need a table, which is a schema change). Bounded: the oldest keys are
// dropped beyond maxKeys.
export class RateLimiter {
  private hits = new Map<string, { start: number; n: number }>();
  private readonly max: number;
  private readonly windowMs: number;
  private readonly maxKeys: number;
  constructor(max: number, windowMs: number, maxKeys = 10000) {
    this.max = max;
    this.windowMs = windowMs;
    this.maxKeys = maxKeys;
  }
  // Counts one request; returns 0 when allowed, else seconds to wait.
  hit(key: string, now: number): number {
    const e = this.hits.get(key);
    if (!e || now - e.start >= this.windowMs) {
      this.hits.delete(key);
      if (this.hits.size >= this.maxKeys) {
        const oldest = this.hits.keys().next().value;
        if (oldest !== undefined) this.hits.delete(oldest);
      }
      this.hits.set(key, { start: now, n: 1 });
      return 0;
    }
    e.n += 1;
    return e.n > this.max ? Math.max(1, Math.ceil((e.start + this.windowMs - now) / 1000)) : 0;
  }
  // Seconds to wait without counting; 0 when allowed.
  blocked(key: string, now: number): number {
    const e = this.hits.get(key);
    if (!e || now - e.start >= this.windowMs || e.n < this.max) return 0;
    return Math.max(1, Math.ceil((e.start + this.windowMs - now) / 1000));
  }
}

const BASE_HEADERS: Record<string, string> = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
};

function plain(status: number, text: string, extra: Record<string, string> = {}): FeedResponse {
  return { status, headers: { ...BASE_HEADERS, 'Content-Type': 'text/plain; charset=utf-8', ...extra }, body: `${text}\n` };
}

export const TEXT = {
  notFound: 'Not found',
  tooMany: 'Too many requests',
  method: 'Method not allowed',
  unavailable: 'The feed is unavailable. Try again later.',
} as const;

const notFound = () => plain(404, TEXT.notFound);
const tooMany = (retry: number) => plain(429, TEXT.tooMany, { 'Retry-After': String(retry) });
const unavailable = () => plain(503, TEXT.unavailable, { 'Retry-After': '300' });

export function tokenFrom(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const all = u.searchParams.getAll('t');
  if (all.length !== 1) return null;
  return TOKEN_RE.test(all[0]) ? all[0] : null;
}

// The caller's address as the platform reports it (first X-Forwarded-For hop).
export function callerKey(headers: { get(name: string): string | null }): string {
  const fwd = headers.get('x-forwarded-for') ?? '';
  const first = fwd.split(',')[0].trim();
  return first ? first.slice(0, 64) : 'unknown';
}

const WEEKDAYS = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

// A row as a Task, with only the fields the feed needs; anything odd is dropped.
export function rowToTask(r: TaskRow): Task | null {
  const id = str(r.id);
  if (!id) return null;
  const updatedAt = str(r.updated_at) ?? new Date(0).toISOString();
  const t: Task = { id, title: str(r.title) ?? '', completed: r.completed === true, createdAt: updatedAt, updatedAt };
  const emoji = str(r.emoji);
  if (emoji) t.emoji = emoji.slice(0, 16);
  const due = str(r.due_date);
  if (due) t.dueDate = due;
  const start = str(r.start_time);
  if (start) t.startTime = start;
  if (typeof r.duration_minutes === 'number' && Number.isFinite(r.duration_minutes)) t.durationMinutes = r.duration_minutes;
  const rec = str(r.recurrence);
  if (rec) t.recurrence = rec as Task['recurrence'];
  if (Array.isArray(r.recurrence_days)) {
    const days = r.recurrence_days.filter((d): d is WeekDay => typeof d === 'string' && WEEKDAYS.has(d));
    if (days.length) t.recurrenceDays = days;
  }
  if (typeof r.recurrence_month_day === 'number' && Number.isInteger(r.recurrence_month_day)) t.recurrenceMonthDay = r.recurrence_month_day;
  const del = str(r.deleted_at);
  if (del) t.deletedAt = del;
  return t;
}

export interface FeedDeps {
  db: FeedDb;
  tokenLimiter: RateLimiter;
  unknownLimiter: RateLimiter;
  now: () => Date;
}

export async function handleFeed(req: { method: string; url: string; headers: { get(name: string): string | null } }, deps: FeedDeps): Promise<FeedResponse> {
  const method = req.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return { ...plain(405, TEXT.method, { Allow: 'GET, HEAD' }), body: method === 'OPTIONS' ? null : `${TEXT.method}\n` };
  const nowMs = deps.now().getTime();
  const caller = callerKey(req.headers);
  // A caller who keeps sending bad tokens is stopped before any database read.
  const wait = deps.unknownLimiter.blocked(caller, nowMs);
  if (wait) return tooMany(wait);
  const token = tokenFrom(req.url);
  if (!token) {
    const w = deps.unknownLimiter.hit(caller, nowMs);
    return w ? tooMany(w) : notFound();
  }
  const tw = deps.tokenLimiter.hit(token, nowMs);
  if (tw) return tooMany(tw);
  let owner: string | null | 'error';
  try {
    owner = await deps.db.ownerOfToken(token);
  } catch {
    owner = 'error';
  }
  if (owner === 'error') return unavailable();
  if (!owner) {
    const w = deps.unknownLimiter.hit(caller, nowMs);
    return w ? tooMany(w) : notFound();
  }
  let rows: TaskRow[] | 'error';
  try {
    rows = await deps.db.tasksOf(owner);
  } catch {
    rows = 'error';
  }
  if (rows === 'error') return unavailable();
  const tasks = rows.map(rowToTask).filter((t): t is Task => t !== null);
  const now = deps.now();
  // The server's today (UTC on Supabase): projected days start here.
  const todayKey = dateKey(now);
  const body = buildIcs(feedEvents(tasks, todayKey), now);
  return {
    status: 200,
    headers: { ...BASE_HEADERS, 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="belific-tasks.ics"' },
    body: method === 'HEAD' ? null : body,
  };
}
