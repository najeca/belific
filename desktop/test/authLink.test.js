'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCallback, AuthGate, WINDOW_MS } = require('../src/authLink');

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
  assert.equal(gate.begin('https://evil.example/auth/v1/authorize?provider=apple&redirect_to=belific%3A%2F%2Fauth-callback'), false);
  assert.equal(gate.begin(`${HOST}/auth/v1/authorize?provider=google&redirect_to=belific%3A%2F%2Fauth-callback`), false);
  assert.equal(gate.begin(`${HOST}/auth/v1/authorize?provider=apple&redirect_to=https%3A%2F%2Fevil.example`), false);
  assert.equal(gate.begin(`${HOST}/auth/v1/other?provider=apple&redirect_to=belific%3A%2F%2Fauth-callback`), false);
  assert.equal(gate.begin('javascript:alert(1)'), false);
  assert.equal(gate.pending, null);
  assert.equal(gate.begin(authorize()), true);
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
  // the right one works once
  assert.deepEqual(gate.accept(good, 3000), { ok: true, code: 'abc', flowId: FLOW });
  // replay fails
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

test('gate: a provider error consumes the pending sign in', () => {
  const gate = new AuthGate(HOST);
  gate.begin(authorize(), 0);
  const r = gate.accept(link(`sb_flow_id=${FLOW}&error=access_denied`), 1);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'provider-error');
  assert.equal(gate.pending, null);
});

test('gate results never contain the link', () => {
  const gate = new AuthGate(HOST);
  const secret = 'SECRETCODE123';
  const r = gate.accept(link(`code=${secret}`), 0);
  assert.equal(JSON.stringify(r).includes(secret), false);
});
