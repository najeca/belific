// The iPhone's Google sign in rules (2.18.1): the callback gate, the PKCE state,
// the SHA-256 challenge and the sign out scope. Injected fakes only: no device,
// no network, no real project. See the end of the file for what only a device
// can show.
import test from 'node:test';
import assert from 'node:assert/strict';
import nodeCrypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { oauthOptions } from './authCore.ts';
import {
  PHONE_MAX_FAILURES,
  PHONE_SIGN_IN_WINDOW_MS,
  PhoneAuthGate,
  asciiBytes,
  base64url,
  checkPhoneAuthorizeUrl,
  ensureSha256Challenge,
  parsePhoneCallback,
  pkceChallengeOf,
  pkceVerifierStorageKey,
  randomnessIsSecure,
  sha256,
  signOutThisDevice,
  systemPathFor,
  verifierMatchesChallenge,
  type CryptoHost,
  type PhoneEndReason,
  type RandomHost,
} from './phoneAuthCore.ts';

const ORIGIN = 'https://example-project.supabase.co';
const FLOW = 'flow_abcdefgh12';
// A verifier of the shape auth-js makes from crypto.getRandomValues (112 lower case hex
// characters) and its S256 challenge.
const VERIFIER = 'ab'.repeat(56);
const CHALLENGE = pkceChallengeOf(VERIFIER);

function authorizeUrl(over: { provider?: string; redirect?: string | null; method?: string | null; challenge?: string | null; host?: string; path?: string; extra?: string } = {}): string {
  const u = new URL(`${over.host ?? ORIGIN}${over.path ?? '/auth/v1/authorize'}`);
  u.searchParams.set('provider', over.provider ?? 'google');
  if (over.redirect !== null) u.searchParams.set('redirect_to', over.redirect ?? `belific://auth-callback?sb_flow_id=${FLOW}`);
  if (over.challenge !== null) u.searchParams.set('code_challenge', over.challenge ?? CHALLENGE);
  if (over.method !== null) u.searchParams.set('code_challenge_method', over.method ?? 's256');
  return u.toString() + (over.extra ?? '');
}

const link = (q: string) => `belific://auth-callback?${q}`;

// --- the callback link ------------------------------------------------------

test('parsePhoneCallback: only the exact belific://auth-callback shape', () => {
  assert.deepEqual(parsePhoneCallback(link(`sb_flow_id=${FLOW}&code=GOOD.code-1`)), { code: 'GOOD.code-1', flowId: FLOW });
  // the normal case: auth-js does not add a flow id to the redirect
  assert.deepEqual(parsePhoneCallback(link('code=abc')), { code: 'abc', flowId: null });
  assert.deepEqual(parsePhoneCallback(`belific://auth-callback/?sb_flow_id=${FLOW}&code=abc`), { code: 'abc', flowId: FLOW });
  assert.deepEqual(parsePhoneCallback(link(`sb_flow_id=${FLOW}&error=access_denied&error_description=x`)), { error: true, flowId: FLOW });
  const bad: unknown[] = [
    null,
    undefined,
    42,
    '',
    'https://auth-callback/?code=abc',
    `belific://other?sb_flow_id=${FLOW}&code=abc`,
    `belific://auth-callback/extra?sb_flow_id=${FLOW}&code=abc`,
    `belific://user@auth-callback?sb_flow_id=${FLOW}&code=abc`,
    `belific://auth-callback:99?sb_flow_id=${FLOW}&code=abc`,
    `belific://auth-callback?sb_flow_id=${FLOW}&code=abc#frag`,
    link(`sb_flow_id=short&code=abc`),
    link(`sb_flow_id=${FLOW}`), // no code
    link(`sb_flow_id=${FLOW}&code=a&code=b`), // two codes
    link(`sb_flow_id=${FLOW}&code=has space`),
    link(`sb_flow_id=${FLOW}&code=${'a'.repeat(513)}`),
    `belific://auth-callback?sb_flow_id=${FLOW}&code=${'a'.repeat(5000)}`,
  ];
  for (const b of bad) assert.equal(parsePhoneCallback(b), null, String(b).slice(0, 60));
});

// --- the URL that opens the browser ------------------------------------------

test('checkPhoneAuthorizeUrl: this project, Google only, exact redirect and a real S256 challenge', () => {
  assert.deepEqual(checkPhoneAuthorizeUrl(authorizeUrl(), ORIGIN), { flowId: FLOW, challenge: CHALLENGE });
  // no flow id in the redirect is the normal case (see the PKCE test below)
  assert.deepEqual(checkPhoneAuthorizeUrl(authorizeUrl({ redirect: 'belific://auth-callback' }), ORIGIN), { flowId: null, challenge: CHALLENGE });
  const refused: Array<[string, string]> = [
    ['other host', authorizeUrl({ host: 'https://evil.example.com' })],
    ['http', authorizeUrl({ host: 'http://example-project.supabase.co' })],
    ['other path', authorizeUrl({ path: '/auth/v1/logout' })],
    ['apple', authorizeUrl({ provider: 'apple' })],
    ['email', authorizeUrl({ provider: 'email' })],
    ['mixed case provider', authorizeUrl({ provider: 'Google' })],
    ['two providers', authorizeUrl({ extra: '&provider=apple' })],
    ['no redirect_to', authorizeUrl({ redirect: null })],
    ['two redirect_to', authorizeUrl({ extra: '&redirect_to=https%3A%2F%2Fevil.example.com' })],
    ['https redirect', authorizeUrl({ redirect: `https://example.com/?sb_flow_id=${FLOW}` })],
    ['other scheme host', authorizeUrl({ redirect: `belific://elsewhere?sb_flow_id=${FLOW}` })],
    ['redirect path', authorizeUrl({ redirect: `belific://auth-callback/x?sb_flow_id=${FLOW}` })],
    ['bad flow id', authorizeUrl({ redirect: 'belific://auth-callback?sb_flow_id=x' })],
    ['plain challenge method', authorizeUrl({ method: 'plain' })],
    ['no challenge method', authorizeUrl({ method: null })],
    ['no challenge', authorizeUrl({ challenge: null })],
    ['short challenge (a plain verifier)', authorizeUrl({ challenge: 'A'.repeat(112) })],
    ['two methods', authorizeUrl({ extra: '&code_challenge_method=plain' })],
  ];
  for (const [name, url] of refused) assert.equal(checkPhoneAuthorizeUrl(url, ORIGIN), false, name);
  assert.equal(checkPhoneAuthorizeUrl('not a url', ORIGIN), false);
  assert.equal(checkPhoneAuthorizeUrl(null, ORIGIN), false);
});

// --- the gate -----------------------------------------------------------------

test('gate: a link is accepted only for a sign in started in this run, once, with the same flow id', () => {
  const ends: PhoneEndReason[] = [];
  const gate = new PhoneAuthGate(ORIGIN, PHONE_SIGN_IN_WINDOW_MS, (r) => ends.push(r));
  const good = link(`sb_flow_id=${FLOW}&code=abc`);

  // nothing started in this run (a cold start, a stale link): refused
  assert.deepEqual(gate.accept(good, 1000), { ok: false, reason: 'no-pending' });

  assert.deepEqual(gate.begin(authorizeUrl(), 1000, null, VERIFIER), { ok: true });
  assert.deepEqual(gate.begin(authorizeUrl(), 1001, null, VERIFIER), { ok: false, reason: 'busy' });
  assert.deepEqual(gate.accept(link(`sb_flow_id=${FLOW}`), 1002), { ok: false, reason: 'invalid' });
  assert.deepEqual(gate.accept(link('sb_flow_id=otherflow99&code=abc'), 1003), { ok: false, reason: 'mismatch' });
  assert.deepEqual(gate.accept(good, 1004), { ok: true, code: 'abc', flowId: null });
  // one exchange at a time
  assert.deepEqual(gate.accept(good, 1005), { ok: false, reason: 'busy' });
  assert.deepEqual(gate.finish(true, 1006), { ended: true });
  // single use: the same link after success finds nothing pending
  assert.deepEqual(gate.accept(good, 1007), { ok: false, reason: 'no-pending' });
  assert.deepEqual(ends, ['success']);
});

test('gate: the normal case, no flow id in the redirect: the exchange is bound to the flow id the client returned', () => {
  const gate = new PhoneAuthGate(ORIGIN);
  const url = authorizeUrl({ redirect: 'belific://auth-callback' });
  assert.deepEqual(gate.begin(url, 0, 'clientflow_9876', VERIFIER), { ok: true });
  // a link that suddenly carries a flow id we never asked for is not ours
  assert.deepEqual(gate.accept(link(`sb_flow_id=${FLOW}&code=abc`), 1), { ok: false, reason: 'mismatch' });
  assert.deepEqual(gate.accept(link('code=abc'), 2), { ok: true, code: 'abc', flowId: 'clientflow_9876' });
  assert.deepEqual(gate.finish(true, 3), { ended: true });
  // a malformed client flow id is refused before the browser opens
  assert.deepEqual(new PhoneAuthGate(ORIGIN).begin(url, 0, 'bad id!', VERIFIER), { ok: false, reason: 'refused' });
});

test('gate: begin refuses anything but the Belific Google URL', () => {
  const gate = new PhoneAuthGate(ORIGIN);
  assert.deepEqual(gate.begin(authorizeUrl({ provider: 'apple' }), 1, null, VERIFIER), { ok: false, reason: 'refused' });
  assert.deepEqual(gate.begin(authorizeUrl({ method: 'plain' }), 1, null, VERIFIER), { ok: false, reason: 'refused' });
  assert.equal(gate.active, false);
});

test('gate: the browser opens only with a verifier from secure randomness that hashes to the challenge', () => {
  const url = authorizeUrl();
  const fresh = () => new PhoneAuthGate(ORIGIN);
  assert.deepEqual(fresh().begin(url, 0, null, VERIFIER), { ok: true });
  const refused = { ok: false, reason: 'refused' };
  assert.deepEqual(fresh().begin(url, 0, null, null), refused, 'no verifier read back');
  assert.deepEqual(fresh().begin(url, 0, null), refused, 'no verifier given');
  assert.deepEqual(fresh().begin(url, 0, null, 'cd'.repeat(56)), refused, 'valid shape but not the challenge of this URL');
  assert.deepEqual(fresh().begin(url, 0, null, 'AB-._~'.repeat(19).slice(0, 112)), refused, 'the Math.random alphabet');
  assert.deepEqual(fresh().begin(url, 0, null, VERIFIER.slice(1)), refused, 'wrong length');
  assert.deepEqual(fresh().begin(url, 0, null, VERIFIER.toUpperCase()), refused, 'capitals are not hex output');
  // a plain challenge (verifier == challenge) is refused twice over
  assert.deepEqual(fresh().begin(authorizeUrl({ method: 's256', challenge: VERIFIER.slice(0, 43) }), 0, null, VERIFIER), refused);
  assert.equal(verifierMatchesChallenge(VERIFIER, CHALLENGE), true);
  assert.equal(verifierMatchesChallenge(undefined, CHALLENGE), false);
});

test('gate: the ten minute window', () => {
  const ends: PhoneEndReason[] = [];
  const gate = new PhoneAuthGate(ORIGIN, PHONE_SIGN_IN_WINDOW_MS, (r) => ends.push(r));
  gate.begin(authorizeUrl(), 0, null, VERIFIER);
  const good = link(`sb_flow_id=${FLOW}&code=abc`);
  assert.equal(PHONE_SIGN_IN_WINDOW_MS, 10 * 60 * 1000);
  // exactly at the limit still counts; one millisecond later does not
  assert.equal(gate.accept(good, PHONE_SIGN_IN_WINDOW_MS).ok, true);
  gate.finish(false, PHONE_SIGN_IN_WINDOW_MS);
  assert.deepEqual(gate.accept(good, PHONE_SIGN_IN_WINDOW_MS + 1), { ok: false, reason: 'expired' });
  assert.deepEqual(ends, ['expired']);
  assert.equal(gate.active, false);
  // a clock that went backwards also ends it
  gate.begin(authorizeUrl(), 5000, null, VERIFIER);
  assert.deepEqual(gate.accept(good, 4000), { ok: false, reason: 'expired' });
});

test('gate: a failed exchange keeps the sign in alive, three failures end it', () => {
  const ends: PhoneEndReason[] = [];
  const gate = new PhoneAuthGate(ORIGIN, PHONE_SIGN_IN_WINDOW_MS, (r) => ends.push(r));
  gate.begin(authorizeUrl(), 0, null, VERIFIER);
  const good = link(`sb_flow_id=${FLOW}&code=abc`);
  assert.equal(PHONE_MAX_FAILURES, 3);
  for (let i = 1; i <= 2; i++) {
    assert.equal(gate.accept(good, i).ok, true);
    assert.deepEqual(gate.finish(false, i), { ended: false });
  }
  assert.equal(gate.accept(good, 3).ok, true);
  assert.deepEqual(gate.finish(false, 3), { ended: true });
  assert.deepEqual(ends, ['too-many-failures']);
  assert.deepEqual(gate.accept(good, 4), { ok: false, reason: 'no-pending' });
});

test('gate: a provider error link counts as a failure, a stray one does not', () => {
  const gate = new PhoneAuthGate(ORIGIN);
  gate.begin(authorizeUrl(), 0, null, VERIFIER);
  // an error link for some other flow is ignored
  assert.deepEqual(gate.accept(link('sb_flow_id=otherflow99&error=access_denied'), 1), { ok: false, reason: 'mismatch' });
  assert.equal(gate.active, true);
  assert.deepEqual(gate.accept(link(`sb_flow_id=${FLOW}&error=access_denied`), 2), { ok: false, reason: 'provider-error', ended: false });
  assert.deepEqual(gate.accept(link(`sb_flow_id=${FLOW}&error=access_denied`), 3), { ok: false, reason: 'provider-error', ended: false });
  assert.deepEqual(gate.accept(link(`sb_flow_id=${FLOW}&error=access_denied`), 4), { ok: false, reason: 'provider-error', ended: true });
});

test('gate: cancel ends it once, and a later begin starts fresh', () => {
  const ends: PhoneEndReason[] = [];
  const gate = new PhoneAuthGate(ORIGIN, PHONE_SIGN_IN_WINDOW_MS, (r) => ends.push(r));
  gate.cancel(); // nothing pending: no event
  gate.begin(authorizeUrl(), 0, null, VERIFIER);
  gate.cancel();
  gate.cancel();
  assert.deepEqual(ends, ['cancelled']);
  assert.deepEqual(gate.begin(authorizeUrl(), 10, null, VERIFIER), { ok: true });
});

test('refusals are reason codes only: no link, code or flow id is ever in a result', () => {
  const gate = new PhoneAuthGate(ORIGIN);
  gate.begin(authorizeUrl(), 0, null, VERIFIER);
  const secret = 'SECRETCODE123';
  const results = [
    gate.accept(link(`sb_flow_id=otherflow99&code=${secret}`), 1),
    gate.accept(`belific://auth-callback/x?code=${secret}`, 2),
    gate.accept(link(`sb_flow_id=${FLOW}&error=denied&error_description=${secret}`), 3),
  ];
  for (const r of results) assert.doesNotMatch(JSON.stringify(r), new RegExp(`${secret}|${FLOW}|belific://`));
});

// --- PKCE state, with the real client ------------------------------------------

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    storage: {
      getItem: async (k: string) => map.get(k) ?? null,
      setItem: async (k: string, v: string) => void map.set(k, v),
      removeItem: async (k: string) => void map.delete(k),
    },
  };
}

function pkceClient(fetchImpl?: typeof fetch) {
  const mem = memoryStorage();
  const client = createClient(ORIGIN, 'anon-test-key', {
    auth: { flowType: 'pkce', storage: mem.storage, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
    ...(fetchImpl ? { global: { fetch: fetchImpl } } : {}),
  });
  return { client, mem };
}

function storedVerifier(map: Map<string, string>, flowId: string): string {
  const entry = [...map.entries()].find(([k]) => k.includes(`-flow-${flowId}-code-verifier`));
  assert.ok(entry, 'a code verifier was stored for this flow');
  return JSON.parse(entry[1]) as string; // auth-js stores it JSON encoded
}

test('PKCE with the real client (WebCrypto present): provider, redirect_to, flow id and an S256 challenge of the stored verifier', async () => {
  const { client, mem } = pkceClient();
  const { data, error } = await client.auth.signInWithOAuth({ provider: 'google', options: oauthOptions('google') });
  assert.equal(error, null);
  const url = new URL(data.url as string);
  assert.equal(url.origin, ORIGIN);
  assert.equal(url.pathname, '/auth/v1/authorize');
  assert.equal(url.searchParams.get('provider'), 'google');
  assert.equal(url.searchParams.get('prompt'), 'select_account');
  // exactly the redirect we asked for: auth-js adds nothing to it (the flow id
  // option is off, because the redirect allow list compares the query string)
  assert.equal(url.searchParams.get('redirect_to'), 'belific://auth-callback');
  const flowId = (data as { flowId?: string | null }).flowId as string;
  assert.match(flowId, /^[A-Za-z0-9_-]{8,64}$/);
  assert.equal(url.searchParams.get('code_challenge_method'), 's256');
  assert.equal(url.searchParams.get('code_challenge'), nodeCrypto.createHash('sha256').update(storedVerifier(mem.map, flowId)).digest('base64url'));
  // and the phone's own gate accepts exactly this URL, with the verifier read back from the store
  assert.ok(checkPhoneAuthorizeUrl(data.url, ORIGIN));
  const verifier = storedVerifier(mem.map, flowId);
  assert.match(verifier, /^[0-9a-f]{112}$/, 'drawn from crypto.getRandomValues');
  assert.equal(new PhoneAuthGate(ORIGIN).begin(data.url as string, 0, flowId, verifier).ok, true);
  // the storage key the app reads is the one auth-js writes (an upgrade that renames it fails here)
  assert.ok(mem.map.has(pkceVerifierStorageKey(ORIGIN, flowId)));
  assert.equal(JSON.parse(mem.map.get(pkceVerifierStorageKey(ORIGIN, flowId)) as string), verifier);
});

test('auth-js draws the verifier from crypto.getRandomValues whenever crypto exists; Math.random only if crypto is missing altogether', async () => {
  // 1. a getRandomValues we control: the verifier is built from exactly its bytes
  const before = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const calls: number[] = [];
  try {
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        subtle: nodeCrypto.webcrypto.subtle,
        getRandomValues: (a: Uint32Array) => {
          calls.push(a.length);
          a.fill(0x1ab); // each value is cut to its last two hex digits: 'ab'
          return a;
        },
      },
      configurable: true,
      writable: true,
    });
    const { client, mem } = pkceClient();
    const { data } = await client.auth.signInWithOAuth({ provider: 'google', options: oauthOptions('google') });
    assert.ok(calls.includes(56), 'the verifier asked getRandomValues for 56 values');
    assert.equal(storedVerifier(mem.map, (data as { flowId: string }).flowId), VERIFIER);
    // 2. no crypto at all: Math.random alphabet, which the gate cannot confuse with the hex shape
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
    const noCrypto = pkceClient();
    const warn = console.warn;
    console.warn = () => {};
    try {
      const out = await noCrypto.client.auth.signInWithOAuth({ provider: 'google', options: oauthOptions('google') });
      const v = storedVerifier(noCrypto.mem.map, (out.data as { flowId: string }).flowId);
      assert.equal(v.length, 56, 'the Math.random branch makes 56 characters, not 112');
      assert.doesNotMatch(v, /^[0-9a-f]{112}$/, 'the Math.random branch is not mistaken for secure output');
      assert.equal(new PhoneAuthGate(ORIGIN).begin(out.data.url as string, 0, null, v).ok, false);
    } finally {
      console.warn = warn;
    }
  } finally {
    if (before) Object.defineProperty(globalThis, 'crypto', before);
  }
});

async function withoutSubtle<T>(fn: () => Promise<T>): Promise<T> {
  // What Hermes looks like: getRandomValues (react-native-get-random-values) but no crypto.subtle.
  const before = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const warn = console.warn;
  Object.defineProperty(globalThis, 'crypto', {
    value: { getRandomValues: (a: Uint8Array<ArrayBuffer>) => nodeCrypto.webcrypto.getRandomValues(a) },
    configurable: true,
    writable: true,
  });
  console.warn = () => {};
  try {
    return await fn();
  } finally {
    console.warn = warn;
    if (before) Object.defineProperty(globalThis, 'crypto', before);
  }
}

test('no crypto.subtle (React Native): auth-js silently falls back to a plain challenge, and the gate refuses it', async () => {
  await withoutSubtle(async () => {
    const { client } = pkceClient();
    const { data } = await client.auth.signInWithOAuth({ provider: 'google', options: oauthOptions('google') });
    const url = new URL(data.url as string);
    assert.equal(url.searchParams.get('code_challenge_method'), 'plain');
    assert.equal(checkPhoneAuthorizeUrl(data.url, ORIGIN), false);
  });
});

test('no crypto.subtle: ensureSha256Challenge installs a digest and the same call becomes real S256', async () => {
  await withoutSubtle(async () => {
    const installed = ensureSha256Challenge(globalThis as unknown as CryptoHost);
    assert.equal(installed.digest, true);
    const { client, mem } = pkceClient();
    const { data } = await client.auth.signInWithOAuth({ provider: 'google', options: oauthOptions('google') });
    const url = new URL(data.url as string);
    assert.equal(url.searchParams.get('code_challenge_method'), 's256');
    const flowId = (data as { flowId?: string | null }).flowId as string;
    assert.equal(url.searchParams.get('code_challenge'), nodeCrypto.createHash('sha256').update(storedVerifier(mem.map, flowId)).digest('base64url'));
    assert.ok(checkPhoneAuthorizeUrl(data.url, ORIGIN));
    // the whole chain (auth-js, TextEncoder, our digest) agrees with a hash built from hand made bytes
    assert.equal(url.searchParams.get('code_challenge'), pkceChallengeOf(storedVerifier(mem.map, flowId)));
    // a second call installs nothing again
    assert.deepEqual(ensureSha256Challenge(globalThis as unknown as CryptoHost), { textEncoder: false, digest: false });
  });
});

test('the code exchange sends the code and the verifier stored for this flow, to the PKCE token endpoint', async () => {
  const requests: Array<{ url: string; body: Record<string, string> }> = [];
  const fetchImpl = (async (input: unknown, init?: { body?: unknown }) => {
    const req = input instanceof Request ? input : null;
    const url = req ? req.url : String(input);
    const text = req ? await req.text() : String(init?.body ?? '');
    requests.push({ url, body: text ? (JSON.parse(text) as Record<string, string>) : {} });
    return new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'x' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  const { client, mem } = pkceClient(fetchImpl);
  const { data } = await client.auth.signInWithOAuth({ provider: 'google', options: oauthOptions('google') });
  const flowId = (data as { flowId?: string | null }).flowId as string;
  const verifier = storedVerifier(mem.map, flowId);

  const result = await client.auth.exchangeCodeForSession('the-code', { flowId });
  assert.ok(result.error, 'the fake server refuses, which is all this test needs');
  assert.equal(requests.length, 1);
  assert.equal(new URL(requests[0].url).pathname, '/auth/v1/token');
  assert.equal(new URL(requests[0].url).searchParams.get('grant_type'), 'pkce');
  assert.equal(requests[0].body.auth_code, 'the-code');
  assert.equal(requests[0].body.code_verifier, verifier);

  // a flow id that was never started finds no verifier and sends nothing
  const none = await client.auth.exchangeCodeForSession('the-code', { flowId: 'neverstarted99' });
  assert.ok(none.error);
  assert.equal(requests.length, 1);
});

// --- SHA-256 ----------------------------------------------------------------

test('sha256 equals Node crypto for every length around the block borders, and for random and UTF-8 input', () => {
  const ref = (b: Uint8Array) => new Uint8Array(nodeCrypto.createHash('sha256').update(b).digest());
  for (let len = 0; len <= 300; len++) {
    const data = new Uint8Array(len).map((_, i) => (i * 31 + len) & 0xff);
    assert.deepEqual(sha256(data), ref(data), `length ${len}`);
  }
  for (let i = 0; i < 50; i++) {
    const data = new Uint8Array(nodeCrypto.randomBytes(1 + Math.floor(Math.random() * 2000)));
    assert.deepEqual(sha256(data), ref(data));
  }
  const text = new TextEncoder().encode('Belific ÆØÅ 日本語 😀');
  assert.deepEqual(sha256(text), ref(text));
  assert.equal(Buffer.from(sha256(new TextEncoder().encode('abc'))).toString('hex'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('base64url, asciiBytes and pkceChallengeOf: the RFC 7636 example, no btoa and no TextEncoder', () => {
  // RFC 7636 appendix B
  assert.equal(pkceChallengeOf('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  for (let len = 0; len < 40; len++) {
    const b = new Uint8Array(nodeCrypto.randomBytes(len));
    assert.equal(base64url(b), Buffer.from(b).toString('base64url'), `length ${len}`);
  }
  assert.deepEqual([...asciiBytes('aZ09')], [97, 90, 48, 57]);
  const saved = globalThis.TextEncoder;
  // @ts-expect-error simulate a host without TextEncoder
  delete globalThis.TextEncoder;
  try {
    assert.equal(pkceChallengeOf(VERIFIER), CHALLENGE);
  } finally {
    globalThis.TextEncoder = saved;
  }
});

test('randomnessIsSecure: needs a real getRandomValues that never touches Math.random', () => {
  const real: RandomHost = { crypto: { getRandomValues: (a: Uint8Array) => nodeCrypto.webcrypto.getRandomValues(a as Uint8Array<ArrayBuffer>) } };
  assert.equal(randomnessIsSecure(real), true);
  assert.equal(randomnessIsSecure({}), false, 'no crypto');
  assert.equal(randomnessIsSecure({ crypto: {} }), false, 'no getRandomValues');
  // the polyfill's insecure branch (react-native-get-random-values, debugger only)
  const insecure: RandomHost = {
    crypto: {
      getRandomValues: (array: Uint8Array) => {
        for (let i = 0, r = 0; i < array.length; i++) {
          if ((i & 3) === 0) r = Math.random() * 0x100000000;
          array[i] = (r >>> ((i & 3) << 3)) & 0xff;
        }
        return array;
      },
    },
  };
  assert.equal(randomnessIsSecure(insecure), false, 'Math.random backed');
  assert.equal(randomnessIsSecure({ crypto: { getRandomValues: (a: Uint8Array) => a } }), false, 'constant zeros');
  assert.equal(randomnessIsSecure({ crypto: { getRandomValues: (a: Uint8Array) => a.fill(7) } }), false, 'constant bytes');
  assert.equal(randomnessIsSecure({ crypto: { getRandomValues: (a: Uint8Array) => a.map((_, i) => i) } }), false, 'the same bytes every call');
  assert.equal(randomnessIsSecure({ crypto: { getRandomValues: () => { throw new Error('no native module'); } } }), false, 'throws');
  // Math.random is put back after the check, also after a throw
  const math = { random: () => 0.5 };
  const keep = math.random;
  randomnessIsSecure({ crypto: { getRandomValues: () => { throw new Error('x'); } } }, math);
  assert.equal(math.random, keep);
});

test('ensureSha256Challenge: installs only what is missing, never replaces, SHA-256 only', async () => {
  const host: CryptoHost = { crypto: { getRandomValues: () => 1 } };
  const first = ensureSha256Challenge(host);
  assert.deepEqual(first, { textEncoder: true, digest: true });
  const Encoder = host.TextEncoder as new () => { encode(s: string): Uint8Array };
  assert.deepEqual([...new Encoder().encode('aé€😀')], [...new TextEncoder().encode('aé€😀')]);
  const subtle = host.crypto?.subtle as { digest(a: unknown, d: Uint8Array): Promise<ArrayBuffer> };
  const input = new Uint8Array(new TextEncoder().encode('verifier'));
  const out = await subtle.digest('SHA-256', input);
  assert.ok(out instanceof ArrayBuffer);
  assert.deepEqual(new Uint8Array(out), new Uint8Array(nodeCrypto.createHash('sha256').update(input).digest()));
  assert.deepEqual(new Uint8Array(await subtle.digest({ name: 'sha-256' }, input)), new Uint8Array(out));
  await assert.rejects(() => subtle.digest('SHA-1', input));
  // existing parts are left alone
  const keepEncoder = class {};
  const keepSubtle = { digest: () => 'mine' };
  const host2: CryptoHost = { TextEncoder: keepEncoder, crypto: { subtle: keepSubtle } };
  assert.deepEqual(ensureSha256Challenge(host2), { textEncoder: false, digest: false });
  assert.equal(host2.TextEncoder, keepEncoder);
  assert.equal(host2.crypto?.subtle, keepSubtle);
  // a host without crypto at all gets one
  const host3: CryptoHost = {};
  assert.equal(ensureSha256Challenge(host3).digest, true);
});

// --- expo-router and the callback link -------------------------------------------

test('systemPathFor: the callback link never becomes a screen; everything else is left alone', () => {
  for (const p of [
    `belific://auth-callback?sb_flow_id=${FLOW}&code=abc`,
    'belific://auth-callback',
    'belific://auth-callback/',
    '/auth-callback',
    '/auth-callback?code=abc',
  ]) assert.equal(systemPathFor(p), '/settings', p);
  for (const p of ['/', '/settings', '/(tabs)/today', 'belific://settings', '/tasks', '/auth-callbacks', 'https://example.com/auth-callback']) {
    assert.equal(systemPathFor(p), p, p);
  }
  const intent = fs.readFileSync(path.join(import.meta.dirname, '..', 'app', '+native-intent.ts'), 'utf8');
  assert.match(intent, /export function redirectSystemPath/);
  assert.match(intent, /systemPathFor\(path\)/);
});

// --- sign out scope -------------------------------------------------------------

test('signOutThisDevice asks for the local scope, and passes an error on', async () => {
  const calls: unknown[] = [];
  await signOutThisDevice({ signOut: async (o) => (calls.push(o), { error: null }) });
  assert.deepEqual(calls, [{ scope: 'local' }]);
  const boom = new Error('x');
  await assert.rejects(() => signOutThisDevice({ signOut: async () => ({ error: boom }) }), boom);
});

test('every signOut call in the app asks for the local scope (the default would sign out the desktop and the other apps)', () => {
  const root = path.resolve(import.meta.dirname, '..');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name === 'supabase' || e.name.startsWith('.')) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.ts$/.test(e.name)) files.push(p);
    }
  };
  walk(path.join(root, 'app'));
  walk(path.join(root, 'lib'));
  walk(path.join(root, 'components'));
  let seen = 0;
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    // Calls on a Supabase auth object. The app's own wrapper signOut() in
    // auth.ts is not one of these; it is checked through signOutThisDevice.
    for (const m of text.matchAll(/\bauth\.signOut\s*\(([^)]*)\)/g)) {
      const line = text.slice(0, m.index).split('\n').length;
      seen += 1;
      assert.match(m[1], /scope:\s*'local'/, `${path.relative(root, file)}:${line} must sign out with scope local`);
    }
  }
  assert.ok(seen >= 4, `found the sign out calls (${seen})`);
  // no other call that revokes a session on the server
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /scope:\s*['"](global|others)['"]/, file);
    assert.doesNotMatch(text, /auth\.admin\b/, file);
  }
});

// What this file cannot show (needs a device or the real project):
//  - that on the device crypto.getRandomValues is the native SecRandomCopyBytes one. The
//    source says so (react-native-get-random-values: the native module unless a debugger
//    without sync native calls is attached, where it uses Math.random), the app asks
//    randomnessIsSecure() at run time and refuses to open the browser otherwise, but only a
//    device shows which branch ran, and that the pod is linked in the EAS build;
//  - that iOS hands belific://auth-callback back to the app after Safari, and what
//    the "Open in Belific?" prompt looks like;
//  - that expo-router, given the redirect from +native-intent.ts, stays on or opens
//    Settings without an "unmatched route" screen (only its documented contract is used);
//  - that Hermes has TextEncoder and that the plain JavaScript SHA-256 is fast enough
//    on the phone (it hashes one 112 character string);
//  - that Google and Supabase accept the redirect (dashboard settings);
//  - what the persisted Supabase session looks like after a real exchange.
