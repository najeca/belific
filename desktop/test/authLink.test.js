'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCallback, checkAuthorizeUrl, AuthGate, WINDOW_MS, PROVIDERS } = require('../src/authLink');

const HOST = 'https://uucycebkpgwbktdytxvr.supabase.co';
const FLOW = 'abcd1234efgh5678';
const authorize = (flow = FLOW) =>
  `${HOST}/auth/v1/authorize?provider=apple&redirect_to=${encodeURIComponent(
    'belific://auth-callback' + (flow ? `?sb_flow_id=${flow}` : ''),
  )}&code_challenge=x&code_challenge_method=s256&skip_http_redirect=true`;
const link = (q) => `belific://auth-callback?${q}`;

test('parseCallback accepts exactly the callback with a code', () => {
  assert.deepEqual(parseCallback(link(`sb_flow_id=${FLOW}&code=abc-123_x.y`)), { code: 'abc-123_x.y', flowId: FLOW });
  assert.deepEqual(parseCallback(link('code=abc')), { code: 'abc', flowId: null });
  // Windows adds a trailing slash to protocol launches.
  assert.equal(parseCallback('belific://auth-callback/?code=abc').code, 'abc');
});

test('parseCallback rejects wrong scheme, host, path, extras and a missing code', () => {
  for (const bad of [
    'https://auth-callback?code=abc',
    'belific://other?code=abc',
    'belific://auth-callback/extra?code=abc',
    'belific://auth-callback.evil.com?code=abc',
    'belific://user@auth-callback?code=abc',
    'belific://auth-callback:99?code=abc',
    'belific://auth-callback',
    'belific://auth-callback?code=',
    'belific://auth-callback?code=a&code=b',
    'belific://auth-callback?code=has space',
    'belific://auth-callback?code=abc#frag',
    'belific://auth-callback?sb_flow_id=x&code=abc',
    'not a url',
    '',
    null,
    undefined,
    42,
  ]) {
    assert.equal(parseCallback(bad), null, String(bad));
  }
});

test('provider error links parse as errors', () => {
  assert.deepEqual(parseCallback(link(`sb_flow_id=${FLOW}&error=access_denied&error_description=x`)), {
    error: true,
    flowId: FLOW,
  });
});

test('gate: begin accepts only the Belific Apple authorize URL', () => {
  const gate = new AuthGate(HOST);
  const refused = { ok: false, reason: 'refused' };
  assert.deepEqual(gate.begin('https://evil.example/auth/v1/authorize?provider=apple&redirect_to=belific%3A%2F%2Fauth-callback'), refused);
  assert.deepEqual(gate.begin(`${HOST}/auth/v1/authorize?provider=google&redirect_to=https%3A%2F%2Fevil.example`), refused);
  assert.deepEqual(gate.begin(`https://evil.example/auth/v1/authorize?provider=google&redirect_to=belific%3A%2F%2Fauth-callback`), refused);
  assert.deepEqual(gate.begin(`${HOST}/auth/v1/authorize?provider=apple&redirect_to=https%3A%2F%2Fevil.example`), refused);
  assert.deepEqual(gate.begin(`${HOST}/auth/v1/other?provider=apple&redirect_to=belific%3A%2F%2Fauth-callback`), refused);
  assert.deepEqual(gate.begin('javascript:alert(1)'), refused);
  assert.equal(gate.pending, null);
  assert.deepEqual(gate.begin(authorize()), { ok: true });
});

test('gate: unknown state, no pending sign in, replay, expiry', () => {
  const gate = new AuthGate(HOST);
  const good = link(`sb_flow_id=${FLOW}&code=abc`);
  // no sign in pending: rejected
  assert.deepEqual(gate.accept(good, 1000), { ok: false, reason: 'no-pending' });
  gate.begin(authorize(), 1000);
  // a link for a different flow is ignored and does not use up the pending sign in
  assert.deepEqual(gate.accept(link('sb_flow_id=zzzzzzzzzzzz&code=abc'), 2000), { ok: false, reason: 'mismatch' });
  assert.deepEqual(gate.accept(link('code=abc'), 2000), { ok: false, reason: 'mismatch' });
  assert.deepEqual(gate.accept('belific://wrong?code=abc', 2000), { ok: false, reason: 'invalid' });
  // the right one is handed out once; while it is being exchanged another is busy
  assert.deepEqual(gate.accept(good, 3000), { ok: true, code: 'abc', flowId: FLOW });
  assert.deepEqual(gate.accept(good, 3500), { ok: false, reason: 'busy' });
  assert.deepEqual(gate.finish(true, 3600), { ended: true });
  // a replayed code after success is ignored
  assert.deepEqual(gate.accept(good, 4000), { ok: false, reason: 'no-pending' });
  // expiry
  gate.begin(authorize(), 10_000);
  assert.deepEqual(gate.accept(good, 10_000 + WINDOW_MS + 1), { ok: false, reason: 'expired' });
  assert.equal(gate.pending, null);
});

test('gate: a sign in without a flow id accepts only a link without one', () => {
  const gate = new AuthGate(HOST);
  gate.begin(authorize(null), 0);
  assert.equal(gate.accept(link(`sb_flow_id=${FLOW}&code=abc`), 1).ok, false);
  assert.equal(gate.accept(link('code=abc'), 1).ok, true);
});

test('gate: a provider error counts as a failure but keeps the sign in alive', () => {
  const gate = new AuthGate(HOST);
  gate.begin(authorize(), 0);
  const r = gate.accept(link(`sb_flow_id=${FLOW}&error=access_denied`), 1);
  assert.deepEqual(r, { ok: false, reason: 'provider-error', ended: false });
  assert.ok(gate.pending);
});

test('gate results never contain the link', () => {
  const gate = new AuthGate(HOST);
  const secret = 'SECRETCODE123';
  const r = gate.accept(link(`code=${secret}`), 0);
  assert.equal(JSON.stringify(r).includes(secret), false);
});

test('M1: a junk code fails, then the real code still completes the sign in', () => {
  const ends = [];
  const gate = new AuthGate(HOST, WINDOW_MS, (r) => ends.push(r));
  gate.begin(authorize(), 0);
  assert.equal(gate.accept(link(`sb_flow_id=${FLOW}&code=junk`), 10).ok, true);
  assert.deepEqual(gate.finish(false, 20), { ended: false });
  assert.equal(gate.active, true);
  assert.equal(gate.accept(link(`sb_flow_id=${FLOW}&code=real`), 30).code, 'real');
  assert.deepEqual(gate.finish(true, 40), { ended: true });
  assert.deepEqual(ends, ['success']);
});

test('M1: three failed attempts close the sign in', () => {
  const ends = [];
  const gate = new AuthGate(HOST, WINDOW_MS, (r) => ends.push(r));
  gate.begin(authorize(), 0);
  for (let i = 0; i < 2; i++) {
    assert.equal(gate.accept(link(`sb_flow_id=${FLOW}&code=junk${i}`), 10 + i).ok, true);
    assert.equal(gate.finish(false, 20 + i).ended, false);
  }
  assert.equal(gate.accept(link(`sb_flow_id=${FLOW}&code=junk3`), 50).ok, true);
  assert.deepEqual(gate.finish(false, 60), { ended: true });
  assert.deepEqual(ends, ['too-many-failures']);
  assert.equal(gate.accept(link(`sb_flow_id=${FLOW}&code=real`), 70).reason, 'no-pending');
});

test('M1: expiry ends the sign in (also through sweep) and reports it once', () => {
  const ends = [];
  const gate = new AuthGate(HOST, WINDOW_MS, (r) => ends.push(r));
  gate.begin(authorize(), 0);
  gate.sweep(WINDOW_MS - 1);
  assert.equal(gate.active, true);
  gate.sweep(WINDOW_MS + 1);
  gate.sweep(WINDOW_MS + 2);
  assert.deepEqual(ends, ['expired']);
});

test('M1: cancel reports once; a finish with nothing exchanging is harmless', () => {
  const ends = [];
  const gate = new AuthGate(HOST, WINDOW_MS, (r) => ends.push(r));
  gate.begin(authorize(), 0);
  assert.deepEqual(gate.finish(false, 1), { ended: false });
  assert.equal(gate.pending.failures, 0);
  gate.cancel();
  gate.cancel();
  assert.deepEqual(ends, ['cancelled']);
});

test('L4: a second begin while one is running is refused as busy; after expiry it is allowed', () => {
  const gate = new AuthGate(HOST);
  assert.deepEqual(gate.begin(authorize(), 0), { ok: true });
  assert.deepEqual(gate.begin(authorize(), 5), { ok: false, reason: 'busy' });
  assert.deepEqual(gate.begin(authorize(), WINDOW_MS + 5), { ok: true });
});

// Checkpoint 12 (decision 026): the allow list is Apple and Google, nothing else.
const redirect = encodeURIComponent('belific://auth-callback');
const authorizeFor = (providerQuery) => `${HOST}/auth/v1/authorize?${providerQuery}&redirect_to=${redirect}&code_challenge=x&code_challenge_method=s256`;

test('the allow list is exactly apple and google', () => {
  assert.deepEqual(PROVIDERS, ['apple', 'google']);
});

test('checkAuthorizeUrl accepts Apple and Google the same way, with or without an account chooser', () => {
  assert.deepEqual(checkAuthorizeUrl(authorizeFor('provider=apple'), HOST), { flowId: null });
  assert.deepEqual(checkAuthorizeUrl(authorizeFor('provider=google'), HOST), { flowId: null });
  assert.deepEqual(checkAuthorizeUrl(authorizeFor('provider=google&prompt=select_account'), HOST), { flowId: null });
});

test('checkAuthorizeUrl refuses every other provider, spelling and a second provider', () => {
  for (const q of [
    'provider=github',
    'provider=email',
    'provider=facebook',
    'provider=Apple',
    'provider=GOOGLE',
    'provider=google%20',
    'provider=',
    'provider=apple&provider=github',
    'provider=github&provider=apple',
    'provider=google&provider=google',
    'provider[]=google',
    'prov=google',
    '',
  ]) {
    assert.equal(checkAuthorizeUrl(authorizeFor(q), HOST), false, q);
  }
});

test('a Google sign in goes through the same gate: one pending, a matching callback, one exchange', () => {
  const gate = new AuthGate(HOST);
  assert.deepEqual(gate.begin(authorizeFor('provider=google&prompt=select_account'), 1000), { ok: true });
  assert.deepEqual(gate.begin(authorizeFor('provider=apple'), 1500), { ok: false, reason: 'busy' });
  assert.deepEqual(gate.accept(link('code=g-123'), 2000), { ok: true, code: 'g-123', flowId: null });
  assert.deepEqual(gate.finish(true, 2500), { ended: true });
  assert.deepEqual(gate.accept(link('code=g-123'), 3000), { ok: false, reason: 'no-pending' });
});

test('a provider error link (the person said no) ends the same way for both providers', () => {
  for (const q of ['provider=apple', 'provider=google']) {
    const gate = new AuthGate(HOST);
    gate.begin(authorizeFor(q), 1000);
    assert.deepEqual(gate.accept(link('error=access_denied&error_description=anything'), 2000), { ok: false, reason: 'provider-error', ended: false });
  }
});
