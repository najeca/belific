// Imported calendar subscriptions on the Windows desktop (build plan phase 8,
// step 3): the rules for the links, their state and their wording. Pure: NO
// runtime imports besides siblings; see icsSubscriptions.test.ts. The fetch itself is the main
// process's (desktop/src/icsFetch.js), which checks the link again.
//
// The subscriptions and their events stay on this computer (kv), never synced.
// A subscription link is often a secret in itself (Google's "secret address",
// Outlook's published calendar link), so it is never written to a log or an
// error, and the screen shows only its host.

import { parseIcs, type IcsCalendar } from './icsParse.ts';

export interface IcsSubscription {
  id: string;
  name: string;
  url: string;
  addedAt: string;
  lastRefreshedAt?: string;
  lastAttemptAt?: string;
  // A reason code (see FETCH_ERROR_TEXT), never a server's own text.
  lastError?: string;
  eventCount?: number;
}

export const MAX_SUBSCRIPTIONS = 10;
export const MAX_URL_LENGTH = 2048;
export const REFRESH_EVERY_MS = 30 * 60 * 1000;
// After a failure, wait a little longer before trying again on the timer.
export const RETRY_AFTER_ERROR_MS = 10 * 60 * 1000;

export type UrlCheck = { ok: true; url: string } | { ok: false; reason: 'empty' | 'invalid' | 'not-https' | 'credentials' | 'local' | 'too-long' };

export const URL_ERROR_TEXT: Record<Exclude<UrlCheck, { ok: true }>['reason'], string> = {
  empty: 'Paste the calendar link first.',
  invalid: 'That does not look like a calendar link.',
  'not-https': 'Only secure links (https:// or webcal://) can be added.',
  credentials: 'Links with a user name or password in them cannot be added.',
  local: 'Links to this computer or your local network cannot be added.',
  'too-long': 'That link is too long.',
};

// A literal address that is obviously local. The main process also checks
// every address a name resolves to (and every redirect).
function isLocalHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h === '') return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (h.includes(':')) return h === '::1' || h === '::' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80') || h.startsWith('::ffff:');
  return false;
}

export function checkSubscriptionUrl(raw: string): UrlCheck {
  let s = (raw ?? '').trim();
  if (!s) return { ok: false, reason: 'empty' };
  if (s.length > MAX_URL_LENGTH) return { ok: false, reason: 'too-long' };
  if (/^webcals?:\/\//i.test(s)) s = s.replace(/^webcals?:\/\//i, 'https://');
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (u.protocol !== 'https:') return { ok: false, reason: 'not-https' };
  if (u.username || u.password) return { ok: false, reason: 'credentials' };
  if (u.port && u.port !== '443') return { ok: false, reason: 'local' };
  if (isLocalHost(u.hostname)) return { ok: false, reason: 'local' };
  u.hash = '';
  return { ok: true, url: u.toString() };
}

// What the screen shows of a link: its host only (the path and query can be the secret).
export function linkHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'calendar';
  }
}

// What the main process may answer with, in words. Never the server's own text.
export const FETCH_ERROR_TEXT: Record<string, string> = {
  'invalid-url': 'The link is not a secure calendar link.',
  'blocked-address': 'The link points to a local or private address, so it was not opened.',
  'too-many-redirects': 'The link redirected too many times.',
  'redirect-refused': 'The link redirected somewhere that is not allowed.',
  timeout: 'The calendar took too long to answer.',
  'too-large': 'The calendar is too large to import (over 5 MB).',
  'http-status': 'The calendar server refused the request. Check the link is still shared.',
  'not-calendar': 'The link did not return a calendar.',
  network: 'Could not reach the calendar. Check your connection.',
  unavailable: 'Fetching calendars is not available in this version of the app.',
};

export function fetchErrorText(code: string | undefined): string | null {
  if (!code) return null;
  return FETCH_ERROR_TEXT[code] ?? FETCH_ERROR_TEXT.network;
}

export function isRefreshDue(s: IcsSubscription, nowMs: number): boolean {
  const last = s.lastAttemptAt ? Date.parse(s.lastAttemptAt) : NaN;
  if (!Number.isFinite(last)) return true;
  const wait = s.lastError ? RETRY_AFTER_ERROR_MS : REFRESH_EVERY_MS;
  return nowMs - last >= wait;
}

// "Refreshed 10:42", "Refreshed yesterday 18:05", "Refreshed 12 Oct", "Not refreshed yet".
export function refreshedText(iso: string | undefined, nowMs: number): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return 'Not refreshed yet';
  const d = new Date(t);
  const now = new Date(nowMs);
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, now)) return `Refreshed ${hhmm}`;
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameDay(d, y)) return `Refreshed yesterday ${hhmm}`;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `Refreshed ${d.getDate()} ${months[d.getMonth()]}${d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : ''}`;
}

export function defaultName(calendarName: string | undefined, url: string): string {
  const n = (calendarName ?? '').trim();
  return (n || linkHost(url)).slice(0, 60);
}

// Sanitises what was read back from kv (a damaged file never breaks the screen).
export function sanitizeSubscriptions(raw: unknown): IcsSubscription[] {
  if (!Array.isArray(raw)) return [];
  const out: IcsSubscription[] = [];
  const ids = new Set<string>();
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    if (typeof o.id !== 'string' || !/^[a-z0-9_-]{1,64}$/i.test(o.id) || ids.has(o.id)) continue;
    if (typeof o.url !== 'string') continue;
    const check = checkSubscriptionUrl(o.url);
    if (!check.ok) continue;
    ids.add(o.id);
    const str = (v: unknown) => (typeof v === 'string' && v.length < 200 ? v : undefined);
    out.push({
      id: o.id,
      name: typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 60) : linkHost(check.url),
      url: check.url,
      addedAt: str(o.addedAt) ?? new Date(0).toISOString(),
      lastRefreshedAt: str(o.lastRefreshedAt),
      lastAttemptAt: str(o.lastAttemptAt),
      lastError: str(o.lastError),
      eventCount: typeof o.eventCount === 'number' && o.eventCount >= 0 ? Math.floor(o.eventCount) : undefined,
    });
    if (out.length >= MAX_SUBSCRIPTIONS) break;
  }
  return out;
}

export type FetchResult = { ok: true; text: string } | { ok: false; reason: string };

// What one fetch does to a subscription. A success replaces its events and
// clears the error; a failure keeps the events it had (shown as they were) and
// records the reason. A calendar with no events at all is fine (an empty one).
export function afterFetch(sub: IcsSubscription, result: FetchResult, nowIso: string): { sub: IcsSubscription; calendar?: IcsCalendar } {
  if (!result.ok) {
    const reason = typeof result.reason === 'string' && FETCH_ERROR_TEXT[result.reason] ? result.reason : 'network';
    return { sub: { ...sub, lastAttemptAt: nowIso, lastError: reason } };
  }
  const calendar = parseIcs(result.text);
  const { lastError: _dropped, ...rest } = sub;
  // The count is of events that show: not cancelled, not a moved instance of another.
  const eventCount = calendar.events.filter((e) => !e.cancelled && !e.recurrenceId).length;
  return { sub: { ...rest, lastAttemptAt: nowIso, lastRefreshedAt: nowIso, eventCount }, calendar };
}
