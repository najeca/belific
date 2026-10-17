// The secret link of the outbound calendar feed (build plan phase 8, step 2).
// Pure: NO runtime imports; see calendarFeed.test.ts. The Edge Function that
// serves the feed is supabase/functions/belific-calendar-feed.
//
// The token is one user_settings row (FEED_TOKEN_KEY), so it follows the person
// to every device and the server can find its owner. It is 32 random bytes
// (256 bits) from crypto.getRandomValues, base64url, 43 characters. Regenerate
// writes a new value (the old link stops working as soon as the change reaches
// the server); Turn off writes a tombstone. The data export leaves the row out
// (its key contains "token", lib/dataExport.ts).

export const FEED_TOKEN_KEY = 'calendar.feed_token';
export const FEED_FUNCTION = 'belific-calendar-feed';
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function isFeedToken(v: unknown): v is string {
  return typeof v === 'string' && TOKEN_RE.test(v);
}

function base64url(bytes: Uint8Array): string {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += abc[(n >> 18) & 63] + abc[(n >> 12) & 63] + abc[(n >> 6) & 63] + abc[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += abc[(n >> 18) & 63] + abc[(n >> 12) & 63];
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += abc[(n >> 18) & 63] + abc[(n >> 12) & 63] + abc[(n >> 6) & 63];
  }
  return out;
}

// A new token. `random` is crypto.getRandomValues (injected so a test can
// prove where the bytes come from); refuses to make one without it.
export function newFeedToken(random: ((a: Uint8Array) => Uint8Array) | null | undefined = globalThis.crypto?.getRandomValues?.bind(globalThis.crypto)): string {
  if (!random) throw new Error('No secure random source');
  const bytes = new Uint8Array(32);
  random(bytes);
  if (bytes.every((b) => b === 0)) throw new Error('No secure random source');
  return base64url(bytes);
}

// https://<project>.supabase.co/functions/v1/belific-calendar-feed?t=<token>
export function feedUrl(supabaseUrl: string, token: string): string | null {
  if (!isFeedToken(token)) return null;
  let u: URL;
  try {
    u = new URL(supabaseUrl);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  return `${u.origin}/functions/v1/${FEED_FUNCTION}?t=${token}`;
}

// The same link for Apple's "subscribe" handler (webcal opens Calendar on a Mac or iPhone).
export function webcalUrl(httpsUrl: string): string {
  return httpsUrl.replace(/^https:\/\//, 'webcal://');
}

export const FEED_TEXT = {
  title: 'Your tasks in other calendars',
  explain:
    'A private link that Google Calendar, Apple Calendar and Outlook can subscribe to. It shows your tasks that have a Day and a time, from 30 days ago to a year ahead: the title and emoji only, never notes. Calendars check it every few hours, not instantly.',
  secret: 'Anyone with this link can see those task titles. Keep it private; if it leaks, make a new one.',
  signedOut: 'Sign in to get a feed link. It is served from your account, so it needs one.',
  none: 'No feed link yet.',
  create: 'Create feed link',
  copy: 'Copy link',
  copied: 'Link copied.',
  regenerate: 'Make a new link',
  regenerateConfirm: 'Make a new link? The old link stops working for every calendar that uses it, and you will need to subscribe again with the new one.',
  turnOff: 'Turn off feed',
  turnOffConfirm: 'Turn off the feed? The link stops working for every calendar that uses it.',
  pending: 'Saved on this device. The link becomes active once it has synced.',
  active: 'Active.',
  syncFailed: 'Not synced yet. Until it is, the change has not reached the server (the old link, if any, still works).',
} as const;
