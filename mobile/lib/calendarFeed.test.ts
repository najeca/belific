// The feed link and its token (build plan phase 8, step 2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { feedUrl, isFeedToken, newFeedToken, webcalUrl, FEED_FUNCTION, FEED_TOKEN_KEY } from './calendarFeed.ts';
import { FEED_TOKEN_KEY as FN_KEY, TOKEN_RE as FN_RE } from '../supabase/functions/belific-calendar-feed/core.ts';
import { looksSecret } from './dataExport.ts';

test('a token is 43 base64url characters from 32 secure random bytes, different every time', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const t = newFeedToken((a) => {
      webcrypto.getRandomValues(a as Uint8Array<ArrayBuffer>);
      return a;
    });
    assert.ok(isFeedToken(t), t);
    seen.add(t);
  }
  assert.equal(seen.size, 200);
  // The bytes come from the random source it is given, all 32 of them.
  const fixed = newFeedToken((a) => {
    a.set(Array.from({ length: 32 }, (_, i) => i * 7));
    return a;
  });
  assert.equal(Buffer.from(fixed, 'base64url').length, 32);
  assert.deepEqual([...Buffer.from(fixed, 'base64url')], Array.from({ length: 32 }, (_, i) => i * 7));
});

test('no random source, or one that does nothing, means no token', () => {
  assert.throws(() => newFeedToken(null));
  assert.throws(() => newFeedToken((a) => a));
});

test('the default random source is crypto.getRandomValues', () => {
  assert.ok(isFeedToken(newFeedToken()));
});

test('the link: https only, the fixed function name, the token as t', () => {
  const t = 'A'.repeat(43);
  assert.equal(feedUrl('https://vlogfwnmaqorhialcqbr.supabase.co', t), `https://vlogfwnmaqorhialcqbr.supabase.co/functions/v1/belific-calendar-feed?t=${t}`);
  assert.equal(feedUrl('https://vlogfwnmaqorhialcqbr.supabase.co/rest/v1/', t), `https://vlogfwnmaqorhialcqbr.supabase.co/functions/v1/belific-calendar-feed?t=${t}`);
  assert.equal(feedUrl('http://x.supabase.co', t), null);
  assert.equal(feedUrl('nonsense', t), null);
  assert.equal(feedUrl('https://x.supabase.co', 'short'), null);
  assert.equal(webcalUrl('https://a/b?t=1'), 'webcal://a/b?t=1');
  assert.equal(FEED_FUNCTION, 'belific-calendar-feed');
});

test('the app and the function agree on the setting key and the token shape', () => {
  assert.equal(FEED_TOKEN_KEY, FN_KEY);
  assert.equal(FEED_TOKEN_KEY, 'calendar.feed_token');
  for (const s of ['A'.repeat(43), 'a-_9'.repeat(10) + 'abc']) assert.equal(isFeedToken(s), FN_RE.test(s));
});

test('the data export leaves the token row out (its key looks secret)', () => {
  assert.ok(looksSecret(FEED_TOKEN_KEY));
});
