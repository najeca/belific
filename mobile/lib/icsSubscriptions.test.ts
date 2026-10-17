// Imported calendar links on the desktop (build plan phase 8, step 3).
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSubscriptionUrl, defaultName, fetchErrorText, FETCH_ERROR_TEXT, isRefreshDue, linkHost, refreshedText, sanitizeSubscriptions, URL_ERROR_TEXT, REFRESH_EVERY_MS, RETRY_AFTER_ERROR_MS, MAX_SUBSCRIPTIONS } from './icsSubscriptions.ts';

test('only secure public links are accepted; webcal becomes https; the fragment is dropped', () => {
  assert.deepEqual(checkSubscriptionUrl(' webcal://p01-caldav.icloud.com/published/2/abc '), { ok: true, url: 'https://p01-caldav.icloud.com/published/2/abc' });
  assert.deepEqual(checkSubscriptionUrl('https://calendar.google.com/calendar/ical/x%40group/private-abc/basic.ics#top'), { ok: true, url: 'https://calendar.google.com/calendar/ical/x%40group/private-abc/basic.ics' });
  const bad: Array<[string, string]> = [
    ['', 'empty'],
    ['not a link', 'invalid'],
    ['http://example.com/cal.ics', 'not-https'],
    ['ftp://example.com/cal.ics', 'not-https'],
    ['file:///C:/cal.ics', 'not-https'],
    ['https://user:pass@example.com/cal.ics', 'credentials'],
    ['https://token@example.com/cal.ics', 'credentials'],
    ['https://localhost/cal.ics', 'local'],
    ['https://127.0.0.1/cal.ics', 'local'],
    ['https://10.0.0.5/cal.ics', 'local'],
    ['https://192.168.1.10/cal.ics', 'local'],
    ['https://172.20.0.1/cal.ics', 'local'],
    ['https://169.254.169.254/latest/meta-data', 'local'],
    ['https://[::1]/cal.ics', 'local'],
    ['https://[fd00::1]/cal.ics', 'local'],
    ['https://printer.local/cal.ics', 'local'],
    ['https://example.com:8443/cal.ics', 'local'],
    ['https://example.com/' + 'a'.repeat(2100), 'too-long'],
  ];
  for (const [url, reason] of bad) {
    const r = checkSubscriptionUrl(url);
    assert.equal(r.ok, false, url);
    assert.equal(!r.ok && r.reason, reason, url);
    assert.ok(!r.ok && URL_ERROR_TEXT[r.reason]);
  }
});

test('the screen shows only the host, never the path or query (they can be the secret)', () => {
  assert.equal(linkHost('https://calendar.google.com/calendar/ical/me/private-SECRET/basic.ics?x=1'), 'calendar.google.com');
  assert.equal(linkHost('garbage'), 'calendar');
  assert.equal(defaultName(undefined, 'https://outlook.office365.com/owa/calendar/SECRET/calendar.ics'), 'outlook.office365.com');
  assert.equal(defaultName('  Team  ', 'https://x.example/a'), 'Team');
});

test('error codes become fixed sentences; an unknown code reads as a network failure', () => {
  for (const code of Object.keys(FETCH_ERROR_TEXT)) assert.ok(fetchErrorText(code));
  assert.equal(fetchErrorText('ECONNRESET at 10.0.0.1'), FETCH_ERROR_TEXT.network);
  assert.equal(fetchErrorText(undefined), null);
});

test('refresh: every 30 minutes, 10 after a failure, at once when never tried', () => {
  const now = Date.parse('2026-10-17T12:00:00Z');
  const base = { id: 'a', name: 'A', url: 'https://x.example/a', addedAt: '2026-10-01T00:00:00Z' };
  assert.equal(isRefreshDue(base, now), true);
  assert.equal(isRefreshDue({ ...base, lastAttemptAt: new Date(now - REFRESH_EVERY_MS + 1000).toISOString() }, now), false);
  assert.equal(isRefreshDue({ ...base, lastAttemptAt: new Date(now - REFRESH_EVERY_MS).toISOString() }, now), true);
  assert.equal(isRefreshDue({ ...base, lastError: 'timeout', lastAttemptAt: new Date(now - RETRY_AFTER_ERROR_MS).toISOString() }, now), true);
});

test('last refreshed in words', () => {
  const now = new Date(2026, 9, 17, 12, 0).getTime();
  assert.equal(refreshedText(undefined, now), 'Not refreshed yet');
  assert.equal(refreshedText(new Date(2026, 9, 17, 10, 42).toISOString(), now), 'Refreshed 10:42');
  assert.equal(refreshedText(new Date(2026, 9, 16, 18, 5).toISOString(), now), 'Refreshed yesterday 18:05');
  assert.equal(refreshedText(new Date(2026, 9, 12, 9).toISOString(), now), 'Refreshed 12 Oct');
  assert.equal(refreshedText(new Date(2025, 9, 12, 9).toISOString(), now), 'Refreshed 12 Oct 2025');
});

test('a damaged stored list never breaks the screen: bad rows dropped, at most 10, links checked again', () => {
  assert.deepEqual(sanitizeSubscriptions(null), []);
  assert.deepEqual(sanitizeSubscriptions('x'), []);
  const rows = [
    { id: 'ok', name: 'Work', url: 'https://x.example/a.ics', addedAt: '2026-10-01T00:00:00Z', eventCount: 3 },
    { id: 'ok', name: 'Duplicate', url: 'https://x.example/b.ics' },
    { id: 'bad id!', url: 'https://x.example/c.ics' },
    { id: 'local', url: 'https://127.0.0.1/c.ics' },
    { id: 'http', url: 'http://x.example/c.ics' },
    { id: 'noname', url: 'webcal://y.example/c.ics', eventCount: -4 },
    7,
  ];
  const out = sanitizeSubscriptions(rows);
  assert.deepEqual(out.map((s) => s.id), ['ok', 'noname']);
  assert.equal(out[1].name, 'y.example');
  assert.equal(out[1].url, 'https://y.example/c.ics');
  assert.equal(out[1].eventCount, undefined);
  const many = Array.from({ length: 15 }, (_, i) => ({ id: `s${i}`, url: `https://x.example/${i}.ics` }));
  assert.equal(sanitizeSubscriptions(many).length, MAX_SUBSCRIPTIONS);
});

test('after a fetch: success replaces the events and clears the error; failure keeps them and records a known reason only', async () => {
  const { afterFetch } = await import('./icsSubscriptions.ts');
  const sub = { id: 'a', name: 'A', url: 'https://x.example/a', addedAt: '2026-10-01T00:00:00Z', lastError: 'timeout', eventCount: 9 };
  const good = afterFetch(sub, { ok: true, text: 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:1\r\nDTSTART:20261017T090000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n' }, '2026-10-17T12:00:00.000Z');
  assert.equal(good.sub.lastError, undefined);
  assert.equal(good.sub.lastRefreshedAt, '2026-10-17T12:00:00.000Z');
  assert.equal(good.sub.eventCount, 1);
  assert.equal(good.calendar!.events.length, 1);
  const bad = afterFetch({ ...sub, lastError: undefined, lastRefreshedAt: '2026-10-16T00:00:00Z' }, { ok: false, reason: 'http-status' }, '2026-10-17T12:00:00.000Z');
  assert.equal(bad.calendar, undefined, 'the old events stay as they were');
  assert.equal(bad.sub.lastError, 'http-status');
  assert.equal(bad.sub.lastRefreshedAt, '2026-10-16T00:00:00Z');
  assert.equal(bad.sub.eventCount, 9);
  assert.equal(afterFetch(sub, { ok: false, reason: 'getaddrinfo ENOTFOUND secret.example' }, 'x').sub.lastError, 'network');
});
